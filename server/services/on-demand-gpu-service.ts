/**
 * ON-DEMAND GPU ACTIVATION SERVICE
 * ==================================
 * 
 * Handles automatic GPU activation/deactivation for inference + training workloads
 * 
 * WORKFLOW:
 * 1. Inference request arrives → InferenceComplexityAnalyzer decides if GPU needed
 * 2. If GPU needed → OnDemandGPUService.ensureGPUAvailable()
 * 3. If no healthy GPU → start GPU (Kaggle or Colab based on quota)
 * 4. Wait for GPU to be online (max 3min timeout)
 * 5. Return GPU worker URL
 * 6. After inference → track idle time
 * 7. If idle > IDLE_THRESHOLD → shutdown GPU
 * 
 * QUOTA-AWARE:
 * - Checks Kaggle weekly quota (70% = 21h/week max)
 * - Checks Colab cooldown (36h after session end)
 * - Rotates between providers to maximize availability
 */

import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { getQuotaEnforcementService } from './quota-enforcement-service';
import { autoScalingService } from './auto-scaling-service';
import { retrieveKaggleCredentials, retrieveGoogleCredentials } from './security/secrets-vault';
import { gpuManager } from '../gpu-orchestration/gpu-manager-service';
import { KaggleOrchestrator } from '../gpu-orchestration/kaggle-orchestrator';
import { ColabOrchestrator } from '../gpu-orchestration/colab-orchestrator';
import pino from 'pino';

const logger = pino({ name: 'OnDemandGPUService' });

export interface GPUEnsureResult {
  available: boolean;
  workerId?: number;
  workerUrl?: string;
  reason: string;
  startedNew: boolean; // true if we had to start a new GPU
  waitTimeMs?: number;
}

export interface GPUStartPreference {
  preferProvider?: 'kaggle' | 'colab'; // Optional provider preference
  requireGPU?: boolean; // If true, CPU workers won't be returned
  maxWaitMs?: number; // Max time to wait for GPU to come online (default: 180000 = 3min)
}

export class OnDemandGPUService {
  private readonly IDLE_SHUTDOWN_THRESHOLD_MS = 10 * 60 * 1000; // 10min idle → shutdown
  private readonly DEFAULT_MAX_WAIT_MS = 180 * 1000; // 3min max wait for GPU startup
  private readonly POLL_INTERVAL_MS = 5 * 1000; // Poll every 5s to check if GPU is online

  private lastInferenceTime: Map<number, number> = new Map(); // workerId → timestamp
  
  // Concurrency guard: prevents duplicate GPU starts when multiple inference requests arrive simultaneously
  private gpuStartInProgress: Map<string, Promise<GPUEnsureResult>> = new Map(); // provider → pending promise

  // Orchestrators for shutdown operations
  private kaggleOrchestrator: KaggleOrchestrator = new KaggleOrchestrator();
  private colabOrchestrator: ColabOrchestrator = new ColabOrchestrator();

  /**
   * Ensure a GPU worker is available for inference/training
   * 
   * Logic:
   * 1. Check if healthy GPU already exists
   * 2. If yes → update last activity time, return immediately
   * 3. If no → start new GPU (Kaggle or Colab based on quota)
   * 4. Wait for GPU to come online
   * 5. Return worker info
   */
  async ensureGPUAvailable(preferences: GPUStartPreference = {}): Promise<GPUEnsureResult> {
    const maxWaitMs = preferences.maxWaitMs || this.DEFAULT_MAX_WAIT_MS;
    const requireGPU = preferences.requireGPU ?? true;

    logger.info({ preferences }, 'Ensuring GPU availability');

    // Step 1: Check if healthy GPU already exists
    const existingWorker = await this.findHealthyGPU(requireGPU);

    if (existingWorker) {
      // Update last activity time (prevent idle shutdown)
      this.lastInferenceTime.set(existingWorker.id, Date.now());

      logger.info({ workerId: existingWorker.id }, 'Reusing existing healthy GPU');

      return {
        available: true,
        workerId: existingWorker.id,
        workerUrl: existingWorker.ngrokUrl || undefined,
        reason: 'Reused existing healthy GPU',
        startedNew: false,
      };
    }

    // Step 2: No healthy GPU found → check for offline manual workers that can be reused
    logger.warn({ requireGPU }, '⚠️ No healthy/online GPU found - checking for offline manual workers');

    const offlineWorkers = await db.query.gpuWorkers.findMany({
      where: eq(gpuWorkers.status, 'offline'),
    });

    const manualOfflineGPU = offlineWorkers.filter(w => {
      const capabilities = w.capabilities as any;
      return capabilities?.gpu && capabilities.gpu !== 'CPU';
    })[0];

    if (manualOfflineGPU) {
      // Found offline manual worker - RETURN IT so caller can decide to wait/retry
      logger.warn({ 
        workerId: manualOfflineGPU.id, 
        provider: manualOfflineGPU.provider 
      }, '⚠️ Found offline manual worker - returning for caller to handle');
      
      // Return offline worker info - caller should retry or wait for manual restart
      this.lastInferenceTime.set(manualOfflineGPU.id, Date.now());
      
      return {
        available: true, // TRUE porque worker existe (mesmo offline)
        workerId: manualOfflineGPU.id,
        workerUrl: manualOfflineGPU.ngrokUrl || undefined,
        reason: `GPU worker #${manualOfflineGPU.id} (${manualOfflineGPU.provider}) is offline. Admin must restart it manually in Admin Panel.`,
        startedNew: false,
      };
    }

    // Step 3: No workers available (neither online nor offline)
    logger.error('❌ NO GPU WORKERS AVAILABLE - Manual provisioning required');

    return {
      available: false,
      reason: '🚨 No GPU workers available. Please add GPU manually in Admin Panel → Gerenciamento de GPUs → Adicionar GPU.',
      startedNew: false,
    };
  }

