import * as THREE from 'three';
import { GRAPHICS } from './graphicsProfile.js';

export function createSurfaceMaterial(params) {
  if (GRAPHICS.useLambert) {
    const { roughness, metalness, ...lambertParams } = params;
    return new THREE.MeshLambertMaterial(lambertParams);
  }

  return new THREE.MeshStandardMaterial(params);
}

export function instancedFrustumCulled() {
  return GRAPHICS.instancedFrustumCulled;
}
