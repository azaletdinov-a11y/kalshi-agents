import { db } from '../db/client';
import { getMarket } from '../lib/kalshi';

export async function resolveSettledMarkets(): Promise<number> {
  const pending = await db.query(
    `SELECT id, market_ticker, side FROM recommendations WHERE outcome='pending'`
  );

  if (pending.rows.length === 0) return 0;

  let resolved = 0;
  for (const rec of pending.rows) {
    try {
      const market = await getMarket(rec.market_ticker as string);

      const isSettled =
        market.status === 'finalized' ||
        market.status === 'settled' ||
        (typeof market.result === 'string' && market.result !== '');

      if (!isSettled) continue;

      const result = market.result?.toLowerCase();
      const outcome = result === rec.side ? 'won' : 'lost';

      await db.query(
        `UPDATE recommendations SET outcome=$1 WHERE id=$2`,
        [outcome, rec.id]
      );
      console.log(`[Resolver] ${rec.market_ticker}: ${outcome.toUpperCase()} (result=${result}, bet=${rec.side})`);
      resolved++;

      // Auto-resolve any bets on this market
      const bets = await db.query(
        `SELECT id, amount, fill_price, side FROM bets WHERE market_ticker=$1 AND outcome='pending'`,
        [rec.market_ticker]
      );
      for (const bet of bets.rows) {
        const betOutcome = result === bet.side ? 'won' : 'lost';
        const amount = Number(bet.amount);
        const fillPrice = Number(bet.fill_price);
        // Kalshi payout: round contracts down to 2dp, deduct 7% fee on profit
        const contracts = Math.floor((amount / (fillPrice / 100)) * 100) / 100;
        const grossProfit = contracts - amount;
        const pnl = betOutcome === 'won'
          ? Math.round((grossProfit - Math.max(0, grossProfit) * 0.07) * 100) / 100
          : -amount;
        await db.query(
          `UPDATE bets SET outcome=$1, pnl=$2, resolved_at=NOW() WHERE id=$3`,
          [betOutcome, pnl, bet.id]
        );
        console.log(`[Resolver] Bet #${bet.id} ${rec.market_ticker}: ${betOutcome.toUpperCase()} pnl=${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
      }
    } catch (err) {
      // Market might not exist anymore or API error — skip silently
    }
  }

  if (resolved > 0) {
    console.log(`[Resolver] Resolved ${resolved} recommendation(s)`);
  }

  // Also resolve Kalshi-synced bets that have no linked recommendation
  const orphanBets = await db.query(`
    SELECT DISTINCT market_ticker FROM bets
    WHERE outcome = 'pending' AND recommendation_id IS NULL
  `);

  for (const row of orphanBets.rows) {
    try {
      const market = await getMarket(row.market_ticker as string);
      const isSettled =
        market.status === 'finalized' ||
        market.status === 'settled' ||
        (typeof market.result === 'string' && market.result !== '');

      if (!isSettled) continue;

      const result = market.result?.toLowerCase();
      const bets = await db.query(
        `SELECT id, amount, fill_price, side FROM bets WHERE market_ticker=$1 AND outcome='pending' AND recommendation_id IS NULL`,
        [row.market_ticker]
      );
      for (const bet of bets.rows) {
        const betOutcome = result === bet.side ? 'won' : 'lost';
        const amount = Number(bet.amount);
        const fillPrice = Number(bet.fill_price);
        const contracts = Math.floor((amount / (fillPrice / 100)) * 100) / 100;
        const grossProfit = contracts - amount;
        const pnl = betOutcome === 'won'
          ? Math.round((grossProfit - Math.max(0, grossProfit) * 0.07) * 100) / 100
          : -amount;
        await db.query(
          `UPDATE bets SET outcome=$1, pnl=$2, resolved_at=NOW() WHERE id=$3`,
          [betOutcome, pnl, bet.id]
        );
        console.log(`[Resolver] Synced bet #${bet.id} ${row.market_ticker}: ${betOutcome.toUpperCase()} pnl=${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
      }
    } catch {
      // skip
    }
  }

  return resolved;
}