  /**
   * Find existing healthy GPU worker
   * 
   * 🔥 CRITICAL FIX: Accept both 'healthy' AND 'online' status
   * - 'healthy': Workers validated by heartbeat monitor
   * - 'online': Workers just registered (manual or auto) but not yet heartbeat-checked
   * 
   * This enables IMMEDIATE REUSE of manually-created GPUs without waiting for heartbeat!
   */
  private async findHealthyGPU(requireGPU: boolean): Promise<typeof gpuWorkers.$inferSelect | null> {
    // Accept both 'healthy' and 'online' workers (fetch ALL, filter in-memory)
    // Drizzle doesn't support OR in where clause easily, so we fetch all and filter
    const workers = await db.query.gpuWorkers.findMany();

    // Filter for healthy/online workers with valid ngrokUrl
    const usableWorkers = workers.filter(w => 
      ['healthy', 'online'].includes(w.status) &&
      w.ngrokUrl &&
      w.ngrokUrl !== 'pending' &&
      !w.ngrokUrl.includes('placeholder')
    );

    if (usableWorkers.length === 0) {
      return null;
    }

    // Filter GPU workers if required
    if (requireGPU) {
      const gpuOnlyWorkers = usableWorkers.filter(w => {
        const capabilities = w.capabilities as any;
        return capabilities?.gpu && capabilities.gpu !== 'CPU';
      });

      if (gpuOnlyWorkers.length === 0) {
        return null;
      }

      // Return first available (could improve with load balancing)
      logger.info({ 
        workerId: gpuOnlyWorkers[0].id,
        status: gpuOnlyWorkers[0].status,
        provider: gpuOnlyWorkers[0].provider,
      }, '♻️ REUSING EXISTING GPU (no new creation needed)');
      
      return gpuOnlyWorkers[0];
    }

    logger.info({ 
      workerId: usableWorkers[0].id,
      status: usableWorkers[0].status,
    }, '♻️ REUSING EXISTING WORKER');
    
    return usableWorkers[0];
  }

  /**
   * 🚨 DEPRECATED - AUTO-CREATION DISABLED (2025 Architecture Change)
   * 
   * GPUs must be provisioned MANUALLY by admin via Replit Secrets.
   * System ONLY manages lifecycle (turn on/off based on quota/idle/cooldown).
   * 
   * This method now ONLY checks for existing workers - NEVER creates new ones.
   */
  private async startGPUOnDemand(preferProvider?: 'kaggle' | 'colab'): Promise<{
    success: boolean;
    workerId?: number;
    provider?: 'kaggle' | 'colab';
    reason?: string;
  }> {
    const quotaService = await getQuotaEnforcementService();

    // Determine target provider
    let targetProvider: 'kaggle' | 'colab' | null = null;

    if (preferProvider === 'kaggle') {
      const canStartKaggle = await this.checkKaggleQuota();
      if (canStartKaggle) {
        targetProvider = 'kaggle';
      }
    } else if (preferProvider === 'colab') {
      const canStartColab = await this.checkColabQuota();
      if (canStartColab) {
        targetProvider = 'colab';
      }
    }

    // No preference → intelligent selection based on quota
    if (!targetProvider) {
      const canStartKaggle = await this.checkKaggleQuota();
      const canStartColab = await this.checkColabQuota();

      if (canStartKaggle) {
        targetProvider = 'kaggle';
      } else if (canStartColab) {
        targetProvider = 'colab';
      }
    }

    // 🚨 2025 ARCHITECTURE: NO AUTO-CREATION
    // Admin must provision GPUs manually via Replit Secrets
    // System ONLY manages lifecycle (on/off based on quota/idle/cooldown)
    
    logger.error('❌ GPU AUTO-CREATION DISABLED - Please add GPU manually via Admin Panel');
    
    return {
      success: false,
      reason: '🚨 No GPU workers available. Please add GPU manually in Admin Panel → Gerenciamento de GPUs → Adicionar GPU. System will reuse existing workers automatically.',
    };
  }

