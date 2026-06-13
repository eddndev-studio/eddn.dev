// Headless smoke test for the hero programs: run each on a synthetic Field for
// N steps and assert output stays finite, in-range, and actually produces
// activity (no silent dead field, no NaN blow-up). Run via esbuild:
//   pnpm exec esbuild scripts/hero-smoke.ts --bundle --platform=node --format=esm --outfile=/tmp/hs.mjs && node /tmp/hs.mjs
import { FluidProgram } from "../src/lib/hero/programs/fluid";
import { LifeProgram } from "../src/lib/hero/programs/life";
import { FlowProgram } from "../src/lib/hero/programs/flow";
import { mulberry32, seedFromDate } from "../src/lib/hero/prng";
import type { Field, Pointer, Program } from "../src/lib/hero/types";

function makeField(cols: number, rows: number): Field {
  const density = new Float32Array(cols * rows);
  const heat = new Float32Array(cols * rows);
  return {
    cols,
    rows,
    density,
    heat,
    idx: (x, y) => y * cols + x,
    inBounds: (x, y) => x >= 0 && x < cols && y >= 0 && y < rows,
    clear: () => {
      density.fill(0);
      heat.fill(0);
    },
  };
}

function run(name: string, prog: Program, cols: number, rows: number) {
  const field = makeField(cols, rows);
  const rng = mulberry32(seedFromDate(new Date(2026, 5, 12)));
  prog.seed(field, rng);

  const pointer: Pointer = { x: cols / 2, y: rows / 2, vx: 2, vy: -1, inside: true, down: false };
  let maxD = 0;
  let activeFrames = 0;
  let badValues = 0;

  for (let f = 0; f < 400; f++) {
    // exercise pointer + click + scroll paths
    if (f === 50) prog.onPointerDown?.(field, pointer);
    if (f === 120) prog.onScroll?.(900);
    pointer.inside = f % 3 !== 0;
    pointer.vx = Math.sin(f * 0.2) * 3;
    pointer.vy = Math.cos(f * 0.17) * 3;

    prog.step(field, 1 / 60, pointer, f);

    let sum = 0;
    for (let i = 0; i < field.density.length; i++) {
      const d = field.density[i];
      const h = field.heat[i];
      if (!Number.isFinite(d) || !Number.isFinite(h)) badValues++;
      if (d < -0.001 || d > 1.001 || h < -0.001 || h > 1.001) badValues++;
      if (d > maxD) maxD = d;
      sum += d;
    }
    if (sum > 0.01) activeFrames++;
  }

  const ok = badValues === 0 && activeFrames > 350 && maxD > 0.05;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name.padEnd(10)} maxDensity=${maxD.toFixed(3)} activeFrames=${activeFrames}/400 badValues=${badValues}`,
  );
  return ok;
}

const sizes: Array<[number, number]> = [
  [68, 28],
  [48, 60],
  [10, 8],
];

let allOk = true;
for (const [c, r] of sizes) {
  console.log(`-- grid ${c}x${r} --`);
  allOk = run("fluid.sim", new FluidProgram(), c, r) && allOk;
  allOk = run("life.run", new LifeProgram(), c, r) && allOk;
  allOk = run("field.flow", new FlowProgram(), c, r) && allOk;
}
console.log(allOk ? "\nALL PASS" : "\nFAILURES PRESENT");
process.exit(allOk ? 0 : 1);
