import { Express, Request, Response } from "express";
import { db } from "../db";
import { namespaces, insertNamespaceSchema, type Namespace, type InsertNamespace } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { curationStore } from "../curation/store";
import { namespaceClassifier } from "../services/namespace-classifier";

/**
 * Namespace Management Routes
 * Full CRUD operations for KB namespaces
 */
export function registerNamespaceRoutes(app: Express) {
  // GET /api/namespaces - List all namespaces
  app.get("/api/namespaces", async (req: Request, res: Response) => {
    try {
      const allNamespaces = await db
        .select()
        .from(namespaces)
        .orderBy(desc(namespaces.createdAt));

      res.json(allNamespaces);
    } catch (error) {
      console.error("Error fetching namespaces:", error);
      res.status(500).json({ 
        error: "Failed to fetch namespaces",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // GET /api/namespaces/:id - Get single namespace by ID
  app.get("/api/namespaces/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [namespace] = await db
        .select()
        .from(namespaces)
        .where(eq(namespaces.id, id));

      if (!namespace) {
        return res.status(404).json({ error: "Namespace not found" });
      }

      res.json(namespace);
    } catch (error) {
      console.error("Error fetching namespace:", error);
      res.status(500).json({ 
        error: "Failed to fetch namespace",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // POST /api/namespaces - Create new namespace
  app.post("/api/namespaces", async (req: Request, res: Response) => {
    try {
      const validatedData = insertNamespaceSchema.parse(req.body);

      const [newNamespace] = await db
        .insert(namespaces)
        .values(validatedData as any)
        .returning();

      res.status(201).json(newNamespace);
    } catch (error) {
      console.error("Error creating namespace:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation error",
          details: error.errors
        });
      }

      res.status(500).json({ 
        error: "Failed to create namespace",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // PATCH /api/namespaces/:id - Update namespace
  app.patch("/api/namespaces/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify namespace exists
      const [existingNamespace] = await db
        .select()
        .from(namespaces)
        .where(eq(namespaces.id, id));

      if (!existingNamespace) {
        return res.status(404).json({ error: "Namespace not found" });
      }

      // Validate partial update data
      const updateSchema = insertNamespaceSchema.partial();
      const validatedData = updateSchema.parse(req.body);

      const updateData: any = {
        ...validatedData,
        updatedAt: new Date(),
      };

      const [updatedNamespace] = await db
        .update(namespaces)
        .set(updateData)
        .where(eq(namespaces.id, id))
        .returning();

      res.json(updatedNamespace);
    } catch (error) {
      console.error("Error updating namespace:", error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation error",
          details: error.errors
        });
      }

      res.status(500).json({ 
        error: "Failed to update namespace",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // DELETE /api/namespaces/:id - Cascade delete namespace
  app.delete("/api/namespaces/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify namespace exists
      const [existingNamespace] = await db
        .select()
        .from(namespaces)
        .where(eq(namespaces.id, id));

      if (!existingNamespace) {
        return res.status(404).json({ error: "Namespace not found" });
      }

      // Import cascade delete service
      const { cascadeDeleteNamespace } = await import("../services/namespace-cascade");

      // Execute cascade delete (namespace + children + agents)
      const result = await cascadeDeleteNamespace(existingNamespace.name);

      console.log(`[Namespaces] Cascade deleted namespace: ${existingNamespace.name}`, result);

      res.json({
        success: true,
        message: `Namespace deleted successfully`,
        ...result,
      });
    } catch (error) {
      console.error("Error deleting namespace:", error);
      res.status(500).json({ 
        error: "Failed to delete namespace",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // POST /api/namespaces/:id/ingest - Ingest content into namespace curation queue
  app.post("/api/namespaces/:id/ingest", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { content, title } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required and must be a string" });
      }

      // Verify namespace exists
      const [namespace] = await db
        .select()
        .from(namespaces)
        .where(eq(namespaces.id, id));

      if (!namespace) {
        return res.status(404).json({ error: "Namespace not found" });
      }

      // Add content to curation queue for human approval (HITL workflow)
      const curationItem = await curationStore.addToCuration({
        title: title || `Conteúdo do namespace ${namespace.displayName || namespace.name}`,
        content,
        suggestedNamespaces: [namespace.name],
        tags: ["namespace_ingestion", namespace.category || "general"],
        submittedBy: `Namespace Management (${namespace.name})`,
      });

      console.log(`[Namespaces] Added content to curation queue for namespace: ${namespace.name} (curation ID: ${curationItem.id})`);

      res.json({ 
        success: true, 
        message: `Conteúdo adicionado à fila de curadoria para aprovação`,
        curationId: curationItem.id,
        namespace: namespace.name,
      });
    } catch (error) {
      console.error("Error adding content to curation queue:", error);
      res.status(500).json({ 
        error: "Failed to add content to curation queue",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // ================================================================
  // NAMESPACE CLASSIFICATION & INTELLIGENCE
  // ================================================================

  /**
   * POST /api/namespaces/classify
   * 
   * Classifica conteúdo via LLM e propõe namespace ideal
   * 
   * Body: {
   *   content: string,  // Texto para classificar
   *   title?: string    // Título opcional
   * }
   * 
   * Returns: {
   *   suggestedNamespace: string,       // Ex: "educacao.matematica"
   *   confidence: number,               // 0-100
   *   reasoning: string,                // Explicação LLM
   *   existingMatches: Array<{          // Namespaces similares
   *     id: string,
   *     name: string,
   *     similarity: number,
   *     description: string
   *   }>
   * }
   */
  app.post("/api/namespaces/classify", async (req: Request, res: Response) => {
    try {
      const { content, title } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required and must be a string" });
      }

      // Classificar via LLM
      const result = await namespaceClassifier.classifyContent(content, title, 1); // tenantId 1

      console.log(`[Namespaces] Classified content → suggested: "${result.suggestedNamespace}" (${result.confidence}% confidence)`);

      res.json(result);
    } catch (error) {
      console.error("Error classifying content:", error);
      res.status(500).json({ 
        error: "Failed to classify content",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * GET /api/namespaces/search?q=<query>
   * 
   * Busca namespaces similares usando múltiplas métricas:
   * - Levenshtein distance (nome)
   * - Palavra em comum
   * - Similaridade semântica (descrição)
   * 
   * Returns: Array<{
   *   id: string,
   *   name: string,
   *   description: string,
   *   similarity: number,  // 0-100
   *   icon: string | null
   * }>
   */
  app.get("/api/namespaces/search", async (req: Request, res: Response) => {
    try {
      const { q } = req.query;

      if (!q || typeof q !== "string") {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      // Buscar similares (threshold 40%)
      const similarNamespaces = await namespaceClassifier.findSimilarNamespaces(q, 1, 40);

      console.log(`[Namespaces] Search for "${q}" → found ${similarNamespaces.length} matches`);

      res.json(similarNamespaces);
    } catch (error) {
      console.error("Error searching namespaces:", error);
      res.status(500).json({ 
        error: "Failed to search namespaces",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/namespaces/create-with-agent
   * 
   * Cria namespace + agente especialista automaticamente
   * 
   * Body: {
   *   namespaceName: string,     // Ex: "educacao.matematica"
   *   description: string,
   *   agentName: string,         // Ex: "Professor de Matemática"
   *   agentDescription: string,
   *   icon?: string              // Lucide icon name
   * }
   * 
   * Returns: {
   *   namespace: Namespace,
   *   agent: Agent
   * }
   */
  app.post("/api/namespaces/create-with-agent", async (req: Request, res: Response) => {
    try {
      const { namespaceName, description, agentName, agentDescription, icon } = req.body;

      if (!namespaceName || !description || !agentName || !agentDescription) {
        return res.status(400).json({ 
          error: "Missing required fields: namespaceName, description, agentName, agentDescription" 
        });
      }

      // Validar formato de namespace (flat, ex: "educacao.matematica")
      if (!/^[a-z0-9]+(\.[a-z0-9]+)*$/.test(namespaceName)) {
        return res.status(400).json({ 
          error: "Invalid namespace format. Use lowercase letters, numbers, and dots only (e.g., 'educacao.matematica')" 
        });
      }

      // Verificar se namespace já existe
      const [existing] = await db
        .select()
        .from(namespaces)
        .where(eq(namespaces.name, namespaceName));

      if (existing) {
        return res.status(409).json({ 
          error: `Namespace "${namespaceName}" already exists` 
        });
      }

      // Criar namespace
      const [newNamespace] = await db
        .insert(namespaces)
        .values({
          name: namespaceName,
          description,
          icon: icon || null,
          tenantId: 1,
        } as InsertNamespace)
        .returning();

      // Importar serviço de agentes dinamicamente
      const { storage } = await import("../storage");

      // Criar agente especialista automaticamente
      const newAgent = await storage.createAgent({
        name: agentName,
        description: agentDescription,
        namespace: namespaceName,
        config: {
          tools: ["web_search", "calculator", "code_interpreter"],
          budgetLimit: 1000,
          escalationThreshold: 0.7,
        },
        tenantId: 1,
      });

      console.log(`[Namespaces] ✅ Created namespace "${namespaceName}" + agent "${agentName}" (ID: ${newAgent.id})`);

      res.status(201).json({
        success: true,
        namespace: newNamespace,
        agent: newAgent,
      });
    } catch (error) {
      console.error("Error creating namespace with agent:", error);
      res.status(500).json({ 
        error: "Failed to create namespace and agent",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
