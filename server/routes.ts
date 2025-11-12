import type { Express, Router } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractTextContent } from "./utils/message-helpers";
import { llmClient } from "./model/llm-client";
import { freeLLMProviders } from "./model/free-llm-providers";
import { gpuOrchestrator } from "./model/gpu-orchestrator";
import { trainingDataCollector } from "./training/data-collector";
import { ragService } from "./rag/vector-store";
import { reactEngine } from "./agent/react-engine";
import { agentTools } from "./agent/tools";
import { enforcementPipeline } from "./policy/enforcement-pipeline";
import { autoFallback } from "./policy/auto-fallback";
import { fileProcessor } from "./multimodal/file-processor";
import { knowledgeIndexer } from "./rag/knowledge-indexer";
import { generateWithPriority } from "./llm/priority-orchestrator";
import { hierarchicalPlanner } from "./agent/hierarchical-planner";
import * as tokenTracker from "./monitoring/token-tracker";
// NOTE: seedDatabase moved to index.ts to run BEFORE agent loader
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { sendSuccess, sendValidationError, sendServerError, responseEnvelope } from "./utils/response";
import { auditMiddleware } from "./middleware/audit";
import log from "./utils/logger";
import { getErrorMessage } from "./utils/error-helpers";
import { rebuildService } from "./kb/rebuild-service";
import { exportPrometheusMetrics } from "./metrics/exporter";
import { metricsCollector } from "./metrics/collector";
import { queryMonitor } from "./services/query-monitor";
import { usageTracker } from "./services/usage-tracker";
import { imageGenerator } from "./generation/image-generator";
import { videoGenerator } from "./generation/video-generator";
import multer from "multer";
import axios from "axios";
import fs from "fs/promises";
import * as fsSync from "fs";
import path from "path";
import express from "express";
import { optionalAuth } from "./replitAuth";
import { requireAuth, requireAdmin, requirePermission, getUserId } from "./middleware/auth";
import { i18nMiddleware } from "./i18n/middleware"; // SECURITY FIX: Protect admin routes
import { csrfProtection } from "./middleware/csrf"; // 🔒 CSRF Protection for admin routes
import { DatasetProcessor } from "./training/datasets/dataset-processor";
import { DatasetValidator } from "./training/datasets/dataset-validator";
import { db } from "./db";
import { eq, and, gte, sql } from "drizzle-orm";
import { trainingDataCollection, datasets, trainingJobs, uploadedAdapters, behaviorConfigSchema } from "../shared/schema";
import { lifecyclePolicyUpdateSchema } from "./validation/lifecycle-policy-schema";
import { idParamSchema, jobIdParamSchema, jobIdChunkIndexSchema, docIdAttachmentIndexSchema, jobIdWorkerIdStepSchema, jobIdStepSchema, validateParams, validateQuery, validateBody } from "./validation/route-params"; // ✅ FIX P0-2
import { z } from "zod"; // ✅ FIX P0-2: Import z for inline schemas
import { registerAgentRoutes } from "./routes/agents";
import { registerAgentRelationshipRoutes } from "./routes/agent-relationships";
import { registerCurationRoutes } from "./routes/curation";
import { registerKbPromoteRoutes } from "./routes/kb_promote";
import { registerNamespaceRoutes } from "./routes/namespaces";
import { registerGpuRoutes } from "./routes/gpu";
import { registerVisionRoutes } from "./routes/vision";
import { registerKbImagesRoutes } from "./routes/kb-images";
import { registerQueryMetricsRoutes } from "./routes/query-metrics";
import { registerKbAnalyticsRoutes } from "./routes/kb-analytics";
import { registerTelemetryRoutes } from "./routes/telemetry";
import { registerUserRoutes } from "./routes/users";
import { registerPermissionsRoutes } from "./routes/permissions";
import { registerMetaLearningRoutes } from "./routes/meta-learning";
import { registerBackupRoutes } from "./routes/backup";
import { registerAlertRoutes } from "./routes/alerts";
import cascadeRoutes from "./routes/cascade";
import autoApprovalRoutes from "./routes/auto-approval";

// ============================================================================
// TYPE DEFINITIONS - Eliminating 'as any' casts
// ============================================================================

interface HealthServiceStatus {
  status: string;
  [key: string]: unknown;
}

interface HealthCheckServices {
  database?: HealthServiceStatus;
  freeAPIs?: HealthServiceStatus;
  openai?: HealthServiceStatus;
  gpuPool?: HealthServiceStatus;
}

// ✅ FIX P0-10: Strict multer limits to prevent DoS (max 50MB total per request)
const upload = multer({ 
  dest: "/tmp/uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per individual file
    files: 5, // Max 5 files per request (5 × 10MB = 50MB total max)
    fields: 20, // Max 20 non-file fields
    fieldSize: 1 * 1024 * 1024, // Max 1MB per field value
  }
});

// Dedicated multer config for adapter uploads (larger files - up to 50MB)
const adapterUpload = multer({
  dest: "/tmp/adapters/",
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max for PEFT adapters
  },
  fileFilter: (req, file, cb) => {
    // Only accept .tar.gz files
    if (file.originalname.endsWith('.tar.gz') || file.mimetype === 'application/gzip') {
      cb(null, true);
    } else {
      cb(new Error('Only .tar.gz files are allowed'));
    }
  }
});

const startupTime = Date.now();

// ============================================================================
// HELPER: Auto-detect language from message content
// ============================================================================
function autoDetectLanguage(message: string): "pt-BR" | "en-US" | "es-ES" {
  const msg = message.toLowerCase();
  
  // Portuguese strong indicators (including accents and common words)
  const ptStrongIndicators = /(olá|você|está|não|sim|obrigad|português|tchau|tudo bem|bom dia|boa tarde|boa noite)/i;
  const ptIndicators = /\b(é|muito|como|que|para|com|por|seu|sua|ele|ela|fazer|ter|ser|quando|onde|porque|qual|quem|algum|nenhum)\b/gi;
  
  // Spanish strong indicators
  const esStrongIndicators = /(hola|usted|está|sí|gracias|español|adiós|buenos días|buenas tardes|buenas noches)/i;
  const esIndicators = /\b(es|muy|cómo|qué|para|con|por|su|él|ella|hacer|tener|ser|cuando|donde|porque|cual|quien|algún|ningún)\b/gi;
  
  // English strong indicators
  const enStrongIndicators = /(hello|you|are|yes|no|thanks|thank you|goodbye|good morning|good afternoon|good evening)/i;
  const enIndicators = /\b(is|very|how|what|for|with|by|his|her|him|do|have|be|when|where|because|which|who|any|some|none|the|a|an|this|that|these|those|can|could|would|should|will|shall|may|might|must|tell|me|about|in|on|at|to|from|of|please|my|your|our|their|its|was|were|been|being|has|had|having|am)\b/gi;
  
  // Check strong indicators first (high confidence)
  if (ptStrongIndicators.test(message)) return "pt-BR";
  if (esStrongIndicators.test(message)) return "es-ES";
  if (enStrongIndicators.test(message)) return "en-US";
  
  // Count weaker indicators
  const ptCount = (msg.match(ptIndicators) || []).length;
  const esCount = (msg.match(esIndicators) || []).length;
  const enCount = (msg.match(enIndicators) || []).length;
  
  // Return language with most matches (with threshold of 1 or more)
  if (ptCount > esCount && ptCount > enCount && ptCount >= 1) return "pt-BR";
  if (esCount > ptCount && esCount > enCount && esCount >= 1) return "es-ES";
  if (enCount > ptCount && enCount > esCount && enCount >= 1) return "en-US";
  
  // Default to ENGLISH (not PT) if no clear winner - more universal
  console.log(`[Language Detection] No clear language detected, defaulting to en-US (pt:${ptCount}, es:${esCount}, en:${enCount})`);
  return "en-US";
}

