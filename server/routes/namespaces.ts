import { Express, Request, Response } from "express";
import { db } from "../db";
import { namespaces, insertNamespaceSchema, type Namespace, type InsertNamespace } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

const TENANT_ID = 1;

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
        .where(eq(namespaces.tenantId, TENANT_ID))
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
        .where(
          and(
            eq(namespaces.id, id),
            eq(namespaces.tenantId, TENANT_ID)
          )
        );

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
      const validatedData = insertNamespaceSchema.extend({
        tenantId: z.number().optional(),
      }).parse({
        ...req.body,
        tenantId: TENANT_ID,
      });

      const insertData = validatedData as unknown as InsertNamespace & { tenantId: number };

      const [newNamespace] = await db
        .insert(namespaces)
        .values(insertData)
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

      // Verify namespace exists and belongs to tenant
      const [existingNamespace] = await db
        .select()
        .from(namespaces)
        .where(
          and(
            eq(namespaces.id, id),
            eq(namespaces.tenantId, TENANT_ID)
          )
        );

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

  // DELETE /api/namespaces/:id - Delete namespace
  app.delete("/api/namespaces/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify namespace exists and belongs to tenant
      const [existingNamespace] = await db
        .select()
        .from(namespaces)
        .where(
          and(
            eq(namespaces.id, id),
            eq(namespaces.tenantId, TENANT_ID)
          )
        );

      if (!existingNamespace) {
        return res.status(404).json({ error: "Namespace not found" });
      }

      await db
        .delete(namespaces)
        .where(eq(namespaces.id, id));

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting namespace:", error);
      res.status(500).json({ 
        error: "Failed to delete namespace",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
