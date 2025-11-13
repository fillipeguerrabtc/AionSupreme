// ⚡ FASE 1 - Fail-fast ENV Check (DEVE SER PRIMEIRO IMPORT)
import "./scripts/check-env";

// ✅ FIX P0-5: Import logger early to activate console.log override (secret masking)
import "./services/logger-service";

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import "./workers/link-capture-worker"; // Auto-start worker
import { setupVite, serveStatic, log } from "./vite";
import { fileCleanup } from "./cleanup/file-cleanup";
import { namespaceGarbageCollector } from "./services/namespace-garbage-collector";
import { setupAuth } from "./replitAuth";
import { autoRecovery } from "./federated/auto-recovery";
import { queryMonitoringMiddleware } from "./middleware/query-monitoring";
import { applySecurity } from "./middleware/security";
import { withRequestId, log as logger } from "./utils/logger";

process.env.TZ = 'America/Sao_Paulo';
logger.info(`[Timezone] Configured to: ${process.env.TZ} (Brasília, Brazil)`);

const app = express();

// 🔒 FASE 1 - Segurança HTTP (Helmet + CORS)
applySecurity(app);

// 📝 FASE 1 - Logger com RequestId para rastreabilidade
app.use(withRequestId);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// ✅ FIX P0-10: Add request size limits to prevent DoS attacks
// 50MB limit for file uploads, 10MB for JSON payloads
app.use(express.json({
  limit: '10mb', // Max JSON payload size
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  limit: '10mb', // Max form data size
  extended: false 
}));

