/**
 * ✅ FASE 1 - Schemas Zod para Validação Production-Grade
 * 
 * Centraliza todos os schemas de validação de payloads das rotas críticas.
 * Garante contratos estáveis e elimina runtime errors de validação.
 */

import { z } from "zod";

// ==================== CHAT ====================

export const ChatRequestSchema = z.object({
  sessionId: z.string().min(1, "sessionId é obrigatório"),
  input: z.string().min(1, "input não pode ser vazio"),
  files: z.array(z.object({
    id: z.string(),
    name: z.string(),
    mime: z.string(),
    size: z.number().optional(),
  })).optional(),
  options: z.object({
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_tokens: z.number().min(1).max(100000).optional(),
  }).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ==================== CURATION ====================

export const PromoteTextSchema = z.object({
  text: z.string().min(1, "texto não pode ser vazio"),
  title: z.string().optional(),
  suggestedNamespaces: z.array(z.string()).min(1, "pelo menos um namespace é obrigatório"),
  submittedBy: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type PromoteText = z.infer<typeof PromoteTextSchema>;

export const CurationActionSchema = z.object({
  itemId: z.string().min(1, "itemId é obrigatório"),
  action: z.enum(["approve", "reject"], {
    errorMap: () => ({ message: "action deve ser 'approve' ou 'reject'" }),
  }),
  reason: z.string().optional(),
  assignedNamespace: z.string().optional(),
});

export type CurationAction = z.infer<typeof CurationActionSchema>;

export const BulkCurationSchema = z.object({
  itemIds: z.array(z.string()).min(1, "pelo menos um itemId é obrigatório"),
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

export type BulkCuration = z.infer<typeof BulkCurationSchema>;

// ==================== AGENTS ====================

export const CreateAgentSchema = z.object({
  name: z.string().min(1, "nome é obrigatório"),
  description: z.string().optional(),
  systemPrompt: z.string().min(1, "systemPrompt é obrigatório"),
  allowedTools: z.array(z.string()).optional(),
  allowedNamespaces: z.array(z.string()).optional(),
  budget: z.object({
    maxTokensPerDay: z.number().min(0).optional(),
    maxRequestsPerDay: z.number().min(0).optional(),
  }).optional(),
  parentAgentId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type CreateAgent = z.infer<typeof CreateAgentSchema>;

export const UpdateAgentSchema = CreateAgentSchema.partial();

export type UpdateAgent = z.infer<typeof UpdateAgentSchema>;

// ==================== POLICIES ====================

export const UpdatePolicySchema = z.object({
  preset: z.string().min(1, "preset é obrigatório"),
  flags: z.object({
    enableModeration: z.boolean().optional(),
    enableWebSearch: z.boolean().optional(),
    allowExternalAPIs: z.boolean().optional(),
    enableKBSearch: z.boolean().optional(),
    enableGPUWorkers: z.boolean().optional(),
  }).optional(),
  limits: z.object({
    maxTokensPerRequest: z.number().min(1).max(100000).optional(),
    maxRequestsPerMinute: z.number().min(1).optional(),
  }).optional(),
  metadata: z.record(z.any()).optional(),
});

export type UpdatePolicy = z.infer<typeof UpdatePolicySchema>;

// ==================== KNOWLEDGE BASE ====================

export const CreateDocumentSchema = z.object({
  title: z.string().min(1, "título é obrigatório"),
  content: z.string().optional(),
  url: z.string().url("URL inválida").optional(),
  namespace: z.string().min(1, "namespace é obrigatório"),
  metadata: z.record(z.any()).optional(),
});

export type CreateDocument = z.infer<typeof CreateDocumentSchema>;

export const SearchKBSchema = z.object({
  query: z.string().min(1, "query não pode ser vazia"),
  k: z.number().min(1).max(100).optional(),
  namespaces: z.array(z.string()).optional(),
  documentId: z.number().optional(),
});

export type SearchKB = z.infer<typeof SearchKBSchema>;

// ==================== GPU WORKERS ====================

export const RegisterGPUWorkerSchema = z.object({
  url: z.string().url("URL inválida"),
  name: z.string().min(1, "nome é obrigatório"),
  gpuModel: z.string().optional(),
  ramGb: z.number().min(0).optional(),
  vramGb: z.number().min(0).optional(),
  maxConcurrentInferences: z.number().min(1).optional(),
  metadata: z.record(z.any()).optional(),
});

export type RegisterGPUWorker = z.infer<typeof RegisterGPUWorkerSchema>;

// ==================== HELPERS DE VALIDAÇÃO ====================

/**
 * Valida payload usando schema Zod
 * Retorna { success: true, data } ou { success: false, error }
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): 
  | { success: true; data: T }
  | { success: false; error: string } {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { success: false, error: messages.join(", ") };
    }
    return { success: false, error: "Erro de validação desconhecido" };
  }
}
