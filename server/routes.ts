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

const upload = multer({ dest: "/tmp/uploads/" });

export function registerRoutes(app: Express): Server {
  // Apply audit middleware globally (lightweight)
  app.use(auditMiddleware);
  
  // Apply rate limiting ONLY to API routes (not static assets)
  app.use("/api", rateLimitMiddleware);
  
  // Seed database on startup
  seedDatabase().catch(console.error);

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
    
    // DeepWeb keywords
    const deepwebKeywords = [
      'consulte na deepweb', 'pesquise na deepweb', 'busque na deepweb',
      'consulte na deep web', 'pesquise na deep web',
      'consulte no tor', 'pesquise no tor', 'search deepweb', 'search deep web'
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

  // GET /api/gpu/status - Get GPU provider status
  app.get("/api/gpu/status", async (req, res) => {
    try {
      const { getProviderStatus } = await import("./gpu/orchestrator");
      const status = getProviderStatus();
      res.json(status);
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
      const { collectTrainingData } = await import("./training/data-collector");
      
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
      const days = parseInt(req.query.days as string) || 30;
      
      const trends = await tokenTracker.getTokenTrends(tenantId, provider, days);
      res.json(trends);
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
