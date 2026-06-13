import { RAMP, type Field } from "./types";

// Fixed, theme-independent palette: the framebuffer is emitted as violet glyphs
// on a TRANSPARENT canvas, so it floats over the warm page bg in both themes.
// Cool (old / slow) -> hot (newborn / fast). Stops are [t, r, g, b].
const STOPS: Array<[number, number, number, number]> = [
  [0.0, 110, 92, 158], // dim violet
  [0.4, 139, 92, 246], // #8b5cf6 machine
  [0.72, 196, 181, 253], // #c4b5fd
  [1.0, 245, 243, 255], // near white
];

const BUCKETS = 16; // heat color resolution
const BASE_CELL_W = 12; // logical px per cell (terminal is taller than wide)
const BASE_CELL_H = 21;
const BASE_FONT = 18;
// Hard ceiling on grid capacity. The field is full-bleed now, so without this a
// large viewport would allocate a huge cols*rows for the sims + a drawImage per
// cell per frame. Past the budget, the logical cell grows so the count stays put.
const MAX_CELLS = 5000;

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
  private fontPx = BASE_FONT;
  private atlas: HTMLCanvasElement;
  private atlasCtx: CanvasRenderingContext2D;
  // Glyph metrics the current atlas was built for; -1 forces the first build.
  private atlasDpr = -1;
  private atlasCellW = -1;
  private atlasCellH = -1;
  private atlasFontPx = -1;

  // Pixel size of the backing store.
  private wDev = 0;
  private hDev = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: true });
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
    // dpr capped at 1.5: the field is decorative, so we trade a little glyph
    // crispness for a much smaller canvas backing store (memory scales dpr^2).
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    // Logical cell size grows past the base when the area would blow the cell
    // budget, keeping cols*rows (and thus sim arrays + per-frame work) bounded.
    let cellWcss = BASE_CELL_W;
    let cellHcss = BASE_CELL_H;
    let fontCss = BASE_FONT;
    let cols = Math.max(8, Math.floor(cssW / cellWcss));
    let rows = Math.max(6, Math.floor(cssH / cellHcss));
    if (cols * rows > MAX_CELLS) {
      const scale = Math.sqrt((cols * rows) / MAX_CELLS);
      cellWcss *= scale;
      cellHcss *= scale;
      fontCss *= scale;
      cols = Math.max(8, Math.floor(cssW / cellWcss));
      rows = Math.max(6, Math.floor(cssH / cellHcss));
    }

    this.cellW = Math.round(cellWcss * this.dpr);
    this.cellH = Math.round(cellHcss * this.dpr);
    this.fontPx = Math.round(fontCss * this.dpr);
    this.wDev = cols * this.cellW;
    this.hDev = rows * this.cellH;

    this.canvas.width = this.wDev;
    this.canvas.height = this.hDev;
    this.canvas.style.width = Math.round(this.wDev / this.dpr) + "px";
    this.canvas.style.height = Math.round(this.hDev / this.dpr) + "px";

    // Glyph metrics only depend on dpr/cell size, never cols/rows, so skip the
    // ~144 fillText atlas rebuild on resizes that don't change them.
    if (
      this.dpr !== this.atlasDpr ||
      this.cellW !== this.atlasCellW ||
      this.cellH !== this.atlasCellH ||
      this.fontPx !== this.atlasFontPx
    ) {
      this.rebuildAtlas();
    }

    const changed = cols !== this.field.cols || rows !== this.field.rows;
    if (changed) this.field = new FieldImpl(cols, rows);
    return changed;
  }

  // Force a glyph-atlas rebuild (e.g. after the web font finishes loading).
  rebuildAtlas() {
    this.buildAtlas();
    this.atlasDpr = this.dpr;
    this.atlasCellW = this.cellW;
    this.atlasCellH = this.cellH;
    this.atlasFontPx = this.fontPx;
  }

  private buildAtlas() {
    const a = this.atlas;
    a.width = RAMP.length * this.cellW;
    a.height = BUCKETS * this.cellH;
    const c = this.atlasCtx;
    c.clearRect(0, 0, a.width, a.height);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `${this.fontPx}px "DM Mono", ui-monospace, monospace`;
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
    // Transparent surface: clear so the field composites over the page bg.
    ctx.clearRect(0, 0, this.wDev, this.hDev);

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
