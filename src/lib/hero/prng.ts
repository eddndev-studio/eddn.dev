import type { RNG } from "./types";

// mulberry32: tiny, fast, well-distributed 32-bit PRNG.
// Deterministic from a seed so "today's build" is identical for every visitor
// and stable across reloads (the seed is the date).
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    range: (min: number, max: number) => min + next() * (max - min),
  };
}

// Seed derived from a YYYYMMDD integer. Mixed so adjacent days look unrelated.
export function seedFromDate(date: Date): number {
  const ymd =
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  // xorshift-ish mix so 20260612 and 20260613 diverge hard.
  let h = ymd >>> 0;
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return h >>> 0;
}

// Human-readable seed stamp for the readout, e.g. "20260612".
export function seedStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
