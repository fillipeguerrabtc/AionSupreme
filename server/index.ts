import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { fileCleanup } from "./cleanup/file-cleanup";
import { setupAuth } from "./replitAuth";
import { autoRecovery } from "./federated/auto-recovery";
import { queryMonitoringMiddleware } from "./middleware/query-monitoring";

process.env.TZ = 'America/Sao_Paulo';
console.log(`[Timezone] Configured to: ${process.env.TZ} (Brasília, Brazil)`);

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

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

  // Iniciar serviço de limpeza de arquivos (executa a cada hora para deletar arquivos expirados)
  fileCleanup.start();
  
  // Iniciar serviço de limpeza de retenção de tokens (executa mensalmente para aplicar retenção de 5 anos)
  fileCleanup.startTokenRetentionCleanup();
  
  // Iniciar scan semanal de duplicados na KB (executa todo domingo às 02:00 UTC)
  fileCleanup.startKBDeduplicationScan();
  
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
    
    // 🧠 Initialize Auto-Evolution System
    try {
      const { initAutoEvolution } = await import('./training/init-auto-evolution');
      initAutoEvolution();
    } catch (err) {
      console.error('⚠️ Failed to initialize auto-evolution:', err);
    }
  });
})();
