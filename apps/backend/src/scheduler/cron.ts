import cron from 'node-cron';
import { runPipeline } from '../agents/pipeline';
import { resolveSettledMarkets } from '../agents/resolver';

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

  console.log(`[Scheduler] Pipeline scheduled: "${schedule}"`);
}
