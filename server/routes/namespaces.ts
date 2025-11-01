import { Express, Request, Response } from "express";
import { db } from "../db";
import { namespaces, insertNamespaceSchema, type Namespace, type InsertNamespace } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { curationStore } from "../curation/store";

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
}
