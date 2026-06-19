import { describe, it, expect, beforeEach } from 'vitest';
import { ObstacleManager } from '../../src/ObstacleManager.js';
import { LANES } from '../../src/scene.js';
import { createScene, insertGap, insertObstacle } from '../helpers/fixtures.js';
import { GapManager } from '../../src/GapManager.js';

function makePlayer({ x = LANES[1], y = 0, laneIndex = 1 } = {}) {
  return { x, y, laneIndex };
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
      expect(late).toBeGreaterThanOrEqual(0.9);
    });
  });
});
