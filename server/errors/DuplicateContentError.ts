/**
 * DuplicateContentError - Structured error for content duplication detection
 * 
 * Purpose: Signal duplicate content detection in a type-safe way (vs string matching)
 * Prevents false positives from generic Error messages containing similar text
 */

export class DuplicateContentError extends Error {
  public readonly duplicateOfId: number | string;
  public readonly similarity: number;
  public readonly newContentPercent: number;
  public readonly reason: string;
  
  constructor(params: {
    duplicateOfId: number | string;
    similarity: number;
    newContentPercent: number;
    reason: string;
  }) {
    super(`Duplicate content detected: ${params.reason}`);
    this.name = 'DuplicateContentError';
    this.duplicateOfId = params.duplicateOfId;
    this.similarity = params.similarity;
    this.newContentPercent = params.newContentPercent;
    this.reason = params.reason;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DuplicateContentError);
    }
  }
}
