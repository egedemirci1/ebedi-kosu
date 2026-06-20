import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANES, LANE_WIDTH } from './scene.js';
import { GRAPHICS } from './graphicsProfile.js';
import { createSurfaceMaterial } from './surfaceMaterial.js';
import { BASE_RUN_SPEED } from '../shared/runPhysics.js';

const OBSTACLE_DEFS = {
  low: { height: 1.05, meshY: 0.525, jumpable: true, slideUnder: false },
  barrier: { height: 1.2, meshY: 0.6, jumpable: true, slideUnder: false },
  tall: { height: 3.4, meshY: 1.7, jumpable: false, slideUnder: false },
  /** Alçak kapı — alttan kay, üstten süper zıpla veya yüksek zıpla. */
  gate: {
    height: 0.42,
    clearance: 1.16,
    meshY: 0,
    jumpable: false,
    slideUnder: true,
    beamSpan: LANE_WIDTH + 0.18,
  },
};

const OBSTACLE_TYPES = Object.keys(OBSTACLE_DEFS);
const SPIKE_TYPES = new Set(['low', 'tall']);
const SLIDE_UNDER_TYPES = new Set(
  OBSTACLE_TYPES.filter((type) => OBSTACLE_DEFS[type].slideUnder)
);
const MAX_PER_TYPE = 24;
const COLLISION_Z = 0.45;
const CLEARANCE = 0.12;
const LANE_MATCH = 0.85;
const LOW_SPIKE_HEIGHTS = [0.82, 0.72, 0.76, 0.62, 0.7];
const TALL_SPIKE_HEIGHTS = [2.95, 3.18, 2.78, 3.05];

/** True when obstacle z-range this frame crossed the player plane (z=0). */
export function obstacleSweepHitsPlayer(prevZ, z, window = COLLISION_Z) {
  const lo = Math.min(prevZ, z);
  const hi = Math.max(prevZ, z);
  return lo <= window && hi >= -window;
}

function playerSlideZOffset(player) {
  const blend = player.slideBlend ?? 0;
  if (player.isSliding || blend > 0.35) return -blend * 0.22;
  return 0;
}

/** Matches slide hitbox — includes slide-out animation after key release. */
function playerInSlidePose(player) {
  return player.isSliding || (player.slideBlend ?? 0) > 0.35;
}

function collisionZWindow(player, slidePose) {
  return COLLISION_Z + (slidePose ? Math.abs(playerSlideZOffset(player)) + 0.2 : 0);
}

function playerHitbox(player) {
  if (player.hitbox) return player.hitbox;

  const sliding = player.isSliding || (player.slideBlend ?? 0) > 0.35;
  if (sliding) {
    return { y: player.y + 0.46, height: 0.68 };
  }
  return { y: player.y + 0.9, height: 1.6 };
}

function playerVerticalBounds(player) {
  const hb = playerHitbox(player);
  const half = hb.height / 2;
  return { bottom: hb.y - half, top: hb.y + half };
}

const SPAWN_LOOKAHEAD_BASE = -110;
/** Before this distance: tutorial mix only (barrier + low). */
const OBSTACLE_TUTORIAL_END = 200;
/**
 * Global spawn-density tuning (1 = default). Scales effective difficulty for spawn
 * interval, wave spacing, lane count, and type mix without changing the distance curve.
 */
const OBSTACLE_DENSITY_SCALE = 0.95;
/** Extra meters between spawn waves on top of difficulty-based spacing. */
const OBSTACLE_SPAWN_GAP_BIAS = 0.3;
/** 200m → 2.4k ramps difficulty from tier I to full. */
const OBSTACLE_DIFFICULTY_RAMP = 2200;
const OBSTACLE_OVERDRIVE_DISTANCE = 10000;
const OBSTACLE_OVERDRIVE_RAMP = 12000;
/** Difficulty at the first gear / music tier. */
const OBSTACLE_TIER_I_DIFFICULTY = 0.22;

/** 0–0.1 tutorial, tier jump at 200m, full ramp by ~2.4k, overdrive after 10k. */
export function obstacleDifficultyForDistance(distance) {
  const d = Math.max(0, Number(distance) || 0);
  let base;
  if (d < OBSTACLE_TUTORIAL_END) {
    base = (d / OBSTACLE_TUTORIAL_END) * 0.1;
  } else {
    const ramp = Math.min(1, (d - OBSTACLE_TUTORIAL_END) / OBSTACLE_DIFFICULTY_RAMP);
    base = OBSTACLE_TIER_I_DIFFICULTY + ramp * (1 - OBSTACLE_TIER_I_DIFFICULTY);
  }
  if (d < OBSTACLE_OVERDRIVE_DISTANCE) return base;
  const late = Math.min(
    0.35,
    (d - OBSTACLE_OVERDRIVE_DISTANCE) / OBSTACLE_OVERDRIVE_RAMP
  );
  return base + late;
}

