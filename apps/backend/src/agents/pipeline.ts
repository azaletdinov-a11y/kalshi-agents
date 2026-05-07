import { db } from '../db/client';
import { scanMarkets } from './market-scanner';
import { researchMarket } from './researcher';
import { estimateMarket } from './estimator';
import { evaluateAndStore } from './risk-manager';

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
