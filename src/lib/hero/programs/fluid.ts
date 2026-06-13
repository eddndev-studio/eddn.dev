import type { Field, Pointer, Program, RNG } from "../types";

// Jos Stam's "Stable Fluids" (1999) at character resolution.
// Semi-Lagrangian advection + Gauss-Seidel diffusion + projection keep an
// incompressible velocity field; dye ("density") is transported by it and is
// what the renderer draws. At ~70x28 cells the whole solve is well under 1ms.

const DIFF = 0.0; // dye diffusion (0 = crisp filaments)
const VISC = 0.0; // viscosity
const ITER = 6; // Gauss-Seidel iterations
const DECAY = 0.985; // dye fade per frame so it never saturates
const SUBSTEP = 1 / 60; // fixed solver dt (stable regardless of frame rate)

interface Emitter {
  x: number;
  y: number;
  base: number; // base flow angle
  phase: number;
  speed: number;
  swing: number;
}

export class FluidProgram implements Program {
  readonly name = "fluid.sim";
  readonly label = "FLUID";

  private cols = 0;
  private rows = 0;
  private size = 0;
  private u!: Float32Array;
  private v!: Float32Array;
  private u0!: Float32Array;
  private v0!: Float32Array;
  private d!: Float32Array;
  private d0!: Float32Array;
  private emitters: Emitter[] = [];
  private rng!: RNG;

  private IX(x: number, y: number) {
    return x + y * this.cols;
  }

  seed(field: Field, rng: RNG): void {
    this.rng = rng;
    this.cols = field.cols;
    this.rows = field.rows;
    this.size = this.cols * this.rows;
    this.u = new Float32Array(this.size);
    this.v = new Float32Array(this.size);
    this.u0 = new Float32Array(this.size);
    this.v0 = new Float32Array(this.size);
    this.d = new Float32Array(this.size);
    this.d0 = new Float32Array(this.size);

    // 2-3 resting emitters in the lower band, blowing upward-ish.
    const n = 2 + rng.int(2);
    this.emitters = [];
    for (let i = 0; i < n; i++) {
      this.emitters.push({
        x: Math.floor(rng.range(this.cols * 0.2, this.cols * 0.8)),
        y: Math.floor(rng.range(this.rows * 0.55, this.rows * 0.85)),
        base: -Math.PI / 2 + rng.range(-0.5, 0.5),
        phase: rng.range(0, Math.PI * 2),
        speed: rng.range(0.006, 0.014),
        swing: rng.range(0.4, 0.9),
      });
    }
    field.clear();
  }

  private setBnd(b: number, arr: Float32Array) {
    const { cols, rows } = this;
    for (let x = 1; x < cols - 1; x++) {
      arr[this.IX(x, 0)] = b === 2 ? -arr[this.IX(x, 1)] : arr[this.IX(x, 1)];
      arr[this.IX(x, rows - 1)] =
        b === 2 ? -arr[this.IX(x, rows - 2)] : arr[this.IX(x, rows - 2)];
    }
    for (let y = 1; y < rows - 1; y++) {
      arr[this.IX(0, y)] = b === 1 ? -arr[this.IX(1, y)] : arr[this.IX(1, y)];
      arr[this.IX(cols - 1, y)] =
        b === 1 ? -arr[this.IX(cols - 2, y)] : arr[this.IX(cols - 2, y)];
    }
    arr[this.IX(0, 0)] = 0.5 * (arr[this.IX(1, 0)] + arr[this.IX(0, 1)]);
    arr[this.IX(0, rows - 1)] =
      0.5 * (arr[this.IX(1, rows - 1)] + arr[this.IX(0, rows - 2)]);
    arr[this.IX(cols - 1, 0)] =
      0.5 * (arr[this.IX(cols - 2, 0)] + arr[this.IX(cols - 1, 1)]);
    arr[this.IX(cols - 1, rows - 1)] =
      0.5 *
      (arr[this.IX(cols - 2, rows - 1)] + arr[this.IX(cols - 1, rows - 2)]);
  }

  private linSolve(b: number, x: Float32Array, x0: Float32Array, a: number, c: number) {
    const { cols, rows } = this;
    const invC = 1 / c;
    for (let k = 0; k < ITER; k++) {
      for (let j = 1; j < rows - 1; j++) {
        for (let i = 1; i < cols - 1; i++) {
          const idx = this.IX(i, j);
          x[idx] =
            (x0[idx] +
              a *
                (x[idx - 1] + x[idx + 1] + x[idx - cols] + x[idx + cols])) *
            invC;
        }
      }
      this.setBnd(b, x);
    }
  }

  private diffuse(b: number, x: Float32Array, x0: Float32Array, diff: number, dt: number) {
    const a = dt * diff * (this.cols - 2) * (this.rows - 2);
    if (a === 0) {
      x.set(x0);
      this.setBnd(b, x);
      return;
    }
    this.linSolve(b, x, x0, a, 1 + 4 * a);
  }

