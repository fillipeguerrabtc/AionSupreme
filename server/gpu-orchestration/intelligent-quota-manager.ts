/**
 * INTELLIGENT QUOTA MANAGER
 * =========================
 * 
 * Orquestra GPUs FREE (Colab/Kaggle) com maestria, respeitando quotas diferentes:
 * 
 * COLAB FREE:
 * - Runtime: 12h max → Stop at 11h (1h safety margin)
 * - Idle timeout: 90min
 * - No weekly quota
 * 
 * KAGGLE FREE:
 * - GPU Runtime: 12h max → Stop at 11h (1h safety margin)
 * - CPU Runtime: 9h max → Stop at 8h (1h safety margin)
 * - Weekly quota: 30h GPU → Track usage carefully
 * - Concurrent: 1 notebook only
 * 
 * ORCHESTRATION STRATEGY:
 * 1. Prefer Colab (no weekly limit) when available
 * 2. Use Kaggle when Colab exhausted
 * 3. Rotate GPUs before hitting limits
 * 4. Track weekly Kaggle quota (reset every Monday 00:00 UTC)
 * 5. Never exceed quotas - auto-stop with safety margins
 */

import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq, and, lt, gte, sql } from 'drizzle-orm';

interface QuotaStatus {
  provider: 'colab' | 'kaggle';
  workerId: number;
  sessionRuntimeSeconds: number;
  maxSessionSeconds: number;
  remainingSessionSeconds: number;
  weeklyUsedSeconds?: number;
  weeklyRemainingSeconds?: number;
  utilizationPercent: number;
  canStart: boolean;
  shouldStop: boolean;
  reason?: string;
}

interface GPUSelectionResult {
  gpu: QuotaStatus | null;
  reason: string;
  alternativesAvailable: boolean;
}

export class IntelligentQuotaManager {
  
  // Quota constants (in seconds)
  private readonly COLAB_MAX_SESSION = 12 * 3600;  // 12h
  private readonly COLAB_SAFETY = 11 * 3600;       // 11h (1h margin)
  
  private readonly KAGGLE_GPU_MAX_SESSION = 12 * 3600;  // 12h
  private readonly KAGGLE_GPU_SAFETY = 11 * 3600;       // 11h (1h margin)
  private readonly KAGGLE_CPU_MAX_SESSION = 9 * 3600;   // 9h
  private readonly KAGGLE_CPU_SAFETY = 8 * 3600;        // 8h (1h margin)
  
  private readonly KAGGLE_WEEKLY_QUOTA = 30 * 3600;     // 30h
  
  /**
   * Get current quota status for a specific GPU worker
   */
  async getQuotaStatus(workerId: number): Promise<QuotaStatus | null> {
    const worker = await db.query.gpuWorkers.findFirst({
      where: eq(gpuWorkers.id, workerId),
    });
    
    if (!worker) return null;
    
    const now = new Date();
    const sessionRuntime = worker.sessionStartedAt
      ? Math.floor((now.getTime() - worker.sessionStartedAt.getTime()) / 1000)
      : 0;
    
    const maxSessionSeconds = worker.maxSessionDurationSeconds || this.getDefaultMaxSession(worker.provider as 'colab' | 'kaggle', worker.capabilities);
    const remainingSession = Math.max(0, maxSessionSeconds - sessionRuntime);
    
    // Weekly quota (Kaggle only)
    let weeklyUsed = 0;
    let weeklyRemaining = undefined;
    
    if (worker.provider === 'kaggle' && worker.maxWeeklySeconds) {
      weeklyUsed = await this.getWeeklyUsage(workerId);
      weeklyRemaining = Math.max(0, worker.maxWeeklySeconds - weeklyUsed);
    }
    
    const utilization = (sessionRuntime / maxSessionSeconds) * 100;
    
    // Decision: should stop?
    const shouldStop = 
      sessionRuntime >= maxSessionSeconds ||  // Reached safety limit
      (worker.provider === 'kaggle' && weeklyRemaining !== undefined && weeklyRemaining <= 0);  // Weekly quota exhausted
    
    // Decision: can start?
    const canStart = 
      !shouldStop &&
      sessionRuntime === 0 &&  // Not already running
      (worker.provider === 'colab' || (weeklyRemaining !== undefined && weeklyRemaining > 3600));  // At least 1h remaining for Kaggle
    
    return {
      provider: worker.provider as 'colab' | 'kaggle',
      workerId: worker.id,
      sessionRuntimeSeconds: sessionRuntime,
      maxSessionSeconds,
      remainingSessionSeconds: remainingSession,
      weeklyUsedSeconds: worker.provider === 'kaggle' ? weeklyUsed : undefined,
      weeklyRemainingSeconds: weeklyRemaining,
      utilizationPercent: utilization,
      canStart,
      shouldStop,
      reason: shouldStop 
        ? (sessionRuntime >= maxSessionSeconds ? 'Session limit reached' : 'Weekly quota exhausted')
        : undefined,
    };
  }
  
