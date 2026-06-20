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

    it('raises danger by 40% after the first hit', () => {
      game.applyHit(0);
      expect(game.creature.dangerLevel).toBeCloseTo(0.4, 2);
    });

    it('catches the player on the third hit (40 + 40 + 40)', () => {
      game.applyHit(0);
      game.applyHit(0);
      expect(game.creature.dangerLevel).toBeCloseTo(0.8, 2);
      expect(game.creature.hasCaught()).toBe(false);
      game.applyHit(0);
      expect(game.creature.dangerLevel).toBe(1);
      expect(game.creature.hasCaught()).toBe(true);
    });

    it('adds another 40% on second hit after partial decay', () => {
      game.applyHit(0);
      game.creature.pressure = 0.25;
      game.creature.chaseDistance = game.creature.chaseDistanceForDanger(0.25);
      game.creature.targetDistance = game.creature.chaseDistance;
      game.applyHit(0);
      expect(game.creature.dangerLevel).toBeCloseTo(0.65, 2);
      expect(game.creature.hasCaught()).toBe(false);
    });

    it('allows a fresh 40% after full recovery', () => {
      game.applyHit(0);
      game.creature.pressure = 0;
      game.applyHit(0);
      expect(game.creature.dangerLevel).toBeCloseTo(0.4, 2);
      expect(game.creature.hasCaught()).toBe(false);
    });
  });

  describe('tryJump / super jump duration', () => {
    it('keeps super jump active after a successful grounded jump', () => {
      game.boosters.activate('jump');
      game.player.onGround = true;
      game.tryJump();
      expect(game.boosters.isSuperJumpActive()).toBe(true);
      expect(game.player.vy).toBe(SUPER_JUMP_VY);
      expect(game.sfx.playJump).toHaveBeenCalled();
    });

    it('does not end super jump when airborne', () => {
      game.boosters.activate('jump');
      game.player.onGround = false;
      game.tryJump();
      expect(game.boosters.isSuperJumpActive()).toBe(true);
      expect(game.sfx.playJump).not.toHaveBeenCalled();
    });
  });

  describe('run session', () => {
    it('keeps run token after start() resets the world', async () => {
      game.ui.playerNameInput.value = 'egge';
      await game.start();
      expect(game.runToken).toBe('test-token');
    });
  });

  describe('resetWorld lifecycle', () => {
    it('clears held boosters before repopulating pickups (regression)', () => {
      game.boosters.activate('jump');
      game.boosters.activate('ghost');
      game.boosters.activate('speed');
      game.resetWorld();

      expect(game.boosters.isSuperJumpActive()).toBe(false);
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
      game._fallScreamPlayed = true;
      game.player.y = -3.1;
      game.update(0.016);
      expect(spy).toHaveBeenCalledWith('fell');
    });

    it('plays fall scream once when void fall begins', () => {
      game._fallScreamPlayed = false;
      game.player.onGround = true;
      game.player.isJumping = false;
      game.player.isFalling = false;
      game.player.update(0.016, false, false);
      expect(game.player.isFalling).toBe(true);
      game.update(0.016);
      expect(game.sfx.playFallScream).toHaveBeenCalledTimes(1);
      game.update(0.016);
      expect(game.sfx.playFallScream).toHaveBeenCalledTimes(1);
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

    it('does not collect coin while jumping far above it', () => {
      game.coins.acquireCoin(1, 0);
      game.coins.coins[game.coins._activeCount - 1].y = 0.85;
      game.player.laneIndex = 1;
      game.player.x = 0;
      game.player.onGround = false;
      game.player.isJumping = true;
      game.player.vy = 0;
      game.player.y = 1.8;
      game.update(0.016);
      expect(game.sessionCoins).toBe(0);
    });

    it('collects coin at ground level and persists session count', () => {
      game.coins.acquireCoin(1, 0);
      game.coins.coins[game.coins._activeCount - 1].y = 0.85;
      game.player.laneIndex = 1;
      game.player.x = 0;
      game.player.y = 0;
      game.update(0.016);
      expect(game.sessionCoins).toBe(1);
      expect(game.sfx.playCoinPickup).toHaveBeenCalled();
    });

    it('does not collect booster while jumping far above floating sign', () => {
      game.pickups.acquirePickup('jump', 1, 0);
      game.pickups.pickups[game.pickups._activeCount - 1].y = 0.95;
      game.player.laneIndex = 1;
      game.player.x = 0;
      game.player.onGround = false;
      game.player.isJumping = true;
      game.player.vy = 0;
      game.player.y = 1.7;
      game.update(0.016);
      expect(game.boosters.isSuperJumpActive()).toBe(false);
    });

    it('does not pull creature closer when speed booster is active', () => {
      game.distance = 250;
      game.boosters.activate('speed');
      game.creature.chaseDistance = 11;
      game.creature.targetDistance = 11;
      game.player.isStumbling = false;

      for (let i = 0; i < 40; i++) game.update(0.05);

      expect(game.creature.targetDistance).toBe(11);
      expect(game.creature.dangerLevel).toBeLessThan(0.05);
    });

    it('passes gate barrier while sliding', () => {
      game.obstacles.acquireObstacle('gate', 1, 0);
      game.player.laneIndex = 1;
      game.player.x = 0;
      game.player.isSliding = true;
      game.player.slideBlend = 1;
      game.update(0.016);
      expect(game.player.isStumbling).toBe(false);
    });

    it('stumbles on gate barrier while standing', () => {
      game.obstacles.acquireObstacle('gate', 1, 0);
      game.player.laneIndex = 1;
      game.player.x = 0;
      game.player.y = 0;
      game.player.isSliding = false;
      game.player.slideBlend = 0;
      game.update(0.016);
      expect(game.player.isStumbling).toBe(true);
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
