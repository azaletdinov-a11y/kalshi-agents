import cron from 'node-cron';
import { runPipeline } from '../agents/pipeline';
import { resolveSettledMarkets } from '../agents/resolver';
import { snapshotMarkets } from '../agents/whale-hunter';

export function startScheduler(): void {
  const schedule = process.env.PIPELINE_SCHEDULE ?? '0 */2 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[Scheduler] Invalid cron expression: "${schedule}"`);
    return;
  }

  cron.schedule(schedule, async () => {
    console.log('[Scheduler] Triggered pipeline run');
    try {
      await runPipeline();
    } catch (err) {
      console.error('[Scheduler] Pipeline run failed:', err);
    }
  });

  // Check for settled markets every hour
  cron.schedule('15 * * * *', async () => {
    console.log('[Scheduler] Checking for settled markets...');
    try {
      await resolveSettledMarkets();
    } catch (err) {
      console.error('[Scheduler] Resolver failed:', err);
    }
  });

  // Full market snapshot every 30 min — fetches all ~2000+ open markets for complete coverage
  cron.schedule('*/30 * * * *', async () => {
    try {
      await snapshotMarkets();
    } catch (err) {
      console.error('[Scheduler] Whale snapshot failed:', err);
    }
  });

  console.log(`[Scheduler] Pipeline scheduled: "${schedule}"`);
}
