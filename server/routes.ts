import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
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
import { seedDatabase } from "./seed";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { auditMiddleware } from "./middleware/audit";
import { exportPrometheusMetrics } from "./metrics/exporter";
import { metricsCollector } from "./metrics/collector";
import { imageGenerator } from "./generation/image-generator";
import { videoGenerator } from "./generation/video-generator";
import multer from "multer";
import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { optionalAuth } from "./replitAuth";
import { DatasetProcessor } from "./training/datasets/dataset-processor";
import { DatasetValidator } from "./training/datasets/dataset-validator";
import { db } from "./db";
import { eq, and, gte, sql } from "drizzle-orm";
import { trainingDataCollection, datasets, trainingJobs } from "../shared/schema";

const upload = multer({ dest: "/tmp/uploads/" });

const startupTime = Date.now();

export function registerRoutes(app: Express): Server {
  // Apply audit middleware globally (lightweight)
  app.use(auditMiddleware);
  
  // Apply rate limiting ONLY to API routes (not static assets)
  app.use("/api", rateLimitMiddleware);
  
  // Seed database on startup
  seedDatabase().catch(console.error);

  // ========================================
  // HEALTH CHECK ENDPOINTS (for multi-cloud deployment)
  // ========================================
  
  // GET /health - Basic health check (fast, for load balancers)
  app.get("/health", async (req, res) => {
    try {
      // Quick database ping
      const { pool } = await import("./db");
      await pool.query("SELECT 1");
      
      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - startupTime) / 1000),
      });
    } catch (error: any) {
      res.status(503).json({
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  });
  
  // GET /health/detailed - Detailed health check (for monitoring)
  app.get("/health/detailed", async (req, res) => {
    const checks: any = {
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startupTime) / 1000),
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
      services: {},
    };
    
    let allHealthy = true;
    
    // Database check
    try {
      const { pool } = await import("./db");
      const start = Date.now();
      await pool.query("SELECT 1");
      const latency = Date.now() - start;
      
      checks.services.database = {
        status: "healthy",
        latency: `${latency}ms`,
      };
    } catch (error: any) {
      allHealthy = false;
      checks.services.database = {
        status: "unhealthy",
        error: error.message,
      };
    }
    
    // Free APIs check
    try {
      const apiStatus = freeLLMProviders.getHealthStatus();
      checks.services.freeAPIs = {
        status: "healthy",
        providers: apiStatus,
      };
    } catch (error: any) {
      checks.services.freeAPIs = {
        status: "degraded",
        error: error.message,
      };
    }
    
    // OpenAI check
    try {
      const hasOpenAI = !!process.env.OPENAI_API_KEY;
      checks.services.openai = {
        status: hasOpenAI ? "healthy" : "not_configured",
        configured: hasOpenAI,
      };
    } catch (error: any) {
      checks.services.openai = {
        status: "unknown",
        error: error.message,
      };
    }
    
    // GPU Pool check
    try {
      const gpuStatus = gpuOrchestrator.getStatus();
      const activeWorkers = gpuStatus.endpoints.filter(e => e.status === 'online').length;
      const totalWorkers = gpuStatus.endpoints.length;
      checks.services.gpuPool = {
        status: activeWorkers > 0 ? "healthy" : "no_workers",
        activeWorkers,
        totalWorkers,
      };
    } catch (error: any) {
      checks.services.gpuPool = {
        status: "degraded",
        error: error.message,
      };
    }
    
    checks.status = allHealthy ? "healthy" : "degraded";
    res.status(allHealthy ? 200 : 503).json(checks);
  });
  
  // GET /health/ready - Readiness probe (for Kubernetes/Cloud Run)
  app.get("/health/ready", async (req, res) => {
    try {
      const { pool } = await import("./db");
      await pool.query("SELECT 1");
      res.status(200).json({ ready: true });
    } catch (error: any) {
      res.status(503).json({ ready: false, error: error.message });
    }
  });
  
  // GET /health/live - Liveness probe (for Kubernetes/Cloud Run)
  app.get("/health/live", (req, res) => {
    res.status(200).json({ alive: true });
  });
  
  // GET /health/multi-cloud - Multi-cloud status (for monitoring)
  app.get("/health/multi-cloud", (req, res) => {
    try {
      const { multiCloudSync } = require("../deployment/multi-cloud-sync");
      const status = multiCloudSync.getStatus();
      res.status(200).json(status);
    } catch (error: any) {
      res.status(503).json({
        error: "Multi-cloud sync not enabled",
        message: error.message,
      });
    }
  });

  // POST /api/v1/chat/completions
  // 🎯 PRIORITY ORDER: KB → Free APIs → Web → OpenAI
  app.post("/api/v1/chat/completions", async (req, res) => {
    const startTime = Date.now();
    const tenantId = req.body.tenant_id || 1;
    
    try {
      const { messages } = req.body;
      
      // DEBUG: Log message history length
      console.log(`[Chat API] Recebidas ${messages.length} mensagens no histórico`);
      console.log(`[Chat API] Últimas 3 mensagens:`, messages.slice(-3).map((m: any) => ({
        role: m.role,
        preview: m.content?.substring(0, 50)
      })));
      
      // Record request metrics
      metricsCollector.recordRequest(tenantId);
      
      // Get policy or use DEFAULT UNRESTRICTED (all rules = false)
      const policy = await enforcementPipeline.getOrCreateDefaultPolicy(tenantId);
      
      // Get last user message for language detection
      const lastUserMessage = messages[messages.length - 1]?.content || '';
      const systemPrompt = await enforcementPipeline.composeSystemPrompt(policy, lastUserMessage);
      const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];
      
      // 🚀 USE PRIORITY ORCHESTRATOR
      // 1. Knowledge Base (RAG)
      // 2. Free APIs (Groq → Gemini → HF → OpenRouter) with auto-fallback
      // 3. Web Search (if refusal detected in step 2)
      // 4. OpenAI (last resort) with auto-fallback
      
      // Check if system is UNRESTRICTED (all rules = false)
      const activeRules = Object.values(policy.rules).filter(v => v === true);
      const isUnrestricted = activeRules.length === 0;
      
      const result = await generateWithPriority({
        messages: fullMessages,
        tenantId,
        temperature: policy.temperature,
        topP: policy.topP,
        unrestricted: isUnrestricted  // Auto-fallback when true
      });
      
      // Record metrics
      const latency = Date.now() - startTime;
      metricsCollector.recordLatency(tenantId, latency);
      if (result.usage) {
        metricsCollector.recordTokens(tenantId, result.usage.totalTokens);
      }
      
      // 🧠 AUTO-INDEX CONVERSATION TO KNOWLEDGE BASE
      // This enables AION to learn from conversations and use KB first next time
      try {
        const userMessage = messages[messages.length - 1]?.content || '';
        const aiResponse = result.content;
        
        // Build conversation context from last N exchanges (up to 5)
        const contextWindow = 5;
        const recentMessages = messages.slice(-contextWindow * 2); // User + Assistant pairs
        
        let conversationContext = '';
        for (const msg of recentMessages) {
          const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'AION' : 'System';
          if (msg.role !== 'system') { // Skip system prompts
            conversationContext += `${role}: ${msg.content}\n\n`;
          }
        }
        
        // Add current exchange
        conversationContext += `AION: ${aiResponse}\n\n`;
        
        // Add metadata about the exchange
        conversationContext += `[Source: ${result.source}, Provider: ${result.provider}]`;
        
        const conversationTitle = `Chat: ${userMessage.substring(0, 60)}...`;
        
        // Create document in database
        const doc = await storage.createDocument({
          tenantId,
          title: conversationTitle,
          content: conversationContext,
          source: 'conversation',
          metadata: {
            query: userMessage.substring(0, 200),
            description: `Auto-indexed from ${result.source} (${result.provider}), ${recentMessages.length + 1} messages`
          }
        });
        
        // Index into Knowledge Base (async, don't wait)
        knowledgeIndexer.indexDocument(doc.id, conversationContext, tenantId)
          .then(() => console.log(`   ✅ Conversation indexed into KB (doc ${doc.id}, ${recentMessages.length + 1} messages)`))
          .catch(err => console.error(`   ✗ Failed to index conversation:`, err.message));
        
      } catch (indexError: any) {
        // Don't fail the request if indexing fails
        console.error('[Auto-Index] Failed to index conversation:', indexError.message);
      }
      
      res.json({
        choices: [{ 
          message: { 
            role: "assistant", 
            content: result.content 
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
    } catch (error: any) {
      metricsCollector.recordError(tenantId);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/transcribe (Whisper audio transcription)
  app.post("/api/v1/transcribe", upload.single("audio"), async (req, res) => {
    const startTime = Date.now();
    try {
      if (!req.file) throw new Error("No audio file uploaded");
      
      const tenantId = parseInt(req.body.tenant_id || "1");
      metricsCollector.recordRequest(tenantId);
      
      // Call OpenAI Whisper API
      const transcription = await llmClient.transcribeAudio(req.file.path);
      
      const latency = Date.now() - startTime;
      metricsCollector.recordLatency(tenantId, latency);
      
      res.json({ text: transcription });
    } catch (error: any) {
      metricsCollector.recordError(parseInt(req.body.tenant_id || "1"));
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/chat/multimodal (Chat with file attachments)
  app.post("/api/v1/chat/multimodal", upload.array("files", 5), async (req, res) => {
    const startTime = Date.now();
    const parsedData = JSON.parse(req.body.data || "{}");
    const tenantId = parsedData.tenant_id || 1;
    
    try {
      const { messages } = parsedData;
      const files = req.files as Express.Multer.File[];
      
      metricsCollector.recordRequest(tenantId);
      
      // Get policy or use DEFAULT UNRESTRICTED (all rules = false)
      const policy = await enforcementPipeline.getOrCreateDefaultPolicy(tenantId);
      
      // Process all uploaded files
      let attachmentsContext = "";
      if (files && files.length > 0) {
        const processedFiles = await Promise.all(
          files.map(async (file) => {
            const mimeType = fileProcessor.detectMimeType(file.originalname);
            const processed = await fileProcessor.processFile(file.path, mimeType);
            return `[${file.originalname}]: ${processed.extractedText}`;
          })
        );
        attachmentsContext = "\n\nAttached files:\n" + processedFiles.join("\n\n");
      }
      
      // Append file context to last user message
      const enrichedMessages = [...messages];
      if (enrichedMessages.length > 0 && attachmentsContext) {
        const lastMsg = enrichedMessages[enrichedMessages.length - 1];
        if (lastMsg.role === "user") {
          lastMsg.content += attachmentsContext;
        }
      }
      
      // Get last user message for language detection
      const lastUserMessage = messages[messages.length - 1]?.content || '';
      const systemPrompt = await enforcementPipeline.composeSystemPrompt(policy, lastUserMessage);
      const fullMessages = [{ role: "system", content: systemPrompt }, ...enrichedMessages];
      
      const result = await llmClient.chatCompletion({
        messages: fullMessages,
        tenantId,
        temperature: policy.temperature,
        topP: policy.topP,
      });
      
      const moderated = await enforcementPipeline.moderateOutput(result.content, policy, tenantId);
      
      // ⚡ AUTOMATIC FALLBACK: If OpenAI refused and system is UNRESTRICTED,
      // search web, index in KB, and respond without censorship
      const userMessage = messages[messages.length - 1]?.content || '';
      const fallbackResult = await autoFallback.checkAndExecuteFallback(
        moderated,
        userMessage,
        tenantId,
        policy
      );
      
      const finalContent = fallbackResult.content;
      
      const latency = Date.now() - startTime;
      metricsCollector.recordLatency(tenantId, latency);
      metricsCollector.recordTokens(tenantId, result.usage?.totalTokens || 0);
      
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
    } catch (error: any) {
      metricsCollector.recordError(tenantId);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/kb/ingest
  app.post("/api/kb/ingest", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) throw new Error("No file uploaded");
      
      const tenantId = parseInt(req.body.tenant_id || "1");
      const mimeType = fileProcessor.detectMimeType(req.file.originalname);
      
      const processed = await fileProcessor.processFile(req.file.path, mimeType);
      
      const doc = await storage.createDocument({
        tenantId,
        filename: req.file.originalname,
        mimeType,
        size: req.file.size,
        storageUrl: req.file.path,
        extractedText: processed.extractedText,
        status: "pending",
        metadata: processed.metadata,
      });
      
      await ragService.indexDocument(doc.id, processed.extractedText, tenantId);
      
      res.json({ ok: true, id: doc.id });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/kb/search
  app.post("/api/kb/search", async (req, res) => {
    try {
      const { query, k, tenant_id } = req.body;
      const results = await ragService.search(query, tenant_id || 1, { k: k || 10 });
      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agent/plan_act
  app.post("/api/agent/plan_act", async (req, res) => {
    try {
      const { goal, tenant_id, conversation_id, message_id } = req.body;
      
      const tools = new Map(Object.entries(agentTools).map(([name, fn]) => [
        name,
        async (input: any) => fn({ ...input, tenantId: tenant_id || 1 }),
      ]));
      
      const result = await reactEngine.execute(goal, tenant_id || 1, conversation_id || 1, message_id || 1, tools);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET/POST /api/admin/policies/:tenant_id
  app.get("/api/admin/policies/:tenant_id", async (req, res) => {
    try {
      const policy = await storage.getPolicyByTenant(parseInt(req.params.tenant_id));
      res.json(policy || {});
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/policies/:tenant_id", async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenant_id);
      const existing = await storage.getPolicyByTenant(tenantId);
      
      if (existing) {
        const updated = await storage.updatePolicy(existing.id, req.body);
        res.json(updated);
      } else {
        const created = await storage.createPolicy({ ...req.body, tenantId });
        res.json(created);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/admin/settings/timezone/:tenant_id - Get tenant timezone
  app.get("/api/admin/settings/timezone/:tenant_id", async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenant_id);
      const tenant = await storage.getTenant(tenantId);
      
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      
      res.json({ timezone: tenant.timezone || "America/Sao_Paulo" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/settings/timezone/:tenant_id - Update tenant timezone
  app.post("/api/admin/settings/timezone/:tenant_id", async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenant_id);
      const { timezone } = req.body;
      
      if (!timezone || typeof timezone !== 'string') {
        return res.status(400).json({ error: "Invalid timezone" });
      }
      
      // Validate timezone using Intl
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
      } catch {
        return res.status(400).json({ error: "Invalid IANA timezone" });
      }
      
      const updated = await storage.updateTenant(tenantId, { timezone });
      res.json({ timezone: updated.timezone, success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/metrics/realtime
  app.get("/api/metrics/realtime", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string || "1");
      const metrics = await storage.getMetricsByTenant(tenantId, undefined, 100);
      res.json({ metrics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/llm/status - Status das APIs gratuitas (Groq, Gemini, HF)
  app.get("/api/llm/status", async (req, res) => {
    try {
      const status = freeLLMProviders.getStatus();
      
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/gpu/status - Status do orquestrador de GPUs
  app.get("/api/gpu/status", async (req, res) => {
    try {
      const status = gpuOrchestrator.getStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/gpu/register - Registrar GPU (Colab/Kaggle/Modal via Ngrok)
  app.post("/api/gpu/register", async (req, res) => {
    try {
      const { provider, ngrok_url } = req.body;
      
      if (!provider || !ngrok_url) {
        return res.status(400).json({ error: "provider e ngrok_url são obrigatórios" });
      }

      if (!["colab", "kaggle", "modal"].includes(provider)) {
        return res.status(400).json({ error: "provider deve ser colab, kaggle ou modal" });
      }

      await gpuOrchestrator.registerGPU(provider, ngrok_url);
      
      res.json({ 
        success: true, 
        message: `GPU ${provider} registrada com sucesso`,
        url: ngrok_url,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/gpu/unregister - Desregistrar GPU
  app.post("/api/gpu/unregister", async (req, res) => {
    try {
      const { provider } = req.body;
      
      if (!provider || !["colab", "kaggle", "modal"].includes(provider)) {
        return res.status(400).json({ error: "provider inválido" });
      }

      gpuOrchestrator.unregisterGPU(provider);
      
      res.json({ 
        success: true, 
        message: `GPU ${provider} desregistrada`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/training/prepare - Preparar dataset de treino
  app.post("/api/training/prepare", async (req, res) => {
    try {
      const { tenant_id, criteria } = req.body;
      const tenantId = tenant_id || 1;

      const result = await trainingDataCollector.prepareDataset(tenantId, criteria);
      
      res.json({
        success: true,
        filepath: result.filepath,
        stats: result.stats,
        validation: result.validation,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training/stats - Estatísticas de dados disponíveis
  app.get("/api/training/stats", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string || "1");
      
      // Coletar dados sem exportar
      const examples = await trainingDataCollector.collectTrainingData(tenantId);
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/index-pdfs (index all 7 technical PDFs)
  app.post("/api/admin/index-pdfs", async (req, res) => {
    try {
      const tenantId = parseInt(req.body.tenant_id || "1");
      const documentIds = await knowledgeIndexer.indexAllPDFs(tenantId);
      res.json({ success: true, documentIds });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // KNOWLEDGE BASE MANAGEMENT
  // ============================================================================

  // GET /api/admin/documents/:tenant_id - List all documents for a tenant
  app.get("/api/admin/documents/:tenant_id", async (req, res) => {
    try {
      const tenantId = parseInt(req.params.tenant_id);
      const documents = await storage.getDocumentsByTenant(tenantId, 1000);
      res.json(documents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/documents - Add new document (manual text)
  app.post("/api/admin/documents", async (req, res) => {
    try {
      const { tenant_id, title, content, source } = req.body;
      
      if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required" });
      }

      const doc = await storage.createDocument({
        tenantId: tenant_id || 1,
        title,
        content,
        source: source || "manual",
        status: "indexed",
      });

      // Index document for RAG
      await knowledgeIndexer.indexDocument(doc.id, doc.content, tenant_id || 1);

      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // PATCH /api/admin/documents/:id - Update document
  app.patch("/api/admin/documents/:id", async (req, res) => {
    try {
      const docId = parseInt(req.params.id);
      const { title, content } = req.body;

      const updated = await storage.updateDocument(docId, { title, content });
      
      // Re-index document
      if (content) {
        await knowledgeIndexer.reIndexDocument(docId, content, updated.tenantId);
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/admin/documents/:id - Delete document
  app.delete("/api/admin/documents/:id", async (req, res) => {
    try {
      const docId = parseInt(req.params.id);
      await storage.deleteDocument(docId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/learn-from-url - Learn from a URL
  app.post("/api/admin/learn-from-url", async (req, res) => {
    try {
      const { tenant_id, url } = req.body;

      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      // Fetch content from URL
      const response = await axios.get(url, { timeout: 30000 });
      const cheerio = await import("cheerio");
      const $ = cheerio.load(response.data);

      // Extract text content (more aggressive extraction)
      $("script, style, nav, footer, header, aside, .advertisement, .ad, .sidebar").remove();
      const title = $("title").text() || $("h1").first().text() || url;
      const content = $("body").text().replace(/\s+/g, " ").trim();

      if (!content) {
        return res.status(400).json({ error: "No content found at URL" });
      }

      // Allow up to 1 million characters for deep learning
      const finalContent = content.length > 1000000 ? content.substring(0, 1000000) : content;

      // Create document
      const doc = await storage.createDocument({
        tenantId: tenant_id || 1,
        title,
        content: finalContent,
        source: "url",
        status: "indexed",
        metadata: { 
          url,
          originalLength: content.length,
          truncated: content.length > 1000000,
        },
      });

      // Index for RAG
      await knowledgeIndexer.indexDocument(doc.id, content, tenant_id || 1);

      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/upload-files - Upload and process multiple files
  app.post("/api/admin/upload-files", upload.array("files", 20), async (req, res) => {
    try {
      const { tenant_id } = req.body;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const processedDocs = [];
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

          // Create document in database
          const doc = await storage.createDocument({
            tenantId: tenant_id || 1,
            title: file.originalname,
            content: processed.extractedText,
            source: "upload",
            status: "indexed",
            metadata: {
              filename: file.originalname,
              mimeType,
              size: processed.size,
              charCount,
              wordCount,
              ...processed.metadata,
            },
          });

          // Index for RAG
          await knowledgeIndexer.indexDocument(doc.id, processed.extractedText, tenant_id || 1);

          processedDocs.push(doc);

          // Clean up temp file
          await fs.unlink(file.path).catch(() => {});
        } catch (error: any) {
          console.error(`Error processing ${file.originalname}:`, error);
          errors.push({ filename: file.originalname, error: error.message });
        }
      }

      res.json({
        success: true,
        processed: processedDocs.length,
        documents: processedDocs,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/web-search-learn - Search web and learn
  app.post("/api/admin/web-search-learn", async (req, res) => {
    try {
      const { tenant_id, query } = req.body;

      if (!query) {
        return res.status(400).json({ error: "Search query is required" });
      }

      // Use SearchWeb tool to find results
      const searchObservation = await agentTools.SearchWeb({ query });
      
      // Parse results (SearchWeb returns AgentObservation with observation field)
      const results = JSON.parse(searchObservation.observation);
      const documentsIndexed = [];

      // Fetch and index top 10 results for comprehensive learning
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
            
            const doc = await storage.createDocument({
              tenantId: tenant_id || 1,
              title: result.title,
              content: finalContent,
              source: "web-search",
              status: "indexed",
              metadata: { 
                url: result.url, 
                query,
                originalLength: content.length,
                truncated: content.length > 1000000,
              },
            });

            await knowledgeIndexer.indexDocument(doc.id, doc.content, tenant_id || 1);
            documentsIndexed.push(doc);
          }
        } catch (err) {
          console.error(`Failed to fetch ${result.url}:`, err);
        }
      }

      res.json({ documentsIndexed: documentsIndexed.length, documents: documentsIndexed });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/documents (list documents)
  app.get("/api/documents", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string || "1");
      const documents = await storage.getDocumentsByTenant(tenantId, 100);
      res.json({ documents });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/agent/hierarchical_plan (hierarchical planning)
  app.post("/api/agent/hierarchical_plan", async (req, res) => {
    try {
      const { goal, tenant_id, conversation_id, message_id } = req.body;
      
      const plan = await hierarchicalPlanner.decomposeGoal(goal, tenant_id || 1);
      
      const tools = new Map(Object.entries(agentTools).map(([name, fn]) => [
        name,
        async (input: any) => fn({ ...input, tenantId: tenant_id || 1 }),
      ]));
      
      const result = await hierarchicalPlanner.executePlan(
        plan,
        tenant_id || 1,
        conversation_id || 1,
        message_id || 1,
        tools
      );
      
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // CONTENT GENERATION - Images, Text, Video (NO CENSORSHIP)
  // ============================================================================
  
  // POST /api/generate/image - Generate image using DALL-E 3
  app.post("/api/generate/image", async (req, res) => {
    try {
      const { prompt, size, quality, style, tenant_id, conversation_id } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      
      const tenantId = tenant_id || 1;
      
      console.log(`[API] Generating image for tenant ${tenantId}: "${prompt.slice(0, 60)}..."`);
      
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
        tenantId,
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
    } catch (error: any) {
      console.error(`[API] Error generating image:`, error.message);
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/generate/text - Generate text file (code, markdown, etc)
  app.post("/api/generate/text", async (req, res) => {
    try {
      const { content, filename, language, tenant_id, conversation_id } = req.body;
      
      if (!content || !filename) {
        return res.status(400).json({ error: "Content and filename are required" });
      }
      
      const tenantId = tenant_id || 1;
      
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
        tenantId,
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/files/:id - Download generated file
  app.get("/api/files/:id", async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/files/:id/download - Force download
  app.get("/api/files/:id/download", async (req, res) => {
    try {
      const fileId = parseInt(req.params.id);
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // ============================================================================
  // VIDEO GENERATION ROUTES - Professional GPU-backed video generation
  // ============================================================================
  
  // POST /api/videos/generate - Submit video generation job
  app.post("/api/videos/generate", async (req, res) => {
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
        tenant_id,
        conversation_id,
      } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }
      
      const tenantId = tenant_id || 1;
      
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
        tenantId,
        conversationId: conversation_id,
      });
      
      res.json({
        success: true,
        job: result,
      });
    } catch (error: any) {
      console.error("[API] Video generation failed:", error.message);
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/videos/jobs/:id - Get video job status
  app.get("/api/videos/jobs/:id", async (req, res) => {
    try {
      const jobId = parseInt(req.params.id);
      const status = await videoGenerator.getJobStatus(jobId);
      res.json(status);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  });
  
  // GET /api/videos/:id - Download video asset
  app.get("/api/videos/:id", async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
          tenantId: job.tenantId,
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
    } catch (error: any) {
      console.error("[API] Webhook processing failed:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // CONVERSATIONS & MESSAGES - Chat persistence with Replit Auth
  // ============================================================================
  
  // GET /api/auth/user - Get current user info or null
  app.get("/api/auth/user", optionalAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!req.isAuthenticated() || !user?.claims) {
        return res.json(null);
      }
      
      const userId = user.claims.sub;
      const userData = await storage.getUser(userId);
      
      res.json(userData || null);
    } catch (error: any) {
      res.json(null);
    }
  });
  
  // GET /api/conversations - List conversations (user's if logged in, empty for anonymous)
  app.get("/api/conversations", optionalAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Only authenticated users can list conversations
      if (!req.isAuthenticated() || !user?.claims?.sub) {
        // Anonymous users don't have persistent conversations
        return res.json([]);
      }
      
      const userId = user.claims.sub;
      const conversationsWithCount = await storage.getConversationsWithMessageCount(userId, 50);
      
      res.json(conversationsWithCount);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/conversations - Create new conversation
  app.post("/api/conversations", optionalAuth, async (req, res) => {
    try {
      const { tenant_id, title } = req.body;
      const tenantId = tenant_id || 1;
      const user = req.user as any;
      
      // Get userId if authenticated
      const userId = req.isAuthenticated() && user?.claims?.sub ? user.claims.sub : null;
      
      const conversation = await storage.createConversation({
        tenantId,
        userId: userId || undefined,
        title: title || "New Conversation",
      });
      
      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/conversations/:id - Get conversation (with strict ownership check)
  app.get("/api/conversations/:id", optionalAuth, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      // Verify ownership
      const user = req.user as any;
      const userId = req.isAuthenticated() && user?.claims?.sub ? user.claims.sub : null;
      
      // Anonymous conversations (userId null) are not accessible - no way to verify ownership
      if (!conversation.userId) {
        return res.status(403).json({ error: "Forbidden: Anonymous conversations not accessible" });
      }
      
      // Only the owner can access their conversation
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Forbidden: You don't own this conversation" });
      }
      
      res.json(conversation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/conversations/:id/messages - Get messages (with strict ownership check)
  app.get("/api/conversations/:id/messages", optionalAuth, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      
      // Verify ownership first
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      const user = req.user as any;
      const userId = req.isAuthenticated() && user?.claims?.sub ? user.claims.sub : null;
      
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/conversations/:id/messages - Save message
  app.post("/api/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
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
      
      // 🧠 AUTO-COLLECT HIGH-QUALITY CONVERSATIONS FOR TRAINING
      // Trigger after ASSISTANT messages (conversation complete)
      if (role === "assistant") {
        try {
          const { ConversationCollector } = await import("./training/collectors/conversation-collector");
          
          // Get all messages for this conversation
          const allMessages = await storage.getMessagesByConversation(conversationId);
          
          // Calculate quality metrics
          const metrics = ConversationCollector.calculateQualityScore(allMessages);
          
          // Only collect if quality meets threshold
          if (ConversationCollector.shouldCollect(metrics)) {
            // Check if already collected
            const existing = await storage.getTrainingDataCollectionByConversation(conversationId);
            
            if (!existing) {
              // Get conversation for tenantId
              const conversation = await storage.getConversation(conversationId);
              if (conversation) {
                // Convert to training format
                const systemPrompt = ConversationCollector.extractSystemPrompt(allMessages);
                const formattedData = ConversationCollector.convertToTrainingFormat(allMessages, systemPrompt);
                
                // Create training data collection entry
                await storage.createTrainingDataCollection({
                  conversationId,
                  tenantId: conversation.tenantId,
                  autoQualityScore: metrics.score,
                  status: "pending",
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
                
                console.log(`   ✅ High-quality conversation collected for training (ID: ${conversationId}, score: ${metrics.score}, messages: ${metrics.messageCount})`);
              }
            }
          }
        } catch (collectorError: any) {
          // Don't fail the request if collection fails
          console.error('[Auto-Collect] Failed to collect training data:', collectorError.message);
        }
      }
      
      res.json(message);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // DELETE /api/conversations/:id - Delete conversation (with strict ownership check)
  app.delete("/api/conversations/:id", optionalAuth, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const conversation = await storage.getConversation(conversationId);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      // Verify ownership
      const user = req.user as any;
      const userId = req.isAuthenticated() && user?.claims?.sub ? user.claims.sub : null;
      
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // PROJECT ROUTES - ChatGPT-style project organization
  // ============================================================================
  
  // GET /api/projects - List user's projects
  app.get("/api/projects", optionalAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!req.isAuthenticated() || !user?.claims?.sub) {
        return res.json([]);
      }
      
      const userId = user.claims.sub;
      const projects = await storage.getProjectsByUser(userId);
      
      res.json(projects);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/projects - Create new project
  app.post("/api/projects", optionalAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!req.isAuthenticated() || !user?.claims?.sub) {
        return res.status(401).json({ error: "Authentication required to create projects" });
      }
      
      const userId = user.claims.sub;
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // PATCH /api/projects/:id - Update project
  app.patch("/api/projects/:id", optionalAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!req.isAuthenticated() || !user?.claims?.sub) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const userId = user.claims.sub;
      if (project.userId !== userId) {
        return res.status(403).json({ error: "Forbidden: You don't own this project" });
      }
      
      const { name, description } = req.body;
      const updated = await storage.updateProject(projectId, {
        name: name?.trim(),
        description: description?.trim(),
      });
      
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // DELETE /api/projects/:id - Delete project
  app.delete("/api/projects/:id", optionalAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!req.isAuthenticated() || !user?.claims?.sub) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const projectId = parseInt(req.params.id);
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const userId = user.claims.sub;
      if (project.userId !== userId) {
        return res.status(403).json({ error: "Forbidden: You don't own this project" });
      }
      
      await storage.deleteProject(projectId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // AGENT CHAT ENDPOINT - Automatic tool usage (SearchVideos, SearchWeb, etc)
  // ============================================================================
  
  // Helper: Detect explicit source request keywords
  function detectExplicitSourceRequest(message: string): {
    source: 'web' | 'deepweb' | 'kb' | 'free-apis' | null;
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
    
    // DeepWeb keywords (Portuguese + English + variations)
    const deepwebKeywords = [
      'consulte na deepweb', 'pesquise na deepweb', 'busque na deepweb', 'procure na deepweb',
      'consulte na deep web', 'pesquise na deep web', 'busque na deep web', 'procure na deep web',
      'consulte no tor', 'pesquise no tor', 'busque no tor', 'procure no tor',
      'consulte na darkweb', 'pesquise na darkweb', 'dark web', 'darknet',
      'search deepweb', 'search deep web', 'search tor', 'search dark web',
      'look up deepweb', 'find on tor', 'onion search'
    ];
    
    // Knowledge Base keywords
    const kbKeywords = [
      'consulte na knowledge base', 'pesquise na knowledge base',
      'consulte na kb', 'pesquise na kb',
      'consulte na base de conhecimento', 'pesquise na base de conhecimento',
      'search knowledge base', 'search kb'
    ];
    
    // Check DeepWeb first (more specific)
    for (const keyword of deepwebKeywords) {
      if (normalized.includes(keyword)) {
        return { 
          source: 'deepweb', 
          cleanQuery: message.replace(new RegExp(keyword, 'gi'), '').trim() 
        };
      }
    }
    
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
  app.post("/api/agent/chat", async (req, res) => {
    const startTime = Date.now();
    const tenantId = req.body.tenant_id || 1;
    
    try {
      const { messages, maxIterations } = req.body;
      
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array is required" });
      }
      
      console.log(`[Agent Chat] Starting ReAct cycle with ${messages.length} messages`);
      
      // Get policy
      const policy = await enforcementPipeline.getOrCreateDefaultPolicy(tenantId);
      
      // Get last user message
      const lastUserMessage = messages[messages.length - 1]?.content || '';
      
      // 🎯 EXPLICIT SOURCE DETECTION: Check if user explicitly requested a specific source
      const explicitRequest = detectExplicitSourceRequest(lastUserMessage);
      
      if (explicitRequest.source) {
        console.log(`[Explicit Request] User requested ${explicitRequest.source.toUpperCase()} search`);
        console.log(`[Explicit Request] Clean query: "${explicitRequest.cleanQuery}"`);
        
        // Call priority orchestrator with forced source
        const orchestratorRequest = {
          messages: messages.map((m: any) => ({
            role: m.role,
            content: m.content
          })),
          tenantId,
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 4000,
          unrestricted: true,  // Always allow when user explicitly requests a source
          forcedSource: explicitRequest.source  // Force specific source
        };
        
        const orchestratorResult = await generateWithPriority(orchestratorRequest);
        
        const latency = Date.now() - startTime;
        metricsCollector.recordLatency(tenantId, latency);
        
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
        async (input: any) => fn({ ...input, tenantId }),
      ]));
      
      // Configure max iterations
      reactEngine.configure({ maxSteps: maxIterations || 5 });
      
      // Run ReAct agent (needs conversationId and messageId for tracking)
      const result = await reactEngine.execute(
        lastUserMessage,
        tenantId,
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
        tenantId,
        policy
      );
      
      const finalContent = fallbackResult.content;
      const latency = Date.now() - startTime;
      
      metricsCollector.recordLatency(tenantId, latency);
      
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
    } catch (error: any) {
      metricsCollector.recordError(tenantId);
      console.error('[Agent Chat] Error:', error);
      res.status(500).json({ error: error.message });
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================================================
  // GPU POOL MANAGEMENT - Multi-GPU Load Balancing
  // ========================================================================

  // GET /api/gpu/status - Get status of all GPU workers
  app.get("/api/gpu/status", async (req, res) => {
    try {
      const { gpuPoolManager } = await import("./gpu/pool-manager");
      const workers = await gpuPoolManager.getAllWorkers();
      const stats = await gpuPoolManager.getPoolStats();
      
      res.json({
        workers,
        stats,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/gpu/register - Register new GPU worker
  app.post("/api/gpu/register", async (req, res) => {
    try {
      const { gpuPoolManager } = await import("./gpu/pool-manager");
      const { provider, accountId, ngrokUrl, capabilities } = req.body;
      
      if (!provider || !ngrokUrl || !capabilities) {
        return res.status(400).json({ 
          error: "Missing required fields: provider, ngrokUrl, capabilities" 
        });
      }
      
      const worker = await gpuPoolManager.registerWorker({
        provider,
        accountId,
        ngrokUrl,
        capabilities,
      });
      
      console.log(`[API] GPU worker registered: ${provider} (${ngrokUrl})`);
      
      res.json({
        success: true,
        worker,
      });
    } catch (error: any) {
      console.error("[API] Error registering GPU worker:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/gpu/:id - Get specific GPU worker
  app.get("/api/gpu/:id", async (req, res) => {
    try {
      const { gpuPoolManager } = await import("./gpu/pool-manager");
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid GPU ID" });
      }
      
      const worker = await gpuPoolManager.getWorker(id);
      
      if (!worker) {
        return res.status(404).json({ error: "GPU worker not found" });
      }
      
      res.json(worker);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/gpu/:id - Remove GPU worker
  app.delete("/api/gpu/:id", async (req, res) => {
    try {
      const { gpuPoolManager } = await import("./gpu/pool-manager");
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid GPU ID" });
      }
      
      const success = await gpuPoolManager.removeWorker(id);
      
      if (!success) {
        return res.status(404).json({ error: "GPU worker not found" });
      }
      
      console.log(`[API] GPU worker removed: ID ${id}`);
      
      res.json({
        success: true,
        message: `GPU worker ${id} removed`,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/gpu/stats - Get pool statistics
  app.get("/api/gpu/stats", async (req, res) => {
    try {
      const { gpuPoolManager } = await import("./gpu/pool-manager");
      const stats = await gpuPoolManager.getPoolStats();
      
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/gpu/healthy - Get only healthy workers
  app.get("/api/gpu/healthy", async (req, res) => {
    try {
      const { gpuPoolManager } = await import("./gpu/pool-manager");
      const workers = await gpuPoolManager.getHealthyWorkers();
      
      res.json({
        count: workers.length,
        workers,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/gpu/generate-notebook - Generate Colab/Kaggle notebook
  app.post("/api/gpu/generate-notebook", async (req, res) => {
    try {
      const { provider, job, config } = req.body;
      const { generateColabNotebook, generateKaggleKernel, DEFAULT_LORA_CONFIGS } = await import("./gpu/orchestrator");
      
      const loraConfig = config || DEFAULT_LORA_CONFIGS[job.model] || DEFAULT_LORA_CONFIGS['mistral-7b'];
      
      const notebook = provider === 'kaggle' 
        ? generateKaggleKernel(job, loraConfig)
        : generateColabNotebook(job, loraConfig);
      
      res.json({ notebook, format: provider === 'kaggle' ? 'python' : 'ipynb' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================================================
  // FEDERATED LEARNING SYSTEM - Distributed Training with Multi-GPU
  // ========================================================================

  // POST /api/training/jobs - Create new federated training job
  app.post("/api/training/jobs", async (req, res) => {
    try {
      const { trainingJobs, insertTrainingJobSchema } = await import("../shared/schema");
      const { db } = await import("./db");
      
      const jobData = insertTrainingJobSchema.parse(req.body);
      
      const [job] = await db.insert(trainingJobs).values(jobData as any).returning();
      
      console.log(`[Federated] Created training job: ${job.name} (ID ${job.id})`);
      
      res.json({ job });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training/jobs - List all training jobs
  app.get("/api/training/jobs", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { trainingJobs } = await import("../shared/schema");
      const { desc } = await import("drizzle-orm");
      
      const tenantId = parseInt(req.query.tenantId as string) || 1;
      const { eq } = await import("drizzle-orm");
      
      const jobs = await db.query.trainingJobs.findMany({
        where: eq(trainingJobs.tenantId, tenantId),
        orderBy: [desc(trainingJobs.createdAt)],
      });
      
      res.json({ jobs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training/jobs/:id - Get training job details
  app.get("/api/training/jobs/:id", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { trainingJobs, trainingWorkers } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const jobId = parseInt(req.params.id);
      
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/training/jobs/:id/start - Start training job
  app.post("/api/training/jobs/:id/start", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { trainingJobs } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const jobId = parseInt(req.params.id);
      
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/training/jobs/:id/pause - Pause training job
  app.post("/api/training/jobs/:id/pause", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { trainingJobs } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const jobId = parseInt(req.params.id);
      
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/training/gradients - Submit gradient update from worker
  app.post("/api/training/gradients", async (req, res) => {
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training/checkpoints/:jobId - Get latest checkpoint
  app.get("/api/training/checkpoints/:jobId", async (req, res) => {
    try {
      const { gradientAggregator } = await import("./federated/gradient-aggregator");
      const jobId = parseInt(req.params.jobId);
      
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
      const checkpointPath = await gradientAggregator.getLatestCheckpoint(jobId);
      
      if (!checkpointPath) {
        return res.status(404).json({ error: "No checkpoint found for this job" });
      }
      
      // Read checkpoint file
      const checkpointData = await fs.readFile(checkpointPath, 'utf-8');
      const checkpoint = JSON.parse(checkpointData);
      
      res.json({ checkpoint, path: checkpointPath });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // DATASET UPLOAD & MANAGEMENT
  // ============================================================================

  // POST /api/training/datasets - Upload new dataset
  app.post("/api/training/datasets", upload.single("file"), async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { name, description, datasetType, tenantId, userId } = req.body;

      if (!name || !datasetType || !tenantId) {
        return res.status(400).json({
          error: "Missing required fields: name, datasetType, tenantId",
        });
      }

      // Process the dataset
      const result = await DatasetProcessor.processDataset({
        tenantId: parseInt(tenantId),
        userId: userId || undefined,
        name,
        description,
        datasetType,
        originalFilename: req.file.originalname,
        tempFilePath: req.file.path,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      });

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Save to database
      const [savedDataset] = await db
        .insert(datasets)
        .values(result.dataset as any)
        .returning();

      res.json({
        message: "Dataset uploaded successfully",
        dataset: savedDataset,
      });
    } catch (error: any) {
      console.error("Dataset upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training/datasets - List all datasets for tenant
  app.get("/api/training/datasets", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const tenantId = parseInt(req.query.tenantId as string);

      if (isNaN(tenantId)) {
        return res.status(400).json({ error: "Invalid tenantId" });
      }

      const datasetList = await db
        .select()
        .from(datasets)
        .where(eq(datasets.tenantId, tenantId))
        .orderBy(datasets.createdAt);

      res.json({ datasets: datasetList });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training/datasets/:id - Get specific dataset
  app.get("/api/training/datasets/:id", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid dataset ID" });
      }

      const [dataset] = await db
        .select()
        .from(datasets)
        .where(eq(datasets.id, id))
        .limit(1);

      if (!dataset) {
        return res.status(404).json({ error: "Dataset not found" });
      }

      res.json({ dataset });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training/datasets/:id/preview - Get dataset content preview
  app.get("/api/training/datasets/:id/preview", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const id = parseInt(req.params.id);
      const maxLines = parseInt((req.query.maxLines as string) || "50");

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid dataset ID" });
      }

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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/training/datasets/:id - Delete dataset
  app.delete("/api/training/datasets/:id", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");

      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid dataset ID" });
      }

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

      res.json({ message: "Dataset deleted successfully" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/training/datasets/bulk-delete - Bulk delete datasets
  app.post("/api/training/datasets/bulk-delete", async (req, res) => {
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training/datasets/:id/download - Download dataset file
  app.get("/api/training/datasets/:id/download", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets } = await import("../shared/schema");
      const { eq } = await import("drizzle-orm");
      const fs = await import("fs/promises");

      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid dataset ID" });
      }

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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/training/datasets/generate-from-kb - Auto-generate dataset from Knowledge Base
  app.post("/api/training/datasets/generate-from-kb", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { datasets, trainingDataCollection } = await import("../shared/schema");
      const { eq, and, gte } = await import("drizzle-orm");
      const fs = await import('fs/promises');
      const path = await import('path');

      const { tenantId, mode, minScore } = req.body;
      const tenant = tenantId || 1;
      const scoreThreshold = minScore || (mode === 'kb-high-quality' ? 80 : 60);

      // Get high-quality conversations from KB
      const conversations = await db
        .select()
        .from(trainingDataCollection)
        .where(
          and(
            eq(trainingDataCollection.tenantId, tenant),
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
          tenantId: tenant,
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
    } catch (error: any) {
      console.error("KB dataset generation error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // TRAINING DATA COLLECTION - Auto-evolution from conversations
  // ============================================================================

  // POST /api/training-data/collect/:conversationId - Collect conversation for training
  app.post("/api/training-data/collect/:conversationId", async (req, res) => {
    try {
      const { ConversationCollector } = await import("./training/collectors/conversation-collector");
      const conversationId = parseInt(req.params.conversationId);

      if (isNaN(conversationId)) {
        return res.status(400).json({ error: "Invalid conversation ID" });
      }

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
        tenantId: conversation.tenantId,
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
    } catch (error: any) {
      console.error("Error collecting training data:", error);
      res.status(500).json({ error: "Failed to collect training data" });
    }
  });

  // GET /api/training/auto-evolution/stats - Get auto-evolution statistics
  app.get("/api/training/auto-evolution/stats", async (req, res) => {
    try {
      const tenantId = 1; // TODO: Get from auth

      // Total conversations collected
      const totalConversationsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trainingDataCollection)
        .where(eq(trainingDataCollection.tenantId, tenantId));
      const totalConversations = totalConversationsResult[0]?.count || 0;

      // High-quality conversations (score >= 60)
      const highQualityResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trainingDataCollection)
        .where(
          and(
            eq(trainingDataCollection.tenantId, tenantId),
            gte(trainingDataCollection.autoQualityScore, 60)
          )
        );
      const highQualityConversations = highQualityResult[0]?.count || 0;

      // Average quality score
      const avgScoreResult = await db
        .select({ avg: sql<number>`avg(${trainingDataCollection.autoQualityScore})::numeric` })
        .from(trainingDataCollection)
        .where(eq(trainingDataCollection.tenantId, tenantId));
      const avgQualityScore = parseFloat(String(avgScoreResult[0]?.avg || 0));

      // Datasets generated from KB (check description for "Auto-generated")
      const kbDatasetsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(datasets)
        .where(
          and(
            eq(datasets.tenantId, tenantId),
            sql`${datasets.description} LIKE '%Auto-generated%KB%'`
          )
        );
      const kbGeneratedDatasets = kbDatasetsResult[0]?.count || 0;

      // Total datasets
      const totalDatasetsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(datasets)
        .where(eq(datasets.tenantId, tenantId));
      const totalDatasets = totalDatasetsResult[0]?.count || 0;

      // Training jobs completed
      const completedJobsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trainingJobs)
        .where(
          and(
            eq(trainingJobs.tenantId, tenantId),
            eq(trainingJobs.status, 'completed')
          )
        );
      const completedJobs = completedJobsResult[0]?.count || 0;

      // Total training jobs
      const totalJobsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trainingJobs)
        .where(eq(trainingJobs.tenantId, tenantId));
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
        .where(
          and(
            eq(trainingDataCollection.tenantId, tenantId),
            gte(trainingDataCollection.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(sql`DATE(${trainingDataCollection.createdAt})`)
        .orderBy(sql`DATE(${trainingDataCollection.createdAt})`);

      const timeline = timelineResult.map((row: any) => ({
        date: row.date,
        count: Number(row.count) || 0,
        avgScore: parseFloat(row.avgScore || '0')
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
    } catch (error: any) {
      console.error("Auto-evolution stats error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training-data - List collected training data
  app.get("/api/training-data", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenantId as string) || 1;
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;

      const data = await storage.getTrainingDataCollectionByTenant(tenantId, status, limit);

      res.json({ trainingData: data });
    } catch (error: any) {
      console.error("Error listing training data:", error);
      res.status(500).json({ error: "Failed to list training data" });
    }
  });

  // PATCH /api/training-data/:id - Update training data status (approve/reject)
  app.patch("/api/training-data/:id", async (req, res) => {
    try {
      const { z } = await import("zod");
      
      const updateSchema = z.object({
        status: z.enum(["pending", "approved", "rejected", "trained"]).optional(),
        rating: z.number().int().min(1).max(5).optional(),
        approvedBy: z.string().optional(),
        tenantId: z.number().int(), // Required for authorization
      });
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      // Validate request body
      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: validation.error.message });
      }
      
      const { status, rating, approvedBy, tenantId } = validation.data;
      
      // Verify tenant ownership
      const existing = await storage.getTrainingDataCollection(id);
      if (!existing) {
        return res.status(404).json({ error: "Training data not found" });
      }
      
      if (existing.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updates: any = {};
      
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

      res.json({ success: true, trainingData: updated });
    } catch (error: any) {
      console.error("Error updating training data:", error);
      res.status(500).json({ error: "Failed to update training data" });
    }
  });

  // DELETE /api/training-data/:id - Delete training data
  app.delete("/api/training-data/:id", async (req, res) => {
    try {
      const { z } = await import("zod");
      
      const deleteSchema = z.object({
        tenantId: z.number().int(),
      });
      
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      // Validate tenant authorization
      const validation = deleteSchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({ error: "Tenant ID required" });
      }
      
      const { tenantId } = validation.data;
      
      // Verify ownership
      const existing = await storage.getTrainingDataCollection(id);
      if (!existing) {
        return res.status(404).json({ error: "Training data not found" });
      }
      
      if (existing.tenantId !== tenantId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteTrainingDataCollection(id);

      res.json({ success: true, message: "Training data deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting training data:", error);
      res.status(500).json({ error: "Failed to delete training data" });
    }
  });

  // POST /api/training/jobs/:id/claim-chunk - Claim an available chunk for training
  app.post("/api/training/jobs/:id/claim-chunk", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { trainingJobs, trainingWorkers } = await import("../shared/schema");
      const { eq, and, or } = await import("drizzle-orm");
      
      const jobId = parseInt(req.params.id);
      const { workerId } = req.body;
      
      if (isNaN(jobId) || !workerId) {
        return res.status(400).json({ error: "Invalid job ID or worker ID" });
      }
      
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/training/jobs/:id/progress - Get real-time training progress
  app.get("/api/training/jobs/:id/progress", async (req, res) => {
    try {
      const { db } = await import("./db");
      const { trainingJobs, trainingWorkers, gradientUpdates } = await import("../shared/schema");
      const { eq, and, sql } = await import("drizzle-orm");
      
      const jobId = parseInt(req.params.id);
      
      if (isNaN(jobId)) {
        return res.status(400).json({ error: "Invalid job ID" });
      }
      
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================================================
  // RAG SYSTEM WITH MMR - AION Supreme  
  // ========================================================================

  // POST /api/rag/search - Semantic search with MMR
  app.post("/api/rag/search", async (req, res) => {
    try {
      const { query, tenantId, options } = req.body;
      const { mmrSearch } = await import("./ai/rag-service");
      
      const results = await mmrSearch(query, tenantId || 1, options);
      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/rag/search-with-confidence - Search with confidence scoring
  app.post("/api/rag/search-with-confidence", async (req, res) => {
    try {
      const { query, tenantId, options } = req.body;
      const { searchWithConfidence } = await import("./ai/rag-service");
      
      const result = await searchWithConfidence(query, tenantId || 1, options);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/rag/index-document - Index document with smart chunking
  app.post("/api/rag/index-document", async (req, res) => {
    try {
      const { documentId, tenantId, content, options } = req.body;
      const { indexDocumentComplete } = await import("./ai/knowledge-indexer");
      
      const chunks = await indexDocumentComplete(documentId, tenantId, content, options);
      res.json({ success: true, chunks });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================================================
  // TRAINING & METRICS - AION Supreme
  // ========================================================================

  // POST /api/training/collect - Collect training data from conversations
  app.post("/api/training/collect", async (req, res) => {
    try {
      const { tenantId, options } = req.body;
      
      const examples = await trainingDataCollector.collectTrainingData(tenantId, options);
      res.json({ examples: examples.length, data: examples });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/training/export - Export training data to JSONL
  app.post("/api/training/export", async (req, res) => {
    try {
      const { tenantId, options } = req.body;
      
      const result = await trainingDataCollector.prepareDataset(tenantId, options);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/metrics/calculate - Calculate RAG metrics (nDCG, MRR, etc.)
  app.post("/api/metrics/calculate", async (req, res) => {
    try {
      const { results, k } = req.body;
      const { calculateAllMetrics } = await import("./ai/metrics");
      
      const metrics = calculateAllMetrics(results, k || 10);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================================================
  // TOKEN MONITORING - AION Supreme
  // ========================================================================

  // GET /api/tokens/summary - Get token usage summary for all providers
  app.get("/api/tokens/summary", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
      const summary = await tokenTracker.getUsageSummary(tenantId);
      res.json(summary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/tokens/quotas - Get free API quotas and remaining capacity
  app.get("/api/tokens/quotas", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
      const quotas = await tokenTracker.getProviderQuotas(tenantId);
      res.json(quotas);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/tokens/trends - Get historical token usage trends
  app.get("/api/tokens/trends", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
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
        const trends = await tokenTracker.getTokenTrendsWithProviders(tenantId, days, startDate, endDate);
        res.json({
          daily: trends,
          period_days: days,
          breakdown: true,
          start_date: startDate?.toISOString().split('T')[0],
          end_date: endDate?.toISOString().split('T')[0]
        });
      } else {
        // Return aggregated data
        const trends = await tokenTracker.getTokenTrends(tenantId, provider, days, startDate, endDate);
        res.json({
          daily: trends,
          period_days: days,
          breakdown: false,
          start_date: startDate?.toISOString().split('T')[0],
          end_date: endDate?.toISOString().split('T')[0]
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/tokens/limits - Set token limits for a provider
  app.post("/api/tokens/limits", async (req, res) => {
    try {
      const { tenantId, provider, limits } = req.body;
      await tokenTracker.setTokenLimit(tenantId || 1, provider, limits);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/tokens/alerts - Get unacknowledged alerts
  app.get("/api/tokens/alerts", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
      const alerts = await tokenTracker.getUnacknowledgedAlerts(tenantId);
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/tokens/alerts/:id/acknowledge - Acknowledge an alert
  app.post("/api/tokens/alerts/:id/acknowledge", async (req, res) => {
    try {
      const alertId = parseInt(req.params.id);
      await tokenTracker.acknowledgeAlert(alertId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/tokens/web-search-history - Get web/deepweb search history with sources
  app.get("/api/tokens/web-search-history", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
      const provider = (req.query.provider as 'web' | 'deepweb' | 'both') || 'both';
      const limit = parseInt(req.query.limit as string) || 100;
      
      const history = await tokenTracker.getWebSearchHistory(tenantId, provider, limit);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/tokens/web-search-stats - Get web/deepweb search statistics
  app.get("/api/tokens/web-search-stats", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
      const stats = await tokenTracker.getWebSearchStats(tenantId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/tokens/kb-history - Get Knowledge Base search history
  app.get("/api/tokens/kb-history", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const history = await tokenTracker.getKBSearchHistory(tenantId, limit);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/tokens/complete-history - Get complete token usage history (all providers)
  app.get("/api/tokens/complete-history", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
      const limit = parseInt(req.query.limit as string) || 500; // Default to last 500 records
      
      const history = await tokenTracker.getCompleteTokenHistory(tenantId, limit);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // GET /api/tokens/cost-history - Get complete cost history with breakdown
  app.get("/api/tokens/cost-history", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
      const limit = parseInt(req.query.limit as string) || 500;
      
      const costHistory = await tokenTracker.getCostHistory(tenantId, limit);
      res.json(costHistory);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/tokens/free-apis-history - Get Free APIs usage history
  app.get("/api/tokens/free-apis-history", async (req, res) => {
    try {
      const tenantId = parseInt(req.query.tenant_id as string) || 1;
      const provider = req.query.provider as 'groq' | 'gemini' | 'huggingface' | 'openrouter' | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const history = await tokenTracker.getFreeAPIsHistory(tenantId, provider, limit);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================================================
  // POLICY ENFORCEMENT - AION Supreme
  // ========================================================================

  // POST /api/policy/detect-violation - Detect policy violations
  app.post("/api/policy/detect-violation", async (req, res) => {
    try {
      const { text, tenantId } = req.body;
      const { enforcePolicy } = await import("./policy/enforcement");
      
      const result = await enforcePolicy(text, tenantId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /metrics (Prometheus format)
  app.get("/metrics", exportPrometheusMetrics);

  const httpServer = createServer(app);
  return httpServer;
}