  /**
   * 🚨 DEPRECATED - Not used in 2025 architecture
   * Kept for backward compatibility only
   */
  private async checkKaggleQuota(): Promise<boolean> {
    return false; // Always return false - no auto-creation
  }

  /**
   * 🚨 DEPRECATED - Not used in 2025 architecture
   * Kept for backward compatibility only
   */
  private async checkColabQuota(): Promise<boolean> {
    return false; // Always return false - no auto-creation
  }

  /**
   * Check all GPUs for idle status and shutdown if needed
   * Called by scheduler every 5 minutes
   */
  async checkIdleGPUs(): Promise<void> {
    logger.info('Checking for idle GPUs to shutdown');

    const healthyWorkers = await db.query.gpuWorkers.findMany({
      where: eq(gpuWorkers.status, 'healthy'),
    });

    const now = Date.now();
    let shutdownCount = 0;

    for (const worker of healthyWorkers) {
      const lastActivity = this.lastInferenceTime.get(worker.id);

      // If no activity tracked, assume it's idle since startup
      if (!lastActivity) {
        continue; // Don't shutdown immediately - give it time
      }

      const idleTimeMs = now - lastActivity;

      if (idleTimeMs > this.IDLE_SHUTDOWN_THRESHOLD_MS) {
        logger.info(
          { workerId: worker.id, provider: worker.provider, idleMinutes: (idleTimeMs / 60000).toFixed(1) },
          'GPU idle for too long - initiating graceful shutdown'
        );

        // Shutdown GPU via orchestrator
        const shutdownResult = await this.shutdownGPU(worker.id, worker.provider);

        if (shutdownResult.success) {
          shutdownCount++;
          
          // Cleanup activity tracking ONLY after successful shutdown
          this.lastInferenceTime.delete(worker.id);
          
          logger.info({ workerId: worker.id, provider: worker.provider }, 'GPU shutdown successful');
        } else {
          // ⚠️ CRITICAL: Do NOT cleanup activity tracking - keep trying on next cycle
          // This prevents marking worker as "handled" when shutdown failed
          logger.error(
            { workerId: worker.id, provider: worker.provider, error: shutdownResult.error, idleMinutes: (idleTimeMs / 60000).toFixed(1) },
            'Failed to shutdown idle GPU - will retry next cycle (5min)'
          );
          
          // TODO: Add alerting/metrics for persistent shutdown failures
          // If worker fails shutdown 3+ times, escalate to admin/ops
        }
      }
    }

    if (shutdownCount > 0) {
      logger.info({ shutdownCount }, 'Idle GPU shutdown cycle complete');
    }
  }

  /**
   * Shutdown GPU gracefully via orchestrator
   */
  private async shutdownGPU(
    workerId: number,
    provider: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (provider === 'kaggle') {
        return await this.kaggleOrchestrator.stopSession(workerId);
      } else if (provider === 'colab') {
        return await this.colabOrchestrator.stopSession(workerId);
      } else {
        return {
          success: false,
          error: `Unknown provider: ${provider}`,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Track inference activity (called after each inference)
   */
  trackInferenceActivity(workerId: number): void {
    this.lastInferenceTime.set(workerId, Date.now());
  }

  /**
   * Get idle stats for all GPUs
   */
  async getIdleStats(): Promise<Array<{
    workerId: number;
    provider: string;
    lastActivityMs: number | null;
    idleTimeMs: number | null;
    willShutdownIn: number | null;
  }>> {
    const healthyWorkers = await db.query.gpuWorkers.findMany({
      where: eq(gpuWorkers.status, 'healthy'),
    });

    const now = Date.now();

    return healthyWorkers.map(worker => {
      const lastActivity = this.lastInferenceTime.get(worker.id);
      const idleTimeMs = lastActivity ? now - lastActivity : null;
      const willShutdownIn = idleTimeMs !== null
        ? Math.max(0, this.IDLE_SHUTDOWN_THRESHOLD_MS - idleTimeMs)
        : null;

      return {
        workerId: worker.id,
        provider: worker.provider,
        lastActivityMs: lastActivity || null,
        idleTimeMs,
        willShutdownIn,
      };
    });
  }
}

// Singleton instance
export const onDemandGPUService = new OnDemandGPUService();
