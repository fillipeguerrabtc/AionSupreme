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
        sql`${documents.metadata}->>'contentHash' = ${hash}`
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
   * ⚡ PERFORMANCE: Top-200 limit para evitar scan massivo
   * 🔥 VERIFICAÇÃO: KB + CURADORIA (100 cada)
   * 
   * NOTE: Para produção com KB grande (>10k docs), usar pgvector com índices IVFFlat/HNSW
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

      // ⚡ PERFORMANCE FIX: Limitar a 100 embeddings de cada fonte
      // TODO: Implementar pgvector + IVFFlat index para top-k otimizado em KB grande

      // 🔥 VERIFICAÇÃO 1: KB aprovada (top 100 mais recentes)
      const similarKB = await db
        .select({
          documentId: embeddings.documentId,
          chunkText: embeddings.chunkText,
          embedding: embeddings.embedding,
          documentTitle: documents.title,
          source: sql<string>`'kb'`
        })
        .from(embeddings)
        .innerJoin(documents, eq(embeddings.documentId, documents.id))
        .where(
          eq(documents.status, 'indexed')
        )
        .orderBy(sql`${embeddings.id} DESC`) // Mais recentes primeiro
        .limit(100);

      // 🔥 VERIFICAÇÃO 2: Fila de curadoria (top 100 pendentes)
      const similarCuration = await db
        .select({
          documentId: sql<string>`${curationQueue.id}::text`,
          chunkText: curationQueue.content,
          embedding: curationQueue.embedding,
          documentTitle: curationQueue.title,
          source: sql<string>`'curation'`
        })
        .from(curationQueue)
        .where(
          and(
            eq(curationQueue.status, 'pending'),
            sql`${curationQueue.embedding} IS NOT NULL`
          )
        )
        .orderBy(sql`${curationQueue.submittedAt} DESC`) // Mais recentes primeiro
        .limit(100);

      // Combinar resultados (máx 200 comparações)
      const similar = [...similarKB, ...similarCuration];

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
            id: typeof bestMatch.documentId === 'string' ? parseInt(bestMatch.documentId) || 0 : bestMatch.documentId,
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
   * 🧠 INTELLIGENT SEMANTIC DEDUPLICATION (2025 Best Practices)
   * 
   * 4-Gate Tiered Detection System:
   * - Gate 1: Exact hash lookup (O(1), <1ms)
   * - Gate 2: pgvector ANN search (semantic similarity)
   * - Gate 3: LLM adjudication for borderline cases (0.95-0.98)
   * - Gate 4: Return embedding for reuse (avoid regeneration)
   * 
   * @param content - Raw text content
   * @param contentHash - Pre-computed SHA256 hash
   * @param normalizedContent - Pre-normalized text
   * @param options - Configuration options
   * @returns Duplicate info with method used, or null if unique
   */
  async checkCurationRealtimeDuplicate(
    content: string,
    contentHash: string,
    normalizedContent: string,
    options: {
      tenantId?: number;
      enableSemantic?: boolean;
      similarityThresholds?: {
        exact: number;      // ≥0.98 = exact duplicate
        borderline: number; // 0.95-0.98 = needs LLM verification
      };
    } = {}
  ): Promise<{
    isDuplicate: boolean;
    documentId?: number;
    documentTitle?: string;
    isPending?: boolean;
    method: 'hash' | 'semantic' | 'llm' | 'none';
    similarity?: number;
    embedding?: number[]; // Return for reuse by caller
  } | null> {
    const {
      tenantId = 1,
      enableSemantic = true, // MVP: enabled by default
      similarityThresholds = {
        exact: 0.98,       // ≥98% = exact duplicate (architect-approved: raised from 0.90 to reduce false positives)
        borderline: 0.95   // 95-98% = LLM verification needed (architect-approved: raised from 0.80 for precision)
      }
    } = options;

    console.log(`[Dedup] 🧠 Starting tiered detection for hash: ${contentHash.substring(0, 12)}...`);

    // =====================================================================
    // TIER 1: EXACT HASH LOOKUP (O(1), <1ms)
    // =====================================================================
    console.log(`[Dedup] → Tier 1: Checking exact hash in KB...`);
    
    const existingDoc = await db
      .select({
        id: documents.id,
        title: documents.title,
      })
      .from(documents)
      .where(eq(documents.contentHash, contentHash))
      .limit(1);

    if (existingDoc.length > 0) {
      console.log(`[Dedup] ❌ EXACT duplicate in KB: "${existingDoc[0].title}"`);
      return {
        isDuplicate: true,
        documentId: existingDoc[0].id,
        documentTitle: existingDoc[0].title,
        isPending: false,
        method: 'hash',
      };
    }

    console.log(`[Dedup] → Tier 1: Checking exact hash in curation queue...`);
    
    const existingQueue = await db
      .select({
        id: curationQueue.id,
        title: curationQueue.title,
        status: curationQueue.status
      })
      .from(curationQueue)
      .where(
        and(
          eq(curationQueue.contentHash, contentHash),
          sql`${curationQueue.status} IN ('pending', 'approved')`
        )
      )
      .limit(1);

    if (existingQueue.length > 0) {
      console.log(`[Dedup] ❌ EXACT duplicate in queue: "${existingQueue[0].title}"`);
      return {
        isDuplicate: true,
        documentId: undefined,
        documentTitle: existingQueue[0].title,
        isPending: true,
        method: 'hash',
      };
    }

    console.log(`[Dedup] ✅ Tier 1 passed: No exact hash match`);

    // =====================================================================
    // TIER 2: SEMANTIC SIMILARITY (pgvector ANN search)
    // =====================================================================
    if (!enableSemantic || content.length < 100) {
      console.log(`[Dedup] ⏩ Skipping semantic check (too short or disabled)`);
      return null; // No duplicate found
    }

    console.log(`[Dedup] → Tier 2: Generating embedding for semantic search...`);
    
    let queryEmbedding: number[];
    try {
      const [result] = await embedder.generateEmbeddings([
        { text: content, index: 0, tokens: Math.ceil(content.length / 4) }
      ]);
      queryEmbedding = result.embedding;
      console.log(`[Dedup] ✅ Embedding generated (${queryEmbedding.length} dimensions)`);
    } catch (error: any) {
      console.error(`[Dedup] ❌ Embedding generation failed:`, error.message);
      return null; // Degrade gracefully - don't block insert
    }

    // Query pgvector for similar items (top 15)
    console.log(`[Dedup] → Tier 2: Searching pgvector for similar items...`);
    
    // Format embedding as pgvector literal: '[1,2,3]' (string with quotes + square brackets)
    const embeddingLiteral = `'[${queryEmbedding.join(',')}]'`;
    
    const similarItems = await db.execute(sql`
      SELECT 
        id,
        title,
        content,
        content_hash,
        status,
        (embedding <=> ${sql.raw(embeddingLiteral)}::vector) as distance
      FROM curation_queue
      WHERE embedding IS NOT NULL
      AND status IN ('pending', 'approved')
      AND content_hash != ${contentHash}
      ORDER BY embedding <=> ${sql.raw(embeddingLiteral)}::vector
      LIMIT 15
    `);

    if (similarItems.rows.length === 0) {
      console.log(`[Dedup] ✅ Tier 2: No similar items found - returning embedding for persistence`);
      return {
        isDuplicate: false,
        method: 'none',
        embedding: queryEmbedding, // Return embedding for caller to persist
      };
    }

    // Calculate cosine similarity (distance → similarity)
    const bestMatch = similarItems.rows[0] as any;
    const similarity = 1 - bestMatch.distance; // pgvector <=> gives distance, we want similarity
    
    // 📊 INSTRUMENTATION: Log metrics for debugging
    const queryNorm = Math.sqrt(queryEmbedding.reduce((sum, val) => sum + val * val, 0));
    console.log(`[Dedup] 📊 METRICS: similarity=${(similarity * 100).toFixed(2)}%, queryNorm=${queryNorm.toFixed(4)}, bestMatchHash=${bestMatch.content_hash?.substring(0, 12)}...`);
    console.log(`[Dedup] → Best match: "${bestMatch.title.substring(0, 50)}..." (similarity: ${(similarity * 100).toFixed(1)}%)`);

    // =====================================================================
    // TIER 3: THRESHOLD LOGIC + LLM ADJUDICATION
    // =====================================================================
    
    // Exact semantic duplicate (≥98%) - BUG #13 FIX: INFO não ERROR!
    if (similarity >= similarityThresholds.exact) {
      console.log(`[Dedup] ℹ️  SEMANTIC duplicate detected (${(similarity * 100).toFixed(1)}% ≥ ${similarityThresholds.exact * 100}%) - skipping to avoid duplication`);
      return {
        isDuplicate: true,
        documentId: undefined,
        documentTitle: bestMatch.title,
        isPending: true,
        method: 'semantic',
        similarity,
        embedding: queryEmbedding, // Return for reuse
      };
    }

    // Borderline case (95-98%) - needs LLM verification
    if (similarity >= similarityThresholds.borderline) {
      console.log(`[Dedup] ⚠️  BORDERLINE similarity (${(similarity * 100).toFixed(1)}%) - invoking LLM adjudicator...`);
      
      const llmVerdict = await this.llmDuplicateAdjudicator(
        content,
        bestMatch.content,
        similarity
      );

      if (llmVerdict.isDuplicate) {
        console.log(`[Dedup] ❌ LLM confirmed duplicate: ${llmVerdict.reason}`);
        return {
          isDuplicate: true,
          documentId: undefined,
          documentTitle: bestMatch.title,
          isPending: true,
          method: 'llm',
          similarity,
          embedding: queryEmbedding,
        };
      } else {
        console.log(`[Dedup] ✅ LLM rejected duplicate: ${llmVerdict.reason}`);
      }
    }

    // Not a duplicate, but return embedding for caller to store
    console.log(`[Dedup] ✅ Content is UNIQUE (similarity: ${(similarity * 100).toFixed(1)}%) - returning embedding for persistence`);
    return {
      isDuplicate: false,
      method: 'none',
      similarity,
      embedding: queryEmbedding,
    };
  }

  /**
   * LLM Adjudicator for borderline duplicate cases (85-92% similarity)
   * Uses GPT-4o-mini for fast, cheap, deterministic judgments
   */
  private async llmDuplicateAdjudicator(
    candidateText: string,
    existingText: string,
    similarity: number
  ): Promise<{
    isDuplicate: boolean;
    confidence: number;
    reason: string;
  }> {
    try {
      // Use OpenAI directly for fast adjudication
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      
      const prompt = `You are a duplicate detection AI. Compare these two texts and determine if they are semantically duplicate (same meaning, even if worded differently).

**Candidate Text:**
${candidateText.substring(0, 1000)}

**Existing Text:**
${existingText.substring(0, 1000)}

**Semantic Similarity:** ${(similarity * 100).toFixed(1)}%

Respond ONLY with valid JSON:
{
  "isDuplicate": true or false,
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation why they are/aren't duplicates"
}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a duplicate detection AI. Respond only with valid JSON. No markdown formatting.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.1, // Low temperature for consistent judgments
      });

      // Parse JSON response
      const content = response.choices[0]?.message?.content || '{}';
      // Remove markdown code blocks if present
      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const verdict = JSON.parse(cleanedContent);
      
      return {
        isDuplicate: verdict.isDuplicate ?? false,
        confidence: verdict.confidence ?? 0,
        reason: verdict.reason ?? 'No reason provided'
      };
    } catch (error: any) {
      console.error(`[Dedup] LLM adjudicator failed:`, error.message);
      // Degrade gracefully - assume NOT duplicate on LLM failure
      return {
        isDuplicate: false,
        confidence: 0,
        reason: `LLM verification failed: ${error.message}`
      };
    }
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
        eq(documents.status, 'indexed')
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
        eq(curationQueue.status, 'pending')
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
