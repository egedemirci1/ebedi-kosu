import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSurfaceMaterial, instancedFrustumCulled } from '../../src/surfaceMaterial.js';
import { GRAPHICS } from '../../src/graphicsProfile.js';

describe('surfaceMaterial', () => {
  it('creates Lambert or Standard based on profile', () => {
    const mat = createSurfaceMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0.1,
      fog: true,
    });

    if (GRAPHICS.useLambert) {
      expect(mat).toBeInstanceOf(THREE.MeshLambertMaterial);
    } else {
      expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
    }
  });

  it('enables instanced frustum culling in profile', () => {
    expect(instancedFrustumCulled()).toBe(true);
  });
});
