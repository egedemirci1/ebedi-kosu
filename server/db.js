import pg from 'pg';
import { lbLog } from './debug.js';
import { sanitizePlayerName, validateDistance } from './validate.js';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getDatabaseName() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const pathname = new URL(process.env.DATABASE_URL).pathname;
    return pathname.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

export async function ensureSchema() {
  const db = getPool();
  if (!db) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      player_name TEXT NOT NULL,
      distance INTEGER NOT NULL CHECK (distance >= 1),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function pingDatabase() {
  const db = getPool();
  if (!db) throw new Error('database_unavailable');
  await db.query('SELECT 1');
  await ensureSchema();
}

export async function fetchTopScores(limit = 10) {
  const db = getPool();
  if (!db) return null;

  await ensureSchema();

  const { rows } = await db.query(
    `SELECT player_name, distance, created_at
     FROM scores
     ORDER BY distance DESC, created_at ASC
     LIMIT $1`,
    [limit]
  );

  return rows.map((row, index) => ({
    rank: index + 1,
    player_name: row.player_name,
    distance: row.distance,
  }));
}

export async function insertScore(name, distance) {
  const playerName = sanitizePlayerName(name);
  const scoreDistance = validateDistance(distance);
  lbLog('insertScore validate', { rawName: name, rawDistance: distance, playerName, scoreDistance });
  if (!playerName || scoreDistance === null) {
    const detail = !playerName ? 'invalid_name' : 'invalid_distance';
    return { ok: false, status: 400, error: 'invalid_payload', detail };
  }

  const db = getPool();
  if (!db) {
    return { ok: false, status: 503, error: 'database_unavailable' };
  }

  await ensureSchema();

  await db.query(
    `INSERT INTO scores (player_name, distance) VALUES ($1, $2)`,
    [playerName, scoreDistance]
  );

  return { ok: true, status: 201, playerName, distance: scoreDistance };
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
