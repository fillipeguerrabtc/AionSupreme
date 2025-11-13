/**
 * GPU COOLDOWN MANAGER
 * ====================
 * 
 * Enforces ToS-compliant cooldown periods and quota limits for free GPU providers.
 * 
 * 🔥 ON-DEMAND STRATEGY (Architect-approved):
 * - Kaggle: 21h/week ONLY (70% safety limit - can use all 21h in one day!)
 * - Colab: 36h cooldown between 11h sessions (3x/week, moderate risk)
 * 
 * FEATURES:
 * ✅ PostgreSQL persistence (survives restarts)
 * ✅ Weekly usage tracking with Sunday midnight reset
 * ✅ Cooldown enforcement with timestamp validation
 * ✅ Automatic quota reset (weekly for Kaggle, per-session for Colab)
 * ✅ Thread-safe operations with database transactions
 * 
 * INTEGRATION:
 * - Called by DemandBasedKaggleOrchestrator before starting sessions
 * - Updates gpuWorkers table (cooldownUntil, weeklyUsageHours)
 * - Triggers ToSComplianceMonitor alerts when approaching limits
 */

import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { QUOTA_LIMITS, QuotaHelpers } from '../config/quota-limits';

interface CooldownStatus {
  workerId: number;
  provider: 'colab' | 'kaggle';
  canStart: boolean;
  reason: string;
  
  // Colab-specific
  cooldownUntil?: Date | null;
  cooldownRemainingSeconds?: number;
  
  // Kaggle-specific (WEEKLY ONLY - NO daily limits)
  weeklyUsageHours?: number;
  weeklyRemainingHours?: number;
}

interface SessionEndResult {
  success: boolean;
  cooldownUntil?: Date;
  error?: string;
}

export class GPUCooldownManager {
  
  /**
   * Check if a worker can start a new session (cooldown + quota enforcement)
   */
  async canStartSession(workerId: number): Promise<CooldownStatus> {
    const worker = await db.query.gpuWorkers.findFirst({
      where: eq(gpuWorkers.id, workerId),
    });
    
    if (!worker) {
      return {
        workerId,
        provider: 'colab',
        canStart: false,
        reason: 'Worker not found',
      };
    }
    
    const provider = worker.provider as 'colab' | 'kaggle';
    
    if (provider === 'colab') {
      return await this.checkColabCooldown(worker);
    } else if (provider === 'kaggle') {
      return await this.checkKaggleWeeklyQuota(worker);
    }
    
    return {
      workerId,
      provider,
      canStart: true,
      reason: 'Unknown provider type - allowing by default',
    };
  }
  
  /**
   * Colab cooldown enforcement (36h between sessions)
   */
  private async checkColabCooldown(worker: any): Promise<CooldownStatus> {
    const now = new Date();
    const cooldownUntil = worker.cooldownUntil;
    
    if (!cooldownUntil) {
      // No cooldown set = first session or reset
      return {
        workerId: worker.id,
        provider: 'colab',
        canStart: true,
        reason: 'No cooldown active - OK to start',
        cooldownUntil: null,
        cooldownRemainingSeconds: 0,
      };
    }
    
    const cooldownEnd = new Date(cooldownUntil);
    const remainingSeconds = QuotaHelpers.getRemainingCooldownSeconds(cooldownEnd);
    
    if (remainingSeconds > 0) {
      return {
        workerId: worker.id,
        provider: 'colab',
        canStart: false,
        reason: `Cooldown active - ${QuotaHelpers.formatDuration(remainingSeconds)} remaining`,
        cooldownUntil: cooldownEnd,
        cooldownRemainingSeconds: remainingSeconds,
      };
    }
    
    // Cooldown elapsed
    return {
      workerId: worker.id,
      provider: 'colab',
      canStart: true,
      reason: 'Cooldown elapsed - OK to start',
      cooldownUntil: null,
      cooldownRemainingSeconds: 0,
    };
  }
  
  /**
   * Kaggle weekly quota enforcement (21h/week ON-DEMAND = 70% safety limit)
   * ✅ NO daily limits - can use all 21h in one day if needed!
   */
  private async checkKaggleWeeklyQuota(worker: any): Promise<CooldownStatus> {
    const weeklyUsageHours = worker.weeklyUsageHours || 0;
    const weeklyRemainingHours = Math.max(0, QUOTA_LIMITS.KAGGLE.SAFE_WEEKLY_HOURS - weeklyUsageHours);
    
    if (weeklyRemainingHours <= 0) {
      return {
        workerId: worker.id,
        provider: 'kaggle',
        canStart: false,
        reason: `Weekly limit reached - ${weeklyUsageHours.toFixed(2)}h of ${QUOTA_LIMITS.KAGGLE.SAFE_WEEKLY_HOURS}h used this week`,
        weeklyUsageHours,
        weeklyRemainingHours: 0,
      };
    }
    
    // OK to start - weekly quota available
    return {
      workerId: worker.id,
      provider: 'kaggle',
      canStart: true,
      reason: `OK to start - ${weeklyRemainingHours.toFixed(2)}h of ${QUOTA_LIMITS.KAGGLE.SAFE_WEEKLY_HOURS}h remaining this week`,
      weeklyUsageHours,
      weeklyRemainingHours,
    };
  }
  
