import { db } from '../db/client';
import { getMarket, placeOrder, getPortfolioBalance } from '../lib/kalshi';

export interface AutoBetSettings {
  enabled: boolean;
  maxPerBet: number;
  minEdge: number;
  minPrice: number;  // min ask price in cents (e.g. 30)
  maxPrice: number;  // max ask price in cents (e.g. 75)
  maxDays: number;   // max days to close_time
  dryRun: boolean;
}

const MAX_CONCURRENT = 3;

export async function getAutoBetSettings(): Promise<AutoBetSettings> {
  const result = await db.query(`
    SELECT key, value FROM settings
    WHERE key IN ('auto_bet_enabled','auto_bet_max_per_bet','auto_bet_min_edge',
                  'auto_bet_dry_run','auto_bet_min_price','auto_bet_max_price','auto_bet_max_days')
  `);
  const m = Object.fromEntries(result.rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    enabled:    m['auto_bet_enabled'] === 'true',
    maxPerBet:  parseFloat(m['auto_bet_max_per_bet'] ?? '3'),
    minEdge:    parseFloat(m['auto_bet_min_edge'] ?? '0.20'),
    minPrice:   parseInt(m['auto_bet_min_price'] ?? '30'),
    maxPrice:   parseInt(m['auto_bet_max_price'] ?? '75'),
    maxDays:    parseInt(m['auto_bet_max_days'] ?? '30'),
    dryRun:     m['auto_bet_dry_run'] !== 'false',
  };
}

function computeBetSize(kellyFraction: number, bankroll: number, maxPerBet: number): number {
  const kelly = Math.max(0, kellyFraction) * bankroll;
  return Math.min(kelly, maxPerBet, bankroll * 0.25);
}

export async function runAutoBettor(): Promise<{ placed: number; skipped: number; errors: string[] }> {
  const settings = await getAutoBetSettings();
  if (!settings.enabled) return { placed: 0, skipped: 0, errors: [] };

  const balance = await getPortfolioBalance();
  const bankroll = balance.cash;

  if (bankroll < 0.50) {
    console.log('[AutoBet] Skipping — cash too low:', bankroll);
    return { placed: 0, skipped: 0, errors: [] };
  }

  const activeCount = await db.query(
    `SELECT COUNT(*) FROM bets WHERE outcome = 'pending' AND kalshi_fill_id LIKE 'auto:%'`
  );
  if (Number(activeCount.rows[0].count) >= MAX_CONCURRENT) {
    console.log(`[AutoBet] Skipping — ${MAX_CONCURRENT} active auto-bets already open`);
    return { placed: 0, skipped: 0, errors: [] };
  }

  const recs = await db.query(`
    SELECT r.id, r.market_ticker, r.market_title, r.side, r.edge, r.kelly_fraction,
           r.market_yes_price, r.estimated_probability, r.close_time, r.category
    FROM recommendations r
    WHERE r.outcome = 'pending'
      AND r.confidence = 'high'
      AND r.edge >= $1 * 100
      AND r.category != 'Other'
      AND r.market_yes_price BETWEEN $2 AND $3
      AND r.close_time > NOW() + INTERVAL '24 hours'
      AND r.close_time <= NOW() + ($4 * INTERVAL '1 day')
      AND NOT EXISTS (
        SELECT 1 FROM bets b WHERE b.market_ticker = r.market_ticker AND b.outcome = 'pending'
      )
    ORDER BY r.edge DESC
    LIMIT $5
  `, [settings.minEdge, settings.minPrice, settings.maxPrice, settings.maxDays, MAX_CONCURRENT]);

  let placed = 0;
  let skipped = 0;
  const errors: string[] = [];
  let remainingCash = bankroll;

  for (const rec of recs.rows) {
    const betAmount = computeBetSize(Number(rec.kelly_fraction), bankroll, settings.maxPerBet);
    if (betAmount < 0.10) { skipped++; continue; }
    if (betAmount > remainingCash * 0.5) { skipped++; continue; }

    try {
      const market = await getMarket(rec.market_ticker as string);
      const askPrice = rec.side === 'yes'
        ? Math.round(parseFloat(market.yes_ask_dollars ?? '0') * 100)
        : Math.round(parseFloat(market.no_ask_dollars ?? '0') * 100);

      // Re-check price range against live ask (market may have moved)
      if (askPrice < settings.minPrice || askPrice > settings.maxPrice) {
        console.log(`[AutoBet] Skip ${rec.market_ticker} — live ask ${askPrice}¢ outside range`);
        skipped++;
        continue;
      }

      const count = Math.floor(betAmount / (askPrice / 100));
      if (count < 1) { skipped++; continue; }

      const actualAmount = Math.round(count * (askPrice / 100) * 100) / 100;

      if (settings.dryRun) {
        console.log(`[AutoBet] DRY RUN: ${rec.market_ticker} ${String(rec.side).toUpperCase()} ${count} @ ${askPrice}¢ = $${actualAmount} (edge=${(Number(rec.edge)*100).toFixed(1)}% cat=${rec.category})`);
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
