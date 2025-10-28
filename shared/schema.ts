import { pgTable, text, integer, serial, timestamp, boolean, jsonb, real, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// TENANTS - Multi-tenant isolation with jurisdiction-specific policies
// ============================================================================
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull().unique(),
  jurisdiction: text("jurisdiction").notNull().default("US"), // ISO country code
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

// ============================================================================
// POLICIES - YAML/JSON DSL for moral/ethical/legal enforcement
// As per PDFs: Externalized configuration with separation property ∂Pr[violation]/∂θ=0
// ============================================================================
export const policies = pgTable("policies", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  policyName: text("policy_name").notNull(),
  
  // Rules configuration (boolean flags for each category)
  rules: jsonb("rules").notNull().$type<{
    hate_speech: boolean;
    explicit_sexual: boolean;
    self_harm: boolean;
    political_extremism: boolean;
    illicit_howto: boolean;
    mild_profanity: boolean;
    minor_violence: boolean;
  }>(),
  
  // Actions on violation
  onBlock: text("on_block").notNull().default("refuse"), // "redact" | "refuse" | "rewrite"
  
  // Personality configuration
  humor: text("humor").notNull().default("neutral"), // "formal" | "casual" | "technical" | "creative" | "empathetic"
  tone: text("tone").notNull().default("professional"), // "professional" | "friendly" | "direct" | "educational"
  behavior: jsonb("behavior").notNull().$type<{
    verbosity: number; // 0-1
    formality: number; // 0-1
    creativity: number; // 0-1
    precision: number; // 0-1
  }>(),
  
  // LLM parameters
  temperature: real("temperature").notNull().default(0.7),
  topP: real("top_p").notNull().default(0.9),
  topK: integer("top_k").notNull().default(40),
  
  // System prompt override
  systemPrompt: text("system_prompt"),
  
  // Rate limits
  maxTokensPerDay: integer("max_tokens_per_day").notNull().default(100000),
  maxRequestsPerMinute: integer("max_requests_per_minute").notNull().default(60),
  maxCostPerDay: real("max_cost_per_day").notNull().default(10.0), // USD
  
  // Enabled tools (for agent)
  enabledTools: jsonb("enabled_tools").notNull().$type<string[]>().default([]),
  
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("policies_tenant_idx").on(table.tenantId),
}));

export const insertPolicySchema = createInsertSchema(policies).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policies.$inferSelect;

// ============================================================================
// CONVERSATIONS - Chat sessions with complete history
// ============================================================================
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: text("title").notNull().default("New Conversation"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("conversations_tenant_idx").on(table.tenantId),
}));

export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// ============================================================================
// MESSAGES - Individual messages in conversations
// ============================================================================
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  role: text("role").notNull(), // "user" | "assistant" | "system" | "tool"
  content: text("content").notNull(),
  
  // Multimodal attachments
  attachments: jsonb("attachments").$type<Array<{
    type: "image" | "video" | "audio" | "document";
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  }>>(),
  
  // Tool calls (for ReAct agent)
  toolCalls: jsonb("tool_calls").$type<Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>>(),
  
  // Metadata
  metadata: jsonb("metadata").$type<{
    latencyMs?: number;
    tokensUsed?: number;
    model?: string;
    costUsd?: number;
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  conversationIdx: index("messages_conversation_idx").on(table.conversationId),
}));

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ============================================================================
// DOCUMENTS - Knowledge base documents (PDFs, Word, Excel, etc)
// ============================================================================
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(), // bytes
  
  // Storage location
  storageUrl: text("storage_url").notNull(),
  
  // Extracted content
  extractedText: text("extracted_text"),
  
  // Processing status
  status: text("status").notNull().default("pending"), // "pending" | "processing" | "indexed" | "failed"
  errorMessage: text("error_message"),
  
  // Metadata from file
  metadata: jsonb("metadata").$type<{
    author?: string;
    title?: string;
    subject?: string;
    pages?: number;
    wordCount?: number;
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("documents_tenant_idx").on(table.tenantId),
  statusIdx: index("documents_status_idx").on(table.status),
}));

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ============================================================================
// EMBEDDINGS - Vector embeddings for RAG (semantic search)
// As per PDFs: E:X→R^d with normalized vectors ê_{i,j}=e_{i,j}/||e_{i,j}||
// ============================================================================
export const embeddings = pgTable("embeddings", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => documents.id),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  
  // Chunk information
  chunkIndex: integer("chunk_index").notNull(),
  chunkText: text("chunk_text").notNull(),
  chunkTokens: integer("chunk_tokens").notNull(),
  
  // Vector embedding (stored as JSON array, indexed in FAISS separately)
  // Note: For production, use pgvector extension or external FAISS/Milvus
  embedding: jsonb("embedding").notNull().$type<number[]>(),
  embeddingDim: integer("embedding_dim").notNull().default(1536), // OpenAI ada-002 dimension
  
  // Metadata for retrieval
  metadata: jsonb("metadata").$type<{
    section?: string;
    page?: number;
    heading?: string;
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  documentIdx: index("embeddings_document_idx").on(table.documentId),
  tenantIdx: index("embeddings_tenant_idx").on(table.tenantId),
}));

