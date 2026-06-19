import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANES, LANE_WIDTH } from './scene.js';
import { GAP_MARGIN } from './GapManager.js';

const OBSTACLE_DEFS = {
  low: { height: 1.05, meshY: 0.525, jumpable: true, slideUnder: false },
  barrier: { height: 1.2, meshY: 0.6, jumpable: true, slideUnder: false },
  tall: { height: 3.4, meshY: 1.7, jumpable: false, slideUnder: false },
  overhead: {
    height: 0.32,
    clearance: 1.22,
    meshY: 0,
    jumpable: false,
    slideUnder: true,
    beamSpan: LANE_WIDTH + 0.15,
  },
};

const OBSTACLE_TYPES = Object.keys(OBSTACLE_DEFS);
const SPIKE_TYPES = new Set(['low', 'tall']);
const MAX_PER_TYPE = 24;
const COLLISION_Z = 0.45;
const CLEARANCE = 0.12;
const LANE_MATCH = 0.85;

/** True when obstacle z-range this frame crossed the player plane (z=0). */
export function obstacleSweepHitsPlayer(prevZ, z, window = COLLISION_Z) {
  return prevZ <= window && z >= -window;
}

function playerHitbox(player) {
  if (player.hitbox) return player.hitbox;

  const sliding = player.isSliding || (player.slideBlend ?? 0) > 0.35;
  if (sliding) {
    return { y: player.y + 0.35, height: 0.62 };
  }
  return { y: player.y + 0.9, height: 1.6 };
}

function playerVerticalBounds(player) {
  const hb = playerHitbox(player);
  const half = hb.height / 2;
  return { bottom: hb.y - half, top: hb.y + half };
}

