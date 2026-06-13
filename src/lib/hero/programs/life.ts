import type { Field, Pointer, Program, RNG } from "../types";

// Conway's Game of Life, rebuilt:
//  - simulation clock (~9 gen/s) decoupled from the 60fps render, with eased
//    visual intensity so births fade in and deaths leave a decaying ember.
//  - color by cell age: newborns flash hot, stable structures cool to dim.
//  - curated seed (R-pentomino + two Gosper guns + sparse noise), not pure noise.
//  - pointer stamps gliders aimed at the center; click drops a pulsar.
//  - anti-stagnation: re-injects an LWSS when the board goes quiet.

const GEN_INTERVAL = 0.11; // seconds per generation
const BIRTH_SPEED = 16; // vis ease-in rate (per second)
const DEATH_SPEED = 3.2; // ember fade-out rate (per second)

// SE / SW / NE / NW gliders.
const GLIDERS: number[][][] = [
  [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], // SE
  [[1, 0], [0, 1], [0, 2], [1, 2], [2, 2]], // SW
  [[1, 2], [2, 1], [0, 0], [1, 0], [2, 0]], // NE
  [[1, 2], [0, 1], [0, 0], [1, 0], [2, 0]], // NW
];

const PULSAR: number[][] = [
  [2, 0], [3, 0], [4, 0], [8, 0], [9, 0], [10, 0],
  [0, 2], [5, 2], [7, 2], [12, 2],
  [0, 3], [5, 3], [7, 3], [12, 3],
  [0, 4], [5, 4], [7, 4], [12, 4],
  [2, 5], [3, 5], [4, 5], [8, 5], [9, 5], [10, 5],
  [2, 7], [3, 7], [4, 7], [8, 7], [9, 7], [10, 7],
  [0, 8], [5, 8], [7, 8], [12, 8],
  [0, 9], [5, 9], [7, 9], [12, 9],
  [0, 10], [5, 10], [7, 10], [12, 10],
  [2, 12], [3, 12], [4, 12], [8, 12], [9, 12], [10, 12],
];

// Standard Gosper glider gun (origin top-left).
const GOSPER: number[][] = [
  [0, 4], [0, 5], [1, 4], [1, 5],
  [10, 4], [10, 5], [10, 6], [11, 3], [11, 7], [12, 2], [12, 8], [13, 2], [13, 8],
  [14, 5], [15, 3], [15, 7], [16, 4], [16, 5], [16, 6], [17, 5],
  [20, 2], [20, 3], [20, 4], [21, 2], [21, 3], [21, 4], [22, 1], [22, 5],
  [24, 0], [24, 1], [24, 5], [24, 6],
  [34, 2], [34, 3], [35, 2], [35, 3],
];

export class LifeProgram implements Program {
  readonly name = "life.run";
  readonly label = "LIFE";

  private cols = 0;
  private rows = 0;
  private size = 0;
  private cur!: Uint8Array;
  private nxt!: Uint8Array;
  private age!: Float32Array; // generations alive
  private temp!: Float32Array; // color temperature (retained as ember on death)
  private vis!: Float32Array; // eased visual intensity
  private acc = 0;
  private quiet = 0;
  private rng!: RNG;

  private wrap(v: number, n: number) {
    return ((v % n) + n) % n;
  }

  private setCell(x: number, y: number) {
    const xx = this.wrap(x, this.cols);
    const yy = this.wrap(y, this.rows);
    const i = yy * this.cols + xx;
    if (this.cur[i] === 0) {
      this.cur[i] = 1;
      this.age[i] = 1;
      this.temp[i] = 0.95;
    }
  }

