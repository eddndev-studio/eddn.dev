// Shared contract for the hero "FRAMEBUFFER" engine.
//
// One renderer (CellGrid) draws a scalar field as a grid of monospace glyphs.
// Programs never touch the canvas; they only write two channels into the Field:
//   - density -> selects a glyph from RAMP (space = empty, '@' = solid)
//   - heat    -> selects a color along the cool->hot violet palette
// This keeps every program visually identical in "look" while their physics differ.

// ASCII-only density ramp, 10 levels. Index 0 (space) renders nothing.
// Low index = faint, high index = solid.
export const RAMP = " .:-=+*#%@";

export interface RNG {
  // Returns a float in [0, 1).
  next(): number;
  // Integer in [0, maxExclusive).
  int(maxExclusive: number): number;
  // Float in [min, max).
  range(min: number, max: number): number;
}

// Row-major scalar buffers. idx = y * cols + x.
export interface Field {
  cols: number;
  rows: number;
  density: Float32Array; // [0,1] -> glyph
  heat: Float32Array; // [0,1] -> color temperature
  idx(x: number, y: number): number;
  inBounds(x: number, y: number): boolean;
  clear(): void;
}

// Pointer state expressed in fractional CELL coordinates (not pixels).
export interface Pointer {
  x: number; // current cell x (fractional), valid only when inside
  y: number; // current cell y (fractional)
  vx: number; // cell-space velocity (cells per frame, smoothed)
  vy: number;
  inside: boolean; // pointer is over the canvas this frame
  down: boolean; // primary button / touch held
}

export interface Program {
  // Stable id used in the status readout, e.g. "fluid.sim".
  readonly name: string;
  // Short uppercase label for the program switcher, e.g. "FLUID".
  readonly label: string;
  // Allocate internal state and write the opening frame into `field`.
  seed(field: Field, rng: RNG): void;
  // Advance one render frame. dt is seconds since last step (clamped).
  // `frame` is a monotonic counter (use for time-based noise, never Date.now()).
  step(field: Field, dt: number, pointer: Pointer, frame: number): void;
  // Optional: discrete impulse on pointer/click down.
  onPointerDown?(field: Field, pointer: Pointer): void;
  // Optional: scroll velocity hint (cells/sec equivalent), used by field.flow.
  onScroll?(velocity: number): void;
}
