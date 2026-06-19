import * as THREE from 'three';

const SMOOTH = (t) => t * t * (3 - 2 * t);

const SKY_STOPS = 6;

function skyStops(top, mid, low, horizon) {
  return [top, mid, mid, low, horizon, horizon];
}

const PHASES = [
  {
    id: 'morning',
    fog: 0x2a2040,
    fogDensity: 0.011,
    ambientColor: 0x6a5898,
    ambientIntensity: 0.72,
    moonColor: 0xe8d8ff,
    moonIntensity: 0.35,
    sky: skyStops('#221838', '#3a2858', '#524878', '#786898', '#a890b8', '#c8b8d0'),
    horizonGlow: [255, 190, 160, 0.16],
    stars: 0.04,
    moonVis: 0.08,
    moonGlow: 0.03,
    aurora: 0.02,
    rimColor: 0xffbb99,
    rimOpacity: 0.055,
    exposure: 1.24,
  },
  {
    id: 'noon',
    fog: 0x383058,
    fogDensity: 0.009,
    ambientColor: 0x8878b0,
    ambientIntensity: 0.82,
    moonColor: 0xf0e8ff,
    moonIntensity: 0.22,
    sky: skyStops('#302850', '#484070', '#686090', '#8880a8', '#a8a0c0', '#c8c0d8'),
    horizonGlow: [240, 220, 255, 0.1],
    stars: 0,
    moonVis: 0,
    moonGlow: 0,
    aurora: 0.01,
    rimColor: 0xddd0ff,
    rimOpacity: 0.04,
    exposure: 1.32,
  },
  {
    id: 'evening',
    fog: 0x120818,
    fogDensity: 0.016,
    ambientColor: 0x482838,
    ambientIntensity: 0.48,
    moonColor: 0xaa88cc,
    moonIntensity: 0.55,
    sky: skyStops('#080410', '#140818', '#281028', '#481830', '#682838', '#883848'),
    horizonGlow: [255, 90, 50, 0.24],
    stars: 0.55,
    moonVis: 0.7,
    moonGlow: 0.1,
    aurora: 0.06,
    rimColor: 0xff4422,
    rimOpacity: 0.09,
    exposure: 0.94,
  },
  {
    id: 'night',
    fog: 0x030208,
    fogDensity: 0.024,
    ambientColor: 0x221838,
    ambientIntensity: 0.28,
    moonColor: 0x7788ff,
    moonIntensity: 0.95,
    sky: skyStops('#020108', '#060412', '#0e0820', '#1a0c28', '#301038', '#401838'),
    horizonGlow: [180, 40, 60, 0.12],
    stars: 1,
    moonVis: 1,
    moonGlow: 0.14,
    aurora: 0.11,
    rimColor: 0xcc1133,
    rimOpacity: 0.05,
    exposure: 0.82,
  },
];

function lerpHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}

function lerpSky(a, b, t) {
  const out = [];
  for (let i = 0; i < SKY_STOPS; i++) {
    out.push(new THREE.Color(a[i]).lerp(new THREE.Color(b[i]), t).getStyle());
  }
  return out;
}

function lerpHorizon(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

function lerpPhase(a, b, t) {
  return {
    fog: lerpHex(a.fog, b.fog, t),
    fogDensity: a.fogDensity + (b.fogDensity - a.fogDensity) * t,
    ambientColor: lerpHex(a.ambientColor, b.ambientColor, t),
    ambientIntensity: a.ambientIntensity + (b.ambientIntensity - a.ambientIntensity) * t,
    moonColor: lerpHex(a.moonColor, b.moonColor, t),
    moonIntensity: a.moonIntensity + (b.moonIntensity - a.moonIntensity) * t,
    sky: lerpSky(a.sky, b.sky, t),
    horizonGlow: lerpHorizon(a.horizonGlow, b.horizonGlow, t),
    stars: a.stars + (b.stars - a.stars) * t,
    moonVis: a.moonVis + (b.moonVis - a.moonVis) * t,
    moonGlow: a.moonGlow + (b.moonGlow - a.moonGlow) * t,
    aurora: a.aurora + (b.aurora - a.aurora) * t,
    rimColor: lerpHex(a.rimColor, b.rimColor, t),
    rimOpacity: a.rimOpacity + (b.rimOpacity - a.rimOpacity) * t,
    exposure: a.exposure + (b.exposure - a.exposure) * t,
  };
}

export const DAY_PHASE_DISTANCE = 2800;
export const DAY_CYCLE_DISTANCE = DAY_PHASE_DISTANCE * PHASES.length;

export function progressForDistance(distance, phaseDistance = DAY_PHASE_DISTANCE) {
  const cycleDistance = phaseDistance * PHASES.length;
  const wrapped = ((distance % cycleDistance) + cycleDistance) % cycleDistance;
  return wrapped / cycleDistance;
}

export function getDayPhaseLabelForDistance(distance, phaseDistance = DAY_PHASE_DISTANCE) {
  return getDayPhaseLabel(progressForDistance(distance, phaseDistance));
}

export function sampleDayCycle(progress) {
  const wrapped = ((progress % 1) + 1) % 1;
  const scaled = wrapped * PHASES.length;
  const index = Math.floor(scaled) % PHASES.length;
  const next = (index + 1) % PHASES.length;
  const t = SMOOTH(scaled - index);
  return lerpPhase(PHASES[index], PHASES[next], t);
}

export function getDayPhaseLabel(progress) {
  const wrapped = ((progress % 1) + 1) % 1;
  const labels = ['Sabah', 'Öğlen', 'Akşam', 'Gece'];
  return labels[Math.floor(wrapped * PHASES.length) % PHASES.length];
}

export class DayCycle {
  constructor(phaseDistance = DAY_PHASE_DISTANCE) {
    this.phaseDistance = phaseDistance;
    this.cycleDistance = phaseDistance * PHASES.length;
    this.distance = 0;
    this.progress = 0;
    this.state = sampleDayCycle(0);
  }

  reset(startDistance = 0) {
    this.setDistance(startDistance);
  }

  setDistance(distance) {
    this.distance = Math.max(0, distance);
    this.progress = progressForDistance(this.distance, this.phaseDistance);
    this.state = sampleDayCycle(this.progress);
  }
}