  /**
   * Get all quota statuses for active workers
   */
  async getAllQuotaStatuses(): Promise<QuotaStatus[]> {
    const workers = await db.query.gpuWorkers.findMany({
      where: eq(gpuWorkers.autoManaged, true),
    });
    
    const statuses = await Promise.all(
      workers.map(w => this.getQuotaStatus(w.id))
    );
    
    return statuses.filter(s => s !== null) as QuotaStatus[];
  }
  
  /**
   * INTELLIGENT GPU SELECTION
   * Returns the BEST GPU to start based on quota availability
   * 
   * Strategy:
   * 1. Prefer Colab (no weekly limit)
   * 2. Fallback to Kaggle if Colab unavailable
   * 3. Never select GPU that violates quotas
   */
  async selectBestGPU(): Promise<GPUSelectionResult> {
    const statuses = await this.getAllQuotaStatuses();
    
    // Filter: only GPUs that can start
    const availableGPUs = statuses.filter(s => s.canStart);
    
    if (availableGPUs.length === 0) {
      return {
        gpu: null,
        reason: 'No GPUs available - all quotas exhausted or running',
        alternativesAvailable: false,
      };
    }
    
    // Strategy 1: Prefer Colab (unlimited weekly usage)
    const colabGPUs = availableGPUs.filter(s => s.provider === 'colab');
    if (colabGPUs.length > 0) {
      // Pick Colab with most remaining time
      const bestColab = colabGPUs.reduce((best, current) => 
        current.remainingSessionSeconds > best.remainingSessionSeconds ? current : best
      );
      
      return {
        gpu: bestColab,
        reason: 'Selected Colab (preferred - no weekly quota)',
        alternativesAvailable: colabGPUs.length > 1 || availableGPUs.length > colabGPUs.length,
      };
    }
    
    // Strategy 2: Fallback to Kaggle (but check weekly quota)
    const kaggleGPUs = availableGPUs.filter(s => s.provider === 'kaggle');
    if (kaggleGPUs.length > 0) {
      // Pick Kaggle with most weekly quota remaining
      const bestKaggle = kaggleGPUs.reduce((best, current) => {
        const bestRemaining = best.weeklyRemainingSeconds || 0;
        const currentRemaining = current.weeklyRemainingSeconds || 0;
        return currentRemaining > bestRemaining ? current : best;
      });
      
      if ((bestKaggle.weeklyRemainingSeconds || 0) < 3600) {
        return {
          gpu: null,
          reason: 'Kaggle weekly quota nearly exhausted (<1h remaining)',
          alternativesAvailable: false,
        };
      }
      
      return {
        gpu: bestKaggle,
        reason: `Selected Kaggle (${Math.floor((bestKaggle.weeklyRemainingSeconds || 0) / 3600)}h weekly quota remaining)`,
        alternativesAvailable: kaggleGPUs.length > 1,
      };
    }
    
    return {
      gpu: null,
      reason: 'No suitable GPU found',
      alternativesAvailable: false,
    };
  }
  
  /**
   * Check if any GPU needs to be stopped (reached safety limit)
   */
  async getGPUsToStop(): Promise<QuotaStatus[]> {
    const statuses = await this.getAllQuotaStatuses();
    return statuses.filter(s => s.shouldStop);
  }
  
