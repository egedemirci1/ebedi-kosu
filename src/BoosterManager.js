import * as THREE from 'three';
import { LANES, LANE_WIDTH } from './scene.js';
import { GAP_MARGIN } from './GapManager.js';
import { pickupWithinPlayerReach } from './CoinManager.js';

export const BOOSTER_TYPES = ['ghost', 'jump', 'speed'];

const MAX_PER_TYPE = 16;
const PAD_LENGTH = 3.6;
const PAD_HALF = PAD_LENGTH / 2;
const FLOATING_Y_CENTER = 0.95;
const FLOATING_Y_AMP = 0.14;
const SPEED_PAD_Y = 0.03;
const FLOATING_COLLECT_Z = 0.55;
const FLOATING_SIGN_WIDTH = 1.14;
const FLOATING_SIGN_HEIGHT = 1.58;
const PAD_TYPES = ['speed'];
const FLOATING_TYPES = ['ghost', 'jump'];
const LANE_MATCH = 0.85;
const SPAWN_LOOKAHEAD = -95;
const MIN_SPAWN_Z = -120;
const MIN_SPAWN_GAP = 20;
const SPAWN_GAP_VARIANCE = 14;
const SPAWN_INTERVAL = 22;
const PREFILL_TARGET = 5;
const PREFILL_MAX_ATTEMPTS = 20;
const GAP_SPAWN_MARGIN = GAP_MARGIN + 2;

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const TEMP_POS = new THREE.Vector3();
const TEMP_QUAT = new THREE.Quaternion();
const TEMP_SCALE = new THREE.Vector3(1, 1, 1);
const TEMP_MATRIX = new THREE.Matrix4();

const PAD_GEOMETRY = new THREE.BoxGeometry(LANE_WIDTH + 0.1, 0.06, PAD_LENGTH);

function finalizePadTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1.2);
  return texture;
}

function drawPadFrame(ctx, strokeColor) {
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 4, 92, 248);
}

function createSpeedPadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#141018';
  ctx.fillRect(0, 0, 128, 256);

  ctx.fillStyle = 'rgba(255, 140, 40, 0.12)';
  ctx.fillRect(44, 0, 40, 256);

  for (let row = 0; row < 10; row++) {
    const y = row * 26 + 4;
    ctx.fillStyle = row % 2 === 0 ? 'rgba(255, 170, 60, 0.55)' : 'rgba(255, 120, 30, 0.35)';
    ctx.beginPath();
    ctx.moveTo(20, y + 18);
    ctx.lineTo(64, y);
    ctx.lineTo(108, y + 18);
    ctx.lineTo(64, y + 10);
    ctx.closePath();
    ctx.fill();
  }

  drawPadFrame(ctx, 'rgba(255, 210, 120, 0.45)');
  return finalizePadTexture(canvas);
}

function drawUpChevron(ctx, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy + size * 0.55);
  ctx.lineTo(cx, cy - size * 0.45);
  ctx.lineTo(cx + size, cy + size * 0.55);
  ctx.lineTo(cx, cy + size * 0.05);
  ctx.closePath();
  ctx.fill();
}

function createJumpArrowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 256);

  const glow = ctx.createRadialGradient(128, 130, 16, 128, 120, 108);
  glow.addColorStop(0, 'rgba(140, 255, 90, 0.4)');
  glow.addColorStop(1, 'rgba(140, 255, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);

  drawUpChevron(ctx, 128, 192, 68, 'rgba(80, 200, 50, 0.35)');
  drawUpChevron(ctx, 128, 148, 58, 'rgba(110, 240, 70, 0.55)');
  drawUpChevron(ctx, 128, 104, 52, 'rgba(170, 255, 120, 0.92)');

  ctx.fillStyle = 'rgba(150, 255, 110, 0.75)';
  ctx.fillRect(112, 188, 32, 48);

  ctx.strokeStyle = 'rgba(210, 255, 170, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(64, 48, 128, 176);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawGhostSilhouette(ctx, cx, cy, scale) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  ctx.fillStyle = 'rgba(180, 245, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(0, -8, 18, Math.PI, 0);
  ctx.lineTo(18, 16);
  for (let i = 0; i < 4; i++) {
    const x0 = 18 - i * 12;
    const x1 = 12 - i * 12;
    ctx.quadraticCurveTo(x0 - 3, 22, x1, 16);
  }
  ctx.lineTo(-18, 16);
  ctx.lineTo(-18, -8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(12, 30, 40, 0.85)';
  ctx.beginPath();
  ctx.arc(-7, -6, 3.2, 0, Math.PI * 2);
  ctx.arc(7, -6, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function createGhostSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 256);

  const glow = ctx.createRadialGradient(128, 130, 16, 128, 120, 108);
  glow.addColorStop(0, 'rgba(100, 220, 255, 0.45)');
  glow.addColorStop(1, 'rgba(100, 220, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(120, 230, 255, ${0.18 + i * 0.07})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 60; x <= 196; x += 5) {
      const y = 198 + i * 7 + Math.sin(x * 0.08 + i) * 6;
      if (x === 60) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawGhostSilhouette(ctx, 128, 116, 2.85);

  ctx.strokeStyle = 'rgba(160, 240, 255, 0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(64, 48, 128, 176);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const FLOATING_TEXTURE_FACTORIES = {
  ghost: createGhostSignTexture,
  jump: createJumpArrowTexture,
};

const PAD_TEXTURE_FACTORIES = {
  speed: createSpeedPadTexture,
};
export class BoosterManager {
  constructor(scene) {
    this.scene = scene;
    this.pickups = [];
    this.pool = [];
    this.spawnTimer = 2.5;
    this.spawnInterval = SPAWN_INTERVAL;
    this.nextZ = -42;
    this._activeCount = 0;
    this.gapManager = null;
    this.obstacleManager = null;
    this.boosterEffects = null;
    this.coinManager = null;
    this.onCollect = null;
    this.time = 0;

    this.instancedMeshes = {};
    this.freeSlots = {};
    this.materials = {};

    this.padTextures = {};

    for (const type of PAD_TYPES) {
      const texture = PAD_TEXTURE_FACTORIES[type]();
      this.padTextures[type] = texture;
      this.materials[type] = new THREE.MeshBasicMaterial({
        map: texture,
        fog: true,
        transparent: true,
        opacity: 0.92,
      });

      const mesh = new THREE.InstancedMesh(PAD_GEOMETRY, this.materials[type], MAX_PER_TYPE);
      mesh.frustumCulled = false;
      scene.add(mesh);

      this.instancedMeshes[type] = mesh;
      this.freeSlots[type] = [];

      for (let i = 0; i < MAX_PER_TYPE; i++) {
        mesh.setMatrixAt(i, HIDDEN_MATRIX);
        this.freeSlots[type].push(i);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    for (const type of FLOATING_TYPES) {
      this.materials[type] = new THREE.MeshBasicMaterial({
        map: FLOATING_TEXTURE_FACTORIES[type](),
        fog: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(FLOATING_SIGN_WIDTH, FLOATING_SIGN_HEIGHT),
        this.materials[type],
        MAX_PER_TYPE
      );
      mesh.frustumCulled = false;
      scene.add(mesh);

      this.instancedMeshes[type] = mesh;
      this.freeSlots[type] = [];

      for (let i = 0; i < MAX_PER_TYPE; i++) {
        mesh.setMatrixAt(i, HIDDEN_MATRIX);
        this.freeSlots[type].push(i);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  setGapManager(gapManager) {
    this.gapManager = gapManager;
  }

  setObstacleManager(obstacleManager) {
    this.obstacleManager = obstacleManager;
  }

  setBoosterEffects(boosterEffects) {
    this.boosterEffects = boosterEffects;
  }

  setCoinManager(coinManager) {
    this.coinManager = coinManager;
  }

  /** Block spawn only while the player still holds that booster effect. */
  isTypeSpawnBlocked(type) {
    if (!this.boosterEffects) return false;

    switch (type) {
      case 'jump':
        return this.boosterEffects.isSuperJumpActive();
      case 'ghost':
        return this.boosterEffects.isGhostActive();
      case 'speed':
        return this.boosterEffects.isSpeedActive();
      default:
        return false;
    }
  }

  getSpawnableTypes() {
    return BOOSTER_TYPES.filter((type) => !this.isTypeSpawnBlocked(type));
  }

  overlapsGap(z) {
    return this.gapManager?.overlapsGapSpan(z, PAD_HALF, GAP_SPAWN_MARGIN) ?? false;
  }

  isBlockedPosition(z) {
    if (this.overlapsGap(z)) return true;
    if (this.obstacleManager?.hasObstacleNear(z, 4)) return true;
    if (this.hasPickupNear(z, 5)) return true;
    if (this.coinManager?.hasCoinNear(z, 4)) return true;
    return false;
  }

  hasPickupOverlappingGap(gapCenterZ, gapWidth, margin = GAP_SPAWN_MARGIN) {
    const gapStart = gapCenterZ - gapWidth / 2 - margin;
    const gapEnd = gapCenterZ + gapWidth / 2 + margin;

    for (let i = 0; i < this._activeCount; i++) {
      const p = this.pickups[i];
      if (!p.active) continue;
      const pickupStart = p.z - PAD_HALF;
      const pickupEnd = p.z + PAD_HALF;
      if (pickupEnd >= gapStart && pickupStart <= gapEnd) return true;
    }
    return false;
  }

  hasPickupNear(z, margin = 4) {
    for (let i = 0; i < this._activeCount; i++) {
      const p = this.pickups[i];
      if (!p.active) continue;
      if (Math.abs(p.z - z) < margin) return true;
    }
    return false;
  }

  getFurthestZ() {
    let furthest = 0;
    for (let i = 0; i < this._activeCount; i++) {
      const p = this.pickups[i];
      if (!p.active) continue;
      if (p.z < furthest) furthest = p.z;
    }
    return furthest;
  }

  allocSlot(type) {
    const slots = this.freeSlots[type];
    if (slots.length === 0) return null;
    return slots.pop();
  }

  freeSlot(type, slot) {
    this.instancedMeshes[type].setMatrixAt(slot, HIDDEN_MATRIX);
    this.instancedMeshes[type].instanceMatrix.needsUpdate = true;
    this.freeSlots[type].push(slot);
  }

  setInstanceMatrix(entry) {
    const pulse = 0.88 + Math.sin(this.time * 6 + entry.phase) * 0.12;

    if (entry.type === 'speed') {
      entry.y = SPEED_PAD_Y;
      TEMP_POS.set(LANES[entry.lane], SPEED_PAD_Y, entry.z);
      TEMP_QUAT.identity();
      TEMP_SCALE.set(1, 1, 1);
      TEMP_MATRIX.compose(TEMP_POS, TEMP_QUAT, TEMP_SCALE);
      this.materials.speed.opacity = pulse;
    } else {
      const floatY = FLOATING_Y_CENTER + Math.sin(this.time * 4 + entry.phase) * FLOATING_Y_AMP;
      entry.y = floatY;
      const scale = 1 + Math.sin(this.time * 5 + entry.phase) * 0.06;
      TEMP_POS.set(LANES[entry.lane], floatY, entry.z);
      TEMP_QUAT.identity();
      TEMP_SCALE.set(scale, scale, 1);
      TEMP_MATRIX.compose(TEMP_POS, TEMP_QUAT, TEMP_SCALE);
      this.materials[entry.type].opacity = pulse;
    }

    this.instancedMeshes[entry.type].setMatrixAt(entry.slot, TEMP_MATRIX);
    this.instancedMeshes[entry.type].instanceMatrix.needsUpdate = true;
  }
  acquirePickup(type, lane, z) {
    const slot = this.allocSlot(type);
    if (slot === null) return;

    let entry = this.pool.pop();
    if (entry) {
      entry.type = type;
      entry.lane = lane;
      entry.z = z;
      entry.slot = slot;
      entry.active = true;
      entry.phase = Math.random() * Math.PI * 2;
    } else {
      entry = {
        type,
        lane,
        z,
        slot,
        active: true,
        phase: Math.random() * Math.PI * 2,
      };
    }
    this.setInstanceMatrix(entry);

    if (this._activeCount < this.pickups.length) {
      this.pickups[this._activeCount] = entry;
    } else {
      this.pickups.push(entry);
    }
    this._activeCount++;
  }

  pickType() {
    const available = this.getSpawnableTypes();
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  spawn() {
    if (this.isBlockedPosition(this.nextZ)) {
      for (let scan = 0; scan < 12; scan++) {
        this.nextZ -= 4;
        if (!this.isBlockedPosition(this.nextZ)) break;
      }
      this.spawnTimer = 0.6;
      return;
    }

    const type = this.pickType();
    if (!type) {
      this.spawnTimer = 1.5;
      return;
    }

    const lane = Math.floor(Math.random() * 3);
    const before = this._activeCount;
    this.acquirePickup(type, lane, this.nextZ);
    if (this._activeCount === before) {
      this.spawnTimer = 0.6;
      return;
    }

    this.nextZ -= MIN_SPAWN_GAP + Math.random() * SPAWN_GAP_VARIANCE;
    this.spawnTimer = this.spawnInterval;
  }

  prefill() {
    let placed = 0;
    let attempts = 0;
    while (placed < PREFILL_TARGET && this.nextZ > MIN_SPAWN_Z && attempts < PREFILL_MAX_ATTEMPTS) {
      const before = this._activeCount;
      this.spawn();
      if (this._activeCount > before) placed++;
      attempts++;
    }
  }

  releasePickup(entry) {
    entry.active = false;
    this.freeSlot(entry.type, entry.slot);
    this.pool.push(entry);
  }

  removePickup(entry) {
    const idx = this.pickups.indexOf(entry);
    if (idx === -1 || idx >= this._activeCount) return;

    this.releasePickup(entry);
    this.pickups[idx] = this.pickups[this._activeCount - 1];
    this._activeCount--;
  }

  checkCollection(playerX, playerLane, playerY = 0, isSliding = false) {
    for (let i = 0; i < this._activeCount; i++) {
      const p = this.pickups[i];
      if (!p.active) continue;

      const collectZ = p.type === 'speed' ? PAD_HALF + 0.25 : FLOATING_COLLECT_Z;
      if (Math.abs(p.z) > collectZ) continue;
      if (p.lane !== playerLane) continue;
      if (Math.abs(playerX - LANES[p.lane]) > LANE_MATCH) continue;

      const pickupY = p.y ?? (p.type === 'speed' ? SPEED_PAD_Y : FLOATING_Y_CENTER);
      if (!pickupWithinPlayerReach(playerY, pickupY, isSliding)) continue;

      return p;
    }
    return null;
  }

  update(dt, speed) {
    this.time += dt;
    for (const type of PAD_TYPES) {
      this.padTextures[type].offset.y -= dt * 1.8;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 || this.getFurthestZ() > SPAWN_LOOKAHEAD) {
      this.spawn();
    }

    const move = speed * dt;
    let write = 0;

    for (let i = 0; i < this._activeCount; i++) {
      const p = this.pickups[i];
      if (!p.active) continue;

      p.z += move;

      if (this.overlapsGap(p.z)) {
        this.releasePickup(p);
        continue;
      }

      this.setInstanceMatrix(p);

      if (p.z > 8) {
        this.releasePickup(p);
        continue;
      }

      if (write !== i) this.pickups[write] = p;
      write++;
    }

    this._activeCount = write;
  }

  reset() {
    for (let i = 0; i < this._activeCount; i++) {
      this.releasePickup(this.pickups[i]);
    }
    this._activeCount = 0;
    this.spawnTimer = 2.5;
    this.nextZ = -42;
    this.time = 0;
    for (const type of PAD_TYPES) {
      this.padTextures[type].offset.y = 0;
    }
    this.prefill();
  }
}
