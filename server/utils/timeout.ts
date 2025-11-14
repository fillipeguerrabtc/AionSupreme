/**
 * 🔥 PRODUCTION-GRADE TIMEOUT UTILITIES
 * 
 * Enterprise-level timeout helpers with AbortController support
 * - Promise.race wrapper with automatic cleanup
 * - Custom TimeoutError for deterministic error handling
 * - AbortSignal propagation for fetch cancellation
 * 
 * Best Practices 2025:
 * - AbortController over setTimeout for cancellable promises
 * - Named error classes for error classification
 * - Automatic cleanup to prevent memory leaks
 */

import { log } from './logger';

// ============================================================================
// CUSTOM ERROR CLASSES
// ============================================================================

/**
 * TimeoutError - Thrown when promise exceeds timeout
 * Allows deterministic error handling vs generic errors
 */
export class TimeoutError extends Error {
  constructor(message: string, public timeoutMs: number, public operation: string) {
    super(message);
    this.name = 'TimeoutError';
    Error.captureStackTrace(this, TimeoutError);
  }
}

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

export interface TimeoutOptions {
  /**
   * Timeout duration in milliseconds
   */
  timeoutMs: number;
  
  /**
   * Operation name for logging/error messages
   */
  operation: string;
  
  /**
   * Optional AbortController to propagate signal to fetch/API calls
   * If provided, will be aborted when timeout fires
   */
  abortController?: AbortController;
  
  /**
   * Enable debug logging (default: false)
   */
  debug?: boolean;
}

/**
 * Wraps a promise with timeout + AbortController support
 * 
 * Features:
 * - Automatic cleanup (clearTimeout on success/failure)
 * - AbortSignal propagation for fetch cancellation
 * - Deterministic TimeoutError for error classification
 * - Structured logging for observability
 * 
 * @example
 * ```typescript
 * const controller = new AbortController();
 * const result = await withTimeout(
 *   fetch('/api/data', { signal: controller.signal }),
 *   { timeoutMs: 5000, operation: 'fetch-data', abortController: controller }
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  const { timeoutMs, operation, abortController, debug = false } = options;
  
  let timeoutId: NodeJS.Timeout | null = null;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (debug) {
        log.warn({ component: 'timeout', operation, timeoutMs }, 'Operation timed out');
      }
      
      // Abort fetch/API calls if controller provided
      if (abortController) {
        abortController.abort();
      }
      
      reject(new TimeoutError(
        `Operation '${operation}' timed out after ${timeoutMs}ms`,
        timeoutMs,
        operation
      ));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    
    // Success - cleanup timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    return result;
  } catch (error) {
    // Error or timeout - cleanup timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    throw error;
  }
}

// ============================================================================
// CIRCUIT BREAKER SUPPORT
// ============================================================================

/**
 * Simple deadline helper - wraps operation with absolute time limit
 * Returns null if deadline exceeded, otherwise result
 * 
 * Useful for orchestration-level deadlines
 */
export async function withDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
  operation: string
): Promise<T | null> {
  try {
    return await withTimeout(promise, { timeoutMs: deadlineMs, operation });
  } catch (error) {
    if (error instanceof TimeoutError) {
      log.warn({ component: 'deadline', operation, deadlineMs }, 'Deadline exceeded');
      return null;
    }
    throw error; // Re-throw non-timeout errors
  }
}
