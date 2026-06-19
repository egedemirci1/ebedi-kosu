import * as THREE from 'three';

export function createScene() {
  return new THREE.Scene();
}

/** Inject a gap without going through random width spawn logic. */
export function insertGap(manager, z, width = 3) {
  return manager.acquireGap(z, width, { type: 'full' });
}

/** Inject a single-lane bridge gap (void on other lanes). */
export function insertBridgeGap(manager, z, width = 6, bridgeLane = 1) {
  return manager.acquireGap(z, width, { type: 'bridge', bridgeLane });
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
