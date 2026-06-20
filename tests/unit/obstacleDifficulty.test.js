import { describe, it, expect } from 'vitest';
import {
  obstacleDifficultyForDistance,
  OBSTACLE_TUTORIAL_END,
} from '../../src/ObstacleManager.js';

describe('obstacleDifficultyForDistance', () => {
  it('stays in tutorial band before 200m', () => {
    expect(OBSTACLE_TUTORIAL_END).toBe(200);
    expect(obstacleDifficultyForDistance(100)).toBeCloseTo(0.05, 2);
    expect(obstacleDifficultyForDistance(199)).toBeCloseTo(0.0995, 2);
  });

  it('jumps into tier I at 200m', () => {
    expect(obstacleDifficultyForDistance(200)).toBeCloseTo(0.22, 2);
    expect(obstacleDifficultyForDistance(200)).toBeGreaterThan(
      obstacleDifficultyForDistance(199) + 0.1
    );
  });

  it('ramps to full difficulty by ~2.4k', () => {
    expect(obstacleDifficultyForDistance(2400)).toBeCloseTo(1, 2);
  });
});
