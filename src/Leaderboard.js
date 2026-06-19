const debug = import.meta.env.DEV;

function lbLog(...args) {
  if (debug) console.log('[leaderboard]', ...args);
}

export async function fetchTopScores() {
  lbLog('fetchTopScores → GET /api/scores/top');
  try {
    const res = await fetch('/api/scores/top');
    const data = await res.json().catch(() => ({}));
    lbLog('fetchTopScores ←', { status: res.status, ok: res.ok, data });
    if (!res.ok) return [];
    return Array.isArray(data.scores) ? data.scores : [];
  } catch (err) {
    lbLog('fetchTopScores FAILED', err);
    return [];
  }
}

export async function submitScore(name, distance) {
  const payload = { name, distance };
  lbLog('submitScore → POST /api/scores', payload);
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    lbLog('submitScore ←', { status: res.status, ok: res.ok, data });
    return res.ok;
  } catch (err) {
    lbLog('submitScore FAILED', err);
    return false;
  }
}

export function isValidPlayerName(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed.length >= 2 && trimmed.length <= 20;
}
