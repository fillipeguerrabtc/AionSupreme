// server/routes/curation.ts
// Rotas para sistema de curadoria com HITL

import type { Express } from "express";
import { curationStore } from "../curation/store";
import { publishEvent } from "../events";

export function registerCurationRoutes(app: Express) {
  /**
   * GET /api/curation/pending
   * Lista itens pendentes de curadoria
   */
  app.get("/api/curation/pending", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const items = await curationStore.listPending(tenantId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/curation/all
   * Lista todos os itens com filtros opcionais
   */
  app.get("/api/curation/all", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const items = await curationStore.listAll(tenantId, { status, limit });
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/add
   * Adiciona item à fila de curadoria
   */
  app.post("/api/curation/add", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const { title, content, suggestedNamespaces, tags, submittedBy } = req.body;

      if (!title || !content || !suggestedNamespaces) {
        return res.status(400).json({ 
          error: "Missing required fields: title, content, suggestedNamespaces" 
        });
      }

      const item = await curationStore.addToCuration(tenantId, {
        title,
        content,
        suggestedNamespaces,
        tags,
        submittedBy,
      });

      // Emitir evento para indexador (opcional)
      await publishEvent("DOC_INGESTED", {
        tenantId,
        docId: item.id,
        namespaces: ["curation/pending"],
      });

      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PATCH /api/curation/edit
   * Edita item pendente (título, tags, namespaces, nota)
   */
  app.patch("/api/curation/edit", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const { id, title, tags, suggestedNamespaces, note } = req.body;

      if (!id) {
        return res.status(400).json({ error: "Missing required field: id" });
      }

      const item = await curationStore.editItem(tenantId, id, {
        title,
        tags,
        suggestedNamespaces,
        note,
      });

      if (!item) {
        return res.status(404).json({ error: "Item not found or already processed" });
      }

      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/approve
   * Aprova e publica item
   */
  app.post("/api/curation/approve", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const { id, reviewedBy } = req.body;

      if (!id || !reviewedBy) {
        return res.status(400).json({ error: "Missing required fields: id, reviewedBy" });
      }

      const { item, publishedId } = await curationStore.approveAndPublish(
        tenantId,
        id,
        reviewedBy
      );

      // Emitir eventos para indexador
      await publishEvent("DOC_UPDATED", {
        tenantId,
        docId: publishedId,
        namespaces: item.suggestedNamespaces,
      });

      await publishEvent("AGENT_NAMESPACES_CHANGED", {
        tenantId,
        namespaces: item.suggestedNamespaces,
      });

      res.json({ item, publishedId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/reject
   * Rejeita item
   */
  app.post("/api/curation/reject", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const { id, reviewedBy, note } = req.body;

      if (!id || !reviewedBy) {
        return res.status(400).json({ error: "Missing required fields: id, reviewedBy" });
      }

      const item = await curationStore.reject(tenantId, id, reviewedBy, note);

      if (!item) {
        return res.status(404).json({ error: "Item not found or already processed" });
      }

      // Emitir evento de deleção
      await publishEvent("DOC_DELETED", {
        tenantId,
        docId: item.id,
      });

      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/bulk-approve
   * Aprova múltiplos itens de uma vez
   */
  app.post("/api/curation/bulk-approve", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const { ids, reviewedBy } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Missing or invalid field: ids (must be non-empty array)" });
      }

      if (!reviewedBy) {
        return res.status(400).json({ error: "Missing required field: reviewedBy" });
      }

      const results = {
        approved: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const id of ids) {
        try {
          const { item, publishedId } = await curationStore.approveAndPublish(
            tenantId,
            id,
            reviewedBy
          );

          await publishEvent("DOC_UPDATED", {
            tenantId,
            docId: publishedId,
            namespaces: item.suggestedNamespaces,
          });

          await publishEvent("AGENT_NAMESPACES_CHANGED", {
            tenantId,
            namespaces: item.suggestedNamespaces,
          });

          results.approved++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(`ID ${id}: ${error.message}`);
        }
      }

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/approve-all
   * Aprova TODOS os itens pendentes
   */
  app.post("/api/curation/approve-all", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const { reviewedBy } = req.body;

      if (!reviewedBy) {
        return res.status(400).json({ error: "Missing required field: reviewedBy" });
      }

      const pending = await curationStore.listPending(tenantId);
      const results = {
        approved: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const item of pending) {
        try {
          const { item: approvedItem, publishedId } = await curationStore.approveAndPublish(
            tenantId,
            item.id,
            reviewedBy
          );

          await publishEvent("DOC_UPDATED", {
            tenantId,
            docId: publishedId,
            namespaces: approvedItem.suggestedNamespaces,
          });

          await publishEvent("AGENT_NAMESPACES_CHANGED", {
            tenantId,
            namespaces: approvedItem.suggestedNamespaces,
          });

          results.approved++;
        } catch (error: any) {
          results.failed++;
          results.errors.push(`ID ${item.id}: ${error.message}`);
        }
      }

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/bulk-reject
   * Rejeita múltiplos itens de uma vez
   */
  app.post("/api/curation/bulk-reject", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const { ids, reviewedBy, note } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Missing or invalid field: ids (must be non-empty array)" });
      }

      if (!reviewedBy) {
        return res.status(400).json({ error: "Missing required field: reviewedBy" });
      }

      const results = {
        rejected: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const id of ids) {
        try {
          const item = await curationStore.reject(tenantId, id, reviewedBy, note);
          
          if (item) {
            await publishEvent("DOC_DELETED", {
              tenantId,
              docId: item.id,
            });
            results.rejected++;
          } else {
            results.failed++;
            results.errors.push(`ID ${id}: Item not found`);
          }
        } catch (error: any) {
          results.failed++;
          results.errors.push(`ID ${id}: ${error.message}`);
        }
      }

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/reject-all
   * Rejeita TODOS os itens pendentes
   */
  app.post("/api/curation/reject-all", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const { reviewedBy, note } = req.body;

      if (!reviewedBy) {
        return res.status(400).json({ error: "Missing required field: reviewedBy" });
      }

      const pending = await curationStore.listPending(tenantId);
      const results = {
        rejected: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const item of pending) {
        try {
          const rejectedItem = await curationStore.reject(tenantId, item.id, reviewedBy, note);
          
          if (rejectedItem) {
            await publishEvent("DOC_DELETED", {
              tenantId,
              docId: rejectedItem.id,
            });
            results.rejected++;
          } else {
            results.failed++;
            results.errors.push(`ID ${item.id}: Item not found`);
          }
        } catch (error: any) {
          results.failed++;
          results.errors.push(`ID ${item.id}: ${error.message}`);
        }
      }

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/curation/history
   * Lista histórico completo (aprovados + rejeitados) com retenção de 5 anos
   */
  app.get("/api/curation/history", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const status = req.query.status as "approved" | "rejected" | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const items = await curationStore.listHistory(tenantId, { status, limit });
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/curation/:id
   * Remove item da fila (apenas para testes)
   */
  app.delete("/api/curation/:id", async (req, res) => {
    try {
      const tenantId = parseInt(req.headers["x-tenant-id"] as string || "1", 10);
      const success = await curationStore.remove(tenantId, req.params.id);

      if (!success) {
        return res.status(404).json({ error: "Item not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
