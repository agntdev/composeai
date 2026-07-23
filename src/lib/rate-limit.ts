/**
 * Silent per-user rate limiting (owner-configurable via env).
 * Counts requests in a sliding window stored under an explicit key.
 */

import { now } from "./clock.js";
import { kvGet, kvSet } from "./store.js";

export interface RateState {
  windowStart: number;
  count: number;
}

function windowMs(): number {
  const raw = typeof process !== "undefined" ? process.env.RATE_LIMIT_WINDOW_MS : undefined;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 60_000;
}

function maxRequests(): number {
  const raw = typeof process !== "undefined" ? process.env.RATE_LIMIT_MAX : undefined;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function key(userId: number | string): string {
  return `rate:${userId}`;
}

/**
 * Returns true if the user is allowed to proceed (and increments the counter).
 * Returns false when the limit is exceeded (silent reject — caller shows a soft message).
 */
export async function checkRateLimit(userId: number | string): Promise<boolean> {
  const k = key(userId);
  const t = now();
  const win = windowMs();
  const max = maxRequests();
  let state = (await kvGet<RateState>(k)) ?? { windowStart: t, count: 0 };

  if (t - state.windowStart >= win) {
    state = { windowStart: t, count: 0 };
  }

  if (state.count >= max) {
    await kvSet(k, state);
    return false;
  }

  state.count += 1;
  await kvSet(k, state);
  return true;
}

export const RATE_LIMIT_MESSAGE =
  "You're going a bit fast — wait a moment and try again.";
