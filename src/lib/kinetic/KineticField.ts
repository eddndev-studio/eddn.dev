const FIELD_WIDTH = 1200;
const FIELD_HEIGHT = 360;
const ROW_SAMPLES = 36;
const COLUMN_SAMPLES = 16;
const MODE_DURATION = 6200;
const TAU = Math.PI * 2;

interface Point {
  x: number;
  y: number;
}

interface PointerState extends Point {
  active: number;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function ease(value: number) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function cyclicDistance(a: number, b: number, length: number) {
  const distance = Math.abs(a - b);
  return Math.min(distance, length - distance);
}

function modeWeights(time: number) {
  const phase = (time / MODE_DURATION) % 3;
  return [0, 1, 2].map((mode) => ease(1 - cyclicDistance(phase, mode, 3)));
}

export class KineticFieldController {
  private root: HTMLElement;
  private svg: SVGSVGElement;
  private rows: SVGPathElement[];
  private columns: SVGPathElement[];
  private slices: SVGPolygonElement[];
  private pointer: PointerState = { x: 0.52, y: 0.48, active: 0 };
  private pointerTarget: PointerState = { ...this.pointer };
  private frameId: number | null = null;
  private observer: IntersectionObserver | null = null;
  private abortController = new AbortController();
  private reducedMotion: boolean;
  private visible = true;

  constructor(root: HTMLElement) {
    const svg = root.querySelector<SVGSVGElement>("[data-kinetic-svg]");
    if (!svg) throw new Error("Kinetic field SVG is missing");

    this.root = root;
    this.svg = svg;
    this.rows = Array.from(svg.querySelectorAll<SVGPathElement>("[data-kinetic-row]"));
    this.columns = Array.from(svg.querySelectorAll<SVGPathElement>("[data-kinetic-column]"));
    this.slices = Array.from(svg.querySelectorAll<SVGPolygonElement>("[data-kinetic-slice]"));
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  init() {
    const { signal } = this.abortController;
    this.svg.addEventListener("pointermove", this.onPointerMove, { signal });
    this.svg.addEventListener("pointerleave", this.onPointerLeave, { signal });

    if (this.reducedMotion) {
      this.render(MODE_DURATION * 0.62);
      return;
    }

    this.observer = new IntersectionObserver(this.onIntersection, { threshold: 0.02 });
    this.observer.observe(this.root);
    this.start();
  }

  destroy() {
    this.stop();
    this.observer?.disconnect();
    this.observer = null;
    this.abortController.abort();
  }

  private onPointerMove = (event: PointerEvent) => {
    const bounds = this.svg.getBoundingClientRect();
    this.pointerTarget.x = clamp((event.clientX - bounds.left) / bounds.width);
    this.pointerTarget.y = clamp((event.clientY - bounds.top) / bounds.height);
    this.pointerTarget.active = 1;
  };

  private onPointerLeave = () => {
    this.pointerTarget.active = 0;
  };

  private onIntersection = (entries: IntersectionObserverEntry[]) => {
    this.visible = entries[0]?.isIntersecting ?? true;
    if (this.visible) this.start();
    else this.stop();
  };

  private start() {
    if (this.frameId !== null || !this.visible) return;
    this.frameId = requestAnimationFrame(this.loop);
  }

  private stop() {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private loop = (time: number) => {
    this.render(time);
    this.frameId = requestAnimationFrame(this.loop);
  };

  private render(time: number) {
    this.pointer.x = lerp(this.pointer.x, this.pointerTarget.x, 0.075);
    this.pointer.y = lerp(this.pointer.y, this.pointerTarget.y, 0.075);
    this.pointer.active = lerp(this.pointer.active, this.pointerTarget.active, 0.055);

    this.rows.forEach((path, index) => {
      path.setAttribute("d", this.buildRow(index, time));
      path.style.strokeDashoffset = String(-(time * 0.012 + index * 13));
    });

    this.columns.forEach((path, index) => {
      path.setAttribute("d", this.buildColumn(index, time));
      path.style.strokeDashoffset = String(time * 0.009 - index * 7);
    });

    this.slices.forEach((slice, index) => {
      slice.setAttribute("points", this.buildSlice(index, time));
    });
  }

  private buildRow(index: number, time: number) {
    const y = FIELD_HEIGHT * ((index + 1) / (this.rows.length + 1));
    const points: string[] = [];
    for (let sample = 0; sample <= ROW_SAMPLES; sample++) {
      const x = FIELD_WIDTH * (sample / ROW_SAMPLES);
      const point = this.deform(x, y, time);
      points.push(`${sample === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`);
    }
    return points.join(" ");
  }

  private buildColumn(index: number, time: number) {
    const x = FIELD_WIDTH * ((index + 1) / (this.columns.length + 1));
    const points: string[] = [];
    for (let sample = 0; sample <= COLUMN_SAMPLES; sample++) {
      const y = FIELD_HEIGHT * (sample / COLUMN_SAMPLES);
      const point = this.deform(x, y, time);
      points.push(`${sample === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`);
    }
    return points.join(" ");
  }

  private deform(x: number, y: number, time: number): Point {
    const nx = x / FIELD_WIDTH;
    const ny = y / FIELD_HEIGHT;
    const [loom, fold, shear] = modeWeights(time);
    const autoX = 0.5 + Math.sin(time * 0.00019) * 0.24;
    const autoY = 0.5 + Math.cos(time * 0.00023) * 0.2;
    const focusX = lerp(autoX, this.pointer.x, this.pointer.active);
    const focusY = lerp(autoY, this.pointer.y, this.pointer.active);
    const dx = nx - focusX;
    const dy = ny - focusY;
    const gravity = Math.exp(-(dx * dx * 11 + dy * dy * 6));
    const split = 0.5 + Math.sin(time * 0.00027) * 0.16;
    const cut = Math.tanh((nx - split) * 13);

    const loomX = Math.sin(ny * TAU * 1.7 - time * 0.00038) * 16;
    const loomY = Math.sin(nx * TAU * 1.45 + ny * 2.4 + time * 0.00042) * 18;
    const foldX = -dx * gravity * 220;
    const foldY = -dy * gravity * 150;
    const shearX = cut * (ny - 0.5) * 88;
    const shearY = -cut * 14 + Math.sin(ny * TAU * 3 + time * 0.0006) * 6;
    const pointerPull = gravity * this.pointer.active;

    return {
      x: x + loomX * loom + foldX * (fold + pointerPull * 0.75) + shearX * shear,
      y: y + loomY * loom + foldY * (fold + pointerPull * 0.75) + shearY * shear,
    };
  }

  private buildSlice(index: number, time: number) {
    const offset = index / Math.max(1, this.slices.length - 1);
    const center = FIELD_WIDTH * (0.18 + offset * 0.64 + Math.sin(time * 0.00031 + index * 2.1) * 0.045);
    const lean = Math.sin(time * 0.00043 + index) * 52;
    const width = 7 + index * 4;
    return [
      `${(center - width).toFixed(1)},0`,
      `${(center + width).toFixed(1)},0`,
      `${(center + lean + width).toFixed(1)},${FIELD_HEIGHT}`,
      `${(center + lean - width).toFixed(1)},${FIELD_HEIGHT}`,
    ].join(" ");
  }
}
