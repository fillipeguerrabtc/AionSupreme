/**
 * ERROR RECOVERY PATTERNS - PRODUCTION-GRADE
 * ==========================================
 * 
 * Reusable patterns for resilient error handling.
 * 
 * FEATURES:
 * ✅ Retry with exponential backoff
 * ✅ Circuit breaker pattern
 * ✅ Timeout protection
 * ✅ Graceful degradation
 * ✅ Fallback strategies
 * 
 * USAGE:
 * ```ts
 * import { retry, withTimeout, circuitBreaker } from './services/error-recovery';
 * 
 * // Retry with backoff
 * const result = await retry(
 *   () => fetchExternalAPI(),
 *   { maxRetries: 3, backoff: 'exponential' }
 * );
 * 
 * // Timeout protection
 * const result = await withTimeout(
 *   () => slowOperation(),
 *   5000, // 5 seconds
 *   'Operation timeout'
 * );
 * 
 * // Circuit breaker
 * const breaker = circuitBreaker(
 *   () => unreliableService(),
 *   { failureThreshold: 5, resetTimeout: 60000 }
 * );
 * ```
 */

import { logger } from './logger-service';
import { TimeoutError, ServiceUnavailableError } from '../errors/app-errors';

const log = logger.child('ErrorRecovery');

export interface RetryOptions {
  maxRetries?: number;
  backoff?: 'linear' | 'exponential';
  initialDelay?: number;
  maxDelay?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    backoff = 'exponential',
    initialDelay = 1000,
    maxDelay = 30000,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (attempt === maxRetries) {
        log.error(`Retry failed after ${maxRetries} attempts`, error);
        throw error;
      }

      // Calculate delay
      const delay = backoff === 'exponential'
        ? Math.min(initialDelay * Math.pow(2, attempt), maxDelay)
        : initialDelay * (attempt + 1);

      log.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`, {
        error: error.message,
      });

      // Callback
      if (onRetry) {
        onRetry(error, attempt + 1);
      }

      // Wait
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Execute function with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message: string = 'Operation timeout'
): Promise<T> {
  return Promise.race([
    fn(),
    sleep(timeoutMs).then(() => {
      throw new TimeoutError(message, { timeout: timeoutMs });
    }),
  ]);
}

/**
 * Circuit breaker pattern
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening
  resetTimeout?: number; // Time to wait before retrying (ms)
  onStateChange?: (state: CircuitState) => void;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export function circuitBreaker<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  options: CircuitBreakerOptions = {}
): (...args: T) => Promise<R> {
  const {
    failureThreshold = 5,
    resetTimeout = 60000,
    onStateChange,
  } = options;

  let state: CircuitState = 'closed';
  let failureCount = 0;
  let lastFailureTime = 0;

  return async (...args: T): Promise<R> => {
    // Check if circuit should reset
    if (state === 'open') {
      const timeSinceFailure = Date.now() - lastFailureTime;
      if (timeSinceFailure >= resetTimeout) {
        log.info('Circuit breaker half-open - attempting reset');
        setState('half-open');
      } else {
        throw new ServiceUnavailableError('Circuit breaker open', {
          state,
          failureCount,
          resetIn: resetTimeout - timeSinceFailure,
        });
      }
    }

    try {
      const result = await fn(...args);

      // Success - reset failure count ALWAYS (not just when half-open)
      // This ensures the breaker tracks current health, not cumulative failures
      if (failureCount > 0 || state !== 'closed') {
        log.info('Circuit breaker success', { 
          previousFailures: failureCount,
          state 
        });
      }
      
      failureCount = 0; // CRITICAL: Reset on every success
      
      if (state === 'half-open') {
        log.info('Circuit breaker closed - service recovered');
        setState('closed');
      }

      return result;

    } catch (error: any) {
      failureCount++;
      lastFailureTime = Date.now();

      log.warn('Circuit breaker failure', {
        failureCount,
        threshold: failureThreshold,
        state,
      });

      // Open circuit if threshold reached
      if (failureCount >= failureThreshold) {
        log.error('Circuit breaker opened', { failureCount, threshold: failureThreshold });
        setState('open');
      }

      throw error;
    }
  };

  function setState(newState: CircuitState): void {
    if (state !== newState) {
      state = newState;
      if (onStateChange) {
        onStateChange(newState);
      }
    }
  }
}

/**
 * Fallback value on error
 */
export async function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T | (() => T | Promise<T>)
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    log.warn('Using fallback value', { error: error.message });
    return typeof fallback === 'function' ? await (fallback as any)() : fallback;
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
