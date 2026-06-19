import * as THREE from 'three';
import { LANES } from './scene.js';
import { GAP_MARGIN } from './GapManager.js';

const MAX_COINS = 64;
const COIN_RADIUS = 0.38;
const COIN_THICKNESS = 0.1;
const COIN_COLLECT_Z = 0.55;
const LANE_MATCH = 0.85;
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
const COIN_UP = new THREE.Vector3(0, 1, 0);

function createCoinTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const cx = 64;
  const cy = 64;

  const rim = ctx.createRadialGradient(cx, cy, 44, cx, cy, 58);
  rim.addColorStop(0, '#ffd54a');
  rim.addColorStop(0.7, '#e6a820');
  rim.addColorStop(1, '#9a6b10');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(cx, cy, 58, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff4a8';
  ctx.beginPath();
  ctx.arc(cx, cy, 38, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#c8860a';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const x = cx + Math.cos(angle) * 22;
    const y = cy + Math.sin(angle) * 22;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 240, 180, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 52, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const COIN_GEOMETRY = new THREE.CylinderGeometry(
  COIN_RADIUS,
  COIN_RADIUS,
  COIN_THICKNESS,
  20,
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
      color: 0xffd966,
      emissive: 0xffaa22,
      emissiveIntensity: 0.45,
      metalness: 0.65,
      roughness: 0.35,
      fog: true,
    });

    this.mesh = new THREE.InstancedMesh(COIN_GEOMETRY, this.material, MAX_COINS);
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
    const bob = 0.85 + Math.sin(this.time * 5 + entry.phase) * 0.12;
    const spin = this.time * 4 + entry.phase;

    TEMP_POS.set(LANES[entry.lane], bob, entry.z);
    TEMP_QUAT.setFromAxisAngle(COIN_UP, spin);
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
    } else {
      entry = {
        lane,
        z,
        slot,
        active: true,
        phase: Math.random() * Math.PI * 2,
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

  checkCollection(playerX, playerLane) {
    for (let i = 0; i < this._activeCount; i++) {
      const c = this.coins[i];
      if (!c.active) continue;
      if (Math.abs(c.z) > COIN_COLLECT_Z) continue;
      if (c.lane !== playerLane) continue;
      if (Math.abs(playerX - LANES[c.lane]) > LANE_MATCH) continue;
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
