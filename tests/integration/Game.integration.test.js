import '../helpers/gameHarness.js';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SUPER_JUMP_VY } from '../../src/BoosterEffects.js';
import { clearGameDOM } from '../helpers/gameDom.js';
import { createGameInstance } from '../helpers/gameHarness.js';

describe('Game integration', () => {
  let game;

  beforeEach(async () => {
    localStorage.clear();
    game = await createGameInstance();
    game.state = 'playing';
  });

  afterEach(() => {
    clearGameDOM();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('applyHit ghost immunity', () => {
    it('ignores obstacle stumble while ghost is active', () => {
      game.boosters.activate('ghost');
      game.applyHit(0);
      expect(game.player.isStumbling).toBe(false);
      expect(game.sfx.playObstacleHit).not.toHaveBeenCalled();
    });

    it('still applies wall stumble while ghost is active', () => {
      game.boosters.activate('ghost');
      game.applyHit(-1);
      expect(game.player.isStumbling).toBe(true);
      expect(game.sfx.playWallHit).toHaveBeenCalledWith(-1);
    });

    it('stumbles on obstacle hit without ghost', () => {
      game.applyHit(0);
      expect(game.player.isStumbling).toBe(true);
      expect(game.sfx.playObstacleHit).toHaveBeenCalled();
      expect(game.shakeIntensity).toBeGreaterThan(0);
    });
  });

  describe('tryJump / super jump consumption', () => {
    it('consumes super jump only after successful grounded jump', () => {
      game.boosters.activate('jump');
      game.player.onGround = true;
      game.tryJump();
      expect(game.boosters.superJumpReady).toBe(false);
      expect(game.player.vy).toBe(SUPER_JUMP_VY);
      expect(game.sfx.playJump).toHaveBeenCalled();
    });

    it('does not consume super jump when airborne', () => {
      game.boosters.activate('jump');
      game.player.onGround = false;
      game.tryJump();
      expect(game.boosters.superJumpReady).toBe(true);
      expect(game.sfx.playJump).not.toHaveBeenCalled();
    });
  });

  describe('resetWorld lifecycle', () => {
    it('clears held boosters before repopulating pickups (regression)', () => {
      game.boosters.activate('jump');
      game.boosters.activate('ghost');
      game.boosters.activate('speed');
      game.resetWorld();

      expect(game.boosters.superJumpReady).toBe(false);
      expect(game.boosters.isGhostActive()).toBe(false);
      expect(game.boosters.isSpeedActive()).toBe(false);
      expect(game.pickups._activeCount).toBeGreaterThan(0);
    });

    it('resets player fall state and distance', () => {
      game.distance = 420;
      game.player.isFalling = true;
      game.player.y = -2;
      game.resetWorld();

      expect(game.distance).toBe(0);
      expect(game.player.isFalling).toBe(false);
      expect(game.player.y).toBe(0);
      expect(game.player.onGround).toBe(true);
    });
  });

  describe('update gameplay loop', () => {
    it('triggers fell game over when player drops below void threshold', () => {
      const spy = vi.spyOn(game, 'gameOver');
      game.player.isFalling = true;
      game.player.y = -3.1;
      game.update(0.016);
      expect(spy).toHaveBeenCalledWith('fell');
    });

    it('skips obstacle stumble while ghost is active during update', () => {
      game.boosters.activate('ghost');
      game.obstacles.acquireObstacle('barrier', 1, 0);
      game.update(0.016);
      expect(game.player.isStumbling).toBe(false);
    });

    it('collects booster pickup and updates HUD state', () => {
      game.pickups.acquirePickup('speed', 1, 0);
      game.player.laneIndex = 1;
      game.player.x = 0;
      game.update(0.016);
      expect(game.boosters.isSpeedActive()).toBe(true);
      expect(game.ui.boosterSpeed.classList.contains('active')).toBe(true);
    });
  });

  describe('saveBestScore', () => {
    it('does not downgrade stored high score', () => {
      localStorage.setItem('ebedi-kosu-best', '500');
      game.saveBestScore(120);
      expect(game.getBestScore()).toBe(500);
    });

    it('persists new record distance', () => {
      game.saveBestScore(250.9);
      expect(game.getBestScore()).toBe(250);
    });
  });

  describe('pause / resume state machine', () => {
    it('rejects resume from non-paused states', () => {
      game.state = 'playing';
      game.resume();
      expect(game.state).toBe('playing');
    });

    it('transitions playing → paused → playing', () => {
      game.pause();
      expect(game.state).toBe('paused');
      game.resume();
      expect(game.state).toBe('playing');
    });
  });
});
