/** Matches Game.js speed model (base 14, +0.008/m, max 1.3× speed booster). */
export const BASE_RUN_SPEED = 14;
export const RUN_SPEED_GROWTH = 0.008;
export const MAX_SPEED_MULTIPLIER = 1.3;
export const RUN_PHYSICS_TOLERANCE = 1.2;

const DISTANCE_SCALE = BASE_RUN_SPEED / RUN_SPEED_GROWTH;
const GROWTH_TERM = MAX_SPEED_MULTIPLIER * RUN_SPEED_GROWTH;

export function maxPlausibleDistance(activeMs) {
  const seconds = Math.max(0, Number(activeMs) || 0) / 1000;
  if (seconds <= 0) return 0;

  const distance = DISTANCE_SCALE * (Math.exp(GROWTH_TERM * seconds) - 1) * RUN_PHYSICS_TOLERANCE;
  return Math.floor(distance);
}

export function minActiveMsForDistance(distance) {
  const d = Math.max(0, Math.floor(Number(distance) || 0));
  if (d <= 0) return 0;

  const ratio = 1 + d / (DISTANCE_SCALE * RUN_PHYSICS_TOLERANCE);
  if (ratio <= 1) return 0;

  const seconds = Math.log(ratio) / GROWTH_TERM;
  return Math.ceil(seconds * 1000);
}
