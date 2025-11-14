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
 * Rules:
 * - At least 10% new content
 * - At least 20 characters of new content (reduced from 50 to reduce false rejections)
 * - Maximum 50KB content size
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

  // Check minimum new content (20 chars - reduced from 50 to reduce false rejections)
  if (stats.extractedLength < 20) {
    return {
      shouldAbsorb: false,
      reason: `Insufficient new content (${stats.extractedLength} chars, minimum 20 chars required)`,
    };
  }

  // Check minimum percentage of new content (10%)
  if (stats.newContentPercent < 10) {
    return {
      shouldAbsorb: false,
      reason: `Requires at least 10% new content (${stats.newContentPercent}% found) and minimum 20 chars (${stats.extractedLength} found)`,
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
 * @returns Complete analysis with validation
 */
export function analyzeAbsorption(
  kbContent: string,
  curationContent: string
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
} {
  // Extract unique content
  const { extractedContent, originalContent, stats } = extractUniqueContent(
    kbContent,
    curationContent
  );

  // Validate if absorption should proceed
  const validation = validateAbsorption(stats);

  return {
    shouldAbsorb: validation.shouldAbsorb,
    extractedContent,
    originalContent,
    stats,
    reason: validation.reason,
  };
}
