import { describe, it, expect, beforeEach } from 'vitest';
import { ObstacleManager, obstacleSweepHitsPlayer, COLLISION_Z } from '../../src/ObstacleManager.js';
import { LANES } from '../../src/scene.js';
import { createScene, insertGap, insertObstacle } from '../helpers/fixtures.js';
import { GapManager } from '../../src/GapManager.js';

function makePlayer({ x = LANES[1], y = 0, laneIndex = 1, isSliding = false, slideBlend = 0 } = {}) {
  return {
    x,
    y,
    laneIndex,
    isSliding,
    slideBlend,
    get isSlideActive() {
      return isSliding || slideBlend > 0.45;
    },
    get hitbox() {
      if (isSliding || slideBlend > 0.35) {
        return { x, y: y + 0.35, z: 0, radius: 0.42, height: 0.62 };
      }
      return { x, y: y + 0.9, z: 0, radius: 0.45, height: 1.6 };
    },
  };
}

describe('ObstacleManager', () => {
  let scene;
  let obstacles;

  beforeEach(() => {
    scene = createScene();
    obstacles = new ObstacleManager(scene);
  });

  describe('checkCollision', () => {
    it('returns null when no obstacles are active', () => {
      expect(obstacles.checkCollision(makePlayer())).toBeNull();
    });

    it('ignores obstacles outside z collision window', () => {
      insertObstacle(obstacles, 'barrier', 1, 0.5);
      expect(obstacles.checkCollision(makePlayer())).toBeNull();
    });

    it('ignores obstacle in different lane even at collision z', () => {
      insertObstacle(obstacles, 'barrier', 0, 0);
      expect(obstacles.checkCollision(makePlayer({ x: LANES[1], laneIndex: 1 }))).toBeNull();
    });

    it('ignores jumpable obstacle when feet are above clearance threshold', () => {
      insertObstacle(obstacles, 'barrier', 1, 0);
      const player = makePlayer({ y: 1.5 });
      expect(obstacles.checkCollision(player)).toBeNull();
    });

    it('hits jumpable obstacle when jump height is insufficient', () => {
      insertObstacle(obstacles, 'barrier', 1, 0);
      const player = makePlayer({ y: 0.5 });
      expect(obstacles.checkCollision(player)).not.toBeNull();
    });

    it('always hits tall obstacle even at high jump apex', () => {
      insertObstacle(obstacles, 'tall', 1, 0);
      const player = makePlayer({ y: 3.5 });
      expect(obstacles.checkCollision(player)).not.toBeNull();
    });

    it('rejects collision when lateral drift exceeds lane tolerance', () => {
      insertObstacle(obstacles, 'barrier', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ x: LANES[1] + 0.86 }))).toBeNull();
    });

    it('passes under gate obstacles while sliding', () => {
      insertObstacle(obstacles, 'gate', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ isSliding: true }))).toBeNull();
    });

    it('hits gate obstacles while standing', () => {
      insertObstacle(obstacles, 'gate', 1, 0);
      expect(obstacles.checkCollision(makePlayer())).not.toBeNull();
    });

    it('hits gate obstacles even during a high jump (no vaulting over)', () => {
      insertObstacle(obstacles, 'gate', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ y: 1.15 }))).not.toBeNull();
    });

    it('hits gate obstacles during a low hop', () => {
      insertObstacle(obstacles, 'gate', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ y: 0.5 }))).not.toBeNull();
    });

    it('passes under gate obstacles while slide animation is active', () => {
      insertObstacle(obstacles, 'gate', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ isSliding: false, slideBlend: 0.6 }))).toBeNull();
    });

    it('hits low spikes while sliding on the ground', () => {
      insertObstacle(obstacles, 'low', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ isSliding: true, slideBlend: 1 }))).not.toBeNull();
    });

    it('detects collision when high speed skips the point z window in one frame', () => {
      insertObstacle(obstacles, 'barrier', 1, 0.92);
      const player = makePlayer({ isSliding: true, slideBlend: 1 });
      expect(obstacles.checkCollision(player)).toBeNull();
      expect(obstacles.checkCollision(player, 0.55)).not.toBeNull();
    });

    it('detects collision when a fast frame jumps across the entire z window', () => {
      insertObstacle(obstacles, 'low', 1, 1.05);
      const player = makePlayer({ isSliding: true, slideBlend: 1 });
      expect(obstacles.checkCollision(player, 1.55)).not.toBeNull();
    });
  });

  describe('obstacleSweepHitsPlayer', () => {
    it('returns true when the frame span crosses z=0 inside the window', () => {
      expect(obstacleSweepHitsPlayer(0.4, 0.92, COLLISION_Z)).toBe(true);
    });

    it('returns false when the span stays past the forward edge', () => {
      expect(obstacleSweepHitsPlayer(0.48, 1.02, COLLISION_Z)).toBe(false);
    });
  });

  describe('pickType', () => {
    it('includes gate obstacles after early difficulty threshold', () => {
      obstacles.difficulty = 0.2;
      const types = new Set();
      for (let i = 0; i < 80; i++) types.add(obstacles.pickType());
      expect(types.has('gate')).toBe(true);
    });

    it('avoids gate obstacles in the first meters', () => {
      obstacles.difficulty = 0.05;
      for (let i = 0; i < 40; i++) {
        expect(obstacles.pickType()).not.toBe('gate');
      }
    });
  });

  describe('isBlockedPosition', () => {
    it('blocks spawn inside gap margin', () => {
      const gaps = new GapManager(scene);
      insertGap(gaps, -70, 3);
      obstacles.setGapManager(gaps);
      expect(obstacles.isBlockedPosition(-70)).toBe(true);
    });

    it('blocks spawn when obstacles are stacked within margin', () => {
      insertObstacle(obstacles, 'low', 1, -50);
      expect(obstacles.isBlockedPosition(-52)).toBe(true);
      expect(obstacles.isBlockedPosition(-58)).toBe(false);
    });
  });

  describe('removeObstacle', () => {
    it('does not corrupt active count when removing unknown entry', () => {
      insertObstacle(obstacles, 'barrier', 1, -10);
      obstacles.removeObstacle({ type: 'barrier', active: true, slot: 99 });
      expect(obstacles._activeCount).toBe(1);
    });
  });

  describe('difficulty scaling', () => {
    it('accelerates spawn interval as distance increases', () => {
      obstacles.update(0, 14, 0);
      const early = obstacles.spawnInterval;
      obstacles.update(0, 14, 500);
      const late = obstacles.spawnInterval;
      expect(late).toBeLessThan(early);
      expect(late).toBeGreaterThanOrEqual(0.55);
    });
  });
});
