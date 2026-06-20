import * as THREE from 'three';
import { TRACK_WIDTH, RECYCLE_AFTER_Z, FLOOR_THICKNESS, WALL_X, WALL_TILE_WIDTH } from './Track.js';
import { LANES, LANE_WIDTH } from './scene.js';
import { createSurfaceMaterial } from './surfaceMaterial.js';

const FLOOR_Y = -FLOOR_THICKNESS / 2;
const GAP_TYPE_FULL = 'full';
const GAP_TYPE_BRIDGE = 'bridge';
const BRIDGE_SPAWN_CHANCE = 0.28;
const BRIDGE_SPAWN_CHANCE_MAX = 0.42;
const GAP_DIFFICULTY_DISTANCE = 3500;
const MIN_BRIDGE_GAP_WIDTH = 5.2;
const MAX_BRIDGE_GAP_WIDTH = 7.8;
/** Planks extend past gap edges so no void shows at entry/exit. */
const BRIDGE_DECK_OVERHANG = 0.55;
const BRIDGE_FLOOR_PAD = 0.28;
/** Extra obstacle-free clearance at bridge entry/exit (walkable deck). */
const BRIDGE_OBSTACLE_EDGE_PAD = 1.5;

const GAP_START_DISTANCE = 80;
const MIN_GAP_WIDTH = 2.4;
const ABS_MAX_GAP_WIDTH = 4.1;
const MIN_FLOOR_BETWEEN_GAPS = 9;
const MIN_GAP_INTERVAL = 22;
const MAX_GAP_INTERVAL = 54;
const FIRST_GAP_Z = -105;
const GAP_LOOKAHEAD = -165;
const GAP_MARGIN = 4;
/** Obstacle spawn: block before the gap, minimal block after landing. */
const OBSTACLE_GAP_APPROACH_MARGIN = 2.5;
const OBSTACLE_GAP_EXIT_MARGIN = 0.6;
/** Guaranteed obstacle waves on floor immediately after each gap. */
const POST_GAP_OBSTACLE_WAVES = 2;
const POST_GAP_CORRIDOR_LENGTH = 16;
const POST_GAP_CORRIDOR_SCAN_STEP = 1.1;
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

