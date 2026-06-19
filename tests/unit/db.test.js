import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('server/db', () => {
  const originalUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    delete process.env.DATABASE_URL;
    const { closePool } = await import('../../server/db.js');
    await closePool();
  });

  afterEach(async () => {
    if (originalUrl) process.env.DATABASE_URL = originalUrl;
    else delete process.env.DATABASE_URL;
    const { closePool } = await import('../../server/db.js');
    await closePool();
  });

  it('reports database as not configured without DATABASE_URL', async () => {
    const { isDbConfigured, getDatabaseName } = await import('../../server/db.js');
    expect(isDbConfigured()).toBe(false);
    expect(getDatabaseName()).toBeNull();
  });

  it('insertScore returns 503 when database is unavailable', async () => {
    const { insertScore } = await import('../../server/db.js');
    const result = await insertScore('Ali', 120);
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: 'database_unavailable',
    });
  });

  it('fetchTopScores returns null when database is unavailable', async () => {
    const { fetchTopScores } = await import('../../server/db.js');
    expect(await fetchTopScores()).toBeNull();
  });

  it('insertScore rejects invalid payload before touching database', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test_db';
    const { closePool, insertScore } = await import('../../server/db.js');

    const badName = await insertScore('A', 120);
    expect(badName.ok).toBe(false);
    expect(badName.status).toBe(400);
    expect(badName.detail).toBe('invalid_name');

    const badDistance = await insertScore('Ali', 0);
    expect(badDistance.ok).toBe(false);
    expect(badDistance.detail).toBe('invalid_distance');

    await closePool();
  });

  it('parses database name from DATABASE_URL', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/ebedi_kosu';
    const { getDatabaseName, closePool } = await import('../../server/db.js');
    expect(getDatabaseName()).toBe('ebedi_kosu');
    await closePool();
  });
});
