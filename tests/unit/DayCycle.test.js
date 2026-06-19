import { describe, it, expect } from 'vitest';
import {
  DayCycle,
  sampleDayCycle,
  getDayPhaseLabel,
  getDayPhaseLabelForDistance,
  progressForDistance,
  DAY_PHASE_DISTANCE,
  DAY_CYCLE_DISTANCE,
} from '../../src/DayCycle.js';

describe('DayCycle', () => {
  it('loops through four phases over one full cycle', () => {
    const labels = new Set();
    for (let i = 0; i < 4; i++) {
      labels.add(getDayPhaseLabel(i / 4 + 0.01));
    }
    expect(labels.size).toBe(4);
    expect(labels.has('Sabah')).toBe(true);
    expect(labels.has('Gece')).toBe(true);
  });

  it('samples smoothly at phase boundaries', () => {
    const before = sampleDayCycle(0.249);
    const after = sampleDayCycle(0.251);
    expect(Math.abs(before.exposure - after.exposure)).toBeLessThan(0.15);
    expect(Math.abs(before.stars - after.stars)).toBeLessThan(0.4);
  });

  it('advances by distance every 2000 metres', () => {
    const cycle = new DayCycle();
    cycle.setDistance(0);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Sabah');

    cycle.setDistance(2000);
    expect(cycle.progress).toBeCloseTo(0.25, 5);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Öğlen');

    cycle.setDistance(4000);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Akşam');

    cycle.setDistance(6000);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Gece');

    cycle.setDistance(8000);
    expect(cycle.progress).toBeCloseTo(0, 5);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Sabah');
  });

  it('wraps distance progress across the full cycle', () => {
    expect(progressForDistance(1000)).toBeCloseTo(0.125, 5);
    expect(progressForDistance(8500)).toBeCloseTo(0.0625, 5);
    const cycle = new DayCycle();
    cycle.reset(500);
    expect(cycle.distance).toBe(500);
    expect(cycle.progress).toBeCloseTo(0.0625, 5);
  });

  it('uses default 2000m phases and 8000m cycle', () => {
    expect(DAY_PHASE_DISTANCE).toBe(2000);
    expect(DAY_CYCLE_DISTANCE).toBe(8000);
    const cycle = new DayCycle();
    expect(cycle.phaseDistance).toBe(2000);
    expect(cycle.cycleDistance).toBe(8000);
  });
});
