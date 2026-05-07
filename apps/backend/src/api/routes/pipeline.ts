import { Router } from 'express';
import { db } from '../../db/client';
import { runPipeline, isPipelineRunning } from '../../agents/pipeline';

const router = Router();

router.get('/status', async (_req, res) => {
  const result = await db.query(
    `SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 10`
  );
  res.json({
    is_running: isPipelineRunning(),
    runs: result.rows,
  });
});

router.get('/stats', async (_req, res) => {
  const [activeRec, lastRun, history] = await Promise.all([
    db.query(`SELECT COUNT(*) FROM recommendations WHERE outcome='pending'`),
    db.query(`SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1`),
    db.query(`SELECT outcome, COUNT(*) FROM recommendations WHERE outcome != 'pending' GROUP BY outcome`),
  ]);

  const resolved: Record<string, number> = {};
  history.rows.forEach((r: { outcome: string; count: string }) => {
    resolved[r.outcome] = Number(r.count);
  });
  const won = resolved['won'] ?? 0;
  const lost = resolved['lost'] ?? 0;
  const total = won + lost;

  res.json({
    active_recommendations: Number(activeRec.rows[0].count),
    last_run: lastRun.rows[0] ?? null,
    win_rate: total > 0 ? Math.round((won / total) * 100) : null,
    total_resolved: total,
  });
});

router.post('/run', async (_req, res) => {
  if (isPipelineRunning()) {
    return res.status(409).json({ error: 'Pipeline already running' });
  }
  // Fire and don't await — returns immediately
  runPipeline().catch(console.error);
  res.json({ message: 'Pipeline started' });
});

export default router;
