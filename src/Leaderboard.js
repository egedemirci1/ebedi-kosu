export async function fetchTopScores() {
  try {
    const res = await fetch('/api/scores/top');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.scores) ? data.scores : [];
  } catch {
    return [];
  }
}

export async function submitScore(name, distance) {
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, distance }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function isValidPlayerName(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed.length >= 2 && trimmed.length <= 20;
}