const SPAWN_LOOKAHEAD = -110;
const MIN_SPAWN_Z = -130;

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
    barrier: { a: '#1e1828', b: '#322c42', c: '#4a4260', d: '#14101c' },
    low: { a: '#686098', b: '#8278b0', c: '#9c94c8', d: '#504870' },
    tall: { a: '#605888', b: '#7a70a0', c: '#948cb8', d: '#484068' },
    overhead: { a: '#1a1626', b: '#2e2840', c: '#464060', d: '#100e18' },
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

  ctx.strokeStyle = isSpike ? 'rgba(80, 70, 120, 0.22)' : 'rgba(10, 8, 16, 0.55)';
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
    ctx.strokeStyle = 'rgba(160, 130, 220, 0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(128, 52);
    ctx.lineTo(168, 148);
    ctx.lineTo(128, 204);
    ctx.lineTo(88, 148);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'rgba(120, 90, 180, 0.12)';
    ctx.fill();
  }

  if (variant === 'overhead') {
    const glow = ctx.createLinearGradient(0, 200, 0, 256);
    glow.addColorStop(0, 'rgba(140, 100, 220, 0)');
    glow.addColorStop(0.55, 'rgba(160, 120, 255, 0.35)');
    glow.addColorStop(1, 'rgba(200, 160, 255, 0.55)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 190, 256, 66);
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
    barrier: { color: 0x443366, intensity: 0.1, tint: 0xffffff, roughness: 0.9 },
    low: { color: 0x9988dd, intensity: 0.22, tint: 0xe8e2ff, roughness: 0.68 },
    tall: { color: 0x8877cc, intensity: 0.18, tint: 0xe0daf8, roughness: 0.72 },
    spikeBase: { color: 0x443355, intensity: 0.06, tint: 0xb0a8c8, roughness: 0.88 },
    overhead: { color: 0x554488, intensity: 0.14, tint: 0xffffff, roughness: 0.9 },
  };
  const em = emissiveByVariant[variant] ?? emissiveByVariant.barrier;

  return new THREE.MeshStandardMaterial({
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

function buildOverheadGateGeometry(def) {
  const beamW = def.beamSpan ?? LANE_WIDTH + 0.15;
  const beamH = def.height;
  const beamBottom = def.clearance ?? 1.22;
  const beamY = beamBottom + beamH / 2;
  const postH = beamBottom;
  const postW = 0.22;
  const postD = 0.52;
  const parts = [];

  const sill = new THREE.BoxGeometry(beamW, 0.1, 0.48);
  sill.translate(0, 0.05, 0);
  parts.push(sill);

  for (const x of [-beamW / 2 + postW / 2, beamW / 2 - postW / 2]) {
    const foot = new THREE.BoxGeometry(postW * 1.7, 0.08, postD * 1.15);
    foot.translate(x, 0.04, 0);
    parts.push(foot);

    const post = new THREE.BoxGeometry(postW, postH, postD);
    post.translate(x, postH / 2, 0);
    parts.push(post);
  }

  const beam = new THREE.BoxGeometry(beamW, beamH, 0.58);
  beam.translate(0, beamY, 0);
  parts.push(beam);

  const keystone = new THREE.BoxGeometry(0.42, 0.24, 0.64);
  keystone.translate(0, beamY + beamH / 2 + 0.1, 0);
  parts.push(keystone);

  const lip = new THREE.BoxGeometry(beamW * 0.94, 0.1, 0.62);
  lip.translate(0, beamBottom - 0.04, 0);
  parts.push(lip);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function obstacleTopY(type, def) {
  if (type === 'overhead') {
    return (def.clearance ?? 1.22) + def.height;
  }
  return def.meshY + def.height / 2;
}

function obstacleBeamBottom(type, def) {
  if (type === 'overhead') return def.clearance ?? 1.22;
  return null;
}

function buildObstacleGeometry(type, def) {
  if (type === 'barrier') {
    return buildBarrierGeometry(def);
  }

  if (type === 'overhead') {
    return buildOverheadGateGeometry(def);
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
      mesh.castShadow = true;
      mesh.frustumCulled = false;

      if (SPIKE_TYPES.has(type)) {
        const baseMesh = new THREE.InstancedMesh(
          buildSpikeBaseGeometry(type, def),
          this.baseMaterial,
          MAX_PER_TYPE
        );
        baseMesh.castShadow = true;
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

  isBlockedPosition(z) {
    if (this.gapManager?.isGapNear(z, GAP_MARGIN)) return true;
    return this.hasObstacleNear(z, 5);
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
    while (this.nextZ > MIN_SPAWN_Z && attempts < 16) {
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
    const anchorY = entry.type === 'overhead' ? 0 : def.meshY;
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
    if (slot === null) return;

    const def = OBSTACLE_DEFS[type];
    let entry = this.pool.pop();

    if (entry) {
      entry.type = type;
      entry.lane = lane;
      entry.z = z;
      entry.slot = slot;
      entry.topY = obstacleTopY(type, def);
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
        topY: obstacleTopY(type, def),
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
  }

  spawn() {
    if (this.isBlockedPosition(this.nextZ)) {
      this.nextZ -= 3;
      this.spawnTimer = 0.25;
      return;
    }

    const type = this.pickType();
    const lane = Math.floor(Math.random() * 3);
    this.acquireObstacle(type, lane, this.nextZ);

    this.nextZ -= 8 + Math.random() * 6;
    this.spawnTimer = this.spawnInterval;
  }

  pickType() {
    const r = Math.random();

    if (this.difficulty < 0.12) {
      return r < 0.55 ? 'barrier' : 'low';
    }

    if (this.difficulty < 0.35) {
      if (r < 0.14) return 'overhead';
      if (r < 0.62) return 'barrier';
      return 'low';
    }

    if (this.difficulty < 0.6) {
      if (r < 0.2) return 'overhead';
      if (r < 0.48) return 'barrier';
      if (r < 0.78) return 'low';
      return 'tall';
    }

    if (r < 0.24) return 'overhead';
    if (r < 0.5) return 'barrier';
    if (r < 0.74) return 'low';
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
    const slideActive = player.isSlideActive ?? player.isSliding;

    for (let i = 0; i < this._activeCount; i++) {
      const obs = this.obstacles[i];
      if (!obs.active) continue;

      const prevZ = frameMove > 0 ? obs.z - frameMove : obs.z;
      const inZWindow =
        frameMove > 0
          ? obstacleSweepHitsPlayer(prevZ, obs.z)
          : Math.abs(obs.z) <= COLLISION_Z;
      if (!inZWindow) continue;
      if (Math.abs(player.x - LANES[obs.lane]) > LANE_MATCH) continue;

      if (obs.slideUnder) {
        const beamBottom = obs.beamBottom ?? 1.22;
        if (slideActive && playerTop <= beamBottom - CLEARANCE) continue;
        if (playerBottom >= beamBottom - CLEARANCE) continue;
        return obs;
      }

      if (obs.jumpable && playerBottom >= obs.topY - CLEARANCE) continue;

      return obs;
    }
    return null;
  }

  update(dt, speed, distance) {
    this.difficulty = Math.min(1, distance / 500);
    this.spawnInterval = Math.max(0.9, 1.8 - this.difficulty * 0.7);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 || this.getFurthestZ() > SPAWN_LOOKAHEAD) {
      this.spawn();
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
    this.prefill();
  }
}

export { COLLISION_Z };