/** @deprecated use OBSTACLE_TUTORIAL_END + OBSTACLE_DIFFICULTY_RAMP */
const OBSTACLE_DIFFICULTY_DISTANCE = OBSTACLE_TUTORIAL_END + OBSTACLE_DIFFICULTY_RAMP;
const MIN_SPAWN_Z = -130;
/** Extra meters between spawn waves per m/s above this speed (late-game only). */
const SPAWN_GAP_SPEED_STRETCH = 0.28;
const SPAWN_GAP_SPEED_STRETCH_START = 24;
const SPAWN_LOOKAHEAD_SPEED_FACTOR = 5.5;
const SPAWN_LOOKAHEAD_MIN = -155;
const OBSTACLE_SPAWN_NEAR_MARGIN = 3.5;
const OBSTACLE_DROUGHT_DISTANCE = 15;
const EARLY_GAME_DISTANCE = 450;
const EARLY_DROUGHT_DISTANCE = 28;
const NEAR_SPAWN_Z_START = -11;
const NEAR_SPAWN_Z_MIN = -78;
/** Normal spawns stay at least this many meters ahead (or speed × seconds, whichever is larger). */
const MIN_SPAWN_AHEAD_Z = -32;
const MIN_SPAWN_AHEAD_SECONDS = 2.2;
const MIN_NEAR_PLAYER_OBSTACLES = 3;
const EARLY_MIN_NEAR_OBSTACLES = 2;
const WAVE_MIN_Z_SPACING = 7;
const EARLY_WAVE_MIN_Z_SPACING = 10;
const SPAWN_Z_SCAN_STEP = 1.1;
const SPAWN_FAIL_Z_STEP = 6;

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const TEMP_POS = new THREE.Vector3();
const TEMP_QUAT = new THREE.Quaternion();
const TEMP_SCALE = new THREE.Vector3(1, 1, 1);
const TEMP_MATRIX = new THREE.Matrix4();

