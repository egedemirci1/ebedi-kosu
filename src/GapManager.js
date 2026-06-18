import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK_WIDTH, RECYCLE_AFTER_Z } from './Track.js';

const GAP_START_DISTANCE = 80;
const MIN_GAP_INTERVAL = 22;
const MAX_GAP_INTERVAL = 38;
const FIRST_GAP_Z = -105;
const GAP_LOOKAHEAD = -165;
const GAP_MARGIN = 4;

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CONE = new THREE.ConeGeometry(1, 1, 3);
const STRIPE_BOX = new THREE.BoxGeometry(0.9, 0.05, 0.35);
const CHEVRON_BOX = new THREE.BoxGeometry(0.15, 0.06, 1);

export class GapManager {
  constructor(scene) {
    this.scene = scene;
    this.gaps = [];
    this.gapPool = [];
    this.nextGapZ = -90;
    this.spawnedFirst = false;
    this.obstacleManager = null;
    this.time = 0;
    this._activeCount = 0;

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

    this.floorCoverMat = new THREE.MeshBasicMaterial({ color: 0x080810, fog: false });

    this.voidLayerMats = [
      new THREE.MeshBasicMaterial({ color: 0x080010, fog: false }),
      new THREE.MeshBasicMaterial({ color: 0x040008, fog: false }),
      new THREE.MeshBasicMaterial({ color: 0x020004, fog: false }),
      new THREE.MeshBasicMaterial({ color: 0x000001, fog: false }),
    ];

    this.emberMats = [
      new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, fog: false }),
      new THREE.MeshBasicMaterial({ color: 0xff1144, transparent: true, fog: false }),
    ];

    this.ledgeGeo = new THREE.BoxGeometry(TRACK_WIDTH, 0.4, 0.7);
    this.rimGeo = new THREE.BoxGeometry(TRACK_WIDTH + 0.1, 0.06, 0.12);
    this.emberGeo = new THREE.SphereGeometry(0.06, 4, 4);
    this.warningGeo = this.buildWarningGeometry();
  }

  buildWarningGeometry() {
    const parts = [];

    for (let row = 0; row < 3; row++) {
      for (let i = -3; i <= 3; i++) {
        const geo = STRIPE_BOX.clone();
        geo.translate(i * 1.15, 0.03, row * 0.55);
        parts.push(geo);
      }
    }

    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const geo = CHEVRON_BOX.clone();
        geo.scale(1, 1, 0.6 + i * 0.15);
        const matrix = new THREE.Matrix4().makeRotationY(side * 0.5);
        matrix.setPosition(side * (0.8 + i * 0.35), 0.06, 1.2 - i * 0.3);
        geo.applyMatrix4(matrix);
        parts.push(geo);
      }
    }

    return mergeGeometries(parts, false);
  }

  setObstacleManager(obstacleManager) {
    this.obstacleManager = obstacleManager;
  }

  isGapAt(worldZ) {
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active) continue;
      if (worldZ >= gap.startZ && worldZ <= gap.endZ) return true;
    }
    return false;
  }

  isGapNear(worldZ, margin = GAP_MARGIN) {
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active) continue;
      if (worldZ >= gap.startZ - margin && worldZ <= gap.endZ + margin) return true;
    }
    return false;
  }

  addCliffEdge(group, side, edgeZ) {
    const ledge = new THREE.Mesh(this.ledgeGeo, this.edgeMat);
    ledge.position.set(0, -0.08, edgeZ);
    ledge.castShadow = true;
    group.add(ledge);

    const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
    rim.position.set(0, 0.1, edgeZ + side * 0.28);
    group.add(rim);

    for (let i = -3; i <= 3; i++) {
      const sx = 0.5 + Math.random() * 0.4;
      const chunk = new THREE.Mesh(UNIT_BOX, this.edgeMat);
      chunk.scale.set(sx, 0.12, 0.35);
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
      const cliff = new THREE.Mesh(UNIT_BOX, this.cliffMat);
      cliff.scale.set(1.2 + Math.random(), cliffH, 0.5);
      cliff.position.set(
        (Math.random() - 0.5) * 6,
        -cliffH / 2 - 0.2,
        edgeZ + side * 0.35
      );
      cliff.rotation.z = side * (0.05 + Math.random() * 0.12);
      group.add(cliff);
    }

    for (let i = -3; i <= 3; i++) {
      const spikeH = 0.5 + Math.random() * 0.6;
      const spike = new THREE.Mesh(UNIT_CONE, this.cliffMat);
      spike.scale.set(0.08, spikeH, 0.08);
      spike.position.set(i * 1.0, -0.35 - Math.random() * 0.3, edgeZ + side * 0.2);
      spike.rotation.x = Math.PI;
      spike.rotation.z = (Math.random() - 0.5) * 0.4;
      group.add(spike);
    }
  }

  addVoidDepth(group, width, embers, voidGlows) {
    const voidW = TRACK_WIDTH - 0.4;
    const voidD = width - 0.2;
    const layers = [
      { y: -1.5, h: 1.5 },
      { y: -3.5, h: 2.5 },
      { y: -6.5, h: 4 },
      { y: -10, h: 5 },
    ];

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const box = new THREE.Mesh(UNIT_BOX, this.voidLayerMats[i]);
      box.scale.set(voidW, layer.h, voidD);
      box.position.y = layer.y;
      group.add(box);
    }

    for (let i = 0; i < 12; i++) {
      const scale = 0.65 + Math.random() * 1.0;
      const ember = new THREE.Mesh(this.emberGeo, this.emberMats[i % 3 === 0 ? 0 : 1]);
      ember.scale.setScalar(scale);
      ember.position.set(
        (Math.random() - 0.5) * (TRACK_WIDTH - 2),
        -1.5 - Math.random() * 6,
        (Math.random() - 0.5) * (width - 1)
      );
      embers.push({ mesh: ember, phase: Math.random() * Math.PI * 2, baseY: ember.position.y });
      group.add(ember);
    }

    const voidGlow = new THREE.PointLight(0xff0022, 1.2, width + 8);
    voidGlow.position.y = -3;
    voidGlows.push({ light: voidGlow, kind: 'red' });
    group.add(voidGlow);

    const voidGlow2 = new THREE.PointLight(0xff4400, 0.5, width + 5);
    voidGlow2.position.y = -1;
    voidGlows.push({ light: voidGlow2, kind: 'orange' });
    group.add(voidGlow2);
  }

  buildGapGroup(width) {
    const group = new THREE.Group();
    const embers = [];
    const voidGlows = [];

    const floorCover = new THREE.Mesh(UNIT_BOX, this.floorCoverMat);
    floorCover.scale.set(TRACK_WIDTH + 0.4, 0.25, width + 0.6);
    floorCover.position.y = -0.02;
    group.add(floorCover);

    this.addVoidDepth(group, width, embers, voidGlows);

    for (const side of [-1, 1]) {
      const edgeZ = side < 0 ? -width / 2 : width / 2;
      this.addCliffEdge(group, side, edgeZ);
    }

    const warnMesh = new THREE.Mesh(this.warningGeo, this.warningMat);
    warnMesh.position.z = -width / 2 - 5;
    group.add(warnMesh);

    return { group, embers, voidGlows };
  }

  acquireGap(z) {
    let entry;

    if (this.gapPool.length > 0) {
      entry = this.gapPool.pop();
      entry.z = z;
      entry.startZ = z - entry.width / 2;
      entry.endZ = z + entry.width / 2;
      entry.active = true;
      entry.group.position.z = z;
      this.scene.add(entry.group);
      for (const ember of entry.embers) {
        ember.mesh.position.y = ember.baseY;
      }
    } else {
      const width = 3.5 + Math.random() * 2;
      const built = this.buildGapGroup(width);
      entry = {
        group: built.group,
        embers: built.embers,
        voidGlows: built.voidGlows,
        width,
        z,
        startZ: z - width / 2,
        endZ: z + width / 2,
        active: true,
      };
      entry.group.position.z = z;
      this.scene.add(entry.group);
    }

    if (this._activeCount < this.gaps.length) {
      this.gaps[this._activeCount] = entry;
    } else {
      this.gaps.push(entry);
    }
    this._activeCount++;

    return entry;
  }

  releaseGap(entry) {
    entry.active = false;
    this.scene.remove(entry.group);
    this.gapPool.push(entry);
  }

  spawnGap(z) {
    this.acquireGap(z);
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

    let furthestZ = this.nextGapZ;
    for (let i = 0; i < this._activeCount; i++) {
      if (this.gaps[i].active && this.gaps[i].z < furthestZ) {
        furthestZ = this.gaps[i].z;
      }
    }

    if (furthestZ > GAP_LOOKAHEAD) {
      this.trySpawnNext();
    }

    const move = speed * dt;
    const pulse = 0.85 + Math.sin(this.time * 3) * 0.15;
    let write = 0;

    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active) continue;

      gap.group.position.z += move;
      gap.z = gap.group.position.z;
      gap.startZ += move;
      gap.endZ += move;

      for (const ember of gap.embers) {
        ember.mesh.material.opacity =
          0.5 + Math.sin(this.time * 4 + ember.phase) * 0.5;
        ember.mesh.position.y =
          ember.baseY + Math.sin(this.time * 2 + ember.phase) * 0.4;
      }

      for (const glow of gap.voidGlows) {
        glow.light.intensity = (glow.kind === 'red' ? 1.2 : 0.5) * pulse;
      }

      if (gap.startZ > RECYCLE_AFTER_Z) {
        this.releaseGap(gap);
        continue;
      }

      if (write !== i) this.gaps[write] = gap;
      write++;
    }

    this._activeCount = write;
  }

  reset() {
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      this.scene.remove(gap.group);
      this.gapPool.push(gap);
    }
    this._activeCount = 0;
    this.nextGapZ = -90;
    this.spawnedFirst = false;
    this.time = 0;
  }
}

export { GAP_START_DISTANCE, GAP_MARGIN };
