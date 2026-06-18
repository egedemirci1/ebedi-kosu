import * as THREE from 'three';
import { TRACK_WIDTH, RECYCLE_AFTER_Z } from './Track.js';

const GAP_START_DISTANCE = 80;
const MIN_GAP_INTERVAL = 22;
const MAX_GAP_INTERVAL = 38;
const FIRST_GAP_Z = -58;
const GAP_MARGIN = 4;

export class GapManager {
  constructor(scene) {
    this.scene = scene;
    this.gaps = [];
    this.nextGapZ = -50;
    this.spawnedFirst = false;
    this.obstacleManager = null;

    this.edgeMat = new THREE.MeshStandardMaterial({
      color: 0x2a2030,
      emissive: 0x331122,
      emissiveIntensity: 0.3,
      roughness: 0.8,
      fog: false,
    });

    this.warningMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0x442200,
      emissiveIntensity: 0.8,
      roughness: 0.4,
      fog: false,
    });

    this.voidMat = new THREE.MeshBasicMaterial({ color: 0x020004, fog: false });
    this.floorCoverMat = new THREE.MeshBasicMaterial({ color: 0x080810, fog: false });
  }

  setObstacleManager(obstacleManager) {
    this.obstacleManager = obstacleManager;
  }

  isGapAt(worldZ) {
    for (const gap of this.gaps) {
      if (!gap.active) continue;
      if (worldZ >= gap.startZ && worldZ <= gap.endZ) return true;
    }
    return false;
  }

  isGapNear(worldZ, margin = GAP_MARGIN) {
    for (const gap of this.gaps) {
      if (!gap.active) continue;
      if (worldZ >= gap.startZ - margin && worldZ <= gap.endZ + margin) return true;
    }
    return false;
  }

  spawnGap(z) {
    const width = 3.5 + Math.random() * 2;
    const startZ = z - width / 2;
    const endZ = z + width / 2;
    const group = new THREE.Group();
    group.position.z = z;

    const floorCover = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_WIDTH + 0.4, 0.25, width + 0.6),
      this.floorCoverMat
    );
    floorCover.position.y = -0.02;
    group.add(floorCover);

    const voidPit = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_WIDTH - 0.2, 10, width),
      this.voidMat
    );
    voidPit.position.y = -5;
    group.add(voidPit);

    const voidGlow = new THREE.PointLight(0xff0022, 0.6, width + 4);
    voidGlow.position.y = -1;
    group.add(voidGlow);

    for (const side of [-1, 1]) {
      const edgeZ = side < 0 ? -width / 2 : width / 2;
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_WIDTH, 0.35, 0.5),
        this.edgeMat
      );
      edge.position.set(0, -0.1, edgeZ);
      edge.castShadow = true;
      group.add(edge);

      for (let i = -3; i <= 3; i++) {
        const crack = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.08, 0.4),
          this.edgeMat
        );
        crack.position.set(i * 1.1, 0.05, edgeZ + side * 0.15);
        crack.rotation.y = (Math.random() - 0.5) * 0.4;
        group.add(crack);
      }
    }

    const warnGroup = new THREE.Group();
    warnGroup.position.z = -width / 2 - 5;
    for (let row = 0; row < 3; row++) {
      for (let i = -3; i <= 3; i++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.04, 0.3),
          this.warningMat
        );
        stripe.position.set(i * 1.2, 0.02, row * 0.55);
        warnGroup.add(stripe);
      }
    }
    group.add(warnGroup);

    this.scene.add(group);

    this.gaps.push({
      group,
      startZ,
      endZ,
      width,
      z,
      active: true,
    });
  }

  trySpawnNext() {
    for (let attempt = 0; attempt < 6; attempt++) {
      if (!this.obstacleManager?.hasObstacleNear(this.nextGapZ, 5)) {
        this.spawnGap(this.nextGapZ);
        this.nextGapZ -= MIN_GAP_INTERVAL + Math.random() * (MAX_GAP_INTERVAL - MIN_GAP_INTERVAL);
        return;
      }
      this.nextGapZ -= 4;
    }
  }

  update(dt, speed, distance) {
    if (distance < GAP_START_DISTANCE) return;

    if (!this.spawnedFirst) {
      this.spawnedFirst = true;
      this.nextGapZ = FIRST_GAP_Z;
      this.trySpawnNext();
    }

    const furthestZ = this.gaps.length
      ? Math.min(...this.gaps.map((g) => g.z))
      : this.nextGapZ;

    if (furthestZ > -95) {
      this.trySpawnNext();
    }

    const move = speed * dt;
    for (const gap of this.gaps) {
      gap.group.position.z += move;
      gap.z = gap.group.position.z;
      gap.startZ += move;
      gap.endZ += move;

      if (gap.startZ > RECYCLE_AFTER_Z) {
        gap.active = false;
        this.scene.remove(gap.group);
        gap.group.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
        });
      }
    }

    this.gaps = this.gaps.filter((g) => g.active);
  }

  reset() {
    for (const gap of this.gaps) {
      this.scene.remove(gap.group);
      gap.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
    }
    this.gaps = [];
    this.nextGapZ = -50;
    this.spawnedFirst = false;
  }
}

export { GAP_START_DISTANCE, GAP_MARGIN };
