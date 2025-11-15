/**
 * TRAINING DATA DEDUPLICATION HELPER
 * P1.1 - Collection-layer 3-tier deduplication for training pipelines
 * 
 * ARCHITECT-APPROVED HYBRID STRATEGY:
 * - Storage layer (storage.createMessage): Exact-hash dedup (conversation+role+hash)
 * - Collection layer (THIS): 3-tier semantic dedup for training data
 * 
 * 3-TIER THRESHOLDS:
 * - Tier 1 (0.98): EXACT duplicates → reject immediately
 * - Tier 2 (0.92): HIGH similarity → flag for review / training dedup
 * - Tier 3 (0.88): NEAR similarity → collect but mark as borderline
 * 
 * USAGE:
 * - data-collector.ts: Filter chat ingestion training pairs
 * - dataset-generator.ts: Ensure dataset uniqueness before export
 */

import { generateContentHash, normalizeContent, cosineSimilarity } from './deduplication';
import { embedder } from '../rag/embedder';
import { db } from '../db';
import { trainingDataCollection } from '../../shared/schema';
import { eq, sql, and } from 'drizzle-orm';

export interface TrainingPair {
  input: string;
  output: string;
  metadata?: Record<string, any>;
}

export interface DedupResult {
  isDuplicate: boolean;
  tier: 'exact' | 'high' | 'near' | 'none';
  similarity: number;
  duplicateId?: number;
  action: 'reject' | 'flag' | 'collect' | 'accept';
}

export class TrainingDedupHelper {
  // 🔥 P1.1: 3-tier thresholds (architect-approved)
  private readonly THRESHOLD_EXACT = 0.98;  // 98% = EXACT duplicate → reject
  private readonly THRESHOLD_HIGH = 0.92;   // 92% = HIGH similarity → flag for dataset dedup
  private readonly THRESHOLD_NEAR = 0.88;   // 88% = NEAR similarity → collect but mark

  /**
   * Check if training pair is duplicate
   * Returns action recommendation based on similarity tier
   */
  async checkDuplicate(pair: TrainingPair): Promise<DedupResult> {
    try {
      // 🔥 TIER 1: Exact hash check (fastest)
      const inputHash = generateContentHash(pair.input);
      const outputHash = generateContentHash(pair.output);
      
      const exactMatch = await db
        .select({ id: trainingDataCollection.id })
        .from(trainingDataCollection)
        .where(
          and(
            sql`${trainingDataCollection.metadata}->>'inputHash' = ${inputHash}`,
            sql`${trainingDataCollection.metadata}->>'outputHash' = ${outputHash}`
          )
        )
        .limit(1);
      
      if (exactMatch.length > 0) {
        console.log(`[TrainingDedup] [TIER 1] Exact hash match found (ID: ${exactMatch[0].id})`);
        return {
          isDuplicate: true,
          tier: 'exact',
          similarity: 1.0,
          duplicateId: exactMatch[0].id,
          action: 'reject'
        };
      }
      
      // 🔥 TIER 2+3: Semantic similarity check
      const semanticResult = await this.checkSemanticDuplicate(pair);
      
      return semanticResult;
      
    } catch (error) {
      console.error(`[TrainingDedup] Error checking duplicate:`, error);
      // On error: accept to avoid blocking training pipeline
      return {
        isDuplicate: false,
        tier: 'none',
        similarity: 0,
        action: 'accept'
      };
    }
  }
  
