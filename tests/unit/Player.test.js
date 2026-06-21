import { describe, it, expect, beforeEach } from 'vitest';
import { Player } from '../../src/Player.js';
import { createScene } from '../helpers/fixtures.js';

describe('Player', () => {
  let scene;
  let player;

  beforeEach(() => {
    scene = createScene();
    player = new Player(scene);
  });

  describe('jump', () => {
    it('rejects jump while airborne', () => {
      player.onGround = false;
      player.isJumping = true;
      expect(player.jump()).toBe(false);
      expect(player.vy).toBe(0);
    });

    it('rejects super jump while airborne without consuming booster elsewhere', () => {
      player.onGround = false;
      expect(player.jump(true)).toBe(false);
    });

    it('uses higher initial velocity for super jump than normal jump', () => {
      player.jump(false);
      const normalVy = player.vy;
      player.onGround = true;
      player.isJumping = false;
      player.vy = 0;

      player.jump(true);
      expect(player.vy).toBeGreaterThan(normalVy);
    });
  });

  describe('fast fall', () => {
    it('drops faster toward the ground while fast-fall is held in the air', () => {
      player.jump(false);
      const startVy = player.vy;
      player.update(0.016, true, true);
      expect(player.vy).toBeLessThan(startVy);
    });

    it('does not fast fall while grounded', () => {
      player.onGround = true;
      player.vy = 0;
      player.update(0.016, true, true);
      expect(player.vy).toBe(0);
    });

    it('does not fast fall during irreversible void drop', () => {
      player.onGround = true;
      player.update(0.016, false);
      expect(player.isFalling).toBe(true);
      player.update(0.016, false, true);
      expect(player.vy).toBeGreaterThan(-20);
    });
  });

  describe('slide', () => {
    it('enters slide while holding down on the ground', () => {
      player.update(0.016, true, true);
      expect(player.isSliding).toBe(true);
    });

    it('does not slide while airborne', () => {
      player.jump(false);
      player.update(0.016, true, true);
      expect(player.isSliding).toBe(false);
    });

    it('startSlide keeps sliding until timer expires without holding down', () => {
      player.startSlide(0.2);
      expect(player.isSliding).toBe(true);
      player.update(0.05, true, false);
      expect(player.isSliding).toBe(true);
      player.update(0.2, true, false);
      expect(player.isSliding).toBe(false);
    });

    it('cancels slide when jumping', () => {
      player.update(0.016, true, true);
      expect(player.isSliding).toBe(true);
      player.jump(false);
      expect(player.isSliding).toBe(false);
    });

    it('uses a shorter hitbox while sliding', () => {
      player.isSliding = true;
      expect(player.hitbox.height).toBeLessThan(1);
    });

    it('signals slide start once when entering slide', () => {
      player.update(0.016, true, true);
      expect(player.consumeSlideStart()).toBe(true);
      expect(player.consumeSlideStart()).toBe(false);
    });

    it('spawns slide sparks while sliding on the ground', () => {
      player.update(0.016, true, true);
      for (let i = 0; i < 8; i++) player.update(0.03, true, true);
      const activeSparks = player.slideSparks.filter((s) => s.life > 0);
      expect(activeSparks.length).toBeGreaterThan(0);
    });

    it('queues slide when requesting slide down while airborne', () => {
      player.jump(false);
      expect(player.requestSlideDown()).toBe(false);
      expect(player.isSliding).toBe(false);

      let landedSliding = false;
      for (let i = 0; i < 200; i++) {
        player.update(0.016, true, false);
        if (player.onGround && player.isSliding) {
          landedSliding = true;
          break;
        }
      }
      expect(landedSliding).toBe(true);
    });

    it('starts slide immediately when requesting slide down on the ground', () => {
      expect(player.requestSlideDown()).toBe(true);
      expect(player.isSliding).toBe(true);
    });

    it('clears queued slide when jumping from the ground', () => {
      player._slideQueued = true;
      player.jump(false);
      expect(player._slideQueued).toBe(false);
    });
  });

  describe('lane walls', () => {
    it('returns wall when moving left from leftmost lane', () => {
      player.laneIndex = 0;
      expect(player.moveLeft()).toBe('wall');
      expect(player.laneIndex).toBe(0);
    });

    it('returns wall when moving right from rightmost lane', () => {
      player.laneIndex = 2;
      expect(player.moveRight()).toBe('wall');
      expect(player.laneIndex).toBe(2);
    });
  });

  describe('setGhostVisual', () => {
    it('is idempotent when toggling same state repeatedly', () => {
      player.setGhostVisual(true);
      const opacity = player.bodyMat.opacity;
      player.setGhostVisual(true);
      expect(player.bodyMat.opacity).toBe(opacity);
    });

    it('restores opaque materials after ghost ends', () => {
      player.setGhostVisual(true);
      player.setGhostVisual(false);
      expect(player.bodyMat.transparent).toBe(false);
      expect(player.bodyMat.opacity).toBe(1);
    });
  });

  describe('gap / void fall physics', () => {
    it('enters falling state when floor disappears under grounded player', () => {
      player.onGround = true;
      player.isJumping = false;
      player.update(0.016, false);
      expect(player.isFalling).toBe(true);
      expect(player.onGround).toBe(false);
      expect(player.vy).toBeLessThan(0);
    });

    it('does not re-trigger void drop while already airborne from jump', () => {
      player.onGround = false;
      player.isJumping = true;
      player.vy = 8;
      player.update(0.016, false);
      expect(player.vy).toBeLessThan(8);
      expect(player.isFalling).toBe(false);
    });

    it('accelerates downward in void with stronger gravity than normal jump arc', () => {
      player.onGround = true;
      player.update(0.016, false);
      const voidVy = player.vy;
      player.onGround = true;
      player.isFalling = false;
      player.isJumping = false;
      player.vy = 0;
      player.jump(false);
      expect(voidVy).toBeLessThan(player.vy);
    });

    it('continues falling deeper while hasFloor remains false', () => {
      player.onGround = true;
      player.update(0.05, false);
      const startY = player.y;
      for (let i = 0; i < 20; i++) player.update(0.05, false);
      expect(player.y).toBeLessThan(startY);
      expect(player.isFalling).toBe(true);
    });

    it('does not recover from void fall when floor returns (irreversible until game over)', () => {
      player.onGround = true;
      player.update(0.05, false);
      for (let i = 0; i < 30; i++) player.update(0.05, false);
      player.update(0.05, true);
      expect(player.isFalling).toBe(true);
      expect(player.y).toBeLessThan(0);
      expect(player.onGround).toBe(false);
    });
  });

  describe('stumble and wall bounce', () => {
    it('clears stumble after timer expires', () => {
      player.stumble(0.1, 0);
      player.update(0.05);
      expect(player.isStumbling).toBe(true);
      player.update(0.08);
      expect(player.isStumbling).toBe(false);
    });

    it('starts wall bounce only for wall-side stumbles', () => {
      player.stumble(0.6, -1);
      expect(player.wallBounceTimer).toBeGreaterThan(0);
      expect(player.wallBounceSide).toBe(-1);

      player.wallBounceTimer = 0;
      player.stumble(0.6, 0);
      expect(player.wallBounceTimer).toBe(0);
    });

    it('applies lateral push during wall bounce window', () => {
      player.x = 0;
      player.stumble(0.6, 1);
      player.update(0.05);
      expect(player.x).toBeGreaterThan(0);
    });
  });
});
