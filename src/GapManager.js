import * as THREE from 'three';
import { TRACK_WIDTH, RECYCLE_AFTER_Z } from './Track.js';

const GAP_START_DISTANCE = 80;
const MIN_GAP_INTERVAL = 22;
const MAX_GAP_INTERVAL = 38;
const FIRST_GAP_Z = -105;
const GAP_LOOKAHEAD = -165;
const GAP_MARGIN = 4;

export class GapManager {
  constructor(scene) {
    this.scene = scene;
    this.gaps = [];
    this.nextGapZ = -90;
    this.spawnedFirst = false;
    this.obstacleManager = null;
    this.time = 0;

    this.edgeMat = new THREE.MeshStandardMaterial({
      color: 0x2a2030,
      emissive: 0x331122,
      emissiveIntensity: 0.35,
      roughness: 0.85,
      fog: false,
    });

    this.cliffMat = new THREE.MeshStandardMaterial({
      color: 0x1a1018,
      emissive: 0x220818,
      emissiveIntensity: 0.2,
      roughness: 1,
      flatShading: true,
      fog: false,
    });

    this.warningMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff8800,
      emissiveIntensity: 1.2,
      roughness: 0.4,
      fog: false,
    });

    this.rimMat = new THREE.MeshStandardMaterial({
      color: 0xff2244,
      emissive: 0xff1133,
      emissiveIntensity: 1.5,
      roughness: 0.3,
      fog: false,
    });

    this.voidMat = new THREE.MeshBasicMaterial({ color: 0x020004, fog: false });
    this.voidDeepMat = new THREE.MeshBasicMaterial({ color: 0x000002, fog: false });
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

  addCliffEdge(group, side, edgeZ, width) {
    const ledge = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_WIDTH, 0.4, 0.7),
      this.edgeMat
    );
    ledge.position.set(0, -0.08, edgeZ);
    ledge.castShadow = true;
    group.add(ledge);

    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(TRACK_WIDTH + 0.1, 0.06, 0.12),
      this.rimMat
    );
    rim.position.set(0, 0.1, edgeZ + side * 0.28);
    group.add(rim);

    for (let i = -3; i <= 3; i++) {
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 + Math.random() * 0.4, 0.12, 0.35),
        this.edgeMat
      );
      chunk.position.set(
        i * 1.1 + (Math.random() - 0.5) * 0.3,
        0.04,
        edgeZ + side * (0.12 + Math.random() * 0.2)
      );
      chunk.rotation.y = (Math.random() - 0.5) * 0.5;
      group.add(chunk);
    }

    for (let i = 0; i < 4; i++) {
      const cliffH = 2 + Math.random() * 3;
      const cliff = new THREE.Mesh(
        new THREE.BoxGeometry(1.2 + Math.random(), cliffH, 0.5),
        this.cliffMat
      );
      cliff.position.set(
        (Math.random() - 0.5) * 6,
        -cliffH / 2 - 0.2,
        edgeZ + side * 0.35
      );
      cliff.rotation.z = side * (0.05 + Math.random() * 0.12);
      group.add(cliff);
    }

    for (let i = -3; i <= 3; i++) {
      const spike = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.5 + Math.random() * 0.6, 3),
        this.cliffMat
      );
      spike.position.set(i * 1.0, -0.35 - Math.random() * 0.3, edgeZ + side * 0.2);
      spike.rotation.x = Math.PI;
      spike.rotation.z = (Math.random() - 0.5) * 0.4;
      group.add(spike);
    }
  }

  addVoidDepth(group, width) {
    const layers = [
      { y: -1.5, h: 1.5, color: 0x080010, opacity: 1 },
      { y: -3.5, h: 2.5, color: 0x040008, opacity: 1 },
      { y: -6.5, h: 4, color: 0x020004, opacity: 1 },
      { y: -10, h: 5, color: 0x000001, opacity: 1 },
    ];

    for (const layer of layers) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(TRACK_WIDTH - 0.4, layer.h, width - 0.2),
        new THREE.MeshBasicMaterial({ color: layer.color, fog: false })
      );
      box.position.y = layer.y;
      group.add(box);
    }

    for (let i = 0; i < 12; i++) {
      const ember = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 + Math.random() * 0.06, 4, 4),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xff4422 : 0xff1144,
          fog: false,
        })
      );
      ember.position.set(
        (Math.random() - 0.5) * (TRACK_WIDTH - 2),
        -1.5 - Math.random() * 6,
        (Math.random() - 0.5) * (width - 1)
      );
      ember.userData.isEmber = true;
      ember.userData.phase = Math.random() * Math.PI * 2;
      group.add(ember);
    }

    const voidGlow = new THREE.PointLight(0xff0022, 1.2, width + 8);
    voidGlow.position.y = -3;
    voidGlow.userData.isVoidGlow = true;
    group.add(voidGlow);

    const voidGlow2 = new THREE.PointLight(0xff4400, 0.5, width + 5);
    voidGlow2.position.y = -1;
    voidGlow2.userData.isVoidGlow = true;
    group.add(voidGlow2);
  }

  addWarningZone(group, width) {
    const warnGroup = new THREE.Group();
    warnGroup.position.z = -width / 2 - 5;

    for (let row = 0; row < 3; row++) {
      for (let i = -3; i <= 3; i++) {
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.05, 0.35),
          this.warningMat
        );
        stripe.position.set(i * 1.15, 0.03, row * 0.55);
        warnGroup.add(stripe);
      }
    }

    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const chevron = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.06, 0.6 + i * 0.15),
          this.warningMat
        );
        chevron.position.set(side * (0.8 + i * 0.35), 0.06, 1.2 - i * 0.3);
        chevron.rotation.y = side * 0.5;
        warnGroup.add(chevron);
      }
    }

    group.add(warnGroup);
    return warnGroup;
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

    this.addVoidDepth(group, width);

    for (const side of [-1, 1]) {
      const edgeZ = side < 0 ? -width / 2 : width / 2;
      this.addCliffEdge(group, side, edgeZ, width);
    }

    this.addWarningZone(group, width);

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
    this.time += dt;

    if (distance < GAP_START_DISTANCE) return;

    if (!this.spawnedFirst) {
      this.spawnedFirst = true;
      this.nextGapZ = FIRST_GAP_Z;
      this.trySpawnNext();
      this.trySpawnNext();
    }

    const furthestZ = this.gaps.length
      ? Math.min(...this.gaps.map((g) => g.z))
      : this.nextGapZ;

    if (furthestZ > GAP_LOOKAHEAD) {
      this.trySpawnNext();
    }

    const move = speed * dt;
    const pulse = 0.85 + Math.sin(this.time * 3) * 0.15;

    for (const gap of this.gaps) {
      gap.group.position.z += move;
      gap.z = gap.group.position.z;
      gap.startZ += move;
      gap.endZ += move;

      gap.group.traverse((child) => {
        if (child.userData.isEmber) {
          child.material.opacity = 0.5 + Math.sin(this.time * 4 + child.userData.phase) * 0.5;
          child.position.y += Math.sin(this.time * 2 + child.userData.phase) * dt * 0.3;
        }
        if (child.userData.isVoidGlow) {
          child.intensity = (child.color?.getHex?.() === 0xff0022 ? 1.2 : 0.5) * pulse;
        }
      });

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
    this.nextGapZ = -90;
    this.spawnedFirst = false;
    this.time = 0;
  }
}

export { GAP_START_DISTANCE, GAP_MARGIN };
