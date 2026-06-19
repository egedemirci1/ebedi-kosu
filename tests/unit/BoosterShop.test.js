import { describe, it, expect, beforeEach } from 'vitest';
import {
  BoosterShop,
  loadUpgrades,
  saveUpgrades,
  getDuration,
  getUpgradeCost,
  purchaseUpgrade,
  MAX_UPGRADE_LEVEL,
  BOOSTER_UPGRADES_KEY,
} from '../../src/BoosterShop.js';

function mockStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
  };
}

describe('BoosterShop', () => {
  let storage;

  beforeEach(() => {
    storage = mockStorage();
  });

  it('loads default upgrades when storage is empty', () => {
    expect(loadUpgrades(storage)).toEqual({ ghost: 0, jump: 0, speed: 0 });
  });

  it('increases duration by one second per level', () => {
    expect(getDuration('ghost', 0)).toBe(5);
    expect(getDuration('ghost', 2)).toBe(7);
    expect(getDuration('speed', 3)).toBe(7);
  });

  it('scales upgrade cost linearly', () => {
    expect(getUpgradeCost(0)).toBe(50);
    expect(getUpgradeCost(2)).toBe(150);
    expect(getUpgradeCost(MAX_UPGRADE_LEVEL)).toBeNull();
  });

  it('persists purchases and deducts coins', () => {
    const shop = new BoosterShop(storage);
    const result = shop.tryPurchase('ghost', 120);
    expect(result.ok).toBe(true);
    expect(result.newTotal).toBe(70);
    expect(shop.getLevel('ghost')).toBe(1);
    expect(shop.getDuration('ghost')).toBe(6);
    expect(loadUpgrades(storage).ghost).toBe(1);
  });

  it('rejects purchase when coins are insufficient', () => {
    const shop = new BoosterShop(storage);
    const result = shop.tryPurchase('jump', 10);
    expect(result.ok).toBe(false);
    expect(shop.getLevel('jump')).toBe(0);
  });

  it('caps invalid stored levels', () => {
    storage.setItem(BOOSTER_UPGRADES_KEY, JSON.stringify({ ghost: 99, jump: -2, speed: 'x' }));
    const shop = new BoosterShop(storage);
    expect(shop.getLevel('ghost')).toBe(MAX_UPGRADE_LEVEL);
    expect(shop.getLevel('jump')).toBe(0);
    expect(shop.getLevel('speed')).toBe(0);
  });

  it('saveUpgrades writes JSON to storage', () => {
    const upgrades = { ghost: 1, jump: 2, speed: 0 };
    saveUpgrades(upgrades, storage);
    expect(JSON.parse(storage.getItem(BOOSTER_UPGRADES_KEY))).toEqual(upgrades);
  });

  it('purchaseUpgrade returns unchanged state when maxed', () => {
    const upgrades = { ghost: MAX_UPGRADE_LEVEL, jump: 0, speed: 0 };
    const result = purchaseUpgrade('ghost', upgrades, 500);
    expect(result.ok).toBe(false);
    expect(result.upgrades.ghost).toBe(MAX_UPGRADE_LEVEL);
  });
});
