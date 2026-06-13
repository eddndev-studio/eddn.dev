import { RAMP, type Field } from "./types";

// Fixed, theme-independent palette: the framebuffer is emitted light on a dark
// terminal surface in BOTH site themes, so violet reads identically. Cool (old /
// slow) -> hot (newborn / fast). Stops are [t, r, g, b].
const STOPS: Array<[number, number, number, number]> = [
  [0.0, 110, 92, 158], // dim violet
  [0.4, 139, 92, 246], // #8b5cf6 machine
  [0.72, 196, 181, 253], // #c4b5fd
  [1.0, 245, 243, 255], // near white
];

const BUCKETS = 16; // heat color resolution
const BASE_CELL_W = 9; // logical px per cell (terminal is taller than wide)
const BASE_CELL_H = 16;
const BASE_FONT = 14;
const TERMINAL_BG = "#1c1916"; // warm near-black behind the glyphs

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function heatColor(t: number): string {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, r0, g0, b0] = STOPS[i - 1];
      const [t1, r1, g1, b1] = STOPS[i];
      const k = (t - t0) / (t1 - t0);
      return `rgb(${Math.round(lerp(r0, r1, k))},${Math.round(
        lerp(g0, g1, k),
      )},${Math.round(lerp(b0, b1, k))})`;
    }
  }
  const last = STOPS[STOPS.length - 1];
  return `rgb(${last[1]},${last[2]},${last[3]})`;
}

class FieldImpl implements Field {
  cols: number;
  rows: number;
  density: Float32Array;
  heat: Float32Array;
  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.density = new Float32Array(cols * rows);
    this.heat = new Float32Array(cols * rows);
  }
  idx(x: number, y: number) {
    return y * this.cols + x;
  }
  inBounds(x: number, y: number) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }
  clear() {
    this.density.fill(0);
    this.heat.fill(0);
  }
}

export class CellGrid {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  field: FieldImpl;

  private dpr = 1;
  private cellW = BASE_CELL_W;
  private cellH = BASE_CELL_H;
  private atlas: HTMLCanvasElement;
  private atlasCtx: CanvasRenderingContext2D;

  // Pixel size of the backing store.
  private wDev = 0;
  private hDev = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.atlas = document.createElement("canvas");
    const actx = this.atlas.getContext("2d");
    if (!actx) throw new Error("atlas context unavailable");
    this.atlasCtx = actx;
    this.field = new FieldImpl(1, 1);
    this.measure();
  }

  // Recompute dpr + device cell size + glyph atlas. Returns true if grid
  // dimensions (cols/rows) changed and the field was reallocated.
  measure(): boolean {
    const parent = this.canvas.parentElement;
    const cssW = parent ? parent.clientWidth : window.innerWidth;
    const cssH = parent ? parent.clientHeight : window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    const cols = Math.max(8, Math.floor(cssW / BASE_CELL_W));
    const rows = Math.max(6, Math.floor(cssH / BASE_CELL_H));

    this.cellW = Math.round(BASE_CELL_W * this.dpr);
    this.cellH = Math.round(BASE_CELL_H * this.dpr);
    this.wDev = cols * this.cellW;
    this.hDev = rows * this.cellH;

    this.canvas.width = this.wDev;
    this.canvas.height = this.hDev;
    this.canvas.style.width = cols * BASE_CELL_W + "px";
    this.canvas.style.height = rows * BASE_CELL_H + "px";

    this.buildAtlas();

    const changed = cols !== this.field.cols || rows !== this.field.rows;
    if (changed) this.field = new FieldImpl(cols, rows);
    return changed;
  }

  private buildAtlas() {
    const a = this.atlas;
    a.width = RAMP.length * this.cellW;
    a.height = BUCKETS * this.cellH;
    const c = this.atlasCtx;
    c.clearRect(0, 0, a.width, a.height);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `${Math.round(BASE_FONT * this.dpr)}px "DM Mono", ui-monospace, monospace`;
    for (let hb = 0; hb < BUCKETS; hb++) {
      c.fillStyle = heatColor(hb / (BUCKETS - 1));
      for (let gi = 1; gi < RAMP.length; gi++) {
        const ch = RAMP[gi];
        const cx = gi * this.cellW + this.cellW / 2;
        const cy = hb * this.cellH + this.cellH / 2;
        c.fillText(ch, cx, cy);
      }
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.fillStyle = TERMINAL_BG;
    ctx.fillRect(0, 0, this.wDev, this.hDev);

    const { cols, rows, density, heat } = this.field;
    const cw = this.cellW;
    const ch = this.cellH;
    const atlas = this.atlas;
    const rampMax = RAMP.length - 1;

    for (let y = 0; y < rows; y++) {
      const rowBase = y * cols;
      const dy = y * ch;
      for (let x = 0; x < cols; x++) {
        const d = density[rowBase + x];
        if (d <= 0.02) continue;
        let gi = ((d * RAMP.length) | 0);
        if (gi < 1) gi = 1;
        else if (gi > rampMax) gi = rampMax;
        let hb = ((heat[rowBase + x] * (BUCKETS - 1) + 0.5) | 0);
        if (hb < 0) hb = 0;
        else if (hb > BUCKETS - 1) hb = BUCKETS - 1;
        ctx.drawImage(
          atlas,
          gi * cw,
          hb * ch,
          cw,
          ch,
          x * cw,
          dy,
          cw,
          ch,
        );
      }
    }
  }

  // Logical px -> fractional cell coordinate, for pointer mapping.
  get logicalCols() {
    return this.field.cols;
  }
  get logicalRows() {
    return this.field.rows;
  }
}
