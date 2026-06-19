import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { closePool, fetchTopScores, insertScore, isDbConfigured, pingDatabase, getDatabaseName } from './db.js';
import { LB_DEBUG, lbError, lbLog, maskDatabaseUrl } from './debug.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
const port = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json({ limit: '1kb' }));

app.get('/api/health', async (_req, res) => {
  if (!isDbConfigured()) {
    res.json({ ok: true, database: false, connected: false });
    return;
  }

  try {
    await pingDatabase();
    res.json({
      ok: true,
      database: true,
      connected: true,
      db_name: getDatabaseName(),
    });
  } catch (err) {
    lbError('GET /api/health DB ping failed:', err.message);
    res.json({
      ok: true,
      database: true,
      connected: false,
      db_name: getDatabaseName(),
      error: err.message,
    });
  }
});

app.get('/api/scores/top', async (_req, res) => {
  lbLog('GET /api/scores/top');
  if (!isDbConfigured()) {
    lbError('GET /api/scores/top — DATABASE_URL missing');
    res.status(503).json({ scores: [], error: 'database_unavailable' });
    return;
  }

  try {
    const scores = await fetchTopScores(10);
    lbLog('GET /api/scores/top OK', { count: scores?.length ?? 0 });
    res.json({ scores: scores ?? [] });
  } catch (err) {
    lbError('GET /api/scores/top failed:', err.message);
    res.status(500).json({
      scores: [],
      error: 'server_error',
      ...(LB_DEBUG ? { detail: err.message } : {}),
    });
  }
});

app.post('/api/scores', async (req, res) => {
  lbLog('POST /api/scores body', req.body);
  try {
    const result = await insertScore(req.body?.name, req.body?.distance);
    if (!result.ok) {
      lbError('POST /api/scores rejected', result);
      res.status(result.status).json({ ok: false, error: result.error, detail: result.detail });
      return;
    }
    lbLog('POST /api/scores saved', { name: result.playerName, distance: result.distance });
    res.status(result.status).json({ ok: true });
  } catch (err) {
    lbError('POST /api/scores failed:', err.message);
    res.status(500).json({
      ok: false,
      error: 'server_error',
      ...(LB_DEBUG ? { detail: err.message } : {}),
    });
  }
});

app.use(express.static(distPath, { index: false }));

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = app.listen(port, async () => {
  console.log(`Ebedi Koşu listening on :${port}`);
  lbLog('debug mode', LB_DEBUG);
  if (!isDbConfigured()) {
    lbError('DATABASE_URL missing — leaderboard API disabled');
    return;
  }
  lbLog('DATABASE_URL', maskDatabaseUrl(process.env.DATABASE_URL));
  lbLog('database name', getDatabaseName());
  try {
    await pingDatabase();
    lbLog('startup DB check OK');
  } catch (err) {
    lbError('startup DB check FAILED:', err.message);
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await closePool();
    process.exit(0);
  });
}
