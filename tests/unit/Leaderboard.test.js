import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchTopScores, submitScore, isValidPlayerName, buildLeaderboardDisplayRows, formatLeaderboardDistance, LEADERBOARD_TOP_N } from '../../src/Leaderboard.js';

describe('Leaderboard client', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isValidPlayerName', () => {
    it('accepts trimmed names between 2 and 20 characters', () => {
      expect(isValidPlayerName('Ali')).toBe(true);
      expect(isValidPlayerName('  Player_1  ')).toBe(true);
    });

    it('rejects empty, too short, or invalid characters', () => {
      expect(isValidPlayerName('')).toBe(false);
      expect(isValidPlayerName('A')).toBe(false);
      expect(isValidPlayerName('bad<script>')).toBe(false);
    });
  });

  describe('fetchTopScores', () => {
    it('returns scores on success', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          scores: [{ rank: 1, player_name: 'Ali', distance: 120 }],
        }),
      });

      const result = await fetchTopScores();
      expect(result.error).toBe(false);
      expect(result.scores).toHaveLength(1);
      expect(result.scores[0].player_name).toBe('Ali');
    });

    it('returns error flag on HTTP failure', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ scores: [] }),
      });

      const result = await fetchTopScores();
      expect(result.scores).toEqual([]);
      expect(result.error).toBe(true);
    });

    it('returns error flag when fetch throws', async () => {
      fetch.mockRejectedValue(new Error('network'));

      const result = await fetchTopScores();
      expect(result.scores).toEqual([]);
      expect(result.error).toBe(true);
    });
  });

  describe('buildLeaderboardDisplayRows', () => {
    it('returns placeholder rows when fetch failed', () => {
      const rows = buildLeaderboardDisplayRows([], true);
      expect(rows).toHaveLength(LEADERBOARD_TOP_N);
      expect(rows[0]).toMatchObject({ rank: 1, player_name: '***', distance: null, isPlaceholder: true });
      expect(rows[LEADERBOARD_TOP_N - 1].rank).toBe(LEADERBOARD_TOP_N);
    });

    it('passes through real scores when fetch succeeded', () => {
      const rows = buildLeaderboardDisplayRows(
        [{ rank: 1, player_name: 'Ali', distance: 120 }],
        false
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ player_name: 'Ali', distance: 120, isPlaceholder: false });
    });
  });

  describe('formatLeaderboardDistance', () => {
    it('formats numeric distances', () => {
      expect(formatLeaderboardDistance(120.9)).toBe('120m');
    });

    it('returns em dash for missing distances', () => {
      expect(formatLeaderboardDistance(null)).toBe('—');
    });
  });

  describe('submitScore', () => {
    it('returns ok when API accepts score', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ ok: true }),
      });

      expect(await submitScore('Ali', 250, 'token', 30_000)).toEqual({
        ok: true,
        error: null,
        status: 201,
      });
      expect(fetch).toHaveBeenCalledWith('/api/scores', expect.objectContaining({ method: 'POST' }));
    });

    it('returns error details when API rejects score', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, error: 'invalid_payload' }),
      });

      expect(await submitScore('Ali', 0, 'token', 0)).toEqual({
        ok: false,
        error: 'invalid_payload',
        status: 400,
      });
    });
  });
});
