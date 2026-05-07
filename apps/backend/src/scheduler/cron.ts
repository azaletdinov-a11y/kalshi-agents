import cron from 'node-cron';
import { runPipeline } from '../agents/pipeline';

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

  console.log(`[Scheduler] Pipeline scheduled: "${schedule}"`);
}
