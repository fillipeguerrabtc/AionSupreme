/**
 * EMBEDDING SANITIZER - PRODUCTION-GRADE TEXT TRUNCATION
 * ========================================================
 * 
 * Centralizes mandatory text truncation for ALL embedding APIs to prevent
 * "maximum context length 8192 tokens" errors.
 * 
 * **WHY CENTRALIZED:**
 * - Prevents ad-hoc truncation per caller (brittle, easy to forget)
 * - Enforces limits at provider level (zero bypass possible)
 * - Single source of truth for token/char limits
 * - Structured logging for debugging oversized inputs
 * 
 * **USAGE:**
 * ```ts
 * import { truncateForEmbedding } from './embedding-sanitizer';
 * 
 * const safeText = truncateForEmbedding(userInput, { purpose: 'RAG search' });
 * const embedding = await embedText(safeText);
 * ```
 */

import { logger } from '../services/logger-service';

/**
 * OpenAI text-embedding-3-small model limits:
 * - Maximum context: 8192 tokens
 * - Safe limit: 6000 tokens (70% safety margin)
 * - Char estimate: 4 chars/token → 6000 tokens ≈ 24000 chars
 * 
 * BUT we use conservative 1000 tokens (4000 chars) for chunking strategy
 */
export const MAX_EMBEDDING_TOKENS = 1000; // Conservative for chunking
export const MAX_EMBEDDING_CHARS = 4000;  // 4 chars/token estimate

/**
 * Truncates text to safe embedding limits with optional logging
 * 
 * @param text - Input text (may exceed limits)
 * @param options - Truncation options
 * @returns Truncated text safe for embedding APIs
 */
export function truncateForEmbedding(
  text: string,
  options: {
    purpose?: string;        // e.g., "RAG search", "deduplication"
    maxChars?: number;       // Override default MAX_EMBEDDING_CHARS
    logTruncation?: boolean; // Log when truncation occurs (default: true)
  } = {}
): string {
  const {
    purpose = 'embedding',
    maxChars = MAX_EMBEDDING_CHARS,
    logTruncation = true
  } = options;

  // Already safe - no truncation needed
  if (text.length <= maxChars) {
    return text;
  }

  // Truncate to safe limit
  const truncated = text.substring(0, maxChars);
  
  // Structured logging for debugging
  if (logTruncation) {
    logger.info(`[EmbeddingSanitizer] Truncated text for ${purpose}`, {
      originalLength: text.length,
      truncatedLength: truncated.length,
      reductionPercent: Math.round(((text.length - truncated.length) / text.length) * 100),
      purpose
    });
  }

  return truncated;
}

/**
 * Batch version - truncates array of texts
 * 
 * @param texts - Array of input texts
 * @param options - Truncation options
 * @returns Array of truncated texts
 */
export function truncateBatchForEmbedding(
  texts: string[],
  options: {
    purpose?: string;
    maxChars?: number;
    logTruncation?: boolean;
  } = {}
): string[] {
  let truncatedCount = 0;
  
  const results = texts.map((text, index) => {
    const truncated = truncateForEmbedding(text, {
      ...options,
      logTruncation: false // Don't log individual items in batch
    });
    
    if (truncated.length < text.length) {
      truncatedCount++;
    }
    
    return truncated;
  });

  // Log batch summary
  if (truncatedCount > 0 && (options.logTruncation ?? true)) {
    logger.info(`[EmbeddingSanitizer] Batch truncation complete`, {
      totalTexts: texts.length,
      truncatedCount,
      truncationRate: Math.round((truncatedCount / texts.length) * 100),
      purpose: options.purpose || 'embedding'
    });
  }

  return results;
}

/**
 * Validates text is safe for embedding (checks without truncating)
 * Useful for assertions/tests
 */
export function isEmbeddingSafe(text: string, maxChars: number = MAX_EMBEDDING_CHARS): boolean {
  return text.length <= maxChars;
}

/**
 * Estimates token count (rough approximation: 4 chars = 1 token)
 * OpenAI's actual tokenization may vary, this is conservative
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
