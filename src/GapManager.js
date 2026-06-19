import * as THREE from 'three';
import { TRACK_WIDTH, RECYCLE_AFTER_Z, FLOOR_THICKNESS, WALL_X, WALL_TILE_WIDTH } from './Track.js';

const GAP_START_DISTANCE = 80;
const MIN_GAP_WIDTH = 2.4;
const ABS_MAX_GAP_WIDTH = 4.1;
const MIN_FLOOR_BETWEEN_GAPS = 9;
const MIN_GAP_INTERVAL = 22;
const MAX_GAP_INTERVAL = 54;
const FIRST_GAP_Z = -105;
const GAP_LOOKAHEAD = -165;
const GAP_MARGIN = 4;
const EMBER_COUNT = 4;
const FLOOR_LEG_WIDTH = 0.48;
const FLOOR_LEG_DEPTH = 0.48;
const FLOOR_LEG_DROP = 22;
const WALL_LEG_DEPTH = 0.52;

/** Mirror Player.js — used to cap gap width so normal jumps always clear. */
const JUMP_VY = 9.5;
const GRAVITY = 24;
const JUMP_CLEAR_SAFETY = 0.78;
const DEFAULT_RUN_SPEED = 14;

export function getMaxJumpableGapWidth(speed = DEFAULT_RUN_SPEED) {
  const airTime = (2 * JUMP_VY) / GRAVITY;
  const physicsMax = airTime * speed * JUMP_CLEAR_SAFETY;
  return Math.max(MIN_GAP_WIDTH, Math.min(ABS_MAX_GAP_WIDTH, physicsMax));
}

