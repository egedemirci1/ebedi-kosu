export const LB_DEBUG =
  process.env.DEBUG_LEADERBOARD === '1' ||
  process.env.NODE_ENV !== 'production';

export function lbLog(...args) {
  if (LB_DEBUG) console.log('[leaderboard]', ...args);
}

export function lbError(...args) {
  console.error('[leaderboard]', ...args);
}

export function maskDatabaseUrl(url) {
  if (!url) return '(missing)';
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username}:****@${parsed.host}${parsed.pathname}`;
  } catch {
    return '(invalid url)';
  }
}
