import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BoosterManager, BOOSTER_TYPES } from '../../src/BoosterManager.js';
import { BoosterEffects, JUMP_DURATION } from '../../src/BoosterEffects.js';
import { GapManager, GAP_MARGIN } from '../../src/GapManager.js';
import { ObstacleManager } from '../../src/ObstacleManager.js';
import { LANES } from '../../src/scene.js';
import {
  createScene,
  insertGap,
  insertPickup,
  insertObstacle,
} from '../helpers/fixtures.js';

describe('BoosterManager', () => {
  let scene;
  let effects;
  let manager;

  beforeEach(() => {
    scene = createScene();
    effects = new BoosterEffects();
    manager = new BoosterManager(scene);
    manager.setBoosterEffects(effects);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isTypeSpawnBlocked / getSpawnableTypes', () => {
    it('does not block any type when boosterEffects is not wired', () => {
      const bare = new BoosterManager(createScene());
      expect(bare.getSpawnableTypes()).toEqual(BOOSTER_TYPES);
    });

    it('blocks only held jump while ghost and speed remain spawnable', () => {
      effects.activate('jump');
      expect(manager.isTypeSpawnBlocked('jump')).toBe(true);
      expect(manager.getSpawnableTypes()).toEqual(['ghost', 'speed']);
    });

    it('returns empty spawn pool when all three effects are held simultaneously', () => {
      effects.activate('jump');
      effects.activate('ghost');
      effects.activate('speed');
      expect(manager.getSpawnableTypes()).toHaveLength(0);
      expect(manager.pickType()).toBeNull();
    });

    it('unblocks jump after super jump duration expires', () => {
      effects.activate('jump');
      effects.update(JUMP_DURATION);
      expect(manager.isTypeSpawnBlocked('jump')).toBe(false);
    });
  });

  describe('regression: reset / prefill ordering', () => {
    it('prefill yields zero pickups when prefill runs against fully held effects', () => {
      effects.activate('jump');
      effects.activate('ghost');
      effects.activate('speed');
      manager._activeCount = 0;
      manager.nextZ = -42;
      manager.prefill();
      expect(manager._activeCount).toBe(0);
    });

    it('prefill succeeds after effects.reset() clears held boosters (correct lifecycle)', () => {
      effects.activate('jump');
      effects.activate('ghost');
      effects.activate('speed');
      effects.reset();
      manager._activeCount = 0;
      manager.nextZ = -42;
      manager.prefill();
      expect(manager._activeCount).toBeGreaterThan(0);
    });
  });

  describe('spawn when all types blocked', () => {
    it('does not place pickups and sets retry timer when pickType is null', () => {
      effects.activate('jump');
      effects.activate('ghost');
      effects.activate('speed');
      const before = manager._activeCount;
      manager.spawn();
      expect(manager._activeCount).toBe(before);
      expect(manager.spawnTimer).toBe(1.5);
    });
  });

  describe('isBlockedPosition', () => {
    it('rejects spawn on gap approach margin', () => {
      const gaps = new GapManager(scene);
      insertGap(gaps, -50, 3);
      manager.setGapManager(gaps);
      expect(manager.isBlockedPosition(-50)).toBe(true);
      expect(manager.isBlockedPosition(-59.5)).toBe(false);
    });

    it('rejects spawn when pad span reaches gap even if center is outside margin', () => {
      const gaps = new GapManager(scene);
      insertGap(gaps, -50, 3);
      manager.setGapManager(gaps);
      expect(manager.isBlockedPosition(-58)).toBe(true);
    });

    it('removes existing pickup when a gap later overlaps its span', () => {
      const gaps = new GapManager(scene);
      manager.setGapManager(gaps);
      insertPickup(manager, 'speed', 1, -100);
      expect(manager._activeCount).toBe(1);

      insertGap(gaps, -100, 3);
      manager.update(0.016, 14);

      expect(manager._activeCount).toBe(0);
    });

    it('rejects spawn near existing obstacle', () => {
      const obstacles = new ObstacleManager(scene);
      insertObstacle(obstacles, 'barrier', 1, -60);
      manager.setObstacleManager(obstacles);
      expect(manager.isBlockedPosition(-60)).toBe(true);
      expect(manager.isBlockedPosition(-66)).toBe(false);
    });

    it('rejects spawn when another pickup occupies nearby z', () => {
      insertPickup(manager, 'speed', 1, -40);
      expect(manager.isBlockedPosition(-42)).toBe(true);
    });
  });

  describe('checkCollection boundaries', () => {
    it('collects floating pickup at z within threshold only on matching lane', () => {
      const pickup = insertPickup(manager, 'jump', 1, 0.54);
      expect(manager.checkCollection(LANES[1], 1)).toBe(pickup);
      expect(manager.checkCollection(LANES[1], 0)).toBeNull();
      expect(manager.checkCollection(LANES[0], 1)).toBeNull();
    });

    it('rejects floating pickup just outside z threshold', () => {
      insertPickup(manager, 'ghost', 1, 0.56);
      expect(manager.checkCollection(LANES[1], 1)).toBeNull();
    });

    it('uses wider z window for speed pad than floating signs', () => {
      insertPickup(manager, 'speed', 1, 2.04);
      expect(manager.checkCollection(LANES[1], 1)).not.toBeNull();

      manager.reset();
      insertPickup(manager, 'jump', 1, 2.04);
      expect(manager.checkCollection(LANES[1], 1)).toBeNull();
    });

    it('rejects collection when player x drift exceeds lane tolerance', () => {
      insertPickup(manager, 'jump', 1, 0);
      expect(manager.checkCollection(LANES[1] + 0.86, 1)).toBeNull();
      expect(manager.checkCollection(LANES[1] + 0.84, 1)).not.toBeNull();
    });

    it('rejects floating pickup when player is jumping far above it', () => {
      insertPickup(manager, 'jump', 1, 0);
      const pickup = manager.pickups[manager._activeCount - 1];
      pickup.y = 0.95;
      expect(manager.checkCollection(LANES[1], 1, 1.6)).toBeNull();
    });

    it('rejects speed pad when player is airborne above it', () => {
      insertPickup(manager, 'speed', 1, 0);
      manager.pickups[manager._activeCount - 1].y = 0.03;
      expect(manager.checkCollection(LANES[1], 1, 1.2)).toBeNull();
    });

    it('collects speed pad while sliding on the ground', () => {
      insertPickup(manager, 'speed', 1, 0);
      expect(manager.checkCollection(LANES[1], 1, 0, true)).not.toBeNull();
    });

    it('collects floating booster while sliding on the ground', () => {
      insertPickup(manager, 'jump', 1, 0);
      expect(manager.checkCollection(LANES[1], 1, 0, true)).not.toBeNull();
    });
  });

  describe('pickup lifecycle', () => {
    it('recycles pickup past despawn z without leaking active count', () => {
      const pickup = insertPickup(manager, 'ghost', 1, 7.5);
      vi.spyOn(manager, 'spawn').mockImplementation(() => {});
      manager.update(0.1, 100);
      expect(pickup.active).toBe(false);
      expect(manager._activeCount).toBe(0);
    });

    it('removePickup is idempotent for unknown entry', () => {
      const fake = { type: 'jump', active: true, slot: 0 };
      expect(() => manager.removePickup(fake)).not.toThrow();
      expect(manager._activeCount).toBe(0);
    });
  });

  describe('getFurthestZ spawn pressure', () => {
    it('reports 0 when track is empty (lookahead spawn pressure stays high)', () => {
      expect(manager.getFurthestZ()).toBe(0);
    });

    it('tracks furthest active pickup behind player', () => {
      insertPickup(manager, 'speed', 0, -30);
      insertPickup(manager, 'ghost', 1, -80);
      expect(manager.getFurthestZ()).toBe(-80);
    });
  });
});