function createStoneTexture(variant = 'barrier') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const palettes = {
    barrier: { a: '#5a5488', b: '#726a9a', c: '#8a82b0', d: '#484068' },
    low: { a: '#686098', b: '#8278b0', c: '#9c94c8', d: '#504870' },
    tall: { a: '#605888', b: '#7a70a0', c: '#948cb8', d: '#484068' },
    overhead: { a: '#1a1626', b: '#2e2840', c: '#464060', d: '#100e18' },
    gate: { a: '#1a1626', b: '#2e2840', c: '#464060', d: '#100e18' },
    spikeBase: { a: '#282238', b: '#383050', c: '#484060', d: '#181420' },
  };
  const p = palettes[variant] ?? palettes.barrier;
  const isSpike = variant === 'low' || variant === 'tall';
  const isSpikeBase = variant === 'spikeBase';

  const bg = ctx.createLinearGradient(0, 0, 256, 256);
  bg.addColorStop(0, p.c);
  bg.addColorStop(0.45, p.b);
  bg.addColorStop(1, p.a);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);

  if (isSpike) {
    const lift = ctx.createLinearGradient(0, 0, 0, 256);
    lift.addColorStop(0, 'rgba(220, 210, 255, 0.55)');
    lift.addColorStop(0.5, 'rgba(180, 170, 220, 0.2)');
    lift.addColorStop(1, 'rgba(120, 110, 160, 0.08)');
    ctx.fillStyle = lift;
    ctx.fillRect(0, 0, 256, 256);
  }

  for (let i = 0; i < (isSpike ? 70 : 140); i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const r = 4 + Math.random() * 22;
    ctx.fillStyle = isSpike
      ? Math.random() > 0.35
        ? p.c
        : p.b
      : Math.random() > 0.5
        ? p.d
        : p.c;
    ctx.globalAlpha = isSpike ? 0.04 + Math.random() * 0.08 : 0.08 + Math.random() * 0.14;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = isSpike
    ? 'rgba(80, 70, 120, 0.22)'
    : variant === 'barrier'
      ? 'rgba(70, 58, 100, 0.22)'
      : 'rgba(10, 8, 16, 0.55)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < (isSpike ? 5 : 9); i++) {
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = Math.random() * 256;
    ctx.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (Math.random() - 0.5) * 70;
      y += (Math.random() - 0.5) * 70;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(90, 70, 130, 0.22)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(Math.random() * 256, Math.random() * 256);
    ctx.lineTo(Math.random() * 256, Math.random() * 256);
    ctx.stroke();
  }

  if (variant === 'barrier') {
    ctx.beginPath();
    ctx.moveTo(128, 52);
    ctx.lineTo(168, 148);
    ctx.lineTo(128, 204);
    ctx.lineTo(88, 148);
    ctx.closePath();
    const darkCore = ctx.createRadialGradient(128, 148, 4, 128, 148, 78);
    darkCore.addColorStop(0, '#000000');
    darkCore.addColorStop(0.45, '#050308');
    darkCore.addColorStop(1, '#0c0612');
    ctx.fillStyle = darkCore;
    ctx.fill();

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  if (variant === 'gate' || variant === 'overhead') {
    const glow = ctx.createLinearGradient(0, 200, 0, 256);
    glow.addColorStop(0, 'rgba(140, 100, 220, 0)');
    glow.addColorStop(0.55, 'rgba(160, 120, 255, 0.35)');
    glow.addColorStop(1, 'rgba(200, 160, 255, 0.55)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 190, 256, 66);

    const topCore = ctx.createRadialGradient(128, 112, 4, 128, 112, 58);
    topCore.addColorStop(0, '#d8c4ff');
    topCore.addColorStop(0.4, '#9a82d8');
    topCore.addColorStop(0.72, '#524878');
    topCore.addColorStop(1, 'rgba(26, 22, 38, 0)');
    ctx.fillStyle = topCore;
    ctx.fillRect(70, 54, 116, 116);

    ctx.strokeStyle = 'rgba(200, 175, 255, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.save();
    ctx.translate(128, 112);
    ctx.scale(1, 24 / 34);
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (isSpikeBase) {
    ctx.strokeStyle = 'rgba(120, 100, 170, 0.16)';
    ctx.lineWidth = 1;
    for (let y = 32; y < 256; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    const floorSheen = ctx.createLinearGradient(0, 0, 256, 0);
    floorSheen.addColorStop(0, 'rgba(100, 80, 150, 0.08)');
    floorSheen.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
    floorSheen.addColorStop(1, 'rgba(100, 80, 150, 0.08)');
    ctx.fillStyle = floorSheen;
    ctx.fillRect(0, 0, 256, 256);
  }

  if (isSpike) {
    const sheen = ctx.createLinearGradient(0, 0, 256, 200);
    sheen.addColorStop(0, 'rgba(240, 230, 255, 0.45)');
    sheen.addColorStop(0.6, 'rgba(190, 180, 235, 0.15)');
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = 'rgba(230, 215, 255, 0.22)';
    for (let i = 0; i < 10; i++) {
      const x = 40 + Math.random() * 176;
      const y = 40 + Math.random() * 176;
      ctx.beginPath();
      ctx.arc(x, y, 8 + Math.random() * 14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createStoneMaterial(variant) {
  const emissiveByVariant = {
    barrier: { color: 0x665588, intensity: 0.1, tint: 0xe8e2ff, roughness: 0.78 },
    low: { color: 0x9988dd, intensity: 0.22, tint: 0xe8e2ff, roughness: 0.68 },
    tall: { color: 0x8877cc, intensity: 0.18, tint: 0xe0daf8, roughness: 0.72 },
    spikeBase: { color: 0x443355, intensity: 0.06, tint: 0xb0a8c8, roughness: 0.88 },
    overhead: { color: 0x554488, intensity: 0.14, tint: 0xffffff, roughness: 0.9 },
    gate: { color: 0x665599, intensity: 0.18, tint: 0xf4f0ff, roughness: 0.88 },
  };
  const em = emissiveByVariant[variant] ?? emissiveByVariant.barrier;

  return createSurfaceMaterial({
    map: createStoneTexture(variant),
    color: em.tint,
    emissive: em.color,
    emissiveIntensity: em.intensity,
    roughness: em.roughness,
    metalness: 0.03,
    fog: true,
  });
}

function buildSpikeBaseGeo(height, platformW = 1.45) {
  const baseY = -height / 2;
  const parts = [];

  const platform = new THREE.BoxGeometry(platformW, 0.2, 0.72);
  platform.translate(0, baseY + 0.1, 0);
  parts.push(platform);

  const chunks = [
    { x: -0.42, z: 0.12, sx: 0.28, sy: 0.16, sz: 0.22 },
    { x: 0.38, z: -0.14, sx: 0.24, sy: 0.14, sz: 0.2 },
    { x: 0.08, z: 0.18, sx: 0.18, sy: 0.12, sz: 0.16 },
  ];
  for (const c of chunks) {
    const rock = new THREE.BoxGeometry(c.sx, c.sy, c.sz);
    rock.translate(c.x, baseY + 0.2 + c.sy / 2, c.z);
    parts.push(rock);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildSpikeConesGeo(height, spikes) {
  const baseY = -height / 2;
  const parts = spikes.map(({ x, z, h, r }) => {
    const cone = new THREE.ConeGeometry(r, h, 6);
    cone.translate(x, baseY + 0.2 + h / 2, z);
    return cone;
  });
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildBarrierGeometry(def) {
  const h = def.height;
  const baseY = -h / 2;
  const parts = [];

  const plinth = new THREE.BoxGeometry(1.78, 0.16, 0.6);
  plinth.translate(0, baseY + 0.08, 0);
  parts.push(plinth);

  const body = new THREE.BoxGeometry(1.5, h * 0.76, 0.44);
  body.translate(0, baseY + 0.16 + (h * 0.76) / 2, 0);
  parts.push(body);

  const cap = new THREE.BoxGeometry(1.64, 0.14, 0.54);
  cap.translate(0, baseY + h - 0.07, 0);
  parts.push(cap);

  for (const x of [-0.64, 0.64]) {
    const fin = new THREE.BoxGeometry(0.14, h * 0.52, 0.36);
    fin.translate(x, baseY + 0.16 + (h * 0.52) / 2, 0);
    parts.push(fin);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildGateGeometry(def) {
  const beamW = def.beamSpan ?? LANE_WIDTH + 0.18;
  const beamH = def.height;
  const beamBottom = def.clearance ?? 1.16;
  const beamY = beamBottom + beamH / 2;
  const postH = beamBottom;
  const postW = 0.24;
  const postD = 0.56;
  const parts = [];

  const sill = new THREE.BoxGeometry(beamW, 0.12, 0.52);
  sill.translate(0, 0.06, 0);
  parts.push(sill);

  for (const x of [-beamW / 2 + postW / 2, beamW / 2 - postW / 2]) {
    const foot = new THREE.BoxGeometry(postW * 1.8, 0.1, postD * 1.2);
    foot.translate(x, 0.05, 0);
    parts.push(foot);

    const post = new THREE.BoxGeometry(postW, postH, postD);
    post.translate(x, postH / 2, 0);
    parts.push(post);
  }

  const beam = new THREE.BoxGeometry(beamW, beamH, 0.62);
  beam.translate(0, beamY, 0);
  parts.push(beam);

  const cap = new THREE.BoxGeometry(beamW * 0.96, 0.16, 0.66);
  cap.translate(0, beamY + beamH / 2 + 0.06, 0);
  parts.push(cap);

  const lip = new THREE.BoxGeometry(beamW * 0.92, 0.12, 0.64);
  lip.translate(0, beamBottom - 0.05, 0);
  parts.push(lip);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function obstacleVerticalBounds(type, def) {
  if (SLIDE_UNDER_TYPES.has(type)) {
    const bottomY = def.clearance ?? 1.16;
    return { bottomY, topY: bottomY + def.height + 0.16 };
  }

  if (SPIKE_TYPES.has(type)) {
    const anchor = def.meshY ?? 0;
    const baseY = -def.height / 2;
    const floorY = anchor + baseY + 0.2;
    const spikeHeights = type === 'low' ? LOW_SPIKE_HEIGHTS : TALL_SPIKE_HEIGHTS;
    const tipY = anchor + baseY + 0.2 + Math.max(...spikeHeights);
    return { bottomY: floorY, topY: tipY };
  }

  const center = def.meshY ?? def.height / 2;
  const half = def.height / 2;
  return { bottomY: center - half, topY: center + half };
}

function obstacleBeamBottom(type, def) {
  if (SLIDE_UNDER_TYPES.has(type)) return def.clearance ?? 1.16;
  return null;
}

function buildObstacleGeometry(type, def) {
  if (type === 'barrier') {
    return buildBarrierGeometry(def);
  }

  if (SLIDE_UNDER_TYPES.has(type)) {
    return buildGateGeometry(def);
  }

  if (type === 'low') {
    return buildSpikeConesGeo(def.height, [
      { x: 0, z: 0, h: 0.82, r: 0.12 },
      { x: -0.38, z: 0.06, h: 0.72, r: 0.1 },
      { x: 0.34, z: -0.1, h: 0.76, r: 0.11 },
      { x: -0.12, z: -0.14, h: 0.62, r: 0.09 },
      { x: 0.22, z: 0.12, h: 0.7, r: 0.1 },
    ]);
  }

  return buildSpikeConesGeo(def.height, [
    { x: -0.45, z: 0, h: 2.95, r: 0.16 },
    { x: -0.12, z: 0.08, h: 3.18, r: 0.18 },
    { x: 0.28, z: -0.06, h: 2.78, r: 0.15 },
    { x: 0.52, z: 0.05, h: 3.05, r: 0.17 },
  ]);
}

function buildSpikeBaseGeometry(type, def) {
  const platformW = type === 'tall' ? 1.58 : 1.45;
  return buildSpikeBaseGeo(def.height, platformW);
}

export class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];
    this.pool = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.8;
    this.nextZ = -55;
    this.difficulty = 0;
    this.currentSpeed = BASE_RUN_SPEED;
    this.runDistance = 0;
    this.lastSpawnDistance = 0;
    this.gapManager = null;
    this._activeCount = 0;

    this.geometries = {};
    this.materials = {};
    for (const type of OBSTACLE_TYPES) {
      this.materials[type] = createStoneMaterial(type);
    }

    this.instancedMeshes = {};
    this.baseInstancedMeshes = {};
    this.baseMaterial = createStoneMaterial('spikeBase');
    this.freeSlots = {};

    for (const type of OBSTACLE_TYPES) {
      const def = OBSTACLE_DEFS[type];
      this.geometries[type] = buildObstacleGeometry(type, def);

      const mesh = new THREE.InstancedMesh(
        this.geometries[type],
        this.materials[type],
        MAX_PER_TYPE
      );
      mesh.castShadow = GRAPHICS.shadows;
      mesh.frustumCulled = false;

      if (SPIKE_TYPES.has(type)) {
        const baseMesh = new THREE.InstancedMesh(
          buildSpikeBaseGeometry(type, def),
          this.baseMaterial,
          MAX_PER_TYPE
        );
        baseMesh.castShadow = GRAPHICS.shadows;
        baseMesh.frustumCulled = false;
        scene.add(baseMesh);
        this.baseInstancedMeshes[type] = baseMesh;
      }

      scene.add(mesh);

      this.instancedMeshes[type] = mesh;
      this.freeSlots[type] = [];

      for (let i = 0; i < MAX_PER_TYPE; i++) {
        mesh.setMatrixAt(i, HIDDEN_MATRIX);
        if (this.baseInstancedMeshes[type]) {
          this.baseInstancedMeshes[type].setMatrixAt(i, HIDDEN_MATRIX);
        }
        this.freeSlots[type].push(i);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (this.baseInstancedMeshes[type]) {
        this.baseInstancedMeshes[type].instanceMatrix.needsUpdate = true;
      }
    }
  }

  setGapManager(gapManager) {
    this.gapManager = gapManager;
  }

  isEarlyGame(distance = this.runDistance) {
    return distance < EARLY_GAME_DISTANCE;
  }

  minSpawnAheadZ(speed = this.currentSpeed) {
    const ahead = Math.max(-MIN_SPAWN_AHEAD_Z, speed * MIN_SPAWN_AHEAD_SECONDS);
    return -ahead;
  }

  isSpawnDistanceOk(z, speed = this.currentSpeed) {
    return z <= this.minSpawnAheadZ(speed);
  }

  waveMinSpacing(distance = this.runDistance) {
    return this.isEarlyGame(distance) ? EARLY_WAVE_MIN_Z_SPACING : WAVE_MIN_Z_SPACING;
  }

  isSpawnZTooClose(z, minSpacing = this.waveMinSpacing()) {
    for (let i = 0; i < this._activeCount; i++) {
      const obs = this.obstacles[i];
      if (!obs.active) continue;
      if (Math.abs(obs.z - z) < minSpacing) return true;
    }
    return false;
  }

  isBlockedPosition(z, nearMargin = OBSTACLE_SPAWN_NEAR_MARGIN) {
    if (this.gapManager?.isObstacleSpawnBlocked(z)) return true;
    return this.hasObstacleNear(z, nearMargin);
  }

  spawnLookaheadForSpeed(speed) {
    return Math.max(SPAWN_LOOKAHEAD_MIN, Math.min(SPAWN_LOOKAHEAD_BASE, -speed * SPAWN_LOOKAHEAD_SPEED_FACTOR));
  }

  resolveSpawnZ() {
    const minAhead = this.minSpawnAheadZ();
    const scanEnd = Math.min(
      MIN_SPAWN_Z,
      NEAR_SPAWN_Z_MIN,
      this.getFurthestZ() - 8
    );

    const trySpawnAt = (z) =>
      this.isSpawnDistanceOk(z) &&
      z >= scanEnd &&
      !this.isBlockedPosition(z) &&
      !this.isSpawnZTooClose(z);

    const isCorridorFree = (z) => !this.hasObstacleNear(z, OBSTACLE_SPAWN_NEAR_MARGIN);
    const corridorZ = this.gapManager?.findPostGapSpawnZ(isCorridorFree);
    if (
      corridorZ != null &&
      this.isSpawnDistanceOk(corridorZ) &&
      corridorZ >= scanEnd &&
      !this.isBlockedPosition(corridorZ)
    ) {
      return corridorZ;
    }

    const plannedZ = Math.min(this.nextZ, minAhead);
    if (trySpawnAt(plannedZ)) return plannedZ;

    for (let z = minAhead; z >= scanEnd; z -= SPAWN_Z_SCAN_STEP) {
      if (trySpawnAt(z)) return z;
    }
    return null;
  }

  countObstaclesNearPlayer(minZ = NEAR_SPAWN_Z_MIN, maxZ = 6) {
    let count = 0;
    for (let i = 0; i < this._activeCount; i++) {
      const obs = this.obstacles[i];
      if (!obs.active) continue;
      if (obs.z >= minZ && obs.z <= maxZ) count++;
    }
    return count;
  }

  hasObstacleNear(z, margin = 4) {
    for (let i = 0; i < this._activeCount; i++) {
      const obs = this.obstacles[i];
      if (!obs.active) continue;
      if (Math.abs(obs.z - z) < margin) return true;
    }
    return false;
  }

  getFurthestZ() {
    let furthest = 0;
    for (let i = 0; i < this._activeCount; i++) {
      const obs = this.obstacles[i];
      if (!obs.active) continue;
      if (obs.z < furthest) furthest = obs.z;
    }
    return furthest;
  }

  prefill() {
    let attempts = 0;
    while (this.nextZ > MIN_SPAWN_Z && attempts < 22) {
      this.spawn();
      attempts++;
    }
  }

  allocSlot(type) {
    const slots = this.freeSlots[type];
    if (slots.length === 0) return null;
    return slots.pop();
  }

  freeSlot(type, slot) {
    const mesh = this.instancedMeshes[type];
    mesh.setMatrixAt(slot, HIDDEN_MATRIX);
    mesh.instanceMatrix.needsUpdate = true;
    const baseMesh = this.baseInstancedMeshes[type];
    if (baseMesh) {
      baseMesh.setMatrixAt(slot, HIDDEN_MATRIX);
      baseMesh.instanceMatrix.needsUpdate = true;
    }
    this.freeSlots[type].push(slot);
  }

  setInstanceMatrix(entry) {
    const def = OBSTACLE_DEFS[entry.type];
    const anchorY = SLIDE_UNDER_TYPES.has(entry.type) ? 0 : def.meshY;
    TEMP_POS.set(LANES[entry.lane], anchorY, entry.z);
    TEMP_MATRIX.compose(TEMP_POS, TEMP_QUAT, TEMP_SCALE);
    const mesh = this.instancedMeshes[entry.type];
    mesh.setMatrixAt(entry.slot, TEMP_MATRIX);
    mesh.instanceMatrix.needsUpdate = true;
    const baseMesh = this.baseInstancedMeshes[entry.type];
    if (baseMesh) {
      baseMesh.setMatrixAt(entry.slot, TEMP_MATRIX);
      baseMesh.instanceMatrix.needsUpdate = true;
    }
  }

  acquireObstacle(type, lane, z) {
    const slot = this.allocSlot(type);
    if (slot === null) return false;

    const def = OBSTACLE_DEFS[type];
    let entry = this.pool.pop();

    if (entry) {
      entry.type = type;
      entry.lane = lane;
      entry.z = z;
      entry.slot = slot;
      const bounds = obstacleVerticalBounds(type, def);
      entry.bottomY = bounds.bottomY;
      entry.topY = bounds.topY;
      entry.beamBottom = obstacleBeamBottom(type, def);
      entry.jumpable = def.jumpable;
      entry.slideUnder = def.slideUnder ?? false;
      entry.active = true;
    } else {
      entry = {
        type,
        lane,
        z,
        slot,
        ...obstacleVerticalBounds(type, def),
        beamBottom: obstacleBeamBottom(type, def),
        jumpable: def.jumpable,
        slideUnder: def.slideUnder ?? false,
        active: true,
      };
    }

    this.setInstanceMatrix(entry);

    if (this._activeCount < this.obstacles.length) {
      this.obstacles[this._activeCount] = entry;
    } else {
      this.obstacles.push(entry);
    }
    this._activeCount++;
    return true;
  }

  spawn(options = {}) {
    const { forceMinLanes = 0 } = options;
    const spawnZ = this.resolveSpawnZ();
    if (spawnZ === null || !this.isSpawnDistanceOk(spawnZ)) {
      this.nextZ -= SPAWN_FAIL_Z_STEP;
      this.spawnTimer = 0.12;
      return false;
    }

    this.nextZ = spawnZ;

    const lanes = this.pickSpawnLanes(forceMinLanes);
    let placed = 0;
    for (let i = 0; i < lanes.length; i++) {
      const type = this.pickTypeForWave(lanes.length, i);
      if (this.acquireObstacle(type, lanes[i], spawnZ)) placed++;
    }
    if (placed === 0) {
      this.nextZ -= SPAWN_FAIL_Z_STEP;
      this.spawnTimer = 0.12;
      return false;
    }

    this.gapManager?.noteObstacleSpawnedAt(spawnZ);
    this.lastSpawnDistance = this.runDistance;
    this.nextZ = spawnZ - this.nextSpawnGap(this.currentSpeed);
    this.spawnTimer = this.spawnInterval;
    return true;
  }

  pickSpawnLanes(minCount = 0) {
    const d = this.difficulty;
    const early = this.isEarlyGame();
    const roll = Math.random();
    let count = 1;

    if (d >= 0.1) {
      const twoLaneChance = early ? 0.08 + d * 0.18 : 0.52 + d * 0.42;
      if (roll < twoLaneChance) {
        count = 2;
      } else if (!early && d >= 0.15 && roll < twoLaneChance + 0.08 + d * 0.22) {
        count = 3;
      }
    }

    if (early) {
      count = Math.min(count, 2);
      minCount = Math.min(minCount, 1);
    }

    count = Math.max(minCount, count);

    const picked = [];
    const pool = [0, 1, 2];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }
    return picked;
  }

  /** Triple rows always leave one jump, one slide, and one jump lane. */
  pickTypeForWave(laneCount, index) {
    if (laneCount >= 3) {
      return ['low', 'gate', 'barrier'][index];
    }
    if (laneCount === 2 && this.isEarlyGame()) {
      return index === 0 ? 'barrier' : 'low';
    }
    return this.pickType();
  }

  nextSpawnGap(speed = BASE_RUN_SPEED) {
    const tight = this.difficulty * 2.2;
    const speedStretch =
      Math.max(0, speed - SPAWN_GAP_SPEED_STRETCH_START) * SPAWN_GAP_SPEED_STRETCH;
    const earlyPad = this.isEarlyGame() ? 2.8 : 0;
    return 4.8 + Math.random() * 4.2 - tight + speedStretch + earlyPad + OBSTACLE_SPAWN_GAP_BIAS;
  }

  pickType() {
    const r = Math.random();
    const d = this.difficulty;

    if (d < 0.1) {
      return r < 0.55 ? 'barrier' : 'low';
    }

    if (d < 0.35) {
      if (r < 0.12) return 'gate';
      return r < 0.55 ? 'barrier' : 'low';
    }

    if (d < 0.55) {
      if (r < 0.3) return 'gate';
      if (r < 0.52) return 'barrier';
      if (r < 0.78) return 'low';
      return 'tall';
    }

    if (d >= 1) {
      if (r < 0.34) return 'gate';
      if (r < 0.54) return 'tall';
      if (r < 0.76) return 'barrier';
      return 'low';
    }

    if (r < 0.32) return 'gate';
    if (r < 0.52) return 'barrier';
    if (r < 0.72) return 'low';
    return 'tall';
  }

  releaseObstacle(entry) {
    entry.active = false;
    this.freeSlot(entry.type, entry.slot);
    this.pool.push(entry);
  }

  removeObstacle(entry) {
    const idx = this.obstacles.indexOf(entry);
    if (idx === -1 || idx >= this._activeCount) return;

    this.releaseObstacle(entry);
    this.obstacles[idx] = this.obstacles[this._activeCount - 1];
    this._activeCount--;
  }

  checkCollision(player, frameMove = 0) {
    const { bottom: playerBottom, top: playerTop } = playerVerticalBounds(player);
    const slidePose = playerInSlidePose(player);
    const slideActive = player.isSlideActive ?? player.isSliding;
    const zWindow = collisionZWindow(player, slidePose);
    const playerZ = slidePose ? playerSlideZOffset(player) : 0;

    for (let i = 0; i < this._activeCount; i++) {
      const obs = this.obstacles[i];
      if (!obs.active) continue;

      const relZ = obs.z - playerZ;
      const prevRelZ = frameMove > 0 ? relZ - frameMove : relZ;
      const inZWindow =
        frameMove > 0
          ? obstacleSweepHitsPlayer(prevRelZ, relZ, zWindow)
          : Math.abs(relZ) <= zWindow;
      if (!inZWindow) continue;
      if (Math.abs(player.x - LANES[obs.lane]) > LANE_MATCH) continue;

      if (obs.slideUnder) {
        const beamBottom = obs.beamBottom ?? obs.bottomY ?? 1.16;
        const beamTop = obs.topY ?? beamBottom + 0.58;
        if (slideActive && playerTop <= beamBottom - CLEARANCE) continue;
        if (playerBottom >= beamTop - CLEARANCE) continue;
        if (player.canVaultGate) continue;
        return obs;
      }

      const hazardBottom = obs.bottomY ?? 0;
      const hazardTop = obs.topY ?? hazardBottom + 0.5;

      if (obs.jumpable && playerBottom >= hazardTop - CLEARANCE) continue;

      if (SPIKE_TYPES.has(obs.type)) {
        return obs;
      }

      const overlapsVertically =
        playerTop > hazardBottom + CLEARANCE && playerBottom < hazardTop - CLEARANCE;
      if (overlapsVertically) return obs;
    }
    return null;
  }

  update(dt, speed, distance) {
    this.difficulty = obstacleDifficultyForDistance(distance) * OBSTACLE_DENSITY_SCALE;
    this.currentSpeed = speed;
    this.runDistance = distance;
    const early = this.isEarlyGame(distance);
    const spawnFloor = early ? 0.44 : this.difficulty >= 1 ? 0.3 : 0.34;
    const spawnCeiling = early ? 1.28 : 1.12;
    const spawnRamp = early ? 0.62 : 0.88;
    this.spawnInterval = Math.max(spawnFloor, spawnCeiling - this.difficulty * spawnRamp);

    this.spawnTimer -= dt;
    const corridorUrgent = this.gapManager?.hasPendingPostGapCorridors() ?? false;
    const droughtDistance = early ? EARLY_DROUGHT_DISTANCE : OBSTACLE_DROUGHT_DISTANCE;
    const drought = distance - this.lastSpawnDistance >= droughtDistance;
    const minNear = early ? EARLY_MIN_NEAR_OBSTACLES : MIN_NEAR_PLAYER_OBSTACLES;
    const sparseNear =
      !early && this.difficulty >= 0.1 && this.countObstaclesNearPlayer() < minNear;
    const lookahead = this.spawnLookaheadForSpeed(speed);
    const minLanes = !early && (drought || sparseNear) && this.difficulty >= 0.1 ? 2 : 0;
    const shouldSpawn =
      this.spawnTimer <= 0 ||
      corridorUrgent ||
      (!early && drought) ||
      sparseNear ||
      this.getFurthestZ() > lookahead;

    if (shouldSpawn) {
      if (!this.spawn({ forceMinLanes: minLanes })) {
        this.nextZ = this.minSpawnAheadZ(speed) - 4;
        this.spawn({ forceMinLanes: minLanes });
      }
    }

    const move = speed * dt;
    let write = 0;

    for (let i = 0; i < this._activeCount; i++) {
      const obs = this.obstacles[i];
      if (!obs.active) continue;

      obs.z += move;
      this.setInstanceMatrix(obs);

      if (obs.z > 8) {
        this.releaseObstacle(obs);
        continue;
      }

      if (write !== i) this.obstacles[write] = obs;
      write++;
    }

    this._activeCount = write;
  }

  reset() {
    for (let i = 0; i < this._activeCount; i++) {
      this.releaseObstacle(this.obstacles[i]);
    }
    this._activeCount = 0;
    this.spawnTimer = 0.5;
    this.nextZ = -55;
    this.difficulty = 0;
    this.currentSpeed = BASE_RUN_SPEED;
    this.runDistance = 0;
    this.lastSpawnDistance = 0;
    this.prefill();
  }
}

export {
  COLLISION_Z,
  OBSTACLE_DIFFICULTY_DISTANCE,
  OBSTACLE_TUTORIAL_END,
};
