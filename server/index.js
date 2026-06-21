import 'dotenv/config';
import dns from 'dns';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { closePool, fetchTopScores, insertScore, isDbConfigured, pingDatabase, getDatabaseName } from './db.js';
import { LB_DEBUG, lbError, lbLog, maskDatabaseUrl } from './debug.js';
import { createRateLimiter } from './rateLimit.js';
import { securityHeaders } from './security.js';
import { createRunToken, isRunSessionConfigured, verifyRunScoreSubmission } from './runSession.js';

dns.setDefaultResultOrder('ipv4first');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
const port = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(express.json({ limit: '1kb' }));

const scoreSubmitLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyPrefix: 'scores',
});

const runStartLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyPrefix: 'runs',
});

app.get('/api/health', async (_req, res) => {
  if (!isDbConfigured()) {
    res.json({ ok: true, database: false, connected: false, run_sessions: false });
    return;
  }

  try {
    await pingDatabase();
    const payload = {
      ok: true,
      database: true,
      connected: true,
      run_sessions: isRunSessionConfigured(),
    };
    if (LB_DEBUG) {
      payload.db_name = getDatabaseName();
    }
    res.json(payload);
  } catch (err) {
    lbError('GET /api/health DB ping failed:', err.message);
    const payload = {
      ok: true,
      database: true,
      connected: false,
    };
    if (LB_DEBUG) {
      payload.db_name = getDatabaseName();
      payload.error = err.message;
    }
    res.json(payload);
  }
});

app.post('/api/runs/start', runStartLimiter, (_req, res) => {
  const session = createRunToken();
  if (!session) {
    lbError('POST /api/runs/start — RUN_SESSION_SECRET missing');
    res.status(503).json({ ok: false, error: 'run_session_unavailable' });
    return;
  }

  lbLog('POST /api/runs/start OK');
  res.status(201).json({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
  });
});

app.get('/api/scores/top', async (_req, res) => {
  lbLog('GET /api/scores/top');
  if (!isDbConfigured()) {
    lbError('GET /api/scores/top — DATABASE_URL missing');
    res.status(503).json({ scores: [], error: 'database_unavailable' });
    return;
  }

  try {
    const scores = await fetchTopScores(5);
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

app.post('/api/scores', scoreSubmitLimiter, async (req, res) => {
  lbLog('POST /api/scores body', {
    name: req.body?.name,
    distance: req.body?.distance,
    activeMs: req.body?.activeMs,
    hasToken: Boolean(req.body?.runToken),
  });

  const runCheck = verifyRunScoreSubmission(
    req.body?.runToken,
    req.body?.distance,
    req.body?.activeMs
  );
  if (!runCheck.ok) {
    lbError('POST /api/scores rejected by run session', runCheck);
    res.status(runCheck.status).json({ ok: false, error: runCheck.error });
    return;
  }

  try {
    const result = await insertScore(req.body?.name, req.body?.distance);
    if (!result.ok) {
      lbError('POST /api/scores rejected', result);
      res.status(result.status).json({
        ok: false,
        error: result.error,
        ...(LB_DEBUG ? { detail: result.detail } : {}),
      });
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
  if (isProduction && !isRunSessionConfigured()) {
    lbError('RUN_SESSION_SECRET missing — score submissions will be rejected');
  }
  lbLog('DATABASE_URL', maskDatabaseUrl(process.env.DATABASE_URL));
  if (LB_DEBUG) lbLog('database name', getDatabaseName());
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
