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
      if (!result) {
        console.warn(`[Resolver] ${rec.market_ticker}: finalized but no result field — skipping`);
        continue;
      }

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
      console.error(`[Resolver] Failed to resolve ${rec.market_ticker}:`, err instanceof Error ? err.message : err);
    }
  }

  if (resolved > 0) {
    console.log(`[Resolver] Resolved ${resolved} recommendation(s)`);
  }

  // Resolve Kalshi-synced bets with no linked recommendation — fetch all at once, group by ticker
  const orphanBets = await db.query(`
    SELECT id, market_ticker, amount, fill_price, side
    FROM bets
    WHERE outcome = 'pending' AND recommendation_id IS NULL
  `);

  if (orphanBets.rows.length > 0) {
    // Group by ticker so we make one getMarket() call per ticker, not per bet
    const byTicker = new Map<string, typeof orphanBets.rows>();
    for (const bet of orphanBets.rows) {
      const list = byTicker.get(bet.market_ticker as string) ?? [];
      list.push(bet);
      byTicker.set(bet.market_ticker as string, list);
    }

    for (const [ticker, bets] of byTicker) {
      try {
        const market = await getMarket(ticker);
        const isSettled =
          market.status === 'finalized' ||
          market.status === 'settled' ||
          (typeof market.result === 'string' && market.result !== '');

        if (!isSettled) continue;

        const result = market.result?.toLowerCase();
        if (!result) {
          console.warn(`[Resolver] ${ticker}: finalized but no result field — skipping`);
          continue;
        }

        for (const bet of bets) {
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
          console.log(`[Resolver] Synced bet #${bet.id} ${ticker}: ${betOutcome.toUpperCase()} pnl=${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
        }
      } catch (err) {
        console.error(`[Resolver] Failed to resolve orphan bets for ${ticker}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  return resolved;
}