export function registerRoutes(app: Express): Server {
  // Aplicar middleware de auditoria globalmente (leve)
  app.use(auditMiddleware);
  
  // Aplicar I18N middleware globalmente
  app.use(i18nMiddleware);
  
  // Aplicar rate limiting APENAS para rotas API (não assets estáticos)
  app.use("/api", rateLimitMiddleware);
  
  // PRODUCTION-READY: Auth is handled per-route using optionalAuth or requireAuth
  // This allows fine-grained control - chat works without auth, admin requires auth
  
  // NOTE: seedDatabase moved to index.ts BEFORE agent loader (correct initialization order)

  // ========================================
  // ADMIN SUB-ROUTES - PROTECTED WITH requireAdmin
  // ========================================
  // CRITICAL SECURITY: All admin management routes require admin role
  // These modules handle: agents, curation, GPU, vision, KB, namespaces, telemetry
  
  // CRITICAL FIX: Admin routes must use /api/admin prefix to NOT block public routes
  // Previously mounted on /api which blocked ALL /api routes including /api/conversations
  // Now correctly isolated to /api/admin/* only
  const adminSubRouter = express.Router();
  adminSubRouter.use(csrfProtection); // 🔒 CSRF protection - require X-Requested-With header for state-changing requests
  adminSubRouter.use(requireAdmin); // All routes under this router require admin role
  
  // Registrar rotas de gerenciamento de usuários
  registerUserRoutes(adminSubRouter);
  
  // Registrar rotas de RBAC (Roles & Permissions)
  registerPermissionsRoutes(adminSubRouter);
  
  // Registrar rotas multi-agente
  registerAgentRoutes(adminSubRouter);
  registerAgentRelationshipRoutes(adminSubRouter);
  
  // Registrar rotas de curadoria (HITL)
  registerCurationRoutes(adminSubRouter);
  registerKbPromoteRoutes(adminSubRouter);
  
  // Registrar rotas de gerenciamento de namespaces
  registerNamespaceRoutes(adminSubRouter);
  
  // Registrar rotas do GPU Pool (workers GPU Plug&Play)
  registerGpuRoutes(adminSubRouter);
  
  // Registrar rotas do Vision System (compreensão multimodal de imagens)
  registerVisionRoutes(adminSubRouter);
  
  // Registrar rotas de Meta-Learning (autonomous learning system)
  registerMetaLearningRoutes(adminSubRouter as unknown as Express);
  
  // Registrar rotas de Backup & Recovery (enterprise database backup/restore system)
  registerBackupRoutes(adminSubRouter);
  
  // Registrar rotas de Alertas (webhook/email notifications system)
  registerAlertRoutes(adminSubRouter);
  
  // Registrar rotas de KB Images (busca semântica de imagens na base de conhecimento)
  registerKbImagesRoutes(adminSubRouter);
  
  // Registrar rotas de métricas de queries (monitoramento de performance)
  registerQueryMetricsRoutes(adminSubRouter);
  
  // Registrar rotas de KB & Chat Analytics (análise de uso e eficiência)
  registerKbAnalyticsRoutes(adminSubRouter);
  
  // Registrar rotas de telemetria (analytics de agentes e namespaces)
  registerTelemetryRoutes(adminSubRouter);
  
  // Registrar rotas de Cascade Data Lineage (enterprise deletion tracking)
  adminSubRouter.use("/cascade", cascadeRoutes);
  
  // Registrar rotas de Auto-Approval Configuration (curation system)
  adminSubRouter.use("/auto-approval", autoApprovalRoutes);
  
  // Mount admin sub-router on /api/admin (NOT /api to avoid blocking public routes)
  app.use("/api/admin", adminSubRouter);

  // ========================================
  // ENDPOINTS DE ÍCONES CUSTOMIZADOS
  // ========================================
  
  // POST /api/icons/upload - Upload de ícone customizado
  app.post("/api/icons/upload", requireAuth, upload.single("icon"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: req.t('upload.no_file') });
      }

      const file = req.file;
      
      // SECURITY: Validate file using magic bytes (cannot be spoofed)
      const { validateIconUpload } = await import("./utils/file-validation");
      const validation = await validateIconUpload(file.path);
      
      if (!validation.valid) {
        await fs.unlink(file.path);
        return res.status(400).json({ error: validation.error });
      }

      // ✅ FIX P0: Usar KB_STORAGE permanente em vez de attached_assets (temporário)
      const { KB_STORAGE } = await import("./config/storage-paths");
      const iconsDir = KB_STORAGE.CUSTOM_ICONS;

      // Gerar nome único para o arquivo
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      const filename = `icon_${timestamp}${ext}`;
      const destPath = path.join(iconsDir, filename);

      // Mover arquivo do temp para destino final
      await fs.rename(file.path, destPath);

      // Retornar URL pública do ícone (servir kb_storage/ via static)
      const publicUrl = `/kb_storage/media/custom_icons/${filename}`;
      
      res.json({ 
        success: true,
        url: publicUrl,
        filename 
      });
    } catch (error: unknown) {
      console.error("[Icon Upload] Erro:", error);
      
      // Limpar arquivo temporário em caso de erro
      if (req.file?.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          console.error("[Icon Upload] Erro ao limpar temp file:", cleanupError);
        }
      }
      
      res.status(500).json({ error: req.t('upload.processing_failed') });
    }
  });

  // ========================================
  // ENDPOINTS DE INGESTÃO DE DADOS (Links + Chats)
  // ========================================
  
  // POST /api/learn/ingest-link - Ingerir dados de URL para treino
  // 📦 FASE 2 - B2: Exemplo de HTTP Response Envelope
  app.post("/api/learn/ingest-link", requireAuth, async (req, res) => {
    try {
      const { linkIngestionService } = await import("./learn/link-ingestion");
      const { url, userId } = req.body;

      if (!url) {
        return sendValidationError(res, req.t('kb.url_required'));
      }

      const result = await linkIngestionService.ingestFromLink(url, userId);

      if (!result.success) {
        return sendValidationError(res, result.error || req.t('kb.ingest_failed'));
      }

      sendSuccess(res, {
        title: result.title,
        wordCount: result.wordCount,
        curationId: result.curationId,
        message: req.t('kb.submitted_for_curation'),
      });
    } catch (error: unknown) {
      console.error("[Link Ingestion] Erro:", error);
      sendServerError(res, getErrorMessage(error));
    }
  });

  // POST /api/learn/ingest-batch - Ingerir múltiplas URLs
  // 📦 FASE 2 - B2: Exemplo de HTTP Response Envelope
  app.post("/api/learn/ingest-batch", requireAuth, async (req, res) => {
    try {
      const { linkIngestionService } = await import("./learn/link-ingestion");
      const { urls, userId } = req.body;

      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return sendValidationError(res, req.t('kb.urls_array_required'));
      }

      const results = await linkIngestionService.ingestBatch(urls, userId);

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      sendSuccess(res, {
        total: results.length,
        successful,
        failed,
        results,
      });
    } catch (error: unknown) {
      console.error("[Batch Ingestion] Erro:", error);
      sendServerError(res, getErrorMessage(error));
    }
  });

  // POST /api/learn/collect-chats - Coletar conversas de alta qualidade
  app.post("/api/learn/collect-chats", requireAuth, async (req, res) => {
    try {
      const { chatIngestionService } = await import("./learn/chat-ingestion");
      const { limit = 50, autoSubmit = true } = req.body;

      const collected = await chatIngestionService.collectHighQualityConversations({
        limit,
        autoSubmit,
      });

      res.json({
        success: true,
        collected,
        message: req.t('chat.conversations_sent_to_curation', { collected }),
      });
    } catch (error: unknown) {
      console.error("[Chat Collection] Erro:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========================================
  // ENDPOINTS DE DOWNLOAD DE DATASET
  // ========================================
  
  // Download dataset completo
  app.get("/api/datasets/:id/download", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters to prevent SQL injection
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: datasetId } = params;
      
      const [dataset] = await db.select().from(datasets).where(eq(datasets.id, datasetId)).limit(1);
      
      if (!dataset) {
        return res.status(404).json({ error: req.t('dataset.not_found') });
      }
      
      // Resolver caminho absoluto (sendFile exige caminho absoluto)
      const { resolve } = await import("path");
      const absolutePath = resolve(dataset.storagePath);
      
      // Servir arquivo JSONL
      res.setHeader("Content-Type", "application/jsonl");
      res.setHeader("Content-Disposition", `attachment; filename="${dataset.originalFilename}"`);
      res.sendFile(absolutePath);
    } catch (error: unknown) {
      console.error("[Dataset Download] Erro:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Download de CHUNK específico (Federated Learning)
  // GET /api/datasets/chunks/:jobId/:chunkIndex/download
  app.get("/api/datasets/chunks/:jobId/:chunkIndex/download", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(jobIdChunkIndexSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { jobId, chunkIndex } = params;
      
      const { datasetSplitter } = await import("./federated/dataset-splitter");
      const { resolve } = await import("path");

      // Obter caminho do chunk
      const chunkPath = datasetSplitter.getChunkPath(jobId, chunkIndex);
      const absolutePath = resolve(chunkPath);

      // Enviar chunk
      res.setHeader("Content-Type", "application/jsonl");
      res.setHeader("Content-Disposition", `attachment; filename="chunk-${chunkIndex}.jsonl"`);
      res.sendFile(absolutePath);
    } catch (error: unknown) {
      console.error("[Chunk Download] Erro:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========================================
  // ENDPOINTS DE CHECKPOINT DOWNLOAD (Federated Learning)
  // ========================================
  
  // Download de checkpoint global (modelo agregado via FedAvg)
  // GET /api/training/jobs/:jobId/checkpoint
  app.get("/api/training/jobs/:jobId/checkpoint", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(jobIdParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { jobId } = params;
      
      const { resolve } = await import("path");

      // Buscar job para pegar caminho do checkpoint
      const job = await db.query.trainingJobs.findFirst({
        where: eq(trainingJobs.id, jobId),
      });

      if (!job) {
        return res.status(404).json({ error: req.t('training.job_not_found') });
      }

      if (!job.latestCheckpoint) {
        return res.status(404).json({ 
          error: req.t('training.checkpoint_not_ready')
        });
      }

      // Resolver caminho absoluto
      const absolutePath = resolve(job.latestCheckpoint);

      // Servir arquivo de checkpoint
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="checkpoint-job-${jobId}.safetensors"`);
      res.sendFile(absolutePath);
    } catch (error: unknown) {
      console.error("[Checkpoint Download] Erro:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========================================
  // ENDPOINTS DE HEALTH CHECK (para implantação multi-cloud)
  // ========================================
  
  // GET /health - Health check básico (rápido, para load balancers)
  app.get("/health", async (req, res) => {
    try {
      // Ping rápido no banco de dados
      const { pool } = await import("./db");
      await pool.query("SELECT 1");
      
      res.status(200).json({
        status: "saudável",
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startupTime) / 1000),
      });
    } catch (error: unknown) {
      res.status(503).json({
        status: "indisponível",
        error: getErrorMessage(error),
        timestamp: new Date().toISOString(),
      });
    }
  });
  
  // GET /health/detailed - Health check detalhado (para monitoramento)
  app.get("/health/detailed", async (req, res) => {
    const services: HealthCheckServices = {};
    const checks: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startupTime) / 1000),
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
      services,
    };
    
    let allHealthy = true;
    
    // Verificação do banco de dados
    try {
      const { pool } = await import("./db");
      const start = Date.now();
      await pool.query("SELECT 1");
      const latency = Date.now() - start;
      
      services.database = {
        status: "saudável",
        latency: `${latency}ms`,
      };
    } catch (error: unknown) {
      allHealthy = false;
      services.database = {
        status: "indisponível",
        error: getErrorMessage(error),
      };
    }
    
    // Verificação das APIs gratuitas
    try {
      const apiStatus = freeLLMProviders.getHealthStatus();
      services.freeAPIs = {
        status: "saudável",
        providers: apiStatus,
      };
    } catch (error: unknown) {
      services.freeAPIs = {
        status: "degradado",
        error: getErrorMessage(error),
      };
    }
    
    // Verificação do OpenAI
    try {
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      services.openai = {
        status: hasOpenAI ? "healthy" : "not_configured",
        configured: hasOpenAI,
      };
    } catch (error: unknown) {
      services.openai = {
        status: "unknown",
        error: getErrorMessage(error),
      };
    }
    
    // Verificação do GPU Pool
    try {
      const gpuStatus = gpuOrchestrator.getStatus();
      const activeWorkers = gpuStatus.endpoints.filter(e => e.status === 'online').length;
      const totalWorkers = gpuStatus.endpoints.length;
      services.gpuPool = {
        status: activeWorkers > 0 ? "healthy" : "no_workers",
        activeWorkers,
        totalWorkers,
      };
    } catch (error: unknown) {
      services.gpuPool = {
        status: "degraded",
        error: getErrorMessage(error),
      };
    }
    
    checks.status = allHealthy ? "healthy" : "degraded";
    res.status(allHealthy ? 200 : 503).json(checks);
  });
  
  // GET /health/ready - Readiness probe (para Kubernetes/Cloud Run)
  app.get("/health/ready", async (req, res) => {
    try {
      const { pool } = await import("./db");
      await pool.query("SELECT 1");
      res.status(200).json({ ready: true });
    } catch (error: unknown) {
      res.status(503).json({ ready: false, error: getErrorMessage(error) });
    }
  });
  
  // GET /health/live - Liveness probe (para Kubernetes/Cloud Run)
  app.get("/health/live", (req, res) => {
    res.status(200).json({ alive: true });
  });
  
  // GET /health/multi-cloud - Status multi-cloud (para monitoramento)
  app.get("/health/multi-cloud", (req, res) => {
    try {
      const { multiCloudSync } = require("../deployment/multi-cloud-sync");
      const status = multiCloudSync.getStatus();
      res.status(200).json(status);
    } catch (error: unknown) {
      res.status(503).json({
        error: req.t('health.multi_cloud_sync_not_enabled'),
        message: getErrorMessage(error),
      });
    }
  });

  // POST /api/v1/chat/completions
  // 🎯 SISTEMA MULTI-AGENTE com roteamento automático
  // Prioridade: Multi-Agent (MoE) → KB → Free APIs → Web → OpenAI
  app.post("/api/v1/chat/completions", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { messages, useMultiAgent = true, language, conversationId } = req.body; // Accept optional conversationId
      
      console.log(`[Chat API] Recebidas ${messages.length} mensagens no histórico`);
      console.log(`[Chat API] Multi-Agent Mode: ${useMultiAgent ? 'ENABLED' : 'DISABLED'}`);
      console.log(`[Chat API] ConversationId: ${conversationId || 'null (ephemeral)'}`);
      console.log(`[Chat API] Últimas 3 mensagens:`, messages.slice(-3).map((m: any) => ({
        role: m.role,
        preview: m.content?.substring(0, 50)
      })));
      
      // Registrar métricas da requisição
      metricsCollector.recordRequest();
      
      // Obter última mensagem do usuário (normalizada para string)
      const lastUserContent = messages[messages.length - 1]?.content || '';
      const lastUserMessage = extractTextContent(lastUserContent);
      
      // 🔥 FIX: Persist user message BEFORE generation (if conversationId provided)
      if (conversationId && messages.length > 0) {
        try {
          await storage.createMessage({
            conversationId,
            role: "user",
            content: lastUserMessage,
          });
          console.log(`[Chat API] 💾 User message persisted to conversation ${conversationId}`);
        } catch (persistError: unknown) {
          console.error(`[Chat API] Failed to persist user message:`, getErrorMessage(persistError));
        }
      }
      
      // ✅ FIX BUG #2: Use frontend-detected language or auto-detect from message
      const detectedLanguage = language || autoDetectLanguage(lastUserMessage);
      console.log(`[Chat API] Language: ${detectedLanguage} ${!language ? '(auto-detected)' : '(frontend)'}`);
      
      // 🤖 TENTAR SISTEMA MULTI-AGENTE PRIMEIRO (se habilitado e disponível)
      if (useMultiAgent) {
        try {
          const { orchestrateAgents } = await import("./agent/orchestrator");
          const { loadAgents } = await import("./agent/registry");
          
          const availableAgents = await loadAgents();
          
          if (availableAgents.length > 0) {
            console.log(`[Chat API] 🤖 Using Multi-Agent System (${availableAgents.length} agents available)`);
            
            // 🔧 Task #30.1: Create assistant message BEFORE execution to get messageId
            let assistantMessageId: number | undefined;
            if (conversationId) {
              try {
                const assistantMsg = await storage.createMessage({
                  conversationId,
                  role: "assistant",
                  content: "", // Empty content, will be updated after generation
                });
                assistantMessageId = assistantMsg.id;
                console.log(`[Chat API] 💾 Assistant message pre-created (id: ${assistantMessageId}) for tool persistence`);
              } catch (persistError: unknown) {
                console.error(`[Chat API] Failed to pre-create assistant message:`, getErrorMessage(persistError));
              }
            }
            
            // Passar histórico EXCLUINDO a última mensagem do usuário (para evitar duplicação)
            const historyWithoutLastTurn = messages.slice(0, -1);
            
            let agentResult;
            try {
              agentResult = await orchestrateAgents(lastUserMessage, {
                history: historyWithoutLastTurn, // Apenas turnos anteriores, consulta atual adicionada separadamente
                budgetUSD: 1.0,
                tenantId: 1,
                sessionId: "chat-session",
                language: detectedLanguage, // 🔥 FIX: Pass language to Multi-Agent for multi-language support
                conversationId, // 🔧 Task #30.1: Pass for ReAct tool persistence
                messageId: assistantMessageId, // 🔧 Task #30.1: Pass for ReAct tool persistence
              });
            } catch (orchestrationError: unknown) {
              // 🔧 FIX: Clean up empty message on error
              if (conversationId && assistantMessageId) {
                try {
                  await storage.deleteMessage(assistantMessageId);
                  console.log(`[Chat API] 🗑️ Deleted empty assistant message (id: ${assistantMessageId}) after error`);
                } catch (deleteError: unknown) {
                  console.error(`[Chat API] Failed to delete empty message:`, getErrorMessage(deleteError));
                }
              }
              throw orchestrationError; // Re-throw to be caught by outer catch
            }
            
            const latency = Date.now() - startTime;
            metricsCollector.recordLatency(latency);
            
            // 🔧 Task #30.1: UPDATE assistant message with final content
            if (conversationId && assistantMessageId && agentResult.content) {
              try {
                await storage.updateMessage(assistantMessageId, {
                  content: agentResult.content,
                  metadata: {
                    source: "multi-agent",
                    provider: "multi-agent",
                    totalCost: agentResult.metadata?.totalCost,
                  },
                });
                console.log(`[Chat API Multi-Agent] 💾 Assistant message updated (id: ${assistantMessageId})`);
              } catch (persistError: unknown) {
                console.error(`[Chat API Multi-Agent] Failed to update assistant message:`, getErrorMessage(persistError));
              }
            }
            
            // 🧠 AUTO-EVOLUÇÃO: Acionar sistema de auto-aprendizado (multi-agent path)
            try {
              const { autoLearningListener } = await import('./events/auto-learning-listener');
              
              // Fire and forget - não bloquear resposta
              autoLearningListener.onChatCompleted({
                conversationId: conversationId || null,
                userMessage: lastUserMessage,
                assistantResponse: agentResult.content,
                source: "free-api", // Multi-agent usa free APIs
                provider: "multi-agent",
              }).catch((err: unknown) => {
                console.error('[Chat API Multi-Agent] Failed to send to curation:', getErrorMessage(err));
              });
            } catch (autoLearnError: unknown) {
              console.error('[Chat API Multi-Agent] Auto-learning unavailable:', getErrorMessage(autoLearnError));
            }
            
            return res.json({
              choices: [{
                message: {
                  role: "assistant",
                  content: agentResult.content,
                  attachments: agentResult.attachments,
                },
                finish_reason: "stop"
              }],
              usage: {
                totalTokens: 0, // Multi-agente usa APIs gratuitas
              },
              metadata: {
                ...agentResult.metadata,
                latencyMs: latency,
              }
            });
          } else {
            console.log(`[Chat API] Nenhum agente disponível, usando orquestrador de prioridade como fallback`);
          }
        } catch (multiAgentError: unknown) {
          console.warn(`[Chat API] Multi-agente falhou, usando fallback:`, getErrorMessage(multiAgentError));
        }
      }
      
      // FALLBACK: Usar orquestrador de prioridade original
      console.log(`[Chat API] Usando orquestrador de prioridade como fallback`);
      
      // Obter política ou usar PADRÃO SEM RESTRIÇÕES (todas as regras = false)
      const policy = await enforcementPipeline.getOrCreateDefaultPolicy();
      // ✅ FIX BUG #2: Passar detectedLanguage para system prompt
      const systemPrompt = await enforcementPipeline.composeSystemPrompt(policy, lastUserMessage, detectedLanguage);
      const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];
      
      // Verificar se sistema está SEM RESTRIÇÕES (todas as regras = false)
      const activeRules = Object.values(policy.rules).filter(v => v === true);
      const isUnrestricted = activeRules.length === 0;
      
      const result = await generateWithPriority({
        messages: fullMessages,
        temperature: policy.temperature,
        topP: policy.topP,
        unrestricted: isUnrestricted,  // Auto-fallback quando true
        language: detectedLanguage  // 🔥 FIX: Pass detected language for multi-language support
      });
      
      // Registrar métricas
      const latency = Date.now() - startTime;
      metricsCollector.recordLatency(latency);
      if (result.usage) {
        metricsCollector.recordTokens(result.usage.totalTokens);
      }
      
      // ✅ PRODUCTION-READY: Record query metrics in PostgreSQL
      await queryMonitor.recordQuery(
        "chat",
        result.provider || "priority-orchestrator",
        latency,
        true,
        undefined,
        { tokensUsed: result.usage?.totalTokens || 0, provider: result.provider }
      );
      
      // 🔥 FIX: Persist assistant message AFTER generation (if conversationId provided)
      if (conversationId && result.content) {
        try {
          await storage.createMessage({
            conversationId,
            role: "assistant",
            content: result.content,
            metadata: {
              source: (result.source === "web-fallback" || result.source === "openai-fallback") ? "free-api" : (result.source || "openai"),
              provider: result.provider,
              model: result.model,
            },
          });
          console.log(`[Chat API] 💾 Assistant message persisted to conversation ${conversationId}`);
        } catch (persistError: unknown) {
          console.error(`[Chat API] Failed to persist assistant message:`, getErrorMessage(persistError));
        }
      }
      
      // 🧠 AUTO-EVOLUÇÃO: Acionar sistema de auto-aprendizado
      // Isso cria o loop infinito de aprendizado: Chat → KB → Dataset → Treino → Modelo Melhor
      try {
        const { autoLearningListener } = await import('./events/auto-learning-listener');
        const userMessageContent2 = messages[messages.length - 1]?.content || '';
        const userMessage = extractTextContent(userMessageContent2);
        
        // Fire and forget - não bloquear resposta
        // 🔥 FIX: Pass real conversationId instead of null
        autoLearningListener.onChatCompleted({
          conversationId: conversationId || null, // Use provided conversationId or null for ephemeral
          userMessage,
          assistantResponse: result.content,
          source: (result.source === "web-fallback" || result.source === "openai-fallback") ? "free-api" : (result.source || "openai"),
          provider: result.provider,
        }).catch((err: unknown) => {
          console.error('[AutoLearning] Failed to process chat:', getErrorMessage(err));
        });
        
      } catch (autoLearnError: unknown) {
        // Não falhar a requisição se auto-aprendizado falhar
        console.error('[AutoLearning] System unavailable:', getErrorMessage(autoLearnError));
      }
      
      res.json({
        choices: [{ 
          message: { 
            role: "assistant", 
            content: result.content,
            attachments: result.attachments  // MULTIMODAL: Passar anexos para frontend
          }, 
          finish_reason: "stop"
        }],
        usage: result.usage,
        metadata: {
          source: result.source,
          provider: result.provider,
          model: result.model,
          ...result.metadata
        }
      });
    } catch (error: unknown) {
      metricsCollector.recordError();
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/chat/stream - Streaming de chat via Server-Sent Events (SSE)
  // 🎯 FASE 2 - D1: SSE Backend para chat em tempo real
  app.get("/api/chat/stream", async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { message, useMultiAgent = "true", language, conversationId } = req.query;
      
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: req.t('chat.message_required') });
      }
      
      // ✅ FIX BUG #2 (Multi-language): Extract detected language from query params
      const detectedLanguage = typeof language === "string" ? language : "pt-BR";
      
      console.log(`[SSE] Detected language: ${detectedLanguage}`);
      console.log(`[SSE] ConversationId: ${conversationId || 'null (ephemeral)'}`);
      
      // 🔥 FIX: Persist user message BEFORE generation (if conversationId provided)
      if (conversationId && typeof conversationId === "string") {
        try {
          await storage.createMessage({
            conversationId: parseInt(conversationId, 10),
            role: "user",
            content: message,
          });
          console.log(`[SSE] 💾 User message persisted to conversation ${conversationId}`);
        } catch (persistError: unknown) {
          console.error(`[SSE] Failed to persist user message:`, getErrorMessage(persistError));
        }
      }
      
      // Configurar headers SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // Nginx buffering off
      
      // Helper para enviar evento SSE
      const sendSSE = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      
      // Enviar evento de início
      sendSSE("start", { timestamp: Date.now() });
      
      console.log(
        { message: message.substring(0, 100), useMultiAgent },
        "[SSE] Starting streaming chat"
      );
      
      // Registrar métricas
      metricsCollector.recordRequest();
      
      // Converter message em formato de mensagens
      const messages = [{ role: "user", content: message }];
      const useAgent = useMultiAgent === "true";
      
      let fullResponse = "";
      
      // 🤖 TENTAR SISTEMA MULTI-AGENTE PRIMEIRO
      if (useAgent) {
        try {
          const { orchestrateAgents } = await import("./agent/orchestrator");
          const { loadAgents } = await import("./agent/registry");
          
          const availableAgents = await loadAgents();
          
          if (availableAgents.length > 0) {
            console.log({ agents: availableAgents.length }, "[SSE] Using multi-agent system");
            
            const agentResult = await orchestrateAgents(message, {
              history: [],
              budgetUSD: 1.0,
              tenantId: 1,
              sessionId: "sse-chat-session",
            });
            
            fullResponse = agentResult.content;
            
            // Enviar resposta em chunks (simular streaming)
            const chunkSize = 50;
            for (let i = 0; i < fullResponse.length; i += chunkSize) {
              const chunk = fullResponse.substring(i, i + chunkSize);
              sendSSE("chunk", { content: chunk });
              await new Promise(resolve => setTimeout(resolve, 20)); // Small delay
            }
            
            // Enviar evento de conclusão
            const latency = Date.now() - startTime;
            sendSSE("done", { 
              latency,
              provider: "multi-agent",
              metadata: agentResult.metadata
            });
            
            // 🎯 FIX #4 & #5: Token tracking + Auto-learning for multi-agent path
            // Note: Multi-agent doesn't expose token usage in metadata, skip token tracking
            // Cost tracking is handled via agentResult.metadata.totalCost
            if (agentResult.metadata?.totalCost) {
              console.log(`[SSE Multi-Agent] Total cost: $${agentResult.metadata.totalCost}`);
            }
            
            // 🔥 FIX: Persist assistant message AFTER generation (multi-agent path)
            if (conversationId && typeof conversationId === "string" && fullResponse) {
              try {
                await storage.createMessage({
                  conversationId: parseInt(conversationId, 10),
                  role: "assistant",
                  content: fullResponse,
                  metadata: {
                    source: "multi-agent",
                    provider: "multi-agent",
                    totalCost: agentResult.metadata?.totalCost,
                  },
                });
                console.log(`[SSE Multi-Agent] 💾 Assistant message persisted to conversation ${conversationId}`);
              } catch (persistError: unknown) {
                console.error(`[SSE Multi-Agent] Failed to persist assistant message:`, getErrorMessage(persistError));
              }
            }
            
            // Send to curation queue
            try {
              const { autoLearningListener } = await import('./events/auto-learning-listener');
              autoLearningListener.onChatCompleted({
                conversationId: (typeof conversationId === "string" ? parseInt(conversationId, 10) : null),
                userMessage: message,
                assistantResponse: fullResponse,
                source: "free-api", // Multi-agent may use free APIs
                provider: "multi-agent",
              }).catch((err: unknown) => {
                console.error('[SSE Multi-Agent] Failed to send to curation:', getErrorMessage(err));
              });
            } catch (autoLearnError: unknown) {
              console.error('[SSE Multi-Agent] Auto-learning unavailable:', getErrorMessage(autoLearnError));
            }
            
            res.end();
            return;
          }
        } catch (multiAgentError: unknown) {
          console.warn({ error: getErrorMessage(multiAgentError) }, "[SSE] Multi-agent failed, using fallback");
        }
      }
      
      // FALLBACK: Priority Orchestrator
      console.log("[SSE] Using priority orchestrator");
      
      const policy = await enforcementPipeline.getOrCreateDefaultPolicy();
      // ✅ FIX BUG #2: Passar detectedLanguage para system prompt
      const systemPrompt = await enforcementPipeline.composeSystemPrompt(policy, message, detectedLanguage);
      const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];
      
      const activeRules = Object.values(policy.rules).filter(v => v === true);
      const isUnrestricted = activeRules.length === 0;
      
      const result = await generateWithPriority({
        messages: fullMessages,
        temperature: policy.temperature,
        topP: policy.topP,
        unrestricted: isUnrestricted,
        language: detectedLanguage as "pt-BR" | "en-US" | "es-ES"  // 🔥 FIX: Pass detected language for multi-language support
      });
      
      fullResponse = result.content;
      
      // Enviar resposta em chunks
      const chunkSize = 50;
      for (let i = 0; i < fullResponse.length; i += chunkSize) {
        const chunk = fullResponse.substring(i, i + chunkSize);
        sendSSE("chunk", { content: chunk });
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      
      // Registrar métricas
      const latency = Date.now() - startTime;
      metricsCollector.recordLatency(latency);
      if (result.usage) {
        metricsCollector.recordTokens(result.usage.totalTokens);
      }
      
      await queryMonitor.recordQuery(
        "chat-sse",
        result.provider || "priority-orchestrator",
        latency,
        true,
        undefined,
        { tokensUsed: result.usage?.totalTokens || 0, provider: result.provider }
      );
      
      // Enviar evento de conclusão
      sendSSE("done", {
        latency,
        provider: result.provider,
        model: result.model,
        usage: result.usage
      });
      
      // 🎯 FIX #4: TOKEN TRACKING - Track token usage for SSE streaming
      if (result.usage && result.provider) {
        try {
          const { trackTokenUsage } = await import('./monitoring/token-tracker');
          await trackTokenUsage({
            provider: result.provider === 'multi-agent' ? 'openai' : (result.provider as any),
            model: result.model || 'unknown',
            promptTokens: result.usage.promptTokens || 0,
            completionTokens: result.usage.completionTokens || 0,
            totalTokens: result.usage.totalTokens || 0,
            requestType: 'chat',
            success: true
          });
          console.log(`[SSE] Token usage tracked: ${result.usage.totalTokens} tokens`);
        } catch (trackError) {
          console.error('[SSE] Failed to track tokens:', trackError);
        }
      }
      
      // 🔥 FIX: Persist assistant message AFTER generation (priority orchestrator path)
      if (conversationId && typeof conversationId === "string" && fullResponse) {
        try {
          await storage.createMessage({
            conversationId: parseInt(conversationId, 10),
            role: "assistant",
            content: fullResponse,
            metadata: {
              source: (result.source === "web-fallback" || result.source === "openai-fallback") ? "free-api" : (result.source || "openai"),
              provider: result.provider,
              model: result.model,
            },
          });
          console.log(`[SSE] 💾 Assistant message persisted to conversation ${conversationId}`);
        } catch (persistError: unknown) {
          console.error(`[SSE] Failed to persist assistant message:`, getErrorMessage(persistError));
        }
      }
      
      // 🎯 FIX #5: AUTO-LEARNING - Send to curation queue for HITL review
      try {
        const { autoLearningListener } = await import('./events/auto-learning-listener');
        
        // Fire and forget - não bloquear resposta
        // 🔥 FIX: Pass real conversationId instead of null
        autoLearningListener.onChatCompleted({
          conversationId: (typeof conversationId === "string" ? parseInt(conversationId, 10) : null),
          userMessage: message,
          assistantResponse: fullResponse,
          source: (result.source === "web-fallback" || result.source === "openai-fallback") ? "free-api" : (result.source || "openai"),
          provider: result.provider,
        }).catch((err: unknown) => {
          console.error('[SSE] Failed to send to curation queue:', getErrorMessage(err));
        });
        
        console.log(`[SSE] Chat sent to curation queue for HITL review`);
      } catch (autoLearnError: unknown) {
        // Não falhar a requisição se curadoria falhar
        console.error('[SSE] Auto-learning system unavailable:', getErrorMessage(autoLearnError));
      }
      
      res.end();
      
    } catch (error: unknown) {
      console.error({ error: getErrorMessage(error) }, "[SSE] Stream failed");
      metricsCollector.recordError();
      
      // Enviar evento de erro
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: getErrorMessage(error) })}\n\n`);
      res.end();
    }
  });

  // POST /api/v1/transcribe (transcrição de áudio Whisper)
  app.post("/api/v1/transcribe", upload.single("audio"), async (req, res) => {
    const startTime = Date.now();
    try {
      if (!req.file) throw new Error(req.t('upload.no_audio_file'));
      
      // ✅ FIX P0-6: Validate audio file using magic bytes
      const { validateAudioUpload } = await import("./utils/file-validation");
      const validation = await validateAudioUpload(req.file.path);
      
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      
      metricsCollector.recordRequest();
      
      // Chamar API OpenAI Whisper
      const transcription = await llmClient.transcribeAudio(req.file.path);
      
      const latency = Date.now() - startTime;
      metricsCollector.recordLatency(latency);
      
      res.json({ text: transcription });
    } catch (error: unknown) {
      metricsCollector.recordError();
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/v1/chat/multimodal (Chat com anexos de arquivo)
  app.post("/api/v1/chat/multimodal", upload.array("files", 5), async (req, res) => {
    const startTime = Date.now();
    const parsedData = JSON.parse(req.body.data || "{}");
    
    try {
      const { messages, conversationId, language } = parsedData;
      const files = req.files as Express.Multer.File[];
      
      metricsCollector.recordRequest();
      
      // ✅ FIX P0-6: Validate ALL uploaded files using magic bytes
      if (files && files.length > 0) {
        const { validateDocumentUpload } = await import("./utils/file-validation");
        
        for (const file of files) {
          const validation = await validateDocumentUpload(file.path);
          if (!validation.valid) {
            return res.status(400).json({ 
              error: `File validation failed for ${file.originalname}: ${validation.error}` 
            });
          }
        }
      }
      
      // Obter política ou usar PADRÃO SEM RESTRIÇÕES (todas as regras = false)
      const policy = await enforcementPipeline.getOrCreateDefaultPolicy();
      
      // Processar todos os arquivos enviados
      let attachmentsContext = "";
      const imageAttachments = [];
      
      if (files && files.length > 0) {
        const { attachmentService } = await import("./services/attachment-service");
        const { db: dbConn } = await import("./db");
        const { curationQueue } = await import("@shared/schema");
        const { nanoid } = await import("nanoid");
        
        const processedFiles = await Promise.all(
          files.map(async (file) => {
            const mimeType = fileProcessor.detectMimeType(file.originalname);
            const processed = await fileProcessor.processFile(file.path, mimeType);
            
            // ✅ OPÇÃO B: Todos anexos vão para curadoria HITL (curation_storage/pending/)
            if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
              try {
                // Determinar tipo de arquivo
                let fileType: 'image' | 'video' | 'audio' | 'document';
                if (mimeType.startsWith('image/')) fileType = 'image';
                else if (mimeType.startsWith('video/')) fileType = 'video';
                else if (mimeType.startsWith('audio/')) fileType = 'audio';
                else fileType = 'document';
                
                // Criar entrada na curation queue PRIMEIRO (precisa do ID)
                const curationId = nanoid();
                const description = processed.extractedText || `${fileType} enviado pelo usuário no chat`;
                
                // Salvar arquivo em curation_storage/pending/ via AttachmentService PRIMEIRO
                const tempAttachmentId = await attachmentService.uploadToPending({
                  curationId,
                  file,
                  fileType,
                  description,
                });
                
                // Criar curation item COM attachments linkados
                const [curationItem] = await dbConn.insert(curationQueue).values({
                  id: curationId,
                  title: `[CHAT ${fileType.toUpperCase()}] ${file.originalname}`,
                  content: `**Enviado no chat**\n**Conversa ID:** ${conversationId || 'desconhecida'}\n\n**Descrição AI:** ${description}\n\n**Arquivo original:** ${file.originalname}`,
                  suggestedNamespaces: ['kb/chat', `kb/${fileType}s`],
                  tags: [fileType, 'chat', 'usuario', mimeType],
                  status: "pending" as const,
                  submittedBy: 'chat-user',
                  attachments: [{
                    type: fileType,
                    url: `/curation_storage/pending/${file.originalname}`, // URL temporária
                    filename: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    description,
                  }] as any, // Inline attachment para compatibilidade com schema existente
                }).returning();
                
                console.log(`[Chat] 📎 ${fileType} enviado para curadoria: ${file.originalname} (ID: ${curationId}, Attachment: ${tempAttachmentId})`);
              } catch (error: unknown) {
                console.error(`[Chat] ⚠️ Erro ao processar ${file.originalname}:`, getErrorMessage(error));
              }
            }
            
            return `[${file.originalname}]: ${processed.extractedText}`;
          })
        );
        attachmentsContext = "\n\nArquivos anexados:\n" + processedFiles.join("\n\n");
      }
      
      // Adicionar contexto de arquivos à última mensagem do usuário
      const enrichedMessages = [...messages];
      if (enrichedMessages.length > 0 && attachmentsContext) {
        const lastMsg = enrichedMessages[enrichedMessages.length - 1];
        if (lastMsg.role === "user") {
          lastMsg.content += attachmentsContext;
        }
      }
      
      // Obter última mensagem do usuário para detecção de idioma (normalizar para string)
      const lastUserContent2 = messages[messages.length - 1]?.content || '';
      const lastUserMessage = extractTextContent(lastUserContent2);
      
      // ✅ FIX BUG #2: Use frontend-detected language or auto-detect from message
      const detectedLanguage = language || autoDetectLanguage(lastUserMessage);
      console.log(`[Chat Multimodal] Language: ${detectedLanguage} ${!language ? '(auto-detected)' : '(frontend)'}`);
      
      const systemPrompt = await enforcementPipeline.composeSystemPrompt(policy, lastUserMessage, detectedLanguage);
      const fullMessages = [{ role: "system", content: systemPrompt }, ...enrichedMessages];
      
      const result = await llmClient.chatCompletion({
        messages: fullMessages,
        temperature: policy.temperature,
        topP: policy.topP,
      });
      
      const moderated = await enforcementPipeline.moderateOutput(result.content, policy);
      
      // ⚡ FALLBACK AUTOMÁTICO: Se OpenAI recusou e sistema está SEM RESTRIÇÕES,
      // buscar na web, indexar na KB e responder sem censura
      const userMessageContent = messages[messages.length - 1]?.content || '';
      const userMessage = extractTextContent(userMessageContent);
      const fallbackResult = await autoFallback.checkAndExecuteFallback(
        moderated,
        userMessage,
        policy
      );
      
      const finalContent = fallbackResult.content;
      
      const latency = Date.now() - startTime;
      metricsCollector.recordLatency(latency);
      metricsCollector.recordTokens(result.usage?.totalTokens || 0);
      
      res.json({
        choices: [{ 
          message: { 
            role: "assistant", 
            content: finalContent 
          }, 
          finish_reason: result.finishReason 
        }],
        usage: result.usage,
        fallback: fallbackResult.usedFallback ? {
          used: true,
          sourcesIndexed: fallbackResult.sourcesIndexed,
          searchQuery: fallbackResult.searchQuery,
        } : undefined,
      });
    } catch (error: unknown) {
      metricsCollector.recordError();
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/kb/ingest
  // HITL FIX: Ingestão de arquivos KB passa pela fila de curadoria
  app.post("/api/kb/ingest", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) throw new Error(req.t('upload.no_file'));
      
      // ✅ FIX P0-6: Validate document file using magic bytes
      const { validateDocumentUpload } = await import("./utils/file-validation");
      const validation = await validateDocumentUpload(req.file.path);
      
      if (!validation.valid) {
        // Clean up invalid file
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: validation.error });
      }
      
      const mimeType = fileProcessor.detectMimeType(req.file.originalname);
      
      const processed = await fileProcessor.processFile(req.file.path, mimeType);

      // DEDUPLICAÇÃO: Verificar se arquivo é duplicado
      const { deduplicationService } = await import("./services/deduplication-service");
      const dupCheck = await deduplicationService.checkDuplicate({
        filePath: req.file.path,
        text: processed.extractedText,
        tenantId: 1,
        enableSemantic: processed.extractedText.length >= 100 // Apenas semântico se texto suficiente
      });

      if (dupCheck.isDuplicate && dupCheck.duplicateOf) {
        // Limpar arquivo temporário
        await fs.unlink(req.file.path).catch(() => {});
        
        return res.status(409).json({
          error: req.t('upload.duplicate_detected'),
          duplicate: {
            id: dupCheck.duplicateOf.id,
            title: dupCheck.duplicateOf.title,
            method: dupCheck.method,
            similarity: dupCheck.duplicateOf.similarity
          },
          message: dupCheck.method === 'hash'
            ? req.t('upload.duplicate_exact')
            : `Conteúdo similar encontrado (${Math.round((dupCheck.duplicateOf.similarity || 0) * 100)}% correspondência)`
        });
      }
      
      // Importar curation store
      const { curationStore } = await import("./curation/store");
      
      // Adicionar à fila de curadoria ao invés de publicar direto na KB
      const item = await curationStore.addToCuration({
        title: req.file.originalname,
        content: processed.extractedText,
        suggestedNamespaces: ["kb/ingest"],
        tags: ["ingest", "file", mimeType],
        submittedBy: "api",
      });
      
      // Limpar arquivo temporário
      await fs.unlink(req.file.path).catch(() => {});
      
      res.json({ 
        ok: true, 
        curationId: item.id,
        message: req.t('upload.submitted_for_curation'),
        status: "pending_approval"
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/kb/search
  app.post("/api/kb/search", requireAuth, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { query, k, namespace, namespaces } = req.body;
      const results = await ragService.search(query, { 
        k: k || 10, 
        namespaces: namespaces || (namespace ? [namespace] : undefined)
      });
      
      const latency = Date.now() - startTime;
      
      // ✅ PRODUCTION-READY: Track namespace search in PostgreSQL
      if (namespace) {
        await usageTracker.trackNamespaceSearch(
          namespace,
          namespace,
          { query, resultCount: results.length }
        );
        
        // ✅ Track search quality (relevance scores)
        const relevanceScores = results.map((r: any) => r.similarity || r.score || 0);
        if (relevanceScores.length > 0) {
          await usageTracker.trackNamespaceSearchQuality(namespace, relevanceScores);
        }
      }
      
      // ✅ PRODUCTION-READY: Record query metrics in PostgreSQL
      await queryMonitor.recordQuery(
        "rag",
        "kb",
        latency,
        true,
        undefined,
        { query, resultCount: results.length, namespace }
      );
      
      res.json({ results });
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      
      // ✅ Track error
      await queryMonitor.recordQuery(
        "rag",
        "kb",
        latency,
        false,
        getErrorMessage(error),
        undefined
      );
      
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/agent/plan_act
  app.post("/api/agent/plan_act", requireAuth, async (req, res) => {
    try {
      const { goal, conversation_id, message_id } = req.body;
      
      const tools = new Map(Object.entries(agentTools).map(([name, fn]) => [
        name,
        async (input: unknown) => (fn as any)(input),
      ]));
      
      const result = await reactEngine.execute(goal, conversation_id || 1, message_id || 1, tools);
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET/POST /api/admin/policies
  app.get("/api/admin/policies", requireAdmin, requirePermission("settings:policies:read"), async (req, res) => {
    try {
      const policy = await storage.getActivePolicy();
      res.json(policy || {});
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Preview the FULL system prompt (custom + generated parts)
  // Accepts POST with temporary behavior values for live preview
  app.post("/api/admin/policies/preview-prompt", requireAdmin, requirePermission("settings:policies:read"), async (req, res) => {
    try {
      const policy = await storage.getActivePolicy();
      if (!policy) {
        return res.status(404).json({ error: req.t('policy.no_active_policy') });
      }

      // Use temporary behavior from request if provided, otherwise use saved
      const previewPolicy = {
        ...policy,
        behavior: req.body.behavior || policy.behavior,
        systemPrompt: req.body.systemPrompt !== undefined ? req.body.systemPrompt : policy.systemPrompt
      };

      // Generate the COMPLETE system prompt (same as what AI receives)
      const fullPrompt = await enforcementPipeline.composeSystemPrompt(previewPolicy);

      res.json({ 
        customPart: previewPolicy.systemPrompt || "",
        fullPrompt: fullPrompt,
        behavior: previewPolicy.behavior
      });
    } catch (error: unknown) {
      console.error("Error generating prompt preview:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/admin/policies", requireAdmin, requirePermission("settings:policies:update"), async (req, res) => {
    try {
      if (req.body.behavior) {
        const validationResult = behaviorConfigSchema.safeParse(req.body.behavior);
        if (!validationResult.success) {
          return res.status(400).json({ 
            error: "Invalid behavior configuration",
            details: validationResult.error.format()
          });
        }
      }
      
      const existing = await storage.getActivePolicy();
      
      if (existing) {
        const updated = await storage.updatePolicy(existing.id, req.body);
        res.json(updated);
      } else {
        const created = await storage.createPolicy(req.body);
        res.json(created);
      }
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/admin/settings/timezone - Obter timezone do sistema
  app.get("/api/admin/settings/timezone", requireAdmin, requirePermission("settings:timezone:read"), async (req, res) => {
    try {
      // Sempre retornar timezone padrão (single-tenant)
      res.json({ timezone: "America/Sao_Paulo" });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/settings/timezone - Atualizar timezone do sistema
  app.post("/api/admin/settings/timezone", requireAdmin, requirePermission("settings:timezone:update"), async (req, res) => {
    try {
      const { timezone } = req.body;
      
      if (!timezone || typeof timezone !== 'string') {
        return res.status(400).json({ error: req.t('timezone.invalid') });
      }
      
      // Validate timezone using Intl
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return res.status(400).json({ error: req.t('timezone.invalid_iana') });
      }
      
      // Timezone setting is no longer persisted (single-tenant)
      res.json({ timezone, success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/admin/lifecycle-policies - Get lifecycle policy configuration
  app.get("/api/admin/lifecycle-policies", requireAdmin, requirePermission("settings:policies:read"), async (req, res) => {
    try {
      const policyPath = path.join(process.cwd(), "config", "lifecycle-policy.json");
      const policyContent = await fs.readFile(policyPath, "utf-8");
      const policy = JSON.parse(policyContent);
      res.json(policy);
    } catch (error: unknown) {
      console.error("[Lifecycle Policies] GET error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // PATCH /api/admin/lifecycle-policies - Update lifecycle policy configuration
  app.patch("/api/admin/lifecycle-policies", requireAdmin, requirePermission("settings:policies:update"), async (req, res) => {
    try {
      const policyPath = path.join(process.cwd(), "config", "lifecycle-policy.json");
      
      // Validate input using Zod schema
      const validationResult = lifecyclePolicyUpdateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: req.t('policy.invalid_data'),
          details: validationResult.error.format()
        });
      }
      
      const updates = validationResult.data;

      // Read current policy
      const currentContent = await fs.readFile(policyPath, "utf-8");
      const currentPolicy = JSON.parse(currentContent);

      // Merge updates (deep merge for nested objects)
      const updatedPolicy = {
        ...currentPolicy,
        ...updates,
        modules: {
          ...currentPolicy.modules,
          ...(updates.modules || {})
        },
        globalDefaults: {
          ...currentPolicy.globalDefaults,
          ...(updates.globalDefaults || {})
        },
        schedule: {
          ...currentPolicy.schedule,
          ...(updates.schedule || {})
        }
      };

      // Write updated policy back to file
      await fs.writeFile(policyPath, JSON.stringify(updatedPolicy, null, 2), "utf-8");
      
      console.log("[Lifecycle Policies] Configuration updated successfully");
      res.json({ success: true, policy: updatedPolicy });
    } catch (error: unknown) {
      console.error("[Lifecycle Policies] PATCH error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/metrics/realtime
  app.get("/api/metrics/realtime", requireAuth, async (req, res) => {
    try {
      const metrics = await storage.getMetrics(undefined, 100);
      res.json({ metrics });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/llm/status - Status das APIs gratuitas (Groq, Gemini, HF)
  app.get("/api/llm/status", async (req, res) => {
    try {
      const status = await freeLLMProviders.getStatus();
      
      // Calcular total disponível
      const totalRemaining = status.groq.remaining + status.gemini.remaining + status.hf.remaining;
      const totalLimit = status.groq.limit + status.gemini.limit + status.hf.limit;
      const totalUsed = status.groq.used + status.gemini.used + status.hf.used;
      
      res.json({
        providers: status,
        summary: {
          totalRemaining,
          totalLimit,
          totalUsed,
          percentageUsed: Math.round((totalUsed / totalLimit) * 100),
        },
        message: totalRemaining > 0 
          ? `✓ ${totalRemaining.toLocaleString()} requisições gratuitas disponíveis hoje`
          : "⚠️ Limite diário atingido - aguardar reset em 24h",
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // REMOVED: Old GPU routes moved to server/routes/gpu.ts (uses PostgreSQL instead of gpuOrchestrator)
  // Now using: /api/gpu/workers/register, /api/gpu/workers/heartbeat, etc.

  // POST /api/training/prepare - Preparar dataset de treino
  app.post("/api/training/prepare", requireAuth, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { criteria } = req.body;

      const result = await trainingDataCollector.prepareDataset(criteria);
      
      // ✅ PRODUCTION-READY: Track dataset preparation in PostgreSQL
      const latency = Date.now() - startTime;
      await queryMonitor.recordQuery(
        "training",
        "prepare",
        latency,
        true,
        undefined,
        { exampleCount: result.stats.totalExamples, valid: result.validation.valid }
      );
      
      res.json({
        success: true,
        filepath: result.filepath,
        stats: result.stats,
        validation: result.validation,
      });
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      
      // ✅ Track error
      await queryMonitor.recordQuery(
        "training",
        "prepare",
        latency,
        false,
        getErrorMessage(error),
        undefined
      );
      
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/stats - Estatísticas de dados disponíveis
  app.get("/api/training/stats", requireAuth, async (req, res) => {
    try {
      // Coletar dados sem exportar
      const examples = await trainingDataCollector.collectTrainingData();
      const stats = await trainingDataCollector.generateStats(examples);
      const validation = await trainingDataCollector.validateDataset(examples);

      res.json({
        stats,
        validation,
        ready: validation.valid,
        message: validation.valid 
          ? `✓ ${stats.totalExamples} exemplos prontos para treino`
          : `⚠️ Dataset necessita correções: ${validation.errors.join(", ")}`,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/index-pdfs (indexar todos os 7 PDFs técnicos)
  app.post("/api/admin/index-pdfs", requireAdmin, async (req, res) => {
    try {
      const documentIds = await knowledgeIndexer.indexAllPDFs();
      res.json({ success: true, documentIds });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // GERENCIAMENTO DA BASE DE CONHECIMENTO
  // ============================================================================

  // GET /api/admin/documents - Listar documentos APROVADOS
  // HITL FIX: Apenas mostrar documentos que passaram por aprovação humana (status='indexed')
  app.get("/api/admin/documents", requireAdmin, async (req, res) => {
    try {
      const allDocs = await storage.getDocuments(1000);
      
      // Filtrar para mostrar APENAS documentos aprovados (status='indexed')
      const approvedDocs = allDocs.filter(doc => doc.status === 'indexed');
      
      console.log(`[KB API] Returning ${approvedDocs.length} approved docs (filtered from ${allDocs.length} total)`);
      res.json(approvedDocs);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/documents - Adicionar novo documento (texto manual)
  // HITL FIX: Toda alimentação manual da KB passa pela fila de curadoria
  app.post("/api/admin/documents", requireAdmin, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { title, content, source } = req.body;
      
      if (!title || !content) {
        return res.status(400).json({ error: req.t('kb.title_content_required') });
      }

      // DEDUPLICAÇÃO: Verificar se conteúdo é duplicado
      const { deduplicationService } = await import("./services/deduplication-service");
      const dupCheck = await deduplicationService.checkDuplicate({
        text: content,
        tenantId: 1,
        enableSemantic: true // Habilitar verificação semântica para texto
      });

      if (dupCheck.isDuplicate && dupCheck.duplicateOf) {
        return res.status(409).json({
          error: req.t('kb.duplicate_detected'),
          duplicate: {
            id: dupCheck.duplicateOf.id,
            title: dupCheck.duplicateOf.title,
            method: dupCheck.method,
            similarity: dupCheck.duplicateOf.similarity
          },
          message: dupCheck.method === 'hash'
            ? req.t('kb.duplicate_exact')
            : `Conteúdo similar encontrado (${Math.round((dupCheck.duplicateOf.similarity || 0) * 100)}% correspondência)`
        });
      }

      // Importar curation store
      const { curationStore } = await import("./curation/store");
      
      // Adicionar à fila de curadoria ao invés de publicar direto na KB
      const item = await curationStore.addToCuration({
        title,
        content,
        suggestedNamespaces: ["kb/general"],
        tags: [source || "manual", "kb-text"],
        submittedBy: "admin",
      });

      // ✅ PRODUCTION-READY: Track document submission in PostgreSQL
      const latency = Date.now() - startTime;
      await queryMonitor.recordQuery(
        "kb",
        "document",
        latency,
        true,
        undefined,
        { curationId: item.id, source: source || "manual" }
      );
      
      res.json({ 
        message: req.t('kb.content_submitted'),
        curationId: item.id,
        status: "pending_approval"
      });
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      
      // ✅ Track error
      await queryMonitor.recordQuery(
        "kb",
        "document",
        latency,
        false,
        getErrorMessage(error),
        undefined
      );
      
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // PATCH /api/admin/documents/:id - Atualizar documento
  app.patch("/api/admin/documents/:id", requireAdmin, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: docId } = params;
      const { title, content, metadata } = req.body;

      // Obter documento existente para mesclar metadata
      const existingDoc = await storage.getDocument(docId);
      if (!existingDoc) {
        return res.status(404).json({ error: req.t('kb.document_not_found') });
      }

      // Mesclar metadata recebido com metadata existente (preservar todos os campos)
      const mergedMetadata = {
        ...(existingDoc.metadata || {}),
        ...(metadata || {}),
      };

      const updated = await storage.updateDocument(docId, { 
        title, 
        content,
        metadata: mergedMetadata,
      });
      
      // Re-indexar documento
      if (content) {
        await knowledgeIndexer.reIndexDocument(docId);
      }

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // DELETE /api/admin/documents/:id - Deletar documento KB em cascata
  app.delete("/api/admin/documents/:id", requireAdmin, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: docId } = params;
      
      // Importar serviço de cascata
      const { kbCascadeService } = await import("./services/kb-cascade");
      
      const result = await kbCascadeService.deleteDocument(docId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({
        success: true,
        message: `Document deleted successfully`,
        documentsDeleted: result.documentsDeleted,
        embeddingsDeleted: result.embeddingsDeleted,
        filesDeleted: result.filesDeleted,
        warnings: result.warnings,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // DELETE /api/admin/documents/bulk - Deletar múltiplos documentos KB em cascata
  app.delete("/api/admin/documents/bulk", requireAdmin, async (req, res) => {
    try {
      const { documentIds } = req.body;
      
      if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: req.t('kb.document_ids_required') });
      }

      // Importar serviço de cascata
      const { kbCascadeService } = await import("./services/kb-cascade");
      
      // Delete documents in bulk (loop through each one)
      const results = await Promise.all(
        documentIds.map(id => kbCascadeService.deleteDocument(id))
      );
      
      // Aggregate results
      const result = {
        success: results.every(r => r.success),
        documentsDeleted: results.reduce((sum, r) => sum + r.documentsDeleted, 0),
        embeddingsDeleted: results.reduce((sum, r) => sum + r.embeddingsDeleted, 0),
        filesDeleted: results.reduce((sum, r) => sum + r.filesDeleted.length, 0),
        warnings: results.flatMap(r => r.warnings || []),
        error: results.find(r => !r.success)?.error,
      };
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({
        success: true,
        message: `${result.documentsDeleted} documents deleted successfully`,
        documentsDeleted: result.documentsDeleted,
        embeddingsDeleted: result.embeddingsDeleted,
        filesDeleted: result.filesDeleted,
        warnings: result.warnings,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // PATCH /api/admin/documents/:id/attachments/:index - Atualizar descrição de anexo
  app.patch("/api/admin/documents/:id/attachments/:index", requireAdmin, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(docIdAttachmentIndexSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: docId, index: attachmentIndex } = params;
      const { description } = req.body;

      if (description === undefined) {
        return res.status(400).json({ error: req.t('kb.description_required') });
      }

      const doc = await storage.getDocument(docId);
      if (!doc) {
        return res.status(404).json({ error: req.t('kb.document_not_found') });
      }

      if (!doc.attachments || !doc.attachments[attachmentIndex]) {
        return res.status(404).json({ error: req.t('kb.attachment_not_found') });
      }

      const updatedAttachments = [...doc.attachments];
      updatedAttachments[attachmentIndex] = {
        ...updatedAttachments[attachmentIndex],
        description,
      };

      const updated = await storage.updateDocument(docId, {
        attachments: updatedAttachments,
      });

      res.json({
        success: true,
        attachment: updatedAttachments[attachmentIndex],
        document: updated,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });


  // POST /api/admin/kb/scan-duplicates - Scan KB for duplicates (manual trigger)
  app.post("/api/admin/kb/scan-duplicates", requireAdmin, async (req, res) => {
    try {
      console.log('[KB Dedup] Manual scan triggered via API');
      
      const { kbDeduplicationScanner } = await import("./services/kb-deduplication-scanner");
      const report = await kbDeduplicationScanner.scanKB();
      
      console.log(kbDeduplicationScanner.formatReport(report));
      
      res.json({
        success: true,
        report,
        formatted: kbDeduplicationScanner.formatReport(report),
      });
    } catch (error: unknown) {
      console.error('[KB Dedup] Scan error:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/kb/reset - Limpar TODOS os dados da Knowledge Base (para testes)
  app.post("/api/admin/kb/reset", requireAdmin, async (req, res) => {
    try {
      const { documents, embeddings, curationQueue } = await import("@shared/schema");
      
      console.log("[KB Reset] ⚠️ INICIANDO RESET COMPLETO DA KB...");
      
      // 1. Deletar todos os embeddings
      const deletedEmbeddings = await db.delete(embeddings);
      console.log("[KB Reset] ✓ Embeddings deletados");
      
      // 2. Deletar todos os documentos
      const deletedDocs = await db.delete(documents);
      console.log("[KB Reset] ✓ Documentos deletados");
      
      // 3. Limpar fila de curadoria (opcional - usuário pode decidir)
      if (req.body.clearCurationQueue) {
        const deletedCuration = await db.delete(curationQueue);
        console.log("[KB Reset] ✓ Fila de curadoria limpa");
      }
      
      // 4. Deletar imagens aprendidas se solicitado
      if (req.body.clearImages) {
        const learnedImagesDir = path.join(process.cwd(), 'attached_assets', 'learned_images');
        if (fsSync.existsSync(learnedImagesDir)) {
          const files = fsSync.readdirSync(learnedImagesDir);
          files.forEach(file => {
            fsSync.unlinkSync(path.join(learnedImagesDir, file));
          });
          console.log(`[KB Reset] ✓ ${files.length} imagens deletadas`);
        }
      }
      
      console.log("[KB Reset] ✅ RESET COMPLETO - KB está VAZIA");
      
      res.json({ 
        success: true,
        message: req.t('kb.reset_complete'),
        cleared: {
          documents: true,
          embeddings: true,
          curationQueue: req.body.clearCurationQueue || false,
          images: req.body.clearImages || false
        }
      });
    } catch (error: unknown) {
      console.error("[KB Reset] ❌ Erro ao resetar KB:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/seed-system - Popular sistema completo (Namespaces, Tools, Agents)
  // ADMIN ONLY - Endpoint protegido com allowlist de admins
  app.post("/api/admin/seed-system", requireAdmin, async (req, res) => {
    // PRODUCTION: Support both OAuth and Local auth
    const userId = getUserId(req);
    
    // 1. Verificação de autenticação
    if (!userId) {
      return res.status(401).json({ error: req.t('admin.auth_required') });
    }
    
    // 2. Verificação de autorização - allowlist de admins
    const adminAllowlist = (process.env.ADMIN_ALLOWED_SUBS || "").split(",").map(s => s.trim()).filter(Boolean);
    const userSub = userId;
    
    // Em desenvolvimento, permitir qualquer usuário autenticado se allowlist estiver vazia
    const isProduction = process.env.NODE_ENV === "production";
    const isAuthorized = !isProduction && adminAllowlist.length === 0 ? true : adminAllowlist.includes(userSub);
    
    if (!isAuthorized) {
      console.warn(`[Seed] Unauthorized access attempt by user: ${userSub}`);
      return res.status(403).json({ 
        error: req.t('admin.forbidden_en') 
      });
    }
    
    try {
      const { seedCompleteSystem } = await import("./seeds/complete-system.seed");
      const result = await seedCompleteSystem();
      
      res.json({
        ...result,
        message: req.t('admin.seed_success'),
      });
    } catch (error: unknown) {
      console.error("[Seed] Error:", getErrorMessage(error));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/migrate-agent-namespaces - Migrar agentes existentes para novo sistema de namespaces
  // ADMIN ONLY - Endpoint protegido com allowlist de admins
  // Query params: ?dryRun=true para modo dry-run
  app.post("/api/admin/migrate-agent-namespaces", requireAdmin, async (req, res) => {
    // PRODUCTION: Support both OAuth and Local auth
    const userId = getUserId(req);
    
    // 1. Verificação de autenticação
    if (!userId) {
      return res.status(401).json({ error: req.t('admin.auth_required') });
    }
    
    // 2. Verificação de autorização - allowlist de admins
    const adminAllowlist = (process.env.ADMIN_ALLOWED_SUBS || "").split(",").map(s => s.trim()).filter(Boolean);
    const userSub = userId;
    
    const isProduction = process.env.NODE_ENV === "production";
    const isAuthorized = !isProduction && adminAllowlist.length === 0 ? true : adminAllowlist.includes(userSub);
    
    if (!isAuthorized) {
      console.warn(`[Migration] Tentativa de acesso não autorizado do usuário: ${userSub}`);
      return res.status(403).json({ 
        error: req.t('admin.forbidden') 
      });
    }
    
    try {
      const dryRun = req.query.dryRun === "true";
      const { migrateAgentNamespaces } = await import("./migrations/migrate-agent-namespaces");
      const result = await migrateAgentNamespaces(dryRun);
      
      // Falhar com 500 se erros > 0 em modo produção
      if (!dryRun && result.errors > 0) {
        return res.status(500).json({
          ...result,
          message: `Migração falhou com ${result.errors} erros`,
        });
      }
      
      res.json({
        ...result,
        message: dryRun 
          ? req.t('admin.dry_run_complete')
          : req.t('admin.migration_success'),
      });
    } catch (error: unknown) {
      console.error("[Migration] Error:", getErrorMessage(error));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/admin/images - Listar todas as imagens aprendidas
  app.get("/api/admin/images", requireAdmin, async (req, res) => {
    try {
      const imagesDir = path.join(process.cwd(), 'attached_assets', 'learned_images');
      
      // Criar diretório se não existir
      if (!fsSync.existsSync(imagesDir)) {
        fsSync.mkdirSync(imagesDir, { recursive: true });
        return res.json([]);
      }

      const files = fsSync.readdirSync(imagesDir);
      const images = files
        .filter((f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
        .map((filename: string) => {
          const filepath = path.join(imagesDir, filename);
          const stats = fsSync.statSync(filepath);
          
          return {
            filename,
            path: `/images/${filename}`,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
          };
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      res.json(images);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/admin/images/all - Obter TODAS as imagens de TODAS as fontes
  app.get("/api/admin/images/all", requireAdmin, async (req, res) => {
    try {
      const allImages: Array<Record<string, unknown>> = [];

      // 1. Imagens aprendidas (do crawler)
      const learnedImagesDir = path.join(process.cwd(), 'attached_assets', 'learned_images');
      if (fsSync.existsSync(learnedImagesDir)) {
        const learnedFiles = fsSync.readdirSync(learnedImagesDir);
        learnedFiles
          .filter((f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
          .forEach((filename: string) => {
            const filepath = path.join(learnedImagesDir, filename);
            const stats = fsSync.statSync(filepath);
            allImages.push({
              id: `learned-${filename}`,
              filename,
              url: `/images/${filename}`,
              source: 'crawler',
              size: stats.size,
              createdAt: stats.birthtime,
              mimeType: filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[0].substring(1) || 'image'
            });
          });
      }

      // 2. Chat images (legacy - backward compatibility)
      const chatImagesDir = path.join(process.cwd(), 'attached_assets', 'chat_images');
      if (fsSync.existsSync(chatImagesDir)) {
        const chatFiles = fsSync.readdirSync(chatImagesDir);
        chatFiles
          .filter((f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
          .forEach((filename: string) => {
            const filepath = path.join(chatImagesDir, filename);
            const stats = fsSync.statSync(filepath);
            allImages.push({
              id: `chat-${filename}`,
              filename,
              url: `/attached_assets/chat_images/${filename}`,
              source: 'chat',
              size: stats.size,
              createdAt: stats.birthtime,
              mimeType: filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[0].substring(1) || 'image'
            });
          });
      }

      // 3. Images from curation storage (PENDING HITL approval - NEW)
      const curationStorageDir = path.join(process.cwd(), 'curation_storage', 'pending');
      if (fsSync.existsSync(curationStorageDir)) {
        const curationFiles = fsSync.readdirSync(curationStorageDir);
        curationFiles
          .filter((f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
          .forEach((filename: string) => {
            const filepath = path.join(curationStorageDir, filename);
            const stats = fsSync.statSync(filepath);
            allImages.push({
              id: `pending-${filename}`,
              filename,
              url: `/curation_storage/pending/${filename}`,
              source: 'pending',
              size: stats.size,
              createdAt: stats.birthtime,
              mimeType: filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[0].substring(1) || 'image'
            });
          });
      }

      // 4. Images from KB storage (APPROVED after HITL - NEW)
      const kbStorageImagesDir = path.join(process.cwd(), 'kb_storage', 'images');
      if (fsSync.existsSync(kbStorageImagesDir)) {
        const kbFiles = fsSync.readdirSync(kbStorageImagesDir);
        kbFiles
          .filter((f: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
          .forEach((filename: string) => {
            const filepath = path.join(kbStorageImagesDir, filename);
            const stats = fsSync.statSync(filepath);
            allImages.push({
              id: `kb-${filename}`,
              filename,
              url: `/kb_storage/images/${filename}`,
              source: 'kb',
              size: stats.size,
              createdAt: stats.birthtime,
              mimeType: filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[0].substring(1) || 'image'
            });
          });
      }
      
      // 5. Imagens de documentos aprovados (KB)
      const { documents } = await import("@shared/schema");
      const docsWithImages = await db
        .select()
        .from(documents)
        .where(sql`status = 'indexed' AND attachments IS NOT NULL`);
      
      docsWithImages.forEach((doc) => {
        if (doc.attachments && Array.isArray(doc.attachments)) {
          doc.attachments
            .filter((att: Record<string, unknown>) => att.type === 'image')
            .forEach((img: Record<string, unknown>, idx: number) => {
              allImages.push({
                id: `doc-${doc.id}-${idx}`,
                filename: String(img.filename || ''),
                url: String(img.url || ''),
                source: 'document',
                size: Number(img.size || 0),
                mimeType: String(img.mimeType || ''),
                description: String(img.description || ''),
                createdAt: doc.createdAt,
                documentId: doc.id,
                documentTitle: doc.title,
                namespace: doc.metadata && typeof doc.metadata === 'object' && 'namespaces' in doc.metadata 
                  ? Array.isArray(doc.metadata.namespaces) ? doc.metadata.namespaces[0] : undefined
                  : undefined
              });
            });
        }
      });

      // Ordenar por data de criação (mais recente primeiro)
      allImages.sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(String(a.createdAt));
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(String(b.createdAt));
        return dateB.getTime() - dateA.getTime();
      });

      res.json({
        total: allImages.length,
        sources: {
          crawler: allImages.filter(i => i.source === 'crawler').length,
          chat: allImages.filter(i => i.source === 'chat').length,
          pending: allImages.filter(i => i.source === 'pending').length,
          kb: allImages.filter(i => i.source === 'kb').length,
          document: allImages.filter(i => i.source === 'document').length
        },
        images: allImages
      });
    } catch (error: unknown) {
      console.error("[API] Error fetching all images:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // DELETE /api/admin/images - Delete multiple images
  app.delete("/api/admin/images", requireAdmin, async (req, res) => {
    try {
      const { imageIds } = req.body;
      
      if (!Array.isArray(imageIds) || imageIds.length === 0) {
        return res.status(400).json({ error: "imageIds must be a non-empty array" });
      }

      console.log(`[DELETE Images] Deleting ${imageIds.length} images...`);
      
      let deletedCount = 0;
      const errors: string[] = [];

      for (const imageId of imageIds) {
        try {
          // Parse image ID format: "source-filename" or "doc-docId-idx"
          const parts = imageId.split('-');
          const source = parts[0];

          if (source === 'learned') {
            // Delete from learned_images
            const filename = parts.slice(1).join('-');
            const filepath = path.join(process.cwd(), 'attached_assets', 'learned_images', filename);
            
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
              errors.push(`Invalid filename: ${filename}`);
              continue;
            }

            if (fsSync.existsSync(filepath)) {
              fsSync.unlinkSync(filepath);
              deletedCount++;
              console.log(`[DELETE Images] ✓ Deleted: ${filename}`);
            } else {
              errors.push(`File not found: ${filename}`);
            }
          } else if (source === 'chat') {
            // Delete from chat_images (legacy - backward compatibility)
            const filename = parts.slice(1).join('-');
            const filepath = path.join(process.cwd(), 'attached_assets', 'chat_images', filename);
            
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
              errors.push(`Invalid filename: ${filename}`);
              continue;
            }

            if (fsSync.existsSync(filepath)) {
              fsSync.unlinkSync(filepath);
              deletedCount++;
              console.log(`[DELETE Images] ✓ Deleted from chat: ${filename}`);
            } else {
              errors.push(`File not found in chat_images: ${filename}`);
            }
          } else if (source === 'pending') {
            // Delete from curation_storage/pending/ (NEW)
            const filename = parts.slice(1).join('-');
            const filepath = path.join(process.cwd(), 'curation_storage', 'pending', filename);
            
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
              errors.push(`Invalid filename: ${filename}`);
              continue;
            }

            if (fsSync.existsSync(filepath)) {
              fsSync.unlinkSync(filepath);
              deletedCount++;
              console.log(`[DELETE Images] ✓ Deleted from pending: ${filename}`);
            } else {
              errors.push(`File not found in pending: ${filename}`);
            }
          } else if (source === 'kb') {
            // Delete from kb_storage/images/ (NEW)
            const filename = parts.slice(1).join('-');
            const filepath = path.join(process.cwd(), 'kb_storage', 'images', filename);
            
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
              errors.push(`Invalid filename: ${filename}`);
              continue;
            }

            if (fsSync.existsSync(filepath)) {
              fsSync.unlinkSync(filepath);
              deletedCount++;
              console.log(`[DELETE Images] ✓ Deleted from KB: ${filename}`);
            } else {
              errors.push(`File not found in KB: ${filename}`);
            }
          } else if (source === 'doc') {
            // Images from documents - don't delete (managed by document lifecycle)
            errors.push(`Cannot delete document images directly - delete the document instead`);
          } else {
            errors.push(`Unknown source: ${source}`);
          }
        } catch (err: unknown) {
          console.error(`[DELETE Images] Error deleting ${imageId}:`, err);
          errors.push(`${imageId}: ${getErrorMessage(err)}`);
        }
      }

      console.log(`[DELETE Images] ✅ Deleted ${deletedCount} images`);
      if (errors.length > 0) {
        console.log(`[DELETE Images] ⚠️ Errors:`, errors);
      }

      res.json({ 
        success: true,
        deleted: deletedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error: unknown) {
      console.error("[DELETE Images] Error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // DELETE /api/admin/images/:filename - Delete learned image
  app.delete("/api/admin/images/:filename", requireAdmin, async (req, res) => {
    try {
      const filename = req.params.filename;
      const imagesDir = path.join(process.cwd(), 'attached_assets', 'learned_images');
      const filepath = path.join(imagesDir, filename);

      // Security: ensure filename doesn't contain path traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: "Invalid filename" });
      }

      if (!fsSync.existsSync(filepath)) {
        return res.status(404).json({ error: "Image not found" });
      }

      fsSync.unlinkSync(filepath);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ===== ADMIN: Orphan Detection =====
  
  // GET /api/admin/orphans - Detect orphaned agents
  app.get("/api/admin/orphans", requireAdmin, async (req, res) => {
    try {
      const { detectOrphanedAgents } = await import("./services/orphan-detection");
      const result = await detectOrphanedAgents();

      res.json(result);
    } catch (error) {
      console.error("Error detecting orphans:", error);
      res.status(500).json({
        error: "Failed to detect orphans",
        message: error instanceof Error ? getErrorMessage(error) : String(error),
      });
    }
  });

  // POST /api/admin/orphans/auto-fix - Auto-fix agents with invalid namespaces (SAFE)
  app.post("/api/admin/orphans/auto-fix", requireAdmin, async (req, res) => {
    try {
      const { autoFixOrphanedAgents } = await import("./services/orphan-detection");
      const result = await autoFixOrphanedAgents();

      res.json({
        success: true,
        message: `Auto-fixed ${result.fixed} agent(s), ${result.skipped} require manual review`,
        ...result,
      });
    } catch (error) {
      console.error("Error auto-fixing orphans:", error);
      res.status(500).json({
        error: "Failed to auto-fix orphans",
        message: error instanceof Error ? getErrorMessage(error) : String(error),
      });
    }
  });

  // GET /api/admin/orphans/platform-scan - Scan ALL modules for orphans
  app.get("/api/admin/orphans/platform-scan", requireAdmin, async (req, res) => {
    try {
      const { platformOrphanScanner } = await import("./services/platform-orphan-scan");
      const report = await platformOrphanScanner.scanAll();

      res.json({
        success: true,
        report,
        formatted: platformOrphanScanner.formatReport(report),
      });
    } catch (error) {
      console.error("Error scanning platform orphans:", error);
      res.status(500).json({
        error: "Failed to scan platform orphans",
        message: error instanceof Error ? getErrorMessage(error) : String(error),
      });
    }
  });

  // POST /api/admin/crawl-website - Deep crawl entire website
  // Crawls all sublinks, extracts text + images with Vision API descriptions
  // Sends everything to curation queue (HITL)
  app.post("/api/admin/crawl-website", requireAdmin, async (req, res) => {
    try {
      const { url, namespace, maxDepth, maxPages, consolidatePages } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      console.log(`[API] 🕷️ Deep crawl solicitado: ${url}`);
      if (consolidatePages) {
        console.log(`[API] 📦 Modo: CONSOLIDADO (todas as páginas em um único conhecimento)`);
      } else {
        console.log(`[API] 📄 Modo: SEPARADO (cada página vira um conhecimento)`);
      }

      // Import e executa crawler
      const { websiteCrawlerService } = await import("./learn/website-crawler-service");
      
      const result = await websiteCrawlerService.crawlWebsite({
        url,
        namespace,
        maxDepth,
        maxPages,
        consolidatePages
      });

      return res.json({
        success: true,
        message: `Website crawleado com sucesso! ${result.totalPages} páginas processadas.`,
        result
      });

    } catch (error: unknown) {
      console.error("[API] Erro ao crawlear website:", error);
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/learn-from-url - Crawl website (single page or deep crawl)
  // NOVO: Suporta 2 modos: "single" (apenas a página) ou "deep" (crawl completo)
  // ENTERPRISE FIX: URL validation + normalization with auto-protocol
  app.post("/api/admin/learn-from-url", requireAdmin, async (req, res) => {
    try {
      const { 
        url, 
        namespace, 
        mode = "single", // "single" | "deep"
        downloadMedia = false,
        maxDepth, 
        maxPages 
      } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // ✅ ENTERPRISE: Validate & normalize URL (auto-prepend https://)
      const { validateAndNormalizeUrl } = await import("./utils/url-validation");
      const validation = validateAndNormalizeUrl(url);
      
      if (!validation.valid) {
        console.log(`[API] ❌ Invalid URL: ${url} → ${validation.error}`);
        return res.status(400).json({ 
          error: validation.error,
          hint: "URL must include protocol (e.g., https://example.com)"
        });
      }

      const normalizedUrl = validation.normalized!;
      const isSinglePage = mode === "single";
      const crawlType = isSinglePage ? "single-page scan" : "deep crawl";
      
      console.log(`[API] 🚀 Criando job de ${crawlType} para: ${normalizedUrl}`);
      if (validation.warning) {
        console.log(`[API]    ⚠️  ${validation.warning}`);
      }
      console.log(`[API]    Mode: ${mode}, Download Media: ${downloadMedia}`);
      
      // NOVO: Cria job assíncrono com normalized URL
      const { linkCaptureJobs, insertLinkCaptureJobSchema } = await import("@shared/schema");
      const { db } = await import("./db");
      
      const [job] = await db.insert(linkCaptureJobs).values({
        url: normalizedUrl, // ✅ Use normalized URL (with protocol)
        status: "pending" as const,
        metadata: {
          namespace: namespace || 'kb/web',
          mode: mode,
          maxDepth: isSinglePage ? 0 : (maxDepth || 5), // 0 = single page only
          maxPages: isSinglePage ? 1 : (maxPages || 100),
          includeImages: downloadMedia,
          submittedBy: "admin"
        }
      }).returning();

      console.log(`[API] ✅ Job ${job.id} criado: ${crawlType} com ${downloadMedia ? 'mídia' : 'apenas texto'}`);

      res.json({ 
        message: `Job de ${crawlType} criado! Acompanhe o progresso em Jobs.`,
        jobId: job.id,
        mode: mode,
        downloadMedia: downloadMedia,
        status: "job_created",
        normalizedUrl, // ✅ Return normalized URL so frontend can show it
        warning: validation.warning, // ✅ Return warning if protocol was auto-added
        job
      });
    } catch (error: unknown) {
      console.error("[API] ❌ Erro ao crawlear URL:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/upload-files - Upload and process multiple files
  // HITL FIX: All uploaded files go through curation queue
  app.post("/api/admin/upload-files", requireAdmin, upload.array("files", 20), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      // ✅ FIX P0-6: Validate ALL uploaded files using magic bytes
      const { validateDocumentUpload } = await import("./utils/file-validation");
      
      for (const file of files) {
        const validation = await validateDocumentUpload(file.path);
        if (!validation.valid) {
          // Clean up ALL temp files before returning error
          for (const f of files) {
            await fs.unlink(f.path).catch(() => {});
          }
          return res.status(400).json({ 
            error: `File validation failed for ${file.originalname}: ${validation.error}` 
          });
        }
      }

      // Import curation store
      const { curationStore } = await import("./curation/store");

      const submittedItems = [];
      const errors = [];

      for (const file of files) {
        try {
          // Determine MIME type from original filename
          const ext = path.extname(file.originalname).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel',
            '.xml': 'application/xml',
            '.csv': 'text/csv',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
          };

          const mimeType = mimeTypes[ext] || file.mimetype;

          // Process file
          const processed = await fileProcessor.processFile(file.path, mimeType);

          if (processed.error) {
            errors.push({ filename: file.originalname, error: processed.error });
            continue;
          }

          // Log extraction stats
          const charCount = processed.extractedText.length;
          const wordCount = processed.extractedText.split(/\s+/).length;
          console.log(`[Upload] ${file.originalname}:`);
          console.log(`  - File size: ${(processed.size / 1024).toFixed(2)} KB`);
          console.log(`  - Extracted: ${charCount.toLocaleString()} characters`);
          console.log(`  - Estimated: ${wordCount.toLocaleString()} words`);
          console.log(`  - Pages: ${processed.metadata?.pages || 'N/A'}`);

          // Add to curation queue instead of direct KB publish
          const item = await curationStore.addToCuration({
            title: file.originalname,
            content: processed.extractedText,
            suggestedNamespaces: ["kb/uploads"],
            tags: ["upload", "file", mimeType],
            submittedBy: "admin",
          });

          submittedItems.push({
            filename: file.originalname,
            curationId: item.id,
            size: processed.size,
            charCount,
            wordCount,
          });

          // Clean up temp file
          await fs.unlink(file.path).catch(() => {});
        } catch (error: unknown) {
          console.error(`Error processing ${file.originalname}:`, error);
          errors.push({ filename: file.originalname, error: getErrorMessage(error) });
        }
      }

      res.json({
        success: true,
        message: `${submittedItems.length} files submitted to curation queue for human review`,
        submitted: submittedItems.length,
        items: submittedItems,
        errors: errors.length > 0 ? errors : undefined,
        status: "pending_approval"
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/learn-from-youtube - Extract YouTube video transcript
  // HITL: Transcript goes through curation queue for human review
  app.post("/api/admin/learn-from-youtube", requireAdmin, async (req, res) => {
    try {
      const { url, namespace, title } = req.body;

      if (!url) {
        return res.status(400).json({ error: "YouTube URL is required" });
      }

      console.log(`[API] 📹 YouTube transcript requested: ${url}`);

      // Import YouTube service
      const { fetchYouTubeTranscript, isYouTubeUrl } = await import("./learn/youtube-transcript-service");

      // Validate YouTube URL
      if (!isYouTubeUrl(url)) {
        return res.status(400).json({ error: "Invalid YouTube URL" });
      }

      // Fetch transcript
      const videoInfo = await fetchYouTubeTranscript(url);

      // Import curation store
      const { curationStore } = await import("./curation/store");

      // Add to curation queue
      const item = await curationStore.addToCuration({
        title: title || `YouTube Video: ${videoInfo.videoId}`,
        content: videoInfo.transcript,
        suggestedNamespaces: [namespace || "kb/youtube"],
        tags: ["youtube", videoInfo.videoId, url],
        submittedBy: "youtube-import",
      });

      console.log(`[API] ✅ YouTube transcript submitted to curation queue:`, {
        videoId: videoInfo.videoId,
        wordCount: videoInfo.wordCount,
        curationId: item.id,
      });

      res.json({
        success: true,
        message: `YouTube transcript submitted to curation queue for human review (${videoInfo.wordCount} words)`,
        videoId: videoInfo.videoId,
        curationId: item.id,
        stats: {
          wordCount: videoInfo.wordCount,
          duration: videoInfo.duration,
        },
        status: "pending_approval"
      });
    } catch (error: unknown) {
      console.error("[API] ❌ Erro ao processar YouTube:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/admin/web-search-learn - Search web and learn
  // HITL FIX: All web search results go through curation queue
  app.post("/api/admin/web-search-learn", requireAdmin, async (req, res) => {
    try {
      const { query } = req.body;

      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      // Use SearchWeb tool to find results
      const searchObservation = await agentTools.SearchWeb({ query });
      
      // Parse results (SearchWeb returns AgentObservation with observation field)
      const results = JSON.parse(searchObservation.observation);
      
      // Import curation store
      const { curationStore } = await import("./curation/store");
      const submittedItems = [];

      // Fetch and submit top 10 results to curation queue
      for (const result of results.results.slice(0, 10)) {
        try {
          const response = await axios.get(result.url, { timeout: 15000 });
          const cheerio = await import("cheerio");
          const $ = cheerio.load(response.data);

          // More aggressive content extraction
          $("script, style, nav, footer, header, aside, .advertisement, .ad, .sidebar").remove();
          const content = $("body").text().replace(/\s+/g, " ").trim();

          if (content.length > 100) {
            // Allow up to 1 million characters for deep vertical learning
            const finalContent = content.length > 1000000 ? content.substring(0, 1000000) : content;
            
            // Add to curation queue instead of direct KB publish
            const item = await curationStore.addToCuration({
              title: result.title,
              content: finalContent,
              suggestedNamespaces: ["kb/web-search"],
              tags: ["web-search", query, result.url],
              submittedBy: "web-search",
            });

            submittedItems.push({
              url: result.url,
              title: result.title,
              curationId: item.id,
              contentLength: finalContent.length,
            });
          }
        } catch (err) {
          console.error(`Failed to fetch ${result.url}:`, err);
        }
      }

      res.json({ 
        message: `${submittedItems.length} web results submitted to curation queue for human review`,
        query,
        submitted: submittedItems.length, 
        items: submittedItems,
        status: "pending_approval"
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/documents (list documents)
  app.get("/api/documents", requireAuth, async (req, res) => {
    try {
      const documents = await storage.getDocuments(100);
      res.json({ documents });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/agent/hierarchical_plan (hierarchical planning)
  app.post("/api/agent/hierarchical_plan", requireAuth, async (req, res) => {
    try {
      const { goal, conversation_id, message_id } = req.body;
      
      const plan = await hierarchicalPlanner.decomposeGoal(goal);
      
      const tools = new Map(Object.entries(agentTools).map(([name, fn]) => [
        name,
        async (input: unknown) => (fn as any)(input),
      ]));
      
      const result = await hierarchicalPlanner.executePlan(
        plan,
        conversation_id || 1,
        message_id || 1,
        tools
      );
      
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // CONTENT GENERATION - Images, Text, Video (NO CENSORSHIP)
  // ============================================================================
  
  // POST /api/generate/image - Generate image using DALL-E 3
  app.post("/api/generate/image", requireAuth, async (req, res) => {
    try {
      const { prompt, size, quality, style, conversation_id } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      
      console.log(`[API] Generating image: "${prompt.slice(0, 60)}..."`);
      
      // Generate image
      const result = await imageGenerator.generateImage({
        prompt,
        size: size || "1024x1024",
        quality: quality || "hd",
        style: style || "vivid",
      });
      
      // Calculate expiry (1 hour from now)
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      
      // Save to database
      const fileRecord = await storage.createGeneratedFile({
        conversationId: conversation_id || null,
        filename: path.basename(result.localPath),
        mimeType: "image/png",
        fileType: "image",
        size: (await fs.stat(result.localPath)).size,
        storageUrl: result.localPath,
        generationPrompt: prompt,
        generationMethod: "dall-e-3",
        metadata: {
          width: result.width,
          height: result.height,
          revisedPrompt: result.revisedPrompt,
        },
        expiresAt,
        isDeleted: false,
      });
      
      console.log(`[API] ✓ Image generated: ${fileRecord.filename}`);
      
      res.json({
        success: true,
        file: {
          id: fileRecord.id,
          filename: fileRecord.filename,
          fileType: fileRecord.fileType,
          url: `/api/files/${fileRecord.id}`,
          metadata: fileRecord.metadata,
          expiresAt: fileRecord.expiresAt,
        },
      });
    } catch (error: unknown) {
      console.error(`[API] Error generating image:`, getErrorMessage(error));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // POST /api/generate/text - Generate text file (code, markdown, etc)
  app.post("/api/generate/text", requireAuth, async (req, res) => {
    try {
      const { content, filename, language, conversation_id } = req.body;
      
      if (!content || !filename) {
        return res.status(400).json({ error: "Content and filename are required" });
      }
      
      // Save to local storage
      const storageDir = path.join(process.cwd(), "server", "generated");
      await fs.mkdir(storageDir, { recursive: true });
      
      const filePath = path.join(storageDir, filename);
      await fs.writeFile(filePath, content, "utf-8");
      
      const stats = await fs.stat(filePath);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      
      // Determine MIME type
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".json": "application/json",
        ".js": "text/javascript",
        ".ts": "text/typescript",
        ".py": "text/x-python",
        ".html": "text/html",
        ".css": "text/css",
      };
      const mimeType = mimeTypes[ext] || "text/plain";
      
      const fileRecord = await storage.createGeneratedFile({
        conversationId: conversation_id || null,
        filename,
        mimeType,
        fileType: language ? "code" : "text",
        size: stats.size,
        storageUrl: filePath,
        generationPrompt: `Generated ${filename}`,
        generationMethod: "manual",
        metadata: language ? { language } : {},
        expiresAt,
        isDeleted: false,
      });
      
      res.json({
        success: true,
        file: {
          id: fileRecord.id,
          filename: fileRecord.filename,
          fileType: fileRecord.fileType,
          url: `/api/files/${fileRecord.id}`,
          expiresAt: fileRecord.expiresAt,
        },
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/files/:id - Download generated file
  app.get("/api/files/:id", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: fileId } = params;
      const file = await storage.getGeneratedFile(fileId);
      
      if (!file || file.isDeleted) {
        return res.status(404).json({ error: "File not found or deleted" });
      }
      
      // Check if expired
      if (new Date() > file.expiresAt) {
        await storage.markFileAsDeleted(fileId);
        return res.status(410).json({ error: "File expired" });
      }
      
      // Serve file
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);
      
      const fileBuffer = await fs.readFile(file.storageUrl);
      res.send(fileBuffer);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/files/:id/download - Force download
  app.get("/api/files/:id/download", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: fileId } = params;
      const file = await storage.getGeneratedFile(fileId);
      
      if (!file || file.isDeleted) {
        return res.status(404).json({ error: "File not found" });
      }
      
      if (new Date() > file.expiresAt) {
        await storage.markFileAsDeleted(fileId);
        return res.status(410).json({ error: "File expired" });
      }
      
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
      
      const fileBuffer = await fs.readFile(file.storageUrl);
      res.send(fileBuffer);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // ============================================================================
  // VIDEO GENERATION ROUTES - Professional GPU-backed video generation
  // ============================================================================
  
  // POST /api/videos/generate - Submit video generation job
  app.post("/api/videos/generate", requireAuth, async (req, res) => {
    try {
      const {
        prompt,
        duration,
        fps,
        resolution,
        style,
        scenes,
        audio,
        voiceId,
        model,
        conversation_id,
      } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      
      const result = await videoGenerator.submitVideoJob({
        prompt,
        duration,
        fps,
        resolution,
        style,
        scenes,
        audio,
        voiceId,
        model,
        conversationId: conversation_id,
      });
      
      res.json({
        success: true,
        job: result,
      });
    } catch (error: unknown) {
      console.error("[API] Video generation failed:", getErrorMessage(error));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/videos/jobs/:id - Get video job status
  app.get("/api/videos/jobs/:id", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: jobId } = params;
      const status = await videoGenerator.getJobStatus(jobId);
      res.json(status);
    } catch (error: unknown) {
      res.status(404).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/videos/:id - Download video asset
  app.get("/api/videos/:id", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: assetId } = params;
      const asset = await storage.getVideoAsset(assetId);
      
      if (!asset || asset.isDeleted) {
        return res.status(404).json({ error: "Video not found or deleted" });
      }
      
      if (new Date() > asset.expiresAt) {
        await storage.markVideoAssetAsDeleted(assetId);
        return res.status(410).json({ error: "Video expired" });
      }
      
      // Serve video
      res.setHeader("Content-Type", asset.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${asset.filename}"`);
      
      const videoBuffer = await fs.readFile(asset.storageUrl);
      res.send(videoBuffer);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // POST /api/videos/webhook - Webhook for GPU workers
  app.post("/api/videos/webhook", async (req, res) => {
    try {
      const {
        job_id,
        status,
        video_url,
        thumbnail_url,
        duration,
        resolution,
        fps,
        size_bytes,
        error,
        metadata,
      } = req.body;
      
      const job = await storage.getVideoJob(job_id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      if (status === "completed" && video_url) {
        // Download video from worker storage
        const videoResponse = await axios.get(video_url, { responseType: "arraybuffer" });
        const videoBuffer = Buffer.from(videoResponse.data);
        
        // Save to local storage
        const filename = `video_${job_id}_${Date.now()}.mp4`;
        const storageDir = path.join(process.cwd(), "server", "generated", "videos");
        await fs.mkdir(storageDir, { recursive: true });
        const filepath = path.join(storageDir, filename);
        await fs.writeFile(filepath, videoBuffer);
        
        // Create video asset
        const asset = await storage.createVideoAsset({
          jobId: job.id,
          filename,
          mimeType: "video/mp4",
          size: size_bytes || videoBuffer.length,
          storageUrl: filepath,
          duration: duration || 30,
          resolution: resolution || "1920x1080",
          fps: fps || 24,
          codec: "h264",
          bitrate: null,
          generationMethod: (job.parameters as any).model || "open-sora",
          prompt: job.prompt,
          revisedPrompt: null,
          thumbnailUrl: thumbnail_url || null,
          subtitlesUrl: null,
          qualityScore: metadata?.quality_score || null,
          metadata: metadata || {},
          expiresAt: new Date(Date.now() + 3600000), // 1 hour
          isDeleted: false,
        });
        
        // Update job
        await storage.updateVideoJob(job_id, {
          status: "completed",
          progress: 100,
          currentStep: "completed",
          completedAt: new Date(),
        });
        
        console.log(`[VideoGen] Job #${job_id} completed via webhook`);
      } else if (status === "failed") {
        await storage.updateVideoJob(job_id, {
          status: "failed",
          errorMessage: error || "Worker reported failure",
          currentStep: "failed",
        });
        
        console.error(`[VideoGen] Job #${job_id} failed:`, error);
      }
      
      res.json({ success: true });
    } catch (error: unknown) {
      console.error("[API] Webhook processing failed:", getErrorMessage(error));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // CONVERSATIONS & MESSAGES - Chat persistence with Replit Auth
  // ============================================================================
  
  // GET /api/auth/user - Get current user info or null (supports both OAuth and Local auth)
  app.get("/api/auth/user", optionalAuth, async (req, res) => {
    try {
      const user = req.user as Record<string, unknown>;
      const userId = getUserId(req);
      
      if (!userId) {
        return res.json(null);
      }
      
      // PRODUCTION: Support both OAuth and Local authentication
      let userData: Record<string, unknown>;
      
      if (user.isLocal) {
        // Local authentication - user data is already in session
        userData = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          authProvider: 'local',
        };
      } else {
        // OAuth authentication - fetch from database
        userData = (await storage.getUser(userId)) || {};
      }
      
      // SECURITY: Load user roles for RBAC
      const { userRoles: userRolesTable, roles: rolesTable } = await import("../shared/schema");
      const userRolesList = await db
        .select({
          roleId: userRolesTable.roleId,
          roleName: rolesTable.name,
        })
        .from(userRolesTable)
        .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
        .where(eq(userRolesTable.userId, userId));
      
      const userWithRoles = {
        ...userData,
        roles: userRolesList.map(r => r.roleName),
        isAdmin: userRolesList.some(r => 
          r.roleName === 'Super Admin' || 
          r.roleName === 'Admin' || 
          r.roleName === 'Content Manager'
        ),
      };
      
      res.json(userWithRoles || null);
    } catch (error: unknown) {
      console.error('[Auth] Error fetching user:', error);
      res.json(null);
    }
  });
  
  // GET /api/conversations - List conversations (user's if logged in, empty for anonymous)
  app.get("/api/conversations", optionalAuth, async (req, res) => {
    try {
      // PRODUCTION: Support both OAuth and Local auth
      const userId = getUserId(req);
      
      // Only authenticated users can list conversations
      if (!userId) {
        // Anonymous users don't have persistent conversations
        return res.json([]);
      }
      const conversationsWithCount = await storage.getConversationsWithMessageCount(userId, 50);
      
      res.json(conversationsWithCount);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // POST /api/conversations - Create new conversation
  app.post("/api/conversations", optionalAuth, async (req, res) => {
    try {
      const { title } = req.body;
      
      // PRODUCTION: Support both OAuth and Local auth
      const userId = getUserId(req);
      
      const conversation = await storage.createConversation({
        userId: userId || undefined,
        title: title || "New Conversation",
      });
      
      res.json(conversation);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/conversations/:id - Get conversation (with strict ownership check)
  app.get("/api/conversations/:id", optionalAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: conversationId } = params;
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      // PRODUCTION: Support both OAuth and Local auth
      const userId = getUserId(req);
      
      // Anonymous conversations (userId null) are not accessible - no way to verify ownership
      if (!conversation.userId) {
        return res.status(403).json({ error: "Forbidden: Anonymous conversations not accessible" });
      }
      
      // Only the owner can access their conversation
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Forbidden: You don't own this conversation" });
      }
      
      res.json(conversation);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/conversations/:id/messages - Get messages (with strict ownership check)
  app.get("/api/conversations/:id/messages", optionalAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: conversationId } = params;
      
      // Verify ownership first
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      // PRODUCTION: Support both OAuth and Local auth
      const userId = getUserId(req);
      
      // Anonymous conversations (userId null) are not accessible - no way to verify ownership
      if (!conversation.userId) {
        return res.status(403).json({ error: "Forbidden: Anonymous conversations not accessible" });
      }
      
      // Only the owner can access their conversation's messages
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Forbidden: You don't own this conversation" });
      }
      
      const messages = await storage.getMessagesByConversation(conversationId);
      
      res.json(messages);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // POST /api/conversations/:id/messages - Save message
  app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
    const startTime = Date.now();
    
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: conversationId } = params;
      const { role, content, attachments, tool_calls, metadata } = req.body;
      
      const message = await storage.createMessage({
        conversationId,
        role,
        content,
        attachments: attachments || undefined,
        toolCalls: tool_calls || undefined,
        metadata: metadata || undefined,
      });
      
      // Auto-generate conversation title from first user message
      if (role === "user" && content) {
        const messagesCount = await storage.countMessagesByConversation(conversationId);
        
        // If this is the first message, generate title
        if (messagesCount === 1) {
          const conversation = await storage.getConversation(conversationId);
          
          // Only update if title is still default and content is not empty
          const trimmedContent = content.trim();
          if (conversation && 
              (conversation.title === "New Conversation" || conversation.title === "New Chat") &&
              trimmedContent.length > 0) {
            // Use first 50 characters as title
            const autoTitle = trimmedContent.substring(0, 50) + (trimmedContent.length > 50 ? "..." : "");
            
            await storage.updateConversation(conversationId, {
              title: autoTitle
            });
          }
        }
      }
      
      // 🧠 HITL ENFORCEMENT - Send to curation queue (ZERO bypass policy)
      // Trigger after ASSISTANT messages (conversation turn complete)
      if (role === "assistant" && content) {
        try {
          const { autoLearningListener } = await import("./events/auto-learning-listener");
          
          // Get all messages to find last user message
          const allMessages = await storage.getMessagesByConversation(conversationId);
          
          // Find the last user message (the one before this assistant message)
          const lastUserMsg = allMessages
            .filter(m => m.role === "user")
            .slice(-1)[0];
          
          if (lastUserMsg) {
            // Send to curation queue (HITL mandatory)
            await autoLearningListener.onChatCompleted({
              conversationId,
              userMessage: lastUserMsg.content,
              assistantResponse: content,
              source: metadata?.source || "openai",
              provider: metadata?.provider,
            });
          }
        } catch (collectorError: unknown) {
          // Don't fail the request if collection fails
          console.error('[HITL] Failed to send to curation queue:', getErrorMessage(collectorError));
        }
      }
      
      // ✅ PRODUCTION-READY: Track message save in PostgreSQL
      const latency = Date.now() - startTime;
      await queryMonitor.recordQuery(
        "message",
        "conversation",
        latency,
        true,
        undefined,
        { conversationId, role, hasAttachments: !!attachments }
      );
      
      res.json(message);
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      
      // ✅ Track error
      await queryMonitor.recordQuery(
        "message",
        "conversation",
        latency,
        false,
        getErrorMessage(error),
        undefined
      );
      
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // DELETE /api/conversations/:id - Delete conversation (with strict ownership check)
  app.delete("/api/conversations/:id", optionalAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: conversationId } = params;
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      // PRODUCTION: Support both OAuth and Local auth
      const userId = getUserId(req);
      
      // If conversation has userId, only that user can delete it
      if (conversation.userId) {
        if (!userId || conversation.userId !== userId) {
          return res.status(403).json({ error: "Forbidden: You don't own this conversation" });
        }
      } else {
        // Anonymous conversations cannot be deleted (no way to verify ownership)
        return res.status(403).json({ error: "Forbidden: Cannot delete anonymous conversations" });
      }
      
      await storage.deleteConversation(conversationId);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // PROJECT ROUTES - ChatGPT-style project organization
  // ============================================================================
  
  // GET /api/projects - List user's projects
  app.get("/api/projects", optionalAuth, async (req, res) => {
    try {
      // PRODUCTION: Support both OAuth and Local auth
      const userId = getUserId(req);
      
      if (!userId) {
        return res.json([]);
      }
      const projects = await storage.getProjectsByUser(userId);
      
      res.json(projects);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // POST /api/projects - Create new project
  app.post("/api/projects", optionalAuth, async (req, res) => {
    try {
      // PRODUCTION: Support both OAuth and Local auth
      const userId = getUserId(req);
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required to create projects" });
      }
      const { name, description } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Project name is required" });
      }
      
      const project = await storage.createProject({
        userId,
        name: name.trim(),
        description: description?.trim() || undefined,
      });
      
      res.json(project);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // PATCH /api/projects/:id - Update project
  app.patch("/api/projects/:id", optionalAuth, async (req, res) => {
    try {
      // PRODUCTION: Support both OAuth and Local auth
      const userId = getUserId(req);
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: projectId } = params;
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (project.userId !== userId) {
        return res.status(403).json({ error: "Forbidden: You don't own this project" });
      }
      
      const { name, description } = req.body;
      const updated = await storage.updateProject(projectId, {
        name: name?.trim(),
        description: description?.trim(),
      });
      
      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // DELETE /api/projects/:id - Delete project
  app.delete("/api/projects/:id", optionalAuth, async (req, res) => {
    try {
      // PRODUCTION: Support both OAuth and Local auth
      const userId = getUserId(req);
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: projectId } = params;
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (project.userId !== userId) {
        return res.status(403).json({ error: "Forbidden: You don't own this project" });
      }
      
      await storage.deleteProject(projectId);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // AGENT CHAT ENDPOINT - Automatic tool usage (SearchVideos, SearchWeb, etc)
  // ============================================================================
  
  // Helper: Detect explicit source request keywords
  function detectExplicitSourceRequest(message: string): {
    source: 'web' | 'kb' | 'free-apis' | null;
    cleanQuery: string;
  } {
    const normalized = message.toLowerCase();
    
    // Web/Internet keywords (Portuguese + English)
    const webKeywords = [
      'consulte na internet', 'pesquise na internet', 'busque na internet',
      'consulte na web', 'pesquise na web', 'busque na web',
      'consulte no google', 'pesquise no google', 'busque no google',
      'procure na internet', 'procure na web', 'search the internet',
      'search the web', 'search google', 'look up online'
    ];
    
    // Knowledge Base keywords
    const kbKeywords = [
      'consulte na knowledge base', 'pesquise na knowledge base',
      'consulte na kb', 'pesquise na kb',
      'consulte na base de conhecimento', 'pesquise na base de conhecimento',
      'search knowledge base', 'search kb'
    ];
    
    // Check KB
    for (const keyword of kbKeywords) {
      if (normalized.includes(keyword)) {
        return { 
          source: 'kb', 
          cleanQuery: message.replace(new RegExp(keyword, 'gi'), '').trim() 
        };
      }
    }
    
    // Check Web
    for (const keyword of webKeywords) {
      if (normalized.includes(keyword)) {
        return { 
          source: 'web', 
          cleanQuery: message.replace(new RegExp(keyword, 'gi'), '').trim() 
        };
      }
    }
    
    return { source: null, cleanQuery: message };
  }
  
  // POST /api/agent/chat - Agent-powered chat with automatic tool usage
  app.post("/api/agent/chat", requireAuth, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { messages, maxIterations, language } = req.body;
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array is required" });
      }
      
      console.log(`[Agent Chat] Starting ReAct cycle with ${messages.length} messages`);
      
      // Get policy
      const policy = await enforcementPipeline.getOrCreateDefaultPolicy();
      
      // Get last user message (normalize to string)
      const lastUserContent3 = messages[messages.length - 1]?.content || '';
      const lastUserMessage = extractTextContent(lastUserContent3);
      
      // ✅ FIX BUG #2: Use frontend-detected language or auto-detect from message
      const detectedLanguage = language || autoDetectLanguage(lastUserMessage);
      console.log(`[Agent Chat] Language: ${detectedLanguage} ${!language ? '(auto-detected)' : '(frontend)'}`);
      
      // 🎯 EXPLICIT SOURCE DETECTION: Check if user explicitly requested a specific source
      const explicitRequest = detectExplicitSourceRequest(lastUserMessage);
      
      if (explicitRequest.source) {
        console.log(`[Explicit Request] User requested ${explicitRequest.source.toUpperCase()} search`);
        console.log(`[Explicit Request] Clean query: "${explicitRequest.cleanQuery}"`);
        
        // Call priority orchestrator with forced source
        const orchestratorRequest = {
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content
          })),
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 4000,
          unrestricted: true,  // Always allow when user explicitly requests a source
          forcedSource: explicitRequest.source,  // Force specific source
          language: detectedLanguage as "pt-BR" | "en-US" | "es-ES"  // 🔥 FIX: Pass detected language for multi-language support
        };
        
        const orchestratorResult = await generateWithPriority(orchestratorRequest);
        
        const latency = Date.now() - startTime;
        metricsCollector.recordLatency(latency);
        
        // 🧠 CRITICAL HITL: Send explicit request to curation queue
        try {
          const { autoLearningListener } = await import('./events/auto-learning-listener');
          
          autoLearningListener.onChatCompleted({
            conversationId: null,
            userMessage: explicitRequest.cleanQuery || lastUserMessage,
            assistantResponse: orchestratorResult.content,
            source: explicitRequest.source === 'free-apis' ? 'free-api' : explicitRequest.source,
            provider: orchestratorResult.provider,
          }).catch((err: unknown) => {
            console.error('[HITL] Failed to send explicit request to curation:', getErrorMessage(err));
          });
        } catch (autoLearnError: unknown) {
          console.error('[HITL] Curation system unavailable:', getErrorMessage(autoLearnError));
        }
        
        return res.json({
          choices: [{ 
            message: { 
              role: "assistant", 
              content: orchestratorResult.content 
            }, 
            finish_reason: "stop" 
          }],
          agent: {
            used: false,
            explicitSource: explicitRequest.source
          }
        });
      }
      
      // Create tools Map
      const tools = new Map(Object.entries(agentTools).map(([name, fn]) => [
        name,
        async (input: unknown) => (fn as any)(input),
      ]));
      
      // Configure max iterations
      reactEngine.configure({ maxSteps: maxIterations || 5 });
      
      // Run ReAct agent (needs conversationId and messageId for tracking)
      const result = await reactEngine.execute(
        lastUserMessage,
        1, // conversationId (temporary, can be enhanced later)
        1, // messageId (temporary)
        tools
      );
      
      // Handle max steps reached (no finalAnswer)
      let agentResponse = result.finalAnswer || '';
      
      if (!agentResponse && result.stopReason === 'max_steps') {
        // Generate summary from agent steps
        const lastSteps = result.steps.slice(-2); // Last 2 steps
        const observations = lastSteps
          .map(s => {
            // Ensure observation is always a string, not an object
            if (typeof s.observation === 'string') {
              return s.observation;
            } else if (s.observation && typeof s.observation === 'object') {
              return JSON.stringify(s.observation, null, 2);
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');
        
        agentResponse = observations 
          ? `Consegui obter algumas informações:\n\n${observations}\n\nPreciso de mais passos para uma resposta completa. Você pode reformular a pergunta ou pedir informações mais específicas?`
          : 'Tentei processar sua solicitação mas atingi o limite de etapas. Por favor, reformule sua pergunta de forma mais específica.';
      }
      
      // Check fallback
      const fallbackResult = await autoFallback.checkAndExecuteFallback(
        agentResponse,
        lastUserMessage,
        policy
      );
      
      const finalContent = fallbackResult.content;
      const latency = Date.now() - startTime;
      
      metricsCollector.recordLatency(latency);
      
      // ✅ PRODUCTION-READY: Track agent usage in PostgreSQL
      await usageTracker.trackAgentUse(
        "react-agent",
        "ReAct Agent",
        "query",
        { 
          query: lastUserMessage,
          steps: result.totalSteps,
          success: result.success,
          stopReason: result.stopReason
        },
        "agent", // Root agent
        undefined // No parent
      );
      
      // ✅ PRODUCTION-READY: Record query metrics in PostgreSQL
      await queryMonitor.recordQuery(
        "chat",
        "react-agent",
        latency,
        result.success,
        undefined,
        { totalSteps: result.totalSteps, stopReason: result.stopReason }
      );
      
      // 🧠 CRITICAL HITL: Send to curation queue
      // Ensures ALL chat responses go through human review before KB indexing
      try {
        const { autoLearningListener } = await import('./events/auto-learning-listener');
        
        // Fire and forget - não bloquear resposta
        autoLearningListener.onChatCompleted({
          conversationId: null, // Sem ID de conversa para chats standalone
          userMessage: lastUserMessage,
          assistantResponse: finalContent,
          source: fallbackResult.usedFallback ? 'web' : 'openai',
          provider: fallbackResult.usedFallback ? 'automatic-fallback' : 'react-agent',
        }).catch((err: unknown) => {
          console.error('[HITL] Failed to send to curation queue:', getErrorMessage(err));
        });
      } catch (autoLearnError: unknown) {
        // Não falhar a requisição se curadoria falhar
        console.error('[HITL] Curation system unavailable:', getErrorMessage(autoLearnError));
      }
      
      res.json({
        choices: [{ 
          message: { 
            role: "assistant", 
            content: finalContent 
          }, 
          finish_reason: "stop" 
        }],
        agent: {
          used: true,
          totalSteps: result.totalSteps,
          success: result.success,
          stopReason: result.stopReason,
        },
        fallback: fallbackResult.usedFallback ? {
          used: true,
          sourcesIndexed: fallbackResult.sourcesIndexed,
          searchQuery: fallbackResult.searchQuery,
        } : undefined,
      });
    } catch (error: unknown) {
      metricsCollector.recordError();
      
      // ✅ PRODUCTION-READY: Track error in PostgreSQL
      const latency = Date.now() - startTime;
      await queryMonitor.recordQuery(
        "chat",
        "react-agent",
        latency,
        false,
        getErrorMessage(error),
        undefined
      );
      
      console.error('[Agent Chat] Error:', error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========================================================================
  // FREE APIs & GPU ORCHESTRATION - AION Supreme
  // ========================================================================

  // GET /api/free-apis/status - Get status of all free API providers
  app.get("/api/free-apis/status", async (req, res) => {
    try {
      const { getUsageStats } = await import("./llm/free-apis");
      const stats = getUsageStats();
      res.json(stats);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========================================================================
  // GPU POOL MANAGEMENT - MOVED TO server/routes/gpu.ts
  // ========================================================================
  // All GPU routes have been moved to the modular system in server/routes/gpu.ts
  // New endpoints use PostgreSQL database instead of gpuPoolManager
  // Available routes:
  //   - POST /api/gpu/workers/register
  //   - POST /api/gpu/workers/heartbeat  
  //   - GET  /api/gpu/workers
  //   - GET  /api/gpu/quota/status
  //   - POST /api/gpu/quota/record
  //   - POST /api/gpu/quota/reset

  // ========================================================================
  // FEDERATED LEARNING SYSTEM - Distributed Training with Multi-GPU
  // ========================================================================

  // POST /api/training/jobs - Create new federated training job
  app.post("/api/training/jobs", requireAuth, async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { trainingJobs, insertTrainingJobSchema } = await import("../shared/schema");
      const { db } = await import("./db");
      
      const [job] = await db.insert(trainingJobs).values(req.body).returning();
      
      console.log(`[Federated] Created training job: ${job.name} (ID ${job.id})`);
      
      // ✅ PRODUCTION-READY: Track training job creation in PostgreSQL
      const latency = Date.now() - startTime;
      await queryMonitor.recordQuery(
        "training",
        "job-create",
        latency,
        true,
        undefined,
        { jobId: job.id, jobName: job.name }
      );
      
      res.json({ job });
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      
      // ✅ Track error
      await queryMonitor.recordQuery(
        "training",
        "job-create",
        latency,
        false,
        getErrorMessage(error),
        undefined
      );
      
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/jobs - List all training jobs
  app.get("/api/training/jobs", requireAuth, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { trainingJobs } = await import("../shared/schema");
      const { desc } = await import("drizzle-orm");
      
      const jobs = await db.query.trainingJobs.findMany({
        orderBy: [desc(trainingJobs.createdAt)],
      });
      
      res.json({ jobs });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/jobs/:id - Get training job details
  app.get("/api/training/jobs/:id", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: jobId } = params;
      
      const { db } = await import("./db");
      const { trainingJobs, trainingWorkers } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const job = await db.query.trainingJobs.findFirst({
        where: eq(trainingJobs.id, jobId),
      });
      
      if (!job) {
        return res.status(404).json({ error: "Training job not found" });
      }
      
      // Get workers for this job
      const workers = await db.query.trainingWorkers.findMany({
        where: eq(trainingWorkers.jobId, jobId),
        with: {
          worker: true,
        },
      });
      
      res.json({ job, workers });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/training/jobs/:id/start - Start training job
  app.post("/api/training/jobs/:id/start", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: jobId } = params;
      
      const { db } = await import("./db");
      const { trainingJobs } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const [job] = await db
        .update(trainingJobs)
        .set({
          status: 'running',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trainingJobs.id, jobId))
        .returning();
      
      if (!job) {
        return res.status(404).json({ error: "Training job not found" });
      }
      
      console.log(`[Federated] Started training job: ${job.name} (ID ${jobId})`);
      
      res.json({ job });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/training/jobs/:id/pause - Pause training job
  app.post("/api/training/jobs/:id/pause", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: jobId } = params;
      
      const { db } = await import("./db");
      const { trainingJobs } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const [job] = await db
        .update(trainingJobs)
        .set({
          status: 'paused',
          updatedAt: new Date(),
        })
        .where(eq(trainingJobs.id, jobId))
        .returning();
      
      if (!job) {
        return res.status(404).json({ error: "Training job not found" });
      }
      
      console.log(`[Federated] Paused training job: ${job.name} (ID ${jobId})`);
      
      res.json({ job });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/training/gradients - Submit gradient update from worker
  app.post("/api/training/gradients", requireAuth, async (req, res) => {
    try {
      const { gradientAggregator } = await import("./federated/gradient-aggregator");
      const { jobId, workerId, step, localStep, localLoss, gradients, numExamples } = req.body;
      
      if (!jobId || !workerId || step === undefined || !gradients || !numExamples) {
        return res.status(400).json({ 
          error: "Missing required fields: jobId, workerId, step, gradients, numExamples" 
        });
      }
      
      // Submit gradient
      await gradientAggregator.submitGradient(jobId, {
        workerId,
        step,
        localStep: localStep || step,
        localLoss: localLoss || 0,
        gradients,
        numExamples,
      });
      
      // Check if aggregation should happen
      const shouldAggregate = await gradientAggregator.shouldAggregate(jobId, step);
      
      if (shouldAggregate) {
        console.log(`[Federated] Triggering aggregation for job ${jobId}, step ${step}`);
        
        // Aggregate in background (non-blocking)
        gradientAggregator.aggregate(jobId, step).catch(console.error);
      }
      
      // Get latest checkpoint
      const checkpointPath = await gradientAggregator.getLatestCheckpoint(jobId);
      
      res.json({
        success: true,
        message: "Gradient received",
        shouldAggregate,
        checkpointPath,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/checkpoints/:jobId - Get latest checkpoint METADATA
  app.get("/api/training/checkpoints/:jobId", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(jobIdParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { jobId } = params;
      
      const { gradientAggregator } = await import("./federated/gradient-aggregator");
      
      const checkpointPath = await gradientAggregator.getLatestCheckpoint(jobId);
      
      if (!checkpointPath) {
        return res.status(404).json({ error: "No checkpoint found for this job" });
      }
      
      // Read checkpoint file
      const checkpointData = await fs.readFile(checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(checkpointData);
      
      // Return metadata + download URL for workers
      const downloadUrl = `${req.protocol}://${req.get('host')}/api/training/checkpoints/${jobId}/download`;
      
      res.json({ 
        checkpoint, 
        path: checkpointPath,
        downloadUrl,  // Workers use this to download checkpoint file
        version: checkpoint.globalStep || 0  // For version checking
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/checkpoints/:jobId/download - Download checkpoint FILE for workers
  // PUBLIC endpoint (no auth) - workers need to download this
  app.get("/api/training/checkpoints/:jobId/download", async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(jobIdParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { jobId } = params;
      
      const { gradientAggregator } = await import("./federated/gradient-aggregator");
      
      const checkpointPath = await gradientAggregator.getLatestCheckpoint(jobId);
      
      if (!checkpointPath) {
        return res.status(404).json({ error: "No checkpoint found for this job" });
      }
      
      // Stream checkpoint file to worker
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="checkpoint-job-${jobId}.pt"`);
      res.sendFile(checkpointPath);
      
    } catch (error: unknown) {
      console.error("[Checkpoint Download] Error:", getErrorMessage(error));
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // ADAPTER UPLOAD (Hot Reload - Production-Grade)
  // ============================================================================
  
  // POST /api/training/adapters/:jobId/:workerId/:step - Upload PEFT adapter from worker
  // Workers upload complete adapter directories as .tar.gz for aggregation
  app.post("/api/training/adapters/:jobId/:workerId/:step", adapterUpload.single("adapter"), async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(jobIdWorkerIdStepSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { jobId, workerId, step } = params;
      
      if (!req.file) {
        return res.status(400).json({ error: "No adapter file uploaded" });
      }
      
      const { numExamples } = req.body;
      if (!numExamples || isNaN(parseInt(numExamples))) {
        return res.status(400).json({ error: "Missing or invalid numExamples" });
      }
      
      // Create persistent storage path
      const persistentDir = path.join("/tmp/adapters", String(jobId), String(workerId));
      await fs.mkdir(persistentDir, { recursive: true });
      
      const persistentPath = path.join(persistentDir, `step_${step}.tar.gz`);
      
      // Move uploaded file to persistent location
      await fs.rename(req.file.path, persistentPath);
      
      // Insert into database
      const [uploadRecord] = await db
        .insert(uploadedAdapters)
        .values({
          jobId,
          workerId,
          step,
          numExamples: parseInt(numExamples),
          filePath: persistentPath,
          fileSize: req.file.size,
        })
        .returning();
      
      console.log(`[Adapter Upload] Worker ${workerId} uploaded adapter for job ${jobId}, step ${step} (${req.file.size} bytes, ${numExamples} examples)`);
      
      // Check if we have enough adapters to aggregate
      const { adapterAggregator } = await import("./federated/adapter-aggregator");
      const shouldAggregate = await adapterAggregator.shouldAggregate(jobId, step, 2);
      
      if (shouldAggregate) {
        console.log(`[Adapter Upload] Triggering aggregation for job ${jobId}, step ${step}`);
        // Aggregate in background (non-blocking)
        adapterAggregator.aggregate(jobId, step).catch(console.error);
      }
      
      res.json({
        success: true,
        adapterId: uploadRecord.id,
        message: `Adapter uploaded successfully (${req.file.size} bytes)`,
        shouldAggregate,
      });
      
    } catch (error: unknown) {
      console.error("[Adapter Upload] Error:", getErrorMessage(error));
      
      // Cleanup temp file if exists
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }
      
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // POST /api/training/adapters/:jobId/:step/aggregate - Manually trigger aggregation
  app.post("/api/training/adapters/:jobId/:step/aggregate", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(jobIdStepSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { jobId, step } = params;
      
      const { adapterAggregator } = await import("./federated/adapter-aggregator");
      
      // Check if there are adapters to aggregate (need at least 2 for meaningful aggregation)
      const shouldAggregate = await adapterAggregator.shouldAggregate(jobId, step, 2);
      
      if (!shouldAggregate) {
        return res.status(400).json({ 
          error: "Not enough adapters for aggregation (need at least 2 workers)" 
        });
      }
      
      // Trigger aggregation
      console.log(`[Manual Aggregation] Triggered for job ${jobId}, step ${step}`);
      const result = await adapterAggregator.aggregate(jobId, step);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }
      
      res.json({
        success: true,
        checkpointPath: result.checkpointPath,
        message: "Aggregation completed successfully",
      });
      
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // DATASET UPLOAD & MANAGEMENT
  // ============================================================================

  // POST /api/training/datasets - Upload new dataset
  app.post("/api/training/datasets", requireAuth, requirePermission("training:datasets:create"), upload.single("file"), async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { name, description, datasetType, userId } = req.body;

      if (!name || !datasetType) {
        return res.status(400).json({
          error: "Missing required fields: name, datasetType",
        });
      }

      // Process the dataset
      const result = await DatasetProcessor.processDataset({
        userId: userId || undefined,
        name,
        description,
        datasetType,
        originalFilename: req.file.originalname,
        tempFilePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });

      if (!result.success || !result.dataset) {
        return res.status(400).json({ error: result.error || "Dataset processing failed" });
      }

      // Save to database
      const [savedDataset] = await db
        .insert(datasets)
        .values([result.dataset as any])
        .returning();

      res.json({
        message: "Dataset uploaded successfully",
        dataset: savedDataset,
      });
    } catch (error: unknown) {
      console.error("Dataset upload error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/datasets - List all datasets
  app.get("/api/training/datasets", requireAuth, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets, trainingDataCollection } = await import("../shared/schema");
      const { desc } = await import("drizzle-orm");

      // Buscar datasets compilados (.jsonl files)
      const compiledDatasets = await db
        .select()
        .from(datasets)
        .orderBy(desc(datasets.createdAt));

      // Buscar dados de treinamento individuais (approved)
      const trainingData = await db
        .select()
        .from(trainingDataCollection)
        .orderBy(desc(trainingDataCollection.createdAt));

      // Calcular estatísticas
      const approvedCount = trainingData.filter(d => d.status === 'approved').length;
      const totalExamples = trainingData.length;
      const totalSize = compiledDatasets.reduce((sum, d) => sum + (d.fileSize || 0), 0);

      res.json({ 
        datasets: compiledDatasets,
        trainingData: trainingData,
        stats: {
          compiledDatasets: compiledDatasets.length,
          totalExamples: totalExamples,
          approvedExamples: approvedCount,
          totalSize: totalSize,
        }
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/datasets/:id - Get specific dataset
  app.get("/api/training/datasets/:id", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id } = params;
      
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const [dataset] = await db
        .select()
        .from(datasets)
        .where(eq(datasets.id, id))
        .limit(1);

      if (!dataset) {
        return res.status(404).json({ error: "Dataset not found" });
      }

      res.json({ dataset });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/datasets/:id/preview - Get dataset content preview
  app.get("/api/training/datasets/:id/preview", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id } = params;
      const maxLines = parseInt((req.query.maxLines as string) || "50");
      
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const [dataset] = await db
        .select()
        .from(datasets)
        .where(eq(datasets.id, id))
        .limit(1);

      if (!dataset) {
        return res.status(404).json({ error: "Dataset not found" });
      }

      const content = await DatasetProcessor.getDatasetContent(
        dataset.storagePath,
        maxLines
      );

      res.json({
        dataset: {
          id: dataset.id,
          name: dataset.name,
          totalExamples: dataset.totalExamples,
        },
        preview: content,
        maxLines,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // PATCH /api/training/datasets/:id - Update dataset metadata
  app.patch("/api/training/datasets/:id", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id } = params;
      const { name, description } = req.body;
      
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Name is required" });
      }

      const [dataset] = await db
        .select()
        .from(datasets)
        .where(eq(datasets.id, id))
        .limit(1);

      if (!dataset) {
        return res.status(404).json({ error: "Dataset not found" });
      }

      // Update dataset
      const [updated] = await db
        .update(datasets)
        .set({
          name: name.trim(),
          description: description?.trim() || null,
        })
        .where(eq(datasets.id, id))
        .returning();

      res.json(updated);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // DELETE /api/training/datasets/:id - Delete dataset
  app.delete("/api/training/datasets/:id", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id } = params;
      
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const [dataset] = await db
        .select()
        .from(datasets)
        .where(eq(datasets.id, id))
        .limit(1);

      if (!dataset) {
        return res.status(404).json({ error: "Dataset not found" });
      }

      // Delete file from storage
      await DatasetProcessor.deleteDataset(dataset.storagePath);

      // Delete from database
      await db.delete(datasets).where(eq(datasets.id, id));

      res.json({ message: req.t('dataset.deleted_successfully') });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/training/datasets/bulk-delete - Bulk delete datasets
  app.post("/api/training/datasets/bulk-delete", requireAuth, requirePermission("training:datasets:delete"), async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq, inArray } = await import("drizzle-orm");

      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Invalid or empty IDs array" });
      }

      const numericIds = ids.map(id => parseInt(id)).filter(id => !isNaN(id));

      if (numericIds.length === 0) {
        return res.status(400).json({ error: "No valid dataset IDs provided" });
      }

      // Fetch all datasets to delete files
      const datasetsToDelete = await db
        .select()
        .from(datasets)
        .where(inArray(datasets.id, numericIds));

      if (datasetsToDelete.length === 0) {
        return res.status(404).json({ error: "No datasets found with provided IDs" });
      }

      // Delete files from storage
      for (const dataset of datasetsToDelete) {
        try {
          await DatasetProcessor.deleteDataset(dataset.storagePath);
        } catch (error) {
          console.error(`Failed to delete file for dataset ${dataset.id}:`, error);
        }
      }

      // Delete from database
      await db.delete(datasets).where(inArray(datasets.id, numericIds));

      res.json({ 
        message: "Datasets deleted successfully",
        deleted: datasetsToDelete.length,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/datasets/:id/download - Download dataset file
  app.get("/api/training/datasets/:id/download", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id } = params;
      
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      const fs = await import("fs/promises");

      const [dataset] = await db
        .select()
        .from(datasets)
        .where(eq(datasets.id, id))
        .limit(1);

      if (!dataset) {
        return res.status(404).json({ error: "Dataset not found" });
      }

      // Check if file exists
      try {
        await fs.access(dataset.storagePath);
      } catch {
        return res.status(404).json({ error: "Dataset file not found on disk" });
      }

      // Set headers for download
      res.setHeader("Content-Type", dataset.fileMimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${dataset.originalFilename || `dataset-${dataset.id}.jsonl`}"`);
      res.setHeader("Content-Length", dataset.fileSize.toString());

      // Stream file to response
      const fileStream = (await import("fs")).createReadStream(dataset.storagePath);
      fileStream.pipe(res);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/training/datasets/generate-from-kb - Auto-generate dataset from Knowledge Base
  app.post("/api/training/datasets/generate-from-kb", requireAuth, requirePermission("training:datasets:create"), async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets, trainingDataCollection } = await import("../shared/schema");
      const { and, gte, eq } = await import("drizzle-orm");
      const fs = await import('fs/promises');
      const path = await import('path');

      const { mode, minScore } = req.body;
      const scoreThreshold = minScore || (mode === 'kb-high-quality' ? 80 : 60);

      // Get high-quality conversations from KB
      const conversations = await db
        .select()
        .from(trainingDataCollection)
        .where(
          and(
            gte(trainingDataCollection.autoQualityScore, scoreThreshold),
            eq(trainingDataCollection.status, "approved")
          )
        )
        .orderBy(trainingDataCollection.createdAt)
        .limit(1000);

      if (conversations.length === 0) {
        return res.status(404).json({ 
          error: "No high-quality conversations found in Knowledge Base",
          suggestion: "Lower the score threshold or collect more conversations first"
        });
      }

      // Convert to JSONL format
      const datasetLines = conversations.map(conv => {
        return JSON.stringify({
          conversation_id: conv.conversationId,
          training_data: conv.formattedData,
          metadata: {
            conversationId: conv.conversationId,
            score: conv.autoQualityScore,
            collectedAt: conv.createdAt,
            messageCount: conv.metadata?.messageCount || 0,
            totalTokens: conv.metadata?.totalTokens || 0,
            toolsUsed: conv.metadata?.toolsUsed?.length || 0,
            providers: conv.metadata?.providers || []
          }
        });
      });

      const datasetContent = datasetLines.join('\n');
      
      // Save to file
      const datasetName = `KB-Auto-${mode}-${Date.now()}`;
      const datasetPath = path.join(process.cwd(), 'training_datasets', `${datasetName}.jsonl`);
      
      // Create directory if it doesn't exist
      await fs.mkdir(path.dirname(datasetPath), { recursive: true });
      await fs.writeFile(datasetPath, datasetContent, 'utf-8');

      // Calculate average score
      const avgScore = conversations.reduce((sum, c) => sum + (c.autoQualityScore || 0), 0) / conversations.length;

      // Save to database (with proper lifecycle - use defaults, will be validated later)
      const [savedDataset] = await db
        .insert(datasets)
        .values({
          userId: null, // KB-generated datasets are system-owned (no specific user)
          name: datasetName,
          description: `Auto-generated from ${conversations.length} high-quality KB conversations (score ≥ ${scoreThreshold})`,
          datasetType: 'chat',
          // Use schema defaults: status: "uploaded", isValid: false
          // Dataset validator will process and mark as ready
          totalExamples: conversations.length,
          fileSize: Buffer.byteLength(datasetContent),
          storagePath: datasetPath,
          originalFilename: `${datasetName}.jsonl`,
          fileMimeType: 'application/jsonl',
          averageLength: Math.floor(conversations.reduce((sum, c) => sum + (c.metadata?.totalTokens || 0), 0) / conversations.length)
        })
        .returning();
      
      // Auto-validate KB-generated datasets (they're pre-processed and trusted)
      await db
        .update(datasets)
        .set({
          status: 'ready',
          isValid: true,
          validationErrors: null
        })
        .where(eq(datasets.id, savedDataset.id));

      res.json({
        message: "Dataset generated successfully from Knowledge Base",
        dataset: savedDataset,
        stats: {
          totalConversations: conversations.length,
          avgScore,
          minScore: scoreThreshold,
          mode
        }
      });
    } catch (error: unknown) {
      console.error("KB dataset generation error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ============================================================================
  // TRAINING DATA COLLECTION - Auto-evolution from conversations
  // ============================================================================

  // POST /api/training-data/collect/:conversationId - Collect conversation for training
  app.post("/api/training-data/collect/:conversationId", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(z.object({ 
        conversationId: z.coerce.number().int().positive().safe() 
      }), req, res);
      if (!params) return; // Error response already sent
      
      const { conversationId } = params;
      
      const { ConversationCollector } = await import("./training/collectors/conversation-collector");

      // Get conversation messages
      const messages = await storage.getMessagesByConversation(conversationId);
      
      if (!messages || messages.length === 0) {
        return res.status(404).json({ error: "Conversation not found or empty" });
      }

      // Calculate quality metrics
      const metrics = ConversationCollector.calculateQualityScore(messages);

      // Convert to training format
      const systemPrompt = ConversationCollector.extractSystemPrompt(messages);
      const formattedData = ConversationCollector.convertToTrainingFormat(messages, systemPrompt);

      // Get conversation details
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Create training data collection entry
      const trainingData = await storage.createTrainingDataCollection({
        conversationId,
        autoQualityScore: metrics.score,
        status: ConversationCollector.shouldCollect(metrics) ? "pending" : "rejected",
        formattedData,
        metadata: {
          messageCount: metrics.messageCount,
          totalTokens: metrics.totalTokens,
          avgLatency: metrics.avgLatency,
          providers: metrics.providers,
          toolsUsed: metrics.toolsUsed,
          hasAttachments: metrics.hasAttachments,
        },
      });

      res.json({
        success: true,
        trainingData,
        metrics,
        shouldCollect: ConversationCollector.shouldCollect(metrics),
      });
    } catch (error: unknown) {
      console.error("Error collecting training data:", error);
      res.status(500).json({ error: "Failed to collect training data" });
    }
  });

  // GET /api/training/auto-evolution/stats - Get auto-evolution statistics
  app.get("/api/training/auto-evolution/stats", requireAuth, async (req, res) => {
    try {
      // Total conversations collected
      const totalConversationsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trainingDataCollection);
      const totalConversations = totalConversationsResult[0]?.count || 0;

      // High-quality conversations (score >= 60)
      const highQualityResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trainingDataCollection)
        .where(gte(trainingDataCollection.autoQualityScore, 60));
      const highQualityConversations = highQualityResult[0]?.count || 0;

      // Average quality score
      const avgScoreResult = await db
        .select({ avg: sql<number>`avg(${trainingDataCollection.autoQualityScore})::numeric` })
        .from(trainingDataCollection);
      const avgQualityScore = parseFloat(String(avgScoreResult[0]?.avg || 0));

      // Datasets generated from KB (check description for "Auto-generated")
      const kbDatasetsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(datasets)
        .where(sql`${datasets.description} LIKE '%Auto-generated%KB%'`);
      const kbGeneratedDatasets = kbDatasetsResult[0]?.count || 0;

      // Total datasets
      const totalDatasetsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(datasets);
      const totalDatasets = totalDatasetsResult[0]?.count || 0;

      // Training jobs completed
      const completedJobsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trainingJobs)
        .where(eq(trainingJobs.status, 'completed'));
      const completedJobs = completedJobsResult[0]?.count || 0;

      // Total training jobs
      const totalJobsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trainingJobs);
      const totalJobs = totalJobsResult[0]?.count || 0;

      // Timeline data - conversations collected over time (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const timelineResult = await db
        .select({
          date: sql<string>`DATE(${trainingDataCollection.createdAt})`,
          count: sql<number>`count(*)::int`,
          avgScore: sql<number>`avg(${trainingDataCollection.autoQualityScore})::numeric`
        })
        .from(trainingDataCollection)
        .where(gte(trainingDataCollection.createdAt, thirtyDaysAgo))
        .groupBy(sql`DATE(${trainingDataCollection.createdAt})`)
        .orderBy(sql`DATE(${trainingDataCollection.createdAt})`);

      const timeline = timelineResult.map((row) => ({
        date: row.date,
        count: Number(row.count) || 0,
        avgScore: parseFloat(String(row.avgScore || '0'))
      }));

      // Calculate efficiency metrics
      const collectionToDatasetRatio = totalConversations > 0 
        ? (kbGeneratedDatasets / totalConversations * 100).toFixed(1)
        : '0.0';

      const jobCompletionRate = totalJobs > 0
        ? (completedJobs / totalJobs * 100).toFixed(1)
        : '0.0';

      res.json({
        overview: {
          totalConversations,
          highQualityConversations,
          avgQualityScore: parseFloat(avgQualityScore.toFixed(1)),
          kbGeneratedDatasets,
          totalDatasets,
          completedJobs,
          totalJobs
        },
        efficiency: {
          collectionToDatasetRatio: parseFloat(collectionToDatasetRatio),
          jobCompletionRate: parseFloat(jobCompletionRate),
          highQualityPercentage: totalConversations > 0 
            ? parseFloat((highQualityConversations / totalConversations * 100).toFixed(1))
            : 0
        },
        timeline
      });
    } catch (error: unknown) {
      console.error("Auto-evolution stats error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training-data - List collected training data
  app.get("/api/training-data", requireAuth, async (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;

      const data = await storage.getAllTrainingDataCollection(status, limit);

      res.json({ trainingData: data });
    } catch (error: unknown) {
      console.error("Error listing training data:", error);
      res.status(500).json({ error: "Failed to list training data" });
    }
  });

  // PATCH /api/training-data/:id - Update training data status (approve/reject) or content
  app.patch("/api/training-data/:id", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id } = params;
      
      const { TrainingDataValidator } = await import("./training/training-data-validator");
      
      const updateSchema = z.object({
        status: z.enum(["pending", "approved", "rejected", "trained"]).optional(),
        rating: z.number().int().min(1).max(5).optional(),
        approvedBy: z.string().optional(),
        formattedData: z.array(z.object({
          instruction: z.string(),
          output: z.string(),
        })).optional(),
      });

      // Validate request body
      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: getErrorMessage(validation.error) });
      }
      
      const { status, rating, approvedBy, formattedData } = validation.data;
      
      // Verify item exists
      const existing = await storage.getTrainingDataCollection(id);
      if (!existing) {
        return res.status(404).json({ error: "Training data not found" });
      }

      const updates: Record<string, unknown> = {};
      const validationResult: Record<string, unknown> = {
        warnings: [],
        corrections: [],
      };
      
      // Validate and auto-correct formattedData if provided
      if (formattedData && formattedData.length > 0) {
        const { instruction, output } = formattedData[0];
        
        // Run validation with auto-correction
        const validationCheck = TrainingDataValidator.validate(instruction, output);
        
        if (!validationCheck.isValid) {
          return res.status(400).json({ 
            error: "Validation failed", 
            details: validationCheck.errors,
            warnings: validationCheck.warnings,
          });
        }

        // Use corrected version if available
        const finalData = validationCheck.corrected || { instruction, output };
        updates.formattedData = [finalData];
        
        // Include warnings and corrections in response
        validationResult.warnings = validationCheck.warnings;
        validationResult.corrections = validationCheck.autoCorrections;
      }
      
      if (status) {
        updates.status = status;
        if (status === "approved") {
          updates.approvedAt = new Date();
          if (approvedBy) {
            updates.approvedBy = approvedBy;
          }
        }
      }

      if (rating !== undefined) {
        updates.rating = rating;
      }

      const updated = await storage.updateTrainingDataCollection(id, updates);

      res.json({ 
        success: true, 
        trainingData: updated,
        validation: validationResult,
      });
    } catch (error: unknown) {
      console.error("Error updating training data:", error);
      res.status(500).json({ error: "Failed to update training data" });
    }
  });

  // DELETE /api/training-data/:id - Delete training data
  app.delete("/api/training-data/:id", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id } = params;
      
      // Verify item exists
      const existing = await storage.getTrainingDataCollection(id);
      if (!existing) {
        return res.status(404).json({ error: "Training data not found" });
      }

      await storage.deleteTrainingDataCollection(id);

      res.json({ success: true, message: req.t('training.deleted_successfully') });
    } catch (error: unknown) {
      console.error("Error deleting training data:", error);
      res.status(500).json({ error: "Failed to delete training data" });
    }
  });

  // POST /api/training/jobs/:id/claim-chunk - Claim an available chunk for training
  app.post("/api/training/jobs/:id/claim-chunk", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: jobId } = params;
      const { workerId } = req.body;
      
      if (!workerId) {
        return res.status(400).json({ error: "Invalid worker ID" });
      }
      
      const { db } = await import("./db");
      const { trainingJobs, trainingWorkers } = await import("../shared/schema");
      const { eq, and, or } = await import("drizzle-orm");
      
      // Get job
      const job = await db.query.trainingJobs.findFirst({
        where: eq(trainingJobs.id, jobId),
      });
      
      if (!job) {
        return res.status(404).json({ error: "Training job not found" });
      }
      
      // Find available chunks (not assigned or failed assignments)
      const existingWorkers = await db.query.trainingWorkers.findMany({
        where: and(
          eq(trainingWorkers.jobId, jobId),
          or(
            eq(trainingWorkers.status, 'assigned'),
            eq(trainingWorkers.status, 'running')
          )
        ),
      });
      
      const assignedChunks = new Set(existingWorkers.map(w => w.assignedChunk));
      
      // Find first available chunk
      let availableChunk = -1;
      for (let i = 0; i < job.totalChunks; i++) {
        if (!assignedChunks.has(i)) {
          availableChunk = i;
          break;
        }
      }
      
      if (availableChunk === -1) {
        return res.status(404).json({ error: "No available chunks" });
      }
      
      // Assign chunk to worker
      const { datasetSplitter } = await import("./federated/dataset-splitter");
      const chunkPath = datasetSplitter.getChunkPath(jobId, availableChunk);
      
      const [worker] = await db.insert(trainingWorkers).values({
        jobId,
        workerId,
        assignedChunk: availableChunk,
        chunkStartIdx: 0, // Will be set by dataset splitter
        chunkEndIdx: 0,   // Will be set by dataset splitter
        status: 'assigned',
      }).returning();
      
      console.log(`[Federated] GPU ${workerId} claimed chunk ${availableChunk} for job ${jobId}`);
      
      res.json({
        worker,
        chunkIndex: availableChunk,
        chunkPath,
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/training/jobs/:id/progress - Get real-time training progress
  app.get("/api/training/jobs/:id/progress", requireAuth, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: jobId } = params;
      
      const { db } = await import("./db");
      const { trainingJobs, trainingWorkers, gradientUpdates } = await import("../shared/schema");
      const { eq, and, sql } = await import("drizzle-orm");
      
      // Get job
      const job = await db.query.trainingJobs.findFirst({
        where: eq(trainingJobs.id, jobId),
      });
      
      if (!job) {
        return res.status(404).json({ error: "Training job not found" });
      }
      
      // Get worker progress
      const workers = await db.query.trainingWorkers.findMany({
        where: eq(trainingWorkers.jobId, jobId),
        with: {
          worker: true,
        },
      });
      
      // Count gradient updates
      const [gradientsCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(gradientUpdates)
        .where(eq(gradientUpdates.jobId, jobId));
      
      const progress = {
        job: {
          id: job.id,
          name: job.name,
          status: job.status,
          currentStep: job.currentStep,
          totalSteps: job.totalSteps,
          globalLoss: job.globalLoss,
          bestLoss: job.bestLoss,
          progressPercent: ((job.currentStep / job.totalSteps) * 100).toFixed(2),
        },
        workers: workers.map(w => ({
          id: w.id,
          workerId: w.workerId,
          assignedChunk: w.assignedChunk,
          status: w.status,
          currentStep: w.currentStep,
          localLoss: w.localLoss,
          stepsPerSecond: w.stepsPerSecond,
        })),
        stats: {
          activeWorkers: job.activeWorkers,
          totalGradientUpdates: Number(gradientsCount.count),
          completedChunks: job.completedChunks,
        },
      };
      
      res.json(progress);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========================================================================
  // RAG SYSTEM WITH MMR - AION Supreme  
  // ========================================================================

  // POST /api/rag/search - Semantic search with MMR
  app.post("/api/rag/search", requireAuth, async (req, res) => {
    try {
      const { query, options } = req.body;
      const { mmrSearch } = await import("./ai/rag-service");
      
      const results = await mmrSearch(query, options);
      res.json({ results });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/rag/search-with-confidence - Search with confidence scoring
  app.post("/api/rag/search-with-confidence", async (req, res) => {
    try {
      const { query, options } = req.body;
      const { searchWithConfidence } = await import("./ai/rag-service");
      
      const result = await searchWithConfidence(query, options);
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // REMOVED: /api/rag/index-document
  // This endpoint bypassed HITL curation queue and was unused.
  // Documents must be indexed ONLY after approval through curation queue.

  // ========================================================================
  // TRAINING & METRICS - AION Supreme
  // ========================================================================

  // POST /api/training/collect - Collect training data from conversations
  app.post("/api/training/collect", async (req, res) => {
    try {
      const { options } = req.body;
      
      const examples = await trainingDataCollector.collectTrainingData(options);
      res.json({ examples: examples.length, data: examples });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/training/export - Export training data to JSONL
  app.post("/api/training/export", async (req, res) => {
    try {
      const { options } = req.body;
      
      const result = await trainingDataCollector.prepareDataset(options);
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/metrics/calculate - Calculate RAG metrics (nDCG, MRR, etc.)
  app.post("/api/metrics/calculate", async (req, res) => {
    try {
      const { results, k } = req.body;
      const { calculateAllMetrics } = await import("./ai/metrics");
      
      const metrics = calculateAllMetrics(results, k || 10);
      res.json(metrics);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========================================================================
  // TOKEN MONITORING - AION Supreme
  // ========================================================================

  // GET /api/tokens/summary - Get token usage summary for all providers
  app.get("/api/tokens/summary", async (req, res) => {
    try {
      const summary = await tokenTracker.getUsageSummary();
      res.json(summary);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/tokens/quotas - Get free API quotas and remaining capacity
  app.get("/api/tokens/quotas", async (req, res) => {
    try {
      const quotas = await tokenTracker.getProviderQuotas();
      res.json(quotas);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/tokens/trends - Get historical token usage trends
  app.get("/api/tokens/trends", async (req, res) => {
    try {
      const provider = req.query.provider as string | null;
      
      // Map period to days
      const periodParam = req.query.period as string;
      const periodMap: Record<string, number> = {
        '1d': 1,
        '7d': 7,
        '30d': 30,
        '90d': 90,
        '1y': 365,
        '5y': 1825
      };
      const days = periodParam && periodMap[periodParam] 
        ? periodMap[periodParam] 
        : parseInt(req.query.days as string) || 30;
      
      const breakdown = req.query.breakdown === 'true';
      
      // Support custom date range
      const startDate = req.query.start_date ? new Date(req.query.start_date as string) : undefined;
      const endDate = req.query.end_date ? new Date(req.query.end_date as string) : undefined;
      
      if (breakdown) {
        // Return data with provider breakdown
        const trends = await tokenTracker.getTokenTrendsWithProviders(days, startDate, endDate);
        res.json({
          daily: trends,
          period_days: days,
          breakdown: true,
          start_date: startDate?.toISOString().split('T')[0],
          end_date: endDate?.toISOString().split('T')[0]
        });
      } else {
        // Return aggregated data
        const trends = await tokenTracker.getTokenTrends(provider, days, startDate, endDate);
        res.json({
          daily: trends,
          period_days: days,
          breakdown: false,
          start_date: startDate?.toISOString().split('T')[0],
          end_date: endDate?.toISOString().split('T')[0]
        });
      }
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/tokens/limits - Set token limits for a provider
  app.post("/api/tokens/limits", async (req, res) => {
    try {
      const { provider, limits } = req.body;
      await tokenTracker.setTokenLimit(provider, limits);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/tokens/alerts - Get unacknowledged alerts
  app.get("/api/tokens/alerts", async (req, res) => {
    try {
      const alerts = await tokenTracker.getUnacknowledgedAlerts();
      res.json(alerts);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/tokens/alerts/:id/acknowledge - Acknowledge an alert
  app.post("/api/tokens/alerts/:id/acknowledge", async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: alertId } = params;
      await tokenTracker.acknowledgeAlert(alertId);
      res.json({ success: true });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/tokens/web-search-history - Get web search history
  app.get("/api/tokens/web-search-history", async (req, res) => {
    try {
      const provider = (req.query.provider as 'web' | 'both') || 'both';
      const limit = parseInt(req.query.limit as string) || 100;
      
      const history = await tokenTracker.getWebSearchHistory(provider, limit);
      res.json(history);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/tokens/web-search-stats - Get web search statistics
  app.get("/api/tokens/web-search-stats", async (req, res) => {
    try {
      const stats = await tokenTracker.getWebSearchStats();
      res.json(stats);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/tokens/kb-history - Get Knowledge Base search history
  app.get("/api/tokens/kb-history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      
      const history = await tokenTracker.getKBSearchHistory(limit);
      res.json(history);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/tokens/complete-history - Get complete token usage history (all providers)
  app.get("/api/tokens/complete-history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 500; // Default to last 500 records
      
      const history = await tokenTracker.getCompleteTokenHistory(limit);
      res.json(history);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/tokens/cost-history - Get complete cost history with breakdown
  app.get("/api/tokens/cost-history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 500;
      
      const costHistory = await tokenTracker.getCostHistory(limit);
      res.json(costHistory);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/tokens/openai-real-cost - Get REAL OpenAI costs from Costs API (NOT calculated!)
  app.get("/api/tokens/openai-real-cost", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const { openAIBillingSync } = await import("./services/openai-billing-sync");
      
      const totalCost = await openAIBillingSync.getTotalCost(days);
      res.json({ 
        totalCost, 
        days, 
        source: "openai_costs_api",
        note: "Real data from OpenAI invoice, NOT calculated from tokens" 
      });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // POST /api/tokens/openai-sync - Manually trigger OpenAI billing sync
  app.post("/api/tokens/openai-sync", async (req, res) => {
    try {
      const days = parseInt(req.body.days as string) || 30;
      const { openAIBillingSync } = await import("./services/openai-billing-sync");
      
      await openAIBillingSync.syncBillingData(days);
      res.json({ success: true, message: req.t('billing.synced_days', { days }) });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/tokens/free-apis-history - Get Free APIs usage history
  app.get("/api/tokens/free-apis-history", async (req, res) => {
    try {
      const provider = req.query.provider as 'groq' | 'gemini' | 'huggingface' | 'openrouter' | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const history = await tokenTracker.getFreeAPIsHistory(provider, limit);
      res.json(history);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========================================================================
  // POLICY ENFORCEMENT - AION Supreme
  // ========================================================================

  // POST /api/policy/detect-violation - Detect policy violations
  app.post("/api/policy/detect-violation", async (req, res) => {
    try {
      const { text } = req.body;
      const { enforcePolicy } = await import("./policy/enforcement");
      
      const result = await enforcePolicy(text);
      res.json(result);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /metrics (Prometheus format)
  app.get("/metrics", exportPrometheusMetrics);

  // ========================================================================
  // MULTI-AGENT SYSTEM - Agent CRUD endpoints
  // ========================================================================
  registerAgentRoutes(app);

  // ========================================================================
  // MEDIA PROXY - Resolve CORS and cache external media
  // ========================================================================
  
  // In-memory cache for proxied media (max 100MB, 1 hour TTL)
  const mediaCache = new Map<string, { data: Buffer; contentType: string; timestamp: number }>();
  const MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB
  const CACHE_TTL = 60 * 60 * 1000; // 1 hour
  
  app.get("/api/media/proxy", async (req, res) => {
    try {
      const url = req.query.url as string;
      
      if (!url) {
        return res.status(400).json({ error: "Missing 'url' parameter" });
      }
      
      // Validate URL
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }
      
      // Check cache
      const cached = mediaCache.get(url);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[Media Proxy] Cache HIT: ${url}`);
        res.setHeader('Content-Type', cached.contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.send(cached.data);
      }
      
      // Fetch from external source
      console.log(`[Media Proxy] Fetching: ${url}`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 50 * 1024 * 1024, // 50MB max file size
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      const contentType = response.headers['content-type'] || 'application/octet-stream';
      const data = Buffer.from(response.data);
      
      // Cache if size allows
      if (data.length < MAX_CACHE_SIZE) {
        // Clean old cache entries if needed
        if (mediaCache.size > 50) {
          const oldestKey = Array.from(mediaCache.keys())[0];
          mediaCache.delete(oldestKey);
        }
        
        mediaCache.set(url, { data, contentType, timestamp: Date.now() });
        console.log(`[Media Proxy] Cached: ${url} (${(data.length / 1024).toFixed(1)}KB)`);
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(data);
      
    } catch (error: unknown) {
      console.error("[Media Proxy] Error:", getErrorMessage(error));
      res.status(500).json({ error: "Failed to fetch media", details: getErrorMessage(error) });
    }
  });

  // Serve learned images statically (from crawler) - DEPRECATED, use kb_storage/images
  const learnedImagesDir = path.join(process.cwd(), 'attached_assets', 'learned_images');
  app.use('/attached_assets/learned_images', express.static(learnedImagesDir));

  // Serve chat images statically (legacy - backward compatibility)
  const chatImagesDir = path.join(process.cwd(), 'attached_assets', 'chat_images');
  app.use('/attached_assets/chat_images', express.static(chatImagesDir));

  // Serve KB storage statically (PERMANENT storage after HITL approval - NEW)
  const kbStorageDir = path.join(process.cwd(), 'kb_storage');
  app.use('/kb_storage', express.static(kbStorageDir));
  
  // Serve curation storage statically (PENDING HITL approval - NEW)
  const curationStorageDir = path.join(process.cwd(), 'curation_storage');
  app.use('/curation_storage', express.static(curationStorageDir));

  // ============================================================================
  // ⚡ FASE 2 - C3: KB REBUILD ASYNC ROUTES
  // ============================================================================
  
  /**
   * POST /api/kb/rebuild
   * Inicia rebuild assíncrono do índice vetorial
   * Returns 202 Accepted + job ID
   */
  app.post("/api/kb/rebuild", async (req, res) => {
    try {
      const { namespaceFilter } = req.body;

      const jobId = await rebuildService.startRebuild(namespaceFilter);

      console.log({ jobId, namespaceFilter }, "[API] Rebuild job started");

      res.status(202).json(
        responseEnvelope.success(
          { jobId },
          "Rebuild job started successfully"
        )
      );
    } catch (error: unknown) {
      console.error({ error: getErrorMessage(error) }, "[API] Failed to start rebuild job");
      
      res.status(400).json(
        responseEnvelope.error(getErrorMessage(error), "REBUILD_START_FAILED")
      );
    }
  });

  /**
   * GET /api/kb/rebuild
   * Lista todos os rebuild jobs (últimos 50)
   */
  app.get("/api/kb/rebuild", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const jobs = await rebuildService.listJobs(limit);

      res.json(
        responseEnvelope.success({ jobs })
      );
    } catch (error: unknown) {
      console.error({ error: getErrorMessage(error) }, "[API] Failed to list rebuild jobs");
      
      res.status(500).json(
        responseEnvelope.error(getErrorMessage(error), "REBUILD_LIST_FAILED")
      );
    }
  });

  /**
   * GET /api/kb/rebuild/:jobId
   * Obtém status de um rebuild job específico
   */
  app.get("/api/kb/rebuild/:jobId", async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(jobIdParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { jobId } = params;

      const status = await rebuildService.getJobStatus(jobId);

      if (!status) {
        return res.status(404).json(
          responseEnvelope.error("Rebuild job not found", "JOB_NOT_FOUND")
        );
      }

      res.json(
        responseEnvelope.success(status)
      );
    } catch (error: unknown) {
      console.error({ error: getErrorMessage(error) }, "[API] Failed to get rebuild job status");
      
      res.status(500).json(
        responseEnvelope.error(getErrorMessage(error), "REBUILD_STATUS_FAILED")
      );
    }
  });

  /**
   * DELETE /api/kb/rebuild/:jobId
   * Cancela rebuild job em andamento
   */
  app.delete("/api/kb/rebuild/:jobId", async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(jobIdParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { jobId } = params;

      const cancelled = await rebuildService.cancelRebuild(jobId);

      if (!cancelled) {
        return res.status(404).json(
          responseEnvelope.error(
            "Rebuild job not found or not running",
            "JOB_NOT_CANCELLABLE"
          )
        );
      }

      console.log({ jobId }, "[API] Rebuild job cancelled");

      res.json(
        responseEnvelope.success(
          { jobId, cancelled: true },
          "Rebuild job cancelled successfully"
        )
      );
    } catch (error: unknown) {
      console.error({ error: getErrorMessage(error) }, "[API] Failed to cancel rebuild job");
      
      res.status(500).json(
        responseEnvelope.error(getErrorMessage(error), "REBUILD_CANCEL_FAILED")
      );
    }
  });

  // ============================================================================
  // LINK CAPTURE JOBS - Endpoints para Jobs de Deep Crawling
  // ============================================================================

  // ✅ FIX P0-9: Add requireAdmin to prevent unauthorized access
  app.get("/api/admin/jobs", requireAdmin, async (req, res) => {
    try {
      const { linkCaptureJobs } = await import("@shared/schema");
      const { db } = await import("./db");
      const { desc } = await import("drizzle-orm");
      
      const jobs = await db
        .select()
        .from(linkCaptureJobs)
        .orderBy(desc(linkCaptureJobs.createdAt))
        .limit(50);
      
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ✅ FIX P0-9: Add requireAdmin to prevent unauthorized access
  app.get("/api/admin/jobs/:id", requireAdmin, async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id } = params;
      
      const { linkCaptureJobs } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const [job] = await db
        .select()
        .from(linkCaptureJobs)
        .where(eq(linkCaptureJobs.id, id))
        .limit(1);
      
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
      
      res.json(job);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/admin/jobs/:id", async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: jobId } = params;
      const { action } = req.body; // "pause" | "resume" | "cancel"
      const { linkCaptureJobs } = await import("@shared/schema");
      const { db } = await import("./db");
      const { eq } = await import("drizzle-orm");
      
      const updates: any = {};
      
      if (action === "pause") {
        // ✅ Apenas muda status para "paused" (worker detecta via callback)
        updates.status = "paused";
      } else if (action === "resume") {
        // ✅ Muda status para "running" (worker continua processando)
        updates.status = "running";
      } else if (action === "cancel") {
        // ✅ Muda status para "cancelled" (worker detecta via callback)
        updates.status = "cancelled";
        updates.completedAt = new Date();
      }
      
      const [updatedJob] = await db
        .update(linkCaptureJobs)
        .set(updates)
        .where(eq(linkCaptureJobs.id, jobId))
        .returning();
      
      res.json(updatedJob);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // GPU AUTO-ORCHESTRATION - Puppeteer Automation (P1)
  // ============================================================================
  
  // POST /api/gpu/orchestrate/start - Start best available GPU automatically
  app.post("/api/gpu/orchestrate/start", requireAuth, requirePermission("gpu:pool:execute"), async (req, res) => {
    try {
      const { orchestratorService } = await import("./gpu-orchestration/orchestrator-service");
      
      const result = await orchestratorService.startBestGPU();
      
      if (!result.success) {
        return res.status(400).json({ 
          error: result.reason,
          success: false 
        });
      }
      
      res.json({
        success: true,
        workerId: result.workerId,
        ngrokUrl: result.ngrokUrl,
        message: result.reason,
      });
      
    } catch (error: unknown) {
      console.error("[Orchestrator API] Start error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // POST /api/gpu/orchestrate/stop/:workerId - Stop specific GPU
  app.post("/api/gpu/orchestrate/stop/:workerId", requireAuth, requirePermission("gpu:pool:execute"), async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(z.object({ 
        workerId: z.coerce.number().int().positive().safe() 
      }), req, res);
      if (!params) return; // Error response already sent
      
      const { workerId } = params;
      const { orchestratorService } = await import("./gpu-orchestration/orchestrator-service");
      
      const result = await orchestratorService.stopGPU(workerId);
      
      if (!result.success) {
        return res.status(400).json({ 
          error: result.reason,
          success: false 
        });
      }
      
      res.json({
        success: true,
        message: result.reason,
      });
      
    } catch (error: unknown) {
      console.error("[Orchestrator API] Stop error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/gpu/orchestrate/status - Get orchestrator status + quota info
  app.get("/api/gpu/orchestrate/status", requireAuth, requirePermission("gpu:pool:read"), async (req, res) => {
    try {
      const { orchestratorService } = await import("./gpu-orchestration/orchestrator-service");
      
      const status = await orchestratorService.getStatus();
      
      res.json(status);
      
    } catch (error: unknown) {
      console.error("[Orchestrator API] Status error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/gpu/quota/:workerId - Get quota status for specific worker
  app.get("/api/gpu/quota/:workerId", requireAuth, requirePermission("gpu:pool:read"), async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(z.object({ 
        workerId: z.coerce.number().int().positive().safe() 
      }), req, res);
      if (!params) return; // Error response already sent
      
      const { workerId } = params;
      const { quotaManager } = await import("./gpu-orchestration/intelligent-quota-manager");
      
      const status = await quotaManager.getQuotaStatus(workerId);
      
      if (!status) {
        return res.status(404).json({ error: "Worker not found" });
      }
      
      res.json(status);
      
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // ============================================================================
  // GPU WORKERS CRUD - Dashboard Management (P2)
  // ============================================================================
  
  // POST /api/gpu/workers/notebooks - Add new Colab/Kaggle notebook for orchestration (AUTO-CREATE)
  app.post("/api/gpu/workers/notebooks", requireAuth, requirePermission("gpu:pool:manage"), async (req, res) => {
    try {
      const { provider, email, password, kaggleUsername, kaggleKey, useGPU, title } = req.body;
      
      // SECURE LOGGING: Only log presence/absence, never credentials
      console.log("[GPU CRUD] Request received:", {
        provider,
        hasEmail: !!email,
        hasPassword: !!password,
        hasKaggleUsername: !!kaggleUsername,
        hasKaggleKey: !!kaggleKey,
        useGPU,
        title
      });
      
      // Validate provider
      if (!provider) {
        console.error("[GPU CRUD] Missing provider field");
        return res.status(400).json({ 
          error: "Missing required field: provider" 
        });
      }
      
      if (!['colab', 'kaggle'].includes(provider)) {
        return res.status(400).json({ 
          error: "Invalid provider. Must be 'colab' or 'kaggle'" 
        });
      }
      
      // Validate provider-specific fields
      if (provider === 'kaggle') {
        if (!kaggleUsername || !kaggleKey) {
          return res.status(400).json({
            error: "Kaggle requires 'kaggleUsername' and 'kaggleKey'"
          });
        }
      }
      
      if (provider === 'colab') {
        if (!email) {
          return res.status(400).json({
            error: "Colab requires 'email' (password optional if session exists)"
          });
        }
      }
      
      // CREATE GPU AUTOMATICAMENTE via GPU Manager
      const { gpuManager } = await import("./gpu-orchestration/gpu-manager-service");
      
      const result = await gpuManager.createGPU({
        provider,
        email,
        password,
        kaggleUsername,
        kaggleKey,
        enableGPU: useGPU ?? true,
        title,
        autoStart: true,
      });
      
      res.status(201).json({
        success: true,
        worker: result.worker,
        notebookUrl: result.notebookUrl,
        message: result.message,
      });
      
    } catch (error: unknown) {
      console.error("[GPU CRUD] Auto-create error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // GET /api/gpu/workers/notebooks - List all managed notebooks
  app.get("/api/gpu/workers/notebooks", requireAuth, requirePermission("gpu:pool:read"), async (req, res) => {
    try {
      const { gpuWorkers: gpuWorkersTable } = await import("../shared/schema");
      const workers = await db.query.gpuWorkers.findMany({
        where: eq(gpuWorkersTable.autoManaged, true),
        orderBy: (workers, { desc }) => [desc(workers.createdAt)],
      });
      
      // Add quota status for each worker
      const { quotaManager } = await import("./gpu-orchestration/intelligent-quota-manager");
      
      const workersWithStatus = await Promise.all(
        workers.map(async (worker) => {
          const quotaStatus = await quotaManager.getQuotaStatus(worker.id);
          return {
            ...worker,
            quotaStatus,
          };
        })
      );
      
      res.json(workersWithStatus);
      
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // PATCH /api/gpu/workers/notebooks/:id - Update notebook config
  app.patch("/api/gpu/workers/notebooks/:id", requireAuth, requirePermission("gpu:pool:manage"), async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: workerId } = params;
      const { gpuWorkers: gpuWorkersTable } = await import("../shared/schema");
      const { notebookUrl, description } = req.body;
      
      const updates: Partial<typeof gpuWorkersTable.$inferInsert> = {};
      if (notebookUrl) updates.accountId = notebookUrl;
      if (description) updates.accountId = description; // Using accountId field for description
      
      const [updated] = await db.update(gpuWorkersTable)
        .set(updates)
        .where(eq(gpuWorkersTable.id, workerId))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ error: "Worker not found" });
      }
      
      res.json({
        success: true,
        worker: updated,
      });
      
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });
  
  // DELETE /api/gpu/workers/notebooks/:id - Remove notebook from pool
  app.delete("/api/gpu/workers/notebooks/:id", requireAuth, requirePermission("gpu:pool:manage"), async (req, res) => {
    try {
      // ✅ FIX P0-2: Validate route parameters
      const params = validateParams(idParamSchema, req, res);
      if (!params) return; // Error response already sent
      
      const { id: workerId } = params;
      const { gpuWorkers: gpuWorkersTable } = await import("../shared/schema");
      
      // Stop session if running
      const { orchestratorService } = await import("./gpu-orchestration/orchestrator-service");
      await orchestratorService.stopGPU(workerId);
      
      // Delete worker
      const deletedResult = await db.delete(gpuWorkersTable)
        .where(eq(gpuWorkersTable.id, workerId))
        .returning();
      const deleted = deletedResult[0];
      
      if (!deleted) {
        return res.status(404).json({ error: "Worker not found" });
      }
      
      res.json({
        success: true,
        message: `Worker ${workerId} removed from orchestration pool`,
      });
      
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // GET /api/gpu/overview - UNIFIED endpoint for all GPU workers + stats
  app.get("/api/gpu/overview", requireAuth, requirePermission("gpu:pool:read"), async (req, res) => {
    try {
      const { quotaManager } = await import("./gpu-orchestration/intelligent-quota-manager");
      const { orchestratorService } = await import("./gpu-orchestration/orchestrator-service");
      
      // Fetch ALL workers (manual + auto-managed)
      const allWorkers = await db.query.gpuWorkers.findMany({
        orderBy: (workers, { desc }) => [desc(workers.createdAt)],
      });
      
      // Enrich workers with type-specific data
      const enrichedWorkers = await Promise.all(
        allWorkers.map(async (worker) => {
          const baseWorker = {
            ...worker,
            source: worker.autoManaged ? 'auto' as const : 'manual' as const,
          };
          
          // Add quota info for auto-managed workers
          if (worker.autoManaged) {
            const quotaStatus = await quotaManager.getQuotaStatus(worker.id);
            return {
              ...baseWorker,
              quotaStatus,
            };
          }
          
          return baseWorker;
        })
      );
      
      // Calculate global stats
      const stats = {
        total: allWorkers.length,
        healthy: allWorkers.filter(w => w.status === 'healthy' || w.status === 'online').length,
        unhealthy: allWorkers.filter(w => w.status === 'unhealthy').length,
        offline: allWorkers.filter(w => w.status === 'offline').length,
        pending: allWorkers.filter(w => w.status === 'pending').length,
        totalRequests: allWorkers.reduce((sum, w) => sum + (w.requestCount || 0), 0),
        avgLatency: allWorkers.length > 0 
          ? allWorkers.reduce((sum, w) => sum + (w.averageLatencyMs || 0), 0) / allWorkers.length
          : 0,
        autoManaged: allWorkers.filter(w => w.autoManaged).length,
        manual: allWorkers.filter(w => !w.autoManaged).length,
      };
      
      // Get orchestrator status
      const orchestratorStatus = await orchestratorService.getStatus();
      
      res.json({
        workers: enrichedWorkers,
        stats,
        orchestrator: orchestratorStatus,
      });
      
    } catch (error: unknown) {
      console.error("[GPU Overview] Error:", error);
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
