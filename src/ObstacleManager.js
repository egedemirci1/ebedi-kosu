import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANES, LANE_WIDTH } from './scene.js';
import { GAP_MARGIN } from './GapManager.js';

const OBSTACLE_DEFS = {
  low: { height: 1.05, meshY: 0.525, jumpable: true, slideUnder: false },
  barrier: { height: 1.2, meshY: 0.6, jumpable: true, slideUnder: false },
  tall: { height: 3.4, meshY: 1.7, jumpable: false, slideUnder: false },
  overhead: { height: 0.4, meshY: 2.05, jumpable: false, slideUnder: true },
};

const OBSTACLE_TYPES = Object.keys(OBSTACLE_DEFS);
const MAX_PER_TYPE = 24;
const COLLISION_Z = 0.45;
const CLEARANCE = 0.12;
const LANE_MATCH = 0.85;

const SPAWN_LOOKAHEAD = -110;
const MIN_SPAWN_Z = -130;

const HIDDEN_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
const TEMP_POS = new THREE.Vector3();
const TEMP_QUAT = new THREE.Quaternion();
const TEMP_SCALE = new THREE.Vector3(1, 1, 1);
const TEMP_MATRIX = new THREE.Matrix4();

function buildSpikeClusterGeo(height, spikes) {
  const baseY = -height / 2;
  const parts = spikes.map(({ x, z, h, r }) => {
    const cone = new THREE.ConeGeometry(r, h, 4);
    cone.translate(x, baseY + h / 2, z);
    return cone;
  });
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildObstacleGeometry(type, def) {
  if (type === 'barrier') {
    return new THREE.BoxGeometry(1.6, def.height, 0.5);
  }

  if (type === 'overhead') {
    return new THREE.BoxGeometry(LANE_WIDTH + 0.35, def.height, 0.55);
  }

  if (type === 'low') {
    return buildSpikeClusterGeo(def.height, [
      { x: 0, z: 0, h: 1.02, r: 0.13 },
      { x: -0.38, z: 0.06, h: 0.88, r: 0.1 },
      { x: 0.34, z: -0.1, h: 0.95, r: 0.11 },
      { x: -0.12, z: -0.14, h: 0.78, r: 0.09 },
      { x: 0.22, z: 0.12, h: 0.9, r: 0.1 },
    ]);
  }

  return buildSpikeClusterGeo(def.height, [
    { x: -0.45, z: 0, h: 3.15, r: 0.17 },
    { x: -0.12, z: 0.08, h: 3.4, r: 0.19 },
    { x: 0.28, z: -0.06, h: 2.95, r: 0.16 },
    { x: 0.52, z: 0.05, h: 3.25, r: 0.18 },
  ]);
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
    this.materials = {
      barrier: new THREE.MeshStandardMaterial({
        color: 0xff6644,
        emissive: 0x441100,
        emissiveIntensity: 0.5,
        roughness: 0.5,
        fog: false,
      }),
      low: new THREE.MeshStandardMaterial({
        color: 0xffaa22,
        emissive: 0x442200,
        emissiveIntensity: 0.4,
        roughness: 0.5,
        fog: false,
      }),
      tall: new THREE.MeshStandardMaterial({
        color: 0xcc2244,
        emissive: 0x440011,
        emissiveIntensity: 0.5,
        roughness: 0.5,
        fog: false,
      }),
      overhead: new THREE.MeshStandardMaterial({
        color: 0xff88cc,
        emissive: 0x440022,
        emissiveIntensity: 0.45,
        roughness: 0.45,
        fog: false,
      }),
    };

    this.instancedMeshes = {};
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
    this.freeSlots[type].push(slot);
  }

  setInstanceMatrix(entry) {
    const def = OBSTACLE_DEFS[entry.type];
    TEMP_POS.set(LANES[entry.lane], def.meshY, entry.z);
    TEMP_MATRIX.compose(TEMP_POS, TEMP_QUAT, TEMP_SCALE);
    const mesh = this.instancedMeshes[entry.type];
    mesh.setMatrixAt(entry.slot, TEMP_MATRIX);
    mesh.instanceMatrix.needsUpdate = true;
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
      entry.topY = def.meshY + def.height / 2;
      entry.jumpable = def.jumpable;
      entry.slideUnder = def.slideUnder ?? false;
      entry.active = true;
    } else {
      entry = {
        type,
        lane,
        z,
        slot,
        topY: def.meshY + def.height / 2,
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
    if (this.difficulty < 0.3) return r < 0.6 ? 'barrier' : 'low';
    if (this.difficulty < 0.6) {
      if (r < 0.4) return 'barrier';
      if (r < 0.75) return 'low';
      return 'tall';
    }
    return OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
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

  checkCollision(player) {
    const feetY = player.y;

    for (let i = 0; i < this._activeCount; i++) {
      const obs = this.obstacles[i];
      if (!obs.active) continue;
      if (Math.abs(obs.z) > COLLISION_Z) continue;
      if (Math.abs(player.x - LANES[obs.lane]) > LANE_MATCH) continue;

      if (obs.slideUnder) {
        if (player.isSliding) continue;
        return obs;
      }

      if (obs.jumpable && feetY >= obs.topY - CLEARANCE) continue;

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
