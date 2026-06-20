import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../../src/Creature.js';
import { createScene } from '../helpers/fixtures.js';
import { DANGER_PER_HIT } from '../../shared/runPhysics.js';

describe('Creature', () => {
  let scene;
  let creature;

  beforeEach(() => {
    scene = createScene();
    creature = new Creature(scene);
  });

  describe('dangerLevel', () => {
    it('is zero at starting chase distance', () => {
      expect(creature.dangerLevel).toBe(0);
    });

    it('reaches maximum at catch threshold', () => {
      creature.forceCatch();
      expect(creature.dangerLevel).toBe(1);
    });

    it('tracks hit pressure rather than chase distance alone', () => {
      creature.applyHitDanger(0.4);
      expect(creature.dangerLevel).toBeCloseTo(0.4, 2);
    });
  });

  describe('applyHitDanger', () => {
    it('sets danger to match bar fill', () => {
      creature.applyHitDanger(0.4);
      expect(creature.dangerLevel).toBeCloseTo(0.4, 2);
    });

    it('lets the creature retreat while running cleanly', () => {
      creature.applyHitDanger(0.4);
      creature.lungeTimer = 0;
      creature.update(3, 0, false);
      expect(creature.dangerLevel).toBeLessThan(0.4);
      expect(creature.chaseDistance).toBeGreaterThan(creature.chaseDistanceForDanger(0.4));
    });
  });

  describe('forceCatch', () => {
    it('reaches catch threshold immediately', () => {
      creature.forceCatch();
      expect(creature.dangerLevel).toBe(1);
      expect(creature.hasCaught()).toBe(true);
    });
  });

  describe('lunge', () => {
    it('never pulls chase distance below minimum floor', () => {
      creature.chaseDistance = creature.minDistance + 0.1;
      creature.lunge(100);
      expect(creature.chaseDistance).toBeGreaterThanOrEqual(creature.minDistance);
      expect(creature.targetDistance).toBeGreaterThanOrEqual(creature.minDistance);
    });

    it('sets lunge timer to extend aggressive catch-up phase', () => {
      creature.lunge(3);
      expect(creature.lungeTimer).toBeGreaterThan(0);
    });
  });

  describe('hasCaught', () => {
    it('is false below full danger', () => {
      creature.pressure = 0.8;
      expect(creature.hasCaught()).toBe(false);
    });

    it('is true at full danger', () => {
      creature.forceCatch();
      expect(creature.hasCaught()).toBe(true);
    });
  });

  describe('update chase dynamics', () => {
    it('closes distance faster while player is stumbling', () => {
      creature.pressure = 0.55;
      creature.chaseDistance = 10;
      creature.lungeTimer = 0;
      creature.update(0.08, 0, false);
      const normalDistance = creature.chaseDistance;

      creature.chaseDistance = 10;
      creature.lungeTimer = 0;
      creature.update(0.08, 0, true);
      expect(creature.chaseDistance).toBeLessThan(normalDistance);
    });

    it('keeps full chase distance while running cleanly', () => {
      creature.lungeTimer = 0;
      creature.chaseDistance = 11;
      creature.update(2, 0, false);
      expect(creature.targetDistance).toBe(11);
      expect(creature.chaseDistance).toBeGreaterThan(10.5);
    });

    it('snaps in quickly during the post-hit lunge window', () => {
      creature.pressure = 0.4;
      creature.chaseDistance = 10;
      creature.targetDistance = creature.chaseDistanceForDanger(0.4);
      creature.lungeTimer = 0.8;
      creature.update(0.05, 0, false);
      expect(creature.chaseDistance).toBeLessThan(9);
    });
  });

  describe('visibility', () => {
    it('stays hidden below the visibility threshold', () => {
      creature.applyHitDanger(0.3);
      expect(creature.visibilityForPressure()).toBe(0);
    });

    it('fades in at 40% danger', () => {
      creature.applyHitDanger(0.4);
      expect(creature.visibilityForPressure()).toBeGreaterThan(0);
    });

    it('is fully visible at full danger', () => {
      creature.applyHitDanger(1);
      expect(creature.visibilityForPressure()).toBe(1);
    });
  });

  describe('addHitPressure', () => {
    it('adds 40% per hit', () => {
      creature.addHitPressure(DANGER_PER_HIT);
      expect(creature.dangerLevel).toBeCloseTo(0.4, 2);
    });

    it('accumulates across hits and catches at 100%', () => {
      creature.addHitPressure(DANGER_PER_HIT);
      creature.addHitPressure(DANGER_PER_HIT);
      expect(creature.dangerLevel).toBeCloseTo(0.8, 2);
      expect(creature.hasCaught()).toBe(false);

      creature.addHitPressure(DANGER_PER_HIT);
      expect(creature.dangerLevel).toBe(1);
      expect(creature.hasCaught()).toBe(true);
    });

    it('resets pressure after full decay', () => {
      creature.addHitPressure(DANGER_PER_HIT);
      creature.lungeTimer = 0;
      creature.update(25, 0, false);
      expect(creature.pressure).toBe(0);
    });
  });

  describe('reset', () => {
    it('restores chase state after lunge and catch pressure', () => {
      creature.lunge(5);
      creature.chaseDistance = creature.minDistance;
      creature.reset();
      expect(creature.chaseDistance).toBe(11);
      expect(creature.targetDistance).toBe(11);
      expect(creature.lungeTimer).toBe(0);
      expect(creature.hasCaught()).toBe(false);
    });
  });
});
