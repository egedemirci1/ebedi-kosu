import { describe, it, expect } from 'vitest';
import {
  maxPlausibleDistance,
  minActiveMsForDistance,
  runSpeedAtDistance,
  speedGearBonusForDistance,
  BASE_RUN_SPEED,
  CORE_MAX_RUN_SPEED,
  OVERDRIVE_MAX_SPEED,
  OVERDRIVE_START_DISTANCE,
  SPEED_GEAR_BONUSES,
} from '../../shared/runPhysics.js';

describe('runPhysics', () => {
  it('allows zero distance at zero active time', () => {
    expect(maxPlausibleDistance(0)).toBe(0);
  });

  it('increases plausible distance with active time', () => {
    const short = maxPlausibleDistance(5000);
    const long = maxPlausibleDistance(30000);
    expect(long).toBeGreaterThan(short);
  });

  it('requires minimum active time for a distance', () => {
    const distance = 500;
    const minMs = minActiveMsForDistance(distance);
    expect(maxPlausibleDistance(minMs)).toBeGreaterThanOrEqual(distance);
  });

  describe('speed gears', () => {
    it('adds cumulative bonuses at music tier distances', () => {
      expect(speedGearBonusForDistance(999)).toBe(0);
      expect(speedGearBonusForDistance(1000)).toBe(1.5);
      expect(speedGearBonusForDistance(3000)).toBe(4.75);
      expect(speedGearBonusForDistance(5000)).toBe(7.25);
    });

    it('jumps by the configured bonus at each gear threshold', () => {
      for (const gear of SPEED_GEAR_BONUSES) {
        const jump = runSpeedAtDistance(gear.distance) - runSpeedAtDistance(gear.distance - 1);
        expect(jump).toBeCloseTo(gear.bonus, 1);
      }
    });
  });

  describe('runSpeedAtDistance', () => {
    it('starts at base speed and rises with core curve plus gears', () => {
      expect(runSpeedAtDistance(0)).toBeCloseTo(BASE_RUN_SPEED, 5);
      expect(runSpeedAtDistance(5000)).toBeGreaterThan(24);
      expect(runSpeedAtDistance(OVERDRIVE_START_DISTANCE - 1)).toBeGreaterThan(25);
    });

    it('keeps climbing through mid game before overdrive', () => {
      expect(runSpeedAtDistance(3000)).toBeGreaterThan(24);
      expect(runSpeedAtDistance(8000)).toBeGreaterThan(runSpeedAtDistance(3000));
      expect(runSpeedAtDistance(8000)).toBeLessThan(OVERDRIVE_MAX_SPEED);
    });

    it('ramps into overdrive after the late-game threshold', () => {
      const before = runSpeedAtDistance(OVERDRIVE_START_DISTANCE);
      const after = runSpeedAtDistance(OVERDRIVE_START_DISTANCE + 6000);
      expect(after).toBeGreaterThan(before);
      expect(runSpeedAtDistance(50000)).toBeCloseTo(OVERDRIVE_MAX_SPEED, 1);
    });

    it('has diminishing core acceleration between gear thresholds', () => {
      const gainEarly = runSpeedAtDistance(200) - runSpeedAtDistance(0);
      const gainMid = runSpeedAtDistance(2200) - runSpeedAtDistance(2000);
      const gainLate = runSpeedAtDistance(4200) - runSpeedAtDistance(4000);
      expect(gainMid).toBeLessThan(gainEarly);
      expect(gainLate).toBeLessThan(gainMid);
    });
  });
});
