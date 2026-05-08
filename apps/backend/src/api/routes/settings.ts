import { Router } from 'express';
import { db } from '../../db/client';

const router = Router();

router.get('/bankroll', async (_req, res) => {
  const [setting, pnl] = await Promise.all([
    db.query(`SELECT value FROM settings WHERE key='starting_bankroll'`),
    db.query(`SELECT COALESCE(SUM(pnl), 0) AS realized_pnl FROM bets WHERE outcome IN ('won','lost')`),
  ]);
  const starting = Number(setting.rows[0]?.value ?? process.env.BANKROLL ?? 100);
  const realized = Number(pnl.rows[0].realized_pnl);
  res.json({
    starting_bankroll: starting,
    realized_pnl: Math.round(realized * 100) / 100,
    current_bankroll: Math.round((starting + realized) * 100) / 100,
  });
});

router.patch('/bankroll', async (req, res) => {
  const { amount } = req.body;
  if (!amount || isNaN(Number(amount))) return res.status(400).json({ error: 'amount required' });
  await db.query(`
    INSERT INTO settings (key, value) VALUES ('starting_bankroll', $1)
    ON CONFLICT (key) DO UPDATE SET value = $1
  `, [String(amount)]);
  res.json({ ok: true, starting_bankroll: Number(amount) });
});

export default router;
