import { Simplex } from "../simplex";
import type { Field, Pointer, Program, RNG } from "../types";

// Curl-noise flow field. Particles follow v = curl(psi) where psi is 3D simplex
// noise (the 3rd axis is time). Curl of a scalar potential is divergence-free,
// so trajectories braid into rivers that never collapse to a point. Particles
// don't draw themselves -- they deposit density into cells, so the look is the
// same glyph language as the other two programs.

const NOISE_SCALE = 0.08; // spatial frequency
const TIME_SCALE = 0.18; // base temporal drift
const SPEED = 0.9; // cells per step at unit field strength
const DECAY = 0.88; // density + heat fade per frame
const DEPOSIT = 0.4; // density added per particle per cell
const EPS = 0.6; // finite-difference step in noise space

export class FlowProgram implements Program {
  readonly name = "field.flow";
  readonly label = "FLOW";

  private cols = 0;
  private rows = 0;
  private size = 0;
  private count = 0;
  private px!: Float32Array;
  private py!: Float32Array;
  private life!: Float32Array;
  private noise!: Simplex;
  private rng!: RNG;
  private t = 0;
  private timeScale = 1;

  seed(field: Field, rng: RNG): void {
    this.rng = rng;
    this.cols = field.cols;
    this.rows = field.rows;
    this.size = this.cols * this.rows;
    this.noise = new Simplex(rng);
    this.t = rng.range(0, 1000);
    this.timeScale = 1;

    this.count = Math.min(1400, Math.floor(this.size * 0.6));
    this.px = new Float32Array(this.count);
    this.py = new Float32Array(this.count);
    this.life = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.respawn(i);
    field.clear();
  }

  private respawn(i: number) {
    this.px[i] = this.rng.range(0, this.cols);
    this.py[i] = this.rng.range(0, this.rows);
    this.life[i] = this.rng.range(40, 160);
  }

  onScroll(velocity: number): void {
    // Scroll speed transiently accelerates the field (capped).
    const boost = 1 + Math.min(Math.abs(velocity) / 600, 6);
    if (boost > this.timeScale) this.timeScale = boost;
  }

  onPointerDown(_field: Field, pointer: Pointer): void {
    if (!pointer.inside) return;
    this.timeScale = Math.max(this.timeScale, 4);
  }

  step(field: Field, dt: number, pointer: Pointer, _frame: number): void {
    // Clamp dt so tab-restore doesn't teleport every particle.
    const fdt = Math.min(dt, 1 / 30) * 60; // normalize to "frames"
    this.t += dt * TIME_SCALE * this.timeScale;
    // Ease timeScale back to 1.
    this.timeScale += (1 - this.timeScale) * Math.min(dt * 2.5, 1);

    const { density, heat } = field;
    // Decay BOTH channels: heat must cool too, else every touched cell locks to
    // its lifetime-max speed and the field homogenizes to hot over time.
    for (let i = 0; i < this.size; i++) {
      density[i] *= DECAY;
      heat[i] *= DECAY;
    }

    const n = this.noise;
    const cols = this.cols;
    const rows = this.rows;
    const ptrActive = pointer.inside;
    const ptrPower = pointer.down ? 2.4 : 1.3;

    for (let i = 0; i < this.count; i++) {
      let x = this.px[i];
      let y = this.py[i];
      const nx = x * NOISE_SCALE;
      const ny = y * NOISE_SCALE;

      // curl of psi: (dPsi/dy, -dPsi/dx)
      const a = n.noise(nx, ny + EPS, this.t) - n.noise(nx, ny - EPS, this.t);
      const b = n.noise(nx + EPS, ny, this.t) - n.noise(nx - EPS, ny, this.t);
      let vx = a / (2 * EPS);
      let vy = -b / (2 * EPS);

      // Pointer vortex: swirl around the cursor with gaussian falloff.
      if (ptrActive) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const fall = Math.exp(-d2 / 60);
        if (fall > 0.01) {
          vx += -dy * fall * ptrPower;
          vy += dx * fall * ptrPower;
        }
      }

      x += vx * SPEED * fdt;
      y += vy * SPEED * fdt;

      this.life[i] -= fdt;
      if (
        this.life[i] <= 0 ||
        x < 0 ||
        x >= cols ||
        y < 0 ||
        y >= rows
      ) {
        this.respawn(i);
        continue;
      }
      this.px[i] = x;
      this.py[i] = y;

      const ix = x | 0;
      const iy = y | 0;
      const idx = iy * cols + ix;
      let dv = density[idx] + DEPOSIT;
      if (dv > 1) dv = 1;
      density[idx] = dv;
      const sp = Math.hypot(vx, vy);
      let h = sp * 0.5;
      if (h > 1) h = 1;
      if (h > heat[idx]) heat[idx] = h;
    }
  }
}
