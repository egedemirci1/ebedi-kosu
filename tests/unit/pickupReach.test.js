import { describe, it, expect } from 'vitest';
import { pickupWithinPlayerReach } from '../../src/CoinManager.js';

describe('pickupWithinPlayerReach', () => {
  it('allows collection at ground level for waist-height pickups', () => {
    expect(pickupWithinPlayerReach(0, 0.85, false)).toBe(true);
    expect(pickupWithinPlayerReach(0, 0.03, false)).toBe(true);
  });

  it('rejects collection when player is far above the pickup', () => {
    expect(pickupWithinPlayerReach(1.6, 0.85, false)).toBe(false);
    expect(pickupWithinPlayerReach(1.2, 0.03, false)).toBe(false);
  });

  it('allows low jumps within vertical reach', () => {
    expect(pickupWithinPlayerReach(0.35, 0.85, false)).toBe(true);
  });

  it('allows floating pickups during a ground slide', () => {
    expect(pickupWithinPlayerReach(0, 0.85, true)).toBe(true);
    expect(pickupWithinPlayerReach(0, 0.95, true)).toBe(true);
    expect(pickupWithinPlayerReach(0, 0.03, true)).toBe(true);
  });

  it('rejects floating pickups when airborne even if slide flag is set', () => {
    expect(pickupWithinPlayerReach(1.2, 0.85, true)).toBe(false);
  });
});
