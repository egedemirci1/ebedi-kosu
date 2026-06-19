import * as THREE from 'three';

export function createScene() {
  return new THREE.Scene();
}

/** Inject a gap without going through random width spawn logic. */
export function insertGap(manager, z, width = 3) {
  const entry = manager.acquireGap(z);
  manager.setGapBounds(entry, z, width);
  return entry;
}

/** Manually register an active pickup (bypasses spawn randomness). */
export function insertPickup(manager, type, lane, z) {
  manager.acquirePickup(type, lane, z);
  return manager.pickups[manager._activeCount - 1];
}

export function insertObstacle(manager, type, lane, z) {
  manager.acquireObstacle(type, lane, z);
  return manager.obstacles[manager._activeCount - 1];
}
