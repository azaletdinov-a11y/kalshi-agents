import { Router } from 'express';
import { db } from '../../db/client';

const router = Router();

function normalizeBet(b: Record<string, unknown>) {
  return {
    ...b,
    fill_price: Number(b.fill_price),
    amount: Number(b.amount),
    pnl: b.pnl != null ? Number(b.pnl) : null,
  };
}

router.get('/', async (req, res) => {
  const { outcome } = req.query;
  const result = outcome
    ? await db.query(`SELECT * FROM bets WHERE outcome=$1 ORDER BY placed_at DESC LIMIT 200`, [outcome])
    : await db.query(`SELECT * FROM bets ORDER BY placed_at DESC LIMIT 200`);
  res.json(result.rows.map(normalizeBet));
});

router.get('/summary', async (_req, res) => {
  const result = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE outcome != 'cancelled') AS total_bets,
      COALESCE(SUM(amount) FILTER (WHERE outcome != 'cancelled'), 0) AS total_wagered,
      COALESCE(SUM(pnl) FILTER (WHERE outcome IN ('won','lost')), 0) AS total_pnl,
      COUNT(*) FILTER (WHERE outcome = 'pending') AS pending_bets,
      COUNT(*) FILTER (WHERE outcome = 'won') AS won,
      COUNT(*) FILTER (WHERE outcome IN ('won','lost')) AS resolved
    FROM bets
  `);
  const row = result.rows[0];
  const won = Number(row.won);
  const resolved = Number(row.resolved);
  const totalWagered = Number(row.total_wagered);
  const totalPnl = Number(row.total_pnl);
  res.json({
    total_bets: Number(row.total_bets),
    total_wagered: totalWagered,
    total_pnl: totalPnl,
    win_rate: resolved > 0 ? Math.round((won / resolved) * 100) : null,
    pending_bets: Number(row.pending_bets),
    roi: totalWagered > 0 ? Math.round((totalPnl / totalWagered) * 10000) / 100 : null,
  });
});

router.get('/closing-soon', async (_req, res) => {
  const result = await db.query(`
    SELECT * FROM bets
    WHERE outcome = 'pending'
      AND close_time <= NOW() + INTERVAL '24 hours'
    ORDER BY close_time ASC
  `);
  res.json(result.rows.map(normalizeBet));
});

router.post('/', async (req, res) => {
  const { recommendation_id, fill_price, amount } = req.body;
  if (!recommendation_id || fill_price == null || amount == null) {
    return res.status(400).json({ error: 'recommendation_id, fill_price, amount required' });
  }

  const rec = await db.query(
    `SELECT market_ticker, market_title, side, close_time FROM recommendations WHERE id=$1`,
    [recommendation_id]
  );
  if (rec.rows.length === 0) return res.status(404).json({ error: 'Recommendation not found' });

  const { market_ticker, market_title, side, close_time } = rec.rows[0];
  const result = await db.query(
    `INSERT INTO bets (recommendation_id, market_ticker, market_title, side, fill_price, amount, close_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [recommendation_id, market_ticker, market_title, side, fill_price, amount, close_time]
  );
  console.log(`[Bets] Recorded: ${market_ticker} ${side.toUpperCase()} $${amount} @ ${fill_price}%`);
  res.json(normalizeBet(result.rows[0]));
});

router.delete('/:id', async (req, res) => {
  await db.query(`UPDATE bets SET outcome='cancelled' WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;
