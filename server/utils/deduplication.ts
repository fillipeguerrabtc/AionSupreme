import crypto from 'crypto';

/**
 * Deduplication Utilities - Hybrid approach (hash + embeddings)
 * 
 * TIER 1 (Realtime): SHA256 hash for exact duplicate detection (<1ms)
 * TIER 2 (Batch): OpenAI embeddings for semantic similarity (on-demand)
 */

/**
 * Normalizes text content for consistent hashing and comparison
 * - Converts to lowercase
 * - Trims whitespace
 * - Removes multiple spaces
 * - Removes special characters (keeps alphanumeric + basic punctuation)
 */
export function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Multiple spaces → single space
    .replace(/[^\w\s.,!?;:()\-]/g, ''); // Keep only alphanumeric + basic punctuation
}

/**
 * Generates SHA256 hash from normalized content
 * Used for O(1) exact duplicate detection
 * 
 * @param content - Raw text content
 * @returns 64-character hex SHA256 hash
 */
export function generateContentHash(content: string): string {
  const normalized = normalizeContent(content);
  return crypto
    .createHash('sha256')
    .update(normalized, 'utf8')
    .digest('hex');
}

/**
 * Calculates cosine similarity between two embedding vectors
 * 
 * @param vecA - First embedding vector
 * @param vecB - Second embedding vector
 * @returns Similarity score (0-1), where 1 is identical
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector dimensions must match: ${vecA.length} vs ${vecB.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Determines duplication status based on similarity score
 * 
 * Thresholds:
 * - >0.98: Exact duplicate (semantically identical)
 * - 0.85-0.98: Near duplicate (paraphrase/similar)
 * - <0.85: Unique content
 * 
 * @param similarity - Cosine similarity score (0-1)
 * @returns Duplication status
 */
export function getDuplicationStatus(similarity: number): 'exact' | 'near' | 'unique' {
  if (similarity > 0.98) return 'exact';
  if (similarity >= 0.85) return 'near';
  return 'unique';
}

/**
 * Validates content hash format (64-char hex SHA256)
 */
export function isValidHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/.test(hash);
}
