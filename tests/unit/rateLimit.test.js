import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter } from '../../server/rateLimit.js';

function mockReq(ip = '1.2.3.4') {
  return { ip, socket: { remoteAddress: ip } };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
  return res;
}

describe('createRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, keyPrefix: 'test' });
    const next = vi.fn();
    const req = mockReq();
    const res = mockRes();

    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(200);
  });

  it('blocks requests over the limit', () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyPrefix: 'test2' });
    const next = vi.fn();
    const req = mockReq('9.9.9.9');
    const res = mockRes();

    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ ok: false, error: 'rate_limited' });
  });
});
