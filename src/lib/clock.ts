/**
 * Injectable clock seam — every schedule, expiry, "today", and retention
 * decision routes through `now()` so tests can drive time-based behavior.
 */

let _now: () => number = () => Date.now();

/** Wall-clock ms (overridable in tests via `setNow`). */
export function now(): number {
  return _now();
}

/** Replace the clock (tests). Pass `undefined` to restore real time. */
export function setNow(fn: (() => number) | undefined): void {
  _now = fn ?? (() => Date.now());
}

/** Advance a fixed clock by `ms` (only useful after `setNow(() => t)`). */
export function advance(ms: number): void {
  const base = _now();
  _now = () => base + ms;
}
