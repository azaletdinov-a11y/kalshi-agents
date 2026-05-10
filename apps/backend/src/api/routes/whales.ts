import { Router } from 'express';
import { getWhaleAlerts, snapshotMarkets } from '../../agents/whale-hunter';
import { db } from '../../db/client';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const minVol   = parseInt((req.query['min_vol']   as string) ?? '100');
    const minPrice = parseInt((req.query['min_price'] as string) ?? '8');
    const alerts = await getWhaleAlerts(minVol, minPrice);

    const meta = await db.query(
      `SELECT MAX(captured_at) AS last_snapshot, COUNT(DISTINCT captured_at)::int AS snapshot_count
       FROM market_snapshots`
    );

    res.json({
      alerts,
      last_snapshot:   meta.rows[0].last_snapshot ?? null,
      snapshot_count:  meta.rows[0].snapshot_count ?? 0,
    });
  } catch (err) {
    console.error('[Whales] GET error:', err);
    res.status(500).json({ error: String(err) });
  }
});

router.post('/snapshot', async (_req, res) => {
  try {
    const count = await snapshotMarkets();
    res.json({ ok: true, snapshotted: count });
  } catch (err) {
    console.error('[Whales] Snapshot error:', err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
