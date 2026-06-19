import * as THREE from 'three';
import { LANES } from './scene.js';
import { GAP_MARGIN } from './GapManager.js';

const MAX_COINS = 64;
const COIN_RADIUS = 0.38;
const COIN_THICKNESS = 0.1;
const COIN_COLLECT_Z = 0.55;
const COIN_BOB_CENTER = 0.85;
const COIN_BOB_AMP = 0.12;
const LANE_MATCH = 0.85;

export function pickupWithinPlayerReach(playerY, pickupY, isSliding = false) {
  const feetY = playerY;
  const bottomY = feetY - 0.15;

  if (isSliding && playerY <= 0.25) {
    return pickupY >= bottomY && pickupY <= feetY + 1.15;
  }

  const topY = playerY + 1.55;
  return pickupY >= bottomY && pickupY <= topY + 0.1;
}
const SPAWN_LOOKAHEAD = -90;
const MIN_SPAWN_Z = -115;
const MIN_SPAWN_GAP = 4;
const SPAWN_GAP_VARIANCE = 5;
const SPAWN_INTERVAL = 5.5;
const PREFILL_TARGET = 18;
const PREFILL_MAX_ATTEMPTS = 28;
const GAP_SPAWN_MARGIN = GAP_MARGIN + 1.5;
const NEAR_MARGIN = 2.8;

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const TEMP_POS = new THREE.Vector3();
const TEMP_QUAT = new THREE.Quaternion();
const TEMP_SCALE = new THREE.Vector3(1, 1, 1);
const TEMP_MATRIX = new THREE.Matrix4();

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const SPIN_QUAT = new THREE.Quaternion();

function createCoinTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const cx = 128;
  const cy = 128;

  ctx.fillStyle = '#1a1004';
  ctx.fillRect(0, 0, 256, 256);

  const base = ctx.createRadialGradient(cx - 10, cy - 12, 18, cx, cy, 118);
  base.addColorStop(0, '#fff0a0');
  base.addColorStop(0.35, '#ffd033');
  base.addColorStop(0.78, '#c4880a');
  base.addColorStop(1, '#6b4806');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(cx, cy, 116, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#3d2804';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, 108, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#f5e090';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 114, 0, Math.PI * 2);
  ctx.stroke();

  const inset = ctx.createRadialGradient(cx - 8, cy - 10, 6, cx, cy, 78);
  inset.addColorStop(0, '#1f1404');
  inset.addColorStop(0.45, '#120a02');
  inset.addColorStop(1, '#060402');
  ctx.fillStyle = inset;
  ctx.beginPath();
  ctx.arc(cx, cy, 78, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#c99212';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, 74, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#8a5a08';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#0a0602';
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#d4a017';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI * 2) / 12;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 48, cy + Math.sin(angle) * 48);
    ctx.lineTo(cx + Math.cos(angle) * 56, cy + Math.sin(angle) * 56);
    ctx.stroke();
  }

  ctx.fillStyle = '#e8b020';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 20 : 9;
    const angle = (i * Math.PI) / 4 - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#120a02';
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.arc(cx - 28, cy - 34, 30, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const COIN_GEOMETRY = new THREE.CylinderGeometry(
  COIN_RADIUS,
  COIN_RADIUS,
  COIN_THICKNESS,
  16,
  1,
  false
);
COIN_GEOMETRY.rotateX(Math.PI / 2);

export class CoinManager {
  constructor(scene) {
    this.scene = scene;
    this.coins = [];
    this.pool = [];
    this.spawnTimer = 1.2;
    this.spawnInterval = SPAWN_INTERVAL;
    this.nextZ = -18;
    this._activeCount = 0;
    this.time = 0;
    this.gapManager = null;
    this.obstacleManager = null;
    this.pickupManager = null;

    this.coinTexture = createCoinTexture();
    this.material = new THREE.MeshStandardMaterial({
      map: this.coinTexture,
      color: 0xffffff,
      emissive: 0xffaa22,
      emissiveIntensity: 0.12,
      metalness: 0.65,
      roughness: 0.32,
      fog: true,
    });

    this.mesh = new THREE.InstancedMesh(COIN_GEOMETRY, this.material, MAX_COINS);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.freeSlots = [];
    for (let i = 0; i < MAX_COINS; i++) {
      this.mesh.setMatrixAt(i, HIDDEN_MATRIX);
      this.freeSlots.push(i);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setGapManager(gapManager) {
    this.gapManager = gapManager;
  }

  setObstacleManager(obstacleManager) {
    this.obstacleManager = obstacleManager;
  }

  setPickupManager(pickupManager) {
    this.pickupManager = pickupManager;
  }

  overlapsGap(z) {
    return this.gapManager?.overlapsGapSpan(z, COIN_RADIUS, GAP_SPAWN_MARGIN) ?? false;
  }

  hasCoinNear(z, margin = NEAR_MARGIN) {
    for (let i = 0; i < this._activeCount; i++) {
      const c = this.coins[i];
      if (!c.active) continue;
      if (Math.abs(c.z - z) < margin) return true;
    }
    return false;
  }

  hasCoinOverlappingGap(gapCenterZ, gapWidth, margin = GAP_SPAWN_MARGIN) {
    const gapStart = gapCenterZ - gapWidth / 2 - margin;
    const gapEnd = gapCenterZ + gapWidth / 2 + margin;

    for (let i = 0; i < this._activeCount; i++) {
      const c = this.coins[i];
      if (!c.active) continue;
      if (c.z >= gapStart && c.z <= gapEnd) return true;
    }
    return false;
  }

  isBlockedPosition(z) {
    if (this.overlapsGap(z)) return true;
    if (this.obstacleManager?.hasObstacleNear(z, 3)) return true;
    if (this.pickupManager?.hasPickupNear(z, 4)) return true;
    if (this.hasCoinNear(z, NEAR_MARGIN)) return true;
    return false;
  }

  getFurthestZ() {
    let furthest = 0;
    for (let i = 0; i < this._activeCount; i++) {
      const c = this.coins[i];
      if (!c.active) continue;
      if (c.z < furthest) furthest = c.z;
    }
    return furthest;
  }

  allocSlot() {
    if (this.freeSlots.length === 0) return null;
    return this.freeSlots.pop();
  }

  freeSlot(slot) {
    this.mesh.setMatrixAt(slot, HIDDEN_MATRIX);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.freeSlots.push(slot);
  }

  setInstanceMatrix(entry) {
    const bob = COIN_BOB_CENTER + Math.sin(this.time * 5 + entry.phase) * COIN_BOB_AMP;
    entry.y = bob;
    const spin = this.time * 4 + entry.phase;

    TEMP_POS.set(LANES[entry.lane], bob, entry.z);
    SPIN_QUAT.setFromAxisAngle(WORLD_UP, spin);
    TEMP_QUAT.copy(SPIN_QUAT);
    TEMP_SCALE.set(1, 1, 1);
    TEMP_MATRIX.compose(TEMP_POS, TEMP_QUAT, TEMP_SCALE);
    this.mesh.setMatrixAt(entry.slot, TEMP_MATRIX);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  acquireCoin(lane, z) {
    const slot = this.allocSlot();
    if (slot === null) return false;

    let entry = this.pool.pop();
    if (entry) {
      entry.lane = lane;
      entry.z = z;
      entry.slot = slot;
      entry.active = true;
      entry.phase = Math.random() * Math.PI * 2;
      entry.y = COIN_BOB_CENTER;
    } else {
      entry = {
        lane,
        z,
        slot,
        active: true,
        phase: Math.random() * Math.PI * 2,
        y: COIN_BOB_CENTER,
      };
    }

    this.setInstanceMatrix(entry);

    if (this._activeCount < this.coins.length) {
      this.coins[this._activeCount] = entry;
    } else {
      this.coins.push(entry);
    }
    this._activeCount++;
    return true;
  }

  spawnCluster() {
    if (this.isBlockedPosition(this.nextZ)) {
      for (let scan = 0; scan < 10; scan++) {
        this.nextZ -= 2.5;
        if (!this.isBlockedPosition(this.nextZ)) break;
      }
      this.spawnTimer = 0.35;
      return;
    }

    const clusterSize = Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 2) : 1;
    const baseLane = Math.floor(Math.random() * 3);
    let placed = 0;

    for (let i = 0; i < clusterSize; i++) {
      const lane =
        clusterSize === 1
          ? baseLane
          : Math.min(2, Math.max(0, baseLane + (i === 0 ? 0 : i === 1 ? 1 : -1)));
      const z = this.nextZ - i * 1.4;
      if (this.isBlockedPosition(z)) continue;
      if (this.acquireCoin(lane, z)) placed++;
    }

    if (placed === 0) {
      this.spawnTimer = 0.35;
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
      this.spawnCluster();
      if (this._activeCount > before) placed++;
      attempts++;
    }
  }

  releaseCoin(entry) {
    entry.active = false;
    this.freeSlot(entry.slot);
    this.pool.push(entry);
  }

  removeCoin(entry) {
    const idx = this.coins.indexOf(entry);
    if (idx === -1 || idx >= this._activeCount) return;

    this.releaseCoin(entry);
    this.coins[idx] = this.coins[this._activeCount - 1];
    this._activeCount--;
  }

  checkCollection(playerX, playerLane, playerY = 0, isSliding = false) {
    for (let i = 0; i < this._activeCount; i++) {
      const c = this.coins[i];
      if (!c.active) continue;
      if (Math.abs(c.z) > COIN_COLLECT_Z) continue;
      if (c.lane !== playerLane) continue;
      if (Math.abs(playerX - LANES[c.lane]) > LANE_MATCH) continue;
      const coinY = c.y ?? COIN_BOB_CENTER;
      if (!pickupWithinPlayerReach(playerY, coinY, isSliding)) continue;
      return c;
    }
    return null;
  }

  update(dt, speed) {
    this.time += dt;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 || this.getFurthestZ() > SPAWN_LOOKAHEAD) {
      this.spawnCluster();
    }

    const move = speed * dt;
    let write = 0;

    for (let i = 0; i < this._activeCount; i++) {
      const c = this.coins[i];
      if (!c.active) continue;

      c.z += move;

      if (this.overlapsGap(c.z)) {
        this.releaseCoin(c);
        continue;
      }

      this.setInstanceMatrix(c);

      if (c.z > 8) {
        this.releaseCoin(c);
        continue;
      }

      if (write !== i) this.coins[write] = c;
      write++;
    }

    this._activeCount = write;
  }

  reset() {
    for (let i = 0; i < this._activeCount; i++) {
      this.releaseCoin(this.coins[i]);
    }
    this._activeCount = 0;
    this.spawnTimer = 1.2;
    this.nextZ = -18;
    this.time = 0;
    this.prefill();
  }
}
