/**
 * GPU IDLE SHUTDOWN SERVICE
 * =========================
 * 
 * CRITICAL FOR KAGGLE BAN AVOIDANCE!
 * 
 * Monitors gpu_sessions table and automatically shuts down Kaggle GPUs
 * after 10 minutes of inactivity (no lastActivity updates).
 * 
 * RULES (from replit.md):
 * - Kaggle: Liga quando tarefa chega → Executa → 10min idle → DESLIGA
 * - Respeita AMBAS quotas (session 8.4h E weekly 21h)
 * - Violar = BAN PERMANENTE da conta Google!
 * 
 * ARCHITECTURE:
 * - PostgreSQL-backed: monitors gpu_sessions.lastActivity column
 * - Runs every 2 minutes (checks for 10min idle threshold)
 * - Calls kaggleOrchestrator.stopSession() to cleanup gracefully
 */

import { db } from '../db';
import { gpuSessions } from '../../shared/schema';
import { eq, and, inArray, lt } from 'drizzle-orm';
import { kaggleOrchestrator } from '../gpu-orchestration/kaggle-orchestrator';
import pino from 'pino';

const logger = pino({ name: 'GpuIdleShutdownService' });

export class GpuIdleShutdownService {
  private readonly IDLE_THRESHOLD_MS = 10 * 60 * 1000; // 10min idle → shutdown (CRITICAL!)
  private readonly CHECK_INTERVAL_MS = 2 * 60 * 1000; // Check every 2min
  private intervalId?: NodeJS.Timeout;

  /**
   * Start idle timeout monitoring (runs every 2min)
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Idle shutdown service already running');
      return;
    }

    logger.info({
      idleThresholdMinutes: this.IDLE_THRESHOLD_MS / (60 * 1000),
      checkIntervalMinutes: this.CHECK_INTERVAL_MS / (60 * 1000),
    }, '🚀 Starting GPU idle shutdown monitoring (Kaggle BAN avoidance)');

    // Run immediately on start
    this.checkIdleSessions().catch(err => 
      logger.error({ error: err }, 'Error during initial idle check')
    );

    // Then run every 2 minutes
    this.intervalId = setInterval(() => {
      this.checkIdleSessions().catch(err => 
        logger.error({ error: err }, 'Error during idle check')
      );
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop idle timeout monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Idle shutdown monitoring stopped');
    }
  }

  /**
   * Check for idle sessions and shut them down
   * 
   * CRITICAL: Only applies to Kaggle (on-demand model)
   * Colab uses schedule-based activation (not idle-based)
   */
  private async checkIdleSessions(): Promise<void> {
    try {
      // Query Kaggle sessions that are active/idle and haven't had activity in 10min
      const idleThreshold = new Date(Date.now() - this.IDLE_THRESHOLD_MS);
      
      const idleSessions = await db.query.gpuSessions.findMany({
        where: and(
          eq(gpuSessions.provider, 'kaggle'),
          inArray(gpuSessions.status, ['active', 'idle']),
          lt(gpuSessions.lastActivity, idleThreshold)
        ),
      });

      if (idleSessions.length === 0) {
        logger.debug('No idle Kaggle sessions found');
        return;
      }

      logger.info({
        idleCount: idleSessions.length,
        sessions: idleSessions.map(s => ({
          id: s.id,
          workerId: s.workerId,
          lastActivity: s.lastActivity,
          idleMinutes: Math.floor((Date.now() - new Date(s.lastActivity).getTime()) / (60 * 1000)),
        })),
      }, '⚠️ Found idle Kaggle sessions - shutting down to avoid quota waste');

      // Shutdown each idle session
      for (const session of idleSessions) {
        try {
          const idleMinutes = Math.floor(
            (Date.now() - new Date(session.lastActivity).getTime()) / (60 * 1000)
          );

          logger.info({
            sessionId: session.id,
            workerId: session.workerId,
            idleMinutes,
          }, '🔌 Shutting down idle Kaggle session');

          const result = await kaggleOrchestrator.stopSession(session.workerId);

          if (result.success) {
            logger.info({
              sessionId: session.id,
              workerId: session.workerId,
              idleMinutes,
            }, '✅ Idle session shutdown successful');
          } else {
            logger.error({
              sessionId: session.id,
              workerId: session.workerId,
              error: result.error,
            }, '❌ Failed to shutdown idle session');
          }

        } catch (error) {
          logger.error({
            sessionId: session.id,
            workerId: session.workerId,
            error,
          }, '❌ Error shutting down idle session');
        }
      }

    } catch (error) {
      logger.error({ error }, 'Error checking idle sessions');
    }
  }
}

// Singleton instance
export const gpuIdleShutdownService = new GpuIdleShutdownService();
