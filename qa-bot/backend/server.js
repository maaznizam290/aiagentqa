import express from 'express';
import { config } from './config.js';
import {
  initDatabase,
  logRunStart,
  getRecentRuns,
  getRunById,
  computeMetrics,
  getMetricsSnapshots,
} from '../db/index.js';

const app = express();
const router = express.Router();
app.use(express.json());

await initDatabase();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'qa-bot-backend', timestamp: Date.now() });
});

router.get('/runs', async (_req, res, next) => {
  try {
    const runs = await getRecentRuns();
    res.json({ runs });
  } catch (error) {
    next(error);
  }
});

router.get('/runs/:id', async (req, res, next) => {
  try {
    const run = await getRunById(Number(req.params.id));
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json({ run });
  } catch (error) {
    next(error);
  }
});

router.post('/runs', async (req, res, next) => {
  try {
    const { targetUrl = config.defaultTargetUrl, runner = 'playwright' } =
      req.body ?? {};

    if (!targetUrl) {
      res.status(400).json({ error: 'targetUrl is required' });
      return;
    }

    const runId = await logRunStart({ targetUrl, runner });
    res.status(201).json({ id: runId, targetUrl, runner });
  } catch (error) {
    next(error);
  }
});

router.get('/metrics', async (_req, res, next) => {
  try {
    const [metrics, snapshots] = await Promise.all([
      computeMetrics({}),
      getMetricsSnapshots(50),
    ]);
    res.json({ metrics, snapshots });
  } catch (error) {
    next(error);
  }
});

app.use('/api', router);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(config.port, () => {
    console.log(`QA Bot backend listening on http://localhost:${config.port}`);
  });
}

export default app;

