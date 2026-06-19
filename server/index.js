import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { closePool, fetchTopScores, insertScore, isDbConfigured } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
const port = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.json({ limit: '1kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, database: isDbConfigured() });
});

app.get('/api/scores/top', async (_req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ scores: [], error: 'database_unavailable' });
    return;
  }

  try {
    const scores = await fetchTopScores(10);
    res.json({ scores: scores ?? [] });
  } catch (err) {
    console.error('GET /api/scores/top failed:', err);
    res.status(500).json({ scores: [], error: 'server_error' });
  }
});

app.post('/api/scores', async (req, res) => {
  try {
    const result = await insertScore(req.body?.name, req.body?.distance);
    if (!result.ok) {
      res.status(result.status).json({ ok: false, error: result.error });
      return;
    }
    res.status(result.status).json({ ok: true });
  } catch (err) {
    console.error('POST /api/scores failed:', err);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

app.use(express.static(distPath, { index: false }));

app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`Ebedi Koşu listening on :${port}`);
  if (!isDbConfigured()) {
    console.warn('DATABASE_URL missing — leaderboard API disabled');
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await closePool();
    process.exit(0);
  });
}
