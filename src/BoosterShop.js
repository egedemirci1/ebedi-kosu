import { GHOST_DURATION, JUMP_DURATION, SPEED_DURATION } from './BoosterEffects.js';

export const BOOSTER_UPGRADES_KEY = 'ebedi-kosu-booster-upgrades';
export const MAX_UPGRADE_LEVEL = 5;
export const DURATION_PER_LEVEL = 1;
export const UPGRADE_COST_BASE = 50;

export const SHOP_BOOSTER_TYPES = ['ghost', 'jump', 'speed'];

export const BOOSTER_LABELS = {
  ghost: 'Hayalet',
  jump: 'Süper zıpla',
  speed: 'Hız',
};

export const BASE_DURATIONS = {
  ghost: GHOST_DURATION,
  jump: JUMP_DURATION,
  speed: SPEED_DURATION,
};

export function defaultUpgrades() {
  return { ghost: 0, jump: 0, speed: 0 };
}

function clampLevel(level) {
  const n = parseInt(level, 10);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(MAX_UPGRADE_LEVEL, n));
}

export function loadUpgrades(storage = localStorage) {
  const raw = storage.getItem(BOOSTER_UPGRADES_KEY);
  if (!raw) return defaultUpgrades();
  try {
    const parsed = JSON.parse(raw);
    return {
      ghost: clampLevel(parsed.ghost),
      jump: clampLevel(parsed.jump),
      speed: clampLevel(parsed.speed),
    };
  } catch {
    return defaultUpgrades();
  }
}

export function saveUpgrades(upgrades, storage = localStorage) {
  storage.setItem(BOOSTER_UPGRADES_KEY, JSON.stringify(upgrades));
}

export function getDuration(type, level) {
  const base = BASE_DURATIONS[type] ?? 0;
  return base + clampLevel(level) * DURATION_PER_LEVEL;
}

export function getDurations(upgrades) {
  return {
    ghost: getDuration('ghost', upgrades.ghost),
    jump: getDuration('jump', upgrades.jump),
    speed: getDuration('speed', upgrades.speed),
  };
}

export function getUpgradeCost(level) {
  if (clampLevel(level) >= MAX_UPGRADE_LEVEL) return null;
  return UPGRADE_COST_BASE * (clampLevel(level) + 1);
}

export function purchaseUpgrade(type, upgrades, totalCoins) {
  const level = clampLevel(upgrades[type]);
  const cost = getUpgradeCost(level);
  if (cost === null || totalCoins < cost) {
    return { ok: false, upgrades, newTotal: totalCoins, cost };
  }
  return {
    ok: true,
    upgrades: { ...upgrades, [type]: level + 1 },
    newTotal: totalCoins - cost,
    cost,
  };
}

export class BoosterShop {
  constructor(storage = localStorage) {
    this.storage = storage;
    this.upgrades = loadUpgrades(storage);
  }

  reload() {
    this.upgrades = loadUpgrades(this.storage);
  }

  getDurations() {
    return getDurations(this.upgrades);
  }

  getLevel(type) {
    return this.upgrades[type];
  }

  getDuration(type) {
    return getDuration(type, this.upgrades[type]);
  }

  getCost(type) {
    return getUpgradeCost(this.upgrades[type]);
  }

  isMaxed(type) {
    return this.upgrades[type] >= MAX_UPGRADE_LEVEL;
  }

  tryPurchase(type, totalCoins) {
    const result = purchaseUpgrade(type, this.upgrades, totalCoins);
    if (!result.ok) return result;
    this.upgrades = result.upgrades;
    saveUpgrades(this.upgrades, this.storage);
    return result;
  }
}
