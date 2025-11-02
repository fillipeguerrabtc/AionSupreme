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
import { documents, embeddings, curationQueue } from '../../shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import * as fs from 'fs/promises';
import { embedder } from '../rag/embedder';
import { normalizeContent, generateContentHash, cosineSimilarity, getDuplicationStatus } from '../utils/deduplication';

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

  // ============================================================================
  // CURATION QUEUE DEDUPLICATION (Hybrid approach)
  // ============================================================================

  /**
   * TIER 1 - Realtime Hash Check (used when submitting to curation)
   * Checks if content hash exists in KB documents OR pending curation queue
   * <1ms execution time - suitable for realtime blocking
   * 
   * @param content - Raw text content
   * @param tenantId - Tenant ID
   * @returns Duplicate info if found, null otherwise
   */
  async checkCurationRealtimeDuplicate(
    content: string,
    tenantId: number = 1
  ): Promise<{ isDuplicate: boolean; documentId?: number; documentTitle?: string; isPending?: boolean } | null> {
    // Generate hash
    const hash = generateContentHash(content);

    // CRITICAL: Check BOTH documents (approved KB) AND curationQueue (pending items)

    // 1. Check if hash exists in KB documents (approved content)
    const existingDoc = await db
      .select({
        id: documents.id,
        title: documents.title,
      })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.contentHash, hash)
        )
      )
      .limit(1);

    if (existingDoc.length > 0) {
      console.log(`[Deduplication] ❌ Exact duplicate found in KB: "${existingDoc[0].title}" (ID: ${existingDoc[0].id})`);
      return {
        isDuplicate: true,
        documentId: existingDoc[0].id,
        documentTitle: existingDoc[0].title,
        isPending: false
      };
    }

    // 2. Check if hash exists in curation queue (pending/approved items)
    const existingQueue = await db
      .select({
        id: curationQueue.id,
        title: curationQueue.title,
        status: curationQueue.status
      })
      .from(curationQueue)
      .where(
        and(
          eq(curationQueue.tenantId, tenantId),
          eq(curationQueue.contentHash, hash),
          sql`${curationQueue.status} IN ('pending', 'approved')` // Don't block if rejected
        )
      )
      .limit(1);

    if (existingQueue.length > 0) {
      console.log(`[Deduplication] ❌ Exact duplicate found in curation queue: "${existingQueue[0].title}" (ID: ${existingQueue[0].id}, status: ${existingQueue[0].status})`);
      return {
        isDuplicate: true,
        documentId: undefined, // No doc ID yet (still in queue)
        documentTitle: existingQueue[0].title,
        isPending: true
      };
    }

    return null;
  }

  /**
   * TIER 2 - Batch Semantic Scan (on-demand via "Scan Duplicates" button)
   * Generates embeddings and compares with:
   * 1. KB documents (approved content)
   * 2. Other curation queue items (to detect duplicates WITHIN the queue)
   * Expensive operation - only run when explicitly requested
   * 
   * @param itemId - Curation queue item ID
   * @param tenantId - Tenant ID
   * @returns Duplication result with similarity score
   */
  async scanCurationItemSemanticDuplicates(
    itemId: string,
    tenantId: number = 1
  ): Promise<{
    duplicationStatus: 'unique' | 'exact' | 'near';
    similarityScore?: number;
    duplicateOfId?: number;
    duplicateOfTitle?: string;
  }> {
    // Get curation item
    const [item] = await db
      .select()
      .from(curationQueue)
      .where(eq(curationQueue.id, itemId))
      .limit(1);

    if (!item) {
      throw new Error(`Curation item ${itemId} not found`);
    }

    // Generate embedding for item content
    const [result] = await embedder.generateEmbeddings([
      { text: item.content, index: 0, tokens: Math.ceil(item.content.length / 4) }
    ]);

    // Get all KB document embeddings
    const kbEmbeddings = await db
      .select({
        documentId: embeddings.documentId,
        embedding: sql<number[]>`${embeddings.embedding}::jsonb`,
        documentTitle: documents.title,
        source: sql<string>`'kb'` // Mark as KB source
      })
      .from(embeddings)
      .innerJoin(documents, eq(embeddings.documentId, documents.id))
      .where(
        and(
          eq(embeddings.tenantId, tenantId),
          eq(documents.status, 'indexed')
        )
      )
      .limit(100);

    // Get other curation queue items with embeddings (exclude current item)
    const queueEmbeddings = await db
      .select({
        documentId: sql<number>`0`, // Placeholder (queue items don't have doc IDs yet)
        embedding: sql<number[]>`${curationQueue.embedding}::jsonb`,
        documentTitle: curationQueue.title,
        source: sql<string>`'queue'`, // Mark as queue source
        queueId: curationQueue.id // Keep track of queue ID
      })
      .from(curationQueue)
      .where(
        and(
          eq(curationQueue.tenantId, tenantId),
          eq(curationQueue.status, 'pending'),
          sql`${curationQueue.embedding} IS NOT NULL`, // Only items already scanned
          sql`${curationQueue.id} != ${itemId}` // Exclude current item
        )
      );

    // Combine both sources
    const allEmbeddings = [...kbEmbeddings, ...queueEmbeddings];

    // If no content to compare = unique
    if (allEmbeddings.length === 0) {
      await db
        .update(curationQueue)
        .set({
          duplicationStatus: 'unique',
          similarityScore: 0,
          duplicateOfId: null,
          embedding: result.embedding
        })
        .where(eq(curationQueue.id, itemId));

      return { duplicationStatus: 'unique', similarityScore: 0 };
    }

    // Find most similar item (from KB or queue)
    let maxSimilarity = 0;
    let bestMatch: typeof allEmbeddings[0] | null = null;

    for (const candidate of allEmbeddings) {
      try {
        if (!candidate.embedding || !Array.isArray(candidate.embedding)) continue;

        const similarity = cosineSimilarity(result.embedding, candidate.embedding);

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestMatch = candidate;
        }
      } catch (error) {
        console.warn('[Deduplication] Error comparing embeddings:', error);
        continue;
      }
    }

    // Determine status based on similarity
    const status = getDuplicationStatus(maxSimilarity);

    // Update curation queue item with results
    await db
      .update(curationQueue)
      .set({
        duplicationStatus: status,
        similarityScore: maxSimilarity,
        duplicateOfId: bestMatch && bestMatch.source === 'kb' ? String(bestMatch.documentId) : null,
        embedding: result.embedding
      })
      .where(eq(curationQueue.id, itemId));

    const source = bestMatch?.source === 'queue' ? 'curation queue' : 'KB';
    console.log(`[Deduplication] Scan complete for "${item.title}": ${status} (${(maxSimilarity * 100).toFixed(1)}% similar to "${bestMatch?.documentTitle}" in ${source})`);

    return {
      duplicationStatus: status,
      similarityScore: maxSimilarity,
      duplicateOfId: bestMatch?.documentId,
      duplicateOfTitle: bestMatch?.documentTitle
    };
  }

  /**
   * Scan ALL pending curation items for duplicates
   * Batch operation - runs in background
   * 
   * @param tenantId - Tenant ID
   * @returns Summary of scan results
   */
  async scanAllPendingCurationItems(tenantId: number = 1): Promise<{
    total: number;
    unique: number;
    exact: number;
    near: number;
    errors: number;
  }> {
    console.log('[Deduplication] Starting batch scan of pending curation items...');

    const pendingItems = await db
      .select()
      .from(curationQueue)
      .where(
        and(
          eq(curationQueue.tenantId, tenantId),
          eq(curationQueue.status, 'pending')
        )
      );

    const results = {
      total: pendingItems.length,
      unique: 0,
      exact: 0,
      near: 0,
      errors: 0
    };

    for (const item of pendingItems) {
      try {
        const scanResult = await this.scanCurationItemSemanticDuplicates(item.id, tenantId);
        
        if (scanResult.duplicationStatus === 'unique') results.unique++;
        else if (scanResult.duplicationStatus === 'exact') results.exact++;
        else if (scanResult.duplicationStatus === 'near') results.near++;
      } catch (error) {
        console.error(`[Deduplication] Error scanning item ${item.id}:`, error);
        results.errors++;
      }
    }

    console.log('[Deduplication] Batch scan complete:', results);
    return results;
  }
}

// Singleton instance
export const deduplicationService = new DeduplicationService();
