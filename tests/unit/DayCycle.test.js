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

  it('advances by distance every phase length', () => {
    const cycle = new DayCycle();
    cycle.setDistance(0);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Sabah');

    cycle.setDistance(DAY_PHASE_DISTANCE);
    expect(cycle.progress).toBeCloseTo(0.25, 5);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Öğlen');

    cycle.setDistance(DAY_PHASE_DISTANCE * 2);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Akşam');

    cycle.setDistance(DAY_PHASE_DISTANCE * 3);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Gece');

    cycle.setDistance(DAY_CYCLE_DISTANCE);
    expect(cycle.progress).toBeCloseTo(0, 5);
    expect(getDayPhaseLabelForDistance(cycle.distance)).toBe('Sabah');
  });

  it('wraps distance progress across the full cycle', () => {
    expect(progressForDistance(DAY_PHASE_DISTANCE / 2)).toBeCloseTo(0.125, 5);
    expect(progressForDistance(DAY_CYCLE_DISTANCE + DAY_PHASE_DISTANCE / 2)).toBeCloseTo(
      0.125,
      5
    );
    const cycle = new DayCycle();
    cycle.reset(500);
    expect(cycle.distance).toBe(500);
    expect(cycle.progress).toBeCloseTo(500 / DAY_CYCLE_DISTANCE, 5);
  });

  it('uses configured phase and cycle distances', () => {
    expect(DAY_PHASE_DISTANCE).toBe(2800);
    expect(DAY_CYCLE_DISTANCE).toBe(DAY_PHASE_DISTANCE * 4);
    const cycle = new DayCycle();
    expect(cycle.phaseDistance).toBe(DAY_PHASE_DISTANCE);
    expect(cycle.cycleDistance).toBe(DAY_CYCLE_DISTANCE);
  });
});
