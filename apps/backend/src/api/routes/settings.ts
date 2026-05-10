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

router.get('/auto-bet', async (_req, res) => {
  const result = await db.query(`SELECT key, value FROM settings WHERE key IN ('auto_bet_enabled','auto_bet_max_per_bet','auto_bet_min_edge','auto_bet_dry_run')`);
  const map = Object.fromEntries(result.rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  res.json({
    enabled: map['auto_bet_enabled'] === 'true',
    max_per_bet: parseFloat(map['auto_bet_max_per_bet'] ?? '2'),
    min_edge: parseFloat(map['auto_bet_min_edge'] ?? '0.15'),
    dry_run: map['auto_bet_dry_run'] !== 'false',
  });
});

router.patch('/auto-bet', async (req, res) => {
  const { enabled, max_per_bet, min_edge, dry_run } = req.body;
  const updates: [string, string][] = [];
  if (enabled !== undefined) updates.push(['auto_bet_enabled', String(enabled)]);
  if (max_per_bet !== undefined) updates.push(['auto_bet_max_per_bet', String(max_per_bet)]);
  if (min_edge !== undefined) updates.push(['auto_bet_min_edge', String(min_edge)]);
  if (dry_run !== undefined) updates.push(['auto_bet_dry_run', String(dry_run)]);
  for (const [key, value] of updates) {
    await db.query(`INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2`, [key, value]);
  }
  res.json({ ok: true });
});

export default router;
