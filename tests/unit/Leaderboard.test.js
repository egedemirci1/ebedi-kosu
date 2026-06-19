import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchTopScores, submitScore, isValidPlayerName } from '../../src/Leaderboard.js';

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
      expect(isValidPlayerName('  Player  ')).toBe(true);
    });

    it('rejects empty or too short names', () => {
      expect(isValidPlayerName('')).toBe(false);
      expect(isValidPlayerName('A')).toBe(false);
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

  describe('submitScore', () => {
    it('returns true when API accepts score', async () => {
      fetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ ok: true }),
      });

      expect(await submitScore('Ali', 250)).toBe(true);
      expect(fetch).toHaveBeenCalledWith('/api/scores', expect.objectContaining({ method: 'POST' }));
    });

    it('returns false when API rejects score', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ ok: false }),
      });

      expect(await submitScore('Ali', 0)).toBe(false);
    });
  });
});
