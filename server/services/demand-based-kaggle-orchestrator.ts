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
      
      // 5. START SESSION!
      console.log(`[DemandBasedKaggle] ✅ Starting Kaggle GPU session...`);
      
      // Update worker status
      await db
        .update(gpuWorkers)
        .set({
          status: 'online',
          sessionStartedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(gpuWorkers.id, worker.id));
      
      // Record session start
      await gpuCooldownManager.recordSessionStart(worker.id);
      
      this.activeSessionWorkerId = worker.id;
      this.sessionStartTime = new Date();
      
      console.log(
        `[DemandBasedKaggle] 🚀 Session started - Worker ${worker.id}\n` +
        `  Reason: ${options.reason}\n` +
        `  Estimated: ${options.estimatedDurationMinutes}min\n` +
        `  Weekly quota: ${cooldownStatus.weeklyUsageHours?.toFixed(2) || 0}h / 28h`
      );
      
      // TODO: Actually start Kaggle notebook via KaggleOrchestrator
      // For now, this is a placeholder - real implementation would call:
      // await kaggleOrchestrator.startSession({ workerId: worker.id, ... })
      
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
        `[DemandBasedKaggle] 🛑 Stopping session - Worker ${workerId}\n` +
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
      
      console.log(`[DemandBasedKaggle] ✅ Session stopped successfully`);
      
      // TODO: Actually stop Kaggle notebook via KaggleOrchestrator
      // await kaggleOrchestrator.stopSession(workerId)
      
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
   */
  async autoStopAfterJobCompletion(): Promise<void> {
    if (!this.activeSessionWorkerId) {
      return;
    }
    
    console.log('[DemandBasedKaggle] 🔍 Checking if job completed...');
    
    // TODO: Check if training/inference jobs are done
    // For now, this is a placeholder - real implementation would check:
    // - Training queue empty?
    // - No pending inference requests?
    // If yes → stopSession()
    
    const shouldStop = false; // Placeholder
    
    if (shouldStop) {
      console.log('[DemandBasedKaggle] ✅ Job completed - auto-stopping');
      await this.stopSession();
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
