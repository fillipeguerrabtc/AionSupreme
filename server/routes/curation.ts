// server/routes/curation.ts
// Rotas para sistema de curadoria com HITL

import type { Express } from "express";
import { curationStore } from "../curation/store";
import { publishEvent } from "../events";
import { ImageProcessor } from "../learn/image-processor";
import { db } from "../db";

export function registerCurationRoutes(app: Express) {
  /**
   * GET /api/curation/pending
   * Lista itens pendentes de curadoria
   */
  app.get("/api/curation/pending", async (req, res) => {
    try {
      const items = await curationStore.listPending();
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
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const items = await curationStore.listAll({ status, limit });
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
      const { title, content, suggestedNamespaces, tags, submittedBy } = req.body;

      if (!title || !content || !suggestedNamespaces) {
        return res.status(400).json({ 
          error: "Missing required fields: title, content, suggestedNamespaces" 
        });
      }

      const item = await curationStore.addToCuration({
        title,
        content,
        suggestedNamespaces,
        tags,
        submittedBy,
      });

      // Emitir evento para indexador (opcional)
      await publishEvent("DOC_INGESTED", {
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
   * Edita item pendente (título, conteúdo, tags, namespaces, nota)
   */
  app.patch("/api/curation/edit", async (req, res) => {
    try {
      const { id, title, content, tags, suggestedNamespaces, note } = req.body;

      if (!id) {
        return res.status(400).json({ error: "Missing required field: id" });
      }

      const item = await curationStore.editItem(id, {
        title,
        content,
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
      const { id, reviewedBy } = req.body;

      if (!id || !reviewedBy) {
        return res.status(400).json({ error: "Missing required fields: id, reviewedBy" });
      }

      const { item, publishedId } = await curationStore.approveAndPublish(
        id,
        reviewedBy
      );

      // Emitir eventos para indexador
      await publishEvent("DOC_UPDATED", {
        docId: publishedId,
        namespaces: item.suggestedNamespaces,
      });

      await publishEvent("AGENT_NAMESPACES_CHANGED", {
        namespaces: item.suggestedNamespaces,
      });

      res.json({ item, publishedId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/reject
   * Rejeita item E limpa imagens órfãs
   */
  app.post("/api/curation/reject", async (req, res) => {
    try {
      const { id, reviewedBy, note } = req.body;

      if (!id || !reviewedBy) {
        return res.status(400).json({ error: "Missing required fields: id, reviewedBy" });
      }

      const item = await curationStore.reject(id, reviewedBy, note);

      if (!item) {
        return res.status(404).json({ error: "Item not found or already processed" });
      }

      // Emitir evento de deleção
      await publishEvent("DOC_DELETED", {
        docId: item.id,
      });

      // LIMPEZA: Remove APENAS imagens REJEITADAS (mantém imagens aprovadas)
      try {
        const imageProcessor = new ImageProcessor();
        
        // Busca TODAS as imagens em documentos APROVADOS (status='indexed')
        const approvedDocs = await db.query.documents.findMany({
          where: (doc, { eq }) => eq(doc.status, 'indexed')
        });
        
        const usedImages = approvedDocs
          .map(doc => (doc.metadata as any)?.images || [])
          .flat()
          .filter(Boolean);
        
        await imageProcessor.cleanup(usedImages);
        console.log(`[Curation] ✅ Limpeza: mantém ${usedImages.length} imagens aprovadas, remove órfãs`);
      } catch (cleanupError: any) {
        console.warn(`[Curation] ⚠️ Aviso ao limpar imagens:`, cleanupError.message);
      }

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
            id,
            reviewedBy
          );

          await publishEvent("DOC_UPDATED", {
            docId: publishedId,
            namespaces: item.suggestedNamespaces,
          });

          await publishEvent("AGENT_NAMESPACES_CHANGED", {
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
      const { reviewedBy } = req.body;

      if (!reviewedBy) {
        return res.status(400).json({ error: "Missing required field: reviewedBy" });
      }

      const pending = await curationStore.listPending();
      const results = {
        approved: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const item of pending) {
        try {
          const { item: approvedItem, publishedId } = await curationStore.approveAndPublish(
            item.id,
            reviewedBy
          );

          await publishEvent("DOC_UPDATED", {
            docId: publishedId,
            namespaces: approvedItem.suggestedNamespaces,
          });

          await publishEvent("AGENT_NAMESPACES_CHANGED", {
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
          const item = await curationStore.reject(id, reviewedBy, note);
          
          if (item) {
            await publishEvent("DOC_DELETED", {
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

      // LIMPEZA: Remove APENAS imagens REJEITADAS (mantém aprovadas)
      try {
        const imageProcessor = new ImageProcessor();
        
        const approvedDocs = await db.query.documents.findMany({
          where: (doc, { eq }) => eq(doc.status, 'indexed')
        });
        
        const usedImages = approvedDocs
          .map(doc => (doc.metadata as any)?.images || [])
          .flat()
          .filter(Boolean);
        
        await imageProcessor.cleanup(usedImages);
        console.log(`[Curation] ✅ Limpeza: mantém ${usedImages.length} imagens aprovadas, remove ${results.rejected} rejeitadas`);
      } catch (cleanupError: any) {
        console.warn(`[Curation] ⚠️ Aviso ao limpar imagens:`, cleanupError.message);
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
      const { reviewedBy, note } = req.body;

      if (!reviewedBy) {
        return res.status(400).json({ error: "Missing required field: reviewedBy" });
      }

      const pending = await curationStore.listPending();
      const results = {
        rejected: 0,
        failed: 0,
        errors: [] as string[],
      };

      for (const item of pending) {
        try {
          const rejectedItem = await curationStore.reject(item.id, reviewedBy, note);
          
          if (rejectedItem) {
            await publishEvent("DOC_DELETED", {
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

      // LIMPEZA: Remove APENAS imagens REJEITADAS (mantém aprovadas)
      try {
        const imageProcessor = new ImageProcessor();
        
        const approvedDocs = await db.query.documents.findMany({
          where: (doc, { eq }) => eq(doc.status, 'indexed')
        });
        
        const usedImages = approvedDocs
          .map(doc => (doc.metadata as any)?.images || [])
          .flat()
          .filter(Boolean);
        
        await imageProcessor.cleanup(usedImages);
        console.log(`[Curation] ✅ Limpeza: mantém ${usedImages.length} imagens aprovadas, remove todas rejeitadas (${results.rejected} itens)`);
      } catch (cleanupError: any) {
        console.warn(`[Curation] ⚠️ Aviso ao limpar imagens:`, cleanupError.message);
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
      const status = req.query.status as "approved" | "rejected" | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      const items = await curationStore.listHistory({ status, limit });
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/:id/generate-descriptions
   * Gera descrições AI para imagens em attachments usando Vision Cascade
   */
  app.post("/api/curation/:id/generate-descriptions", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Busca item de curadoria
      const item = await curationStore.getById(id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // Valida se tem attachments
      if (!item.attachments || item.attachments.length === 0) {
        return res.status(400).json({ error: "Item has no attachments" });
      }

      const imageProcessor = new ImageProcessor();
      const results: Array<{
        filename: string;
        description: string;
        provider?: string;
        error?: string;
      }> = [];

      // Processa cada attachment do tipo "image" que não tem description
      for (const attachment of item.attachments) {
        if (attachment.type !== "image") {
          continue;
        }

        // Se já tem description, pula
        if (attachment.description && attachment.description !== "Sem descrição") {
          results.push({
            filename: attachment.filename,
            description: attachment.description,
          });
          continue;
        }

        try {
          // Processa imagem com Vision Cascade
          const processed = await imageProcessor.processImage(
            attachment.url,
            attachment.filename
          );

          if (processed && processed.description) {
            // Atualiza attachment com description gerada
            attachment.description = processed.description;
            results.push({
              filename: attachment.filename,
              description: processed.description,
            });
          } else {
            results.push({
              filename: attachment.filename,
              description: "Erro ao gerar descrição",
              error: "Vision API failed",
            });
          }
        } catch (error: any) {
          console.error(`[Curation] Erro ao processar ${attachment.filename}:`, error.message);
          results.push({
            filename: attachment.filename,
            description: "Erro ao gerar descrição",
            error: error.message,
          });
        }
      }

      // Salva item atualizado com descriptions
      const updatedItem = await curationStore.editItem(id, { attachments: item.attachments });

      res.json({
        id: item.id,
        totalAttachments: item.attachments.length,
        processedImages: results.length,
        results,
        item: updatedItem, // Return full updated item for frontend
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/cleanup
   * Executa cleanup manual de itens rejeitados expirados (30 dias)
   * GDPR compliance: auto-deletion of rejected content
   */
  app.post("/api/curation/cleanup", async (req, res) => {
    try {
      const result = await curationStore.cleanupExpiredRejectedItems();

      if (!result) {
        return res.json({ 
          success: true, 
          message: "No expired rejected items to delete",
          deletedCount: 0 
        });
      }

      res.json({
        success: true,
        message: `${result.curationItemsDeleted} expired rejected items deleted permanently`,
        deletedCount: result.curationItemsDeleted,
      });
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
      const success = await curationStore.remove(req.params.id);

      if (!success) {
        return res.status(404).json({ error: "Item not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
