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
   * Bulk delete documents with cascade
   */
  async deleteDocuments(documentIds: number[]): Promise<CascadeResult> {
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
      // 1. Fetch all documents to get file paths
      const docs = await db.query.documents.findMany({
        where: inArray(documents.id, documentIds),
      });

      if (docs.length === 0) {
        throw new Error(`No documents found for IDs: ${documentIds.join(", ")}`);
      }

      // 2. Collect all file paths
      const filesToDelete: string[] = [];
      
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

        // Check for training data generation usage
        if (doc.metadata && typeof doc.metadata === 'object') {
          const meta = doc.metadata as Record<string, any>;
          if (meta.autoIndexed || meta.query) {
            result.warnings.push(
              `Document "${doc.title}" was used for training data generation`
            );
          }
        }
      }

      // 3. Delete in transaction
      await db.transaction(async (tx) => {
        // 3a. Delete embeddings
        const deletedEmbeddings = await tx
          .delete(embeddings)
          .where(inArray(embeddings.documentId, documentIds))
          .returning();

        result.embeddingsDeleted = deletedEmbeddings.length;

        // 3b. Delete documents
        const deletedDocs = await tx
          .delete(documents)
          .where(inArray(documents.id, documentIds))
          .returning();

        result.documentsDeleted = deletedDocs.length;
      });

      // 4. Delete physical files
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
