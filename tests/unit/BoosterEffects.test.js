import { describe, it, expect, beforeEach } from 'vitest';
import {
  BoosterEffects,
  GHOST_DURATION,
  JUMP_DURATION,
  SPEED_DURATION,
  SPEED_MULTIPLIER,
} from '../../src/BoosterEffects.js';

describe('BoosterEffects', () => {
  let effects;

  beforeEach(() => {
    effects = new BoosterEffects();
  });

  describe('super jump duration', () => {
    it('stays active for JUMP_DURATION and allows repeated super jumps', () => {
      effects.activate('jump');
      expect(effects.isSuperJumpActive()).toBe(true);
      effects.update(1);
      expect(effects.isSuperJumpActive()).toBe(true);
      effects.update(JUMP_DURATION - 1);
      expect(effects.isSuperJumpActive()).toBe(false);
    });

    it('re-activating jump refreshes duration', () => {
      effects.activate('jump');
      effects.update(3);
      effects.activate('jump');
      expect(effects.jumpTimer).toBe(JUMP_DURATION);
    });
  });

  describe('timer decay edge cases', () => {
    it('does not undershoot past zero on large dt (ghost)', () => {
      effects.activate('ghost');
      effects.update(GHOST_DURATION + 10);
      expect(effects.ghostTimer).toBe(0);
      expect(effects.isGhostActive()).toBe(false);
    });

    it('does not undershoot past zero on large dt (jump)', () => {
      effects.activate('jump');
      effects.update(JUMP_DURATION + 10);
      expect(effects.jumpTimer).toBe(0);
      expect(effects.isSuperJumpActive()).toBe(false);
    });

    it('does not undershoot past zero on large dt (speed)', () => {
      effects.activate('speed');
      effects.update(SPEED_DURATION + 100);
      expect(effects.speedTimer).toBe(0);
      expect(effects.isSpeedActive()).toBe(false);
    });

    it('treats timer exactly at zero as inactive', () => {
      effects.ghostTimer = 0.001;
      effects.update(0.001);
      expect(effects.isGhostActive()).toBe(false);
      expect(effects.getSpeedMultiplier()).toBe(1);
    });
  });

  describe('activate unknown / invalid types', () => {
    it('ignores unknown booster type without mutating state', () => {
      effects.activate('teleport');
      expect(effects.getHudState()).toEqual({
        ghost: 0,
        speed: 0,
        jump: 0,
      });
    });
  });

  describe('effect stacking and refresh', () => {
    it('re-activating ghost refreshes duration instead of stacking timers', () => {
      effects.activate('ghost');
      effects.update(3);
      effects.activate('ghost');
      expect(effects.ghostTimer).toBe(GHOST_DURATION);
    });

    it('timed boosters expire independently', () => {
      effects.activate('jump');
      effects.activate('ghost');
      effects.activate('speed');
      effects.update(Math.max(GHOST_DURATION, JUMP_DURATION, SPEED_DURATION) + 0.1);
      expect(effects.isSuperJumpActive()).toBe(false);
      expect(effects.isGhostActive()).toBe(false);
      expect(effects.isSpeedActive()).toBe(false);
    });
  });

  describe('getSpeedMultiplier', () => {
    it('returns base multiplier when speed timer is exhausted', () => {
      effects.activate('speed');
      effects.update(SPEED_DURATION);
      expect(effects.getSpeedMultiplier()).toBe(1);
    });

    it('returns boost multiplier while any speed time remains', () => {
      effects.activate('speed');
      effects.update(SPEED_DURATION - 0.01);
      expect(effects.getSpeedMultiplier()).toBe(SPEED_MULTIPLIER);
    });
  });

  describe('reset', () => {
    it('clears partially consumed session state', () => {
      effects.activate('jump');
      effects.activate('ghost');
      effects.update(1);
      effects.reset();
      expect(effects.getHudState()).toEqual({
        ghost: 0,
        speed: 0,
        jump: 0,
      });
    });
  });
});
