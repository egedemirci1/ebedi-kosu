import { describe, it, expect } from 'vitest';
import { ChaseMusic, musicTierForDistance, MUSIC_TIER_THRESHOLDS } from '../../src/ChaseMusic.js';

describe('ChaseMusic tiers', () => {
  it('maps distance to tier thresholds', () => {
    expect(musicTierForDistance(0)).toBe(0);
    expect(musicTierForDistance(999)).toBe(0);
    expect(musicTierForDistance(MUSIC_TIER_THRESHOLDS[0])).toBe(1);
    expect(musicTierForDistance(5000)).toBe(1);
    expect(musicTierForDistance(MUSIC_TIER_THRESHOLDS[1])).toBe(2);
    expect(musicTierForDistance(50000)).toBe(2);
  });

  it('increases BPM when tier changes', () => {
    const music = new ChaseMusic();
    expect(music.tierConfig.bpm).toBe(128);

    music.setTier(1);
    expect(music.tier).toBe(1);
    expect(music.tierConfig.bpm).toBe(148);

    music.setTier(2);
    expect(music.tierConfig.bpm).toBe(172);
  });

  it('ignores duplicate tier updates', () => {
    const music = new ChaseMusic();
    music.setTier(1);
    music.beatIndex = 7;
    music.setTier(1);
    expect(music.beatIndex).toBe(7);
  });

  it('resets beat index when tier changes during play', () => {
    const music = new ChaseMusic();
    music.playing = true;
    music.beatIndex = 11;
    music.setTier(2);
    expect(music.beatIndex).toBe(0);
  });
});
