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
      // ✅ UPDATE last activity time in DB (prevent idle shutdown for Kaggle)
      await db.update(gpuWorkers)
        .set({ lastUsedAt: new Date() })
        .where(eq(gpuWorkers.id, existingWorker.id));

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
      
      if (activationResult.available) {
        // ✅ UPDATE last activity time in DB
        await db.update(gpuWorkers)
          .set({ lastUsedAt: new Date() })
          .where(eq(gpuWorkers.id, manualOfflineGPU.id));
        
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
   * Steps:
   * 1. Read credentials from Replit Secrets (accountId='kaggle-1' → KAGGLE_USERNAME_1)
   * 2. Create notebook if doesn't exist yet (via Kaggle API)
   * 3. UPDATE existing worker (don't create duplicate!)
   * 4. Start session via orchestrator
   */
  private async activateWorker(worker: typeof gpuWorkers.$inferSelect): Promise<GPUEnsureResult> {
    logger.info({ workerId: worker.id, accountId: worker.accountId }, 'Activating worker...');

    // Concurrency guard: prevent duplicate activations
    const lockKey = `activate-${worker.id}`;
    if (this.gpuStartInProgress.has(lockKey)) {
      logger.warn({ workerId: worker.id }, 'Activation already in progress - skipping');
      const existingPromise = this.gpuStartInProgress.get(lockKey);
      return await existingPromise!;
    }

    // Create activation promise
    const activationPromise = (async () => {
      try {
        // Parse accountId to get Secret index
        // Example: "kaggle-1" → provider="kaggle", index=1
        const match = worker.accountId?.match(/^(kaggle|colab)-(\d+)$/);
        
        if (!match) {
          return {
            available: false,
            reason: `Invalid accountId format: ${worker.accountId}. Expected 'kaggle-N' or 'colab-N'`,
            startedNew: false,
          };
        }

        const [_, provider, indexStr] = match;
        const index = indexStr;

        if (provider === 'kaggle') {
          return await this.activateKaggleWorker(worker, index);
        } else { // colab
          return await this.activateColabWorker(worker, index);
        }

      } finally {
        // Cleanup guard
        this.gpuStartInProgress.delete(lockKey);
      }
    })();

    // Register promise in guard
    this.gpuStartInProgress.set(lockKey, activationPromise);

    return await activationPromise;
  }

  /**
   * Activate Kaggle worker (create notebook + start session)
   */
  private async activateKaggleWorker(worker: typeof gpuWorkers.$inferSelect, index: string): Promise<GPUEnsureResult> {
    // ✅ Extract index from accountId (KAGGLE_1 → '1')
    const accountIndex = worker.accountId?.split('_')[1] || index;
    
    const username = process.env[`KAGGLE_USERNAME_${accountIndex}`];
    const key = process.env[`KAGGLE_KEY_${accountIndex}`];

    if (!username || !key) {
      return {
        available: false,
        reason: `Kaggle credentials not found in Replit Secrets: KAGGLE_USERNAME_${accountIndex}, KAGGLE_KEY_${accountIndex}`,
        startedNew: false,
      };
    }

    // Check if notebook already exists in providerLimits
    const providerLimits = (worker.providerLimits as any) || {};
    let notebookUrl = providerLimits.kaggle_notebook_url;
    let slug = providerLimits.kaggle_slug;

    // Create notebook if doesn't exist
    if (!notebookUrl) {
      logger.info({ workerId: worker.id }, 'Creating Kaggle notebook (first activation)...');

      const { createKaggleAPI } = await import('../gpu-orchestration/providers/kaggle-api');
      const kaggleAPI = createKaggleAPI({ username, key });

      const result = await kaggleAPI.createNotebook({
        title: `AION Auto-Activated ${Date.now()}`,
        enableGPU: true,
        enableInternet: true,
        isPrivate: true,
      });

      notebookUrl = result.notebookUrl;
      slug = result.slug;

      // Update worker with notebook info
      await db.update(gpuWorkers)
        .set({
          providerLimits: {
            ...providerLimits,
            kaggle_notebook_url: notebookUrl,
            kaggle_slug: slug,
            kaggle_username: username,
          },
        })
        .where(eq(gpuWorkers.id, worker.id));

      logger.info({ workerId: worker.id, notebookUrl }, '✅ Kaggle notebook created');
    }

    // Start session via orchestrator
    logger.info({ workerId: worker.id }, 'Starting Kaggle session...');

    const sessionResult = await this.kaggleOrchestrator.startSession({
      notebookUrl,
      kaggleUsername: username,
      kagglePassword: '', // Not used (we use API key)
      workerId: worker.id,
      useGPU: true,
    });

    if (!sessionResult.success) {
      return {
        available: false,
        reason: `Failed to start Kaggle session: ${sessionResult.error}`,
        startedNew: false,
      };
    }

    // 🔥 BUG FIX: UPDATE worker with ngrok URL + status after successful activation
    if (sessionResult.ngrokUrl) {
      await db.update(gpuWorkers)
        .set({
          ngrokUrl: sessionResult.ngrokUrl,
          status: 'healthy' as const,
        })
        .where(eq(gpuWorkers.id, worker.id));
      
      logger.info({ workerId: worker.id, ngrokUrl: sessionResult.ngrokUrl }, '✅ Worker activated and updated in DB');
    }

    return {
      available: true,
      workerId: worker.id,
      workerUrl: sessionResult.ngrokUrl,
      reason: 'Kaggle GPU activated successfully',
      startedNew: true,
    };
  }

  /**
   * Activate Colab worker (create notebook + start session)
   */
  private async activateColabWorker(worker: typeof gpuWorkers.$inferSelect, index: string): Promise<GPUEnsureResult> {
    // ✅ Extract index from accountId (COLAB_1 → '1')
    const accountIndex = worker.accountId?.split('_')[1] || index;
    
    const email = process.env[`COLAB_EMAIL_${accountIndex}`];
    const password = process.env[`COLAB_PASSWORD_${accountIndex}`];

    if (!email || !password) {
      return {
        available: false,
        reason: `Colab credentials not found in Replit Secrets: COLAB_EMAIL_${accountIndex}, COLAB_PASSWORD_${accountIndex}`,
        startedNew: false,
      };
    }

    // Check if notebook already exists
    const providerLimits = (worker.providerLimits as any) || {};
    let notebookUrl = providerLimits.colab_notebook_url;
    let notebookId = providerLimits.colab_notebook_id;

    // Create notebook if doesn't exist
    if (!notebookUrl) {
      logger.info({ workerId: worker.id }, 'Creating Colab notebook (first activation)...');

      const { createColabCreator } = await import('../gpu-orchestration/providers/colab-creator');
      const colabCreator = createColabCreator({ email, password });

      const result = await colabCreator.createNotebook({
        title: `AION Auto-Activated ${Date.now()}`,
        enableGPU: true,
        enableTPU: false,
      });

      notebookUrl = result.notebookUrl;
      notebookId = result.notebookId;

      // Update worker with notebook info
      await db.update(gpuWorkers)
        .set({
          providerLimits: {
            ...providerLimits,
            colab_notebook_url: notebookUrl,
            colab_notebook_id: notebookId,
            google_email: email,
          },
        })
        .where(eq(gpuWorkers.id, worker.id));

      logger.info({ workerId: worker.id, notebookUrl }, '✅ Colab notebook created');
    }

    // Start session via orchestrator
    logger.info({ workerId: worker.id }, 'Starting Colab session...');

    const sessionResult = await this.colabOrchestrator.startSession({
      notebookUrl,
      googleEmail: email,
      googlePassword: password,
      workerId: worker.id,
    });

    if (!sessionResult.success) {
      return {
        available: false,
        reason: `Failed to start Colab session: ${sessionResult.error}`,
        startedNew: false,
      };
    }

    // 🔥 BUG FIX: UPDATE worker with ngrok URL + status after successful activation
    if (sessionResult.ngrokUrl) {
      await db.update(gpuWorkers)
        .set({
          ngrokUrl: sessionResult.ngrokUrl,
          status: 'healthy' as const,
        })
        .where(eq(gpuWorkers.id, worker.id));
      
      logger.info({ workerId: worker.id, ngrokUrl: sessionResult.ngrokUrl }, '✅ Worker activated and updated in DB');
    }

    return {
      available: true,
      workerId: worker.id,
      workerUrl: sessionResult.ngrokUrl,
      reason: 'Colab GPU activated successfully',
      startedNew: true,
    };
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
      // ✅ READ last activity from DB (not in-memory Map)
      const lastActivity = worker.lastUsedAt?.getTime();

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
          
          logger.info({ workerId: worker.id, provider: worker.provider }, 'GPU shutdown successful');
        } else {
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
   * ✅ PERSISTENT: Updates PostgreSQL lastUsedAt (not in-memory Map)
   */
  async trackInferenceActivity(workerId: number): Promise<void> {
    await db.update(gpuWorkers)
      .set({ lastUsedAt: new Date() })
      .where(eq(gpuWorkers.id, workerId));
  }

  /**
   * Get idle stats for all GPUs
   * ✅ PERSISTENT: Reads from PostgreSQL lastUsedAt (not in-memory Map)
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
      // ✅ READ from DB (not in-memory Map)
      const lastActivity = worker.lastUsedAt?.getTime();
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
