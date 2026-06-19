import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createRunToken,
  verifyRunScoreSubmission,
  resetRunSessionStateForTests,
} from '../../server/runSession.js';

describe('runSession', () => {
  const originalSecret = process.env.RUN_SESSION_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetRunSessionStateForTests();
    process.env.RUN_SESSION_SECRET = 'test-secret-for-run-session';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    resetRunSessionStateForTests();
    if (originalSecret === undefined) delete process.env.RUN_SESSION_SECRET;
    else process.env.RUN_SESSION_SECRET = originalSecret;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it('creates and verifies a plausible score submission', () => {
    const session = createRunToken();
    expect(session?.token).toBeTruthy();

    const activeMs = 5000;
    const distance = 80;
    const result = verifyRunScoreSubmission(session.token, distance, activeMs);
    expect(result.ok).toBe(true);
  });

  it('rejects reused tokens', () => {
    const session = createRunToken();
    const activeMs = 4000;
    const distance = 80;

    expect(verifyRunScoreSubmission(session.token, distance, activeMs).ok).toBe(true);
    expect(verifyRunScoreSubmission(session.token, distance, activeMs).ok).toBe(false);
  });

  it('rejects implausible distance for active time', () => {
    const session = createRunToken();
    const result = verifyRunScoreSubmission(session.token, 50_000, 1000);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('implausible_distance');
  });

  it('rejects active time greater than wall elapsed', () => {
    const session = createRunToken();
    const result = verifyRunScoreSubmission(session.token, 50, 999_999);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('active_time_exceeded');
  });

  it('rejects tampered tokens', () => {
    const session = createRunToken();
    const tampered = `${session.token}x`;
    const result = verifyRunScoreSubmission(tampered, 100, 10_000);
    expect(result.ok).toBe(false);
  });
});
