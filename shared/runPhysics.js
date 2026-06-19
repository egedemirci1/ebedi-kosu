/** Matches Game.js run speed — soft cap with diminishing acceleration. */
export const BASE_RUN_SPEED = 14;
export const MAX_RUN_SPEED = 26;
/** Distance scale: larger = slower approach to max speed (mid-run keeps accelerating). */
export const SPEED_RAMP_DISTANCE = 2400;
export const MAX_SPEED_MULTIPLIER = 1.3;
export const RUN_PHYSICS_TOLERANCE = 1.2;

/** Full danger bar (100%) after this many clean hits with no recovery between them. */
export const HITS_TO_CATCH = 2;
export const DANGER_PER_HIT = 1 / HITS_TO_CATCH;

const SPEED_HEADROOM = MAX_RUN_SPEED - BASE_RUN_SPEED;

/** Run speed (m/s) at a given distance — growth slows as you approach MAX_RUN_SPEED. */
export function runSpeedAtDistance(distanceMeters) {
  const d = Math.max(0, Number(distanceMeters) || 0);
  return BASE_RUN_SPEED + SPEED_HEADROOM * (1 - Math.exp(-d / SPEED_RAMP_DISTANCE));
}

function integrateDistance(activeMs, speedMultiplier = MAX_SPEED_MULTIPLIER) {
  const seconds = Math.max(0, Number(activeMs) || 0) / 1000;
  if (seconds <= 0) return 0;

  let distance = 0;
  let t = 0;
  const dt = 0.025;
  const mult = speedMultiplier * RUN_PHYSICS_TOLERANCE;

  while (t < seconds) {
    const step = Math.min(dt, seconds - t);
    distance += runSpeedAtDistance(distance) * mult * step;
    t += step;
  }

  return distance;
}

export function maxPlausibleDistance(activeMs) {
  return Math.floor(integrateDistance(activeMs));
}

export function minActiveMsForDistance(distance) {
  const target = Math.max(0, Math.floor(Number(distance) || 0));
  if (target <= 0) return 0;

  let lo = 0;
  let hi = 7200000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (maxPlausibleDistance(mid) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