export const insertEmbeddingSchema = createInsertSchema(embeddings).omit({ id: true, createdAt: true });
export type InsertEmbedding = z.infer<typeof insertEmbeddingSchema>;
export type Embedding = typeof embeddings.$inferSelect;

// ============================================================================
// TOOL_EXECUTIONS - ReAct agent tool execution traces
// As per PDFs: POMDP actions a∈{SearchWeb(q),KB.Search(q),Exec(code),CallAPI(args),Finish(answer)}
// ============================================================================
export const toolExecutions = pgTable("tool_executions", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  messageId: integer("message_id").notNull().references(() => messages.id),
  
  // Tool information
  toolName: text("tool_name").notNull(), // "SearchWeb" | "KB.Search" | "Exec" | "CallAPI" | "Finish"
  toolInput: jsonb("tool_input").notNull().$type<Record<string, any>>(),
  
  // Execution results
  observation: text("observation").notNull(),
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  
  // Performance metrics
  executionTimeMs: integer("execution_time_ms").notNull(),
  
  // ReAct reasoning trace
  thought: text("thought"), // The "Thought" part of ReAct
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  conversationIdx: index("tool_executions_conversation_idx").on(table.conversationId),
  messageIdx: index("tool_executions_message_idx").on(table.messageId),
}));

export const insertToolExecutionSchema = createInsertSchema(toolExecutions).omit({ id: true, createdAt: true });
export type InsertToolExecution = z.infer<typeof insertToolExecutionSchema>;
export type ToolExecution = typeof toolExecutions.$inferSelect;

// ============================================================================
// METRICS - Real-time performance and cost tracking
// As per PDFs: latency p50/p95/p99, tokens/s, throughput, cache hits
// ============================================================================
export const metrics = pgTable("metrics", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  
  // Metric type
  metricType: text("metric_type").notNull(), // "latency" | "tokens" | "cost" | "cache" | "error"
  
  // Metric values
  value: real("value").notNull(),
  unit: text("unit").notNull(), // "ms" | "tokens" | "usd" | "count"
  
  // Context
  operation: text("operation").notNull(), // "chat_completion" | "kb_search" | "tool_exec" | "embedding"
  
  // Additional metadata
  metadata: jsonb("metadata").$type<{
    model?: string;
    conversationId?: number;
    messageId?: number;
    p50?: number;
    p95?: number;
    p99?: number;
  }>(),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("metrics_tenant_idx").on(table.tenantId),
  timestampIdx: index("metrics_timestamp_idx").on(table.timestamp),
  typeIdx: index("metrics_type_idx").on(table.metricType),
}));

export const insertMetricSchema = createInsertSchema(metrics).omit({ id: true, timestamp: true });
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Metric = typeof metrics.$inferSelect;

