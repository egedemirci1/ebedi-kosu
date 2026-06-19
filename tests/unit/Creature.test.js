import { describe, it, expect, beforeEach } from 'vitest';
import { Creature } from '../../src/Creature.js';
import { createScene } from '../helpers/fixtures.js';

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
      creature.chaseDistance = creature.minDistance;
      expect(creature.dangerLevel).toBe(1);
    });

    it('clamps below zero when chase distance overshoots far range', () => {
      creature.chaseDistance = 30;
      expect(creature.dangerLevel).toBe(0);
    });

    it('clamps above one when chase distance is inside minimum', () => {
      creature.chaseDistance = 0.5;
      expect(creature.dangerLevel).toBe(1);
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
    it('is false while outside catch radius', () => {
      creature.chaseDistance = creature.minDistance + 0.01;
      expect(creature.hasCaught()).toBe(false);
    });

    it('is true at or inside minimum distance', () => {
      creature.chaseDistance = creature.minDistance;
      expect(creature.hasCaught()).toBe(true);
      creature.chaseDistance = creature.minDistance - 0.5;
      expect(creature.hasCaught()).toBe(true);
    });
  });

  describe('update chase dynamics', () => {
    it('closes distance faster while player is stumbling', () => {
      creature.chaseDistance = 12;
      creature.targetDistance = 10;
      creature.update(0.5, 0, false);
      const normalDistance = creature.chaseDistance;

      creature.chaseDistance = 12;
      creature.targetDistance = 10;
      creature.update(0.5, 0, true);
      expect(creature.chaseDistance).toBeLessThan(normalDistance);
    });

    it('keeps full chase distance while running cleanly', () => {
      creature.lungeTimer = 0;
      creature.chaseDistance = 14;
      creature.update(2, 0, false);
      expect(creature.targetDistance).toBe(14);
      expect(creature.chaseDistance).toBeGreaterThan(13.5);
    });

    it('lowers target distance while player is stumbling', () => {
      creature.lungeTimer = 0;
      creature.update(0.01, 0, false);
      const runningTarget = creature.targetDistance;

      creature.chaseDistance = 14;
      creature.update(0.01, 0, true);
      expect(creature.targetDistance).toBeLessThan(runningTarget);
    });
  });

  describe('reset', () => {
    it('restores chase state after lunge and catch pressure', () => {
      creature.lunge(5);
      creature.chaseDistance = creature.minDistance;
      creature.reset();
      expect(creature.chaseDistance).toBe(14);
      expect(creature.targetDistance).toBe(14);
      expect(creature.lungeTimer).toBe(0);
      expect(creature.hasCaught()).toBe(false);
    });
  });
});
