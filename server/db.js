import pg from 'pg';
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

export async function fetchTopScores(limit = 10) {
  const db = getPool();
  if (!db) return null;

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
  if (!playerName || scoreDistance === null) {
    return { ok: false, status: 400, error: 'invalid_payload' };
  }

  const db = getPool();
  if (!db) {
    return { ok: false, status: 503, error: 'database_unavailable' };
  }

  await db.query(
    `INSERT INTO scores (player_name, distance) VALUES ($1, $2)`,
    [playerName, scoreDistance]
  );

  return { ok: true, status: 201 };
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
