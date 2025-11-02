// server/routes/curation.ts
// Rotas para sistema de curadoria com HITL

import type { Express } from "express";
import { curationStore } from "../curation/store";
import { publishEvent } from "../events";
import { ImageProcessor } from "../learn/image-processor";
import { db } from "../db";
import { deduplicationService } from "../services/deduplication-service";
import { generateContentHash, normalizeContent } from "../utils/deduplication";
import { curationQueue, documents } from "../../shared/schema";
import { eq } from "drizzle-orm";

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
   * TIER 1 DEDUPLICATION: Hash-based realtime duplicate check (<1ms)
   */
  app.post("/api/curation/add", async (req, res) => {
    try {
      const { title, content, suggestedNamespaces, tags, submittedBy } = req.body;

      if (!title || !content || !suggestedNamespaces) {
        return res.status(400).json({ 
          error: "Missing required fields: title, content, suggestedNamespaces" 
        });
      }

      // 🔥 TIER 1: Realtime hash-based duplicate detection
      const duplicateCheck = await deduplicationService.checkCurationRealtimeDuplicate(content);
      
      if (duplicateCheck) {
        const location = duplicateCheck.isPending ? 'curation queue' : 'Knowledge Base';
        console.log(`[Curation] ❌ Exact duplicate detected in ${location}: "${duplicateCheck.documentTitle}"`);
        return res.status(409).json({ 
          error: "Duplicate content detected",
          isDuplicate: true,
          isPending: duplicateCheck.isPending,
          duplicateOf: {
            id: duplicateCheck.documentId,
            title: duplicateCheck.documentTitle
          },
          message: duplicateCheck.isPending 
            ? `This content is already pending approval in the curation queue as "${duplicateCheck.documentTitle}". Skipped to avoid duplication.`
            : `This content already exists in the Knowledge Base as "${duplicateCheck.documentTitle}". Skipped to avoid duplication.`
        });
      }

      // Generate hash and normalized content for storage
      const contentHash = generateContentHash(content);
      const normalizedContent = normalizeContent(content);

      const item = await curationStore.addToCuration({
        title,
        content,
        suggestedNamespaces,
        tags,
        submittedBy,
        contentHash, // Store for future dedup checks
        normalizedContent, // Store for fuzzy matching
      });

      // Emitir evento para indexador (opcional)
      await publishEvent("DOC_INGESTED", {
        docId: item.id,
        namespaces: ["curation/pending"],
      });

      console.log(`[Curation] ✅ Added to queue: "${title}" (unique content, hash: ${contentHash.substring(0, 8)}...)`);

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
   * Aprova e publica item + ADICIONA AO DATASET DE TREINO
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

      // ✨ NOVO: Adicionar ao dataset de treino se houver trainingData
      if (item.trainingData && Array.isArray(item.trainingData) && item.trainingData.length > 0) {
        const { trainingDataCollection } = await import("../../shared/schema");
        
        for (const trainingPair of item.trainingData) {
          await db.insert(trainingDataCollection).values({
            source: item.contentType || 'curation',
            instruction: trainingPair.instruction || '',
            input: trainingPair.input || '',
            output: trainingPair.output || '',
            quality: 'high', // Aprovado por humano = alta qualidade
            metadata: {
              curationId: item.id,
              publishedId,
              sourceUrl: item.sourceUrl,
              reviewedBy,
            },
            isUsedInTraining: false, // Será marcado como true quando for incluído em um job
          } as any);
        }

        console.log(`✅ ${item.trainingData.length} pares de treino adicionados ao dataset`);
      }

      // Emitir eventos para indexador
      await publishEvent("DOC_UPDATED", {
        docId: publishedId,
        namespaces: item.suggestedNamespaces,
      });

      await publishEvent("AGENT_NAMESPACES_CHANGED", {
        namespaces: item.suggestedNamespaces,
      });

      // ✨ NOVO: Emitir evento de novos dados de treino disponíveis
      await publishEvent("TRAINING_DATA_ADDED", {
        count: item.trainingData?.length || 0,
        curationId: item.id,
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

          // Adicionar ao dataset de treino
          if (item.trainingData && Array.isArray(item.trainingData) && item.trainingData.length > 0) {
            const { trainingDataCollection } = await import("../../shared/schema");
            
            for (const trainingPair of item.trainingData) {
              await db.insert(trainingDataCollection).values({
                source: item.contentType || 'curation',
                instruction: trainingPair.instruction || '',
                input: trainingPair.input || '',
                output: trainingPair.output || '',
                quality: 'high',
                metadata: {
                  curationId: item.id,
                  publishedId,
                  sourceUrl: item.sourceUrl,
                  reviewedBy,
                },
                isUsedInTraining: false,
              } as any);
            }
          }

          await publishEvent("DOC_UPDATED", {
            docId: publishedId,
            namespaces: item.suggestedNamespaces,
          });

          await publishEvent("AGENT_NAMESPACES_CHANGED", {
            namespaces: item.suggestedNamespaces,
          });

          await publishEvent("TRAINING_DATA_ADDED", {
            count: item.trainingData?.length || 0,
            curationId: item.id,
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
   * POST /api/curation/scan-duplicates
   * TIER 2 DEDUPLICATION: Semantic similarity batch scan (on-demand)
   * Scans all pending items and marks near-duplicates
   * Expensive operation - generates embeddings via OpenAI
   */
  app.post("/api/curation/scan-duplicates", async (req, res) => {
    try {
      console.log('[Curation] 🔍 Starting duplicate scan...');
      
      const results = await deduplicationService.scanAllPendingCurationItems();
      
      res.json({
        success: true,
        message: `Scanned ${results.total} items`,
        stats: {
          total: results.total,
          unique: results.unique,
          exact: results.exact,
          near: results.near,
          errors: results.errors
        }
      });
    } catch (error: any) {
      console.error('[Curation] Scan duplicates error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/curation/absorb-partial/:id
   * PARTIAL CONTENT ABSORPTION: Extract and save only new content from near-duplicates
   * Requires manual HITL approval via UI button
   * 
   * Process:
   * 1. Identify duplicate content (KB or queue)
   * 2. Extract only unique/new parts
   * 3. Update item with extracted content
   * 4. Return preview for curator review
   */
  app.post("/api/curation/absorb-partial/:id", async (req, res) => {
    try {
      const itemId = req.params.id;
      
      // Get curation item
      const [item] = await db
        .select()
        .from(curationQueue)
        .where(eq(curationQueue.id, itemId))
        .limit(1);

      if (!item) {
        return res.status(404).json({ error: "Curation item not found" });
      }

      // Only absorb from "near" duplicates
      if (item.duplicationStatus !== 'near') {
        return res.status(400).json({ 
          error: "Can only absorb from near-duplicates (85-98% similar)",
          currentStatus: item.duplicationStatus 
        });
      }

      // Find the duplicate content
      let duplicateContent = '';
      let duplicateTitle = '';

      if (item.duplicateOfId) {
        // Duplicate is in KB
        const [doc] = await db
          .select()
          .from(documents)
          .where(eq(documents.id, parseInt(item.duplicateOfId)))
          .limit(1);
        
        if (doc) {
          duplicateContent = doc.content;
          duplicateTitle = doc.title;
        }
      } else {
        // Duplicate is in curation queue - find by comparing embeddings
        // This is a simplified approach - in production you'd store the queue duplicate ID
        console.log('[Curation] ⚠️ Duplicate is in queue, using heuristic to find match');
        
        // For now, we'll use the original content as is
        // In a full implementation, you'd store which queue item it duplicates
        return res.status(501).json({ 
          error: "Absorption from queue duplicates not yet implemented. Please approve or reject the duplicate manually." 
        });
      }

      if (!duplicateContent) {
        return res.status(404).json({ error: "Duplicate content not found" });
      }

      // Analyze and extract new content
      const { analyzePartialDuplication } = await import('../utils/deduplication');
      const analysis = analyzePartialDuplication(
        item.content,
        duplicateContent,
        item.similarityScore || 0.9
      );

      if (!analysis.shouldAbsorb) {
        return res.status(400).json({ 
          error: "Absorption not recommended",
          reason: analysis.reason,
          analysis
        });
      }

      // Update item with extracted content
      const updatedContent = analysis.extractedContent;
      const updatedHash = generateContentHash(updatedContent);
      const updatedNormalized = normalizeContent(updatedContent);

      await db
        .update(curationQueue)
        .set({
          content: updatedContent,
          contentHash: updatedHash,
          normalizedContent: updatedNormalized,
          duplicationStatus: 'unique', // Mark as unique after absorption
          note: (item.note || '') + `\n\n---\n🔄 **Absorção Parcial Aplicada**\n` +
                `- Conteúdo original: ${analysis.originalLength} caracteres\n` +
                `- Conteúdo extraído: ${analysis.extractedLength} caracteres\n` +
                `- Duplicado de: "${duplicateTitle}"\n` +
                `- Motivo: ${analysis.reason}`,
          updatedAt: new Date()
        })
        .where(eq(curationQueue.id, itemId));

      console.log(`[Curation] ✅ Partial absorption complete for "${item.title}": ${analysis.originalLength} → ${analysis.extractedLength} chars`);

      res.json({
        success: true,
        message: "Partial content absorbed successfully",
        analysis: {
          originalLength: analysis.originalLength,
          extractedLength: analysis.extractedLength,
          reductionPercent: Math.round((1 - analysis.extractedLength / analysis.originalLength) * 100),
          reason: analysis.reason
        },
        updatedContent,
        duplicateTitle
      });
    } catch (error: any) {
      console.error('[Curation] Absorb partial error:', error);
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
