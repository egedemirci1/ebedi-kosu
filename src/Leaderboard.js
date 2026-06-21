const debug = import.meta.env.DEV;

function lbLog(...args) {
  if (debug) console.log('[leaderboard]', ...args);
}

export async function startRunSession() {
  lbLog('startRunSession → POST /api/runs/start');
  try {
    const res = await fetch('/api/runs/start', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    lbLog('startRunSession ←', { status: res.status, ok: res.ok, data });
    if (!res.ok || !data.token) return null;
    return { token: data.token, expiresAt: data.expiresAt };
  } catch (err) {
    lbLog('startRunSession FAILED', err);
    return null;
  }
}

export async function fetchTopScores() {
  lbLog('fetchTopScores → GET /api/scores/top');
  try {
    const res = await fetch('/api/scores/top');
    const data = await res.json().catch(() => ({}));
    lbLog('fetchTopScores ←', { status: res.status, ok: res.ok, data });
    if (!res.ok) return { scores: [], error: true };
    return {
      scores: Array.isArray(data.scores) ? data.scores : [],
      error: false,
    };
  } catch (err) {
    lbLog('fetchTopScores FAILED', err);
    return { scores: [], error: true };
  }
}

export async function submitScore(name, distance, runToken, activeMs) {
  const payload = { name, distance, runToken, activeMs };
  lbLog('submitScore → POST /api/scores', payload);
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    lbLog('submitScore ←', { status: res.status, ok: res.ok, data });
    return { ok: res.ok, error: data.error ?? null, status: res.status };
  } catch (err) {
    lbLog('submitScore FAILED', err);
    return { ok: false, error: 'network_error', status: 0 };
  }
}

export { isValidPlayerName, sanitizePlayerName } from '../shared/validation.js';

export const LEADERBOARD_TOP_N = 5;
const PLACEHOLDER_NAME = '***';

export function buildLeaderboardDisplayRows(scores, error) {
  if (error) {
    return Array.from({ length: LEADERBOARD_TOP_N }, (_, index) => ({
      rank: index + 1,
      player_name: PLACEHOLDER_NAME,
      distance: null,
      isPlaceholder: true,
    }));
  }

  return scores.map((row) => ({
    ...row,
    isPlaceholder: false,
  }));
}

export function formatLeaderboardDistance(distance) {
  if (distance == null || Number.isNaN(Number(distance))) return '—';
  return `${Math.floor(Number(distance))}m`;
}
