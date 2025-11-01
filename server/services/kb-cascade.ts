/**
 * KB CASCADE DELETE SERVICE
 * 
 * Handles cascade deletion for Knowledge Base (documents table) with comprehensive cleanup:
 * 1. Delete embeddings (RAG vectors)
 * 2. Delete physical files (storageUrl, attachments)
 * 3. Warn about datasets generated from this doc (no auto-delete to prevent data loss)
 * 
 * CRITICAL: Uses transactions for atomicity
 */

import { db } from "../db";
import { documents, embeddings } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";

interface CascadeResult {
  success: boolean;
  documentsDeleted: number;
  embeddingsDeleted: number;
  filesDeleted: string[];
  warnings: string[];
  error?: string;
}

export class KBCascadeService {
  /**
   * Delete single KB document with full cascade
   */
  async deleteDocument(documentId: number): Promise<CascadeResult> {
    const result: CascadeResult = {
      success: false,
      documentsDeleted: 0,
      embeddingsDeleted: 0,
      filesDeleted: [],
      warnings: [],
    };

    try {
      // 1. Fetch document to get file paths
      const doc = await db.query.documents.findFirst({
        where: eq(documents.id, documentId),
      });

      if (!doc) {
        throw new Error(`Document ID ${documentId} not found`);
      }

      // 2. Collect all file paths for cleanup
      const filesToDelete: string[] = [];
      
      if (doc.storageUrl) {
        filesToDelete.push(doc.storageUrl);
      }

      if (doc.attachments && Array.isArray(doc.attachments)) {
        for (const attachment of doc.attachments) {
          if (attachment.url && !attachment.url.startsWith('http')) {
            // Local file URL
            filesToDelete.push(attachment.url);
          }
        }
      }

      // 3. Check if datasets were generated from this doc (warning only)
      if (doc.metadata && typeof doc.metadata === 'object') {
        const meta = doc.metadata as Record<string, any>;
        if (meta.autoIndexed || meta.query) {
          result.warnings.push(
            `Document "${doc.title}" was used for training data generation. ` +
            `Datasets may reference this content. Consider reviewing datasets before deletion.`
          );
        }
      }

      // 4. Delete in transaction (atomicity)
      await db.transaction(async (tx) => {
        // 4a. Delete embeddings (CASCADE via FK should handle this, but explicit for clarity)
        const deletedEmbeddings = await tx
          .delete(embeddings)
          .where(eq(embeddings.documentId, documentId))
          .returning();

        result.embeddingsDeleted = deletedEmbeddings.length;

        // 4b. Delete document
        await tx.delete(documents).where(eq(documents.id, documentId));
        result.documentsDeleted = 1;
      });

      // 5. Delete physical files (outside transaction - file system not transactional)
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
