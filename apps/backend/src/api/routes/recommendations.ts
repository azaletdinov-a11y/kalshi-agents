import { Router } from 'express';
import { db } from '../../db/client';

const router = Router();

router.get('/calibration', async (_req, res) => {
  const result = await db.query(`
    SELECT
      width_bucket(estimated_probability, 0, 100, 10) AS bucket,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE outcome = 'won') AS wins,
      AVG(estimated_probability) AS avg_estimate
    FROM recommendations
    WHERE outcome IN ('won', 'lost')
    GROUP BY bucket
    ORDER BY bucket
  `);
  const data = result.rows.map((r) => ({
    bucket: (Number(r.bucket) - 1) * 10,
    label: `${(Number(r.bucket) - 1) * 10}–${Number(r.bucket) * 10}%`,
    total: Number(r.total),
    wins: Number(r.wins),
    win_rate: Number(r.total) > 0 ? Math.round((Number(r.wins) / Number(r.total)) * 100) : null,
    avg_estimate: Math.round(Number(r.avg_estimate)),
  }));
  res.json(data);
});

router.get('/ev-summary', async (_req, res) => {
  const result = await db.query(`
    SELECT
      COALESCE(SUM(r.edge * b.amount / 100), 0) AS total_ev,
      COALESCE(SUM(b.amount), 0) AS total_exposure,
      COUNT(*) AS pending_count
    FROM bets b
    JOIN recommendations r ON b.recommendation_id = r.id
    WHERE b.outcome = 'pending'
  `);
  const row = result.rows[0];
  res.json({
    total_ev: Math.round((Number(row.total_ev) || 0) * 100) / 100,
    total_exposure: Math.round((Number(row.total_exposure) || 0) * 100) / 100,
    pending_count: Number(row.pending_count),
  });
});

router.get('/', async (req, res) => {
  const { outcome = 'pending', limit = '50', offset = '0' } = req.query;
  const result = await db.query(
    `SELECT * FROM recommendations WHERE outcome = $1
     ORDER BY edge DESC, created_at DESC
     LIMIT $2 OFFSET $3`,
    [outcome, Number(limit), Number(offset)]
  );
  res.json(result.rows);
});

router.get('/:id', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM recommendations WHERE id = $1',
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

router.patch('/:id/outcome', async (req, res) => {
  const { outcome } = req.body;
  if (!['won', 'lost', 'cancelled'].includes(outcome)) {
    return res.status(400).json({ error: 'Invalid outcome' });
  }
  const result = await db.query(
    `UPDATE recommendations SET outcome=$1, resolved_at=NOW() WHERE id=$2 RETURNING *`,
    [outcome, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(result.rows[0]);
});

export default router;
