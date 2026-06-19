import { describe, it, expect } from 'vitest';
import {
  maxPlausibleDistance,
  minActiveMsForDistance,
  runSpeedAtDistance,
  BASE_RUN_SPEED,
  MAX_RUN_SPEED,
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

  describe('runSpeedAtDistance', () => {
    it('starts at base speed and approaches a soft cap', () => {
      expect(runSpeedAtDistance(0)).toBeCloseTo(BASE_RUN_SPEED, 5);
      expect(runSpeedAtDistance(5000)).toBeLessThan(MAX_RUN_SPEED);
      expect(runSpeedAtDistance(50000)).toBeCloseTo(MAX_RUN_SPEED, 1);
    });

    it('has diminishing acceleration (marginal gain shrinks over distance)', () => {
      const gainEarly = runSpeedAtDistance(200) - runSpeedAtDistance(0);
      const gainMid = runSpeedAtDistance(1200) - runSpeedAtDistance(1000);
      const gainLate = runSpeedAtDistance(4000) - runSpeedAtDistance(3800);
      expect(gainMid).toBeLessThan(gainEarly);
      expect(gainLate).toBeLessThan(gainMid);
    });
  });
});
