import { CellGrid } from "./CellGrid";
import { mulberry32, seedFromDate, seedStamp } from "./prng";
import { FluidProgram } from "./programs/fluid";
import { LifeProgram } from "./programs/life";
import { FlowProgram } from "./programs/flow";
import type { Pointer, Program } from "./types";

export interface HeroState {
  name: string;
  label: string;
  index: number;
  count: number;
  seed: string;
  fps: number;
  reducedMotion: boolean;
}

type ProgramFactory = () => Program;

const FACTORIES: ProgramFactory[] = [
  () => new FluidProgram(),
  () => new LifeProgram(),
  () => new FlowProgram(),
];

const STORAGE_KEY = "eddn:hero:program";
const PRESIM_STEPS = 90; // frames pre-simulated for the reduced-motion still

export class HeroEngine {
  private grid: CellGrid;
  private program!: Program;
  private index = 0;
  private baseSeed: number;
  private seedString: string;

  private pointer: Pointer = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    inside: false,
    down: false,
  };

  private rafId: number | null = null;
  private last = 0;
  private frame = 0;
  private fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private running = false;
  private reduced: boolean;

  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;
  private lastScrollY = 0;
  private lastScrollT = 0;

  private onState?: (s: HeroState) => void;

  // Bound handlers (stable references for add/removeEventListener).
  private bPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private bPointerDown = (e: PointerEvent) => this.handlePointerDown(e);
  private bPointerUp = () => this.handlePointerUp();
  private bPointerLeave = () => this.handlePointerLeave();
  private bScroll = () => this.handleScroll();
  private bVisibility = () => this.handleVisibility();
  private bLoop = (t: number) => this.loop(t);

  constructor(
    canvas: HTMLCanvasElement,
    opts: { date: Date; onState?: (s: HeroState) => void },
  ) {
    this.grid = new CellGrid(canvas);
    this.baseSeed = seedFromDate(opts.date);
    this.seedString = seedStamp(opts.date);
    this.onState = opts.onState;
    this.reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isInteger(stored) && stored >= 0 && stored < FACTORIES.length) {
      this.index = stored;
    }
  }

  init() {
    this.grid.measure();
    this.loadProgram(this.index);

    const canvas = this.grid.canvas;
    canvas.addEventListener("pointermove", this.bPointerMove);
    canvas.addEventListener("pointerdown", this.bPointerDown);
    window.addEventListener("pointerup", this.bPointerUp);
    canvas.addEventListener("pointerleave", this.bPointerLeave);
    window.addEventListener("scroll", this.bScroll, { passive: true });
    document.addEventListener("visibilitychange", this.bVisibility);

    this.lastScrollY = window.scrollY;

    // Pause when off-screen.
    this.io = new IntersectionObserver(
      (entries) => {
        const visible = entries[0]?.isIntersecting ?? true;
        if (visible) this.resume();
        else this.pause();
      },
      { threshold: 0.05 },
    );
    this.io.observe(canvas);

    // Debounced resize that preserves the run.
    const parent = canvas.parentElement;
    if (parent && "ResizeObserver" in window) {
      this.ro = new ResizeObserver(() => this.scheduleResize());
      this.ro.observe(parent);
    }

    if (this.reduced) {
      this.renderStill();
    } else {
      this.resume();
    }
    this.emitState();
  }

  private loadProgram(index: number) {
    this.index = index;
    this.program = FACTORIES[index]();
    const rng = mulberry32((this.baseSeed ^ (index * 0x9e3779b1)) >>> 0);
    this.program.seed(this.grid.field, rng);
    this.frame = 0;
  }

  // Pre-simulate then draw one frame (reduced-motion / off-screen still).
  private renderStill() {
    for (let i = 0; i < PRESIM_STEPS; i++) {
      this.program.step(this.grid.field, 1 / 60, this.pointer, this.frame++);
    }
    this.grid.render();
  }

  next() {
    this.setProgram((this.index + 1) % FACTORIES.length);
  }

  setProgram(index: number) {
    if (index === this.index) return;
    this.loadProgram(index);
    localStorage.setItem(STORAGE_KEY, String(index));
    if (this.reduced || !this.running) this.renderStill();
    this.emitState();
  }

  private emitState() {
    this.onState?.({
      name: this.program.name,
      label: this.program.label,
      index: this.index,
      count: FACTORIES.length,
      seed: this.seedString,
      fps: Math.round(this.fps),
      reducedMotion: this.reduced,
    });
  }

  private resume() {
    if (this.running || this.reduced) return;
    this.running = true;
    this.last = 0;
    this.rafId = requestAnimationFrame(this.bLoop);
  }

  private pause() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop(now: number) {
    if (!this.running) return;
    if (this.last === 0) this.last = now;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 1 / 15) dt = 1 / 15; // clamp after tab-restore / jank
    if (dt < 0) dt = 0;

    this.program.step(this.grid.field, dt, this.pointer, this.frame++);
    this.grid.render();

    // Decay pointer velocity so a still cursor stops injecting.
    this.pointer.vx *= 0.85;
    this.pointer.vy *= 0.85;

    // FPS readout (~2 Hz).
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.emitState();
    }

    this.rafId = requestAnimationFrame(this.bLoop);
  }

  private toCell(e: PointerEvent) {
    const rect = this.grid.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.grid.logicalCols;
    const y = ((e.clientY - rect.top) / rect.height) * this.grid.logicalRows;
    return { x, y };
  }

  private handlePointerMove(e: PointerEvent) {
    const { x, y } = this.toCell(e);
    if (this.pointer.inside) {
      this.pointer.vx = this.pointer.vx * 0.5 + (x - this.pointer.x) * 0.5;
      this.pointer.vy = this.pointer.vy * 0.5 + (y - this.pointer.y) * 0.5;
    }
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.inside = true;
  }

  private handlePointerDown(e: PointerEvent) {
    const { x, y } = this.toCell(e);
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.inside = true;
    this.pointer.down = true;
    this.program.onPointerDown?.(this.grid.field, this.pointer);
    if (this.reduced) this.renderStill();
  }

  private handlePointerUp() {
    this.pointer.down = false;
  }

  private handlePointerLeave() {
    this.pointer.inside = false;
    this.pointer.vx = 0;
    this.pointer.vy = 0;
  }

  private handleScroll() {
    const now = performance.now();
    const dy = window.scrollY - this.lastScrollY;
    const dtm = now - this.lastScrollT;
    this.lastScrollY = window.scrollY;
    this.lastScrollT = now;
    if (dtm > 0 && this.program.onScroll) {
      this.program.onScroll((dy / dtm) * 1000); // px/sec
    }
  }

  private handleVisibility() {
    if (document.hidden) this.pause();
    else if (!this.reduced) this.resume();
  }

  private scheduleResize() {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      const changed = this.grid.measure();
      if (changed) this.loadProgram(this.index); // re-seed to new dimensions
      if (this.reduced || !this.running) this.renderStill();
    }, 200);
  }

  destroy() {
    this.pause();
    const canvas = this.grid.canvas;
    canvas.removeEventListener("pointermove", this.bPointerMove);
    canvas.removeEventListener("pointerdown", this.bPointerDown);
    window.removeEventListener("pointerup", this.bPointerUp);
    canvas.removeEventListener("pointerleave", this.bPointerLeave);
    window.removeEventListener("scroll", this.bScroll);
    document.removeEventListener("visibilitychange", this.bVisibility);
    this.io?.disconnect();
    this.io = null;
    this.ro?.disconnect();
    this.ro = null;
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
  }
}
