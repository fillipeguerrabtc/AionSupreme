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
 * - Quota: 21h/semana (70% de 30h para segurança anti-ban)
 * 
 * DIFFERENCE FROM TRADITIONAL APPROACH:
 * ❌ OLD: 4h/day fixed sessions (wasteful if no work)
 * ✅ NEW: ON-DEMAND sessions (efficient, work-driven)
 * 
 * FEATURES:
 * ✅ Smart trigger detection
 * ✅ Automatic start/stop
 * ✅ Quota enforcement (21h/week = 70% safety limit)
 * ✅ Session tracking
 * ✅ Graceful shutdown after job completion
 */

import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq, sql, and, lt } from 'drizzle-orm';
import { gpuCooldownManager } from './gpu-cooldown-manager';
import { tosComplianceMonitor } from './tos-compliance-monitor';
import { kaggleAutomationService } from './kaggle-automation-service';
import { nanoid } from 'nanoid'; // ✅ FIX P0-1: For session tokens
import { QUOTA_LIMITS } from '../config/quota-limits';

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
   * ✅ FIXED P0-1: Two-phase startup with session token (prevents race conditions)
   * 
   * STRATEGY:
   * PHASE 1 (Transaction): Reserve worker atomically with unique session token
   * PHASE 2 (External): Call Kaggle API (long-running, outside transaction)
   * PHASE 3 (Transaction): Verify token + promote to 'pending' status
   * 
   * This guarantees only ONE session can be starting at any time, without holding
   * database locks during the external Kaggle API call.
   */
  private async startSession(options: StartOptions): Promise<{ success: boolean; workerId?: number; error?: string }> {
    try {
      console.log(`[DemandBasedKaggle] 🚀 Start requested: ${options.reason}`);
      
      // ✅ BLOCKER #3 FIX: COLAB-FIRST POLICY
      // Verifica se já há algum worker online (especialmente Colab free)
      // Se houver, NÃO ativa Kaggle (economiza quota on-demand de 21h/week)
      const { GPUPool } = await import('../gpu/pool');
      const onlineWorkers = await GPUPool.getOnlineWorkers();
      
      if (onlineWorkers.length > 0) {
        const colabWorkers = onlineWorkers.filter(w => w.provider === 'colab');
        const otherWorkers = onlineWorkers.filter(w => w.provider !== 'colab' && w.provider !== 'kaggle');
        
        console.log(`[DemandBasedKaggle] ✅ Workers já online: ${onlineWorkers.length}`);
        console.log(`   • Colab: ${colabWorkers.length}`);
        console.log(`   • Outros: ${otherWorkers.length}`);
        console.log(`   → Não ativando Kaggle (economizando quota on-demand)`);
        
        return {
          success: false,
          error: `Worker já disponível (${onlineWorkers[0].provider}) - Kaggle não necessário`,
        };
      }
      
      console.log(`[DemandBasedKaggle] 📊 Nenhum worker online - prosseguindo com ativação Kaggle`);
      
      // ============================================================================
      // PHASE 1: ATOMICALLY RESERVE WORKER (SHORT TRANSACTION)
      // ============================================================================
      const reservationResult = await db.transaction(async (tx) => {
        // 1. Lock Kaggle worker row FOR UPDATE (prevents concurrent reservations)
        const kaggleWorkers = await tx
          .select()
          .from(gpuWorkers)
          .where(sql`provider = 'kaggle'`)
          .for('update');
        
        let worker = kaggleWorkers[0];
        
        // ✅ 2. NO WORKER CREATION - AutoDiscovery is responsible for that
        // If no worker exists, return error suggesting AutoDiscovery setup
        if (!worker) {
          console.error('[DemandBasedKaggle] ❌ No Kaggle worker found in database!');
          console.error('[DemandBasedKaggle] 💡 Add KAGGLE_USERNAME_1/KAGGLE_KEY_1 to Replit Secrets');
          console.error('[DemandBasedKaggle] 💡 AutoDiscovery will auto-create workers on next startup');
          throw new Error('No Kaggle workers configured. Add credentials to Replit Secrets and restart.');
        }
        
        // 3. Check if already reserved or active
        const now = new Date();
        const activeStatuses = ['online', 'pending', 'starting'];
        
        if (activeStatuses.includes(worker.status)) {
          // Check if reservation expired (5min TTL)
          if (worker.reservationExpiresAt && worker.reservationExpiresAt > now) {
            throw new Error(`Session already active or starting (status: ${worker.status})`);
          }
          
          // Reservation expired - clean it up
          console.log(`[DemandBasedKaggle] Expired reservation found - cleaning up`);
        }
        
        // 4. Create unique session token and reserve
        const sessionToken = nanoid(32);
        const reservationExpiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5min TTL
        
        await tx
          .update(gpuWorkers)
          .set({
            status: 'starting', // ✅ Reserve status
            sessionToken,
            startRequestedAt: now,
            reservationExpiresAt,
            updatedAt: now,
          })
          .where(eq(gpuWorkers.id, worker.id));
        
        console.log(
          `[DemandBasedKaggle] ✅ Worker reserved - ID ${worker.id}, token ${sessionToken.substring(0, 8)}...`
        );
        
        return { workerId: worker.id, sessionToken };
      });
      
      const { workerId, sessionToken } = reservationResult;
      
      // ============================================================================
      // PHASE 2: QUOTA CHECKS + KAGGLE API CALL (OUTSIDE TRANSACTION)
      // ============================================================================
      
      // 3. Check quota (if fails, release reservation)
      const cooldownStatus = await gpuCooldownManager.canStartSession(workerId);
      
      if (!cooldownStatus.canStart) {
        console.log(`[DemandBasedKaggle] ⚠️ Cannot start: ${cooldownStatus.reason}`);
        
        // Release reservation
        await this.releaseReservation(workerId, sessionToken);
        
        return {
          success: false,
          error: cooldownStatus.reason,
        };
      }
      
      // 4. Check compliance
      const complianceStatus = await tosComplianceMonitor.monitorWorker(workerId);
      
      if (!complianceStatus.isCompliant) {
        console.log(`[DemandBasedKaggle] ⚠️ Compliance check failed`);
        
        // Release reservation
        await this.releaseReservation(workerId, sessionToken);
        
        return {
          success: false,
          error: 'Quota limits reached',
        };
      }
      
      // ✅ 5. Get Kaggle credentials from Replit Secrets (per-worker via accountId)
      let username: string | undefined;
      let apiKey: string | undefined;
      
      // Extract index from worker's accountId (e.g., "kaggle-2" → "2")
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });
      
      if (!worker) {
        console.error('[DemandBasedKaggle] ❌ Worker not found!');
        await this.releaseReservation(workerId, sessionToken);
        return { success: false, error: 'Worker not found' };
      }
      
      // ✅ Parse accountId to get credentials index (KAGGLE_1 → '1')
      const accountId = worker.accountId || 'KAGGLE_1';
      const index = accountId.split('_')[1] || '1';
      
      username = process.env[`KAGGLE_USERNAME_${index}`];
      apiKey = process.env[`KAGGLE_KEY_${index}`];
      
      // Fallback to legacy env vars (KAGGLE_USERNAME, KAGGLE_KEY) only if index=1 missing
      if (!username && index === '1') {
        username = process.env.KAGGLE_USERNAME;
        apiKey = process.env.KAGGLE_KEY;
        console.log('[DemandBasedKaggle] ⚠️ Using legacy KAGGLE_USERNAME/KAGGLE_KEY (add KAGGLE_USERNAME_1)');
      }
      
      if (username && apiKey) {
        console.log(`[DemandBasedKaggle] ✅ Using credentials from Replit Secrets (accountId: ${accountId})`);
      }
      
      if (!username || !apiKey) {
        console.error(`[DemandBasedKaggle] ❌ No Kaggle credentials found for ${accountId}!`);
        console.error(`[DemandBasedKaggle]    Add KAGGLE_USERNAME_${index} and KAGGLE_KEY_${index} to Replit Secrets`);
        
        // Release reservation
        await this.releaseReservation(workerId, sessionToken);
        
        return {
          success: false,
          error: 'Kaggle credentials not configured - please add via Admin Panel or environment variables',
        };
      }
      
      // 6. Get AION base URL
      const aionBaseUrl = process.env.REPL_SLUG 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : 'http://localhost:5000';
      
      console.log(`[DemandBasedKaggle] 📋 AION Base URL: ${aionBaseUrl}`);
      
      // 7. START KAGGLE KERNEL (long-running external call)
      console.log(`[DemandBasedKaggle] ⚙️ Calling Kaggle API...`);
      
      const provisionResult = await kaggleAutomationService.createAndStartWorker(
        username,
        aionBaseUrl,
        workerId
      );
      
      if (!provisionResult.success) {
        console.error(`[DemandBasedKaggle] ❌ Failed to start kernel: ${provisionResult.error}`);
        
        // Release reservation
        await this.releaseReservation(workerId, sessionToken);
        
        return {
          success: false,
          error: provisionResult.error || 'Failed to start Kaggle kernel',
        };
      }
      
      // ============================================================================
      // PHASE 3: VERIFY TOKEN + PROMOTE STATUS (SECOND TRANSACTION)
      // ============================================================================
      
      await db.transaction(async (tx) => {
        // 1. Lock worker row and verify token matches
        const [worker] = await tx
          .select()
          .from(gpuWorkers)
          .where(eq(gpuWorkers.id, workerId))
          .for('update');
        
        if (!worker) {
          throw new Error(`Worker ${workerId} not found`);
        }
        
        // 2. Verify session token (prevents conflicts if reservation was hijacked)
        if (worker.sessionToken !== sessionToken) {
          throw new Error(
            `Session token mismatch! Expected ${sessionToken.substring(0, 8)}..., ` +
            `got ${worker.sessionToken?.substring(0, 8) || 'null'}...`
          );
        }
        
        // 3. Promote to 'pending' status
        const now = new Date();
        await tx
          .update(gpuWorkers)
          .set({
            status: 'pending', // Will become 'online' when worker registers
            sessionStartedAt: now,
            ngrokUrl: 'pending', // Worker will update this when it registers
            sessionToken: null, // Clear token (no longer needed)
            reservationExpiresAt: null,
            updatedAt: now,
          })
          .where(eq(gpuWorkers.id, workerId));
        
        console.log(`[DemandBasedKaggle] ✅ Session promoted to 'pending' - Worker ${workerId}`);
      });
      
      // 9. Record session start (for quota tracking)
      await gpuCooldownManager.recordSessionStart(workerId);
      
      this.activeSessionWorkerId = workerId;
      this.sessionStartTime = new Date();
      
      console.log(
        `[DemandBasedKaggle] 🎉 Session started successfully!\n` +
        `  Worker ID: ${workerId}\n` +
        `  Kernel: ${provisionResult.kernelId}\n` +
        `  URL: ${provisionResult.kernelUrl}\n` +
        `  Reason: ${options.reason}\n` +
        `  Estimated: ${options.estimatedDurationMinutes}min\n` +
        `  Weekly quota: ${cooldownStatus.weeklyUsageHours?.toFixed(2) || 0}h / 21h (70% safety limit)`
      );
      
      return {
        success: true,
        workerId,
      };
      
    } catch (error: any) {
      console.error('[DemandBasedKaggle] ❌ Error starting session:', error);
      
      // Try to release reservation if it was created
      // (error might have happened before reservation was created, that's OK)
      try {
        await db
          .update(gpuWorkers)
          .set({
            status: 'offline',
            sessionToken: null,
            startRequestedAt: null,
            reservationExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(sql`provider = 'kaggle' AND status = 'starting'`);
      } catch (cleanupError) {
        console.error('[DemandBasedKaggle] Failed to cleanup reservation:', cleanupError);
      }
      
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  /**
   * ✅ FIX P0-1: Release reservation helper
   * Cleans up failed reservations
   */
  private async releaseReservation(workerId: number, sessionToken: string): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        const [worker] = await tx
          .select()
          .from(gpuWorkers)
          .where(eq(gpuWorkers.id, workerId))
          .for('update');
        
        // Only release if token matches (prevent race conditions)
        if (worker && worker.sessionToken === sessionToken) {
          await tx
            .update(gpuWorkers)
            .set({
              status: 'offline',
              sessionToken: null,
              startRequestedAt: null,
              reservationExpiresAt: null,
              updatedAt: new Date(),
            })
            .where(eq(gpuWorkers.id, workerId));
          
          console.log(`[DemandBasedKaggle] Released reservation for worker ${workerId}`);
        }
      });
    } catch (error) {
      console.error(`[DemandBasedKaggle] Failed to release reservation:`, error);
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
      return { used: 0, remaining: 21 }; // 21h = 70% of 30h quota
    }
    
    const totalUsed = kaggleWorkers.reduce((sum, w) => sum + (w.weeklyUsageHours || 0), 0);
    const WEEKLY_LIMIT = 21; // 21h/week (70% of 30h Kaggle quota to avoid ban)
    const remaining = Math.max(0, WEEKLY_LIMIT - totalUsed);
    
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
        reason: `Weekly quota exhausted: ${quotaStatus.used.toFixed(2)}h / 21h (70% safety limit)`,
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
