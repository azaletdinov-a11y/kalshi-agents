import { db } from '../db/client';
import { getMarket, placeOrder, getPortfolioBalance } from '../lib/kalshi';

export interface AutoBetSettings {
  enabled: boolean;
  maxPerBet: number;   // $ max per single bet
  minEdge: number;     // minimum edge (0–1)
  dryRun: boolean;     // log only, don't place real orders
}

export async function getAutoBetSettings(): Promise<AutoBetSettings> {
  const result = await db.query(`SELECT key, value FROM settings WHERE key IN ('auto_bet_enabled','auto_bet_max_per_bet','auto_bet_min_edge','auto_bet_dry_run')`);
  const map = Object.fromEntries(result.rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    enabled: map['auto_bet_enabled'] === 'true',
    maxPerBet: parseFloat(map['auto_bet_max_per_bet'] ?? '2'),
    minEdge: parseFloat(map['auto_bet_min_edge'] ?? '0.15'),
    dryRun: map['auto_bet_dry_run'] !== 'false',  // dry run by default until user disables
  };
}

// Returns dollar amount to bet given Kelly fraction, bankroll, and caps
function computeBetSize(kellyFraction: number, bankroll: number, maxPerBet: number): number {
  const kelly = Math.max(0, kellyFraction) * bankroll;
  return Math.min(kelly, maxPerBet, bankroll * 0.25); // never more than 25% of bankroll
}

export async function runAutoBettor(): Promise<{ placed: number; skipped: number; errors: string[] }> {
  const settings = await getAutoBetSettings();
  if (!settings.enabled) return { placed: 0, skipped: 0, errors: [] };

  const balance = await getPortfolioBalance();
  const bankroll = balance.cash;

  if (bankroll < 0.50) {
    console.log('[AutoBet] Skipping — Kalshi cash balance too low:', bankroll);
    return { placed: 0, skipped: 0, errors: [] };
  }

  // Count active auto-bets to enforce max-concurrent limit
  const activeCount = await db.query(`SELECT COUNT(*) FROM bets WHERE outcome = 'pending' AND kalshi_fill_id LIKE 'auto:%'`);
  if (Number(activeCount.rows[0].count) >= 5) {
    console.log('[AutoBet] Skipping — 5 active auto-bets already open');
    return { placed: 0, skipped: 0, errors: [] };
  }

  // Fetch high-confidence pending recommendations not already bet
  const recs = await db.query(`
    SELECT r.id, r.market_ticker, r.market_title, r.side, r.edge, r.kelly_fraction,
           r.market_yes_price, r.estimated_probability, r.close_time
    FROM recommendations r
    WHERE r.outcome = 'pending'
      AND r.confidence = 'high'
      AND r.edge >= $1
      AND r.close_time > NOW() + INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM bets b WHERE b.market_ticker = r.market_ticker AND b.outcome = 'pending'
      )
    ORDER BY r.edge DESC
    LIMIT 5
  `, [settings.minEdge]);

  let placed = 0;
  let skipped = 0;
  const errors: string[] = [];
  let remainingCash = bankroll;

  for (const rec of recs.rows) {
    const betAmount = computeBetSize(Number(rec.kelly_fraction), bankroll, settings.maxPerBet);
    if (betAmount < 0.10) { skipped++; continue; }
    if (betAmount > remainingCash * 0.5) { skipped++; continue; } // don't spend >50% remaining in one shot

    try {
      const market = await getMarket(rec.market_ticker as string);
      const askPrice = rec.side === 'yes'
        ? Math.round(parseFloat(market.yes_ask_dollars ?? '0') * 100)
        : Math.round(parseFloat(market.no_ask_dollars ?? '0') * 100);

      if (askPrice <= 0 || askPrice >= 100) { skipped++; continue; }

      const count = Math.floor(betAmount / (askPrice / 100));
      if (count < 1) { skipped++; continue; }

      const actualAmount = Math.round(count * (askPrice / 100) * 100) / 100;

      if (settings.dryRun) {
        console.log(`[AutoBet] DRY RUN: ${rec.market_ticker} ${String(rec.side).toUpperCase()} ${count} contracts @ ${askPrice}¢ = $${actualAmount}`);
        placed++;
        remainingCash -= actualAmount;
        continue;
      }

      const order = await placeOrder(rec.market_ticker as string, rec.side as 'yes' | 'no', count, askPrice);

      await db.query(
        `INSERT INTO bets (kalshi_fill_id, recommendation_id, market_ticker, market_title, side, fill_price, amount, close_time, placed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [`auto:${order.order_id}`, rec.id, rec.market_ticker, rec.market_title, rec.side, askPrice, actualAmount, rec.close_time]
      );

      console.log(`[AutoBet] Placed: ${rec.market_ticker} ${String(rec.side).toUpperCase()} ${count} @ ${askPrice}¢ = $${actualAmount}`);
      placed++;
      remainingCash -= actualAmount;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${rec.market_ticker}: ${msg}`);
    }
  }

  return { placed, skipped, errors };
}
