/**
 * Resolution scheduler — the autonomous heartbeat of the pipeline.
 * Every minute it auto-finalizes lines whose dispute window has closed and
 * refunds influencers who no-showed their final proof. Idempotent and safe to
 * run alongside manual resolution via POST /:id/resolve.
 */
import cron from 'node-cron';
import { sweepResolutions } from './resolve';

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  cron.schedule('* * * * *', async () => {
    try {
      const { finalized, refunded } = await sweepResolutions();
      if (finalized || refunded) {
        console.log(`[scheduler] auto-finalized ${finalized}, refunded ${refunded} no-shows`);
      }
    } catch (err) {
      console.warn('[scheduler] sweep failed:', err);
    }
  });

  console.log('⏱️  Resolution scheduler started (sweeps every 1m)');
}