  /**
   * Update session runtime for a worker
   */
  async updateSessionRuntime(workerId: number): Promise<void> {
    const worker = await db.query.gpuWorkers.findFirst({
      where: eq(gpuWorkers.id, workerId),
    });
    
    if (!worker || !worker.sessionStartedAt) return;
    
    const now = new Date();
    const runtimeSeconds = Math.floor((now.getTime() - worker.sessionStartedAt.getTime()) / 1000);
    
    await db.update(gpuWorkers)
      .set({
        sessionDurationSeconds: runtimeSeconds,
        updatedAt: now,
      })
      .where(eq(gpuWorkers.id, workerId));
    
    // Update weekly usage for Kaggle
    if (worker.provider === 'kaggle') {
      await this.updateWeeklyUsage(workerId, runtimeSeconds);
    }
  }
  
  /**
   * Get weekly usage for Kaggle worker (resets every Monday 00:00 UTC)
   */
  private async getWeeklyUsage(workerId: number): Promise<number> {
    const worker = await db.query.gpuWorkers.findFirst({
      where: eq(gpuWorkers.id, workerId),
    });
    
    if (!worker) return 0;
    
    const now = new Date();
    const weekStart = this.getWeekStart(now);
    
    // Check if week has reset
    if (worker.weekStartedAt && worker.weekStartedAt < weekStart) {
      // New week - reset counter
      await db.update(gpuWorkers)
        .set({
          weeklyUsageSeconds: 0,
          weekStartedAt: weekStart,
        })
        .where(eq(gpuWorkers.id, workerId));
      
      return 0;
    }
    
    return worker.weeklyUsageSeconds;
  }
  
  /**
   * Update weekly usage counter
   */
  private async updateWeeklyUsage(workerId: number, sessionSeconds: number): Promise<void> {
    const currentUsage = await this.getWeeklyUsage(workerId);
    
    await db.update(gpuWorkers)
      .set({
        weeklyUsageSeconds: currentUsage + sessionSeconds,
      })
      .where(eq(gpuWorkers.id, workerId));
  }
  
  /**
   * Get start of current week (Monday 00:00 UTC)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    
    const day = d.getUTCDay();
    const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday = 1
    
    d.setUTCDate(diff);
    return d;
  }
  
  /**
   * Get default max session duration based on provider
   */
  private getDefaultMaxSession(provider: 'colab' | 'kaggle', capabilities: any): number {
    if (provider === 'colab') {
      return this.COLAB_SAFETY;  // 11h
    }
    
    // Kaggle: check if GPU or CPU
    const isGPU = capabilities?.gpu && capabilities.gpu !== 'CPU';
    return isGPU ? this.KAGGLE_GPU_SAFETY : this.KAGGLE_CPU_SAFETY;
  }
  
  /**
   * Start session tracking for a worker
   */
  async startSession(workerId: number): Promise<void> {
    const now = new Date();
    const worker = await db.query.gpuWorkers.findFirst({
      where: eq(gpuWorkers.id, workerId),
    });
    
    if (!worker) throw new Error(`Worker ${workerId} not found`);
    
    const maxSessionSeconds = this.getDefaultMaxSession(
      worker.provider as 'colab' | 'kaggle',
      worker.capabilities
    );
    
    await db.update(gpuWorkers)
      .set({
        sessionStartedAt: now,
        sessionDurationSeconds: 0,
        maxSessionDurationSeconds: maxSessionSeconds,
        scheduledStopAt: new Date(now.getTime() + maxSessionSeconds * 1000),
        status: 'healthy',
        weekStartedAt: worker.provider === 'kaggle' ? this.getWeekStart(now) : undefined,
      })
      .where(eq(gpuWorkers.id, workerId));
  }
  
  /**
   * Stop session and update final stats
   */
  async stopSession(workerId: number): Promise<void> {
    await this.updateSessionRuntime(workerId);
    
    await db.update(gpuWorkers)
      .set({
        sessionStartedAt: null,
        scheduledStopAt: null,
        status: 'offline',
      })
      .where(eq(gpuWorkers.id, workerId));
  }
}

// Singleton instance
export const quotaManager = new IntelligentQuotaManager();
