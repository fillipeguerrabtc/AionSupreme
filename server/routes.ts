import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { llmClient } from "./model/llm-client";
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
import multer from "multer";
import fs from "fs/promises";
import path from "path";

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

  // GET /metrics (Prometheus format)
  app.get("/metrics", exportPrometheusMetrics);

  const httpServer = createServer(app);
  return httpServer;
}
