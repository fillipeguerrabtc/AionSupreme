import { z } from 'zod';

// ============================================================================
// ZOD SCHEMAS FOR LIFECYCLE POLICY VALIDATION
// ============================================================================

// Condition schemas
const conditionFieldSchema = z.object({
  field: z.string(),
  operator: z.enum([
    'equals',
    'in',
    'older_than',
    'before',
    'null_reference',
    'not_in_db'
  ]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  values: z.array(z.string()).optional(),
  unit: z.enum(['days', 'months', 'years']).optional(),
  checkTable: z.string().optional(),
});

const conditionSchema = z.union([
  conditionFieldSchema,
  z.object({
    allOf: z.array(conditionFieldSchema),
  }),
]);

// Policy schema
const policySchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  action: z.enum(['delete', 'archive', 'flag_for_review']),
  description: z.string().optional(),
  condition: conditionSchema,
  preserveIf: z.record(z.unknown()).optional(),
  effect: z.record(z.unknown()),
  implementation: z.string().optional(),
});

// Module config schema
const moduleConfigSchema = z.object({
  enabled: z.boolean(),
  description: z.string(),
  policies: z.array(policySchema),
});

// Schedule run schema
const scheduleRunSchema = z.object({
  frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly']),
  dayOfMonth: z.number().min(1).max(31).optional(),
  dayOfWeek: z.number().min(0).max(6).optional(),
  hour: z.number().min(0).max(23).optional(),
  minute: z.number().min(0).max(59).optional(),
  modules: z.array(z.string()),
});

// Full lifecycle policy schema
export const lifecyclePolicySchema = z.object({
  version: z.string().optional(),
  description: z.string().optional(),
  globalDefaults: z.object({
    retentionYears: z.number().min(1).max(10).optional(),
    retentionDays: z.number().min(1).max(3650).optional(),
    timezone: z.string().optional(),
    auditLogEnabled: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }).optional(),
  modules: z.record(moduleConfigSchema).optional(),
  schedule: z.object({
    description: z.string().optional(),
    timezone: z.string().optional(),
    runs: z.array(scheduleRunSchema).optional(),
  }).optional(),
  auditLog: z.object({
    enabled: z.boolean().optional(),
    destination: z.string().optional(),
    format: z.string().optional(),
    includeFields: z.array(z.string()).optional(),
  }).optional(),
  notifications: z.object({
    enabled: z.boolean().optional(),
    channels: z.array(z.string()).optional(),
    triggers: z.array(z.object({
      event: z.string(),
      threshold: z.number().optional(),
      description: z.string(),
    })).optional(),
  }).optional(),
});

// Partial schema for PATCH updates (allows partial updates)
export const lifecyclePolicyUpdateSchema = z.object({
  version: z.string().optional(),
  description: z.string().optional(),
  globalDefaults: z.object({
    retentionYears: z.number().min(1).max(10).optional(),
    retentionDays: z.number().min(1).max(3650).optional(),
    timezone: z.string().optional(),
    auditLogEnabled: z.boolean().optional(),
    dryRun: z.boolean().optional(),
  }).partial().optional(),
  modules: z.record(moduleConfigSchema.partial()).optional(),
  schedule: z.object({
    description: z.string().optional(),
    timezone: z.string().optional(),
    runs: z.array(scheduleRunSchema).optional(),
  }).partial().optional(),
  auditLog: z.object({
    enabled: z.boolean().optional(),
    destination: z.string().optional(),
    format: z.string().optional(),
    includeFields: z.array(z.string()).optional(),
  }).partial().optional(),
  notifications: z.object({
    enabled: z.boolean().optional(),
    channels: z.array(z.string()).optional(),
    triggers: z.array(z.object({
      event: z.string(),
      threshold: z.number().optional(),
      description: z.string(),
    })).optional(),
  }).partial().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: "Update body cannot be empty" }
);

export type LifecyclePolicy = z.infer<typeof lifecyclePolicySchema>;
export type LifecyclePolicyUpdate = z.infer<typeof lifecyclePolicyUpdateSchema>;
