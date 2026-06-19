import crypto from 'crypto';
import { maxPlausibleDistance, minActiveMsForDistance } from '../shared/runPhysics.js';

const RUN_TOKEN_TTL_MS = 45 * 60 * 1000;
const MAX_ACTIVE_MS_SKEW = 5000;
const usedTokens = new Map();
let devSecret = null;

function pruneUsedTokens(now) {
  for (const [id, exp] of usedTokens) {
    if (exp <= now) usedTokens.delete(id);
  }
}

export function getRunSessionSecret() {
  if (process.env.RUN_SESSION_SECRET) return process.env.RUN_SESSION_SECRET;
  if (process.env.NODE_ENV === 'production') return null;
  if (!devSecret) devSecret = crypto.randomBytes(32).toString('hex');
  return devSecret;
}

export function isRunSessionConfigured() {
  return Boolean(getRunSessionSecret());
}

function signPayload(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(payloadB64) {
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function createRunToken() {
  const secret = getRunSessionSecret();
  if (!secret) return null;

  const now = Date.now();
  const payload = {
    id: crypto.randomUUID(),
    startTime: now,
    exp: now + RUN_TOKEN_TTL_MS,
  };
  const payloadB64 = encodePayload(payload);
  const signature = signPayload(payloadB64, secret);
  return { token: `${payloadB64}.${signature}`, startTime: now, expiresAt: payload.exp };
}

export function verifyRunScoreSubmission(token, distance, activeMs) {
  const secret = getRunSessionSecret();
  if (!secret) {
    return { ok: false, status: 503, error: 'run_session_unavailable' };
  }

  if (typeof token !== 'string' || !token.includes('.')) {
    return { ok: false, status: 400, error: 'invalid_run_token' };
  }

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return { ok: false, status: 400, error: 'invalid_run_token' };
  }

  const expected = signPayload(payloadB64, secret);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, status: 403, error: 'invalid_run_token' };
  }

  const payload = decodePayload(payloadB64);
  if (!payload?.id || !payload.startTime || !payload.exp) {
    return { ok: false, status: 400, error: 'invalid_run_token' };
  }

  const now = Date.now();
  if (now > payload.exp) {
    return { ok: false, status: 403, error: 'run_token_expired' };
  }

  pruneUsedTokens(now);
  if (usedTokens.has(payload.id)) {
    return { ok: false, status: 403, error: 'run_token_reused' };
  }

  const wallElapsedMs = now - payload.startTime;
  const active = Math.floor(Number(activeMs));
  if (!Number.isFinite(active) || active < 0) {
    return { ok: false, status: 400, error: 'invalid_active_ms' };
  }
  if (active > wallElapsedMs + MAX_ACTIVE_MS_SKEW) {
    return { ok: false, status: 403, error: 'active_time_exceeded' };
  }

  const scoreDistance = Math.floor(Number(distance));
  if (scoreDistance > maxPlausibleDistance(active)) {
    return { ok: false, status: 403, error: 'implausible_distance' };
  }

  const minActive = minActiveMsForDistance(scoreDistance);
  if (active + 500 < minActive) {
    return { ok: false, status: 403, error: 'implausible_distance' };
  }

  usedTokens.set(payload.id, payload.exp);
  return { ok: true, tokenId: payload.id };
}

export function resetRunSessionStateForTests() {
  usedTokens.clear();
  devSecret = null;
}
