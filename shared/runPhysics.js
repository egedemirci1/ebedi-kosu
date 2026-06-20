/** Matches Game.js run speed — soft cap with diminishing acceleration. */
export const BASE_RUN_SPEED = 15.5;
/** Smooth curve ceiling before gear bonuses. */
export const CORE_MAX_RUN_SPEED = 21;
/** @deprecated use CORE_MAX_RUN_SPEED + gear bonuses; kept for older references. */
export const MAX_RUN_SPEED = 26;
export const OVERDRIVE_MAX_SPEED = 30;
/** Distance scale for the smooth core curve between gear jumps. */
export const SPEED_RAMP_DISTANCE = 1800;
/** After this distance, speed slowly creeps toward OVERDRIVE_MAX. */
export const OVERDRIVE_START_DISTANCE = 10000;
export const OVERDRIVE_RAMP_DISTANCE = 12000;
export const MAX_SPEED_MULTIPLIER = 1.3;
export const RUN_PHYSICS_TOLERANCE = 1.2;

/** Each hit adds this much to the danger bar (0–1). Three hits → 120% capped at 100%. */
export const DANGER_PER_HIT = 0.4;
/** @deprecated use DANGER_PER_HIT; kept for docs/tests referencing hit count. */
export const HITS_TO_CATCH = 1 / DANGER_PER_HIT;

/**
 * Discrete speed jumps — sync with ChaseMusic tiers (1k, 3k) and disco at 5k.
 * @type {{ distance: number, bonus: number }[]}
 */
export const SPEED_GEAR_BONUSES = [
  { distance: 1000, bonus: 1.5 },
  { distance: 2000, bonus: 1.25 },
  { distance: 3000, bonus: 2.0 },
  { distance: 5000, bonus: 2.5 },
];

const CORE_HEADROOM = CORE_MAX_RUN_SPEED - BASE_RUN_SPEED;

/** @param {number} distanceMeters */
export function speedGearBonusForDistance(distanceMeters) {
  const d = Math.floor(Math.max(0, Number(distanceMeters) || 0));
  let bonus = 0;
  for (const gear of SPEED_GEAR_BONUSES) {
    if (d >= gear.distance) bonus += gear.bonus;
  }
  return bonus;
}

/** @param {number} d */
function coreSpeedAtDistance(d) {
  return BASE_RUN_SPEED + CORE_HEADROOM * (1 - Math.exp(-d / SPEED_RAMP_DISTANCE));
}

/** @param {number} d */
function speedBeforeOverdrive(d) {
  return coreSpeedAtDistance(d) + speedGearBonusForDistance(d);
}

/** Run speed (m/s) — smooth core, music-synced gear jumps, late overdrive. */
export function runSpeedAtDistance(distanceMeters) {
  const d = Math.max(0, Number(distanceMeters) || 0);
  if (d < OVERDRIVE_START_DISTANCE) return speedBeforeOverdrive(d);

  const startSpeed = speedBeforeOverdrive(OVERDRIVE_START_DISTANCE);
  const t = (d - OVERDRIVE_START_DISTANCE) / OVERDRIVE_RAMP_DISTANCE;
  const overBlend = 1 - Math.exp(-2.2 * Math.min(t, 3));
  return startSpeed + (OVERDRIVE_MAX_SPEED - startSpeed) * overBlend;
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