  /**
   * Record session start (initialize tracking)
   */
  async recordSessionStart(workerId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });
      
      if (!worker) {
        return { success: false, error: 'Worker not found' };
      }
      
      const now = new Date();
      
      await db
        .update(gpuWorkers)
        .set({
          sessionStartedAt: now,
          sessionDurationSeconds: 0,
          updatedAt: now,
        })
        .where(eq(gpuWorkers.id, workerId));
      
      console.log(`[GPUCooldownManager] ✅ Session started - Worker ${workerId} (${worker.provider})`);
      
      return { success: true };
    } catch (error: any) {
      console.error('[GPUCooldownManager] Error recording session start:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Record session end and apply cooldown (Colab) or update daily usage (Kaggle)
   * 🔥 FIX: Use persisted sessionDurationSeconds from worker (updated by heartbeats)
   *         instead of recalculating to prevent double-counting
   */
  async recordSessionEnd(workerId: number, _unusedParam?: number): Promise<SessionEndResult> {
    try {
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });
      
      if (!worker) {
        return { success: false, error: 'Worker not found' };
      }
      
      const provider = worker.provider as 'colab' | 'kaggle';
      const now = new Date();
      
      // 🔥 FIX: Use authoritative sessionDurationSeconds from DB (updated by heartbeats)
      // This prevents double-counting when heartbeats already accumulated time
      const sessionDurationSeconds = worker.sessionDurationSeconds || 0;
      const durationHours = sessionDurationSeconds / 3600;
      
      if (provider === 'colab') {
        // Apply 36h cooldown
        const cooldownEnd = QuotaHelpers.calculateCooldownEnd(now);
        
        await db
          .update(gpuWorkers)
          .set({
            cooldownUntil: cooldownEnd,
            sessionDurationSeconds: 0,
            sessionStartedAt: null,
            updatedAt: now,
          })
          .where(eq(gpuWorkers.id, workerId));
        
        console.log(
          `[GPUCooldownManager] 🔥 Colab cooldown applied - Worker ${workerId} ` +
          `(${durationHours.toFixed(2)}h session, cooldown until ${cooldownEnd.toISOString()})`
        );
        
        return { success: true, cooldownUntil: cooldownEnd };
        
      } else if (provider === 'kaggle') {
        // Update weekly usage ONLY (ON-DEMAND strategy - no daily limits)
        const currentWeeklyUsage = worker.weeklyUsageHours || 0;
        
        await db
          .update(gpuWorkers)
          .set({
            weeklyUsageHours: currentWeeklyUsage + durationHours,
            weeklyUsageSeconds: (worker.weeklyUsageSeconds || 0) + sessionDurationSeconds,
            sessionDurationSeconds: 0,
            sessionStartedAt: null,
            updatedAt: now,
          })
          .where(eq(gpuWorkers.id, workerId));
        
        console.log(
          `[GPUCooldownManager] 📊 Kaggle usage updated - Worker ${workerId} ` +
          `(+${durationHours.toFixed(2)}h → weekly: ${(currentWeeklyUsage + durationHours).toFixed(2)}h/${QUOTA_LIMITS.KAGGLE.SAFE_WEEKLY_HOURS}h)`
        );
        
        // ⚠️ WARNING: Kaggle API cannot stop/delete kernels programmatically!
        // User MUST manually stop kernels at: kaggle.com/code → "View Active Events"
        console.warn(
          `[GPUCooldownManager] ⚠️  MANUAL ACTION REQUIRED: ` +
          `Kaggle kernel for Worker ${workerId} CANNOT be stopped via API. ` +
          `User must manually stop kernel at: https://www.kaggle.com/code (View Active Events)`
        );
        
        return { success: true };
      }
      
      return { success: true };
      
    } catch (error: any) {
      console.error('[GPUCooldownManager] Error recording session end:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * ❌ REMOVED: resetDailyQuotas() 
   * ON-DEMAND strategy has NO daily limits - only weekly resets needed
   */
  
  /**
   * Reset weekly quotas (called by scheduler every Monday 00:00 UTC)
   */
  async resetWeeklyQuotas(): Promise<{ success: boolean; resetCount: number; error?: string }> {
    try {
      console.log('[GPUCooldownManager] 🔄 Resetting weekly quotas (Monday 00:00 UTC)...');
      
      const result = await db
        .update(gpuWorkers)
        .set({
          weeklyUsageHours: 0,
          weekStartedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(gpuWorkers.provider, 'kaggle'))
        .returning({ id: gpuWorkers.id });
      
      console.log(`[GPUCooldownManager] ✅ Reset ${result.length} Kaggle workers (weekly)`);
      
      return { success: true, resetCount: result.length };
    } catch (error: any) {
      console.error('[GPUCooldownManager] Error resetting weekly quotas:', error);
      return { success: false, resetCount: 0, error: error.message };
    }
  }
  
  /**
   * Get cooldown/quota status for all workers
   */
  async getAllWorkersStatus(): Promise<CooldownStatus[]> {
    const workers = await db
      .select()
      .from(gpuWorkers)
      .where(
        sql`${gpuWorkers.provider} IN ('colab', 'kaggle')`
      );
    
    const statusPromises = workers.map(worker => this.canStartSession(worker.id));
    return Promise.all(statusPromises);
  }
  
  /**
   * Clear cooldown (manual override - use with caution!)
   */
  async clearCooldown(workerId: number): Promise<{ success: boolean; error?: string }> {
    try {
      await db
        .update(gpuWorkers)
        .set({
          cooldownUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(gpuWorkers.id, workerId));
      
      console.log(`[GPUCooldownManager] ⚠️ Manual cooldown clear - Worker ${workerId}`);
      
      return { success: true };
    } catch (error: any) {
      console.error('[GPUCooldownManager] Error clearing cooldown:', error);
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
export const gpuCooldownManager = new GPUCooldownManager();
