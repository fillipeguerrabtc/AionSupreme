/**
 * Error Helper Utilities
 * Provides type-safe error handling for production-ready applications
 */

/**
 * Extracts error message from unknown error object
 * Handles Error instances, strings, and unknown types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error occurred';
}

/**
 * Extracts error stack from unknown error object
 * Returns stack trace for Error instances, undefined otherwise
 */
export function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Type guard to check if error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if error has a specific property
 */
export function hasProperty<K extends string>(
  error: unknown,
  prop: K
): error is Record<K, unknown> {
  return typeof error === 'object' && error !== null && prop in error;
}

/**
 * Safely extracts error details for logging
 * Returns object with message, stack, and original error
 */
export function getErrorDetails(error: unknown): {
  message: string;
  stack?: string;
  original: unknown;
} {
  return {
    message: getErrorMessage(error),
    stack: getErrorStack(error),
    original: error
  };
}
