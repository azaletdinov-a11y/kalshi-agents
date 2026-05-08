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
    } catch (err) {
      // Market might not exist anymore or API error — skip silently
    }
  }

  if (resolved > 0) {
    console.log(`[Resolver] Resolved ${resolved} recommendation(s)`);
  }

  return resolved;
}