  private advect(b: number, dens: Float32Array, dens0: Float32Array, u: Float32Array, v: Float32Array, dt: number) {
    const { cols, rows } = this;
    const dtx = dt * (cols - 2);
    const dty = dt * (rows - 2);
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const idx = this.IX(i, j);
        let x = i - dtx * u[idx];
        let y = j - dty * v[idx];
        if (x < 0.5) x = 0.5;
        if (x > cols - 1.5) x = cols - 1.5;
        if (y < 0.5) y = 0.5;
        if (y > rows - 1.5) y = rows - 1.5;
        const i0 = Math.floor(x);
        const i1 = i0 + 1;
        const j0 = Math.floor(y);
        const j1 = j0 + 1;
        const s1 = x - i0;
        const s0 = 1 - s1;
        const t1 = y - j0;
        const t0 = 1 - t1;
        dens[idx] =
          s0 * (t0 * dens0[this.IX(i0, j0)] + t1 * dens0[this.IX(i0, j1)]) +
          s1 * (t0 * dens0[this.IX(i1, j0)] + t1 * dens0[this.IX(i1, j1)]);
      }
    }
    this.setBnd(b, dens);
  }

  private project(u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array) {
    const { cols, rows } = this;
    const h = 1.0 / Math.max(cols, rows);
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const idx = this.IX(i, j);
        div[idx] =
          -0.5 * h * (u[idx + 1] - u[idx - 1] + v[idx + cols] - v[idx - cols]);
        p[idx] = 0;
      }
    }
    this.setBnd(0, div);
    this.setBnd(0, p);
    this.linSolve(0, p, div, 1, 4);
    for (let j = 1; j < rows - 1; j++) {
      for (let i = 1; i < cols - 1; i++) {
        const idx = this.IX(i, j);
        u[idx] -= (0.5 * (p[idx + 1] - p[idx - 1])) / h;
        v[idx] -= (0.5 * (p[idx + cols] - p[idx - cols])) / h;
      }
    }
    this.setBnd(1, u);
    this.setBnd(2, v);
  }

  private addDye(cx: number, cy: number, amount: number, fu: number, fv: number, radius: number) {
    const { cols, rows } = this;
    const r = Math.ceil(radius);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx) + dx;
        const y = Math.round(cy) + dy;
        if (x < 1 || x >= cols - 1 || y < 1 || y >= rows - 1) continue;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > radius * radius) continue;
        const fall = 1 - Math.sqrt(dist2) / (radius + 0.001);
        const idx = this.IX(x, y);
        this.d[idx] += amount * fall;
        this.u[idx] += fu * fall;
        this.v[idx] += fv * fall;
      }
    }
  }

  onPointerDown(field: Field, pointer: Pointer): void {
    // Radial velocity burst.
    if (!pointer.inside) return;
    const cx = Math.round(pointer.x);
    const cy = Math.round(pointer.y);
    const R = 6;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || x >= this.cols - 1 || y < 1 || y >= this.rows - 1) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > R || dist < 0.001) continue;
        const f = (1 - dist / R) * 4;
        const idx = this.IX(x, y);
        this.u[idx] += (dx / dist) * f;
        this.v[idx] += (dy / dist) * f;
        this.d[idx] += (1 - dist / R) * 0.6;
      }
    }
  }

  step(field: Field, _dt: number, pointer: Pointer, frame: number): void {
    const dt = SUBSTEP;

    // Resting emitters: keep the sim alive with no input.
    for (const e of this.emitters) {
      const angle = e.base + Math.sin(frame * e.speed + e.phase) * e.swing;
      this.addDye(e.x, e.y, 0.22, Math.cos(angle) * 1.6, Math.sin(angle) * 1.6, 2.2);
    }

    // Pointer drag injects velocity + dye along the motion.
    if (pointer.inside) {
      const speed = Math.hypot(pointer.vx, pointer.vy);
      if (speed > 0.01) {
        this.addDye(pointer.x, pointer.y, 0.35, pointer.vx * 1.4, pointer.vy * 1.4, 2.4);
      }
    }

    // Velocity step.
    this.diffuse(1, this.u0, this.u, VISC, dt);
    this.diffuse(2, this.v0, this.v, VISC, dt);
    this.project(this.u0, this.v0, this.u, this.v);
    this.advect(1, this.u, this.u0, this.u0, this.v0, dt);
    this.advect(2, this.v, this.v0, this.u0, this.v0, dt);
    this.project(this.u, this.v, this.u0, this.v0);

    // Density step.
    this.diffuse(0, this.d0, this.d, DIFF, dt);
    this.advect(0, this.d, this.d0, this.u, this.v, dt);

    // Decay + write the two render channels.
    const { density, heat } = field;
    const d = this.d;
    const u = this.u;
    const v = this.v;
    for (let i = 0; i < this.size; i++) {
      d[i] *= DECAY;
      const dens = d[i];
      density[i] = dens > 1 ? 1 : dens;
      // heat: moving fronts run hot, settled ink cools.
      const sp = Math.hypot(u[i], v[i]);
      let h = sp * 0.45 + dens * 0.25;
      heat[i] = h > 1 ? 1 : h;
    }
  }
}
