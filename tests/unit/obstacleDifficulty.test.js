import { describe, it, expect } from 'vitest';
import {
  obstacleDifficultyForDistance,
  OBSTACLE_TUTORIAL_END,
} from '../../src/ObstacleManager.js';

describe('obstacleDifficultyForDistance', () => {
  it('stays in tutorial band before 1k', () => {
    expect(obstacleDifficultyForDistance(500)).toBeCloseTo(0.05, 2);
    expect(obstacleDifficultyForDistance(999)).toBeCloseTo(0.0999, 2);
  });

  it('jumps into tier I at 1k', () => {
    expect(obstacleDifficultyForDistance(1000)).toBeCloseTo(0.22, 2);
    expect(obstacleDifficultyForDistance(1000)).toBeGreaterThan(
      obstacleDifficultyForDistance(999) + 0.1
    );
  });

  it('ramps to full difficulty by ~3.2k', () => {
    expect(obstacleDifficultyForDistance(3200)).toBeCloseTo(1, 2);
  });
});
