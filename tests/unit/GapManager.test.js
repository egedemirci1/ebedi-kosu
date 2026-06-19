import { describe, it, expect, beforeEach } from 'vitest';
import { GapManager, GAP_MARGIN, getMaxJumpableGapWidth, MIN_GAP_WIDTH, ABS_MAX_GAP_WIDTH } from '../../src/GapManager.js';
import { createScene, insertGap } from '../helpers/fixtures.js';

describe('GapManager', () => {
  let scene;
  let gaps;

  beforeEach(() => {
    scene = createScene();
    gaps = new GapManager(scene);
  });

  describe('isGapAt boundaries', () => {
    it('returns false when no gaps exist', () => {
      expect(gaps.isGapAt(0)).toBe(false);
      expect(gaps.isGapAt(-100)).toBe(false);
    });

    it('includes startZ and endZ inclusively', () => {
      insertGap(gaps, -100, 3);
      expect(gaps.isGapAt(-101.5)).toBe(true);
      expect(gaps.isGapAt(-98.5)).toBe(true);
    });

    it('returns false immediately outside gap edges', () => {
      insertGap(gaps, -100, 3);
      expect(gaps.isGapAt(-101.51)).toBe(false);
      expect(gaps.isGapAt(-98.49)).toBe(false);
    });

    it('ignores released / inactive gaps', () => {
      const entry = insertGap(gaps, -100, 3);
      gaps.releaseGap(entry);
      expect(gaps.isGapAt(-100)).toBe(false);
    });
  });

  describe('isGapNear margin', () => {
    it('extends detection by margin beyond physical gap', () => {
      insertGap(gaps, -100, 3);
      const edge = 3 / 2;
      expect(gaps.isGapNear(-100 - edge - GAP_MARGIN)).toBe(true);
      expect(gaps.isGapNear(-100 - edge - GAP_MARGIN - 0.01)).toBe(false);
    });

    it('respects custom margin for booster placement rules', () => {
      insertGap(gaps, -50, 2.6);
      expect(gaps.isGapNear(-50, GAP_MARGIN + 2)).toBe(true);
    });
  });

  describe('coversFloorAt', () => {
    it('matches isGapAt exactly (no extra floor hiding)', () => {
      insertGap(gaps, -80, 3.2);
      for (const z of [-81.6, -80, -78.4, -77, -85]) {
        expect(gaps.coversFloorAt(z)).toBe(gaps.isGapAt(z));
      }
    });
  });

  describe('isTooCloseToGap', () => {
    it('blocks spawn when solid floor between gap edges is below minimum', () => {
      insertGap(gaps, -100, 3);
      expect(gaps.isTooCloseToGap(-110, 3)).toBe(true);
      expect(gaps.isTooCloseToGap(-112, 3)).toBe(false);
    });

    it('blocks spawn behind previous gap when floor run is too short', () => {
      insertGap(gaps, -100, 3);
      expect(gaps.isTooCloseToGap(-90, 3)).toBe(true);
      expect(gaps.isTooCloseToGap(-88, 3)).toBe(false);
    });

    it('allows spawn when only inactive gaps exist in pool', () => {
      const entry = insertGap(gaps, -100, 3);
      gaps.releaseGap(entry);
      expect(gaps.isTooCloseToGap(-100, 3)).toBe(false);
    });
  });

  describe('jump-safe gap width', () => {
    it('caps width from run speed and normal jump physics', () => {
      const atStart = getMaxJumpableGapWidth(14);
      const faster = getMaxJumpableGapWidth(22);
      expect(atStart).toBeGreaterThanOrEqual(MIN_GAP_WIDTH);
      expect(atStart).toBeLessThanOrEqual(ABS_MAX_GAP_WIDTH);
      expect(faster).toBeGreaterThanOrEqual(atStart);
    });

    it('randomGapWidth stays within jump-safe bounds at current speed', () => {
      gaps.currentSpeed = 16;
      for (let i = 0; i < 20; i++) {
        const w = gaps.randomGapWidth();
        expect(w).toBeGreaterThanOrEqual(MIN_GAP_WIDTH);
        expect(w).toBeLessThanOrEqual(getMaxJumpableGapWidth(16) + 0.001);
      }
    });
  });

  describe('canSpawnAt', () => {
    it('rejects spawn on obstacle proximity', () => {
      gaps.setObstacleManager({
        hasObstacleNear: (z, margin) => Math.abs(z + 90) < margin,
      });
      expect(gaps.canSpawnAt(-90)).toBe(false);
      expect(gaps.canSpawnAt(-200)).toBe(true);
    });

    it('rejects spawn when a booster overlaps the gap span', () => {
      const pickups = {
        hasPickupOverlappingGap: (z, width) => Math.abs(z + 100) < width / 2 + 2,
      };
      gaps.setPickupManager(pickups);
      expect(gaps.canSpawnAt(-100, 3)).toBe(false);
      expect(gaps.canSpawnAt(-200, 3)).toBe(true);
    });
  });

  describe('overlapsGapSpan', () => {
    it('detects overlap when only the span edge reaches the gap margin', () => {
      insertGap(gaps, -50, 3);
      expect(gaps.overlapsGapSpan(-58, 1.8, GAP_MARGIN + 2)).toBe(true);
      expect(gaps.overlapsGapSpan(-59.5, 1.8, GAP_MARGIN + 2)).toBe(false);
    });
  });

  describe('update distance gate', () => {
    it('does not spawn before GAP_START_DISTANCE even after many frames', () => {
      gaps.update(0.016, 14, 0);
      gaps.update(0.016, 14, 79);
      expect(gaps._activeCount).toBe(0);
      expect(gaps.spawnedFirst).toBe(false);
    });

    it('spawns first gap once distance threshold crossed', () => {
      gaps.update(0.016, 14, 80);
      expect(gaps.spawnedFirst).toBe(true);
      expect(gaps._activeCount).toBeGreaterThan(0);
    });
  });

  describe('gap movement and recycling', () => {
    it('advances gap bounds with world scroll', () => {
      insertGap(gaps, -100, 3);
      gaps.update(1, 10, 200);
      const gap = gaps.gaps[0];
      expect(gap.startZ).toBe(-91.5);
      expect(gap.endZ).toBe(-88.5);
    });
  });
});
