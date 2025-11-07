/**
 * DEMAND-BASED KAGGLE ORCHESTRATOR
 * ==================================
 * 
 * Smart on-demand management of Kaggle GPU sessions based on workload triggers.
 * 
 * 🎯 ON-DEMAND STRATEGY:
 * - Liga Kaggle SOMENTE quando há demanda real
 * - Triggers: ≥25 KBs OU inferência pesada
 * - Auto-shutdown após job completion
 * - Quota: 28h/semana total (não importa quantas sessões)
 * 
 * DIFFERENCE FROM TRADITIONAL APPROACH:
 * ❌ OLD: 4h/day fixed sessions (wasteful if no work)
 * ✅ NEW: ON-DEMAND sessions (efficient, work-driven)
 * 
 * FEATURES:
 * ✅ Smart trigger detection
 * ✅ Automatic start/stop
 * ✅ Quota enforcement (28h/week)
 * ✅ Session tracking
 * ✅ Graceful shutdown after job completion
 */

import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { gpuCooldownManager } from './gpu-cooldown-manager';
import { tosComplianceMonitor } from './tos-compliance-monitor';
import { kaggleAutomationService } from './kaggle-automation-service';
import { secretsVault } from './security/secrets-vault';

interface StartOptions {
  reason: string;
  estimatedDurationMinutes?: number;
  batchSize?: number;
}

interface SessionStatus {
  isActive: boolean;
  workerId?: number;
  startedAt?: Date;
  runtimeMinutes?: number;
  estimatedEndTime?: Date;
  weeklyQuotaUsed: number;
  weeklyQuotaRemaining: number;
}

export class DemandBasedKaggleOrchestrator {
  
  private activeSessionWorkerId: number | null = null;
  private sessionStartTime: Date | null = null;
  
  /**
   * Start Kaggle GPU for training workload
   */
  async startForTraining(batchSize: number): Promise<{ success: boolean; workerId?: number; error?: string }> {
    return await this.startSession({
      reason: `Training batch: ${batchSize} documents`,
      estimatedDurationMinutes: batchSize * 5, // 5min per doc estimate
      batchSize,
    });
  }
  
  /**
   * Start Kaggle GPU for heavy inference
   */
  async startForInference(inferenceType: string): Promise<{ success: boolean; workerId?: number; error?: string }> {
    return await this.startSession({
      reason: `Heavy inference: ${inferenceType}`,
      estimatedDurationMinutes: 15, // Conservative estimate
    });
  }
  
