/**
 * DEDUPLICATION SERVICE
 * Detects and prevents duplicate content in KB
 * 
 * Features:
 * - SHA-256 hash-based file deduplication
 * - Semantic similarity check for text (via KnowledgeIndexer)
 * - Image perceptual hashing (future: pHash)
 */

import * as crypto from 'crypto';
import { db } from '../db';
import { documents, embeddings } from '../../shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import * as fs from 'fs/promises';
import { embedder } from '../rag/embedder';

export interface DeduplicationResult {
  isDuplicate: boolean;
  duplicateOf?: {
    id: number;
    title: string;
    hash: string;
    similarity?: number;
  };
  method: 'hash' | 'semantic' | 'none';
}

export class DeduplicationService {
  /**
   * Calculate SHA-256 hash of file content
   */
  async hashFile(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Calculate SHA-256 hash of text content
   */
  hashText(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Check if file is duplicate by hash
   */
  async checkFileHash(hash: string, tenantId: number = 1): Promise<DeduplicationResult> {
    // Check if hash exists in metadata
    const existing = await db
      .select({
        id: documents.id,
        title: documents.title,
        metadata: documents.metadata
      })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          sql`${documents.metadata}->>'contentHash' = ${hash}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return {
        isDuplicate: true,
        duplicateOf: {
          id: existing[0].id,
          title: existing[0].title,
          hash
        },
        method: 'hash'
      };
    }

    return { isDuplicate: false, method: 'none' };
  }

  /**
   * Check if text is semantically duplicate (>95% similarity)
   * Uses RAG semantic search
   */
  async checkSemanticDuplicate(
    text: string,
    tenantId: number = 1,
    threshold: number = 0.95
  ): Promise<DeduplicationResult> {
    // Skip very short texts
    if (text.length < 100) {
      return { isDuplicate: false, method: 'none' };
    }

    try {
      // Generate embedding for text
      const [result] = await embedder.generateEmbeddings([
        { text, index: 0, tokens: Math.ceil(text.length / 4) }
      ]);

      // Search for similar content
      const similar = await db
        .select({
          documentId: embeddings.documentId,
          chunkText: embeddings.chunkText,
          embedding: sql<number[]>`${embeddings.embedding}::jsonb`,
          documentTitle: documents.title
        })
        .from(embeddings)
        .innerJoin(documents, eq(embeddings.documentId, documents.id))
        .where(
          and(
            eq(embeddings.tenantId, tenantId),
            eq(documents.status, 'indexed')
          )
        )
        .limit(100); // Sample for similarity check

      // If no embeddings found, KB is empty - no duplicates possible
      if (similar.length === 0) {
        return { isDuplicate: false, method: 'none' };
      }

      // Calculate similarity for each
      let maxSimilarity = 0;
      let bestMatch: typeof similar[0] | null = null;

      for (const item of similar) {
        try {
          // Guard against null/malformed embeddings
          if (!item.embedding) {
            console.warn('[Deduplication] Skipping null embedding for document', item.documentId);
            continue;
          }

          // Parse embedding (Drizzle may return as string or array)
          let embedding: number[];
          if (Array.isArray(item.embedding)) {
            embedding = item.embedding;
          } else if (typeof item.embedding === 'string') {
            embedding = JSON.parse(item.embedding);
          } else {
            console.warn('[Deduplication] Unknown embedding type:', typeof item.embedding);
            continue;
          }

          // Validate embedding is array of numbers
          if (!Array.isArray(embedding) || embedding.length === 0) {
            console.warn('[Deduplication] Invalid embedding array for document', item.documentId);
            continue;
          }
        
          const similarity = embedder.cosineSimilarity(
            result.embedding,
            embedding
          );

          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            bestMatch = item;
          }
        } catch (itemError: any) {
          // Skip individual items that fail
          console.warn('[Deduplication] Error processing embedding:', itemError.message);
          continue;
        }
      }

      if (maxSimilarity >= threshold && bestMatch) {
        return {
          isDuplicate: true,
          duplicateOf: {
            id: bestMatch.documentId,
            title: bestMatch.documentTitle,
            hash: '',
            similarity: maxSimilarity
          },
          method: 'semantic'
        };
      }

      return { isDuplicate: false, method: 'none' };
    } catch (error: any) {
      console.error('[Deduplication] Semantic check failed:', error.message);
      return { isDuplicate: false, method: 'none' };
    }
  }

  /**
   * Check if content (file or text) is duplicate
   * Tries hash first (fast), then semantic (slower, more flexible)
   */
  async checkDuplicate(options: {
    filePath?: string;
    text?: string;
    tenantId?: number;
    enableSemantic?: boolean;
  }): Promise<DeduplicationResult> {
    const { filePath, text, tenantId = 1, enableSemantic = true } = options;

    // Hash check for files
    if (filePath) {
      const hash = await this.hashFile(filePath);
      const hashResult = await this.checkFileHash(hash, tenantId);
      if (hashResult.isDuplicate) {
        return hashResult;
      }
    }

    // Hash check for text
    if (text && text.length > 0) {
      const hash = this.hashText(text);
      const hashResult = await this.checkFileHash(hash, tenantId);
      if (hashResult.isDuplicate) {
        return hashResult;
      }

      // Semantic check (optional, slower)
      if (enableSemantic && text.length >= 100) {
        return await this.checkSemanticDuplicate(text, tenantId);
      }
    }

    return { isDuplicate: false, method: 'none' };
  }

  /**
   * Store content hash in document metadata
   * Call this when saving new document
   */
  async storeHash(documentId: number, hash: string): Promise<void> {
    const doc = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (doc.length > 0) {
      const metadata = doc[0].metadata || {};
      await db
        .update(documents)
        .set({
          metadata: {
            ...metadata,
            contentHash: hash
          } as any
        })
        .where(eq(documents.id, documentId));

      console.log(`[Deduplication] Stored hash for document ${documentId}`);
    }
  }
}

// Singleton instance
export const deduplicationService = new DeduplicationService();
