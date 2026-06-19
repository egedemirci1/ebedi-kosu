export function createRateLimiter({ windowMs, max, keyPrefix = '' }) {
  const buckets = new Map();

  function prune(now) {
    for (const [key, entry] of buckets) {
      if (now - entry.start >= windowMs) buckets.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (buckets.size > 10_000) prune(now);

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    let entry = buckets.get(key);

    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      buckets.set(key, entry);
    }

    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));

    if (entry.count > max) {
      res.status(429).json({ ok: false, error: 'rate_limited' });
      return;
    }

    next();
  };
}
