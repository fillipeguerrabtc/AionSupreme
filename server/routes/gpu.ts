/**
 * GPU Workers API - Plug&Play GPU Pool Management
 * WITH INTELLIGENT QUOTA MANAGEMENT (uses only 70% of quota for safety!)
 */

import type { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db";
import { gpuWorkers } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { quotaManager } from "../gpu/quota-manager";

export function registerGpuRoutes(app: Router) {
  console.log("[GPU Routes] Registering GPU Pool API routes...");

  /**
   * POST /api/gpu/register
   * Register a new GPU worker from Colab/Kaggle notebook
   */
  app.post("/gpu/register", async (req: Request, res: Response) => {
    console.log("[GPU Register] ✅ Worker registration request:", req.body);
    try {
      const { 
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
      };

      const [worker] = await db.insert(gpuWorkers).values(workerData).returning();

      console.log(`[GPU Pool] 🎮 Worker online: ${name} (ID: ${worker.id}, ${gpuType})`);

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
   * POST /api/gpu/workers/heartbeat
   * Worker sends heartbeat to stay online + runtime info
   */
  app.post("/gpu/workers/heartbeat", async (req: Request, res: Response) => {
    try {
      const { workerId, sessionRuntimeHours, maxSessionHours, status } = req.body;

      // Se está desligando (status: "offline"), apenas atualiza status
      if (status === "offline") {
        await db
          .update(gpuWorkers)
          .set({
            status: "offline",
            updatedAt: new Date(),
          })
          .where(eq(gpuWorkers.id, parseInt(workerId)));
        
        console.log(`[GPU Heartbeat] Worker ${workerId} going offline`);
        return res.json({ success: true });
      }

      // Buscar worker atual para atualizar capabilities
      const [worker] = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.id, parseInt(workerId)))
        .limit(1);

      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }

      const capabilities = (worker.capabilities as any) || {};
      const metadata = capabilities.metadata || {};

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
            `(total week: ${usedHoursThisWeek.toFixed(2)}h)`
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

      await db
        .update(gpuWorkers)
        .set({
          lastHealthCheck: new Date(),
          status: "healthy",
          capabilities: updatedCapabilities,
          updatedAt: new Date(),
        })
        .where(eq(gpuWorkers.id, parseInt(workerId)));

      res.json({ success: true });
    } catch (error: any) {
      console.error("[GPU Heartbeat] Error:", error);
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
   */
  app.get("/gpu/quota/status", async (req: Request, res: Response) => {
    try {
      const quotas = await quotaManager.getAllWorkerQuotas();
      const health = await quotaManager.getPoolHealth();

      res.json({ quotas, health });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/quota/record
   * Record worker usage after job completion
   * Call this after every inference/training job!
   */
  app.post("/gpu/quota/record", async (req: Request, res: Response) => {
    try {
      const { workerId, durationMinutes } = req.body;

      if (!workerId || !durationMinutes) {
        return res.status(400).json({ error: "workerId and durationMinutes required" });
      }

      await quotaManager.recordUsage(parseInt(workerId), parseFloat(durationMinutes));

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/gpu/quota/reset
   * Manually reset weekly quotas (runs automatically every Monday)
   */
  app.post("/gpu/quota/reset", async (req: Request, res: Response) => {
    try {
      await quotaManager.resetWeeklyQuotas();

      res.json({ success: true, message: "Weekly quotas reset" });
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
   */
  app.post("/gpu/kaggle/provision", async (req: Request, res: Response) => {
    try {
      const { username, key, notebookName } = req.body;

      if (!username || !key) {
        return res.status(400).json({ 
          error: "Username and API key are required. Get your API key at kaggle.com/settings → API → Create New Token" 
        });
      }

      console.log(`[Kaggle Provision] 🚀 Starting provisioning for ${username}...`);
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
   */
  app.post("/gpu/colab/provision", async (req: Request, res: Response) => {
    try {
      const { email, password, notebookUrl } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "email and password required" });
      }

      console.log(`[Colab Provision] Starting Puppeteer automation for ${email}...`);

      const { colabOrchestrator } = await import('../services/colab-orchestrator');
      
      const result = await colabOrchestrator.provision({
        credentials: { email, password },
        notebookUrl,
      });

      if (result.status === 'failed') {
        return res.status(500).json({ error: result.message });
      }

      res.json({
        success: true,
        notebookUrl: result.notebookUrl,
        sessionId: result.sessionId,
        status: result.status,
        message: result.message,
      });
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
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId required" });
      }

      console.log(`[Colab Stop] Stopping session ${sessionId}...`);

      const { colabOrchestrator } = await import('../services/colab-orchestrator');
      await colabOrchestrator.cleanup();

      res.json({
        success: true,
        message: `Colab session ${sessionId} stopped`,
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
