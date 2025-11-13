/**
 * GPU Workers API - Plug&Play GPU Pool Management
 * WITH INTELLIGENT QUOTA MANAGEMENT (uses only 70% of quota for safety!)
 */

import type { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db";
import { gpuWorkers } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { quotaManager } from "../gpu-orchestration/intelligent-quota-manager";
import { log } from "../utils/logger";

export function registerGpuRoutes(app: Router) {
  log.info({ component: 'gpu-routes' }, 'Registering GPU Pool API routes');

  /**
   * GET /api/gpu/credentials/available
   * List available credentials from Replit Secrets
   * 
   * Reads secrets matching patterns:
   * - KAGGLE_USERNAME_1, KAGGLE_KEY_1, KAGGLE_USERNAME_2, KAGGLE_KEY_2...
   * - COLAB_EMAIL_1, COLAB_PASSWORD_1, COLAB_EMAIL_2, COLAB_PASSWORD_2...
   */
  app.get("/api/gpu/credentials/available", async (req: Request, res: Response) => {
    try {
      log.info({ component: 'gpu-credentials' }, 'Scanning Replit Secrets for credentials');
      
      const kaggleCredentials: Array<{ id: string; username: string; hasKey: boolean }> = [];
      const colabCredentials: Array<{ id: string; email: string; hasPassword: boolean }> = [];
      
      // 🔥 PRIMEIRO: Verificar credenciais SEM número (single account)
      const singleUsername = process.env.KAGGLE_USERNAME;
      const singleApiKey = process.env.KAGGLE_KEY;
      
      if (singleUsername) {
        kaggleCredentials.push({
          id: 'kaggle_1',
          username: singleUsername,
          hasKey: !!singleApiKey,
        });
        log.info({ component: 'gpu-credentials', account: 1, username: singleUsername, hasKey: !!singleApiKey }, 'Found Kaggle account (single)');
      }
      
      // DEPOIS: Scan for numbered Kaggle credentials (up to 10 accounts)
      for (let i = 1; i <= 10; i++) {
        const usernameKey = `KAGGLE_USERNAME_${i}`;
        const apiKeyKey = `KAGGLE_KEY_${i}`;
        
        const username = process.env[usernameKey];
        const apiKey = process.env[apiKeyKey];
        
        // Skip se já adicionamos credencial única com mesmo username
        if (username && username !== singleUsername) {
          const nextId = kaggleCredentials.length + 1;
          kaggleCredentials.push({
            id: `kaggle_${nextId}`,
            username,
            hasKey: !!apiKey,
          });
          log.info({ component: 'gpu-credentials', account: nextId, username, hasKey: !!apiKey }, 'Found Kaggle account');
        }
      }
      
      // Scan for Colab credentials (up to 10 accounts)
      for (let i = 1; i <= 10; i++) {
        const emailKey = `COLAB_EMAIL_${i}`;
        const passwordKey = `COLAB_PASSWORD_${i}`;
        
        const email = process.env[emailKey];
        const password = process.env[passwordKey];
        
        if (email) {
          colabCredentials.push({
            id: `colab_${i}`,
            email,
            hasPassword: !!password,
          });
          log.info({ component: 'gpu-credentials', account: i, email, hasPassword: !!password }, 'Found Colab account');
        }
      }
      
      log.info({ 
        component: 'gpu-credentials', 
        kaggleCount: kaggleCredentials.length, 
        colabCount: colabCredentials.length 
      }, 'Credentials scan complete');
      
      res.json({
        success: true,
        kaggle: kaggleCredentials,
        colab: colabCredentials,
        instructions: {
          kaggle: "Add KAGGLE_USERNAME, KAGGLE_KEY (single account) OR KAGGLE_USERNAME_1, KAGGLE_KEY_1, KAGGLE_USERNAME_2, KAGGLE_KEY_2... (multi-account) to Replit Secrets",
          colab: "Add COLAB_EMAIL_1, COLAB_PASSWORD_1, COLAB_EMAIL_2, COLAB_PASSWORD_2... to Replit Secrets"
        }
      });
      
    } catch (error: any) {
      log.error({ component: 'gpu-credentials', error: error.message }, 'Error scanning secrets');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/register
   * Register a new GPU worker from Colab/Kaggle notebook
   */
  app.post("/gpu/register", async (req: Request, res: Response) => {
    log.info({ component: 'gpu-register', body: req.body }, 'Worker registration request');
    try {
      const { 
        workerId,  // ✅ NEW: Optional workerId to UPDATE existing worker
        name, 
        url, 
        type, 
        gpuType, 
        platform, 
        accountEmail, 
        maxSessionHours, 
        sessionStart,
        capabilities 
      } = req.body;

      const detectedProvider = (platform || type || "colab").toLowerCase();
      
      // ✅ CRITICAL: Populate quota fields based on provider (read from DB limits)
      const workerData = {
        provider: platform || type || "colab",
        accountId: accountEmail || "unknown",
        ngrokUrl: url || `http://temp-${Date.now()}.ngrok.io`,
        capabilities: {
          gpu: gpuType || "Tesla T4",
          model: "TinyLlama-1.1B-Chat",
          vram_gb: 15,
          max_concurrent: 1,
          capabilities: capabilities || ["training", "inference"],
          metadata: {
            workerName: name,
            sessionStart: sessionStart,
            maxSessionHours: maxSessionHours || 11.5,
            platform: platform || type,
          }
        } as any,
        status: "online",
        lastHealthCheck: new Date(),
        // ✅ SEMPRE popular campos de quota do banco (70% safety limits)
        maxSessionDurationSeconds: detectedProvider.includes('kaggle') ? 32400 : 30240,  // Kaggle: 9h, Colab: 8.4h
        maxWeeklySeconds: detectedProvider.includes('kaggle') ? 75600 : null,  // Kaggle: 21h, Colab: null
      };

      let worker;
      
      // ✅ FIX: If workerId provided, UPDATE existing worker (Kaggle/Colab automated provisioning)
      if (workerId) {
        log.info({ component: 'gpu-register', workerId }, 'Updating existing worker');
        
        [worker] = await db
          .update(gpuWorkers)
          .set({
            ...workerData,
            sessionStartedAt: new Date(),  // ✅ Track when worker came online
          })
          .where(eq(gpuWorkers.id, workerId))
          .returning();
        
        if (!worker) {
          return res.status(404).json({ error: `Worker ${workerId} not found` });
        }
        
        console.log(`[GPU Pool] ✅ Worker updated: ${name} (ID: ${worker.id}, ${gpuType})`);
      } else {
        // Legacy behavior: Create new worker
        [worker] = await db.insert(gpuWorkers).values(workerData).returning();
        console.log(`[GPU Pool] 🎮 Worker created: ${name} (ID: ${worker.id}, ${gpuType})`);
      }

      res.json({ 
        success: true, 
        id: worker.id,
        name: (worker.capabilities as any)?.metadata?.workerName,
        url: worker.ngrokUrl,
        status: worker.status,
        gpuType: (worker.capabilities as any)?.gpu,
      });
    } catch (error: any) {
      console.error("[GPU Pool] Registration error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/workers/register (legacy endpoint for compatibility)
   */
  app.post("/gpu/workers/register", async (req: Request, res: Response) => {
    console.log("[GPU Register] ✅ REQUEST RECEIVED:", req.method, req.path, req.body);
    try {
      const { provider, accountId, ngrokUrl, capabilities } = req.body;

      const detectedProvider = (provider || "colab").toLowerCase();
      
      // ✅ CRITICAL: Populate quota fields based on provider (read from DB limits)
      const workerData = {
        provider: provider || "colab",
        accountId: accountId || "unknown",
        ngrokUrl: ngrokUrl || `http://temp-${Date.now()}.ngrok.io`,
        capabilities: capabilities || {
          tor_enabled: false,
          model: "llama-3-8b",
          gpu: "Tesla T4",
          vram_gb: 15,
          max_concurrent: 4,
        },
        status: "pending",
        lastHealthCheck: new Date(),
        // ✅ SEMPRE popular campos de quota do banco (70% safety limits)
        maxSessionDurationSeconds: detectedProvider.includes('kaggle') ? 32400 : 30240,  // Kaggle: 9h, Colab: 8.4h
        maxWeeklySeconds: detectedProvider.includes('kaggle') ? 75600 : null,  // Kaggle: 21h, Colab: null
      };

      const [worker] = await db.insert(gpuWorkers).values(workerData).returning();

      console.log(`[GPU Pool] 🎮 Worker registered: ${provider} (ID: ${worker.id})`);

      res.json({ success: true, worker: { id: worker.id } });
    } catch (error: any) {
      console.error("[GPU Pool] Registration error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * SHARED HEARTBEAT HANDLER
   * Processes heartbeat logic for both legacy and new endpoints
   */
  const handleHeartbeat = async (workerId: number, sessionRuntimeHours: number | undefined, maxSessionHours: number | undefined, status: string | undefined, res: Response) => {
    try {
      // Buscar worker PRIMEIRO (validação universal)
      const [worker] = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.id, workerId))
        .limit(1);

      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      // Se está desligando (status: "offline"), chamar recordSessionEnd IMEDIATAMENTE
      if (status === "offline") {
        console.log(`[GPU Heartbeat] Worker ${workerId} going offline - recording session end`);
        
        // 🔥 FIX: Chamar recordSessionEnd ANTES de mudar status
        const { gpuCooldownManager } = await import("../services/gpu-cooldown-manager");
        await gpuCooldownManager.recordSessionEnd(workerId);
        
        // 🔥 FIX: Agora persistir status="offline" e atualizar timestamps
        // (recordSessionEnd já zerou sessionDurationSeconds e sessionStartedAt)
        await db
          .update(gpuWorkers)
          .set({
            status: "offline",
            updatedAt: new Date(),
          })
          .where(eq(gpuWorkers.id, workerId));
        
        return res.json({ success: true });
      }

      const capabilities = (worker.capabilities as any) || {};
      const metadata = capabilities.metadata || {};

      // 🔥 FIX: Calculate sessionDurationSeconds for quota tracking
      const sessionDurationSeconds = sessionRuntimeHours ? Math.round(sessionRuntimeHours * 3600) : 0;

      // CRITICAL: Acumular usedHoursThisWeek para Kaggle workers
      let usedHoursThisWeek = metadata.usedHoursThisWeek || 0;
      
      if (worker.provider === "kaggle") {
        // Para Kaggle, acumular horas desde o último heartbeat
        const lastSessionRuntime = metadata.sessionRuntimeHours || 0;
        const currentSessionRuntime = sessionRuntimeHours || 0;
        const deltaHours = Math.max(0, currentSessionRuntime - lastSessionRuntime);
        
        // Acumular apenas se houve progresso (evita acumular em duplicidade)
        if (deltaHours > 0 && deltaHours < 1) { // Delta razoável (< 1h entre heartbeats)
          usedHoursThisWeek += deltaHours;
          console.log(
            `[GPU Heartbeat] Kaggle worker ${workerId}: +${deltaHours.toFixed(2)}h ` +
            `(session: ${sessionDurationSeconds}s, total week: ${usedHoursThisWeek.toFixed(2)}h)`
          );
        }
      }

      // Atualizar metadata com session runtime + weekly usage + sessionStart
      const updatedCapabilities = {
        ...capabilities,
        metadata: {
          ...metadata,
          sessionStart: metadata.sessionStart || worker.createdAt.toISOString(), // Track session start (use createdAt on first heartbeat)
          sessionRuntimeHours: sessionRuntimeHours || 0,
          maxSessionHours: maxSessionHours || 12,
          usedHoursThisWeek: worker.provider === "kaggle" ? usedHoursThisWeek : (metadata.usedHoursThisWeek || 0),
          lastHeartbeat: new Date().toISOString(),
        },
      };

      // 🔥 FIX: Update sessionDurationSeconds for quota tracking integration
      await db
        .update(gpuWorkers)
        .set({
          lastHealthCheck: new Date(),
          status: "healthy",
          capabilities: updatedCapabilities,
          sessionDurationSeconds,  // 🔥 NEW: Persist for recordSessionEnd
          updatedAt: new Date(),
        })
        .where(eq(gpuWorkers.id, workerId));

      // 🔥 AUTO-SHUTDOWN SYSTEM: Check if shutdown requested
      // Backend can signal kernel to gracefully exit via heartbeat response
      const shouldShutdown = worker.status === "shutdown_requested";
      
      if (shouldShutdown) {
        console.log(`[GPU Heartbeat] ⚠️  Shutdown signal sent to worker ${workerId}`);
        return res.json({
          success: true,
          shutdown: true,
          message: "Backend requested graceful shutdown to preserve quota"
        });
      }

      res.json({ success: true, shutdown: false });
    } catch (error: any) {
      console.error("[GPU Heartbeat] Error:", error);
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /gpu/workers/heartbeat (LEGACY)
   * Backwards compatibility endpoint - accepts workerId in body
   */
  app.post("/gpu/workers/heartbeat", async (req: Request, res: Response) => {
    const { workerId, sessionRuntimeHours, maxSessionHours, status } = req.body;
    
    // Validate workerId
    const parsedId = parseInt(workerId);
    if (isNaN(parsedId) || !workerId) {
      return res.status(400).json({ error: "Invalid or missing workerId" });
    }
    
    await handleHeartbeat(parsedId, sessionRuntimeHours, maxSessionHours, status, res);
  });

  /**
   * POST /api/gpu/workers/:workerId/heartbeat (NEW)
   * Modern endpoint - accepts workerId as path parameter
   */
  app.post("/api/gpu/workers/:workerId/heartbeat", async (req: Request, res: Response) => {
    const workerId = parseInt(req.params.workerId);
    const { sessionRuntimeHours, maxSessionHours, status } = req.body;
    await handleHeartbeat(workerId, sessionRuntimeHours, maxSessionHours, status, res);
  });

  /**
   * GET /api/gpu/workers/:workerId/next-job
   * Job polling endpoint - worker requests next training job
   * Returns job if available, or {hasJob: false} if queue empty
   */
  app.get("/api/gpu/workers/:workerId/next-job", async (req: Request, res: Response) => {
    try {
      const workerId = parseInt(req.params.workerId);
      
      // Verify worker exists and is online
      const [worker] = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.id, workerId))
        .limit(1);
      
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }
      
      // Import training jobs schema
      const { trainingJobs } = await import('../../shared/schema');
      
      // Find next pending/queued training job
      const [nextJob] = await db
        .select()
        .from(trainingJobs)
        .where(eq(trainingJobs.status, 'queued'))
        .orderBy(desc(trainingJobs.createdAt))
        .limit(1);
      
      if (!nextJob) {
        // No jobs available
        return res.json({ hasJob: false });
      }
      
      // Mark job as running (worker assignment tracking not in schema yet)
      await db
        .update(trainingJobs)
        .set({
          status: 'running',
          startedAt: new Date(),
        })
        .where(eq(trainingJobs.id, nextJob.id));
      
      log.info({ component: 'gpu-job-dispatch', workerId, jobId: nextJob.id }, 'Job assigned to worker');
      
      // Return job details (matching worker Python expectations)
      res.json({
        hasJob: true,
        job: {
          id: nextJob.id,
          name: nextJob.name,
          modelName: nextJob.model, // Worker expects "modelName"
          datasetId: nextJob.datasetId, // Worker expects "datasetId"
          config: nextJob.config, // Include LoRA config for training
          createdAt: nextJob.createdAt,
        },
      });
      
    } catch (error: any) {
      log.error({ component: 'gpu-job-dispatch', error: error.message }, 'Error fetching next job');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/status
   * Dashboard status - reads from database
   * Note: Heartbeat timeout detection is handled by background monitor (server/gpu/heartbeat-monitor.ts)
   */
  app.get("/gpu/status", async (req: Request, res: Response) => {
    try {
      const workers = await db
        .select()
        .from(gpuWorkers)
        .orderBy(desc(gpuWorkers.lastHealthCheck));

      const total = workers.length;
      const healthy = workers.filter((w) => w.status === "healthy").length;
      const unhealthy = workers.filter((w) => w.status === "unhealthy").length;
      const offline = workers.filter((w) => w.status === "offline" || w.status === "pending").length;

      const totalRequests = 0;
      const avgLatency = 0;

      res.json({
        total,
        healthy,
        unhealthy,
        offline,
        totalRequests,
        avgLatency,
        workers,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/overview
   * PRODUCTION-GRADE UNIFIED GPU OVERVIEW
   * Returns complete GPU status with quota information for dashboard
   */
  app.get("/api/gpu/overview", async (req: Request, res: Response) => {
    try {
      // Fetch all workers from database
      const workers = await db
        .select()
        .from(gpuWorkers)
        .orderBy(desc(gpuWorkers.lastHealthCheck));

      // Fetch quota status for each worker (parallel)
      const workersWithQuota = await Promise.all(
        workers.map(async (worker) => {
          // Get quota status using IntelligentQuotaManager
          const quotaStatus = await quotaManager.getQuotaStatus(worker.id);
          
          return {
            id: worker.id,
            provider: worker.provider,
            accountId: worker.accountId || undefined,
            ngrokUrl: worker.ngrokUrl,
            capabilities: worker.capabilities || {
              tor_enabled: false,
              model: 'unknown',
              gpu: 'unknown',
              vram_gb: 0,
              max_concurrent: 1,
            },
            status: worker.status,
            lastHealthCheck: worker.lastHealthCheck?.toISOString(),
            requestCount: worker.requestCount || 0,
            averageLatencyMs: worker.averageLatencyMs || 0,
            createdAt: worker.createdAt.toISOString(),
            autoManaged: worker.autoManaged,
            source: worker.autoManaged ? 'auto' as const : 'manual' as const,
            quotaStatus: quotaStatus || undefined,
          };
        })
      );

      // Calculate stats
      const total = workers.length;
      const healthy = workers.filter((w) => w.status === "healthy").length;
      const unhealthy = workers.filter((w) => w.status === "unhealthy").length;
      const offline = workers.filter((w) => w.status === "offline").length;
      const pending = workers.filter((w) => w.status === "pending").length;
      const totalRequests = workers.reduce((sum, w) => sum + (w.requestCount || 0), 0);
      const avgLatency = workers.length > 0
        ? workers.reduce((sum, w) => sum + (w.averageLatencyMs || 0), 0) / workers.length
        : 0;
      const autoManaged = workers.filter((w) => w.autoManaged).length;
      const manual = workers.filter((w) => !w.autoManaged).length;

      // Get orchestrator status
      const activeProviders = Array.from(new Set(workers.filter(w => w.status === 'healthy').map(w => w.provider)));

      res.json({
        workers: workersWithQuota,
        stats: {
          total,
          healthy,
          unhealthy,
          offline,
          pending,
          totalRequests,
          avgLatency,
          autoManaged,
          manual,
        },
        orchestrator: {
          running: workers.some(w => w.autoManaged && w.status === 'healthy'),
          activeProviders,
          nextScheduledAction: undefined, // Could be enhanced later
        },
      });
    } catch (error: any) {
      log.error({ component: 'gpu-overview', error: error.message }, 'Failed to fetch GPU overview');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/workers
   * List all GPU workers
   */
  app.get("/gpu/workers", async (req: Request, res: Response) => {
    try {
      const workers = await db
        .select()
        .from(gpuWorkers)
        .orderBy(desc(gpuWorkers.lastHealthCheck));

      res.json({ workers });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/workers/:id
   * Get specific worker details
   */
  app.get("/gpu/workers/:id", async (req: Request, res: Response) => {
    try {
      const workerId = parseInt(req.params.id);

      const [worker] = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.id, workerId))
        .limit(1);

      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      res.json(worker);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/quota/status
   * Get quota status for all workers
   * Replaced by /api/gpu/overview which includes quota status per worker
   */
  app.get("/gpu/quota/status", async (req: Request, res: Response) => {
    try {
      const quotas = await quotaManager.getAllQuotaStatuses();

      res.json({ quotas });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/shutdown
   * Worker notifies shutdown (auto-shutdown or manual)
   */
  app.post("/gpu/shutdown", async (req: Request, res: Response) => {
    try {
      const { worker_name } = req.body;
      
      console.log(`[GPU Shutdown] Worker notified shutdown: ${worker_name}`);
      
      // Find worker by name in metadata
      const workers = await db.select().from(gpuWorkers);
      const worker = workers.find(w => (w.capabilities as any)?.metadata?.workerName === worker_name);
      
      if (worker) {
        await db
          .update(gpuWorkers)
          .set({
            status: "offline",
            updatedAt: new Date(),
          })
          .where(eq(gpuWorkers.id, worker.id));
        
        console.log(`[GPU Shutdown] Worker ${worker.id} marked offline`);
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("[GPU Shutdown] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PATCH /api/gpu/:id
   * Update GPU worker configuration
   */
  app.patch("/gpu/:id", async (req: Request, res: Response) => {
    try {
      const workerId = parseInt(req.params.id);
      const { accountId, capabilities, status } = req.body;

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (accountId !== undefined) {
        updateData.accountId = accountId;
      }

      if (capabilities !== undefined) {
        updateData.capabilities = capabilities;
      }

      if (status !== undefined) {
        updateData.status = status;
      }

      const [updatedWorker] = await db
        .update(gpuWorkers)
        .set(updateData)
        .where(eq(gpuWorkers.id, workerId))
        .returning();

      if (!updatedWorker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      console.log(`[GPU Update] Worker ${workerId} updated successfully`);

      res.json({ 
        success: true, 
        message: "Worker updated successfully",
        worker: updatedWorker,
      });
    } catch (error: any) {
      console.error("[GPU Update] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/gpu/:id
   * CASCADE DELETE - Removes worker + all associated resources
   * (training jobs, sessions, files, etc.)
   */
  app.delete("/gpu/:id", async (req: Request, res: Response) => {
    try {
      const workerId = parseInt(req.params.id);

      // Use GPUDeletionService for comprehensive cascade delete
      const { gpuDeletionService } = await import('../services/gpu-deletion-service');
      const result = await gpuDeletionService.deleteWorker(workerId);

      if (!result.success) {
        return res.status(500).json({ 
          error: "Deletion failed", 
          details: result.errors,
        });
      }

      res.json({ 
        success: true, 
        message: "GPU worker deleted successfully (cascade)",
        resourcesDeleted: result.resourcesDeleted,
        warnings: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error: any) {
      console.error("[GPU Delete] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/gpu/batch
   * Batch delete multiple workers
   */
  app.delete("/gpu/batch", async (req: Request, res: Response) => {
    try {
      const { workerIds } = req.body;

      if (!Array.isArray(workerIds) || workerIds.length === 0) {
        return res.status(400).json({ error: "workerIds array required" });
      }

      const { gpuDeletionService } = await import('../services/gpu-deletion-service');
      const results = await gpuDeletionService.deleteMultipleWorkers(workerIds);

      const successCount = results.filter(r => r.success).length;

      res.json({ 
        success: true, 
        message: `Deleted ${successCount}/${workerIds.length} workers`,
        results,
      });
    } catch (error: any) {
      console.error("[GPU Batch Delete] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/gpu/cleanup/offline
   * Delete stale offline workers (older than X hours)
   */
  app.delete("/gpu/cleanup/offline", async (req: Request, res: Response) => {
    try {
      const olderThanHours = parseInt(req.query.hours as string) || 24;

      const { gpuDeletionService } = await import('../services/gpu-deletion-service');
      const deleted = await gpuDeletionService.deleteOfflineWorkers(olderThanHours);

      res.json({ 
        success: true, 
        message: `Deleted ${deleted} stale workers (offline > ${olderThanHours}h)`,
        deleted,
      });
    } catch (error: any) {
      console.error("[GPU Cleanup] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===================================================================
  // AUTO-SCALING & INTELLIGENT DISPATCH (P1.3)
  // ===================================================================

  /**
   * POST /api/gpu/auto-scale/select
   * Select best worker based on real-time metrics
   */
  app.post("/gpu/auto-scale/select", async (req: Request, res: Response) => {
    try {
      const { requireGPU } = req.body;

      const { autoScalingService } = await import('../services/auto-scaling-service');
      const result = await autoScalingService.selectWorker(requireGPU);

      res.json(result);
    } catch (error: any) {
      console.error("[Auto-Scaling] Select error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/auto-scale/evaluate
   * Evaluate current scaling decision
   */
  app.get("/gpu/auto-scale/evaluate", async (req: Request, res: Response) => {
    try {
      const { autoScalingService } = await import('../services/auto-scaling-service');
      const decision = await autoScalingService.evaluateScaling();

      res.json({ success: true, decision });
    } catch (error: any) {
      console.error("[Auto-Scaling] Evaluate error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/auto-scale/cluster-metrics
   * Get cluster-wide metrics overview
   */
  app.get("/gpu/auto-scale/cluster-metrics", async (req: Request, res: Response) => {
    try {
      const { autoScalingService } = await import('../services/auto-scaling-service');
      const metrics = await autoScalingService.getClusterMetrics();

      res.json({ success: true, metrics });
    } catch (error: any) {
      console.error("[Auto-Scaling] Cluster metrics error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ===================================================================
  // KAGGLE CLI MANAGEMENT (P1.1)
  // ===================================================================

  /**
   * POST /api/gpu/kaggle/accounts
   * Add Kaggle account to SecretsVault
   */
  app.post("/gpu/kaggle/accounts", async (req: Request, res: Response) => {
    try {
      const { username, apiKey } = req.body;

      if (!username || !apiKey) {
        return res.status(400).json({ error: "username and apiKey required" });
      }

      const { kaggleCLIService } = await import('../services/kaggle-cli-service');
      const success = await kaggleCLIService.addAccount(username, apiKey);

      if (success) {
        res.json({ 
          success: true, 
          message: `Account ${username} added successfully`,
        });
      } else {
        res.status(500).json({ error: "Failed to add account" });
      }
    } catch (error: any) {
      console.error("[Kaggle CLI] Add account error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/gpu/kaggle/accounts/:username
   * Remove Kaggle account
   */
  app.delete("/gpu/kaggle/accounts/:username", async (req: Request, res: Response) => {
    try {
      const { username } = req.params;

      const { kaggleCLIService } = await import('../services/kaggle-cli-service');
      const success = await kaggleCLIService.removeAccount(username);

      if (success) {
        res.json({ 
          success: true, 
          message: `Account ${username} removed successfully`,
        });
      } else {
        res.status(500).json({ error: "Failed to remove account" });
      }
    } catch (error: any) {
      console.error("[Kaggle CLI] Remove account error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/kaggle/accounts
   * List all Kaggle accounts
   */
  app.get("/gpu/kaggle/accounts", async (req: Request, res: Response) => {
    try {
      const { kaggleCLIService } = await import('../services/kaggle-cli-service');
      const accounts = kaggleCLIService.listAccounts();

      res.json({ 
        success: true, 
        accounts,
      });
    } catch (error: any) {
      console.error("[Kaggle CLI] List accounts error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/kaggle/set-active
   * Set active Kaggle account
   */
  app.post("/gpu/kaggle/set-active", async (req: Request, res: Response) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ error: "username required" });
      }

      const { kaggleCLIService } = await import('../services/kaggle-cli-service');
      const success = await kaggleCLIService.setActiveAccount(username);

      if (success) {
        res.json({ 
          success: true, 
          message: `Active account set to ${username}`,
        });
      } else {
        res.status(500).json({ error: "Failed to set active account" });
      }
    } catch (error: any) {
      console.error("[Kaggle CLI] Set active account error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/kaggle/status
   * Get Kaggle CLI status
   */
  app.get("/gpu/kaggle/status", async (req: Request, res: Response) => {
    try {
      const { kaggleCLIService } = await import('../services/kaggle-cli-service');
      const status = await kaggleCLIService.getStatus();

      res.json({ 
        success: true, 
        status,
      });
    } catch (error: any) {
      console.error("[Kaggle CLI] Get status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/kaggle/test-credentials-raw
   * RAW Kaggle test - returns EXACT CLI output for debugging
   */
  app.post("/api/gpu/kaggle/test-credentials-raw", async (req: Request, res: Response) => {
    try {
      const { username, key } = req.body;
      
      if (!username || !key) {
        return res.status(400).json({ error: "Username and API key required" });
      }

      console.log(`[Kaggle RAW Test] Testing ${username}...`);

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Execute EXACT same command as our service
      const command = `kaggle kernels list --user ${username}`;
      
      try {
        const { stdout, stderr } = await execAsync(command, {
          env: {
            ...process.env,
            KAGGLE_USERNAME: username,
            KAGGLE_KEY: key,
          },
        });

        console.log(`[Kaggle RAW Test] ✅ Command executed successfully`);

        return res.json({
          success: true,
          command,
          stdout: stdout.substring(0, 1000), // First 1000 chars
          stderr: stderr.substring(0, 500),
          isHTML: stdout.trim().toLowerCase().startsWith('<!doctype') || stdout.trim().toLowerCase().startsWith('<html'),
          firstChars: stdout.substring(0, 100),
        });

      } catch (error: any) {
        const output = (error.stdout || '') + (error.stderr || '');
        
        return res.json({
          success: false,
          command,
          exitCode: error.code,
          stdout: (error.stdout || '').substring(0, 1000),
          stderr: (error.stderr || '').substring(0, 500),
          isHTML: output.trim().toLowerCase().startsWith('<!doctype') || output.trim().toLowerCase().startsWith('<html'),
          firstChars: output.substring(0, 100),
        });
      }

    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/kaggle/test-credentials
   * Test Kaggle credentials without provisioning (ENTERPRISE-GRADE)
   * 
   * FEATURES:
   * ✅ Thread-safe: Mutex prevents concurrent tests
   * ✅ Transactional: Atomic test with automatic rollback on failure
   * ✅ State preservation: Snapshots and restores ALL metadata (isActive, quota, etc)
   * ✅ Smart cleanup: Removes NEW invalid accounts, restores EXISTING valid accounts
   * ✅ Status codes: 401 (invalid), 403 (unverified), 429 (rate limit), 500 (error)
   */
  app.post("/api/gpu/kaggle/test-credentials", async (req: Request, res: Response) => {
    try {
      const { username, key } = req.body;

      if (!username || !key) {
        return res.status(400).json({ 
          error: "Username and API key required" 
        });
      }

      console.log(`\n[Kaggle Test API] 📥 Request received: ${username}`);

      const { kaggleCLIService } = await import('../services/kaggle-cli-service');

      // Use safe transactional test method (mutex + snapshot + rollback)
      const result = await kaggleCLIService.testAccountSafe(username, key);

      if (result.success) {
        console.log(`[Kaggle Test API] ✅ SUCCESS - Account validated and ready`);
        return res.json({
          success: true,
          message: `✅ Credentials validated successfully!\n\nAccount "${username}" is now configured and ready to provision Kaggle GPUs.`,
          username,
        });
      } else {
        // Test failed - result.error contains Kaggle CLI error
        console.log(`[Kaggle Test API] ❌ FAILED - Invalid credentials`);
        
        // Parse error message and determine correct HTTP status
        let userMessage = result.error || 'Unknown error';
        let statusCode = 500;
        
        // Check for common Kaggle API errors
        const errorLower = userMessage.toLowerCase();
        
        // HTML/DOCTYPE response = unverified account (most common)
        if (userMessage.includes('<!DOCTYPE') || userMessage.includes('Unexpected token') || errorLower.includes('not valid json') || errorLower.includes('html')) {
          userMessage = "⚠️ PHONE VERIFICATION REQUIRED\n\nKaggle API requires phone verification before you can use API credentials.\n\n📱 REQUIRED STEPS:\n1. Go to: kaggle.com/settings\n2. Find section: 'Phone Verification'\n3. Click 'Not Verified' link\n4. Select your country code\n5. Enter phone WITHOUT leading zero\n   Example: +55 Brazil → 11987654321 (not 011987654321)\n6. Enter SMS code\n7. Generate NEW API token after verification\n8. Try again here\n\n✅ This is required by Kaggle, not AION.";
          statusCode = 403;
        } else if (errorLower.includes('401') || errorLower.includes('unauthorized') || errorLower.includes('invalid') || errorLower.includes('authentication failed')) {
          userMessage = "❌ Invalid Kaggle credentials\n\nPlease verify:\n• Username is correct (case-sensitive)\n• API key is valid\n• Generate new token at: kaggle.com/settings → API";
          statusCode = 401;
        } else if (errorLower.includes('403') || errorLower.includes('forbidden') || errorLower.includes('phone') || errorLower.includes('verified')) {
          userMessage = "⚠️ PHONE VERIFICATION REQUIRED\n\n📱 Go to kaggle.com/settings and verify your phone number.\nAPI access is blocked until verification is complete.";
          statusCode = 403;
        } else if (errorLower.includes('rate limit') || errorLower.includes('429') || errorLower.includes('too many')) {
          userMessage = "⚠️ Kaggle API rate limit exceeded. Please wait 5-10 minutes and try again.";
          statusCode = 429;
        } else if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
          userMessage = "⚠️ Connection timeout. Kaggle API may be slow. Please try again.";
          statusCode = 504;
        }

        return res.status(statusCode).json({ 
          success: false,
          error: userMessage 
        });
      }

    } catch (error: any) {
      console.error("[Kaggle Test API] ⚠️ UNEXPECTED ERROR:", error.message);
      console.error("[Kaggle Test API] Stack:", error.stack);
      
      return res.status(500).json({ 
        success: false,
        error: "Internal server error during credential test. Please try again." 
      });
    }
  });

  /**
   * POST /api/gpu/kaggle/provision
   * Provision Kaggle notebook (bootstrap + create notebook + start GPU)
   * 
   * Accepts either:
   * 1. credential_id: "kaggle_1" (reads from Replit Secrets)
   * 2. username + key: Manual credentials
   */
  app.post("/gpu/kaggle/provision", async (req: Request, res: Response) => {
    try {
      const { username: manualUsername, key: manualKey, notebookName, credential_id } = req.body;

      let username: string;
      let key: string;

      // Read credentials from Replit Secrets or use manual input
      if (credential_id) {
        console.log(`[Kaggle Provision] 📦 Using credential_id: ${credential_id}`);
        
        // Parse credential_id (format: "kaggle_1")
        const match = credential_id.match(/kaggle_(\d+)/);
        if (!match) {
          return res.status(400).json({ error: "Invalid credential_id format. Expected 'kaggle_1', 'kaggle_2', etc." });
        }
        
        const index = match[1];
        const usernameKey = `KAGGLE_USERNAME_${index}`;
        const apiKeyKey = `KAGGLE_KEY_${index}`;
        
        username = process.env[usernameKey] || '';
        key = process.env[apiKeyKey] || '';
        
        if (!username || !key) {
          return res.status(400).json({ 
            error: `Credentials not found in Replit Secrets. Please add ${usernameKey} and ${apiKeyKey} to Secrets.` 
          });
        }
        
        console.log(`[Kaggle Provision] ✅ Loaded credentials from secrets: ${username}`);
      } else {
        // Manual credentials
        username = manualUsername;
        key = manualKey;
        
        if (!username || !key) {
          return res.status(400).json({ 
            error: "Either provide credential_id OR username+key" 
          });
        }
        
        console.log(`[Kaggle Provision] 📝 Using manual credentials: ${username}`);
      }

      console.log(`\n${'='.repeat(70)}`);
      console.log(`[Kaggle Provision] 🚀 STARTING PROVISIONING`);
      console.log(`${'='.repeat(70)}`);
      console.log(`  → Username: ${username}`);
      console.log(`  → Key length: ${key.length} chars`);
      console.log(`  → Key preview: ${key.substring(0, 10)}...${key.substring(key.length - 10)}`);
      console.log(`[Kaggle Provision] Step 1/4: Bootstrap Kaggle CLI...`);

      const { kaggleCLIService } = await import('../services/kaggle-cli-service');
      
      const bootstrapResult = await kaggleCLIService.bootstrap();
      if (!bootstrapResult.success) {
        console.error(`[Kaggle Provision] ❌ Bootstrap failed:`, bootstrapResult.error);
        return res.status(500).json({ 
          error: `Kaggle CLI setup failed: ${bootstrapResult.error}. Please contact support.` 
        });
      }

      console.log(`[Kaggle Provision] ✅ Bootstrap successful`);
      console.log(`[Kaggle Provision] Step 2/4: Validating credentials for ${username}...`);

      const addAccountResult = await kaggleCLIService.addAccount(username, key);
      if (!addAccountResult) {
        console.error(`[Kaggle Provision] ❌ Failed to add account ${username}`);
        return res.status(401).json({ 
          error: "Invalid Kaggle credentials. Please verify:\n1. Username is correct (case-sensitive)\n2. API key is valid (generate new at kaggle.com/settings)\n3. Your Kaggle account is phone-verified (required for API access)" 
        });
      }

      console.log(`[Kaggle Provision] ✅ Credentials validated and stored securely`);
      console.log(`[Kaggle Provision] Step 3/4: Creating worker database entry...`);

      const notebookId = `aion-gpu-worker-${Date.now()}`;
      const finalNotebookName = notebookName || notebookId;

      const workerData = {
        provider: "kaggle",
        accountId: username,
        ngrokUrl: `http://pending-${Date.now()}.ngrok.io`,
        capabilities: {
          gpu: "Tesla P100",
          model: "TinyLlama-1.1B-Chat",
          vram_gb: 16,
          max_concurrent: 1,
          metadata: {
            workerName: finalNotebookName,
            maxSessionHours: 9,
            platform: "kaggle",
          }
        } as any,
        status: "pending",
        autoManaged: true,
        lastHealthCheck: new Date(),
      };

      const [worker] = await db.insert(gpuWorkers).values(workerData).returning();

      console.log(`[Kaggle Provision] ✅ Worker DB entry created (ID: ${worker.id})`);
      console.log(`[Kaggle Provision] Step 4/4: Creating Kaggle notebook with GPU enabled...`);

      // 4. ✨ NEW: Automatic notebook creation via Kaggle API!
      const { kaggleAutomationService } = await import('../services/kaggle-automation-service');

      const aionBaseUrl = process.env.REPL_ID 
        ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        : `http://localhost:5000`;

      console.log(`[Kaggle Provision] 📤 Creating kernel automatically...`);
      console.log(`   → AION URL: ${aionBaseUrl}`);
      console.log(`   → Worker ID: ${worker.id}`);
      console.log(`   → Notebook: ${finalNotebookName}`);

      // Fire async (don't block response)
      kaggleAutomationService.createAndStartWorker(
        username,
        aionBaseUrl,
        worker.id
      ).then(result => {
        if (result.success) {
          console.log(`[Kaggle Provision] ✅ Kernel created successfully!`);
          console.log(`   → Kernel ID: ${result.kernelId}`);
          console.log(`   → URL: ${result.kernelUrl}`);
          console.log(`   → Status: Running with GPU enabled`);
          console.log(`   → Worker will self-register via ngrok in ~1-2 minutes`);
        } else {
          console.error(`[Kaggle Provision] ❌ Kernel creation failed: ${result.error}`);
          console.error(`   → Worker ${worker.id} status will remain 'pending'`);
          console.error(`   → Check Kaggle quota and account settings`);
        }
      }).catch(error => {
        console.error(`[Kaggle Provision] ❌ Unexpected automation error:`, error.message);
        console.error(`   → Stack: ${error.stack}`);
      });

      // Respond immediately (notebook creation is async)
      console.log(`[Kaggle Provision] 🎉 Provisioning initiated successfully!`);
      
      res.json({
        success: true,
        notebookName: finalNotebookName,
        workerId: worker.id,
        status: "provisioning",
        message: `✅ Kaggle worker created! Notebook "${finalNotebookName}" is being started with GPU. Worker will appear online in ~2-3 minutes. Check GPU Dashboard for status.`,
      });

    } catch (error: any) {
      console.error("[Kaggle Provision] ❌ FATAL ERROR:", error.message);
      console.error("[Kaggle Provision] Stack trace:", error.stack);
      
      // Return user-friendly error
      res.status(500).json({ 
        error: error.message || "An unexpected error occurred while provisioning Kaggle worker. Please check logs for details." 
      });
    }
  });

  /**
   * ==========================================
   * GOOGLE COLAB ORCHESTRATION (Puppeteer)
   * ==========================================
   */

  /**
   * POST /api/gpu/colab/provision
   * Provision Google Colab notebook via Puppeteer automation
   * 
   * Accepts either:
   * 1. credential_id: "colab_1" (reads from Replit Secrets)
   * 2. email + password: Manual credentials
   */
  app.post("/gpu/colab/provision", async (req: Request, res: Response) => {
    try {
      const { email: manualEmail, password: manualPassword, notebookUrl, credential_id } = req.body;

      let email: string;
      let password: string;

      // Read credentials from Replit Secrets or use manual input
      if (credential_id) {
        console.log(`[Colab Provision] 📦 Using credential_id: ${credential_id}`);
        
        // Parse credential_id (format: "colab_1")
        const match = credential_id.match(/colab_(\d+)/);
        if (!match) {
          return res.status(400).json({ error: "Invalid credential_id format. Expected 'colab_1', 'colab_2', etc." });
        }
        
        const index = match[1];
        const emailKey = `COLAB_EMAIL_${index}`;
        const passwordKey = `COLAB_PASSWORD_${index}`;
        
        email = process.env[emailKey] || '';
        password = process.env[passwordKey] || '';
        
        if (!email || !password) {
          return res.status(400).json({ 
            error: `Credentials not found in Replit Secrets. Please add ${emailKey} and ${passwordKey} to Secrets.` 
          });
        }
        
        console.log(`[Colab Provision] ✅ Loaded credentials from secrets: ${email}`);
      } else {
        // Manual credentials
        email = manualEmail;
        password = manualPassword;
        
        if (!email || !password) {
          return res.status(400).json({ 
            error: "Either provide credential_id OR email+password" 
          });
        }
        
        console.log(`[Colab Provision] 📝 Using manual credentials: ${email}`);
      }

      console.log(`[Colab Provision] Starting Puppeteer automation for ${email}...`);

      // CRITICAL FIX: Create worker record FIRST (architect-approved refactor)
      // Step 1: Insert worker into database to get workerId
      const [worker] = await db.insert(gpuWorkers).values({
        provider: 'colab',
        accountId: email, // Store Google account email
        ngrokUrl: `placeholder-${Date.now()}`, // Temporary, will be updated after session starts
        capabilities: {
          tor_enabled: false,
          model: 'llama-3-8b-lora',
          gpu: 'Tesla T4',
          vram_gb: 16,
        },
        status: 'provisioning',
        sessionStartedAt: null,
      }).returning();

      console.log(`[Colab Provision] ✅ Worker record created (ID: ${worker.id})`);

      try {
        // Step 2: Start session via orchestrator
        const { colabOrchestrator } = await import('../gpu-orchestration/colab-orchestrator');
        
        const result = await colabOrchestrator.startSession({
          workerId: worker.id,
          googleEmail: email,
          googlePassword: password,
          notebookUrl: notebookUrl || 'https://colab.research.google.com',
          headless: true,
        });

        if (!result.success) {
          // Update worker status to failed
          await db.update(gpuWorkers)
            .set({ status: 'failed' })
            .where(eq(gpuWorkers.id, worker.id));
          
          return res.status(500).json({ error: result.error || 'Failed to start Colab session' });
        }

        // Step 3: Update worker with ngrok URL and mark as online
        await db.update(gpuWorkers)
          .set({
            ngrokUrl: result.ngrokUrl,
            status: 'online',
            sessionStartedAt: new Date(),
          })
          .where(eq(gpuWorkers.id, worker.id));

        console.log(`[Colab Provision] ✅ Session started successfully (ngrok: ${result.ngrokUrl})`);

        res.json({
          success: true,
          workerId: worker.id,
          notebookUrl: notebookUrl || 'https://colab.research.google.com',
          ngrokUrl: result.ngrokUrl,
          status: 'online',
          message: `Colab session started for ${email}`,
        });
      } catch (error: any) {
        // Clean up worker record if session failed to start
        await db.update(gpuWorkers)
          .set({ status: 'failed' })
          .where(eq(gpuWorkers.id, worker.id));
        
        throw error;
      }
    } catch (error: any) {
      console.error("[Colab Provision] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/colab/status
   * Get status of all Colab sessions
   */
  app.get("/gpu/colab/status", async (req: Request, res: Response) => {
    try {
      // Query all Colab workers
      const colabWorkers = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.provider, "colab"))
        .orderBy(desc(gpuWorkers.createdAt));

      res.json({
        success: true,
        workers: colabWorkers,
        total: colabWorkers.length,
        active: colabWorkers.filter(w => w.status === "healthy" || w.status === "online").length,
      });
    } catch (error: any) {
      console.error("[Colab Status] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/colab/stop
   * Stop a Colab session
   */
  app.post("/gpu/colab/stop", async (req: Request, res: Response) => {
    try {
      const { workerId } = req.body;

      if (!workerId) {
        return res.status(400).json({ error: "workerId required" });
      }

      console.log(`[Colab Stop] Stopping worker ${workerId}...`);

      // CRITICAL FIX: Use stopSession() with workerId (architect-approved refactor)
      const { colabOrchestrator } = await import('../gpu-orchestration/colab-orchestrator');
      const result = await colabOrchestrator.stopSession(workerId);

      if (!result.success) {
        return res.status(500).json({ error: result.error || 'Failed to stop Colab session' });
      }

      console.log(`[Colab Stop] ✅ Session stopped successfully`);

      res.json({
        success: true,
        message: `Colab worker ${workerId} stopped successfully`,
      });
    } catch (error: any) {
      console.error("[Colab Stop] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // AUTO-SCALING ORCHESTRATOR ROUTES
  // ========================================

  /**
   * POST /api/gpu/auto-scaling/start
   * Start Auto-Scaling Orchestrator (24/7 rotation)
   */
  app.post("/gpu/auto-scaling/start", async (req: Request, res: Response) => {
    try {
      console.log('[Auto-Scaling] Starting orchestrator...');
      
      const { autoScalingOrchestrator } = await import('../gpu-orchestration/auto-scaling-orchestrator');
      const schedule = await autoScalingOrchestrator.startAutoScaling();

      res.json({
        success: true,
        message: 'Auto-Scaling Orchestrator iniciado com sucesso!',
        schedule,
      });
    } catch (error: any) {
      console.error('[Auto-Scaling] Start error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/auto-scaling/stop
   * Stop Auto-Scaling Orchestrator
   */
  app.post("/gpu/auto-scaling/stop", async (req: Request, res: Response) => {
    try {
      console.log('[Auto-Scaling] Stopping orchestrator...');
      
      const { autoScalingOrchestrator } = await import('../gpu-orchestration/auto-scaling-orchestrator');
      await autoScalingOrchestrator.stopAutoScaling();

      res.json({
        success: true,
        message: 'Auto-Scaling Orchestrator parado com sucesso!',
      });
    } catch (error: any) {
      console.error('[Auto-Scaling] Stop error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/auto-scaling/recalculate
   * Recalculate schedule (when new GPUs added)
   */
  app.post("/gpu/auto-scaling/recalculate", async (req: Request, res: Response) => {
    try {
      console.log('[Auto-Scaling] Recalculating schedule...');
      
      const { autoScalingOrchestrator } = await import('../gpu-orchestration/auto-scaling-orchestrator');
      const schedule = await autoScalingOrchestrator.recalculateSchedule();

      res.json({
        success: true,
        message: 'Schedule recalculado com sucesso!',
        schedule,
      });
    } catch (error: any) {
      console.error('[Auto-Scaling] Recalculate error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/auto-scaling/status
   * Get current Auto-Scaling status
   */
  app.get("/gpu/auto-scaling/status", async (req: Request, res: Response) => {
    try {
      const { autoScalingOrchestrator } = await import('../gpu-orchestration/auto-scaling-orchestrator');
      const status = await autoScalingOrchestrator.getStatus();

      res.json({
        success: true,
        ...status,
      });
    } catch (error: any) {
      console.error('[Auto-Scaling] Status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[GPU Routes] ✅ 30 GPU Pool routes registered successfully (includes 5 Kaggle CLI + 3 Colab + 4 deletion + 4 auto-scaling + 1 update routes)");
}
