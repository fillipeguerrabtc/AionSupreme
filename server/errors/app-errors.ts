/**
 * APPLICATION ERROR CLASSES - PRODUCTION-GRADE
 * ============================================
 * 
 * Standardized error hierarchy for consistent error handling across AION.
 * 
 * FEATURES:
 * ✅ Type-safe error classes
 * ✅ HTTP status code mapping
 * ✅ Error codes for client handling
 * ✅ Structured error context
 * ✅ Stack trace preservation
 * ✅ Serialization for API responses
 * 
 * USAGE:
 * ```ts
 * throw new NotFoundError('Agent not found', { agentId });
 * throw new ValidationError('Invalid input', { field: 'email' });
 * throw new UnauthorizedError('Access denied');
 * ```
 */

export interface ErrorContext {
  [key: string]: any;
}

/**
 * Base application error
 */
export abstract class AppError extends Error {
  abstract get statusCode(): number;
  abstract get code(): string;
  readonly context?: ErrorContext;
  readonly isOperational: boolean = true; // Expected errors vs programming errors

  constructor(message: string, context?: ErrorContext) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize error for API response
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        context: this.context,
      },
    };
  }
}

/**
 * 400 Bad Request - Invalid input/validation
 */
export class ValidationError extends AppError {
  get statusCode() { return 400; }
  get code() { return 'VALIDATION_ERROR'; }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
  get statusCode() { return 401; }
  get code() { return 'UNAUTHORIZED'; }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class ForbiddenError extends AppError {
  get statusCode() { return 403; }
  get code() { return 'FORBIDDEN'; }
}

/**
 * 404 Not Found - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  get statusCode() { return 404; }
  get code() { return 'NOT_FOUND'; }
}

/**
 * 409 Conflict - Resource conflict (e.g., duplicate)
 */
export class ConflictError extends AppError {
  get statusCode() { return 409; }
  get code() { return 'CONFLICT'; }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  get statusCode() { return 429; }
  get code() { return 'RATE_LIMIT_EXCEEDED'; }
}

/**
 * 500 Internal Server Error - Unexpected error
 */
export class InternalError extends AppError {
  get statusCode() { return 500; }
  get code() { return 'INTERNAL_ERROR'; }
  readonly isOperational = false; // Programming error
}

/**
 * 503 Service Unavailable - External service down
 */
export class ServiceUnavailableError extends AppError {
  get statusCode() { return 503; }
  get code() { return 'SERVICE_UNAVAILABLE'; }
}

/**
 * 504 Gateway Timeout - External service timeout
 */
export class TimeoutError extends AppError {
  get statusCode() { return 504; }
  get code() { return 'TIMEOUT'; }
}

/**
 * GPU-specific errors
 */
export class GPUNotFoundError extends NotFoundError {
  get code() { return 'GPU_NOT_FOUND'; }
}

export class GPUUnavailableError extends ServiceUnavailableError {
  get code() { return 'GPU_UNAVAILABLE'; }
}

export class GPUProvisioningError extends InternalError {
  get code() { return 'GPU_PROVISIONING_FAILED'; }
}

/**
 * Agent-specific errors
 */
export class AgentNotFoundError extends NotFoundError {
  get code() { return 'AGENT_NOT_FOUND'; }
}

export class AgentBudgetExceededError extends ForbiddenError {
  get code() { return 'AGENT_BUDGET_EXCEEDED'; }
}

/**
 * Knowledge base errors
 */
export class DocumentNotFoundError extends NotFoundError {
  get code() { return 'DOCUMENT_NOT_FOUND'; }
}

export class EmbeddingError extends InternalError {
  get code() { return 'EMBEDDING_FAILED'; }
}

/**
 * Training errors
 */
export class TrainingJobNotFoundError extends NotFoundError {
  get code() { return 'TRAINING_JOB_NOT_FOUND'; }
}

export class TrainingJobFailedError extends InternalError {
  get code() { return 'TRAINING_JOB_FAILED'; }
}

/**
 * Utility: Check if error is operational (expected) vs programming error
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Utility: Extract error context safely
 */
export function getErrorContext(error: unknown): ErrorContext {
  if (error instanceof AppError) {
    return error.context || {};
  }
  return {};
}

/**
 * Utility: Get error message safely
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