export function randomGapInterval() {
  const roll = Math.random();
  if (roll < 0.2) {
    return MIN_GAP_INTERVAL + Math.random() * 10;
  }
  if (roll < 0.75) {
    return MIN_GAP_INTERVAL + Math.random() * (MAX_GAP_INTERVAL - MIN_GAP_INTERVAL);
  }
  return MAX_GAP_INTERVAL - 14 + Math.random() * 18;
}

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
    this.currentSpeed = DEFAULT_RUN_SPEED;

    this.emberMats = [
      new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, fog: false }),
      new THREE.MeshBasicMaterial({ color: 0xff1144, transparent: true, fog: false }),
    ];

    this.emberGeo = new THREE.SphereGeometry(0.06, 4, 4);

    this.floorLegMat = new THREE.MeshStandardMaterial({
      color: 0x1a1428,
      emissive: 0x2a1840,
      emissiveIntensity: 0.35,
      roughness: 0.82,
      metalness: 0.08,
      fog: false,
    });
    this.wallLegMat = new THREE.MeshStandardMaterial({
      color: 0x2c2648,
      emissive: 0x1a1030,
      emissiveIntensity: 0.4,
      roughness: 0.65,
      metalness: 0.15,
      fog: false,
    });
    const legSpan = FLOOR_LEG_DROP + FLOOR_THICKNESS;
    this.floorLegGeo = new THREE.BoxGeometry(FLOOR_LEG_WIDTH, legSpan, FLOOR_LEG_DEPTH);
    this.legTopY = 0;
    this.legCenterY = -legSpan / 2;
    this.wallLegGeo = new THREE.BoxGeometry(WALL_TILE_WIDTH, legSpan, WALL_LEG_DEPTH);
    this.track = null;
  }

  setTrack(track) {
    this.track = track;
  }

  resolveCliffEdges(gapZ, width) {
    const startZ = gapZ - width / 2;
    const endZ = gapZ + width / 2;
    if (this.track) {
      return {
        backEdge: this.track.getFloorEdgeBeforeGap(startZ, gapZ),
        frontEdge: this.track.getFloorEdgeAfterGap(endZ, gapZ),
      };
    }
    return { backEdge: startZ, frontEdge: endZ };
  }

  randomGapWidth(speed = this.currentSpeed) {
    const maxW = getMaxJumpableGapWidth(speed);
    if (maxW <= MIN_GAP_WIDTH) return MIN_GAP_WIDTH;
    return MIN_GAP_WIDTH + Math.random() * (maxW - MIN_GAP_WIDTH);
  }

  /** Solid floor run between gap edges (not center-to-center). */
  floorRunBetween(proposedZ, proposedWidth, gap) {
    const pStart = proposedZ - proposedWidth / 2;
    const pEnd = proposedZ + proposedWidth / 2;
    const eStart = gap.startZ;
    const eEnd = gap.endZ;

    if (pEnd <= eStart) return eStart - pEnd;
    if (pStart >= eEnd) return pStart - eEnd;
    return 0;
  }

  isTooCloseToGap(z, width = 3) {
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active) continue;
      const floorRun = this.floorRunBetween(z, width, gap);
      if (floorRun < MIN_FLOOR_BETWEEN_GAPS) return true;
    }
    return false;
  }

  setGapBounds(entry, z, width) {
    entry.width = width;
    entry.z = z;
    entry.startZ = z - width / 2;
    entry.endZ = z + width / 2;
    entry.group.position.z = z;
  }

  /** Wall legs aligned to track wall X, snapped to visible floor tile edges. */
  addWallGapLegs(group, backLocal, frontLocal) {
    const legY = this.legCenterY;
    const edgeCenters = [
      backLocal - WALL_LEG_DEPTH / 2,
      frontLocal + WALL_LEG_DEPTH / 2,
    ];

    for (const wallSide of [-1, 1]) {
      for (const z of edgeCenters) {
        const leg = new THREE.Mesh(this.wallLegGeo, this.wallLegMat);
        leg.position.set(wallSide * WALL_X, legY, z);
        group.add(leg);
      }
    }
  }

  /** Vertical floor legs — outer faces flush with floor slab corners, drop into void. */
  addFloorCornerLegs(group, backLocal, frontLocal) {
    const halfTrack = TRACK_WIDTH / 2;
    const legY = this.legCenterY;

    const corners = [
      { x: -halfTrack + FLOOR_LEG_WIDTH / 2, z: backLocal - FLOOR_LEG_DEPTH / 2 },
      { x: halfTrack - FLOOR_LEG_WIDTH / 2, z: backLocal - FLOOR_LEG_DEPTH / 2 },
      { x: -halfTrack + FLOOR_LEG_WIDTH / 2, z: frontLocal + FLOOR_LEG_DEPTH / 2 },
      { x: halfTrack - FLOOR_LEG_WIDTH / 2, z: frontLocal + FLOOR_LEG_DEPTH / 2 },
    ];

    for (const { x, z } of corners) {
      const leg = new THREE.Mesh(this.floorLegGeo, this.floorLegMat);
      leg.position.set(x, legY, z);
      group.add(leg);
    }
  }

  addGapAtmosphere(group, width, embers) {
    for (let i = 0; i < EMBER_COUNT; i++) {
      const scale = 0.65 + Math.random() * 1.0;
      const ember = new THREE.Mesh(this.emberGeo, this.emberMats[i % 2]);
      ember.scale.setScalar(scale);
      ember.position.set(
        (Math.random() - 0.5) * (TRACK_WIDTH - 2),
        -2 - Math.random() * 6,
        (Math.random() - 0.5) * (width - 1)
      );
      embers.push({ mesh: ember, phase: Math.random() * Math.PI * 2, baseY: ember.position.y });
      group.add(ember);
    }
  }

  buildGapGroup(width, gapZ = 0) {
    const group = new THREE.Group();
    const embers = [];
    const { backEdge, frontEdge } = this.resolveCliffEdges(gapZ, width);
    const backLocal = backEdge - gapZ;
    const frontLocal = frontEdge - gapZ;

    this.addGapAtmosphere(group, width, embers);
    this.addFloorCornerLegs(group, backLocal, frontLocal);
    this.addWallGapLegs(group, backLocal, frontLocal);

    return { group, embers };
  }

  discardGroup(group) {
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }

  repoolGapEntry(entry, z, width) {
    this.discardGroup(entry.group);
    const built = this.buildGapGroup(width, z);
    entry.group = built.group;
    entry.embers = built.embers;
    this.setGapBounds(entry, z, width);
    entry.active = true;
    this.scene.add(entry.group);
  }

  setObstacleManager(obstacleManager) {
    this.obstacleManager = obstacleManager;
  }

  setPickupManager(pickupManager) {
    this.pickupManager = pickupManager;
  }

  setCoinManager(coinManager) {
    this.coinManager = coinManager;
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

  /** True when [centerZ - halfSpan, centerZ + halfSpan] hits a gap or its margin. */
  overlapsGapSpan(centerZ, halfSpan, margin = GAP_MARGIN) {
    const spanStart = centerZ - halfSpan;
    const spanEnd = centerZ + halfSpan;

    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active) continue;
      const blockedStart = gap.startZ - margin;
      const blockedEnd = gap.endZ + margin;
      if (spanEnd >= blockedStart && spanStart <= blockedEnd) return true;
    }
    return false;
  }

  /** Hide track pieces only when the tile center sits inside a gap. */
  coversFloorAt(worldZ) {
    return this.isGapAt(worldZ);
  }

  /** @deprecated use coversFloorAt — kept for any external callers */
  overlapsSegmentZ(segZ) {
    return this.coversFloorAt(segZ);
  }

  acquireGap(z, width = this.randomGapWidth()) {
    let entry;

    if (this.gapPool.length > 0) {
      entry = this.gapPool.pop();
      this.repoolGapEntry(entry, z, width);
    } else {
      const built = this.buildGapGroup(width, z);
      entry = {
        group: built.group,
        embers: built.embers,
        width,
        z,
        startZ: z - width / 2,
        endZ: z + width / 2,
        active: true,
      };
      this.setGapBounds(entry, z, width);
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

  spawnGap(z, width) {
    this.acquireGap(z, width);
  }

  canSpawnAt(z, width) {
    if (this.obstacleManager?.hasObstacleNear(z, 5)) return false;
    if (this.pickupManager?.hasPickupOverlappingGap(z, width)) return false;
    if (this.coinManager?.hasCoinOverlappingGap(z, width)) return false;
    if (this.isTooCloseToGap(z, width)) return false;
    return true;
  }

  trySpawnNext() {
    for (let attempt = 0; attempt < 12; attempt++) {
      const width = this.randomGapWidth();
      if (this.canSpawnAt(this.nextGapZ, width)) {
        this.spawnGap(this.nextGapZ, width);
        this.nextGapZ -= randomGapInterval();
        return true;
      }
      this.nextGapZ -= 4;
    }
    return false;
  }

  getMinActiveGapZ() {
    let minZ = Infinity;
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active) continue;
      if (gap.z < minZ) minZ = gap.z;
    }
    return minZ;
  }

  update(dt, speed, distance) {
    this.time += dt;
    this.currentSpeed = speed;

    if (distance < GAP_START_DISTANCE) return;

    if (!this.spawnedFirst) {
      this.spawnedFirst = true;
      this.nextGapZ = FIRST_GAP_Z;
      this.trySpawnNext();
    }

    const furthestActiveZ = this.getMinActiveGapZ();

    if (this._activeCount === 0 || furthestActiveZ > GAP_LOOKAHEAD) {
      if (this._activeCount > 0 && this.nextGapZ >= furthestActiveZ - MIN_GAP_INTERVAL) {
        this.nextGapZ = furthestActiveZ - randomGapInterval();
      }
      this.trySpawnNext();
    }

    const move = speed * dt;
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
      this.discardGroup(gap.group);
      this.gapPool.push(gap);
    }
    this._activeCount = 0;
    this.nextGapZ = -90;
    this.spawnedFirst = false;
    this.time = 0;
  }
}

export {
  GAP_START_DISTANCE,
  GAP_MARGIN,
  MIN_FLOOR_BETWEEN_GAPS,
  MIN_GAP_WIDTH,
  ABS_MAX_GAP_WIDTH,
};