  /**
   * Start Kaggle GPU session (on-demand)
   */
  private async startSession(options: StartOptions): Promise<{ success: boolean; workerId?: number; error?: string }> {
    try {
      console.log(`[DemandBasedKaggle] 🚀 Start requested: ${options.reason}`);
      
      // 1. Check if already running
      if (this.activeSessionWorkerId) {
        console.log(`[DemandBasedKaggle] ⚠️ Session already active (worker ${this.activeSessionWorkerId})`);
        return {
          success: false,
          workerId: this.activeSessionWorkerId,
          error: 'Session already running',
        };
      }
      
      // 2. Get or create Kaggle worker
      const kaggleWorkers = await db.query.gpuWorkers.findMany({
        where: sql`provider = 'kaggle'`,
      });
      
      let worker = kaggleWorkers[0];
      
      if (!worker) {
        // Create worker if doesn't exist
        console.log('[DemandBasedKaggle] No Kaggle worker found - creating...');
        
        const [newWorker] = await db.insert(gpuWorkers).values({
          provider: 'kaggle',
          accountId: 'kaggle-main', // Single account strategy
          ngrokUrl: 'pending',
          status: 'pending',
          capabilities: {
            gpu: 'P100',
            model: 'pending',
            tor_enabled: false,
          },
          autoManaged: true,
          maxSessionDurationSeconds: 9 * 3600, // 9h max per session
          maxWeeklySeconds: 28 * 3600, // 28h/week
          weeklyUsageHours: 0,
          dailyUsageHours: 0,
        }).returning();
        
        worker = newWorker;
      }
      
      // 3. Check quota
      const cooldownStatus = await gpuCooldownManager.canStartSession(worker.id);
      
      if (!cooldownStatus.canStart) {
        console.log(`[DemandBasedKaggle] ⚠️ Cannot start: ${cooldownStatus.reason}`);
        return {
          success: false,
          error: cooldownStatus.reason,
        };
      }
      
      // 4. Check compliance
      const complianceStatus = await tosComplianceMonitor.monitorWorker(worker.id);
      
      if (!complianceStatus.isCompliant) {
        console.log(`[DemandBasedKaggle] ⚠️ Compliance check failed: ${complianceStatus.alerts[0]?.message}`);
        return {
          success: false,
          error: 'Quota limits reached',
        };
      }
      
      // 5. GET KAGGLE CREDENTIALS FROM SECRETS VAULT
      const credentials = await secretsVault.retrieveSecret('kaggle-main', 'kaggle');
      
      if (!credentials) {
        console.error('[DemandBasedKaggle] ❌ No Kaggle credentials found!');
        return {
          success: false,
          error: 'Kaggle credentials not configured - please add via Admin Panel',
        };
      }
      
      const { username, apiKey } = credentials.decrypted as { username: string; apiKey: string };
      
      // 6. GET AION BASE URL
      const aionBaseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : 'http://localhost:5000';
      
      console.log(`[DemandBasedKaggle] 📋 AION Base URL: ${aionBaseUrl}`);
      
      // 7. START KAGGLE KERNEL AUTOMATICALLY!
      console.log(`[DemandBasedKaggle] ✅ Starting Kaggle GPU session...`);
      
      const provisionResult = await kaggleAutomationService.createAndStartWorker(
        username,
        aionBaseUrl,
        worker.id
      );
      
      if (!provisionResult.success) {
        console.error(`[DemandBasedKaggle] ❌ Failed to start kernel: ${provisionResult.error}`);
        return {
          success: false,
          error: provisionResult.error || 'Failed to start Kaggle kernel',
        };
      }
      
      // 8. UPDATE WORKER STATUS (kernel created and running)
      await db
        .update(gpuWorkers)
        .set({
          status: 'pending', // Will become 'online' when worker registers
          sessionStartedAt: new Date(),
          ngrokUrl: 'pending', // Worker will update this when it registers
          updatedAt: new Date(),
        })
        .where(eq(gpuWorkers.id, worker.id));
      
      // 9. RECORD SESSION START (for quota tracking)
      await gpuCooldownManager.recordSessionStart(worker.id);
      
      this.activeSessionWorkerId = worker.id;
      this.sessionStartTime = new Date();
      
      console.log(
        `[DemandBasedKaggle] 🚀 Session started - Worker ${worker.id}\n` +
        `  Kernel: ${provisionResult.kernelId}\n` +
        `  URL: ${provisionResult.kernelUrl}\n` +
        `  Reason: ${options.reason}\n` +
        `  Estimated: ${options.estimatedDurationMinutes}min\n` +
        `  Weekly quota: ${cooldownStatus.weeklyUsageHours?.toFixed(2) || 0}h / 28h`
      );
      
      return {
        success: true,
        workerId: worker.id,
      };
      
    } catch (error: any) {
      console.error('[DemandBasedKaggle] Error starting session:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  /**
   * Stop Kaggle GPU session
   * 
   * NOTE: Kaggle kernels run until completion or timeout (9h max).
   * This method marks the session as stopped and updates quota tracking.
   * The kernel itself will auto-terminate when job completes.
   */
  async stopSession(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.activeSessionWorkerId) {
        console.log('[DemandBasedKaggle] No active session to stop');
        return { success: true };
      }
      
      const workerId = this.activeSessionWorkerId;
      const sessionStart = this.sessionStartTime!;
      const now = new Date();
      const sessionDurationSeconds = Math.floor((now.getTime() - sessionStart.getTime()) / 1000);
      const sessionDurationMinutes = sessionDurationSeconds / 60;
      
      console.log(
        `[DemandBasedKaggle] 🛑 Marking session as stopped - Worker ${workerId}\n` +
        `  Duration: ${sessionDurationMinutes.toFixed(1)}min`
      );
      
      // Update worker status
      await db
        .update(gpuWorkers)
        .set({
          status: 'offline',
          sessionStartedAt: null,
          updatedAt: now,
        })
        .where(eq(gpuWorkers.id, workerId));
      
      // Record session end (update quota)
      await gpuCooldownManager.recordSessionEnd(workerId, sessionDurationSeconds);
      
      // Clear active session
      this.activeSessionWorkerId = null;
      this.sessionStartTime = null;
      
      console.log(`[DemandBasedKaggle] ✅ Session stopped successfully (kernel will auto-terminate)`);
      
      // NOTE: Kaggle kernels auto-terminate when job completes.
      // No need to manually stop the kernel - it's designed to run until done.
      // The worker notebook code handles cleanup and shutdown automatically.
      
      return { success: true };
      
    } catch (error: any) {
      console.error('[DemandBasedKaggle] Error stopping session:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  /**
   * Auto-stop session after job completion
   * 
   * Checks if worker went offline (job completed) and cleans up state.
   * The worker self-terminates after completing its job, so we just
   * need to detect when it's gone offline and update our tracking.
   */
  async autoStopAfterJobCompletion(): Promise<void> {
    if (!this.activeSessionWorkerId) {
      return;
    }
    
    console.log('[DemandBasedKaggle] 🔍 Checking if job completed...');
    
    // Check if worker is still online
    const worker = await db.query.gpuWorkers.findFirst({
      where: eq(gpuWorkers.id, this.activeSessionWorkerId),
    });
    
    if (!worker) {
      // Worker was deleted (job failed or manually removed)
      console.log('[DemandBasedKaggle] ⚠️ Worker not found - clearing session state');
      this.activeSessionWorkerId = null;
      this.sessionStartTime = null;
      return;
    }
    
    // Check if worker went offline (job completed)
    if (worker.status === 'offline' || worker.status === 'failed') {
      const sessionStart = this.sessionStartTime!;
      const now = new Date();
      const sessionDurationSeconds = Math.floor((now.getTime() - sessionStart.getTime()) / 1000);
      const sessionDurationMinutes = sessionDurationSeconds / 60;
      
      console.log(
        `[DemandBasedKaggle] ✅ Job completed - Worker ${worker.id} offline\n` +
        `  Duration: ${sessionDurationMinutes.toFixed(1)}min\n` +
        `  Status: ${worker.status}`
      );
      
      // Update quota tracking (if not already done)
      if (worker.sessionStartedAt) {
        await gpuCooldownManager.recordSessionEnd(worker.id, sessionDurationSeconds);
        
        // Update worker to clear session
        await db
          .update(gpuWorkers)
          .set({
            sessionStartedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(gpuWorkers.id, worker.id));
      }
      
      // Clear our local state
      this.activeSessionWorkerId = null;
      this.sessionStartTime = null;
      
      console.log('[DemandBasedKaggle] 🎉 Session completed and cleaned up');
    } else {
      console.log(`[DemandBasedKaggle] ⏳ Job still running - Worker ${worker.id} status: ${worker.status}`);
    }
  }
  
  /**
   * Get current session status
   */
  async getSessionStatus(): Promise<SessionStatus> {
    if (!this.activeSessionWorkerId) {
      // No active session
      const quotaStatus = await this.getWeeklyQuotaStatus();
      
      return {
        isActive: false,
        weeklyQuotaUsed: quotaStatus.used,
        weeklyQuotaRemaining: quotaStatus.remaining,
      };
    }
    
    // Active session
    const now = new Date();
    const runtimeMinutes = (now.getTime() - this.sessionStartTime!.getTime()) / (1000 * 60);
    
    const quotaStatus = await this.getWeeklyQuotaStatus();
    
    return {
      isActive: true,
      workerId: this.activeSessionWorkerId,
      startedAt: this.sessionStartTime!,
      runtimeMinutes,
      estimatedEndTime: undefined, // ON-DEMAND = ends when job completes
      weeklyQuotaUsed: quotaStatus.used,
      weeklyQuotaRemaining: quotaStatus.remaining,
    };
  }
  
  /**
   * Get weekly quota status
   */
  private async getWeeklyQuotaStatus(): Promise<{ used: number; remaining: number }> {
    const kaggleWorkers = await db.query.gpuWorkers.findMany({
      where: sql`provider = 'kaggle'`,
    });
    
    if (kaggleWorkers.length === 0) {
      return { used: 0, remaining: 28 };
    }
    
    const totalUsed = kaggleWorkers.reduce((sum, w) => sum + (w.weeklyUsageHours || 0), 0);
    const remaining = Math.max(0, 28 - totalUsed);
    
    return { used: totalUsed, remaining };
  }
  
  /**
   * Check if can start new session (quota check)
   */
  async canStartSession(): Promise<{ canStart: boolean; reason: string }> {
    // Check if already running
    if (this.activeSessionWorkerId) {
      return {
        canStart: false,
        reason: 'Session already active',
      };
    }
    
    // Check quota
    const quotaStatus = await this.getWeeklyQuotaStatus();
    
    if (quotaStatus.remaining <= 0) {
      return {
        canStart: false,
        reason: `Weekly quota exhausted: ${quotaStatus.used.toFixed(2)}h / 28h`,
      };
    }
    
    return {
      canStart: true,
      reason: `OK - ${quotaStatus.remaining.toFixed(2)}h remaining this week`,
    };
  }
}

// Singleton instance
export const demandBasedKaggleOrchestrator = new DemandBasedKaggleOrchestrator();