// ============================================================================
// GENERATED_FILES - Temporary files generated by AION (auto-deleted after 1h)
// Includes: text, images (DALL-E), videos
// ============================================================================
export const generatedFiles = pgTable("generated_files", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  conversationId: integer("conversation_id").references(() => conversations.id),
  
  // File information
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(), // text/plain, image/png, video/mp4, etc
  fileType: text("file_type").notNull(), // "text" | "image" | "video" | "code"
  size: integer("size").notNull(), // bytes
  
  // Storage location (local path or URL)
  storageUrl: text("storage_url").notNull(),
  
  // Generation details
  generationPrompt: text("generation_prompt"), // User's request
  generationMethod: text("generation_method"), // "dall-e-3", "manual", "stable-diffusion", etc
  
  // Metadata
  metadata: jsonb("metadata").$type<{
    width?: number;
    height?: number;
    duration?: number; // for videos
    language?: string; // for code files
    revisedPrompt?: string; // DALL-E revised prompt
  }>(),
  
  // Lifecycle management
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // Auto-delete after this time (1 hour)
  isDeleted: boolean("is_deleted").notNull().default(false),
}, (table) => ({
  tenantIdx: index("generated_files_tenant_idx").on(table.tenantId),
  expiresIdx: index("generated_files_expires_idx").on(table.expiresAt),
}));

export const insertGeneratedFileSchema = createInsertSchema(generatedFiles).omit({ id: true, createdAt: true });
export type InsertGeneratedFile = z.infer<typeof insertGeneratedFileSchema>;
export type GeneratedFile = typeof generatedFiles.$inferSelect;

// ============================================================================
// AUDIT_LOGS - Immutable audit trail with SHA-256 hashing
// As per PDFs: Audit Log signs response+policy manifest (hash SHA-256) for trail
// ============================================================================
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  
  // Event information
  eventType: text("event_type").notNull(), // "policy_change" | "message_sent" | "tool_executed" | "document_uploaded"
  
  // Data snapshot (immutable)
  data: jsonb("data").notNull().$type<Record<string, any>>(),
  
  // SHA-256 hash for integrity
  dataHash: varchar("data_hash", { length: 64 }).notNull(), // SHA-256 produces 64 hex chars
  
  // Policy manifest at time of event
  policySnapshot: jsonb("policy_snapshot").$type<Policy>(),
  
  // User/system actor
  actor: text("actor").notNull(),
  
  // IP address for security
  ipAddress: text("ip_address"),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("audit_logs_tenant_idx").on(table.tenantId),
  timestampIdx: index("audit_logs_timestamp_idx").on(table.timestamp),
  eventTypeIdx: index("audit_logs_event_type_idx").on(table.eventType),
}));

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, timestamp: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================================================
// KNOWLEDGE_SOURCES - Track web scraping and external knowledge sources
// As per PDFs: Web scraping with Beautiful Soup, crawler configurable
// ============================================================================
export const knowledgeSources = pgTable("knowledge_sources", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  
  // Source information
  sourceType: text("source_type").notNull(), // "web_scrape" | "api" | "upload" | "manual"
  sourceUrl: text("source_url"),
  
  // Scraping configuration (for web_scrape type)
  scrapingConfig: jsonb("scraping_config").$type<{
    domains?: string[];
    maxDepth?: number;
    schedule?: string; // cron expression
    qualityThreshold?: number;
  }>(),
  
  // Status
  lastScrapedAt: timestamp("last_scraped_at"),
  nextScheduledAt: timestamp("next_scheduled_at"),
  status: text("status").notNull().default("active"), // "active" | "paused" | "failed"
  
  // Statistics
  documentsScraped: integer("documents_scraped").notNull().default(0),
  lastErrorMessage: text("last_error_message"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("knowledge_sources_tenant_idx").on(table.tenantId),
}));

export const insertKnowledgeSourceSchema = createInsertSchema(knowledgeSources).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKnowledgeSource = z.infer<typeof insertKnowledgeSourceSchema>;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;
