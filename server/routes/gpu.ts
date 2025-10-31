/**
 * GPU Workers API - Plug&Play GPU Pool Management
 * WITH INTELLIGENT QUOTA MANAGEMENT (uses only 70% of quota for safety!)
 */

import type { Express } from "express";
import type { Request, Response } from "express";
import { db } from "../db";
import { gpuWorkers } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { quotaManager } from "../gpu/quota-manager";

export function registerGpuRoutes(app: Express) {
  console.log("[GPU Routes] Registering GPU Pool API routes...");

  /**
   * POST /api/gpu/workers/register
   * Register a new GPU worker (Colab, Kaggle, local, cloud)
   */
  app.post("/api/gpu/workers/register", async (req: Request, res: Response) => {
    console.log("[GPU Register] ✅ REQUEST RECEIVED:", req.method, req.path, req.body);
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
  app.post("/api/gpu/workers/heartbeat", async (req: Request, res: Response) => {
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

      // Atualizar metadata com session runtime + weekly usage
      const updatedCapabilities = {
        ...capabilities,
        metadata: {
          ...metadata,
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
   * Dashboard status - reads from database WITH HEARTBEAT TIMEOUT DETECTION
   */
  app.get("/api/gpu/status", async (req: Request, res: Response) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string) || 1;

      const workers = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.tenantId, tenantId))
        .orderBy(desc(gpuWorkers.lastHealthCheck));

      // CRITICAL: Detect offline workers based on heartbeat timeout
      const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes without heartbeat = offline
      const now = new Date();

      const workersWithStatus = await Promise.all(
        workers.map(async (worker) => {
          const timeSinceLastHeartbeat = now.getTime() - new Date(worker.lastHealthCheck!).getTime();
          
          // Auto-detect offline workers (no heartbeat for 3+ minutes)
          if (worker.status === "healthy" && timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
            console.log(`[GPU Status] Worker ${worker.id} offline (no heartbeat for ${Math.floor(timeSinceLastHeartbeat / 1000)}s)`);
            
            // Update status to offline in database
            await db
              .update(gpuWorkers)
              .set({ status: "offline", updatedAt: new Date() })
              .where(eq(gpuWorkers.id, worker.id));
            
            return { ...worker, status: "offline" as const };
          }
          
          return worker;
        })
      );

      const total = workersWithStatus.length;
      const healthy = workersWithStatus.filter((w) => w.status === "healthy").length;
      const unhealthy = workersWithStatus.filter((w) => w.status === "unhealthy").length;
      const offline = workersWithStatus.filter((w) => w.status === "offline" || w.status === "pending").length;

      const totalRequests = 0;
      const avgLatency = 0;

      res.json({
        total,
        healthy,
        unhealthy,
        offline,
        totalRequests,
        avgLatency,
        workers: workersWithStatus,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu/workers
   * List all GPU workers
   */
  app.get("/api/gpu/workers", async (req: Request, res: Response) => {
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
   * GET /api/gpu/workers/:id
   * Get specific worker details
   */
  app.get("/api/gpu/workers/:id", async (req: Request, res: Response) => {
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
  app.get("/api/gpu/quota/status", async (req: Request, res: Response) => {
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
  app.post("/api/gpu/quota/record", async (req: Request, res: Response) => {
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
  app.post("/api/gpu/quota/reset", async (req: Request, res: Response) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string) || 1;
      await quotaManager.resetWeeklyQuotas(tenantId);

      res.json({ success: true, message: "Weekly quotas reset" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log("[GPU Routes] ✅ 8 GPU Pool routes registered successfully");
}
