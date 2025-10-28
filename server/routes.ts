import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { llmClient } from "./model/llm-client";
import { ragService } from "./rag/vector-store";
import { reactEngine } from "./agent/react-engine";
import { agentTools } from "./agent/tools";
import { enforcementPipeline } from "./policy/enforcement-pipeline";
import { fileProcessor } from "./multimodal/file-processor";
import { knowledgeIndexer } from "./rag/knowledge-indexer";
import { seedDatabase } from "./seed";
import multer from "multer";

const upload = multer({ dest: "/tmp/uploads/" });

export function registerRoutes(app: Express): Server {
  // Seed database on startup
  seedDatabase().catch(console.error);

  // POST /api/v1/chat/completions
  app.post("/api/v1/chat/completions", async (req, res) => {
    try {
      const { messages, tenant_id, tools, stream } = req.body;
      
      const policy = await storage.getPolicyByTenant(tenant_id || 1);
      if (!policy) throw new Error("No policy found");
      
      const systemPrompt = await enforcementPipeline.composeSystemPrompt(policy);
      const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];
      
      const result = await llmClient.chatCompletion({
        messages: fullMessages,
        tenantId: tenant_id || 1,
        temperature: policy.temperature,
        topP: policy.topP,
        tools,
      });
      
      const moderated = await enforcementPipeline.moderateOutput(result.content, policy, tenant_id || 1);
      
      res.json({
        choices: [{ message: { role: "assistant", content: moderated }, finish_reason: result.finishReason }],
        usage: result.usage,
      });
    } catch (error: any) {
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

  const httpServer = createServer(app);
  return httpServer;
}
