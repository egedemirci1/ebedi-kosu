import { describe, it, expect, beforeEach } from 'vitest';
import { ObstacleManager, obstacleSweepHitsPlayer, COLLISION_Z } from '../../src/ObstacleManager.js';
import { LANES } from '../../src/scene.js';
import { createScene, insertGap, insertObstacle } from '../helpers/fixtures.js';
import { GapManager } from '../../src/GapManager.js';

function makePlayer({
  x = LANES[1],
  y = 0,
  laneIndex = 1,
  isSliding = false,
  slideBlend = 0,
  canVaultGate = false,
} = {}) {
  return {
    x,
    y,
    laneIndex,
    isSliding,
    slideBlend,
    canVaultGate,
    get isSlideActive() {
      return isSliding || slideBlend > 0.45;
    },
    get hitbox() {
      if (isSliding || slideBlend > 0.35) {
        return { x, y: y + 0.46, z: 0, radius: 0.42, height: 0.68 };
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

    it('hits gate obstacles during a normal jump that stays below the beam', () => {
      insertObstacle(obstacles, 'gate', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ y: 1.15 }))).not.toBeNull();
    });

    it('passes over gate obstacles when feet clear the beam top', () => {
      insertObstacle(obstacles, 'gate', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ y: 1.6 }))).toBeNull();
    });

    it('passes gate obstacles while super jump vault is active', () => {
      insertObstacle(obstacles, 'gate', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ y: 0.4, canVaultGate: true }))).toBeNull();
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

    it('hits low spikes while slide blend is active without isSliding', () => {
      insertObstacle(obstacles, 'low', 1, 0);
      expect(obstacles.checkCollision(makePlayer({ isSliding: false, slideBlend: 0.5 }))).not.toBeNull();
    });

    it('detects low spikes when slide z offset would miss a narrow z window', () => {
      insertObstacle(obstacles, 'low', 1, 0.62);
      const player = makePlayer({ isSliding: true, slideBlend: 1 });
      expect(obstacles.checkCollision(player)).not.toBeNull();
    });

    it('hits low spikes during slow slide-out when slideBlend is between 0.35 and 0.45', () => {
      insertObstacle(obstacles, 'low', 1, 0.55);
      const player = makePlayer({ isSliding: false, slideBlend: 0.4 });
      expect(obstacles.checkCollision(player)).not.toBeNull();
      expect(obstacles.checkCollision(player, 0.02)).not.toBeNull();
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
    it('includes gate obstacles after the 1k tier', () => {
      obstacles.difficulty = 0.22;
      const types = new Set();
      for (let i = 0; i < 80; i++) types.add(obstacles.pickType());
      expect(types.has('gate')).toBe(true);
    });

    it('avoids gate obstacles during tutorial difficulty', () => {
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

    it('allows spawn on post-gap floor where full gap margin would block', () => {
      const gaps = new GapManager(scene);
      insertGap(gaps, -50, 3);
      obstacles.setGapManager(gaps);
      expect(obstacles.isBlockedPosition(-47.5)).toBe(false);
    });

    it('uses post-gap corridor when the near band is occupied', () => {
      const gaps = new GapManager(scene);
      insertGap(gaps, -50, 3);
      obstacles.setGapManager(gaps);
      for (let z = -11; z >= -44; z -= 4) {
        insertObstacle(obstacles, 'barrier', 1, z);
      }
      const spawnZ = obstacles.resolveSpawnZ();
      expect(spawnZ).toBeGreaterThan(-48.5);
      expect(spawnZ).toBeLessThan(-32.5);
      expect(obstacles.isBlockedPosition(spawnZ)).toBe(false);
    });

    it('prefers spawn positions close to the player', () => {
      insertObstacle(obstacles, 'barrier', 1, -120);
      obstacles.nextZ = -125;
      const spawnZ = obstacles.resolveSpawnZ();
      expect(spawnZ).toBeGreaterThan(-80);
    });

    it('does not spawn closer than min ahead distance during normal play', () => {
      obstacles.currentSpeed = 14;
      const spawnZ = obstacles.resolveSpawnZ();
      expect(spawnZ).toBeLessThanOrEqual(obstacles.minSpawnAheadZ());
    });

    it('ignores nextZ when it is closer than min ahead distance', () => {
      obstacles.currentSpeed = 18;
      obstacles.nextZ = -12;
      const spawnZ = obstacles.resolveSpawnZ();
      expect(spawnZ).toBeLessThanOrEqual(obstacles.minSpawnAheadZ());
      expect(spawnZ).toBeGreaterThan(-80);
    });

    it('forces spawn after a distance drought', () => {
      const gaps = new GapManager(scene);
      obstacles.setGapManager(gaps);
      obstacles.update(0, 18, 900);
      obstacles.lastSpawnDistance = 850;
      obstacles._activeCount = 0;
      obstacles.nextZ = -45;
      const before = obstacles._activeCount;
      obstacles.update(0, 18, 900);
      expect(obstacles._activeCount).toBeGreaterThan(before);
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
      obstacles.update(0, 14, 500);
      const tutorial = obstacles.spawnInterval;
      obstacles.update(0, 14, 1200);
      const tierOne = obstacles.spawnInterval;
      obstacles.update(0, 14, 3500);
      const mid = obstacles.spawnInterval;
      obstacles.update(0, 14, 12000);
      const late = obstacles.spawnInterval;
      expect(tierOne).toBeLessThan(tutorial);
      expect(mid).toBeLessThan(tierOne);
      expect(late).toBeLessThanOrEqual(mid);
      expect(late).toBeGreaterThanOrEqual(0.3);
    });
  });
});
