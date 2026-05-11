import { Router } from 'express';
import { getWhaleAlerts, getWhaleEventHistory, snapshotMarkets } from '../../agents/whale-hunter';
import { db } from '../../db/client';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const minVol   = parseInt((req.query['min_vol']   as string) ?? '50');
    const minPrice = parseInt((req.query['min_price'] as string) ?? '8');
    const histHours = parseInt((req.query['hours'] as string) ?? '48');

    const [events, meta, multRow] = await Promise.all([
      getWhaleEventHistory(histHours),
      db.query(
        `SELECT MAX(captured_at) AS last_snapshot,
                COUNT(DISTINCT captured_at)::int AS snapshot_count,
                COUNT(DISTINCT ticker)::int AS market_count
         FROM market_snapshots`
      ),
      db.query(`SELECT value FROM settings WHERE key='whale_spike_multiplier'`),
    ]);
    const spikeMultiplier = parseFloat(multRow.rows[0]?.value ?? '3');
    const alerts = await getWhaleAlerts(minVol, minPrice, spikeMultiplier);

    res.json({
      alerts,
      events,
      last_snapshot:  meta.rows[0].last_snapshot ?? null,
      snapshot_count: meta.rows[0].snapshot_count ?? 0,
      market_count:   meta.rows[0].market_count ?? 0,
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
