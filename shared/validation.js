export function sanitizePlayerName(name) {
  const trimmed = String(name ?? '').trim();
  if (trimmed.length < 2 || trimmed.length > 20) return null;
  if (!/^[\p{L}\p{N}_\-. ]+$/u.test(trimmed)) return null;
  return trimmed;
}

export function isValidPlayerName(name) {
  return sanitizePlayerName(name) !== null;
}

export function validateDistance(distance) {
  const value = Math.floor(Number(distance));
  if (!Number.isFinite(value) || value < 1 || value > 999_999) return null;
  return value;
}
