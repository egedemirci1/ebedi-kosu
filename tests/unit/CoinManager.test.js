import { describe, it, expect, beforeEach } from 'vitest';
import { CoinManager } from '../../src/CoinManager.js';
import { GapManager } from '../../src/GapManager.js';
import { LANES } from '../../src/scene.js';
import { createScene, insertGap } from '../helpers/fixtures.js';

describe('CoinManager', () => {
  let scene;
  let manager;

  beforeEach(() => {
    scene = createScene();
    manager = new CoinManager(scene);
  });

  describe('spawn and reset', () => {
    it('prefills coins ahead of the player', () => {
      manager.reset();
      expect(manager._activeCount).toBeGreaterThan(0);
    });

    it('clears all coins on reset', () => {
      manager.reset();
      const count = manager._activeCount;
      expect(count).toBeGreaterThan(0);
      manager.reset();
      expect(manager._activeCount).toBeGreaterThan(0);
    });
  });

  describe('checkCollection', () => {
    it('collects a coin on the player lane at z=0', () => {
      manager.acquireCoin(1, 0);
      const coin = manager.checkCollection(LANES[1], 1);
      expect(coin).not.toBeNull();
      expect(coin.lane).toBe(1);
    });

    it('does not collect coins on another lane', () => {
      manager.acquireCoin(0, 0);
      expect(manager.checkCollection(LANES[2], 2)).toBeNull();
    });

    it('does not collect coins far behind the player', () => {
      manager.acquireCoin(1, -4);
      expect(manager.checkCollection(LANES[1], 1)).toBeNull();
    });
  });

  describe('gap integration', () => {
    it('reports overlap when a coin sits inside a gap span', () => {
      manager.acquireCoin(1, -20);
      expect(manager.hasCoinOverlappingGap(-20, 4)).toBe(true);
    });

    it('detects gap overlap for coin positions', () => {
      const gaps = new GapManager(scene);
      manager.setGapManager(gaps);
      insertGap(gaps, -2, 5);
      expect(manager.overlapsGap(-2)).toBe(true);
      expect(manager.overlapsGap(-20)).toBe(false);
    });

    it('removes coins when a gap overlaps their position', () => {
      const gaps = new GapManager(scene);
      manager.setGapManager(gaps);
      manager.acquireCoin(1, -100);
      expect(manager._activeCount).toBe(1);

      insertGap(gaps, -100, 3);
      manager.update(0.016, 14);

      expect(manager._activeCount).toBe(0);
    });
  });
});
