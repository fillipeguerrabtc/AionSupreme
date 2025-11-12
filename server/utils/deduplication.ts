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
 * CRITICAL: This is the SINGLE source of truth for content_hash generation
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
 * CENTRALIZED Document Preparation for Database Insertion
 * 
 * Ensures content_hash is populated before ANY document insert.
 * Use this wrapper in ALL insert paths to prevent duplicates:
 * - storage.createDocument()
 * - curation approvals
 * - bulk imports
 * - migrations
 * 
 * @param document - Document to prepare
 * @returns Document with guaranteed content_hash
 */
export function prepareDocumentForInsert(document: any): any {
  return {
    ...document,
    contentHash: document.contentHash || generateContentHash(document.content || ''),
  };
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
 * Simple sentence-based diff approach - preserves original formatting
 * Production-safe: no memory issues, preserves data integrity
 */

/**
 * ULTRA-SIMPLE LINE-BY-LINE DIFF
 * Philosophy: "Simple is Sophisticated"
 * 
 * Extracts lines that are unique to newText (not in existingText)
 * - Splits by newlines only
 * - Normalizes for comparison (lowercase, trim)
 * - Returns ORIGINAL lines (preserves formatting!)
 * - Zero risk of corruption
 * 
 * @param newText - New document submission
 * @param existingText - Existing KB content
 * @returns Unique lines (original formatting preserved)
 */
export function extractUniqueLines(newText: string, existingText: string): {
  uniqueLines: string[];
  duplicateLines: string[];
  totalLines: number;
} {
  // Split into lines (preserve empty lines for now)
  const newLines = newText.split('\n');
  const existingLines = existingText.split('\n');
  
  // Build normalized set for fast lookup (lowercase + trim whitespace)
  const existingNormalized = new Set(
    existingLines
      .map(line => normalizeContent(line))
      .filter(line => line.length > 0) // Ignore empty lines in existing
  );
  
  const uniqueLines: string[] = [];
  const duplicateLines: string[] = [];
  
  for (const line of newLines) {
    const normalized = normalizeContent(line);
    
    // Skip empty lines
    if (normalized.length === 0) {
      continue;
    }
    
    // Check if line exists in KB (normalized comparison)
    if (existingNormalized.has(normalized)) {
      duplicateLines.push(line);
    } else {
      uniqueLines.push(line); // Save ORIGINAL line (with formatting!)
    }
  }
  
  return {
    uniqueLines,
    duplicateLines,
    totalLines: newLines.filter(l => normalizeContent(l).length > 0).length
  };
}

/**
 * Result of partial duplication analysis
 */
export interface PartialDuplicationAnalysis {
  isDuplicate: boolean;
  isPartialDuplicate: boolean;
  shouldAbsorb: boolean;
  extractedContent: string;
  originalLength: number;
  extractedLength: number;
  reason: string;
  uniqueLinesCount?: number;
  totalLinesCount?: number;
  duplicateLinesCount?: number;
}

/**
 * Analyzes partial duplication with LINE-BY-LINE diff
 * ULTRA-SIMPLE: "Simple is Sophisticated"
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
): PartialDuplicationAnalysis {
  // Only process near-duplicates (85-98% similar)
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
  
  // Performance limit: max 50KB per document
  if (candidateText.length > 50000 || existingText.length > 50000) {
    return {
      isDuplicate: false,
      isPartialDuplicate: false,
      shouldAbsorb: false,
      extractedContent: candidateText,
      originalLength: candidateText.length,
      extractedLength: candidateText.length,
      reason: 'Document too large for absorption (max 50KB). Please review manually.'
    };
  }
  
  // Extract unique lines (ULTRA-SIMPLE!)
  const extraction = extractUniqueLines(candidateText, existingText);
  
  // No unique lines = full duplicate
  if (extraction.uniqueLines.length === 0) {
    return {
      isDuplicate: true,
      isPartialDuplicate: false,
      shouldAbsorb: false,
      extractedContent: candidateText,
      originalLength: candidateText.length,
      extractedLength: candidateText.length,
      reason: 'All lines are duplicated - nothing new to extract'
    };
  }
  
  // Join unique lines with newlines (preserves structure!)
  const mergedContent = extraction.uniqueLines.join('\n').trim();
  
  // Only absorb if at least 10% is new content AND min 50 chars
  const absorptionRatio = extraction.uniqueLines.length / extraction.totalLines;
  const absorptionWorthwhile = mergedContent.length >= 50 && absorptionRatio >= 0.1;
  
  if (!absorptionWorthwhile) {
    return {
      isDuplicate: false,
      isPartialDuplicate: true,
      shouldAbsorb: false,
      extractedContent: candidateText,
      originalLength: candidateText.length,
      extractedLength: candidateText.length,
      reason: `Only ${extraction.uniqueLines.length} of ${extraction.totalLines} lines are new (${Math.round(absorptionRatio * 100)}%). Too small to justify absorption.`
    };
  }
  
  return {
    isDuplicate: false,
    isPartialDuplicate: true,
    shouldAbsorb: true,
    extractedContent: mergedContent,
    originalLength: candidateText.length,
    extractedLength: mergedContent.length,
    uniqueLinesCount: extraction.uniqueLines.length,
    totalLinesCount: extraction.totalLines,
    duplicateLinesCount: extraction.duplicateLines.length,
    reason: `Extracted ${extraction.uniqueLines.length} unique lines out of ${extraction.totalLines} total (${Math.round(absorptionRatio * 100)}% new content)`
  };
}
