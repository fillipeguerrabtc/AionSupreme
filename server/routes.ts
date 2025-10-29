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
import { hierarchicalPlanner } from "./agent/hierarchical-planner";
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

const upload = multer({ dest: "/tmp/uploads/" });

export function registerRoutes(app: Express): Server {
  // Apply audit middleware globally (lightweight)
  app.use(auditMiddleware);
  
  // Apply rate limiting ONLY to API routes (not static assets)
  app.use("/api", rateLimitMiddleware);
  
  // Seed database on startup
  seedDatabase().catch(console.error);

  // POST /api/v1/chat/completions
  app.post("/api/v1/chat/completions", async (req, res) => {
    const startTime = Date.now();
    const tenantId = req.body.tenant_id || 1;
    
    try {
      const { messages, tools, stream } = req.body;
      
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
      
      const result = await llmClient.chatCompletion({
        messages: fullMessages,
        tenantId,
        temperature: policy.temperature,
        topP: policy.topP,
        tools,
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
      
      // Record metrics
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

      // Extract text content
      $("script, style, nav, footer, header").remove();
      const title = $("title").text() || $("h1").first().text() || url;
      const content = $("body").text().replace(/\s+/g, " ").trim();

      if (!content) {
        return res.status(400).json({ error: "No content found at URL" });
      }

      // Create document
      const doc = await storage.createDocument({
        tenantId: tenant_id || 1,
        title,
        content,
        source: "url",
        status: "indexed",
        metadata: { url },
      });

      // Index for RAG
      await knowledgeIndexer.indexDocument(doc.id, content, tenant_id || 1);

      res.json(doc);
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

      // Fetch and index top 5 results
      for (const result of results.results.slice(0, 5)) {
        try {
          const response = await axios.get(result.url, { timeout: 10000 });
          const cheerio = await import("cheerio");
          const $ = cheerio.load(response.data);

          $("script, style, nav, footer, header").remove();
          const content = $("body").text().replace(/\s+/g, " ").trim();

          if (content.length > 100) {
            // Limit to 50k chars to avoid overwhelming the system while getting more content
            const finalContent = content.length > 50000 ? content.substring(0, 50000) : content;
            
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
                truncated: content.length > 50000,
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
      const conversations = await storage.getConversationsByUser(userId, 50);
      
      res.json(conversations);
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
      
      // Check fallback
      const fallbackResult = await autoFallback.checkAndExecuteFallback(
        result.finalAnswer || "",
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

  // GET /metrics (Prometheus format)
  app.get("/metrics", exportPrometheusMetrics);

  const httpServer = createServer(app);
  return httpServer;
}
