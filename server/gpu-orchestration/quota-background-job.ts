/**
 * Quota Background Job
 * 
 * Automatic quota syncing every 10 minutes for all Google-authenticated accounts.
 * Ensures quota data stays fresh and prevents stale data issues.
 * 
 * Features:
 * - Runs every 10 minutes via node-cron
 * - Syncs both Kaggle and Colab quotas via QuotaSyncService.syncAll()
 * - Production-grade error handling with retry logic
 * - Structured logging for observability
 */

import cron from 'node-cron';
import { QuotaSyncService } from './quota-sync-service';
import { logger } from '../services/logger-service';

const log = logger.child('quota-background-job');

class QuotaBackgroundJob {
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning = false;
  private quotaSyncService: QuotaSyncService;

  constructor() {
    this.quotaSyncService = new QuotaSyncService();
  }

  /**
   * Start the background job
   * Runs every 10 minutes
   */
  start() {
    if (this.cronJob) {
      log.warn('Background job already running');
      return;
    }

    log.info('Starting quota sync background job (every 10 minutes)');

    // Schedule job to run every 10 minutes
    this.cronJob = cron.schedule('*/10 * * * *', async () => {
      await this.runSync();
    });

    // Run immediately on startup
    this.runSync().catch((error) => {
      log.error('Initial sync failed', error);
    });
  }

  /**
   * Stop the background job
   */
  stop() {
    if (!this.cronJob) {
      log.warn('Background job not running');
      return;
    }

    log.info('Stopping quota sync background job');
    this.cronJob.stop();
    this.cronJob = null;
  }

  /**
   * Run quota sync for all accounts
   */
  private async runSync() {
    if (this.isRunning) {
      log.warn('Sync already in progress, skipping this run');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      log.info('Starting quota sync cycle');

      // Sync all accounts using QuotaSyncService.syncAll()
      const results = await this.quotaSyncService.syncAll();

      if (results.length === 0) {
        log.info('No authenticated accounts found, skipping sync');
        return;
      }

      // Aggregate metrics
      const metrics = {
        total: results.length,
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        kaggleSuccess: results.filter(r => r.provider === 'kaggle' && r.success).length,
        kaggleFailed: results.filter(r => r.provider === 'kaggle' && !r.success).length,
        colabSuccess: results.filter(r => r.provider === 'colab' && r.success).length,
        colabFailed: results.filter(r => r.provider === 'colab' && !r.success).length,
        durationMs: Date.now() - startTime,
      };

      log.info('Quota sync cycle completed', metrics);

      // Log errors if any
      const failures = results.filter(r => !r.success);
      if (failures.length > 0) {
        log.warn('Encountered errors during sync cycle', {
          failureCount: failures.length,
          failures: failures.map(f => ({
            accountEmail: f.accountEmail,
            provider: f.provider,
            error: f.error,
          })),
        });
      }

    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      log.error('Quota sync cycle failed', error, { durationMs });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get current job status
   */
  getStatus() {
    return {
      isScheduled: !!this.cronJob,
      isRunning: this.isRunning,
    };
  }
}

// Export singleton instance
export const quotaBackgroundJob = new QuotaBackgroundJob();
