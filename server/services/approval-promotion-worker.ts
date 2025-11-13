/**
 * APPROVAL PROMOTION WORKER
 * ==========================
 * 
 * ⭐ CRITICAL FIX: Resolve o bloqueio principal do sistema de auto-evolução
 * 
 * PROBLEMA RESOLVIDO:
 * - 48 items aprovados em curation_queue
 * - 0 documentos indexados em documents table
 * - Missing pathway: curation_queue.status='approved' → documents.status='indexed'
 * - Auto-training nunca dispara (requer docs indexed, encontra 0)
 * 
 * SOLUÇÃO:
 * - Processa batch de items approved na curation_queue
 * - Chama knowledgeIndexer.index() para criar documento indexado
 * - Atualiza curation_queue.publishedId com ID do documento criado
 * - Garante pipeline: Approval → Indexing → Training → GPU
 * 
 * EXECUÇÃO:
 * - Rodado via scheduler a cada 5 minutos (alta prioridade!)
 * - Processa máximo 20 items por run (rate limiting)
 * - Telemetria para monitorar promoções
 */

import { db } from "../db";
import { curationQueue, documents } from "@shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { knowledgeIndexer } from "../rag/knowledge-indexer";
import { logger } from "./logger-service";
import { curationStore } from "../curation/store";

export class ApprovalPromotionWorker {
  private isRunning = false;
  
  /**
   * Promove items aprovados para Knowledge Base indexada
   * 
   * @param maxItems - Máximo de items a processar por run (default: 20)
   * @returns Estatísticas do processamento
   */
  async promoteApprovedItems(maxItems: number = 20): Promise<{
    processed: number;
    promoted: number;
    failed: number;
    duplicates: number;
  }> {
    // Re-entrancy guard
    if (this.isRunning) {
      logger.info('[ApprovalPromotion] ⚠️ Already running - skipping this cycle');
      return { processed: 0, promoted: 0, failed: 0, duplicates: 0 };
    }
    
    this.isRunning = true;
    
    try {
      logger.info('[ApprovalPromotion] 🔍 Searching for approved items to promote...');
      
      // Buscar items APPROVED sem publishedId (nunca foram promovidos)
      const approvedItems = await db
        .select()
        .from(curationQueue)
        .where(
          and(
            eq(curationQueue.status, 'approved'),
            isNull(curationQueue.publishedId)
          )
        )
        .limit(maxItems);
      
      if (approvedItems.length === 0) {
        logger.info('[ApprovalPromotion] ✅ No approved items awaiting promotion');
        return { processed: 0, promoted: 0, failed: 0, duplicates: 0 };
      }
      
      logger.info(`[ApprovalPromotion] 📊 Found ${approvedItems.length} approved items to promote - processing...`);
      
      let promoted = 0;
      let failed = 0;
      let duplicates = 0;
      
      // Processar cada item aprovado
      for (const item of approvedItems) {
        try {
          logger.info(`[ApprovalPromotion] 📝 Promoting item ${item.id} (${item.title})...`);
          
          // CRITICAL: Usar publishApprovedItem() que reutiliza lógica completa
          // (deduplicação, absorção, namespaces, indexação, training_data_collection)
          const docId = await curationStore.publishApprovedItem(item.id);
          
          logger.info(`[ApprovalPromotion] ✅ Item ${item.id} promoted successfully → document ${docId}`);
          promoted++;
          
        } catch (error: any) {
          // Detectar erros de duplicação
          const isDuplicateError = error.message?.includes('duplicate') ||
                                  error.message?.includes('already exists') ||
                                  error.message?.includes('content_hash_unique') ||
                                  error.code === '23505';
          
          if (isDuplicateError) {
            // 🔥 FIX: publishApprovedItem() now RETURNS existing docId for duplicates
            // This error should NOT happen anymore (method handles duplicates internally)
            // If we get here, it's likely content_hash collision from concurrent processing
            logger.warn(`[ApprovalPromotion] ⚠️ Item ${item.id}: Unexpected duplicate error (likely race condition) - ${error.message}`);
            
            // Mark as failed for manual review (not "DUPLICATE" sentinel)
            duplicates++;
          } else {
            logger.error(`[ApprovalPromotion] ❌ Item ${item.id}: Promotion failed: ${error.message}`);
            failed++;
          }
          
          // Continue processando outros items
          continue;
        }
      }
      
      const results = {
        processed: approvedItems.length,
        promoted,
        failed,
        duplicates
      };
      
      if (promoted > 0 || duplicates > 0) {
        logger.info(`[ApprovalPromotion] 🎉 Promotion complete: ${promoted} indexed, ${duplicates} duplicates, ${failed} failed`);
      }
      
      return results;
      
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Obtém estatísticas de promoção pendente
   */
  async getPendingStats(): Promise<{
    totalApproved: number;
    promoted: number;
    awaitingPromotion: number;
  }> {
    try {
      // Total approved
      const [totalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(curationQueue)
        .where(eq(curationQueue.status, 'approved'));
      
      // Already promoted (have publishedId)
      const [promotedCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(curationQueue)
        .where(
          and(
            eq(curationQueue.status, 'approved'),
            sql`${curationQueue.publishedId} IS NOT NULL`
          )
        );
      
      const total = Number(totalCount?.count || 0);
      const promoted = Number(promotedCount?.count || 0);
      const awaiting = total - promoted;
      
      return {
        totalApproved: total,
        promoted,
        awaitingPromotion: awaiting
      };
      
    } catch (error: any) {
      logger.error(`[ApprovalPromotion] Error getting stats: ${error.message}`);
      return {
        totalApproved: 0,
        promoted: 0,
        awaitingPromotion: 0
      };
    }
  }
  
  /**
   * Verifica quantos documentos indexed existem provenientes de curadoria
   */
  async getIndexedDocsFromCuration(): Promise<number> {
    try {
      const [result] = await db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(
          and(
            eq(documents.status, 'indexed'),
            sql`${documents.source} = 'curation_approved'`
          )
        );
      
      return Number(result?.count || 0);
      
    } catch (error: any) {
      logger.error(`[ApprovalPromotion] Error counting indexed docs: ${error.message}`);
      return 0;
    }
  }
  
  /**
   * Scheduler-compatible run method
   * Delegates to promoteApprovedItems with default batch size
   */
  async run(maxItems?: number): Promise<{
    promoted: number;
    duplicates: number;
    failed: number;
  }> {
    const { promoted, duplicates, failed } = await this.promoteApprovedItems(maxItems);
    return { promoted, duplicates, failed };
  }
}

// Export singleton
export const approvalPromotionWorker = new ApprovalPromotionWorker();
