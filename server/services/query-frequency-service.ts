/**
 * QUERY FREQUENCY SERVICE - Semantic similarity-based query tracking
 * 
 * Best Practice 2025: Track query frequency using EMBEDDINGS for semantic matching
 * - "Bom dia" = "Olá" = "E aí" = "Oi, tudo bem?" (all greetings)
 * - Enables cost-optimization via intelligent content reuse
 * 
 * Architecture:
 * 1. Normalize query (lowercase, trim, punctuation removal)
 * 2. Generate OpenAI embedding (1536 dims)
 * 3. Check semantic similarity with existing queries (cosine > 0.92)
 * 4. If similar → increment existing, else create new
 * 5. Track hit_count with exponential decay
 */

import { db } from "../db";
import { userQueryFrequency } from "@shared/schema";
import { eq, sql, desc } from "drizzle-orm";
import crypto from "crypto";

export interface QueryFrequencyResult {
  queryHash: string;
  normalizedQuery: string;
  hitCount: number;
  effectiveCount: number; // hitCount * decayFactor
  firstSeenAt: Date;
  lastSeenAt: Date;
  daysSinceFirst: number;
  daysSinceLast: number;
}

export class QueryFrequencyService {
  private SEMANTIC_THRESHOLD = 0.92; // Cosine similarity > 0.92 = same intent
  private DECAY_BASE = 0.95; // 0.95^days

  /**
   * Normalize query for consistent hashing (MULTILINGUAL-SAFE)
   * Preserves Unicode characters (Arabic, Chinese, Japanese, Russian, Hindi, etc.)
   * Best Practice 2025: Unicode-aware normalization for global multi-language support
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      // Remove ONLY common ASCII punctuation, PRESERVE Unicode letters/numbers
      .replace(/[.,!?;:"""''()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  /**
   * Generate SHA-256 hash of normalized query
   */
  private hashQuery(normalized: string): string {
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Generate OpenAI embedding for semantic similarity
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const { llmClient } = await import("../model/llm-client");
      const embeddings = await llmClient.generateEmbeddings([text]);
      return embeddings[0] || [];
    } catch (error: any) {
      console.error(`[QueryFrequency] Embedding generation failed:`, error.message);
      return []; // Fallback to hash-only matching
    }
  }

  /**
   * Find semantically similar query in database
   * Returns query if cosine similarity > threshold
   */
  private async findSimilarQuery(
    embedding: number[],
    namespace?: string
  ): Promise<typeof userQueryFrequency.$inferSelect | null> {
    if (embedding.length === 0) return null;

    try {
      // Query for top 5 most similar queries using vector cosine distance
      const results = await db.execute(sql`
        SELECT *, 1 - (query_embedding <=> ${JSON.stringify(embedding)}::vector) as similarity
        FROM user_query_frequency
        ${namespace ? sql`WHERE namespace = ${namespace}` : sql``}
        WHERE query_embedding IS NOT NULL
        ORDER BY query_embedding <=> ${JSON.stringify(embedding)}::vector
        LIMIT 5
      `);

      // Check if top result exceeds similarity threshold
      if (results.rows.length > 0) {
        const topMatch = results.rows[0] as any;
        if (topMatch.similarity >= this.SEMANTIC_THRESHOLD) {
          console.log(`[QueryFrequency] 🎯 Semantic match found (similarity: ${(topMatch.similarity * 100).toFixed(1)}%)`);
          return topMatch;
        }
      }

      return null;
    } catch (error: any) {
      console.error(`[QueryFrequency] Similarity search failed:`, error.message);
      return null;
    }
  }

  /**
   * Track query frequency with semantic similarity matching
   * 
   * Flow:
   * 1. Normalize + hash query
   * 2. Generate embedding
   * 3. Search for semantically similar queries
   * 4. If found → increment count, else create new entry
   */
  async track(
    query: string,
    namespace?: string,
    conversationId?: string
  ): Promise<void> {
    try {
      const normalized = this.normalizeQuery(query);
      const hash = this.hashQuery(normalized);
      const embedding = await this.generateEmbedding(normalized);

      // Try to find semantically similar query
      const similar = await this.findSimilarQuery(embedding, namespace);

      if (similar) {
        // Increment existing similar query
        await db
          .update(userQueryFrequency)
          .set({
            hitCount: sql`${userQueryFrequency.hitCount} + 1`,
            lastSeenAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userQueryFrequency.id, similar.id));

        console.log(`[QueryFrequency] ✅ Incremented similar query (ID: ${similar.id}, count: ${similar.hitCount + 1})`);
      } else {
        // Create new query entry
        await db.insert(userQueryFrequency).values({
          queryHash: hash,
          normalizedQuery: normalized,
          queryEmbedding: embedding.length > 0 ? JSON.stringify(embedding) : null,
          hitCount: 1,
          namespace: namespace || null,
          conversationId: conversationId || null,
          metadata: {},
        } as any);

        console.log(`[QueryFrequency] 📝 New query tracked: "${normalized.substring(0, 50)}..."`);
      }
    } catch (error: any) {
      console.error(`[QueryFrequency] Track error:`, error.message);
      // Non-critical - don't throw
    }
  }

  /**
   * Get frequency data for a query (with semantic matching)
   * Returns effective count (hitCount * decayFactor)
   */
  async getFrequency(query: string, namespace?: string): Promise<QueryFrequencyResult | null> {
    try {
      const normalized = this.normalizeQuery(query);
      const embedding = await this.generateEmbedding(normalized);

      // Find semantically similar query
      const similar = await this.findSimilarQuery(embedding, namespace);

      if (!similar) return null;

      const now = new Date();
      const daysSinceFirst = Math.floor((now.getTime() - new Date(similar.firstSeenAt).getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceLast = Math.floor((now.getTime() - new Date(similar.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24));

      // Calculate decay factor
      const decayFactor = Math.pow(this.DECAY_BASE, daysSinceLast);
      const effectiveCount = Math.round(similar.hitCount * decayFactor);

      return {
        queryHash: similar.queryHash,
        normalizedQuery: similar.normalizedQuery,
        hitCount: similar.hitCount,
        effectiveCount,
        firstSeenAt: new Date(similar.firstSeenAt),
        lastSeenAt: new Date(similar.lastSeenAt),
        daysSinceFirst,
        daysSinceLast,
      };
    } catch (error: any) {
      console.error(`[QueryFrequency] Get frequency error:`, error.message);
      return null;
    }
  }

  /**
   * Apply exponential decay to all query counts (nightly job)
   */
  async applyDecay(): Promise<void> {
    try {
      const result = await db.execute(sql`
        UPDATE user_query_frequency
        SET decay_factor = POWER(${this.DECAY_BASE}, EXTRACT(DAY FROM NOW() - last_seen_at)::numeric),
            updated_at = NOW()
        WHERE last_seen_at < NOW() - INTERVAL '1 day'
      `);

      console.log(`[QueryFrequency] 🔄 Decay applied to query frequencies`);

      // Delete ancient low-value records (>90 days, <2 hits)
      await db.execute(sql`
        DELETE FROM user_query_frequency
        WHERE last_seen_at < NOW() - INTERVAL '90 days'
          AND hit_count < 2
      `);

      console.log(`[QueryFrequency] 🗑️  Cleaned up stale query records`);
    } catch (error: any) {
      console.error(`[QueryFrequency] Decay error:`, error.message);
    }
  }
}

export const queryFrequencyService = new QueryFrequencyService();
