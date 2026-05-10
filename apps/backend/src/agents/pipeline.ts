import { db } from '../db/client';
import { scanMarkets } from './market-scanner';
import { researchMarket } from './researcher';
import { estimateMarket } from './estimator';
import { evaluateAndStore } from './risk-manager';
import { runAutoBettor } from './auto-bettor';

let isRunning = false;

export async function runPipeline(): Promise<{ marketsScanned: number; recommendationsGenerated: number }> {
  if (isRunning) {
    throw new Error('Pipeline already running');
  }
  isRunning = true;

  const runResult = await db.query(
    `INSERT INTO pipeline_runs (status) VALUES ('running') RETURNING id`
  );
  const runId: number = runResult.rows[0].id;

  let marketsScanned = 0;
  let recommendationsGenerated = 0;

  try {
    // Expire pending recs whose markets have already closed
    const expired = await db.query(
      `UPDATE recommendations SET outcome='cancelled'
       WHERE outcome='pending' AND close_time < NOW()
       RETURNING market_ticker`
    );
    if (expired.rowCount && expired.rowCount > 0) {
      console.log(`[Pipeline] Expired ${expired.rowCount} closed-market recommendations`);
    }

    const markets = await scanMarkets();
    marketsScanned = markets.length;

    for (const market of markets) {
      try {
        const research = await researchMarket(market);
        const estimation = await estimateMarket(market, research);
        const stored = await evaluateAndStore(market, estimation, research);
        if (stored) recommendationsGenerated++;

        // Avoid hammering Claude API — small delay between markets
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        console.error(`[Pipeline] Error processing ${market.ticker}:`, err);
      }
    }

    await db.query(
      `UPDATE pipeline_runs SET status='completed', completed_at=NOW(),
       markets_scanned=$1, recommendations_generated=$2 WHERE id=$3`,
      [marketsScanned, recommendationsGenerated, runId]
    );

    console.log(
      `[Pipeline] Done — ${marketsScanned} markets, ${recommendationsGenerated} recommendations`
    );

    // Auto-bet after recommendations are generated
    try {
      const autoBet = await runAutoBettor();
      if (autoBet.placed > 0 || autoBet.errors.length > 0) {
        console.log(`[AutoBet] placed=${autoBet.placed} skipped=${autoBet.skipped} errors=${autoBet.errors.length}`);
      }
    } catch (e) {
      console.error('[AutoBet] Failed:', e);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.query(
      `UPDATE pipeline_runs SET status='failed', completed_at=NOW(), error=$1 WHERE id=$2`,
      [msg, runId]
    );
    throw err;
  } finally {
    isRunning = false;
  }

  return { marketsScanned, recommendationsGenerated };
}

export function isPipelineRunning(): boolean {
  return isRunning;
}