export function randomGapInterval(difficulty = 0) {
  const tight = Math.min(1, difficulty) * 10;
  const roll = Math.random();
  if (roll < 0.2) {
    return MIN_GAP_INTERVAL + Math.random() * 10 - tight * 0.4;
  }
  if (roll < 0.75) {
    return MIN_GAP_INTERVAL + Math.random() * (MAX_GAP_INTERVAL - MIN_GAP_INTERVAL) - tight;
  }
  return MAX_GAP_INTERVAL - 14 + Math.random() * 18 - tight * 0.6;
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
    this.runDistance = 0;

    this.emberMats = [
      new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, fog: false }),
      new THREE.MeshBasicMaterial({ color: 0xff1144, transparent: true, fog: false }),
    ];

    this.emberGeo = new THREE.SphereGeometry(0.06, 4, 4);

    this.floorLegMat = createSurfaceMaterial({
      color: 0x1a1428,
      emissive: 0x2a1840,
      emissiveIntensity: 0.35,
      roughness: 0.82,
      metalness: 0.08,
      fog: false,
    });
    this.wallLegMat = createSurfaceMaterial({
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

    this.bridgeDeckMat = createSurfaceMaterial({
      color: 0x5a4a78,
      emissive: 0x2a1840,
      emissiveIntensity: 0.28,
      roughness: 0.72,
      metalness: 0.1,
      fog: false,
    });
    this.bridgeRailMat = createSurfaceMaterial({
      color: 0x8877aa,
      emissive: 0x443366,
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.18,
      fog: false,
    });
    this.bridgePlankGeo = new THREE.BoxGeometry(LANE_WIDTH * 0.78, FLOOR_THICKNESS, 0.84);
    this.bridgeRailGeo = new THREE.BoxGeometry(0.07, 0.42, 1);

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

  randomBridgeGapWidth() {
    return MIN_BRIDGE_GAP_WIDTH + Math.random() * (MAX_BRIDGE_GAP_WIDTH - MIN_BRIDGE_GAP_WIDTH);
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

  addBridgeDeck(group, width, bridgeLane) {
    const laneX = LANES[bridgeLane];
    const deckLength = width + BRIDGE_DECK_OVERHANG;
    const halfDeck = deckLength / 2;
    const plankCount = Math.max(4, Math.ceil(deckLength / 0.82));
    const step = deckLength / plankCount;
    const halfRail = LANE_WIDTH * 0.42;

    for (let i = 0; i < plankCount; i++) {
      const plank = new THREE.Mesh(this.bridgePlankGeo, this.bridgeDeckMat);
      plank.position.set(laneX, FLOOR_Y, -halfDeck + (i + 0.5) * step);
      group.add(plank);
    }

    const railSpan = deckLength - 0.12;
    const railCount = Math.max(2, Math.ceil(railSpan / 0.95));
    for (const side of [-1, 1]) {
      for (let i = 0; i < railCount; i++) {
        const rail = new THREE.Mesh(this.bridgeRailGeo, this.bridgeRailMat);
        rail.scale.z = railSpan / railCount * 0.94;
        rail.position.set(
          laneX + side * halfRail,
          FLOOR_Y + 0.28,
          -halfDeck + (i + 0.5) * (deckLength / railCount)
        );
        group.add(rail);
      }
    }

    for (const z of [-halfDeck + 0.12, halfDeck - 0.12]) {
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.55, 0.1),
          this.bridgeRailMat
        );
        post.position.set(laneX + side * halfRail, FLOOR_Y + 0.22, z);
        group.add(post);
      }
    }
  }

  buildGapGroup(width, gapZ = 0, type = GAP_TYPE_FULL, bridgeLane = 1) {
    const group = new THREE.Group();
    const embers = [];
    const { backEdge, frontEdge } = this.resolveCliffEdges(gapZ, width);
    const backLocal = backEdge - gapZ;
    const frontLocal = frontEdge - gapZ;

    this.addGapAtmosphere(group, width, embers);
    this.addFloorCornerLegs(group, backLocal, frontLocal);
    this.addWallGapLegs(group, backLocal, frontLocal);

    if (type === GAP_TYPE_BRIDGE) {
      this.addBridgeDeck(group, width, bridgeLane);
    }

    return { group, embers };
  }

  discardGroup(group) {
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
  }

  repoolGapEntry(entry, z, width, type = GAP_TYPE_FULL, bridgeLane = 1) {
    this.discardGroup(entry.group);
    const built = this.buildGapGroup(width, z, type, bridgeLane);
    entry.group = built.group;
    entry.embers = built.embers;
    entry.type = type;
    entry.bridgeLane = bridgeLane;
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

  /** True when the player lane has solid floor at worldZ (bridge lane counts as floor). */
  hasFloorAt(worldZ, laneIndex) {
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active) continue;

      if (gap.type === GAP_TYPE_BRIDGE && laneIndex === gap.bridgeLane) {
        if (
          worldZ >= gap.startZ - BRIDGE_FLOOR_PAD &&
          worldZ <= gap.endZ + BRIDGE_FLOOR_PAD
        ) {
          return true;
        }
      }

      if (worldZ >= gap.startZ && worldZ <= gap.endZ) {
        return false;
      }
    }
    return true;
  }

  isGapNear(worldZ, margin = GAP_MARGIN) {
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active) continue;
      if (worldZ >= gap.startZ - margin && worldZ <= gap.endZ + margin) return true;
    }
    return false;
  }

  _obstacleSpawnMargins(gap) {
    if (gap.type !== GAP_TYPE_BRIDGE) {
      return {
        approach: OBSTACLE_GAP_APPROACH_MARGIN,
        exit: OBSTACLE_GAP_EXIT_MARGIN,
      };
    }
    return {
      approach: OBSTACLE_GAP_APPROACH_MARGIN + BRIDGE_OBSTACLE_EDGE_PAD,
      exit: OBSTACLE_GAP_EXIT_MARGIN + BRIDGE_OBSTACLE_EDGE_PAD,
    };
  }

  isObstacleSpawnBlocked(worldZ) {
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active) continue;
      const { approach, exit } = this._obstacleSpawnMargins(gap);
      if (worldZ >= gap.startZ - approach && worldZ <= gap.endZ) {
        return true;
      }
      if (worldZ > gap.endZ && worldZ <= gap.endZ + exit) {
        return true;
      }
    }
    return false;
  }

  findPostGapSpawnZ(isPositionFree) {
    let best = null;
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active || (gap.postGapObstacleWaves ?? 0) <= 0) continue;

      const corridorStart = gap.endZ + OBSTACLE_GAP_EXIT_MARGIN + 0.35;
      const corridorEnd = gap.endZ + POST_GAP_CORRIDOR_LENGTH;
      for (let z = corridorStart; z <= corridorEnd; z += POST_GAP_CORRIDOR_SCAN_STEP) {
        if (this.isObstacleSpawnBlocked(z)) continue;
        if (!isPositionFree(z)) continue;
        if (best === null || z > best) best = z;
      }
    }
    return best;
  }

  /** @deprecated use findPostGapSpawnZ */
  getPostGapCorridorSpawnZ(searchZ) {
    return this.findPostGapSpawnZ(() => true);
  }

  noteObstacleSpawnedAt(worldZ) {
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (!gap.active || (gap.postGapObstacleWaves ?? 0) <= 0) continue;
      if (worldZ >= gap.endZ && worldZ <= gap.endZ + POST_GAP_CORRIDOR_LENGTH) {
        gap.postGapObstacleWaves -= 1;
        return;
      }
    }
  }

  hasPendingPostGapCorridors() {
    for (let i = 0; i < this._activeCount; i++) {
      const gap = this.gaps[i];
      if (gap.active && (gap.postGapObstacleWaves ?? 0) > 0) return true;
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

  acquireGap(z, width = this.randomGapWidth(), options = {}) {
    const type = options.type ?? GAP_TYPE_FULL;
    const bridgeLane = options.bridgeLane ?? Math.floor(Math.random() * 3);
    let entry;

    if (this.gapPool.length > 0) {
      entry = this.gapPool.pop();
      this.repoolGapEntry(entry, z, width, type, bridgeLane);
    } else {
      const built = this.buildGapGroup(width, z, type, bridgeLane);
      entry = {
        group: built.group,
        embers: built.embers,
        width,
        z,
        startZ: z - width / 2,
        endZ: z + width / 2,
        type,
        bridgeLane,
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
    entry.postGapObstacleWaves = POST_GAP_OBSTACLE_WAVES;

    return entry;
  }

  releaseGap(entry) {
    entry.active = false;
    this.scene.remove(entry.group);
    this.gapPool.push(entry);
  }

  spawnGap(z, width) {
    this.acquireGap(z, width, { type: GAP_TYPE_FULL });
  }

  spawnBridgeGap(z, width) {
    this.acquireGap(z, width, {
      type: GAP_TYPE_BRIDGE,
      bridgeLane: Math.floor(Math.random() * 3),
    });
  }

  canSpawnAt(z, width) {
    if (this.obstacleManager?.hasObstacleNear(z, 5)) return false;
    if (this.pickupManager?.hasPickupOverlappingGap(z, width)) return false;
    if (this.coinManager?.hasCoinOverlappingGap(z, width)) return false;
    if (this.isTooCloseToGap(z, width)) return false;
    return true;
  }

  trySpawnNext() {
    const gapDifficulty = Math.min(1, this.runDistance / GAP_DIFFICULTY_DISTANCE);
    const bridgeChance =
      BRIDGE_SPAWN_CHANCE + gapDifficulty * (BRIDGE_SPAWN_CHANCE_MAX - BRIDGE_SPAWN_CHANCE);

    for (let attempt = 0; attempt < 12; attempt++) {
      const useBridge = Math.random() < bridgeChance;
      const width = useBridge ? this.randomBridgeGapWidth() : this.randomGapWidth();
      if (this.canSpawnAt(this.nextGapZ, width)) {
        if (useBridge) {
          this.spawnBridgeGap(this.nextGapZ, width);
        } else {
          this.spawnGap(this.nextGapZ, width);
        }
        this.nextGapZ -= randomGapInterval(gapDifficulty);
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
    this.runDistance = distance;

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
    this.runDistance = 0;
  }
}

export {
  GAP_START_DISTANCE,
  GAP_MARGIN,
  OBSTACLE_GAP_APPROACH_MARGIN,
  OBSTACLE_GAP_EXIT_MARGIN,
  POST_GAP_OBSTACLE_WAVES,
  POST_GAP_CORRIDOR_LENGTH,
  MIN_FLOOR_BETWEEN_GAPS,
  MIN_GAP_WIDTH,
  ABS_MAX_GAP_WIDTH,
  GAP_TYPE_FULL,
  GAP_TYPE_BRIDGE,
  BRIDGE_SPAWN_CHANCE,
  MIN_BRIDGE_GAP_WIDTH,
  MAX_BRIDGE_GAP_WIDTH,
  BRIDGE_OBSTACLE_EDGE_PAD,
};
