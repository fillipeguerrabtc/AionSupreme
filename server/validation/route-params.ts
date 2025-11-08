/**
 * ✅ FIX P0-2: Route Parameter Validation Schemas
 * 
 * Centralizes Zod schemas for validating route parameters across all endpoints.
 * Prevents SQL injection by ensuring parameters are properly validated before use.
 * 
 * USAGE:
 * ```ts
 * const result = idParamSchema.safeParse(req.params);
 * if (!result.success) {
 *   return res.status(400).json({ error: 'Invalid ID' });
 * }
 * const { id } = result.data;
 * ```
 */

import { z } from 'zod';

// ============================================================================
// COMMON PARAMETER SCHEMAS
// ============================================================================

/**
 * Validates numeric ID parameters (serial/integer PKs)
 * Ensures: positive integer, not NaN, safe integer range
 */
export const idParamSchema = z.object({
  id: z.coerce.number()
    .int('ID must be an integer')
    .positive('ID must be positive')
    .safe('ID must be within safe integer range'),
});

/**
 * Validates UUID parameters (varchar PKs)
 * Ensures: valid UUID v4 format
 */
export const uuidParamSchema = z.object({
  id: z.string()
    .uuid('ID must be a valid UUID'),
});

/**
 * Validates slug parameters (alphanumeric + hyphens)
 * Ensures: URL-safe slugs only
 */
export const slugParamSchema = z.object({
  slug: z.string()
    .min(1, 'Slug cannot be empty')
    .max(100, 'Slug too long')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

/**
 * Validates namespace parameters
 * Ensures: valid namespace format
 */
export const namespaceParamSchema = z.object({
  namespace: z.string()
    .min(1, 'Namespace cannot be empty')
    .max(100, 'Namespace too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid namespace format'),
});

/**
 * Validates provider parameters (colab, kaggle, etc)
 */
export const providerParamSchema = z.object({
  provider: z.enum(['colab', 'kaggle', 'modal', 'runpod', 'paperspace'], {
    errorMap: () => ({ message: 'Invalid provider' }),
  }),
});

/**
 * Validates status parameters
 */
export const statusParamSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'online', 'offline', 'failed'], {
    errorMap: () => ({ message: 'Invalid status' }),
  }),
});

/**
 * Validates pagination parameters
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * Validates date range parameters
 */
export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => !data.startDate || !data.endDate || data.startDate <= data.endDate,
  { message: 'Start date must be before end date' }
);

// ============================================================================
// COMPOUND SCHEMAS (COMBINE PARAMS + QUERY)
// ============================================================================

/**
 * Dataset ID with optional filters
 */
export const datasetParamsSchema = idParamSchema.extend({
  includeData: z.coerce.boolean().default(false),
});

/**
 * Agent ID with optional expand
 */
export const agentParamsSchema = z.object({
  id: z.string()
    .min(1, 'Agent ID cannot be empty')
    .max(255, 'Agent ID too long'),
  expandTools: z.coerce.boolean().default(false),
  expandNamespaces: z.coerce.boolean().default(false),
});

/**
 * GPU Worker ID with filters
 */
export const gpuWorkerParamsSchema = idParamSchema.extend({
  includeMetrics: z.coerce.boolean().default(false),
});

/**
 * Single jobId parameter (for training/federated endpoints)
 */
export const jobIdParamSchema = z.object({
  jobId: z.coerce.number()
    .int('Job ID must be an integer')
    .positive('Job ID must be positive')
    .safe('Job ID must be within safe integer range'),
});

/**
 * Job ID + Chunk Index (for federated learning chunk downloads)
 */
export const jobIdChunkIndexSchema = z.object({
  jobId: z.coerce.number()
    .int('Job ID must be an integer')
    .positive('Job ID must be positive')
    .safe('Job ID must be within safe integer range'),
  chunkIndex: z.coerce.number()
    .int('Chunk index must be an integer')
    .nonnegative('Chunk index must be non-negative')
    .safe('Chunk index must be within safe integer range'),
});

/**
 * Document ID + Attachment Index
 */
export const docIdAttachmentIndexSchema = z.object({
  id: z.coerce.number()
    .int('Document ID must be an integer')
    .positive('Document ID must be positive')
    .safe('Document ID must be within safe integer range'),
  index: z.coerce.number()
    .int('Attachment index must be an integer')
    .nonnegative('Attachment index must be non-negative')
    .safe('Attachment index must be within safe integer range'),
});

/**
 * Job ID + Worker ID + Step (for federated worker gradients)
 */
export const jobIdWorkerIdStepSchema = z.object({
  jobId: z.coerce.number()
    .int('Job ID must be an integer')
    .positive('Job ID must be positive')
    .safe('Job ID must be within safe integer range'),
  workerId: z.coerce.number()
    .int('Worker ID must be an integer')
    .positive('Worker ID must be positive')
    .safe('Worker ID must be within safe integer range'),
  step: z.coerce.number()
    .int('Step must be an integer')
    .nonnegative('Step must be non-negative')
    .safe('Step must be within safe integer range'),
});

/**
 * Job ID + Step (for differential privacy noise)
 */
export const jobIdStepSchema = z.object({
  jobId: z.coerce.number()
    .int('Job ID must be an integer')
    .positive('Job ID must be positive')
    .safe('Job ID must be within safe integer range'),
  step: z.coerce.number()
    .int('Step must be an integer')
    .nonnegative('Step must be non-negative')
    .safe('Step must be within safe integer range'),
});

// ============================================================================
// VALIDATION HELPER FUNCTIONS
// ============================================================================

/**
 * Validates and extracts route parameters
 * Returns validated data or sends 400 error response
 * 
 * @example
 * const params = validateParams(idParamSchema, req, res);
 * if (!params) return; // Error response already sent
 * // Use params.id safely
 */
export function validateParams<T extends z.ZodTypeAny>(
  schema: T,
  req: any,
  res: any
): z.infer<T> | null {
  const result = schema.safeParse(req.params);
  
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid parameters',
      details: result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return null;
  }
  
  return result.data;
}

/**
 * Validates and extracts query parameters
 * Returns validated data or sends 400 error response
 */
export function validateQuery<T extends z.ZodTypeAny>(
  schema: T,
  req: any,
  res: any
): z.infer<T> | null {
  const result = schema.safeParse(req.query);
  
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid query parameters',
      details: result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return null;
  }
  
  return result.data;
}

/**
 * Validates and extracts request body
 * Returns validated data or sends 400 error response
 */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  req: any,
  res: any
): z.infer<T> | null {
  const result = schema.safeParse(req.body);
  
  if (!result.success) {
    res.status(400).json({
      error: 'Invalid request body',
      details: result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return null;
  }
  
  return result.data;
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export default {
  // Schemas
  idParamSchema,
  uuidParamSchema,
  slugParamSchema,
  namespaceParamSchema,
  providerParamSchema,
  statusParamSchema,
  paginationSchema,
  dateRangeSchema,
  datasetParamsSchema,
  agentParamsSchema,
  gpuWorkerParamsSchema,
  jobIdParamSchema,
  jobIdChunkIndexSchema,
  docIdAttachmentIndexSchema,
  jobIdWorkerIdStepSchema,
  jobIdStepSchema,
  
  // Helpers
  validateParams,
  validateQuery,
  validateBody,
};
