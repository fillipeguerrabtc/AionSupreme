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

    logger.info('No healthy GPU found - starting new GPU on-demand');

    // Step 2: No healthy GPU → start new one
    const startResult = await this.startGPUOnDemand(preferences.preferProvider);

    if (!startResult.success) {
      return {
        available: false,
        reason: startResult.reason || 'Failed to start GPU',
        startedNew: false,
      };
    }

    logger.info({ workerId: startResult.workerId }, 'GPU start initiated - waiting for online status');

    // Step 3: Wait for GPU to come online
    const startTime = Date.now();
    const workerId = startResult.workerId!;

    while (Date.now() - startTime < maxWaitMs) {
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });

      if (worker?.status === 'healthy' && worker.ngrokUrl && worker.ngrokUrl !== 'pending') {
        // GPU is online!
        this.lastInferenceTime.set(workerId, Date.now());

        const waitTimeMs = Date.now() - startTime;
        logger.info({ workerId, waitTimeMs }, 'GPU successfully came online');

        return {
          available: true,
          workerId: worker.id,
          workerUrl: worker.ngrokUrl,
          reason: 'Started new GPU successfully',
          startedNew: true,
          waitTimeMs,
        };
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, this.POLL_INTERVAL_MS));
    }

    // Timeout
    logger.error({ workerId, maxWaitMs }, 'Timeout waiting for GPU to come online');

    return {
      available: false,
      reason: `Timeout waiting for GPU ${workerId} to come online after ${maxWaitMs}ms`,
      startedNew: true,
    };
  }

  /**
   * Find existing healthy GPU worker
   */
  private async findHealthyGPU(requireGPU: boolean): Promise<typeof gpuWorkers.$inferSelect | null> {
    const workers = await db.query.gpuWorkers.findMany({
      where: eq(gpuWorkers.status, 'healthy'),
    });

    if (workers.length === 0) {
      return null;
    }

    // Filter GPU workers if required
    if (requireGPU) {
      const gpuWorkers = workers.filter(w => {
        const capabilities = w.capabilities as any;
        return capabilities?.gpu && capabilities.gpu !== 'CPU';
      });

      if (gpuWorkers.length === 0) {
        return null;
      }

      // Return first available (could improve with load balancing)
      return gpuWorkers[0];
    }

    return workers[0];
  }

  /**
   * Start GPU on-demand (choose best provider based on quota)
   * 
   * CONCURRENCY GUARD: Prevents duplicate GPU starts when multiple inference requests arrive simultaneously
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

    if (!targetProvider) {
      logger.error('No GPU providers have available quota');
      return {
        success: false,
        reason: 'All GPU providers quota exceeded (Kaggle: 21h/week used, Colab: in cooldown)',
      };
    }

    // CONCURRENCY GUARD (Kaggle ONLY):
    // - Kaggle limit: 1 concurrent session → MUST serialize starts
    // - Colab allows multiple sessions → NO lock needed
    const lockKey = targetProvider === 'kaggle' ? 'kaggle-lock' : null;

    if (lockKey) {
      const existingStart = this.gpuStartInProgress.get(lockKey);

      if (existingStart) {
        logger.info({ provider: targetProvider }, 'Kaggle GPU start already in progress - waiting for existing promise');
        
        // Wait for existing start to complete
        const result = await existingStart;
        
        // Convert to expected format
        return {
          success: result.available,
          workerId: result.workerId,
          provider: targetProvider,
          reason: result.reason,
        };
      }
    }

    // No lock needed (Colab) OR no start in progress (Kaggle) → initiate new start
    logger.info({ provider: targetProvider, locked: !!lockKey }, 'Initiating new GPU start (quota available)');

    // Create promise and register in guard Map (Kaggle only)
    const startPromise = (async () => {
      try {
        if (targetProvider === 'kaggle') {
          const result = await this.startKaggleGPU();
          return {
            available: result.success,
            workerId: result.workerId,
            workerUrl: undefined,
            reason: result.reason || 'Kaggle GPU started',
            startedNew: true,
          };
        } else {
          const result = await this.startColabGPU();
          return {
            available: result.success,
            workerId: result.workerId,
            workerUrl: undefined,
            reason: result.reason || 'Colab GPU started',
            startedNew: true,
          };
        }
      } finally {
        // Cleanup: remove from in-progress map (Kaggle only)
        if (lockKey) {
          this.gpuStartInProgress.delete(lockKey);
        }
      }
    })();

    // Register promise BEFORE await (Kaggle only - prevents duplicate sessions)
    if (lockKey) {
      this.gpuStartInProgress.set(lockKey, startPromise);
    }

    // Wait for completion
    const result = await startPromise;

    return {
      success: result.available,
      workerId: result.workerId,
      provider: targetProvider,
      reason: result.reason,
    };
  }

  /**
   * Check if Kaggle has quota available
   */
  private async checkKaggleQuota(): Promise<boolean> {
    const quotaService = await getQuotaEnforcementService();

    // Create temporary worker to check quota (workerId=-1 is placeholder)
    const quotaCheck = await quotaService.validateCanStart(-1, 'kaggle');

    return quotaCheck.canStart;
  }

  /**
   * Check if Colab has quota available (not in cooldown)
   */
  private async checkColabQuota(): Promise<boolean> {
    const quotaService = await getQuotaEnforcementService();

    // Create temporary worker to check quota
    const quotaCheck = await quotaService.validateCanStart(-1, 'colab');

    return quotaCheck.canStart;
  }

  /**
   * Start Kaggle GPU worker
   */
  private async startKaggleGPU(): Promise<{
    success: boolean;
    workerId?: number;
    provider: 'kaggle';
    reason?: string;
  }> {
    logger.info('Starting Kaggle GPU on-demand...');

    try {
      // Retrieve credentials from SecretsVault
      // Try "default" identifier first (most common)
      const credentials = await retrieveKaggleCredentials('default');

      if (!credentials) {
        logger.warn('No Kaggle credentials found in SecretsVault (identifier: default)');
        return {
          success: false,
          provider: 'kaggle',
          reason: 'No Kaggle credentials available in SecretsVault - please provision manually first',
        };
      }

      logger.info({ username: credentials.username }, 'Found Kaggle credentials - creating GPU');

      // Call GPUManagerService to create GPU
      const result = await gpuManager.createGPU({
        provider: 'kaggle',
        email: '', // Not used for Kaggle
        kaggleUsername: credentials.username,
        kaggleKey: credentials.key,
        enableGPU: true,
        title: `AION Auto-GPU ${Date.now()}`,
        autoStart: false, // Don't auto-start session yet - just create notebook
      });

      logger.info({ workerId: result.worker.id }, 'Kaggle GPU created successfully');

      return {
        success: true,
        workerId: result.worker.id,
        provider: 'kaggle',
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to start Kaggle GPU');
      return {
        success: false,
        provider: 'kaggle',
        reason: `Kaggle start error: ${error.message}`,
      };
    }
  }

  /**
   * Start Colab GPU worker
   */
  private async startColabGPU(): Promise<{
    success: boolean;
    workerId?: number;
    provider: 'colab';
    reason?: string;
  }> {
    logger.info('Starting Colab GPU on-demand...');

    try {
      // Retrieve credentials from SecretsVault
      const credentials = await retrieveGoogleCredentials('default');

      if (!credentials) {
        logger.warn('No Google credentials found in SecretsVault (identifier: default)');
        return {
          success: false,
          provider: 'colab',
          reason: 'No Google credentials available in SecretsVault - please provision manually first',
        };
      }

      logger.info({ email: credentials.email }, 'Found Google credentials - creating Colab GPU');

      // Call GPUManagerService to create GPU
      const result = await gpuManager.createGPU({
        provider: 'colab',
        email: credentials.email,
        password: credentials.password,
        enableGPU: true,
        title: `AION Auto-GPU ${Date.now()}`,
        autoStart: false,
      });

      logger.info({ workerId: result.worker.id }, 'Colab GPU created successfully');

      return {
        success: true,
        workerId: result.worker.id,
        provider: 'colab',
      };

    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to start Colab GPU');
      return {
        success: false,
        provider: 'colab',
        reason: `Colab start error: ${error.message}`,
      };
    }
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
