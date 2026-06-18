import * as THREE from 'three';
import { LANES } from './scene.js';
import { GAP_MARGIN } from './GapManager.js';

const OBSTACLE_DEFS = {
  low: { height: 0.5, meshY: 0.25, jumpable: true },
  barrier: { height: 1.2, meshY: 0.6, jumpable: true },
  tall: { height: 2.2, meshY: 1.1, jumpable: false },
};

const OBSTACLE_TYPES = Object.keys(OBSTACLE_DEFS);
const COLLISION_Z = 0.45;
const CLEARANCE = 0.12;
const LANE_MATCH = 0.85;

const SPAWN_LOOKAHEAD = -110;
const MIN_SPAWN_Z = -130;

export class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    this.obstacles = [];
    this.spawnTimer = 0;
    this.spawnInterval = 1.8;
    this.nextZ = -55;
    this.difficulty = 0;
    this.gapManager = null;

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
    };
  }

  setGapManager(gapManager) {
    this.gapManager = gapManager;
  }

  isBlockedPosition(z) {
    if (this.gapManager?.isGapNear(z, GAP_MARGIN)) return true;
    return this.hasObstacleNear(z, 5);
  }

  hasObstacleNear(z, margin = 4) {
    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      if (Math.abs(obs.z - z) < margin) return true;
    }
    return false;
  }

  getFurthestZ() {
    let furthest = 0;
    for (const obs of this.obstacles) {
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

  spawn() {
    if (this.isBlockedPosition(this.nextZ)) {
      this.nextZ -= 3;
      this.spawnTimer = 0.25;
      return;
    }

    const type = this.pickType();
    const lane = Math.floor(Math.random() * 3);
    const mesh = this.createMesh(type);
    mesh.position.set(LANES[lane], 0, this.nextZ);
    this.scene.add(mesh);

    const def = OBSTACLE_DEFS[type];
    this.obstacles.push({
      mesh,
      type,
      lane,
      z: this.nextZ,
      topY: def.meshY + def.height / 2,
      jumpable: def.jumpable,
      active: true,
    });

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

  createMesh(type) {
    const def = OBSTACLE_DEFS[type];
    const geo = new THREE.BoxGeometry(1.6, def.height, 0.5);
    const mesh = new THREE.Mesh(geo, this.materials[type]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = def.meshY;
    return mesh;
  }

  checkCollision(player) {
    const feetY = player.y;

    for (const obs of this.obstacles) {
      if (!obs.active) continue;
      if (Math.abs(obs.z) > COLLISION_Z) continue;
      if (Math.abs(player.x - LANES[obs.lane]) > LANE_MATCH) continue;

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
    for (const obs of this.obstacles) {
      obs.mesh.position.z += move;
      obs.z = obs.mesh.position.z;

      if (obs.z > 8) {
        obs.active = false;
        this.scene.remove(obs.mesh);
        obs.mesh.geometry.dispose();
      }
    }

    this.obstacles = this.obstacles.filter((o) => o.active);
  }

  reset() {
    for (const obs of this.obstacles) {
      this.scene.remove(obs.mesh);
      obs.mesh.geometry.dispose();
    }
    this.obstacles = [];
    this.spawnTimer = 0.5;
    this.nextZ = -55;
    this.difficulty = 0;
    this.prefill();
  }
}