// Middleware de monitoramento de latência de queries
app.use(queryMonitoringMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // 🔄 PRODUCTION: Run database migrations (non-blocking background worker)
  // Ensures contentHash integrity and other schema updates
  const { runAllMigrations } = await import("./db/run-migrations");
  runAllMigrations().catch((error) => {
    logger.error('[Migration] Failed to run database migrations:', error);
    // Don't block server startup - migrations may need manual intervention
  });
  
  // Configurar Replit Auth antes das rotas
  await setupAuth(app);
  
  const server = await registerRoutes(app);

  // Initialize RBAC system (permissions, roles, admin user)
  const { seedRBAC } = await import("./seed-rbac");
  await seedRBAC();
  
  // 🔧 CRITICAL: Seed database BEFORE loading agents (tools must exist first)
  const { seedDatabase } = await import("./seed");
  await seedDatabase();
  
  // 🔍 AUTO-DISCOVERY: Sync GPU workers with Replit Secrets (2025 Enterprise Architecture)
  // Detects KAGGLE_USERNAME_1, KAGGLE_KEY_1, COLAB_EMAIL_1, COLAB_PASSWORD_1, etc
  // Creates persistent workers in DB (ZERO duplicates, incremental sync)
  logger.info('[Startup] Running GPU Auto-Discovery from Replit Secrets...');
  try {
    const { autoDiscoverGPUService } = await import("./gpu-orchestration/auto-discover-gpu-service");
    await autoDiscoverGPUService.syncGPUsWithSecrets();
    logger.info('[Startup] ✅ GPU Auto-Discovery completed successfully');
  } catch (error: any) {
    logger.error('[Startup] ⚠️ GPU Auto-Discovery failed (non-blocking):', error.message);
    // Non-blocking - system can work without GPUs
  }
  
  // 🧹 CLEANUP: Terminate orphaned sessions on startup (process restart recovery)
  // CRITICAL: Orphaned 'active'/'idle' sessions block new startups via partial unique index
  logger.info('[Startup] Cleaning up orphaned GPU sessions...');
  
  // Cleanup Kaggle sessions (On-Demand + 10min idle)
  try {
    const { kaggleOrchestrator } = await import("./gpu-orchestration/kaggle-orchestrator");
    await kaggleOrchestrator.cleanupOrphanedSessions();
    logger.info('[Startup] ✅ Kaggle orphaned sessions cleaned up');
  } catch (error: any) {
    logger.error('[Startup] ⚠️ Kaggle session cleanup failed (non-blocking):', error.message);
  }
  
  // Cleanup Colab sessions (Schedule-based, runs full 8.4h)
  try {
    const { colabOrchestrator } = await import("./gpu-orchestration/colab-orchestrator");
    await colabOrchestrator.cleanupOrphanedSessions();
    logger.info('[Startup] ✅ Colab orphaned sessions cleaned up');
  } catch (error: any) {
    logger.error('[Startup] ⚠️ Colab session cleanup failed (non-blocking):', error.message);
  }
  
  // 🔌 IDLE TIMEOUT: Start Kaggle idle shutdown monitoring (BAN AVOIDANCE!)
  // Monitors gpu_sessions.lastActivity and shuts down after 10min idle
  logger.info('[Startup] Starting GPU idle shutdown monitoring...');
  try {
    const { gpuIdleShutdownService } = await import("./services/gpu-idle-shutdown-service");
    gpuIdleShutdownService.start();
    logger.info('[Startup] ✅ GPU idle shutdown monitoring started (10min threshold)');
  } catch (error: any) {
    logger.error('[Startup] ⚠️ Idle shutdown service failed to start:', error.message);
  }
  
  // Carregar sistema multi-agente do banco de dados
  const { loadAgentsFromDatabase } = await import("./agent/loader");
  await loadAgentsFromDatabase(); // Modo single-tenant

  const { vectorStore } = await import("./rag/vector-store");
  await vectorStore.load();

  // Iniciar serviço de limpeza de arquivos (executa a cada hora para deletar arquivos expirados)
  fileCleanup.start();
  
  // Iniciar serviço de limpeza de retenção de tokens (executa mensalmente para aplicar retenção de 5 anos)
  fileCleanup.startTokenRetentionCleanup();
  
  // Iniciar scan semanal de duplicados na KB (executa todo domingo às 02:00 UTC)
  fileCleanup.startKBDeduplicationScan();
  
  // Iniciar Garbage Collection de namespaces/agentes órfãos (executa diariamente às 03:00 UTC / 00:00 Brasília)
  namespaceGarbageCollector.start();
  
  // Iniciar sistema de auto-recuperação de treinamento federado
  autoRecovery.start();
  
  // Iniciar monitor de heartbeat de GPU (detecta workers offline a cada 60s)
  const { startHeartbeatMonitor } = await import("./gpu/heartbeat-monitor");
  startHeartbeatMonitor();
  
  // Iniciar sistema de polling de health via Ngrok (atualiza lastHealthCheck a cada 60s)
  console.log("[INIT] 🔍 DEBUG: About to import ngrok-health-poller...");
  const { startNgrokHealthPoller } = await import("./gpu/ngrok-health-poller");
  console.log("[INIT] ✅ DEBUG: Ngrok poller imported successfully");
  startNgrokHealthPoller();
  console.log("[INIT] ✅ DEBUG: Ngrok poller started successfully");

  // 🔄 Iniciar background job de sync de quotas (Google Auth + Puppeteer scraping)
  // Executa a cada 10 minutos para manter quotas de Kaggle/Colab atualizadas
  logger.info('[Startup] Starting quota sync background job...');
  try {
    const { quotaBackgroundJob } = await import("./gpu-orchestration/quota-background-job");
    quotaBackgroundJob.start();
    logger.info('[Startup] ✅ Quota sync background job started (every 10 minutes)');
  } catch (error: any) {
    logger.error('[Startup] ⚠️ Quota sync background job failed to start:', error.message);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Importante: configurar Vite apenas em desenvolvimento e após
  // configurar todas as outras rotas para que a rota catch-all
  // não interfira com as outras rotas
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // SEMPRE servir a aplicação na porta especificada na variável de ambiente PORT
  // Outras portas são bloqueadas por firewall. Padrão é 5000 se não especificado.
  // Isto serve tanto a API quanto o cliente.
  // É a única porta que não é bloqueada por firewall.
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // 🛡️ ENTERPRISE: Store server reference for graceful shutdown
  let httpServer: ReturnType<typeof server.listen>;
  
  httpServer = server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // 🛡️ ENTERPRISE SHUTDOWN HANDLERS: Register AFTER server starts
    const { shutdownService } = await import('./services/shutdown-service');
    
    process.once('SIGTERM', () => {
      logger.warn('[Shutdown] SIGTERM received - starting graceful shutdown...');
      shutdownService.gracefulShutdown(httpServer, 0);
    });
    
    process.once('SIGINT', () => {
      logger.warn('[Shutdown] SIGINT received (Ctrl+C) - starting graceful shutdown...');
      shutdownService.gracefulShutdown(httpServer, 0);
    });
    
    process.once('uncaughtException', (error) => {
      console.error('[Shutdown] Uncaught exception:', error.message);
      console.error('[Shutdown] Stack:', error.stack);
      shutdownService.gracefulShutdown(httpServer, 1);
    });
    
    process.once('unhandledRejection', (reason, promise) => {
      console.error('[Shutdown] Unhandled rejection at:', promise);
      console.error('[Shutdown] Reason:', reason);
      shutdownService.gracefulShutdown(httpServer, 1);
    });
    
    // ⏰ Initialize PRODUCTION SCHEDULER SERVICE (cron jobs reais!)
    try {
      const { schedulerService } = await import('./services/scheduler-service');
      schedulerService.start();
      console.log('✅ Scheduler Service iniciado com cron jobs production-grade');
    } catch (err) {
      console.error('⚠️ Failed to initialize scheduler service:', err);
    }
    
    // 🔄 ENTERPRISE RECOVERY: Detect and recover orphaned jobs (MUST run BEFORE auto-evolution)
    try {
      const { recoveryService } = await import('./services/recovery-service');
      await recoveryService.recoverOrphanedJobs();
    } catch (err) {
      console.error('⚠️ Failed to run recovery service:', err);
    }
    
    // 🧠 Initialize Auto-Evolution System
    try {
      const { initAutoEvolution } = await import('./training/init-auto-evolution');
      initAutoEvolution();
    } catch (err) {
      console.error('⚠️ Failed to initialize auto-evolution:', err);
    }
    
    // ✅ P1.3: Backfill provider column for existing billing records (runs BEFORE billing syncs)
    try {
      const { billingBackfillService } = await import('./services/billing-backfill-service');
      await billingBackfillService.runBackfill();
    } catch (err) {
      console.error('⚠️ Failed to run billing backfill:', err);
    }
    
    // 💰 Initialize Billing Sync Services (fetch REAL costs from provider APIs)
    try {
      const { openAIBillingSync } = await import('./services/openai-billing-sync');
      const { openRouterBillingSync } = await import('./services/openrouter-billing-sync');
      const { geminiBillingSync } = await import('./services/gemini-billing-sync');
      
      openAIBillingSync.startAutoSync();
      openRouterBillingSync.startAutoSync();
      geminiBillingSync.startAutoSync();
    } catch (err: any) {
      console.error('⚠️ Failed to initialize billing sync:');
      console.error('Error message:', err?.message || 'No message');
      console.error('Error stack:', err?.stack || 'No stack');
      console.error('Full error object:', JSON.stringify(err, null, 2));
    }
    
    // 🔒 Initialize GPU Watchdog Service (enforces 70% quota limits + auto-shutdown after restarts)
    try {
      const { GpuWatchdogService } = await import('./services/gpu-watchdog-service');
      const { OrchestratorService } = await import('./gpu-orchestration/orchestrator-service');
      
      const watchdog = await GpuWatchdogService.create();
      const orchestrator = new OrchestratorService();
      
      // Register unified shutdown callback for all providers (Colab, Kaggle)
      watchdog.setShutdownCallback(async (sessionId: number, workerId: number, provider: string) => {
        console.log(`[Watchdog] Force stopping ${provider} worker ${workerId} (session ${sessionId}) - quota limit reached`);
        await orchestrator.stopGPU(workerId);
      });
      
      watchdog.start();
      console.log('✅ GPU Watchdog Service started (70% quota enforcement + durable auto-shutdown)');
    } catch (err: any) {
      console.error('⚠️ Failed to initialize GPU watchdog service:');
      console.error('Error message:', err?.message || 'No message');
      console.error('Error stack:', err?.stack || 'No stack');
    }
  });
})();
