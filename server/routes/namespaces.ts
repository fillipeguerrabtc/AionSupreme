import { Router, Request, Response } from "express";
import { db } from "../db";
import { namespaces, insertNamespaceSchema, type Namespace, type InsertNamespace, curationQueue } from "@shared/schema"; // 🔥 P1.1.2g: Added curationQueue
import { eq, and, desc, or, like, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { curationStore } from "../curation/store";
import { namespaceClassifier } from "../services/namespace-classifier";

/**
 * Namespace Management Routes
 * Full CRUD operations for KB namespaces
 */
export function registerNamespaceRoutes(app: Router) {
  // GET /api/namespaces - List all namespaces
  app.get("/namespaces", async (req: Request, res: Response) => {
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

  /**
   * GET /api/namespaces/search?q=<query>
   * 
   * IMPORTANTE: Esta rota DEVE vir ANTES de /api/namespaces/:id
   * caso contrário "search" será interpretado como um ID!
   * 
   * Busca namespaces similares por nome e descrição (case-insensitive)
   * 
   * PERFORMANCE OTIMIZADA: 
   * - Usa operador ILIKE nativo do PostgreSQL
   * - Índices GIN trigram (pg_trgm) instalados em 'name' e 'description'
   * - Índices são usados automaticamente em tabelas grandes (>1000 registros)
   * - Para tabelas pequenas, PostgreSQL usa seq scan (mais rápido)
   * 
   * Índices criados:
   * - namespaces_name_trgm_idx (GIN)
   * - namespaces_description_trgm_idx (GIN)
   * 
   * Returns: Array<{
   *   id: string,
   *   name: string,
   *   description: string,
   *   icon: string | null
   * }>
   */
  app.get("/namespaces/search", async (req: Request, res: Response) => {
    try {
      const { q } = req.query;

      if (!q || typeof q !== "string") {
        return res.status(400).json({ error: "Query parameter 'q' is required" });
      }

      const results = await db
        .select()
        .from(namespaces)
        .where(
          or(
            ilike(namespaces.name, `%${q}%`),
            ilike(namespaces.description, `%${q}%`)
          )
        )
        .limit(20);

      res.json(results);
    } catch (error) {
      console.error("Error searching namespaces:", error);
      res.status(500).json({ 
        error: "Failed to search namespaces",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // GET /api/namespaces/:id - Get single namespace by ID
  app.get("/namespaces/:id", async (req: Request, res: Response) => {
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
  // PHASE 2: Supports namespace-specific sliders, system prompts, and enforcement config
  app.post("/namespaces", async (req: Request, res: Response) => {
    try {
      // Validate with Phase 2 schema (includes sliderOverrides, triggers, etc)
      const validatedData = insertNamespaceSchema.parse(req.body);

      // Verify agentId exists if provided
      if (validatedData.agentId) {
        const { agents } = await import("@shared/schema");
        const [agent] = await db
          .select()
          .from(agents)
          .where(eq(agents.id, validatedData.agentId));
        
        if (!agent) {
          return res.status(400).json({
            error: "Invalid agentId",
            message: `Agent with ID "${validatedData.agentId}" does not exist`
          });
        }
      }

      const [newNamespace] = await db
        .insert(namespaces)
        .values(validatedData as typeof namespaces.$inferInsert)
        .returning();

      console.log(`[Namespaces] ✅ Created namespace "${newNamespace.name}" with Phase 2 config`);
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
  // PHASE 2: Supports updating namespace-specific sliders, system prompts, and enforcement config
  app.patch("/namespaces/:id", async (req: Request, res: Response) => {
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

      // Validate partial update data with Phase 2 schema
      const updateSchema = insertNamespaceSchema.partial();
      const validatedData = updateSchema.parse(req.body);

      // Verify agentId exists if being updated
      if (validatedData.agentId !== undefined) {
        if (validatedData.agentId === null) {
          // Explicitly setting to null is allowed (removes agent assignment)
        } else {
          const { agents } = await import("@shared/schema");
          const [agent] = await db
            .select()
            .from(agents)
            .where(eq(agents.id, validatedData.agentId));
          
          if (!agent) {
            return res.status(400).json({
              error: "Invalid agentId",
              message: `Agent with ID "${validatedData.agentId}" does not exist`
            });
          }
        }
      }

      const [updatedNamespace] = await db
        .update(namespaces)
        .set({
          ...validatedData,
          updatedAt: new Date(),
        } as any)
        .where(eq(namespaces.id, id))
        .returning();

      console.log(`[Namespaces] ✅ Updated namespace "${updatedNamespace.name}" with Phase 2 config`);
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

  // DELETE /api/namespaces/:id - Delete namespace with orphan prevention
  // BIDIRECTIONAL ORPHAN PREVENTION (Task 11):
  // - By default: BLOCK delete if agents are using this namespace
  // - With ?force=true: CASCADE delete (remove agents/subagents)
  app.delete("/namespaces/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const force = req.query.force === "true";

      // Verify namespace exists
      const [existingNamespace] = await db
        .select()
        .from(namespaces)
        .where(eq(namespaces.id, id));

      if (!existingNamespace) {
        return res.status(404).json({ error: "Namespace not found" });
      }

      // ORPHAN PREVENTION: Check if any agents are using this namespace
      const { agents } = await import("@shared/schema");
      
      // Find all agents using this namespace (including children)
      const allAgents = await db.select().from(agents);
      const affectedAgents = allAgents.filter((agent) => {
        if (!agent.assignedNamespaces) return false;
        // Match exact namespace or children (e.g., "financas" matches "financas/investimentos")
        return agent.assignedNamespaces.some(
          (ns) => ns === existingNamespace.name || ns.startsWith(`${existingNamespace.name}/`)
        );
      });

      // If agents exist and force=false, BLOCK delete
      if (affectedAgents.length > 0 && !force) {
        return res.status(409).json({
          error: `Não é possível deletar namespace "${existingNamespace.name}" porque ${affectedAgents.length} agent(s) estão usando este namespace ou seus sub-namespaces.`,
          affectedAgents: affectedAgents.map((a) => ({
            id: a.id,
            name: a.name,
            slug: a.slug,
            assignedNamespaces: a.assignedNamespaces,
          })),
          hint: "Use ?force=true para deletar o namespace e seus agents automaticamente (cascade delete).",
        });
      }

      // Import cascade delete service
      const { cascadeDeleteNamespace } = await import("../services/namespace-cascade");

      // Execute cascade delete (namespace + children + agents)
      const result = await cascadeDeleteNamespace(existingNamespace.name);

      console.log(`[Namespaces] Cascade deleted namespace: ${existingNamespace.name}`, result);

      res.json({
        success: true,
        message: force
          ? `Namespace e ${result.deletedAgents.length} agent(s) deletados com sucesso`
          : `Namespace deleted successfully`,
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
  app.post("/namespaces/:id/ingest", async (req: Request, res: Response) => {
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

      // 🔥 P1.1.2g: Add content to curation queue with duplicate handling via centralized helper
      const { DuplicateContentError } = await import("../errors/DuplicateContentError");
      let curationItem: any;
      try {
        curationItem = await curationStore.addToCuration({
          title: title || `Conteúdo do namespace ${namespace.name}`,
          content,
          suggestedNamespaces: [namespace.name],
          tags: ["namespace_ingestion", "general"],
          submittedBy: `Namespace Management (${namespace.name})`,
        });
      } catch (error: any) {
        // Use centralized helper instead of duplicating persistence logic
        if (error instanceof DuplicateContentError) {
          curationItem = await curationStore.persistRejection({
            title: title || `Conteúdo do namespace ${namespace.name}`,
            content,
            suggestedNamespaces: [namespace.name],
            tags: ["namespace_ingestion", "general"],
            submittedBy: `Namespace Management (${namespace.name})`,
          }, error);
        } else {
          throw error;
        }
      }

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
  app.post("/namespaces/classify", async (req: Request, res: Response) => {
    try {
      const { content, title } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).json({ error: "Content is required and must be a string" });
      }

      // Classificar via LLM
      // FIX: Ordem correta dos parâmetros: (title, content, tenantId)
      const result = await namespaceClassifier.classifyContent(title ?? "", content, 1); // tenantId 1

      console.log(`[Namespaces] Classified content → suggested: "${result.suggestedNamespace}" (${result.confidence}% confidence)`);

      // Transform backend format to frontend format
      // Backend uses existingSimilar, frontend expects existingMatches
      // CRITICAL: Always return empty array [] instead of undefined/null to prevent frontend crashes
      const existingSimilar = Array.isArray(result.existingSimilar) ? result.existingSimilar : [];
      
      const response = {
        suggestedNamespace: result.suggestedNamespace,
        confidence: result.confidence,
        reasoning: result.reasoning,
        existingMatches: existingSimilar.map(similar => ({
          id: similar.namespace,
          name: similar.namespace,
          similarity: similar.similarity,
          description: similar.reason
        }))
      };

      res.json(response);
    } catch (error) {
      console.error("Error classifying content:", error);
      res.status(500).json({ 
        error: "Failed to classify content",
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
  // Validation schema for namespace + agent creation
  const createWithAgentSchema = z.object({
    namespaceName: z.string().min(3).max(100).regex(/^[a-z0-9]+(\.[a-z0-9]+)*$/, {
      message: "Invalid namespace format. Use lowercase letters, numbers, and dots only (e.g., 'educacao.matematica')"
    }),
    description: z.string().min(10).max(500),
    agentName: z.string().min(3).max(100),
    agentDescription: z.string().min(10).max(500),
    icon: z.string().optional()
  });

  app.post("/namespaces/create-with-agent", async (req: Request, res: Response) => {
    try {
      // Validate request body with Zod
      const validatedData = createWithAgentSchema.parse(req.body);
      const { namespaceName, description, agentName, agentDescription, icon } = validatedData;

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
        })
        .returning();

      // Importar serviço de agentes
      const { agentsStorage } = await import("../storage.agents");
      const { agents: agentsTable } = await import("@shared/schema");

      // Generate unique slug for agent
      let baseSlug = namespaceName.replace(/\./g, '-');
      let slug = baseSlug;
      let suffix = 1;

      // Check slug uniqueness and append suffix if needed
      while (true) {
        const existingAgent = await db
          .select()
          .from(agentsTable)
          .where(eq(agentsTable.slug, slug))
          .limit(1);

        if (existingAgent.length === 0) {
          break; // Slug is unique
        }

        // Slug collision detected, append suffix
        slug = `${baseSlug}-${suffix}`;
        suffix++;
      }

      // Criar agente especialista automaticamente
      const newAgent = await agentsStorage.createAgent({
        name: agentName,
        slug,
        type: 'specialist',
        systemPrompt: `Você é um especialista em ${namespaceName}. ${agentDescription}`,
        namespaces: [namespaceName],
        tools: ["web_search", "calculator", "code_interpreter"],
        policyId: null,
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
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "Validation error",
          details: error.errors
        });
      }

      res.status(500).json({ 
        error: "Failed to create namespace and agent",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * POST /api/namespaces/garbage-collect
   * 
   * Manual trigger for garbage collection of orphaned namespaces and agents
   * 
   * Query params:
   * - dryRun: boolean (default: false) - If true, only reports what would be deleted
   * 
   * Returns: {
   *   namespacesDeleted: number,
   *   agentsDeleted: number,
   *   orphanedNamespaces: string[],
   *   orphanedAgents: string[],
   *   errors: string[]
   * }
   */
  app.post("/namespaces/garbage-collect", async (req: Request, res: Response) => {
    try {
      const { namespaceGarbageCollector } = await import("../services/namespace-garbage-collector");
      const dryRun = req.query.dryRun === "true";

      console.log(`[Namespaces] 🗑️ Manual garbage collection triggered${dryRun ? ' (DRY RUN)' : ''}...`);

      const result = await namespaceGarbageCollector.collectGarbage(dryRun);

      res.json({
        success: true,
        dryRun,
        result,
      });
    } catch (error) {
      console.error("Error running garbage collection:", error);
      res.status(500).json({
        error: "Failed to run garbage collection",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
