// Render each hero program to ASCII (what the CellGrid draws as glyphs) so the
// field can be eyeballed without a browser. Run via esbuild:
//   pnpm exec esbuild scripts/hero-preview.ts --bundle --platform=node --format=esm --outfile=/tmp/hp.mjs && node /tmp/hp.mjs
import { FluidProgram } from "../src/lib/hero/programs/fluid";
import { LifeProgram } from "../src/lib/hero/programs/life";
import { FlowProgram } from "../src/lib/hero/programs/flow";
import { mulberry32, seedFromDate } from "../src/lib/hero/prng";
import { RAMP } from "../src/lib/hero/types";
import type { Field, Pointer, Program } from "../src/lib/hero/types";

function makeField(cols: number, rows: number): Field {
  const density = new Float32Array(cols * rows);
  const heat = new Float32Array(cols * rows);
  return {
    cols, rows, density, heat,
    idx: (x, y) => y * cols + x,
    inBounds: (x, y) => x >= 0 && x < cols && y >= 0 && y < rows,
    clear: () => { density.fill(0); heat.fill(0); },
  };
}

function preview(name: string, prog: Program, steps: number) {
  const cols = 78, rows = 22;
  const field = makeField(cols, rows);
  prog.seed(field, mulberry32(seedFromDate(new Date(2026, 5, 12))));
  const ptr: Pointer = { x: cols / 2, y: rows / 2, vx: 0, vy: 0, inside: false, down: false };
  for (let f = 0; f < steps; f++) prog.step(field, 1 / 60, ptr, f);

  const max = RAMP.length - 1;
  console.log(`\n  ${name}  (${steps} steps, ${cols}x${rows})`);
  console.log("  +" + "-".repeat(cols) + "+");
  for (let y = 0; y < rows; y++) {
    let line = "  |";
    for (let x = 0; x < cols; x++) {
      const d = field.density[y * cols + x];
      let gi = (d * RAMP.length) | 0;
      if (gi < 0) gi = 0; else if (gi > max) gi = max;
      line += RAMP[gi];
    }
    console.log(line + "|");
  }
  console.log("  +" + "-".repeat(cols) + "+");
}

preview("fluid.sim", new FluidProgram(), 220);
preview("life.run", new LifeProgram(), 60);
preview("field.flow", new FlowProgram(), 120);
