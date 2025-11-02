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
 * Simple sentence-based diff approach - preserves original formatting
 * Production-safe: no memory issues, preserves data integrity
 */

/**
 * Semantic unit with type metadata for structure-preserving reconstruction
 */
interface SemanticUnit {
  text: string;
  type: 'paragraph_start' | 'bullet' | 'sentence' | 'sentence_in_list';
}

/**
 * Splits text into semantic units (sentences, bullets, headings, paragraphs)
 * PRODUCTION-READY: Handles Markdown, lists, paragraphs, numbered items
 * Preserves original formatting and punctuation WITH metadata for reconstruction
 * 
 * Split hierarchy:
 * 1. Paragraphs (double newlines) → marked as paragraph_start
 * 2. Bullets/numbers → marked as bullet
 * 3. Sentences in bullets → marked as sentence_in_list
 * 4. Regular sentences → marked as sentence
 */
function splitIntoSemanticUnits(text: string): SemanticUnit[] {
  const units: SemanticUnit[] = [];
  
  // Step 1: Split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p);
  
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];
    const isFirstUnit = units.length === 0;
    
    // Step 2: Split by single newlines (may contain bullets/numbered lists)
    const lines = para.split(/\n/).map(l => l.trim()).filter(l => l);
    
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const isFirstInParagraph = li === 0;
      
      // Check if line is a bullet/numbered list item
      const isBulletOrNumber = /^(\*|-|\+|\d+\.|\d+\))\s/.test(line);
      
      if (isBulletOrNumber) {
        // Mark first bullet in paragraph as paragraph_start if new paragraph
        const type: SemanticUnit['type'] = (isFirstInParagraph && !isFirstUnit && pi > 0) 
          ? 'paragraph_start' 
          : 'bullet';
        units.push({ text: line, type });
      } else {
        // Split on sentence endings: . ! ? : ; followed by space/end
        const sentences = line
          .split(/(?<=[.!?:;])\s+/)
          .map(s => s.trim())
          .filter(s => s);
        
        for (let si = 0; si < sentences.length; si++) {
          const sent = sentences[si];
          const isFirstSentence = si === 0;
          
          // Mark appropriately based on context
          let type: SemanticUnit['type'];
          if (isFirstSentence && isFirstInParagraph && !isFirstUnit && pi > 0) {
            type = 'paragraph_start'; // New paragraph boundary
          } else {
            type = 'sentence';
          }
          
          units.push({ text: sent, type });
        }
      }
    }
  }
  
  return units;
}

/**
 * Reconstructs text from semantic units preserving structure
 * Adds appropriate delimiters based on unit type metadata
 */
function reconstructText(units: SemanticUnit[]): string {
  if (units.length === 0) return '';
  
  const result: string[] = [];
  
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    const prevUnit = i > 0 ? units[i - 1] : null;
    
    // Add appropriate delimiter before this unit
    if (i > 0) {
      if (unit.type === 'paragraph_start') {
        result.push('\n\n'); // Paragraph break
      } else if (unit.type === 'bullet') {
        result.push('\n'); // Newline before bullet
      } else if (prevUnit?.type === 'bullet' && unit.type === 'sentence') {
        result.push('\n'); // Newline after bullet before sentence
      } else {
        result.push(' '); // Regular space between sentences
      }
    }
    
    result.push(unit.text);
  }
  
  return result.join('');
}

/**
 * Finds semantic units that are unique to newText (not in existingText)
 * Uses exact matching on normalized text but PRESERVES original formatting + structure
 * 
 * @param newText - New submission
 * @param existingText - Existing content in KB
 * @returns Object with unique units (with metadata for reconstruction)
 */
export function extractUniqueSentences(newText: string, existingText: string): {
  uniqueSentences: SemanticUnit[];
  commonSentences: SemanticUnit[];
  totalOriginalSentences: number;
} {
  const newUnits = splitIntoSemanticUnits(newText);
  const existingUnits = splitIntoSemanticUnits(existingText);
  
  // Normalize for comparison (but keep original units with metadata)
  const existingNormalized = new Set(existingUnits.map(u => normalizeContent(u.text)));
  
  const uniqueSentences: SemanticUnit[] = [];
  const commonSentences: SemanticUnit[] = [];
  
  for (const unit of newUnits) {
    const normalized = normalizeContent(unit.text);
    if (existingNormalized.has(normalized)) {
      commonSentences.push(unit);
    } else {
      uniqueSentences.push(unit); // Keep original formatting + structure metadata!
    }
  }
  
  return {
    uniqueSentences,
    commonSentences,
    totalOriginalSentences: newUnits.length
  };
}

/**
 * Analyzes partial duplication with sentence-level diff
 * PRODUCTION-SAFE: Preserves original formatting, no memory issues
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
  
  const extraction = extractUniqueSentences(candidateText, existingText);
  
  // No unique sentences = full duplicate
  if (extraction.uniqueSentences.length === 0) {
    return {
      isDuplicate: true,
      isPartialDuplicate: false,
      shouldAbsorb: false,
      extractedContent: candidateText,
      originalLength: candidateText.length,
      extractedLength: candidateText.length,
      reason: 'All sentences are duplicated - nothing new to extract'
    };
  }
  
  // Reconstruct from unique units (preserves original formatting + structure!)
  const mergedContent = reconstructText(extraction.uniqueSentences);
  
  // Only absorb if at least 10% is new content AND min 50 chars
  const absorptionRatio = extraction.uniqueSentences.length / extraction.totalOriginalSentences;
  const absorptionWorthwhile = mergedContent.length >= 50 && absorptionRatio >= 0.1;
  
  if (!absorptionWorthwhile) {
    return {
      isDuplicate: false,
      isPartialDuplicate: true,
      shouldAbsorb: false,
      extractedContent: candidateText,
      originalLength: candidateText.length,
      extractedLength: candidateText.length,
      reason: `Only ${extraction.uniqueSentences.length} of ${extraction.totalOriginalSentences} sentences are new (${Math.round(absorptionRatio * 100)}%). Too small to justify absorption.`
    };
  }
  
  return {
    isDuplicate: false,
    isPartialDuplicate: true,
    shouldAbsorb: true,
    extractedContent: mergedContent,
    originalLength: candidateText.length,
    extractedLength: mergedContent.length,
    reason: `Extracted ${extraction.uniqueSentences.length} unique sentences out of ${extraction.totalOriginalSentences} total (${Math.round(absorptionRatio * 100)}% new content)`
  };
}