  /**
   * Semantic similarity check with 3-tier thresholds
   */
  private async checkSemanticDuplicate(pair: TrainingPair): Promise<DedupResult> {
    // Skip semantic check for very short content (< 5 chars)
    if (pair.input.length < 5 || pair.output.length < 5) {
      return {
        isDuplicate: false,
        tier: 'none',
        similarity: 0,
        action: 'accept'
      };
    }
    
    try {
      // Generate embeddings for input+output concatenation
      const { truncateForEmbedding } = await import("../ai/embedding-sanitizer");
      const combinedText = truncateForEmbedding(
        `${pair.input}\n\n${pair.output}`,
        { purpose: 'training deduplication' }
      );
      
      const [queryEmbedding] = await embedder.generateEmbeddings([
        { text: combinedText, index: 0, tokens: Math.ceil(combinedText.length / 4) }
      ]);
      
      // ⚡ PERFORMANCE: Check top-200 most recent training items (balance speed vs coverage)
      const recentTraining = await db
        .select({
          id: trainingDataCollection.id,
          formattedData: trainingDataCollection.formattedData,
          metadata: trainingDataCollection.metadata
        })
        .from(trainingDataCollection)
        .orderBy(sql`${trainingDataCollection.createdAt} DESC`)
        .limit(200);
      
      let maxSimilarity = 0;
      let bestMatchId: number | undefined;
      
      // Calculate similarity against each existing training pair
      for (const existing of recentTraining) {
        // Skip if no formattedData
        if (!existing.formattedData || !Array.isArray(existing.formattedData) || existing.formattedData.length === 0) {
          continue;
        }
        
        // Check similarity against each training pair in formattedData array
        for (const trainingItem of existing.formattedData) {
          if (!trainingItem.instruction || !trainingItem.output) continue;
          
          // Generate embedding for existing item's combined text
          const existingCombinedText = truncateForEmbedding(
            `${trainingItem.instruction}\n\n${trainingItem.output}`,
            { purpose: 'training deduplication' }
          );
          
          const [existingEmbedding] = await embedder.generateEmbeddings([
            { text: existingCombinedText, index: 0, tokens: Math.ceil(existingCombinedText.length / 4) }
          ]);
          
          // Calculate cosine similarity
          const similarity = cosineSimilarity(
            queryEmbedding.embedding,
            existingEmbedding.embedding
          );
          
          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            bestMatchId = existing.id;
          }
        }
      }
      
      // 🔥 P1.1: Apply 3-tier thresholds
      if (maxSimilarity >= this.THRESHOLD_EXACT) {
        console.log(`[TrainingDedup] [TIER 1] Exact semantic match (${(maxSimilarity * 100).toFixed(1)}%, ID: ${bestMatchId})`);
        return {
          isDuplicate: true,
          tier: 'exact',
          similarity: maxSimilarity,
          duplicateId: bestMatchId,
          action: 'reject'
        };
      }
      
      if (maxSimilarity >= this.THRESHOLD_HIGH) {
        console.log(`[TrainingDedup] [TIER 2] High similarity (${(maxSimilarity * 100).toFixed(1)}%, ID: ${bestMatchId})`);
        return {
          isDuplicate: true,
          tier: 'high',
          similarity: maxSimilarity,
          duplicateId: bestMatchId,
          action: 'flag'
        };
      }
      
      if (maxSimilarity >= this.THRESHOLD_NEAR) {
        console.log(`[TrainingDedup] [TIER 3] Near similarity (${(maxSimilarity * 100).toFixed(1)}%, ID: ${bestMatchId})`);
        return {
          isDuplicate: false, // Not blocking, but flag it
          tier: 'near',
          similarity: maxSimilarity,
          duplicateId: bestMatchId,
          action: 'collect' // Collect but mark as borderline
        };
      }
      
      // UNIQUE: No significant similarity
      return {
        isDuplicate: false,
        tier: 'none',
        similarity: maxSimilarity,
        action: 'accept'
      };
      
    } catch (error) {
      console.error(`[TrainingDedup] Semantic check error:`, error);
      // On error: accept to avoid blocking
      return {
        isDuplicate: false,
        tier: 'none',
        similarity: 0,
        action: 'accept'
      };
    }
  }
  
  /**
   * Batch deduplication for dataset generation
   * Removes duplicates from a list of training pairs before export
   */
  async deduplicateBatch(pairs: TrainingPair[]): Promise<{
    unique: TrainingPair[];
    duplicates: TrainingPair[];
    stats: {
      total: number;
      unique: number;
      exactDuplicates: number;
      highSimilarity: number;
      nearSimilarity: number;
    };
  }> {
    const unique: TrainingPair[] = [];
    const duplicates: TrainingPair[] = [];
    const stats = {
      total: pairs.length,
      unique: 0,
      exactDuplicates: 0,
      highSimilarity: 0,
      nearSimilarity: 0
    };
    
    for (const pair of pairs) {
      const result = await this.checkDuplicate(pair);
      
      if (result.action === 'reject') {
        duplicates.push(pair);
        stats.exactDuplicates++;
      } else if (result.action === 'flag') {
        duplicates.push(pair);
        stats.highSimilarity++;
      } else if (result.action === 'collect') {
        unique.push(pair);
        stats.nearSimilarity++;
        stats.unique++;
      } else {
        unique.push(pair);
        stats.unique++;
      }
    }
    
    return { unique, duplicates, stats };
  }
}

// Singleton export
export const trainingDedupHelper = new TrainingDedupHelper();
