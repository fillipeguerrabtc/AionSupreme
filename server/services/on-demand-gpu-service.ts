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
   * 1. Check if ANY healthy GPU already exists (Kaggle OR Colab)
   * 2. If yes → REUSE (don't waste quota activating another!)
   * 3. If no → check offline workers (admin must restart manually)
   * 4. If none → error (admin must add GPU via Secrets)
   * 
   * PRIORIZAÇÃO INTELIGENTE:
   * - Colab schedule ativo → USAR Colab (já consumindo quota!)
   * - Kaggle on-demand ativo → USAR Kaggle
   * - Nenhum ativo → Admin deve ativar manualmente via UI
   */
  async ensureGPUAvailable(preferences: GPUStartPreference = {}): Promise<GPUEnsureResult> {
    const maxWaitMs = preferences.maxWaitMs || this.DEFAULT_MAX_WAIT_MS;
    const requireGPU = preferences.requireGPU ?? true;

    logger.info({ preferences }, 'Ensuring GPU availability');

    // Step 1: Check if ANY healthy/online GPU exists (Kaggle OR Colab)
    // CRITICAL: Priorizar REUSO antes de ativar nova GPU!
    const existingWorker = await this.findHealthyGPU(requireGPU);

    if (existingWorker) {
      // Update last activity time (prevent idle shutdown for Kaggle)
      this.lastInferenceTime.set(existingWorker.id, Date.now());

      logger.info({ 
        workerId: existingWorker.id,
        provider: existingWorker.provider,
      }, '♻️ REUSING existing GPU (avoiding quota waste)');

      return {
        available: true,
        workerId: existingWorker.id,
        workerUrl: existingWorker.ngrokUrl || undefined,
        reason: `Reused existing ${existingWorker.provider} GPU (already active)`,
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
      // Found offline worker → ACTIVATE IT automatically!
      logger.info({ 
        workerId: manualOfflineGPU.id, 
        provider: manualOfflineGPU.provider,
        accountId: manualOfflineGPU.accountId,
      }, '🔄 Found offline worker - will activate automatically');
      
      // Attempt to activate this worker using Replit Secrets
      const activationResult = await this.activateWorker(manualOfflineGPU);
      
      if (activationResult.success) {
        this.lastInferenceTime.set(manualOfflineGPU.id, Date.now());
        
        return {
          available: true,
          workerId: manualOfflineGPU.id,
          workerUrl: activationResult.workerUrl,
          reason: `Activated ${manualOfflineGPU.provider} GPU worker #${manualOfflineGPU.id}`,
          startedNew: true,
        };
      } else {
        logger.error({ 
          workerId: manualOfflineGPU.id,
          error: activationResult.reason,
        }, '❌ Failed to activate offline worker');
        
        return {
          available: false,
          reason: `Found offline worker but failed to activate: ${activationResult.reason}`,
          startedNew: false,
        };
      }
    }

    // Step 3: No workers available at all (AutoDiscovery didn't find any Secrets)
    logger.error('❌ NO GPU WORKERS IN DATABASE - Check Replit Secrets');

    return {
      available: false,
      reason: '🚨 No GPU workers found. Please add Kaggle/Colab credentials to Replit Secrets (KAGGLE_USERNAME_1, KAGGLE_KEY_1, etc).',
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
   * Activate offline worker using Replit Secrets
   * 
   * Reads credentials from environment variables based on accountId
   * Example: accountId='kaggle-1' → KAGGLE_USERNAME_1, KAGGLE_KEY_1
   */
  private async activateWorker(worker: typeof gpuWorkers.$inferSelect): Promise<{
    success: boolean;
    workerUrl?: string;
    reason?: string;
  }> {
    logger.info({ workerId: worker.id, accountId: worker.accountId }, 'Activating worker...');

    try {
      // Parse accountId to get Secret index
      // Example: "kaggle-1" → provider="kaggle", index=1
      const match = worker.accountId?.match(/^(kaggle|colab)-(\d+)$/);
      
      if (!match) {
        return {
          success: false,
          reason: `Invalid accountId format: ${worker.accountId}. Expected 'kaggle-N' or 'colab-N'`,
        };
      }

      const [_, provider, indexStr] = match;
      const index = indexStr;

      if (provider === 'kaggle') {
        const username = process.env[`KAGGLE_USERNAME_${index}`];
        const key = process.env[`KAGGLE_KEY_${index}`];

        if (!username || !key) {
          return {
            success: false,
            reason: `Kaggle credentials not found in Replit Secrets: KAGGLE_USERNAME_${index}, KAGGLE_KEY_${index}`,
          };
        }

        // Activate via GPUManager
        const result = await gpuManager.createGPU({
          provider: 'kaggle',
          email: '',
          kaggleUsername: username,
          kaggleKey: key,
          enableGPU: true,
          title: `AION Auto-Activated ${Date.now()}`,
          autoStart: true, // Start session immediately
        });

        return {
          success: true,
          workerUrl: result.worker.ngrokUrl || undefined,
        };

      } else { // colab
        const email = process.env[`COLAB_EMAIL_${index}`];
        const password = process.env[`COLAB_PASSWORD_${index}`];

        if (!email || !password) {
          return {
            success: false,
            reason: `Colab credentials not found in Replit Secrets: COLAB_EMAIL_${index}, COLAB_PASSWORD_${index}`,
          };
        }

        // Activate via GPUManager
        const result = await gpuManager.createGPU({
          provider: 'colab',
          email,
          password,
          enableGPU: true,
          title: `AION Auto-Activated ${Date.now()}`,
          autoStart: true, // Start session immediately
        });

        return {
          success: true,
          workerUrl: result.worker.ngrokUrl || undefined,
        };
      }

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to activate worker');
      return {
        success: false,
        reason: `Activation error: ${error.message}`,
      };
    }
  }

  /**
   * 🚨 DEPRECATED - NO LONGER USED (2025 Architecture)
   * 
   * Use activateWorker() instead (reads from Replit Secrets)
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
