/**
 * ENTERPRISE KB CASCADE DELETE SERVICE
 * 
 * Implements HYBRID deletion strategy with lineage tracking:
 * 
 * HARD DELETE (immediate removal):
 * 1. Embeddings (RAG vectors)
 * 2. Physical files (storageUrl, attachments)
 * 3. Document record from documents table
 * 
 * SOFT PRESERVE (metadata retention for GDPR compliance):
 * 4. Create deletion_tombstone with metadata (NO PII)
 * 5. Track cascade impact (affected datasets, models)
 * 
 * DEPENDENCY TRACKING:
 * 6. Check dataset_versions.source_kb_document_ids (which datasets use this doc?)
 * 7. Check model_versions.indirect_kb_document_ids (which models depend on it?)
 * 8. TAINT affected datasets/models (mark as unusable until re-train)
 * 
 * GDPR COMPLIANCE:
 * 9. Redact PII from tombstone metadata
 * 10. Set retention_until based on policy
 * 11. Immutable audit trail
 * 
 * CRITICAL: Uses transactions for atomicity
 */

import { db } from "../db";
import { 
  documents, 
  embeddings, 
  datasetVersions, 
  modelVersions, 
  deletionTombstones 
} from "@shared/schema";
import { eq, inArray, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

interface CascadeResult {
  success: boolean;
  documentsDeleted: number;
  embeddingsDeleted: number;
  filesDeleted: string[];
  warnings: string[];
  error?: string;
  
  // Enterprise lineage tracking
  affectedDatasets: number[];
  affectedModels: number[];
  tombstoneId?: number;
  taintedEntities: {
    datasets: number[];
    models: number[];
  };
}

export class KBCascadeService {
  /**
   * ENTERPRISE CASCADE DELETE - Hybrid deletion with lineage tracking
   * 
   * @param documentId KB document ID to delete
   * @param options.userId User who initiated deletion
   * @param options.reason Deletion reason (GDPR, user_request, retention_policy, cascade)
   * @param options.gdprReason GDPR-specific reason (right_to_erasure, data_minimization, storage_limitation)
   * @param options.retentionDays How long to keep tombstone metadata (null = forever)
   */
  async deleteDocument(
    documentId: number,
    options: {
      userId?: string;
      reason?: string;
      gdprReason?: string;
      retentionDays?: number | null;
    } = {}
  ): Promise<CascadeResult> {
    const result: CascadeResult = {
      success: false,
      documentsDeleted: 0,
      embeddingsDeleted: 0,
      filesDeleted: [],
      warnings: [],
      affectedDatasets: [],
      affectedModels: [],
      taintedEntities: {
        datasets: [],
        models: [],
      },
    };

    try {
      // =========================================================================
      // STEP 1: FETCH DOCUMENT + DEPENDENCY TRACKING
      // =========================================================================
      const doc = await db.query.documents.findFirst({
        where: eq(documents.id, documentId),
      });

      if (!doc) {
        throw new Error(`Document ID ${documentId} not found`);
      }

      // Collect file paths for cleanup
      const filesToDelete: string[] = [];
      if (doc.storageUrl) {
        filesToDelete.push(doc.storageUrl);
      }
      if (doc.attachments && Array.isArray(doc.attachments)) {
        for (const attachment of doc.attachments) {
          if (attachment.url && !attachment.url.startsWith('http')) {
            filesToDelete.push(attachment.url);
          }
        }
      }

      // =========================================================================
      // STEP 2: DEPENDENCY TRACKING - Find affected datasets and models
      // =========================================================================
      
      // Query using PostgreSQL array containment operator (@>)
      // Find all dataset_versions where source_kb_document_ids contains this documentId
      const affectedDatasetVersions = await db
        .select()
        .from(datasetVersions)
        .where(sql`${datasetVersions.sourceKbDocumentIds} @> ARRAY[${documentId}]::integer[]`);

      result.affectedDatasets = affectedDatasetVersions.map(dv => dv.datasetId);

      // Find all model_versions where indirect_kb_document_ids contains this documentId
      const affectedModelVersions = await db
        .select()
        .from(modelVersions)
        .where(sql`${modelVersions.indirectKbDocumentIds} @> ARRAY[${documentId}]::integer[]`);

      result.affectedModels = affectedModelVersions.map(mv => mv.id);

      if (result.affectedDatasets.length > 0) {
        result.warnings.push(
          `⚠️  ${result.affectedDatasets.length} dataset(s) depend on this KB document. They will be tainted.`
        );
      }

      if (result.affectedModels.length > 0) {
        result.warnings.push(
          `⚠️  ${result.affectedModels.length} model(s) indirectly depend on this KB document. They will be tainted.`
        );
      }

      // =========================================================================
      // STEP 3: TRANSACTION - Hard delete + soft preserve
      // =========================================================================
      await db.transaction(async (tx) => {
        // ─────────────────────────────────────────────────────────────────────
        // 3a. TAINT AFFECTED DATASETS (mark as unusable)
        // ─────────────────────────────────────────────────────────────────────
        if (affectedDatasetVersions.length > 0) {
          for (const dv of affectedDatasetVersions) {
            await tx
              .update(datasetVersions)
              .set({
                status: 'tainted',
                // GDPR-SAFE: Use only ID, NO user-provided strings
                taintReason: `Source KB document #${documentId} was deleted`,
              })
              .where(eq(datasetVersions.id, dv.id));
            
            result.taintedEntities.datasets.push(dv.id);
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3b. TAINT AFFECTED MODELS (mark as unusable)
        // ─────────────────────────────────────────────────────────────────────
        if (affectedModelVersions.length > 0) {
          for (const mv of affectedModelVersions) {
            await tx
              .update(modelVersions)
              .set({
                status: 'tainted',
                // GDPR-SAFE: Use only ID, NO user-provided strings
                taintReason: `Indirect KB document #${documentId} was deleted`,
              })
              .where(eq(modelVersions.id, mv.id));
            
            result.taintedEntities.models.push(mv.id);
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // 3c. CREATE DELETION TOMBSTONE (soft preserve metadata, NO PII)
        // ─────────────────────────────────────────────────────────────────────
        const retentionUntil = options.retentionDays
          ? new Date(Date.now() + options.retentionDays * 24 * 60 * 60 * 1000)
          : null;

        const [tombstone] = await tx
          .insert(deletionTombstones)
          .values({
            entityType: 'kb_document',
            entityId: documentId,
            entityMetadata: {
              // GDPR-SAFE: ONLY system-controlled fields, ZERO user-provided strings
              namespace: doc.metadata?.namespaces?.[0] || 'general', // Safe: admin-controlled enum
              createdAt: doc.createdAt?.toISOString(), // Safe: timestamp
              size: doc.size || undefined, // Safe: numeric (file size in bytes)
              // REDACTED: title, tags, attachment names, any user-provided text
            },
            deletedBy: options.userId || null,
            deletionReason: options.reason || 'user_request',
            cascadeImpact: {
              affectedDatasets: result.affectedDatasets,
              affectedModels: result.affectedModels,
              totalAffectedEntities: result.affectedDatasets.length + result.affectedModels.length,
            },
            retentionUntil,
            gdprReason: options.gdprReason || null,
          })
          .returning();

        result.tombstoneId = tombstone.id;

        // ─────────────────────────────────────────────────────────────────────
        // 3d. HARD DELETE - Embeddings
        // ─────────────────────────────────────────────────────────────────────
        const deletedEmbeddings = await tx
          .delete(embeddings)
          .where(eq(embeddings.documentId, documentId))
          .returning();

        result.embeddingsDeleted = deletedEmbeddings.length;

        // ─────────────────────────────────────────────────────────────────────
        // 3e. HARD DELETE - Document record
        // ─────────────────────────────────────────────────────────────────────
        await tx.delete(documents).where(eq(documents.id, documentId));
        result.documentsDeleted = 1;
      });

      // =========================================================================
      // STEP 4: DELETE PHYSICAL FILES (outside transaction)
      // =========================================================================
      for (const filePath of filesToDelete) {
        try {
          const fullPath = path.resolve(filePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            result.filesDeleted.push(filePath);
          }
        } catch (fileError: any) {
          result.warnings.push(
            `Failed to delete file ${filePath}: ${fileError.message}`
          );
        }
      }

      result.success = true;
      return result;
    } catch (error: any) {
      result.error = error.message;
      return result;
    }
  }

  /**
   * Bulk delete documents with FULL cascade (transactional all-or-nothing)
   * 
   * @param documentIds - Array of document IDs to delete
   * @param options - Deletion metadata (userId, reason, gdprReason, retentionDays)
   * @returns Aggregated CascadeResult with combined stats
   * 
   * TRANSACTIONAL SEMANTICS:
   * - All deletions succeed or ALL fail (rollback)
   * - Dependency tracking for ALL documents
   * - Model tainting for ALL affected models
   * - Tombstone creation for EACH document
   * - Physical file cleanup (best-effort outside transaction)
   * 
   * ROLLBACK SAFETY:
   * - Aggregation happens AFTER transaction commits (no stale state on rollback)
   * - Per-document data collected in array, aggregated only on success
   * 
   * LIMITS:
   * - Max 100 documents per batch (prevent timeout/memory exhaustion)
   */
  async deleteBulk(
    documentIds: number[], 
    options: {
      userId?: string;
      reason?: string;
      gdprReason?: string;
      retentionDays?: number | null;
    } = {}
  ): Promise<CascadeResult & { tombstoneIds?: number[] }> {
    const MAX_BATCH_SIZE = 100;
    
    if (documentIds.length === 0) {
      throw new Error('No document IDs provided');
    }

    if (documentIds.length > MAX_BATCH_SIZE) {
      throw new Error(`Batch size ${documentIds.length} exceeds limit of ${MAX_BATCH_SIZE}`);
    }

    // Aggregated result
    const result: CascadeResult & { tombstoneIds?: number[] } = {
      success: false,
      documentsDeleted: 0,
      embeddingsDeleted: 0,
      filesDeleted: [],
      warnings: [],
      affectedDatasets: [],
      affectedModels: [],
      taintedEntities: {
        datasets: [],
        models: [],
      },
      tombstoneIds: [],
    };

    const filesToDelete: string[] = [];

    try {
      // =========================================================================
      // STEP 1: VALIDATE - Fetch all documents
      // =========================================================================
      const docs = await db.query.documents.findMany({
        where: inArray(documents.id, documentIds),
      });

      if (docs.length === 0) {
        throw new Error(`No documents found for IDs: ${documentIds.join(', ')}`);
      }

      if (docs.length !== documentIds.length) {
        const foundIds = docs.map(d => d.id);
        const missingIds = documentIds.filter(id => !foundIds.includes(id));
        result.warnings.push(`Missing documents: ${missingIds.join(', ')}`);
      }

      // Collect file paths
      for (const doc of docs) {
        if (doc.storageUrl) {
          filesToDelete.push(doc.storageUrl);
        }
        if (doc.attachments && Array.isArray(doc.attachments)) {
          for (const attachment of doc.attachments) {
            if (attachment.url && !attachment.url.startsWith('http')) {
              filesToDelete.push(attachment.url);
            }
          }
        }
      }

      // =========================================================================
      // STEP 2: TRANSACTIONAL CASCADE DELETE (all-or-nothing)
      // =========================================================================
      // Per-document tracking (collected inside transaction, aggregated outside)
      const perDocData: Array<{
        documentId: number;
        affectedDatasetIds: number[];
        affectedModelIds: number[];
        taintedDatasetIds: number[];
        taintedModelIds: number[];
        tombstoneId: number;
      }> = [];

      await db.transaction(async (tx) => {
        for (const doc of docs) {
          const documentId = doc.id;
          const docData = {
            documentId,
            affectedDatasetIds: [] as number[],
            affectedModelIds: [] as number[],
            taintedDatasetIds: [] as number[],
            taintedModelIds: [] as number[],
            tombstoneId: 0,
          };

          // ───────────────────────────────────────────────────────────────────
          // 2a. FIND AFFECTED DATASETS (array containment query)
          // ───────────────────────────────────────────────────────────────────
          const affectedDatasetVersions = await tx
            .select({
              id: datasetVersions.id,
              status: datasetVersions.status,
            })
            .from(datasetVersions)
            .where(sql`${datasetVersions.sourceKbDocumentIds} @> ARRAY[${documentId}]::integer[]`);

          docData.affectedDatasetIds = affectedDatasetVersions.map(d => d.id);

          // ───────────────────────────────────────────────────────────────────
          // 2b. FIND AFFECTED MODELS (indirect KB document IDs)
          // ───────────────────────────────────────────────────────────────────
          const affectedModelVersions = await tx
            .select({
              id: modelVersions.id,
              status: modelVersions.status,
            })
            .from(modelVersions)
            .where(sql`${modelVersions.indirectKbDocumentIds} @> ARRAY[${documentId}]::integer[]`);

          docData.affectedModelIds = affectedModelVersions.map(m => m.id);

          // ───────────────────────────────────────────────────────────────────
          // 2c. TAINT AFFECTED DATASETS
          // ───────────────────────────────────────────────────────────────────
          if (affectedDatasetVersions.length > 0) {
            for (const dv of affectedDatasetVersions) {
              await tx
                .update(datasetVersions)
                .set({
                  status: 'tainted',
                  taintReason: `KB document #${documentId} was deleted`,
                })
                .where(eq(datasetVersions.id, dv.id));
              
              docData.taintedDatasetIds.push(dv.id);
            }
          }

          // ───────────────────────────────────────────────────────────────────
          // 2d. TAINT AFFECTED MODELS
          // ───────────────────────────────────────────────────────────────────
          if (affectedModelVersions.length > 0) {
            for (const mv of affectedModelVersions) {
              await tx
                .update(modelVersions)
                .set({
                  status: 'tainted',
                  taintReason: `Indirect KB document #${documentId} was deleted`,
                })
                .where(eq(modelVersions.id, mv.id));
              
              docData.taintedModelIds.push(mv.id);
            }
          }

          // ───────────────────────────────────────────────────────────────────
          // 2e. CREATE DELETION TOMBSTONE (per document)
          // ───────────────────────────────────────────────────────────────────
          const retentionUntil = options.retentionDays
            ? new Date(Date.now() + options.retentionDays * 24 * 60 * 60 * 1000)
            : null;

          // Aggregate ALL dependencies up to this point for this tombstone
          const allAffectedSoFar = [...new Set([
            ...perDocData.flatMap(d => d.affectedDatasetIds),
            ...docData.affectedDatasetIds,
          ])];
          const allModelsSoFar = [...new Set([
            ...perDocData.flatMap(d => d.affectedModelIds),
            ...docData.affectedModelIds,
          ])];

          const [tombstone] = await tx.insert(deletionTombstones).values({
            entityType: 'kb_document',
            entityId: documentId,
            entityMetadata: {
              namespace: doc.metadata?.namespaces?.[0] || 'general',
              createdAt: doc.createdAt?.toISOString(),
              size: doc.size || undefined,
            },
            deletedBy: options.userId || null,
            deletionReason: options.reason || 'bulk_delete',
            cascadeImpact: {
              affectedDatasets: allAffectedSoFar,
              affectedModels: allModelsSoFar,
              totalAffectedEntities: allAffectedSoFar.length + allModelsSoFar.length,
            },
            retentionUntil,
            gdprReason: options.gdprReason || null,
          }).returning();

          docData.tombstoneId = tombstone.id;
          perDocData.push(docData);
        }

        // ─────────────────────────────────────────────────────────────────────
        // 2f. HARD DELETE - Embeddings (bulk)
        // ─────────────────────────────────────────────────────────────────────
        const deletedEmbeddings = await tx
          .delete(embeddings)
          .where(inArray(embeddings.documentId, documentIds))
          .returning();

        result.embeddingsDeleted = deletedEmbeddings.length;

        // ─────────────────────────────────────────────────────────────────────
        // 2g. HARD DELETE - Documents (bulk)
        // ─────────────────────────────────────────────────────────────────────
        const deletedDocs = await tx
          .delete(documents)
          .where(inArray(documents.id, documentIds))
          .returning();

        result.documentsDeleted = deletedDocs.length;
      });

      // =========================================================================
      // STEP 3: AGGREGATE STATS (only after transaction commits successfully)
      // =========================================================================
      const allAffectedDatasetIds = new Set<number>();
      const allAffectedModelIds = new Set<number>();
      const allTaintedDatasetIds = new Set<number>();
      const allTaintedModelIds = new Set<number>();

      for (const data of perDocData) {
        data.affectedDatasetIds.forEach(id => allAffectedDatasetIds.add(id));
        data.affectedModelIds.forEach(id => allAffectedModelIds.add(id));
        data.taintedDatasetIds.forEach(id => allTaintedDatasetIds.add(id));
        data.taintedModelIds.forEach(id => allTaintedModelIds.add(id));
      }

      result.affectedDatasets = Array.from(allAffectedDatasetIds);
      result.affectedModels = Array.from(allAffectedModelIds);
      result.taintedEntities = {
        datasets: Array.from(allTaintedDatasetIds),
        models: Array.from(allTaintedModelIds),
      };
      result.tombstoneIds = perDocData.map(d => d.tombstoneId);

      // =========================================================================
      // STEP 4: DELETE PHYSICAL FILES (outside transaction, best-effort)
      // =========================================================================
      for (const filePath of filesToDelete) {
        try {
          const fullPath = path.resolve(filePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            result.filesDeleted.push(filePath);
          }
        } catch (fileError: any) {
          result.warnings.push(
            `Failed to delete file ${filePath}: ${fileError.message}`
          );
        }
      }

      result.success = true;
      return result;
    } catch (error: any) {
      result.error = error.message;
      // Ensure stale data is cleared on failure
      result.affectedDatasets = [];
      result.affectedModels = [];
      result.taintedEntities = { datasets: [], models: [] };
      result.tombstoneIds = [];
      return result;
    }
  }

  /**
   * Safe check: Find documents that may be referenced in training data
   */
  async findDocumentsInTraining(): Promise<Array<{ id: number; title: string; reason: string }>> {
    const docs = await db.query.documents.findMany({
      where: eq(documents.status, "indexed"),
    });

    const results: Array<{ id: number; title: string; reason: string }> = [];

    for (const doc of docs) {
      if (doc.metadata && typeof doc.metadata === 'object') {
        const meta = doc.metadata as Record<string, any>;
        
        if (meta.autoIndexed) {
          results.push({
            id: doc.id,
            title: doc.title,
            reason: "Auto-indexed from conversation (used in training data)",
          });
        } else if (meta.query) {
          results.push({
            id: doc.id,
            title: doc.title,
            reason: "Generated from web search (used in training data)",
          });
        }
      }
    }

    return results;
  }
}

export const kbCascadeService = new KBCascadeService();
