/**
 * ERROR HANDLING MIDDLEWARE - PRODUCTION-GRADE
 * ============================================
 * 
 * Centralized error handling for Express routes.
 * 
 * FEATURES:
 * ✅ Catch all errors (sync + async)
 * ✅ Map errors to HTTP status codes
 * ✅ Structured error responses
 * ✅ Error logging with context
 * ✅ Stack traces in development
 * ✅ Sanitized responses in production
 * ✅ Operational vs programming error detection
 * 
 * USAGE:
 * ```ts
 * import { errorHandler, asyncHandler } from './middleware/error-handler';
 * 
 * app.get('/api/agents/:id', asyncHandler(async (req, res) => {
 *   const agent = await getAgent(req.params.id);
 *   if (!agent) throw new NotFoundError('Agent not found');
 *   res.json(agent);
 * }));
 * 
 * app.use(errorHandler);
 * ```
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError, isOperationalError, getErrorMessage } from '../errors/app-errors';
import { logger } from '../services/logger-service';

const log = logger.child('ErrorHandler');

/**
 * Async route handler wrapper - catches async errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware
 * 
 * Must be registered AFTER all routes:
 * app.use(errorHandler);
 */
export function errorHandler(
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Extract error details
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  const message = getErrorMessage(error);
  const context = error instanceof AppError ? error.context : undefined;

  // Log error
  const requestId = (req as any).id || 'unknown';
  
  if (statusCode >= 500) {
    log.error(`Request failed`, error, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      code,
      context,
    });
  } else {
    log.warn(`Request failed`, {
      requestId,
      method: req.method,
      path: req.path,
      statusCode,
      code,
      message,
      context,
    });
  }

  // Build response
  const isDev = process.env.NODE_ENV !== 'production';
  const response: any = {
    error: {
      code,
      message,
    },
  };

  // Add context if available
  if (context) {
    response.error.context = context;
  }

  // Add stack trace in development
  if (isDev && error.stack) {
    response.error.stack = error.stack;
  }

  // Send response
  res.status(statusCode).json(response);

  // REMOVED: Automatic process.exit on programming errors
  // Rationale: Single uncaught library/DB error shouldn't kill entire process
  // Production orchestrators (Cloud Run, Kubernetes) handle restart automatically
  // For true fatal errors (OOM, corrupted state), Node will crash naturally
  
  // Still log fatal errors for monitoring/alerting
  if (!isOperationalError(error)) {
    log.fatal('Programming error detected - investigate immediately', error, {
      requestId,
      method: req.method,
      path: req.path,
    });
    // Consider: Send alert to PagerDuty/Sentry here
  }
}

/**
 * 404 Not Found handler
 * 
 * Register AFTER all routes but BEFORE error handler:
 * app.use(notFoundHandler);
 * app.use(errorHandler);
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
    },
  });
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = Math.random().toString(36).substring(7);
  (req as any).id = requestId;

  const startTime = Date.now();
  const requestLog = log.withRequest(requestId);

  requestLog.info('Request received', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    requestLog.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
    });
  });

  next();
}
