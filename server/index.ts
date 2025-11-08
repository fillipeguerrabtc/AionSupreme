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
  // Configurar Replit Auth antes das rotas
  await setupAuth(app);
  
  const server = await registerRoutes(app);

  // Initialize RBAC system (permissions, roles, admin user)
  const { seedRBAC } = await import("./seed-rbac");
  await seedRBAC();
  
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
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, async () => {
    log(`serving on port ${port}`);
    
    // ⏰ Initialize PRODUCTION SCHEDULER SERVICE (cron jobs reais!)
    try {
      const { schedulerService } = await import('./services/scheduler-service');
      schedulerService.start();
      console.log('✅ Scheduler Service iniciado com cron jobs production-grade');
    } catch (err) {
      console.error('⚠️ Failed to initialize scheduler service:', err);
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
  });
})();

// 💾 FASE 1 - Salvar Vector Store snapshot no shutdown (SINGLETON - fora do async block)
let shutdownHandlersRegistered = false;

async function gracefulShutdown(signal: string) {
  const { vectorStore } = await import("./rag/vector-store");
  const { schedulerService } = await import("./services/scheduler-service");
  const { log } = await import("./utils/logger");
  
  console.log(`[Shutdown] Recebido sinal ${signal}, parando schedulers...`);
  
  // Parar schedulers primeiro
  schedulerService.stop();
  
  // Salvar vector store
  console.log('[Shutdown] Salvando snapshot do vector store...');
  await vectorStore.save();
  
  console.log('[Shutdown] Shutdown concluído, encerrando processo');
  process.exit(0);
}

if (!shutdownHandlersRegistered) {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  shutdownHandlersRegistered = true;
}
