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

/**
 * PARTIAL CONTENT ABSORPTION UTILITIES
 * Extract new content from partially duplicated submissions
 */

/**
 * Finds the longest common substring between two texts
 * Uses dynamic programming (O(n*m) complexity)
 * 
 * @param text1 - First text
 * @param text2 - Second text
 * @returns Object with common substring and its positions
 */
export function findLongestCommonSubstring(text1: string, text2: string): {
  common: string;
  start1: number;
  start2: number;
  length: number;
} {
  const normalized1 = normalizeContent(text1);
  const normalized2 = normalizeContent(text2);
  
  const m = normalized1.length;
  const n = normalized2.length;
  
  let maxLength = 0;
  let endIndex1 = 0;
  
  // DP table for LCS
  const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (normalized1[i - 1] === normalized2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLength) {
          maxLength = dp[i][j];
          endIndex1 = i;
        }
      }
    }
  }
  
  if (maxLength === 0) {
    return { common: '', start1: -1, start2: -1, length: 0 };
  }
  
  const start1 = endIndex1 - maxLength;
  const common = normalized1.substring(start1, endIndex1);
  const start2 = normalized2.indexOf(common);
  
  return { common, start1, start2, length: maxLength };
}

/**
 * Extracts new/unique content from a partially duplicated text
 * 
 * @param newText - New submission (potentially partially duplicate)
 * @param existingText - Existing content in KB or queue
 * @returns Object with extracted new content and metadata
 */
export function extractNewContent(newText: string, existingText: string): {
  hasNewContent: boolean;
  newParts: string[];
  commonPart: string;
  mergedContent: string;
  absorptionWorthwhile: boolean;
} {
  const { common, start1, length } = findLongestCommonSubstring(newText, existingText);
  
  // No significant common part = completely unique
  if (length < 20) { // Minimum 20 chars to consider as duplicate
    return {
      hasNewContent: true,
      newParts: [newText],
      commonPart: '',
      mergedContent: newText,
      absorptionWorthwhile: false // Not a partial duplicate, it's unique
    };
  }
  
  const normalized = normalizeContent(newText);
  
  // Extract parts before and after common substring
  const partBefore = normalized.substring(0, start1).trim();
  const partAfter = normalized.substring(start1 + length).trim();
  
  const newParts = [partBefore, partAfter].filter(p => p.length > 0);
  
  // Calculate if absorption is worthwhile
  // Only worth if new content is at least 10% of original and > 10 chars
  const totalNewLength = newParts.join(' ').length;
  const absorptionWorthwhile = totalNewLength >= 10 && totalNewLength >= length * 0.1;
  
  return {
    hasNewContent: newParts.length > 0,
    newParts,
    commonPart: common,
    mergedContent: newParts.join(' '),
    absorptionWorthwhile
  };
}

/**
 * Analyzes partial duplication and suggests absorption
 * 
 * @param candidateText - New submission to analyze
 * @param existingText - Existing content
 * @param similarityScore - Semantic similarity score (0-1)
 * @returns Analysis result with absorption recommendation
 */
export function analyzePartialDuplication(
  candidateText: string,
  existingText: string,
  similarityScore: number
): {
  isDuplicate: boolean;
  isPartialDuplicate: boolean;
  shouldAbsorb: boolean;
  extractedContent: string;
  originalLength: number;
  extractedLength: number;
  reason: string;
} {
  // Only analyze near-duplicates (85-98% similar)
  if (similarityScore < 0.85 || similarityScore > 0.98) {
    return {
      isDuplicate: similarityScore > 0.98,
      isPartialDuplicate: false,
      shouldAbsorb: false,
      extractedContent: candidateText,
      originalLength: candidateText.length,
      extractedLength: candidateText.length,
      reason: similarityScore > 0.98 
        ? 'Exact duplicate - no absorption possible' 
        : 'Unique content - no absorption needed'
    };
  }
  
  const extraction = extractNewContent(candidateText, existingText);
  
  if (!extraction.absorptionWorthwhile) {
    return {
      isDuplicate: false,
      isPartialDuplicate: true,
      shouldAbsorb: false,
      extractedContent: candidateText,
      originalLength: candidateText.length,
      extractedLength: candidateText.length,
      reason: 'New content too small to justify absorption'
    };
  }
  
  return {
    isDuplicate: false,
    isPartialDuplicate: true,
    shouldAbsorb: true,
    extractedContent: extraction.mergedContent,
    originalLength: candidateText.length,
    extractedLength: extraction.mergedContent.length,
    reason: `Absorbed ${extraction.newParts.length} new part(s) from partial duplicate`
  };
}
