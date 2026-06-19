import { describe, it, expect } from 'vitest';
import { maxPlausibleDistance, minActiveMsForDistance } from '../../shared/runPhysics.js';

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
});
