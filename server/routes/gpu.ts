/**
 * GPU Workers API - Plug&Play GPU Pool Management
 * WITH INTELLIGENT QUOTA MANAGEMENT (uses only 70% of quota for safety!)
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../db";
import { gpuWorkers } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { quotaManager } from "../gpu/quota-manager";

export function registerGpuRoutes(app: Router) {
  const router = Router();

  /**
   * POST /api/gpu/workers/register
   * Register a new GPU worker (Colab, Kaggle, local, cloud)
   */
  router.post("/workers/register", async (req: Request, res: Response) => {
    try {
      const { tenantId, provider, accountId, ngrokUrl, capabilities } = req.body;

      const workerData = {
        tenantId: tenantId || 1,
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
  router.post("/workers/heartbeat", async (req: Request, res: Response) => {
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

      // Atualizar metadata com session runtime
      const updatedCapabilities = {
        ...capabilities,
        metadata: {
          ...metadata,
          sessionRuntimeHours: sessionRuntimeHours || 0,
          maxSessionHours: maxSessionHours || 12,
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
   * GET /api/gpu/workers
   * List all GPU workers
   */
  router.get("/workers", async (req: Request, res: Response) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string) || 1;

      const workers = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.tenantId, tenantId))
        .orderBy(desc(gpuWorkers.lastHealthCheck));

      res.json({ workers });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/quota/status
   * Get quota status for all workers
   */
  router.get("/quota/status", async (req: Request, res: Response) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string) || 1;
      const quotas = await quotaManager.getAllWorkerQuotas(tenantId);
      const health = await quotaManager.getPoolHealth(tenantId);

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
  router.post("/quota/record", async (req: Request, res: Response) => {
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
  router.post("/quota/reset", async (req: Request, res: Response) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string) || 1;
      await quotaManager.resetWeeklyQuotas(tenantId);

      res.json({ success: true, message: "Weekly quotas reset" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.use("/api/gpu", router);
}
