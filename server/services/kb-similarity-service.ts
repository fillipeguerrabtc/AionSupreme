/**
 * KB SIMILARITY SERVICE - Find semantically similar KB content
 * 
 * Used by auto-approval service to check if a new query
 * has similar content already approved in the knowledge base.
 * 
 * 🔥 P0.5: Semantic reuse gate for cost optimization
 * - Query has low score (40-69)
 * - Query has high frequency (≥3x)
 * - Query is similar to approved KB (similarity ≥ 0.88)
 * → Auto-approve to reduce external API costs
 */

import { db } from "../db";
import { documents } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

export interface KBSimilarityResult {
  documentId: number;
  similarity: number;
  content: string;
  namespace: string;
  title: string;
}

export class KBSimilarityService {
  /**
   * Find approved KB documents similar to the given embedding
   * 
   * @param embedding - Query embedding (1536-dim OpenAI vector)
   * @param namespace - Namespace to search within (namespace isolation)
   * @param threshold - Minimum cosine similarity (default 0.88)
   * @returns Top approved document with similarity >= threshold, or null
   */
  async findApprovedSimilar(
    embedding: number[],
    namespace: string,
    threshold: number = 0.88
  ): Promise<KBSimilarityResult | null> {
    if (embedding.length === 0) {
      console.warn(`[KBSimilarity] Empty embedding provided, skipping search`);
      return null;
    }

    try {
      // CRITICAL: pgvector search for approved documents in namespace
      // Uses cosine distance operator (<=>)
      // 1 - cosine_distance = cosine_similarity
      const vectorLiteral = `[${embedding.join(',')}]`;
      
      // Query documents table directly with vector similarity
      // Filter: status='indexed' (approved KB items), namespace matches
      // 🔥 FIX: Use JSON operators correctly (-> for JSONB, ->> for TEXT extraction)
      const results = await db.execute(sql`
        SELECT 
          id as document_id,
          1 - (content_embedding <=> ${vectorLiteral}::vector) as similarity,
          content,
          COALESCE((metadata->'namespaces'->>0), 'geral') as namespace,
          title
        FROM documents
        WHERE status = 'indexed'
          AND content_embedding IS NOT NULL
          AND (metadata->'namespaces') @> ${JSON.stringify([namespace])}::jsonb
        ORDER BY content_embedding <=> ${vectorLiteral}::vector
        LIMIT 5
      `);

      // Check if top result exceeds similarity threshold
      if (results.rows.length > 0) {
        const topMatch = results.rows[0] as any;
        const similarity = parseFloat(topMatch.similarity);
        
        if (similarity >= threshold) {
          console.log(`[KBSimilarity] ✅ Found approved KB match (similarity: ${(similarity * 100).toFixed(1)}%, doc: ${topMatch.document_id})`);
          
          return {
            documentId: topMatch.document_id,
            similarity,
            content: topMatch.content || '',
            namespace: topMatch.namespace || namespace,
            title: topMatch.title || 'Untitled',
          };
        } else {
          console.log(`[KBSimilarity] ⚠️ Top match below threshold (similarity: ${(similarity * 100).toFixed(1)}% < ${(threshold * 100).toFixed(1)}%)`);
        }
      } else {
        console.log(`[KBSimilarity] No approved KB documents found in namespace "${namespace}"`);
      }

      return null;
    } catch (error: any) {
      console.error(`[KBSimilarity] Search error:`, error.message);
      return null;
    }
  }

  /**
   * Batch find similar KB documents for multiple queries
   * (Future optimization for bulk operations)
   */
  async findApprovedSimilarBatch(
    embeddings: number[][],
    namespace: string,
    threshold: number = 0.88
  ): Promise<(KBSimilarityResult | null)[]> {
    return Promise.all(
      embeddings.map(embedding => 
        this.findApprovedSimilar(embedding, namespace, threshold)
      )
    );
  }
}

export const kbSimilarityService = new KBSimilarityService();
