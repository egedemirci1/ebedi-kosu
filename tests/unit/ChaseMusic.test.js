import { describe, it, expect } from 'vitest';
import {
  ChaseMusic,
  musicProfileForDistance,
  CHASE_TIER_THRESHOLDS,
  LATE_SONG_DISTANCE,
} from '../../src/ChaseMusic.js';

describe('ChaseMusic tiers', () => {
  it('maps distance to chase tiers and late song', () => {
    expect(musicProfileForDistance(0)).toEqual({ song: 'chase', tier: 0 });
    expect(musicProfileForDistance(CHASE_TIER_THRESHOLDS[0] - 1)).toEqual({
      song: 'chase',
      tier: 0,
    });
    expect(musicProfileForDistance(CHASE_TIER_THRESHOLDS[0])).toEqual({ song: 'chase', tier: 1 });
    expect(musicProfileForDistance(2500)).toEqual({ song: 'chase', tier: 1 });
    expect(musicProfileForDistance(CHASE_TIER_THRESHOLDS[1])).toEqual({ song: 'chase', tier: 2 });
    expect(musicProfileForDistance(LATE_SONG_DISTANCE - 1)).toEqual({ song: 'chase', tier: 2 });
    expect(musicProfileForDistance(LATE_SONG_DISTANCE)).toEqual({ song: 'late', tier: 0 });
    expect(musicProfileForDistance(50000)).toEqual({ song: 'late', tier: 0 });
  });

  it('increases BPM when chase tier changes', () => {
    const music = new ChaseMusic();
    expect(music.tierConfig.bpm).toBe(118);

    music.setTier(1);
    expect(music.tier).toBe(1);
    expect(music.tierConfig.bpm).toBe(124);

    music.setTier(2);
    expect(music.tierConfig.bpm).toBe(132);
  });

  it('uses groove configs with melody for chase tiers', () => {
    const music = new ChaseMusic();
    expect(music.tierConfig.melodyNotes).toBeDefined();
    expect(music.tierConfig.bassPattern).toBeDefined();
  });

  it('switches to late disco song with distinct BPM and layout', () => {
    const music = new ChaseMusic();
    music.setProfile({ song: 'late', tier: 0 });
    expect(music.song).toBe('late');
    expect(music.tierConfig.bpm).toBe(142);
    expect(music.tierConfig.stabChords).toBeDefined();
    expect(music.tierConfig.sparkleScale).toBeDefined();
    expect(music.tierConfig.padChords).toBeUndefined();
  });

  it('ignores duplicate profile updates', () => {
    const music = new ChaseMusic();
    music.setProfile({ song: 'chase', tier: 1 });
    music.beatIndex = 7;
    music.setProfile({ song: 'chase', tier: 1 });
    expect(music.beatIndex).toBe(7);
  });

  it('resets beat index when profile changes during play', () => {
    const music = new ChaseMusic();
    music.playing = true;
    music.beatIndex = 11;
    music.setProfile({ song: 'late', tier: 0 });
    expect(music.beatIndex).toBe(0);
  });
});