  private stamp(pattern: number[][], ox: number, oy: number, mirror = false) {
    let maxX = 0,
      maxY = 0;
    if (mirror) {
      for (const [px, py] of pattern) {
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
    for (const [px, py] of pattern) {
      const x = mirror ? maxX - px : px;
      const y = mirror ? maxY - py : py;
      this.setCell(ox + x, oy + y);
    }
  }

  seed(field: Field, rng: RNG): void {
    this.rng = rng;
    this.cols = field.cols;
    this.rows = field.rows;
    this.size = this.cols * this.rows;
    this.cur = new Uint8Array(this.size);
    this.nxt = new Uint8Array(this.size);
    this.age = new Float32Array(this.size);
    this.temp = new Float32Array(this.size);
    this.vis = new Float32Array(this.size);
    this.acc = 0;
    this.quiet = 0;
    field.clear();

    // R-pentomino at center -> ~1000 generations of chaos.
    const cx = (this.cols / 2) | 0;
    const cy = (this.rows / 2) | 0;
    this.stamp([[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], cx - 1, cy - 1);

    // Two Gosper guns on golden thirds, aimed inward (if there's room).
    if (this.cols >= 44 && this.rows >= 14) {
      this.stamp(GOSPER, 2, 1, false);
      this.stamp(GOSPER, this.cols - 2 - 36, this.rows - 1 - 9, true);
    }

    // Sparse noise so the field is never bare.
    for (let i = 0; i < this.size; i++) {
      if (rng.next() < 0.06) {
        this.cur[i] = 1;
        this.age[i] = 1;
        this.temp[i] = 0.6;
      }
    }
  }

  onPointerDown(field: Field, pointer: Pointer): void {
    if (!pointer.inside) return;
    // Pulsar centered on the pointer.
    this.stamp(PULSAR, Math.round(pointer.x) - 6, Math.round(pointer.y) - 6);
  }

  private stampGliderToward(x: number, y: number) {
    const cx = this.cols / 2;
    const cy = this.rows / 2;
    const dirX = x < cx ? 1 : 0; // moving right if on the left
    const dirY = y < cy ? 1 : 0; // moving down if on top
    const variant = (dirY === 1 ? 0 : 2) + (dirX === 1 ? 0 : 1);
    this.stamp(GLIDERS[variant], Math.round(x) - 1, Math.round(y) - 1);
  }

  private generation() {
    const { cols, rows, cur, nxt, age, temp } = this;
    for (let y = 0; y < rows; y++) {
      const yUp = ((y - 1 + rows) % rows) * cols;
      const yDn = ((y + 1) % rows) * cols;
      const yMe = y * cols;
      for (let x = 0; x < cols; x++) {
        const xL = (x - 1 + cols) % cols;
        const xR = (x + 1) % cols;
        const n =
          cur[yUp + xL] + cur[yUp + x] + cur[yUp + xR] +
          cur[yMe + xL] + cur[yMe + xR] +
          cur[yDn + xL] + cur[yDn + x] + cur[yDn + xR];
        const i = yMe + x;
        const alive = cur[i];
        let next = alive;
        if (alive === 1) {
          next = n === 2 || n === 3 ? 1 : 0;
        } else {
          next = n === 3 ? 1 : 0;
        }
        nxt[i] = next as number;
        if (next === 1) {
          if (alive === 0) {
            age[i] = 1;
            temp[i] = 0.95; // birth flash
          } else {
            age[i] += 1;
            const t = 0.95 - age[i] * 0.11;
            temp[i] = t < 0.12 ? 0.12 : t;
          }
        } else if (alive === 1) {
          age[i] = 0; // died -> keep temp as ember, vis will fade
        }
      }
    }
    // swap
    const t = this.cur;
    this.cur = this.nxt;
    this.nxt = t;
  }

  private population() {
    let p = 0;
    for (let i = 0; i < this.size; i++) p += this.cur[i];
    return p;
  }

  step(field: Field, dt: number, pointer: Pointer, _frame: number): void {
    // Pointer drag stamps gliders aimed at the center.
    if (pointer.inside) {
      const speed = Math.hypot(pointer.vx, pointer.vy);
      if (speed > 0.6) this.stampGliderToward(pointer.x, pointer.y);
    }

    this.acc += dt;
    let stepped = false;
    while (this.acc >= GEN_INTERVAL) {
      this.generation();
      this.acc -= GEN_INTERVAL;
      stepped = true;
    }

    if (stepped) {
      const pop = this.population();
      if (pop < this.size * 0.015) {
        this.quiet += 1;
      } else {
        this.quiet = 0;
      }
      if (this.quiet > 6) {
        // Re-inject an LWSS from a random edge.
        const lwss = [
          [0, 0], [3, 0], [4, 1], [0, 2], [4, 2], [1, 3], [2, 3], [3, 3], [4, 3],
        ];
        this.stamp(lwss, this.rng.int(this.cols), 1);
        this.quiet = 0;
      }
    }

    // Ease visual intensity every frame and write render channels.
    const { density, heat } = field;
    const cur = this.cur;
    const vis = this.vis;
    const temp = this.temp;
    for (let i = 0; i < this.size; i++) {
      const target = cur[i];
      const speed = target === 1 ? BIRTH_SPEED : DEATH_SPEED;
      let k = speed * dt;
      if (k > 1) k = 1;
      vis[i] += (target - vis[i]) * k;
      const v = vis[i];
      density[i] = v * 0.88;
      heat[i] = temp[i] * v;
    }
  }
}
