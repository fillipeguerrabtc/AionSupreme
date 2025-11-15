/**
 * ABSORPTION ALGORITHM - Line-by-Line Diff Extraction
 * 
 * Philosophy: "Simple is Sophisticated"
 * After 4 architect rejections of complex sentence-level approaches,
 * this implements ultra-simple line-by-line comparison.
 * 
 * Algorithm:
 * 1. Split both texts into lines
 * 2. Normalize each line for comparison (lowercase, trim, no punctuation)
 * 3. Compare normalized versions to find duplicates
 * 4. PRESERVE original formatting in output (normalization only for matching)
 * 5. Extract only unique lines from new content
 * 
 * Validations:
 * - Minimum 10% new content
 * - Minimum 20 characters of new content (reduced from 50 to reduce false rejections)
 * - Maximum 50KB content size
 * - Skip exact duplicates (>98% similar)
 */

/**
 * Normalize a line for comparison (case-insensitive, no extra whitespace, no punctuation)
 * ONLY used for comparison - original formatting is preserved in output
 */
function normalizeLine(line: string): string {
  return line
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Collapse multiple spaces
}

/**
 * Extract unique lines from curation content that don't exist in KB document
 * 
 * @param kbContent - Original KB document content
 * @param curationContent - New curation item content
 * @returns Object with extracted content and statistics
 */
export function extractUniqueContent(
  kbContent: string,
  curationContent: string
): {
  extractedContent: string;
  originalContent: string;
  stats: {
    originalLength: number;
    extractedLength: number;
    uniqueLines: number;
    totalLines: number;
    duplicateLines: number;
    reductionPercent: number;
    newContentPercent: number;
  };
} {
  // Split into lines (preserve original)
  const kbLines = kbContent.split('\n');
  const curationLines = curationContent.split('\n');

  // Normalize KB lines for comparison
  const normalizedKbLines = new Set(kbLines.map(normalizeLine));

  // Extract unique lines (preserving original formatting!)
  const uniqueLines: string[] = [];
  for (const originalLine of curationLines) {
    const normalized = normalizeLine(originalLine);
    
    // Skip empty lines in normalized form
    if (!normalized) continue;
    
    // If this normalized line doesn't exist in KB, keep ORIGINAL line
    if (!normalizedKbLines.has(normalized)) {
      uniqueLines.push(originalLine);
    }
  }

  // Build extracted content (join with newlines, preserve original formatting)
  const extractedContent = uniqueLines.join('\n');

  // Calculate statistics
  const originalLength = curationContent.length;
  const extractedLength = extractedContent.length;
  const totalLines = curationLines.filter(l => normalizeLine(l)).length; // Non-empty lines
  const uniqueLinesCount = uniqueLines.length;
  const duplicateLines = totalLines - uniqueLinesCount;
  const reductionPercent = originalLength > 0 
    ? Math.round(((originalLength - extractedLength) / originalLength) * 100)
    : 0;
  const newContentPercent = originalLength > 0
    ? Math.round((extractedLength / originalLength) * 100)
    : 0;

  return {
    extractedContent,
    originalContent: curationContent,
    stats: {
      originalLength,
      extractedLength,
      uniqueLines: uniqueLinesCount,
      totalLines,
      duplicateLines,
      reductionPercent,
      newContentPercent,
    },
  };
}

/**
 * Validate if absorption should proceed based on content analysis
 * 
 * Rules (UPDATED 2025-11-15 - more permissive to avoid rejecting useful content):
 * - At least 5% new content (reduced from 10% to consolidate similar content)
 * - At least 15 characters of new content (reduced from 20 to capture minor additions)
 * - Maximum 50KB content size
 * 
 * RATIONALE: Similar content (0.78-0.87 similarity) should be consolidated, not rejected.
 * Even small additions (5-10% new) can add value and should be merged into KB.
 */
export function validateAbsorption(stats: {
  extractedLength: number;
  newContentPercent: number;
  originalLength: number;
}): {
  shouldAbsorb: boolean;
  reason: string;
} {
  // Check content size limit (50KB)
  if (stats.originalLength > 50 * 1024) {
    return {
      shouldAbsorb: false,
      reason: `Content too large (${stats.originalLength} chars, max 50KB)`,
    };
  }

  // Check minimum new content (15 chars - reduced from 20 to capture minor additions)
  if (stats.extractedLength < 15) {
    return {
      shouldAbsorb: false,
      reason: `Insufficient new content (${stats.extractedLength} chars, minimum 15 chars required)`,
    };
  }

  // Check minimum percentage of new content (5% - reduced from 10% to consolidate similar content)
  if (stats.newContentPercent < 5) {
    return {
      shouldAbsorb: false,
      reason: `Requires at least 5% new content (${stats.newContentPercent}% found) and minimum 15 chars (${stats.extractedLength} found)`,
    };
  }

  return {
    shouldAbsorb: true,
    reason: `Valid absorption: ${stats.newContentPercent}% new content (${stats.extractedLength} chars)`,
  };
}

/**
 * Analyze absorption potential for a curation item vs KB document
 * 
 * @param kbContent - Original KB document content
 * @param curationContent - New curation item content
 * @param similarity - Optional semantic similarity score (0-1) for forced consolidation
 * @returns Complete analysis with validation
 * 
 * 🔥 FORCED CONSOLIDATION RULE (2025-11-15):
 * If similarity is in range 0.80-0.88 (similar but not exact), FORCE absorption
 * regardless of newContentPercent. This prevents "similar but not duplicate" 
 * content from creating separate KB entries (the gap that architect identified).
 */
export function analyzeAbsorption(
  kbContent: string,
  curationContent: string,
  similarity?: number
): {
  shouldAbsorb: boolean;
  extractedContent: string;
  originalContent: string;
  stats: {
    originalLength: number;
    extractedLength: number;
    uniqueLines: number;
    totalLines: number;
    duplicateLines: number;
    reductionPercent: number;
    newContentPercent: number;
  };
  reason: string;
  forcedConsolidation?: boolean;
} {
  // Extract unique content
  const { extractedContent, originalContent, stats } = extractUniqueContent(
    kbContent,
    curationContent
  );

  // 🔥 FORCED CONSOLIDATION for similarity range 0.80-0.88
  // Prevents gap where similar-but-not-exact content bypasses both dedup and absorption
  if (similarity && similarity >= 0.80 && similarity < 0.88) {
    return {
      shouldAbsorb: true,
      extractedContent,
      originalContent,
      stats,
      reason: `Forced consolidation: ${(similarity * 100).toFixed(1)}% similarity (0.80-0.88 range) - bypassing ${stats.newContentPercent}% threshold to prevent duplicate KB entries`,
      forcedConsolidation: true,
    };
  }

  // Validate if absorption should proceed (normal rules)
  const validation = validateAbsorption(stats);

  return {
    shouldAbsorb: validation.shouldAbsorb,
    extractedContent,
    originalContent,
    stats,
    reason: validation.reason,
    forcedConsolidation: false,
  };
}
