import { pgTable, text, integer, serial, timestamp, boolean, jsonb, real, varchar, index, unique, pgEnum, smallint, vector } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from 'drizzle-orm';

// ============================================================================
// LLM PROVIDER QUOTAS - Free LLM Provider Quota Tracking (PostgreSQL-backed)
// Tracks daily quotas for Groq, Gemini, HuggingFace, OpenRouter
// ============================================================================
export const llmProviderQuotas = pgTable("llm_provider_quotas", {
  id: serial("id").primaryKey(),
  provider: varchar("provider", { length: 50 }).notNull().unique(), // groq, gemini, hf, openrouter
  
  // Daily counters (reset at midnight)
  requestCount: integer("request_count").notNull().default(0),
  tokenCount: integer("token_count").notNull().default(0),
  
  // Daily limits
  dailyRequestLimit: integer("daily_request_limit").notNull(),
  dailyTokenLimit: integer("daily_token_limit"), // Optional, null for providers without token limits
  
  // Rotation priority (1 = highest priority, used for fallback logic)
  rotationPriority: smallint("rotation_priority").notNull(),
  
  // Provider-specific metadata (capabilities, models, etc)
  metadata: jsonb("metadata").default({}),
  
  // Timestamps
  lastResetAt: timestamp("last_reset_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_llm_provider_quotas_rotation_priority").on(table.rotationPriority),
]);

export const insertLlmProviderQuotaSchema = createInsertSchema(llmProviderQuotas).omit({ id: true, updatedAt: true });
export type InsertLlmProviderQuota = z.infer<typeof insertLlmProviderQuotaSchema>;
export type LlmProviderQuota = typeof llmProviderQuotas.$inferSelect;

// 🔥 NEW: Provider Alternation State (Persistence)
export const providerAlternationState = pgTable('provider_alternation_state', {
  id: serial('id').primaryKey(),
  lastProviderStarted: varchar('last_provider_started', { length: 10 }), // 'colab' | 'kaggle' | null
  lastProviderStopped: varchar('last_provider_stopped', { length: 10 }),  // 'colab' | 'kaggle' | null
  startHistory: jsonb('start_history').default([]),  // Array de { provider, timestamp }
  stopHistory: jsonb('stop_history').default([]),    // Array de { provider, timestamp }
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================================================
// SESSIONS - Session storage (required for Replit Auth)
// blueprint:javascript_log_in_with_replit
// ============================================================================
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// ============================================================================
// USERS - User accounts (Replit Auth + Local Auth)
// blueprint:javascript_log_in_with_replit
// ============================================================================
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  
  // Local authentication fields
  password: varchar("password"), // bcrypt hash, null for OAuth users
  emailVerified: boolean("email_verified").default(false),
  authProvider: varchar("auth_provider").default("replit"), // "replit" | "local" | "google" | "github" etc
  verificationToken: varchar("verification_token"), // Email verification token
  verificationTokenExpires: timestamp("verification_token_expires"), // Token expiration (24h)
  
  // User type: determines access to dashboard admin, chat, or both
  // PRODUCTION: "both" is default - most users can access both chat and admin dashboard (RBAC controls granular permissions)
  userType: varchar("user_type").notNull().default("both"), // "dashboard_admin" | "chat_only" | "both"
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// ============================================================================
// TENANTS - Tenant configuration (single-tenant mode by default, schema preserved for future scalability)
// ============================================================================
export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  apiKey: text("api_key").notNull().unique(),
  jurisdiction: text("jurisdiction").notNull().default("US"), // ISO country code
  timezone: text("timezone").notNull().default("America/Sao_Paulo"), // IANA timezone for datetime formatting
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
    verbosity: number; // 0-1 (concise vs detailed)
    formality: number; // 0-1 (casual vs formal)
    creativity: number; // 0-1 (factual vs creative)
    precision: number; // 0-1 (approximate vs precise)
    persuasiveness: number; // 0-1 (neutral vs persuasive)
    empathy: number; // 0-1 (objective vs empathetic)
    enthusiasm: number; // 0-1 (calm vs enthusiastic)
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
}));

export const insertPolicySchema = createInsertSchema(policies).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPolicy = z.infer<typeof insertPolicySchema>;
export type Policy = typeof policies.$inferSelect;

// ============================================================================
// BEHAVIOR SCHEMA - Complete validation with defaults
// ============================================================================
export const behaviorConfigSchema = z.object({
  verbosity: z.number().min(0).max(1),
  formality: z.number().min(0).max(1),
  creativity: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  persuasiveness: z.number().min(0).max(1),
  empathy: z.number().min(0).max(1),
  enthusiasm: z.number().min(0).max(1),
});

export type BehaviorConfig = z.infer<typeof behaviorConfigSchema>;

// Default behavior configuration (middle-ground balanced AI)
export const DEFAULT_BEHAVIOR: BehaviorConfig = {
  verbosity: 0.7,      // 70% - detailed but not overly verbose
  formality: 0.5,      // 50% - balanced casual/professional
  creativity: 0.8,     // 80% - creative with occasional metaphors
  precision: 0.9,      // 90% - precise and accurate
  persuasiveness: 0.5, // 50% - moderately persuasive when appropriate
  empathy: 0.7,        // 70% - empathetic and supportive
  enthusiasm: 0.5,     // 50% - moderate energy level
};

/**
 * Normalizes behavior config by merging with defaults.
 * Ensures all 7 properties are present even if partial data provided.
 * Validates ranges [0-1] for each property.
 */
export function normalizeBehavior(behavior?: Partial<BehaviorConfig>): BehaviorConfig {
  const merged = { ...DEFAULT_BEHAVIOR, ...behavior };
  return behaviorConfigSchema.parse(merged);
}

// ============================================================================
// PROJECTS - ChatGPT-style project organization
// ============================================================================
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("projects_user_idx").on(table.userId),
}));

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// ============================================================================
// PROJECT_FILES - Files attached to projects for context
// ============================================================================
export const projectFiles = pgTable("project_files", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  filename: text("filename").notNull(),
  content: text("content").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
}, (table) => ({
  projectIdx: index("project_files_project_idx").on(table.projectId),
}));

export const insertProjectFileSchema = createInsertSchema(projectFiles).omit({ id: true, uploadedAt: true });
export type InsertProjectFile = z.infer<typeof insertProjectFileSchema>;
export type ProjectFile = typeof projectFiles.$inferSelect;

// ============================================================================
// CONVERSATIONS - Chat sessions with complete history
// ============================================================================
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id), // Optional: null for anonymous sessions
  projectId: integer("project_id").references(() => projects.id), // Optional: link to project
  title: text("title").notNull().default("New Conversation"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  
  // Namespace for multi-tenant isolation (CRITICAL for Meta-Learning filtering)
  namespace: text("namespace"), // null = global, otherwise scoped to namespace
  
  // Lifecycle management fields
  lastActivityAt: timestamp("last_activity_at"), // Last message timestamp (for idle detection)
  expiresAt: timestamp("expires_at"), // Optional expiration (if retention policy applied)
  archivedAt: timestamp("archived_at"), // Archived timestamp (18mo inactivity → archive)
}, (table) => ({
  userIdx: index("conversations_user_idx").on(table.userId),
  projectIdx: index("conversations_project_idx").on(table.projectId),
  expiresIdx: index("conversations_expires_idx").on(table.expiresAt),
  namespaceIdx: index("conversations_namespace_idx").on(table.namespace),
  // Composite index for meta-learning queries (namespace + date ordering)
  namespaceCreatedIdx: index("conversations_namespace_created_idx").on(table.namespace, table.createdAt),
}));

export const insertConversationSchema = createInsertSchema(conversations).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  lastActivityAt: true,
  expiresAt: true,
  archivedAt: true,
});
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
    provider?: string; // 'openai' | 'anthropic' | 'groq' | 'gemini' | 'huggingface' | 'multi-agent'
    source?: string; // 'openai' | 'free-api' | 'multi-agent' | 'web-fallback' | 'openai-fallback'
    totalCost?: number;
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  conversationIdx: index("messages_conversation_idx").on(table.conversationId),
}));

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ============================================================================
// DOCUMENTS - Knowledge base documents (PDFs, Word, Excel, etc + manual text)
// ============================================================================
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  
  // Universal fields for all document types
  title: text("title").notNull().default("Untitled"), // Title/filename
  content: text("content").notNull().default(""), // Full text content
  source: text("source").notNull().default("upload"), // "manual" | "upload" | "url" | "web-search"
  
  // File-specific fields (optional for manual text)
  filename: text("filename"),
  mimeType: text("mime_type"),
  size: integer("size"), // bytes
  storageUrl: text("storage_url"),
  
  // Extracted content (for files)
  extractedText: text("extracted_text"),
  
  // Multimodal attachments (images, videos, documents discovered in web crawling or uploaded)
  attachments: jsonb("attachments").$type<Array<{
    type: "image" | "video" | "audio" | "document";
    url: string; // URL final OU data:image/... para base64 temporário
    filename: string;
    mimeType: string;
    size: number;
    description?: string; // AI-generated description for images
    base64?: string; // NOVO: Buffer base64 temporário (só para imagens PENDENTES na curadoria)
    tempPath?: string; // NOVO: Path temporário antes de salvar definitivo
  }>>(),
  
  // Processing status
  status: text("status").notNull().default("indexed"), // "pending" | "processing" | "indexed" | "failed"
  errorMessage: text("error_message"),
  
  // Deduplication fields (for faster lookup during curation)
  contentHash: varchar("content_hash", { length: 64 }), // SHA256 hash for O(1) duplicate detection
  
  // Metadata from file
  metadata: jsonb("metadata").$type<{
    author?: string;
    subject?: string;
    pages?: number;
    wordCount?: number;
    charCount?: number;
    url?: string; // Original URL for web-scraped content
    query?: string; // Search query for web-search documents
    part?: string; // Part for technical PDFs
    description?: string; // Description for technical PDFs
    title?: string; // Title from file
    filename?: string; // Original filename
    mimeType?: string; // File MIME type
    size?: number; // File size in bytes
    originalLength?: number; // Original content length before truncation
    truncated?: boolean; // Whether content was truncated
    analyzed?: boolean; // For images - whether Vision API was used
    namespaces?: string[]; // Namespaces for multi-agent routing (CRITICAL!)
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("documents_status_idx").on(table.status),
  sourceIdx: index("documents_source_idx").on(table.source),
  contentHashIdx: index("documents_content_hash_idx").on(table.contentHash), // Index for O(1) duplicate lookup during curation
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
  
  // Chunk information
  chunkIndex: integer("chunk_index").notNull(),
  chunkText: text("chunk_text").notNull(),
  chunkTokens: integer("chunk_tokens").notNull(),
  
  // Vector embedding (native pgvector type with IVFFlat index)
  // ✅ PRODUCTION-READY: Using pgvector 0.8.0 with IVFFlat index (O(log N) search)
  // Index: embeddings_vector_ivfflat_idx (lists=10, vector_cosine_ops)
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
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
  
  // Namespace for multi-tenant isolation (CRITICAL for Meta-Learning filtering)
  namespace: text("namespace"), // null = global, otherwise scoped to namespace
  
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
  namespaceIdx: index("knowledge_sources_namespace_idx").on(table.namespace),
}));

export const insertKnowledgeSourceSchema = createInsertSchema(knowledgeSources).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKnowledgeSource = z.infer<typeof insertKnowledgeSourceSchema>;
export type KnowledgeSource = typeof knowledgeSources.$inferSelect;

// ============================================================================
// VIDEO_JOBS - Async video generation job queue
// As per Architect plan: GPU worker orchestration with job polling
// ============================================================================
export const videoJobs = pgTable("video_jobs", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => conversations.id),
  
  // Job specification
  prompt: text("prompt").notNull(),
  parameters: jsonb("parameters").notNull().$type<{
    duration?: number; // seconds (e.g., 30, 60, 120)
    fps?: number; // frames per second
    resolution?: string; // "720p" | "1080p" | "4k"
    style?: string; // "realistic" | "animated" | "cinematic" | "documentary"
    scenes?: number; // number of scenes to generate
    audio?: boolean; // include narration/music
    voiceId?: string; // TTS voice selection
    model?: "open-sora" | "animatediff" | "modelscope"; // preferred model
  }>(),
  
  // Job lifecycle
  status: text("status").notNull().default("pending"), // "pending" | "processing" | "completed" | "failed"
  progress: real("progress").notNull().default(0), // 0-100
  currentStep: text("current_step"), // "planning" | "generating" | "stitching" | "upscaling" | "audio_sync"
  
  // Worker assignment
  workerId: text("worker_id"), // GPU worker that picked up the job
  workerUrl: text("worker_url"), // Worker callback URL
  
  // Results (video asset linked via videoAssets.jobId)
  errorMessage: text("error_message"),
  
  // Logs
  generationLogs: jsonb("generation_logs").$type<Array<{
    timestamp: string;
    step: string;
    message: string;
    progress: number;
  }>>().default([]),
  
  // Timing
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedCompletionAt: timestamp("estimated_completion_at"),
}, (table) => ({
  statusIdx: index("video_jobs_status_idx").on(table.status),
}));

export const insertVideoJobSchema = createInsertSchema(videoJobs).omit({ id: true, createdAt: true });
export type InsertVideoJob = z.infer<typeof insertVideoJobSchema>;
export type VideoJob = typeof videoJobs.$inferSelect;

// ============================================================================
// VIDEO_ASSETS - Generated video files with metadata
// ============================================================================
export const videoAssets = pgTable("video_assets", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => videoJobs.id),
  
  // File information
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("video/mp4"),
  size: integer("size").notNull(), // bytes
  storageUrl: text("storage_url").notNull(), // local path or cloud URL
  
  // Video metadata
  duration: real("duration").notNull(), // seconds
  resolution: text("resolution").notNull(), // "1920x1080"
  fps: integer("fps").notNull(),
  codec: text("codec").default("h264"),
  bitrate: integer("bitrate"), // kbps
  
  // Generation info
  generationMethod: text("generation_method").notNull(), // "open-sora" | "animatediff" | "modelscope"
  prompt: text("prompt").notNull(),
  revisedPrompt: text("revised_prompt"),
  
  // Additional assets
  thumbnailUrl: text("thumbnail_url"), // Preview thumbnail
  subtitlesUrl: text("subtitles_url"), // SRT file if generated
  
  // Quality metrics
  qualityScore: real("quality_score"), // 0-100
  metadata: jsonb("metadata").$type<{
    scenes?: number;
    transitions?: string[];
    audioTracks?: number;
    hasNarration?: boolean;
    hasMusic?: boolean;
  }>(),
  
  // Lifecycle
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // Auto-delete after time
  isDeleted: boolean("is_deleted").notNull().default(false),
}, (table) => ({
  expiresIdx: index("video_assets_expires_idx").on(table.expiresAt),
}));

export const insertVideoAssetSchema = createInsertSchema(videoAssets).omit({ id: true, createdAt: true });
export type InsertVideoAsset = z.infer<typeof insertVideoAssetSchema>;
export type VideoAsset = typeof videoAssets.$inferSelect;

// ============================================================================
// REBUILD_JOBS - ⚡ FASE 2 - C3: Async KB vector index rebuild
// ============================================================================
export const rebuildJobs = pgTable("rebuild_jobs", {
  id: serial("id").primaryKey(),
  
  // Job parameters
  namespaceFilter: text("namespace_filter"), // null = all namespaces
  
  // Progress tracking
  status: text("status").notNull().default("pending"), // "pending" | "running" | "completed" | "failed"
  progress: real("progress").notNull().default(0), // 0-100
  totalDocuments: integer("total_documents").notNull().default(0),
  processedDocuments: integer("processed_documents").notNull().default(0),
  currentNamespace: text("current_namespace"),
  
  // Results
  errorMessage: text("error_message"),
  stats: jsonb("stats").$type<{
    documentsIndexed: number;
    namespacesProcessed: string[];
    avgEmbeddingTime: number; // ms
    totalDuration: number; // ms
  }>(),
  
  // Lifecycle
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Cancellation
  cancelRequested: boolean("cancel_requested").notNull().default(false),
}, (table) => ({
  statusIdx: index("rebuild_jobs_status_idx").on(table.status),
}));

export const insertRebuildJobSchema = createInsertSchema(rebuildJobs).omit({ id: true, createdAt: true });
export type InsertRebuildJob = z.infer<typeof insertRebuildJobSchema>;
export type RebuildJob = typeof rebuildJobs.$inferSelect;

// ============================================================================
// TOKEN_USAGE - Token consumption tracking for all APIs
// ============================================================================
export const tokenUsage = pgTable("token_usage", {
  id: serial("id").primaryKey(),
  
  // API Provider
  provider: text("provider").notNull(), // "groq" | "gemini" | "huggingface" | "openrouter" | "openai" | "kb" | "web"
  model: text("model").notNull(),
  
  // Usage metrics
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  
  // Cost (for paid APIs like OpenAI)
  cost: real("cost").default(0.0), // USD
  
  // Request info
  requestType: text("request_type").notNull(), // "chat" | "embedding" | "transcription" | "image" | "search"
  success: boolean("success").notNull().default(true),
  
  // Metadata for web searches (URLs, titles, sources) and KB tracking
  metadata: jsonb("metadata").$type<{
    query?: string;
    sources?: Array<{
      url: string;
      title: string;
      snippet?: string;
      domain?: string;
    }>;
    resultsCount?: number;
    indexedDocuments?: number;
    // KB-specific fields
    confidence?: number;
    sourceUsed?: 'kb-own' | 'fallback-needed' | 'kb-error';
    kbUsed?: boolean;
    reason?: string;
    // Web Search GPU tracking
    gpuUsed?: boolean;
    processingMode?: 'web-only' | 'web-gpu';
  }>(),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  providerIdx: index("token_usage_provider_idx").on(table.provider),
  timestampIdx: index("token_usage_timestamp_idx").on(table.timestamp),
}));

export const insertTokenUsageSchema = createInsertSchema(tokenUsage).omit({ id: true, timestamp: true });
export type InsertTokenUsage = z.infer<typeof insertTokenUsageSchema>;
export type TokenUsage = typeof tokenUsage.$inferSelect;

// ============================================================================
// TOKEN_LIMITS - Configurable limits per provider (single-tenant mode)
// ============================================================================
export const tokenLimits = pgTable("token_limits", {
  id: serial("id").primaryKey(),
  
  // Provider
  provider: text("provider").notNull(), // "groq" | "gemini" | "huggingface" | "openrouter" | "openai" | "all"
  
  // Limits
  dailyTokenLimit: integer("daily_token_limit"), // null = unlimited
  monthlyTokenLimit: integer("monthly_token_limit"), // null = unlimited
  dailyCostLimit: real("daily_cost_limit"), // USD, null = unlimited
  monthlyCostLimit: real("monthly_cost_limit"), // USD, null = unlimited
  
  // Alerts
  alertThreshold: real("alert_threshold").notNull().default(0.8), // 0-1, alert at 80% by default
  alertEmail: text("alert_email"),
  alertsEnabled: boolean("alerts_enabled").notNull().default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
}));

export const insertTokenLimitSchema = createInsertSchema(tokenLimits).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTokenLimit = z.infer<typeof insertTokenLimitSchema>;
export type TokenLimit = typeof tokenLimits.$inferSelect;

// ============================================================================
// TOKEN_ALERTS - Alert history for token usage
// ============================================================================
export const tokenAlerts = pgTable("token_alerts", {
  id: serial("id").primaryKey(),
  
  provider: text("provider").notNull(),
  alertType: text("alert_type").notNull(), // "threshold_reached" | "limit_exceeded" | "daily_reset"
  message: text("message").notNull(),
  
  currentUsage: integer("current_usage").notNull(),
  limit: integer("limit").notNull(),
  percentage: real("percentage").notNull(), // 0-1
  
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedAt: timestamp("acknowledged_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  acknowledgedIdx: index("token_alerts_acknowledged_idx").on(table.acknowledged),
}));

export const insertTokenAlertSchema = createInsertSchema(tokenAlerts).omit({ id: true, createdAt: true });
export type InsertTokenAlert = z.infer<typeof insertTokenAlertSchema>;
export type TokenAlert = typeof tokenAlerts.$inferSelect;

// ============================================================================
// OPENAI_BILLING_SYNC - Real billing data from OpenAI Costs API
// ============================================================================

// ✅ P1 FIX: Provider ENUM for strict type safety and query performance
export const billingProviderEnum = pgEnum("billing_provider", ["openai", "openrouter", "gemini"]);

export const openai_billing_sync = pgTable("openai_billing_sync", {
  id: serial("id").primaryKey(),
  
  // ✅ P1 FIX: Provider column for strict isolation between billing sources
  provider: billingProviderEnum("provider").notNull().default("openai"),
  
  // Time period (from OpenAI Costs API)
  startTime: timestamp("start_time").notNull(), // Unix timestamp converted to timestamp
  endTime: timestamp("end_time").notNull(),
  
  // Cost breakdown (REAL data from OpenAI invoice)
  totalCost: real("total_cost").notNull(), // USD - valor REAL faturado
  lineItems: jsonb("line_items").$type<Array<{
    name: string; // "GPT-4 usage", "Embeddings", etc
    cost: number; // USD
    project_id?: string;
    line_item?: string;
  }>>(),
  
  // Metadata
  syncedAt: timestamp("synced_at").notNull().defaultNow(), // When we fetched this data
  source: text("source").notNull().default("openai_costs_api_v2025"), // ✅ P1 FIX: Updated default to v2025
  
  // Deduplication: ensure we don't sync the same period twice
  periodKey: text("period_key").notNull().unique(), // Format: "YYYY-MM-DD" for daily buckets or "provider-YYYY-MM-DD"
}, (table) => ({
  periodKeyIdx: index("openai_billing_period_key_idx").on(table.periodKey),
  startTimeIdx: index("openai_billing_start_time_idx").on(table.startTime),
  // ✅ P1 FIX: Index on provider for fast filtering by provider
  providerIdx: index("openai_billing_provider_idx").on(table.provider),
}));

export const insertOpenAIBillingSyncSchema = createInsertSchema(openai_billing_sync).omit({ id: true, syncedAt: true });
export type InsertOpenAIBillingSync = z.infer<typeof insertOpenAIBillingSyncSchema>;
export type OpenAIBillingSync = typeof openai_billing_sync.$inferSelect;

// ============================================================================
// GPU WORKERS - Multi-GPU pool management for load balancing and fallback
// ============================================================================
export const gpuWorkers = pgTable("gpu_workers", {
  id: serial("id").primaryKey(),
  
  // Provider and identification
  provider: text("provider").notNull(), // "colab" | "kaggle" | "modal" | "paperspace" | "lightning"
  accountId: text("account_id"), // Google account email or unique identifier
  ngrokUrl: text("ngrok_url").notNull().unique(),
  
  // Capabilities and configuration
  capabilities: jsonb("capabilities").notNull().$type<{
    tor_enabled: boolean;
    model: string; // "llama-3-8b-lora" | "llama-3-8b" | "mistral-7b" etc
    gpu: string; // "Tesla T4" | "A100" etc
    vram_gb?: number;
    max_concurrent?: number; // Max concurrent requests this GPU can handle
  }>(),
  
  // Health and status
  status: text("status").notNull().default("pending"), // "healthy" | "unhealthy" | "offline" | "pending"
  lastHealthCheck: timestamp("last_health_check"),
  lastHealthCheckError: text("last_health_check_error"), // Error message if unhealthy
  
  // Performance metrics
  requestCount: integer("request_count").notNull().default(0),
  totalLatencyMs: integer("total_latency_ms").notNull().default(0), // Sum for averaging
  averageLatencyMs: real("average_latency_ms").notNull().default(0),
  
  // 🔥 AUTO-ORCHESTRATION & QUOTA MANAGEMENT (P1)
  // Intelligent quota tracking for FREE tier providers (Colab 12h, Kaggle 30h/week)
  autoManaged: boolean("auto_managed").notNull().default(false), // If under Puppeteer orchestrator control
  puppeteerSessionId: text("puppeteer_session_id"), // Browser automation session ID
  
  // ✅ FIX P0-1: Session reservation & locking (two-phase startup)
  sessionToken: varchar("session_token", { length: 64 }), // Unique token for atomic session reservation
  startRequestedAt: timestamp("start_requested_at"), // When session start was requested
  reservationExpiresAt: timestamp("reservation_expires_at"), // TTL for reservation cleanup (5min)
  
  // Session runtime tracking (Safety: stop 1h before limits)
  sessionStartedAt: timestamp("session_started_at"), // When current session started
  sessionDurationSeconds: integer("session_duration_seconds").notNull().default(0), // Current runtime
  maxSessionDurationSeconds: integer("max_session_duration_seconds").notNull().default(39600), // 11h default (12h-1h safety)
  scheduledStopAt: timestamp("scheduled_stop_at"), // When orchestrator will auto-stop
  
  // Weekly quota tracking (Kaggle specific: 30h GPU/week)
  weeklyUsageSeconds: integer("weekly_usage_seconds").notNull().default(0), // Total seconds this week
  maxWeeklySeconds: integer("max_weekly_seconds"), // 108000 for Kaggle (30h), null for Colab
  weekStartedAt: timestamp("week_started_at"), // Week boundary for quota reset
  
  // 🔥 NEW: Cooldown & Daily/Weekly Tracking (Architect recommendation)
  cooldownUntil: timestamp("cooldown_until"), // Block usage until this time (Colab 36h cooldown)
  dailyUsageHours: real("daily_usage_hours").notNull().default(0), // Hours used today (Kaggle 4h/day)
  weeklyUsageHours: real("weekly_usage_hours").notNull().default(0), // Hours used this week
  lastDailyReset: timestamp("last_daily_reset"), // Last daily reset timestamp
  
  // 🔥 NEW: Cost tracking (prepare for paid tier)
  costPerHour: real("cost_per_hour").notNull().default(0), // $0 for free, $0.34 for RunPod, etc
  totalCostUsd: real("total_cost_usd").notNull().default(0), // Accumulated cost
  
  // Provider-specific limits
  providerLimits: jsonb("provider_limits").$type<{
    max_session_hours: number; // 11 for Colab, 4 for Kaggle daily
    max_daily_hours?: number; // 4 for Kaggle, null for Colab
    max_weekly_hours?: number; // 28 for Kaggle (4h×7 with 2h buffer), null for Colab
    cooldown_hours?: number; // 36 for Colab, null for Kaggle
    idle_timeout_minutes?: number; // 90 for Colab, varies for Kaggle
    safety_margin_hours?: number; // Not used anymore (using exact limits now)
  }>().default({
    max_session_hours: 11,
  }),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"), // When last served a request
}, (table) => ({
  providerIdx: index("gpu_workers_provider_idx").on(table.provider),
  statusIdx: index("gpu_workers_status_idx").on(table.status),
  accountIdIdx: index("gpu_workers_account_id_idx").on(table.accountId),
  sessionTokenIdx: index("gpu_workers_session_token_idx").on(table.sessionToken), // ✅ FIX P0-1
}));

export const insertGpuWorkerSchema = createInsertSchema(gpuWorkers).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  requestCount: true,
  totalLatencyMs: true,
  averageLatencyMs: true,
});
export type InsertGpuWorker = z.infer<typeof insertGpuWorkerSchema>;
export type GpuWorker = typeof gpuWorkers.$inferSelect;

// ============================================================================
// CIRCUIT BREAKER STATE - Production-grade GPU worker failure protection
// Persists circuit breaker state to survive server restarts
// ============================================================================
export const circuitBreakerStateEnum = pgEnum("circuit_breaker_state_enum", [
  "CLOSED",
  "OPEN", 
  "HALF_OPEN"
]);

export const circuitBreakerState = pgTable("circuit_breaker_state", {
  id: serial("id").primaryKey(),
  
  // Worker reference
  workerId: integer("worker_id").notNull().references(() => gpuWorkers.id, { onDelete: 'cascade' }).unique(),
  
  // Circuit state
  state: circuitBreakerStateEnum("state").notNull().default("CLOSED"),
  
  // Counters
  failureCount: integer("failure_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  
  // Timestamps
  lastFailureTime: timestamp("last_failure_time"),
  lastSuccessTime: timestamp("last_success_time"),
  nextRetryTime: timestamp("next_retry_time"), // When to retry after OPEN
  
  // Configuration (can override defaults)
  config: jsonb("config").$type<{
    failureThreshold?: number;
    recoveryTimeout?: number;
    successThreshold?: number;
    timeout?: number;
  }>().default({}),
  
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  workerIdIdx: index("circuit_breaker_state_worker_id_idx").on(table.workerId),
  stateIdx: index("circuit_breaker_state_state_idx").on(table.state),
}));

export const insertCircuitBreakerStateSchema = createInsertSchema(circuitBreakerState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCircuitBreakerState = z.infer<typeof insertCircuitBreakerStateSchema>;
export type CircuitBreakerState = typeof circuitBreakerState.$inferSelect;

// ============================================================================
// VISION QUOTA STATE - Production-grade Vision API quota tracking
// Persists vision provider quotas to survive server restarts
// ============================================================================
export const visionProviderEnum = pgEnum("vision_provider_enum", [
  "gemini",
  "gpt4v-openrouter",
  "claude3-openrouter",
  "huggingface"
]);

export const visionQuotaState = pgTable("vision_quota_state", {
  id: serial("id").primaryKey(),
  
  // Provider (unique - one row per provider)
  provider: visionProviderEnum("provider").notNull().unique(),
  
  // Quota tracking
  used: integer("used").notNull().default(0),
  limit: integer("limit").notNull(),
  
  // Reset tracking
  lastReset: timestamp("last_reset", { mode: 'date' }).notNull().defaultNow(),
  
  // Metadata
  createdAt: timestamp("created_at", { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: 'date' }).notNull().defaultNow()
}, (table) => ({
  providerIdx: index("vision_quota_state_provider_idx").on(table.provider)
}));

export const insertVisionQuotaStateSchema = createInsertSchema(visionQuotaState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVisionQuotaState = z.infer<typeof insertVisionQuotaStateSchema>;
export type VisionQuotaState = typeof visionQuotaState.$inferSelect;

// ============================================================================
// GPU STATE PERSISTENCE - Phase 3: GPU state management (PostgreSQL-backed)
// Persists GPU health checks, active requests, and sessions to survive server restarts
// ============================================================================

/**
 * GPU Health State - Persists failed health check counters from GpuPoolManager
 * Prevents workers from being incorrectly marked healthy after server restart
 */
export const gpuHealthState = pgTable("gpu_health_state", {
  id: serial("id").primaryKey(),
  
  // Worker reference
  workerId: integer("worker_id").notNull().references(() => gpuWorkers.id, { onDelete: 'cascade' }).unique(),
  
  // Failed health checks counter (max 3 before removal)
  failedChecks: integer("failed_checks").notNull().default(0),
  
  // Last health check status
  lastCheckSuccess: boolean("last_check_success"),
  lastCheckTime: timestamp("last_check_time"),
  lastCheckError: text("last_check_error"),
  
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  workerIdIdx: index("gpu_health_state_worker_id_idx").on(table.workerId),
  failedChecksIdx: index("gpu_health_state_failed_checks_idx").on(table.failedChecks),
}));

export const insertGpuHealthStateSchema = createInsertSchema(gpuHealthState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGpuHealthState = z.infer<typeof insertGpuHealthStateSchema>;
export type GpuHealthState = typeof gpuHealthState.$inferSelect;

/**
 * GPU Request State - Persists active request counters from GpuLoadBalancer
 * Enables accurate "least-busy" load balancing after server restart
 */
export const gpuRequestState = pgTable("gpu_request_state", {
  id: serial("id").primaryKey(),
  
  // Worker reference
  workerId: integer("worker_id").notNull().references(() => gpuWorkers.id, { onDelete: 'cascade' }).unique(),
  
  // Active requests counter (for least-busy strategy)
  activeRequests: integer("active_requests").notNull().default(0),
  
  // Last request tracking
  lastRequestStarted: timestamp("last_request_started"),
  lastRequestCompleted: timestamp("last_request_completed"),
  
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  workerIdIdx: index("gpu_request_state_worker_id_idx").on(table.workerId),
  activeRequestsIdx: index("gpu_request_state_active_requests_idx").on(table.activeRequests),
}));

export const insertGpuRequestStateSchema = createInsertSchema(gpuRequestState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGpuRequestState = z.infer<typeof insertGpuRequestStateSchema>;
export type GpuRequestState = typeof gpuRequestState.$inferSelect;

/**
 * GPU Session State - Persists active Colab/Kaggle sessions with intelligent quota tracking
 * CRITICAL: Prevents quota leakage after server restart (GPUs running without AION control)
 * 
 * QUOTA MANAGEMENT (70% SAFETY LIMIT):
 * - Kaggle: 30h/week (70% = 21h), 12h/session (70% = 8.4h), 1 concurrent
 * - Colab: 12h/session (70% = 8.4h), 36h cooldown
 */
export const gpuProviderEnum = pgEnum("gpu_provider_enum", ["kaggle", "colab"]);

export const gpuSessionState = pgTable("gpu_session_state", {
  id: serial("id").primaryKey(),
  
  // Worker reference
  workerId: integer("worker_id").notNull().references(() => gpuWorkers.id, { onDelete: 'cascade' }).unique(),
  
  // Provider type
  provider: gpuProviderEnum("provider").notNull(),
  
  // Session identification
  puppeteerSessionId: varchar("puppeteer_session_id", { length: 255 }),
  ngrokUrl: text("ngrok_url"),
  
  // Session timing
  sessionStarted: timestamp("session_started").notNull(),
  sessionDurationMs: integer("session_duration_ms").default(0), // Updated periodically
  
  // Quota tracking (70% safety limits)
  maxSessionDurationMs: integer("max_session_duration_ms").notNull(), // Kaggle: 8.4h, Colab: 8.4h (70% of 12h)
  weeklyQuotaUsedMs: integer("weekly_quota_used_ms").default(0), // Kaggle only: track 21h/week (70% of 30h)
  weeklyQuotaLimitMs: integer("weekly_quota_limit_ms"), // Kaggle: 21h (75600000ms)
  weeklyQuotaResetAt: timestamp("weekly_quota_reset_at"), // Kaggle: Monday 00:00 UTC
  
  // Cooldown tracking (Colab only)
  cooldownUntil: timestamp("cooldown_until"), // Colab: 36h after session ends
  
  // Keep-alive tracking
  lastKeepAlive: timestamp("last_keep_alive"),
  keepAliveIntervalMs: integer("keep_alive_interval_ms").default(3600000), // 60min default
  
  // Auto-shutdown tracking
  autoShutdownAt: timestamp("auto_shutdown_at"), // When to force shutdown (11h for safety)
  shutdownReason: varchar("shutdown_reason", { length: 100 }), // "quota_70%_reached" | "max_duration" | "manual" | "error"
  
  // Browser state (for recovery - not fully recoverable but useful for cleanup)
  browserUserDataDir: text("browser_user_data_dir"),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  workerIdIdx: index("gpu_session_state_worker_id_idx").on(table.workerId),
  providerIdx: index("gpu_session_state_provider_idx").on(table.provider),
  isActiveIdx: index("gpu_session_state_is_active_idx").on(table.isActive),
  autoShutdownAtIdx: index("gpu_session_state_auto_shutdown_at_idx").on(table.autoShutdownAt),
}));

export const insertGpuSessionStateSchema = createInsertSchema(gpuSessionState).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGpuSessionState = z.infer<typeof insertGpuSessionStateSchema>;
export type GpuSessionState = typeof gpuSessionState.$inferSelect;

// ============================================================================
// MULTIMODAL MEDIA GENERATION - Autonomous Image/GIF Generation (Colab/Kaggle)
// ============================================================================

// API Quota Tracking - Tracks external API quotas (Tenor, YouTube, etc)
export const apiQuotas = pgTable("api_quotas", {
  id: serial("id").primaryKey(),
  
  // API identification
  provider: text("provider").notNull().unique(), // "tenor" | "youtube" | "giphy" | "other"
  
  // Quota limits
  quotaLimit: integer("quota_limit").notNull(), // Max requests per period
  quotaPeriod: text("quota_period").notNull(), // "second" | "hour" | "day" | "week" | "month"
  
  // Current usage
  quotaUsed: integer("quota_used").notNull().default(0),
  quotaRemaining: integer("quota_remaining").notNull(),
  
  // Reset tracking
  periodStartedAt: timestamp("period_started_at").notNull().defaultNow(),
  nextResetAt: timestamp("next_reset_at").notNull(),
  
  // Safety thresholds
  warningThreshold: real("warning_threshold").notNull().default(0.6), // 60% warning
  blockThreshold: real("block_threshold").notNull().default(0.7), // 70% block
  
  // Status
  isBlocked: boolean("is_blocked").notNull().default(false),
  lastWarningAt: timestamp("last_warning_at"),
  
  // Metadata
  metadata: jsonb("metadata").$type<{
    apiKeyHash?: string; // SHA256 hash for audit
    costPerRequest?: number;
    documentsUrl?: string;
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  providerIdx: index("api_quotas_provider_idx").on(table.provider),
}));

export const insertApiQuotaSchema = createInsertSchema(apiQuotas).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertApiQuota = z.infer<typeof insertApiQuotaSchema>;
export type ApiQuota = typeof apiQuotas.$inferSelect;

// Generated Media - Historical record of all generated images/GIFs
export const generatedMedia = pgTable("generated_media", {
  id: serial("id").primaryKey(),
  
  // Media identification
  type: text("type").notNull(), // "image" | "gif" | "video"
  prompt: text("prompt").notNull(),
  
  // Generation method
  generationMethod: text("generation_method").notNull(), // "autonomous_colab" | "autonomous_kaggle" | "pollinations" | "dalle" | "tenor" | "other"
  provider: text("provider"), // "colab" | "kaggle" | "pollinations" | "openai" | "tenor" etc
  
  // Output
  url: text("url").notNull(),
  localPath: text("local_path"),
  width: integer("width"),
  height: integer("height"),
  durationSeconds: real("duration_seconds"), // For GIFs/videos
  fileSize: integer("file_size"), // bytes
  
  // Performance metrics
  generationTimeSeconds: real("generation_time_seconds"),
  costUsd: real("cost_usd").default(0), // 0 for autonomous, >0 for paid APIs
  
  // Quality metrics
  revisedPrompt: text("revised_prompt"), // If API revised the prompt
  qualityScore: real("quality_score"), // 0-1 if evaluated
  
  // KB-aware metadata
  usedKnowledgeBase: boolean("used_knowledge_base").notNull().default(false),
  knowledgeBaseContext: text("knowledge_base_context"), // Which KB documents were used
  
  // Association
  conversationId: integer("conversation_id").references(() => conversations.id),
  userId: varchar("user_id").references(() => users.id),
  
  // Metadata
  metadata: jsonb("metadata").$type<{
    model?: string; // "stable-diffusion-xl" | "animatediff" | etc
    steps?: number;
    cfg_scale?: number;
    seed?: number;
    negative_prompt?: string;
    style?: string;
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  typeIdx: index("generated_media_type_idx").on(table.type),
  providerIdx: index("generated_media_provider_idx").on(table.provider),
  conversationIdx: index("generated_media_conversation_idx").on(table.conversationId),
  createdIdx: index("generated_media_created_idx").on(table.createdAt),
}));

export const insertGeneratedMediaSchema = createInsertSchema(generatedMedia).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertGeneratedMedia = z.infer<typeof insertGeneratedMediaSchema>;
export type GeneratedMedia = typeof generatedMedia.$inferSelect;

// Media Generation Jobs - Tracks Colab/Kaggle GPU jobs for image/GIF generation
export const mediaGenerationJobs = pgTable("media_generation_jobs", {
  id: serial("id").primaryKey(),
  
  // Job identification
  jobType: text("job_type").notNull(), // "image" | "gif" | "video"
  prompt: text("prompt").notNull(),
  
  // GPU assignment
  provider: text("provider").notNull(), // "colab" | "kaggle"
  gpuWorkerId: integer("gpu_worker_id").references(() => gpuWorkers.id),
  
  // Status tracking
  status: text("status").notNull().default("pending"), // "pending" | "queued" | "generating" | "completed" | "failed" | "cancelled"
  progress: real("progress").notNull().default(0), // 0-1
  
  // Timing
  queuedAt: timestamp("queued_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  estimatedCompletionAt: timestamp("estimated_completion_at"),
  
  // Output
  resultUrl: text("result_url"),
  localPath: text("local_path"),
  errorMessage: text("error_message"),
  
  // GPU quota tracking (CRITICAL: 70% threshold enforcement)
  quotaUsedPercent: real("quota_used_percent"), // Provider quota used BEFORE this job
  estimatedQuotaCost: real("estimated_quota_cost"), // Estimated hours/quota this job will consume
  wouldExceedThreshold: boolean("would_exceed_threshold").notNull().default(false), // Would this job exceed 70%?
  
  // ToS Compliance tracking
  isStaggeredRotation: boolean("is_staggered_rotation").notNull().default(false), // Was rotation rule followed?
  previousProvider: text("previous_provider"), // Last provider used (for rotation validation)
  rotationViolation: boolean("rotation_violation").notNull().default(false), // Did this violate staggered rotation?
  
  // Performance
  generationTimeSeconds: real("generation_time_seconds"),
  
  // Association
  conversationId: integer("conversation_id").references(() => conversations.id),
  userId: varchar("user_id").references(() => users.id),
  generatedMediaId: integer("generated_media_id").references(() => generatedMedia.id), // Link to result
  
  // Configuration
  parameters: jsonb("parameters").$type<{
    size?: string; // "1024x1024" | "1024x1792" etc
    quality?: string; // "standard" | "hd"
    style?: string; // "vivid" | "natural" | "realistic" | "animated"
    frames?: number; // For GIFs: 16-24
    fps?: number; // For GIFs: 8-16
    model?: string; // "stable-diffusion-xl" | "animatediff"
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("media_generation_jobs_status_idx").on(table.status),
  providerIdx: index("media_generation_jobs_provider_idx").on(table.provider),
  gpuWorkerIdx: index("media_generation_jobs_gpu_worker_idx").on(table.gpuWorkerId),
  createdIdx: index("media_generation_jobs_created_idx").on(table.createdAt),
}));

export const insertMediaGenerationJobSchema = createInsertSchema(mediaGenerationJobs).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertMediaGenerationJob = z.infer<typeof insertMediaGenerationJobSchema>;
export type MediaGenerationJob = typeof mediaGenerationJobs.$inferSelect;

// ============================================================================
// FEDERATED LEARNING SYSTEM - Distributed Training with Multi-GPU
// ============================================================================

// Training Jobs - Coordina treinamento distribuído entre múltiplas GPUs
export const trainingJobs = pgTable("training_jobs", {
  id: serial("id").primaryKey(),
  
  // Job identification
  name: text("name").notNull(),
  description: text("description"),
  
  // Model configuration
  modelType: text("model_type").notNull(), // "llama-3-8b" | "mistral-7b" | "phi-3"
  baseCheckpoint: text("base_checkpoint"), // URL or path to starting checkpoint
  
  // Dataset configuration
  datasetPath: text("dataset_path").notNull(), // Path to full dataset
  datasetSize: integer("dataset_size").notNull(), // Total examples
  chunkSize: integer("chunk_size").notNull(), // Examples per GPU chunk
  totalChunks: integer("total_chunks").notNull(), // Total number of chunks
  
  // Training hyperparameters
  hyperparameters: jsonb("hyperparameters").notNull().$type<{
    learning_rate: number;
    batch_size: number;
    epochs: number;
    max_steps?: number;
    warmup_steps?: number;
    weight_decay?: number;
    gradient_accumulation_steps?: number;
  }>(),
  
  // Federated Learning settings
  fedConfig: jsonb("fed_config").notNull().$type<{
    aggregation_algorithm: "fedavg" | "fedprox" | "fedadam"; // FedAvg is default
    sync_interval: number; // Steps between gradient syncs
    min_workers: number; // Minimum workers to start
    max_workers: number; // Maximum workers allowed
  }>(),
  
  // Progress tracking
  status: text("status").notNull().default("pending"), // "pending" | "running" | "paused" | "completed" | "failed"
  currentStep: integer("current_step").notNull().default(0),
  totalSteps: integer("total_steps").notNull(),
  globalLoss: real("global_loss"), // Aggregated loss from all workers
  bestLoss: real("best_loss"), // Best loss achieved
  
  // Worker management
  activeWorkers: integer("active_workers").notNull().default(0),
  completedChunks: integer("completed_chunks").notNull().default(0),
  
  // Checkpoints
  latestCheckpoint: text("latest_checkpoint"), // Path/URL to latest model checkpoint
  checkpointInterval: integer("checkpoint_interval").notNull().default(100), // Save every N steps
  
  // Deployment (P0.3 - Fine-Tune Deployment Logic)
  deployed: boolean("deployed").notNull().default(false), // Se o modelo foi deployed
  deployedAt: timestamp("deployed_at"), // When deployed to production
  modelVersion: text("model_version"), // Deployed version identifier (e.g., "v1234567890-job123")
  deploymentError: text("deployment_error"), // Error message if deployment failed
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  statusIdx: index("training_jobs_status_idx").on(table.status),
  deployedIdx: index("training_jobs_deployed_idx").on(table.deployed),
  // Composite index for admin dashboard queries (status + date ordering)
  statusCreatedIdx: index("training_jobs_status_created_idx").on(table.status, table.createdAt),
}));

export const insertTrainingJobSchema = createInsertSchema(trainingJobs).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  currentStep: true,
  activeWorkers: true,
  completedChunks: true,
});
export type InsertTrainingJob = z.infer<typeof insertTrainingJobSchema>;
export type TrainingJob = typeof trainingJobs.$inferSelect;

// Training Workers - Alocação de GPU workers para jobs de treinamento
export const trainingWorkers = pgTable("training_workers", {
  id: serial("id").primaryKey(),
  
  // Relationships
  jobId: integer("job_id").notNull().references(() => trainingJobs.id),
  workerId: integer("worker_id").notNull().references(() => gpuWorkers.id),
  
  // Chunk assignment
  assignedChunk: integer("assigned_chunk").notNull(), // Which chunk (0-indexed)
  chunkStartIdx: integer("chunk_start_idx").notNull(), // Dataset start index
  chunkEndIdx: integer("chunk_end_idx").notNull(), // Dataset end index
  
  // Progress tracking
  status: text("status").notNull().default("assigned"), // "assigned" | "training" | "syncing" | "completed" | "failed"
  currentStep: integer("current_step").notNull().default(0),
  localLoss: real("local_loss"), // Current loss on this worker
  
  // Performance metrics
  stepsPerSecond: real("steps_per_second"),
  lastSyncAt: timestamp("last_sync_at"),
  totalSyncs: integer("total_syncs").notNull().default(0),
  
  // Error handling
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  jobIdx: index("training_workers_job_idx").on(table.jobId),
  workerIdx: index("training_workers_worker_idx").on(table.workerId),
  statusIdx: index("training_workers_status_idx").on(table.status),
  // Composite index for job monitoring queries (job + status)
  jobStatusIdx: index("training_workers_job_status_idx").on(table.jobId, table.status),
}));

export const insertTrainingWorkerSchema = createInsertSchema(trainingWorkers).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  currentStep: true,
  totalSyncs: true,
  retryCount: true,
});
export type InsertTrainingWorker = z.infer<typeof insertTrainingWorkerSchema>;
export type TrainingWorker = typeof trainingWorkers.$inferSelect;

// Uploaded Adapters - PEFT adapter uploads from workers for aggregation
export const uploadedAdapters = pgTable("uploaded_adapters", {
  id: serial("id").primaryKey(),
  
  // Relationships
  jobId: integer("job_id").notNull().references(() => trainingJobs.id, { onDelete: 'cascade' }),
  workerId: integer("worker_id").notNull().references(() => gpuWorkers.id),
  
  // Adapter metadata
  step: integer("step").notNull(), // Training step when adapter was saved
  numExamples: integer("num_examples").notNull(), // Number of examples used (for weighted averaging)
  filePath: text("file_path").notNull(), // Path to uploaded .tar.gz file
  fileSize: integer("file_size").notNull(), // File size in bytes
  
  // Aggregation status
  aggregated: boolean("aggregated").notNull().default(false), // Whether this adapter was included in aggregation
  aggregationId: integer("aggregation_id"), // Which aggregation batch included this
  
  // Timestamps
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
}, (table) => ({
  jobIdx: index("uploaded_adapters_job_idx").on(table.jobId),
  stepIdx: index("uploaded_adapters_step_idx").on(table.step),
  aggregatedIdx: index("uploaded_adapters_aggregated_idx").on(table.aggregated),
}));

export const insertUploadedAdapterSchema = createInsertSchema(uploadedAdapters).omit({ 
  id: true, 
  uploadedAt: true,
  aggregated: true,
});
export type InsertUploadedAdapter = z.infer<typeof insertUploadedAdapterSchema>;
export type UploadedAdapter = typeof uploadedAdapters.$inferSelect;

// Model Checkpoints - Armazena checkpoints do modelo global
export const modelCheckpoints = pgTable("model_checkpoints", {
  id: serial("id").primaryKey(),
  
  // Relationships
  jobId: integer("job_id").notNull().references(() => trainingJobs.id),
  
  // Checkpoint metadata
  step: integer("step").notNull(), // Global step
  globalLoss: real("global_loss").notNull(),
  checkpointType: text("checkpoint_type").notNull(), // "scheduled" | "best" | "final"
  
  // Storage
  storagePath: text("storage_path").notNull(), // S3/local path to checkpoint file
  modelSize: integer("model_size"), // File size in bytes
  
  // Aggregation info
  contributingWorkers: integer("contributing_workers").notNull(), // How many workers contributed
  aggregationMethod: text("aggregation_method").notNull().default("fedavg"),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  jobIdx: index("model_checkpoints_job_idx").on(table.jobId),
  stepIdx: index("model_checkpoints_step_idx").on(table.step),
}));

export const insertModelCheckpointSchema = createInsertSchema(modelCheckpoints).omit({ 
  id: true, 
  createdAt: true,
});
export type InsertModelCheckpoint = z.infer<typeof insertModelCheckpointSchema>;
export type ModelCheckpoint = typeof modelCheckpoints.$inferSelect;

// Gradient Updates - Rastreia updates de gradientes das GPUs
export const gradientUpdates = pgTable("gradient_updates", {
  id: serial("id").primaryKey(),
  
  // Relationships
  jobId: integer("job_id").notNull().references(() => trainingJobs.id),
  workerId: integer("worker_id").notNull().references(() => gpuWorkers.id),
  
  // Update metadata
  step: integer("step").notNull(), // Global step
  localStep: integer("local_step").notNull(), // Worker's local step
  localLoss: real("local_loss").notNull(),
  
  // Gradient data
  gradientStoragePath: text("gradient_storage_path"), // Path to serialized gradients
  gradientNorm: real("gradient_norm"), // L2 norm of gradients
  numExamples: integer("num_examples").notNull(), // Examples used in this update
  
  // Status
  status: text("status").notNull().default("pending"), // "pending" | "aggregated" | "applied"
  aggregatedInStep: integer("aggregated_in_step"), // Which global step used this update
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  aggregatedAt: timestamp("aggregated_at"),
}, (table) => ({
  jobIdx: index("gradient_updates_job_idx").on(table.jobId),
  workerIdx: index("gradient_updates_worker_idx").on(table.workerId),
  stepIdx: index("gradient_updates_step_idx").on(table.step),
  statusIdx: index("gradient_updates_status_idx").on(table.status),
}));

export const insertGradientUpdateSchema = createInsertSchema(gradientUpdates).omit({ 
  id: true, 
  createdAt: true,
});
export type InsertGradientUpdate = z.infer<typeof insertGradientUpdateSchema>;
export type GradientUpdate = typeof gradientUpdates.$inferSelect;

// ============================================================================
// DATASETS - Training datasets storage and management
// ============================================================================
export const datasets = pgTable("datasets", {
  id: serial("id").primaryKey(),
  
  // Ownership
  userId: varchar("user_id").references(() => users.id),
  
  // Dataset metadata
  name: text("name").notNull(),
  description: text("description"),
  datasetType: text("dataset_type").notNull(), // "text" | "chat" | "instruction" | "qa" | "custom"
  
  // File information
  originalFilename: text("original_filename").notNull(),
  fileSize: integer("file_size").notNull(), // Size in bytes
  fileMimeType: text("file_mime_type").notNull(),
  storagePath: text("storage_path").notNull(), // Local or cloud storage path
  
  // Dataset statistics
  totalExamples: integer("total_examples").notNull().default(0),
  averageLength: integer("average_length"), // Average tokens per example
  minLength: integer("min_length"),
  maxLength: integer("max_length"),
  
  // Processing status
  status: text("status").notNull().default("uploaded"), // "uploaded" | "processing" | "ready" | "failed"
  processingError: text("processing_error"),
  
  // Validation
  isValid: boolean("is_valid").notNull().default(false),
  validationErrors: jsonb("validation_errors").$type<string[]>(),
  
  // Schema information for structured datasets
  schema: jsonb("schema").$type<{
    columns?: string[];
    inputField?: string;
    outputField?: string;
    format?: string; // "jsonl" | "csv" | "parquet" etc
  }>(),
  
  // Source tracking for lifecycle management (preservation clauses)
  sourceDocumentIds: integer("source_document_ids").array(),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  userIdx: index("datasets_user_idx").on(table.userId),
  statusIdx: index("datasets_status_idx").on(table.status),
}));

export const insertDatasetSchema = createInsertSchema(datasets).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true,
  sourceDocumentIds: true, // Populated automatically during dataset creation
});
export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type Dataset = typeof datasets.$inferSelect;

// ============================================================================
// TRAINING_DATA_COLLECTION - Auto-evolution from conversations
// Tracks high-quality conversations for model fine-tuning
// ============================================================================
export const trainingDataCollection = pgTable("training_data_collection", {
  id: serial("id").primaryKey(),
  
  // Source conversation (nullable for standalone training examples)
  conversationId: integer("conversation_id").references(() => conversations.id),
  
  // Quality metrics
  rating: integer("rating"), // 1-5 stars (optional user feedback)
  autoQualityScore: integer("auto_quality_score"), // 0-100 (automatic scoring based on tokens, latency, etc)
  
  // Approval workflow
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected" | "trained"
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  
  // Training integration
  datasetId: integer("dataset_id").references(() => datasets.id), // Created dataset from this conversation
  trainingJobId: integer("training_job_id").references(() => trainingJobs.id), // Training job using this data
  
  // Converted training data (JSONL format for instruction tuning)
  formattedData: jsonb("formatted_data").$type<{
    instruction: string;
    input?: string;
    output: string;
    system?: string;
  }[]>(),
  
  // Metadata
  metadata: jsonb("metadata").$type<{
    messageCount?: number;
    totalTokens?: number;
    avgLatency?: number;
    providers?: string[]; // Which LLMs were used
    toolsUsed?: string[]; // Which tools were invoked
    hasAttachments?: boolean;
    documentIds?: number[]; // Source KB documents used to create this training data
    namespaces?: string[]; // Namespaces where this training data applies
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  conversationIdx: index("training_data_conversation_idx").on(table.conversationId),
  statusIdx: index("training_data_status_idx").on(table.status),
  ratingIdx: index("training_data_rating_idx").on(table.rating),
}));

export const insertTrainingDataCollectionSchema = createInsertSchema(trainingDataCollection).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTrainingDataCollection = z.infer<typeof insertTrainingDataCollectionSchema>;
export type TrainingDataCollection = typeof trainingDataCollection.$inferSelect;

// ============================================================================
// LIFECYCLE_AUDIT_LOGS - LGPD/GDPR Compliance Audit Trail
// Tracks all lifecycle management operations for regulatory compliance
// ============================================================================
export const lifecycleAuditLogs = pgTable("lifecycle_audit_logs", {
  id: serial("id").primaryKey(),
  
  // Operation details
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  module: text("module").notNull(), // "conversations" | "trainingData" | "datasets" | etc
  policyName: text("policy_name").notNull(), // Policy that triggered this operation
  action: text("action").notNull(), // "cleanup_expired" | "archive" | "purge" | etc
  
  // Impact metrics
  recordsAffected: integer("records_affected").notNull().default(0),
  preservedRecords: integer("preserved_records").notNull().default(0), // Records saved due to preservation clauses
  
  // Error tracking
  errors: jsonb("errors").$type<string[]>().default([]),
  
  // Additional context
  metadata: jsonb("metadata").$type<{
    policyVersion?: string;
    scheduledRun?: boolean;
    manualTrigger?: boolean;
    userId?: string; // Admin who triggered manual cleanup
    retentionDays?: number;
    preservationClauses?: string[]; // Which preservation rules were applied
    affectedIds?: number[]; // Sample of affected record IDs
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  moduleIdx: index("lifecycle_audit_module_idx").on(table.module),
  timestampIdx: index("lifecycle_audit_timestamp_idx").on(table.timestamp),
  policyIdx: index("lifecycle_audit_policy_idx").on(table.policyName),
}));

export const insertLifecycleAuditLogSchema = createInsertSchema(lifecycleAuditLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertLifecycleAuditLog = z.infer<typeof insertLifecycleAuditLogSchema>;
export type LifecycleAuditLog = typeof lifecycleAuditLogs.$inferSelect;

// ============================================================================
// MULTI-AGENT SYSTEM - Agents, Tools, and Traces
// ============================================================================

/**
 * Agents - Specialist agents with scoped knowledge bases and tools
 * Each agent has:
 * - Dedicated system prompt and inference config
 * - Scoped RAG namespaces (e.g., "finance/*", "tech/code/*")
 * - Allowed tools (e.g., whatsapp, crm, payments)
 * - Policy controls (budget, fan-out, escalation rules)
 */
export const agents = pgTable("agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  type: varchar("type", { length: 32 }).notNull().default("specialist"), // specialist|generalist|router-only
  
  // NEW: Agent tier for hierarchical organization (aligned with namespaces)
  agentTier: varchar("agent_tier", { length: 16 }).notNull().default("agent"), // "agent" | "subagent"
  
  // NEW: Assigned namespaces for automatic hierarchy inference
  // - Agents: 1 namespace (root, e.g., "financas")
  // - SubAgents: N subnamespaces with same prefix (e.g., ["financas/investimentos", "financas/impostos"])
  assignedNamespaces: jsonb("assigned_namespaces").$type<string[]>().default([]),
  
  description: text("description"),
  systemPrompt: text("system_prompt"),
  inferenceConfig: jsonb("inference_config").$type<{
    model?: string;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    adapterIds?: string[]; // LoRA adapter IDs for custom fine-tuned models
  }>(),
  policy: jsonb("policy").$type<{
    allowedTools?: string[];
    allowedNamespaces?: string[];
    perRequestBudgetUSD?: number;
    maxAgentsFanOut?: number;
    fallbackHuman?: boolean;
    escalationRules?: {
      lowConfidenceThreshold?: number;
      negativeSentiment?: boolean;
    };
  }>(),
  ragNamespaces: jsonb("rag_namespaces").$type<string[]>(), // LEGACY: Use assignedNamespaces instead
  budgetLimit: real("budget_limit"), // Optional per-agent budget limit in USD
  escalationAgent: varchar("escalation_agent", { length: 120 }), // Optional agent ID to escalate to
  metadata: jsonb("metadata"), // Optional metadata for custom agent properties
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agents).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
}).extend({
  // Enhanced validations for agent tier and namespace assignment
  agentTier: z.enum(["agent", "subagent"]).default("agent"),
  assignedNamespaces: z.array(z.string()).default([]).refine(
    (namespaces) => {
      if (namespaces.length === 0) return true; // Allow empty for now
      
      // For subagents: all namespaces must have same prefix (e.g., "financas/investimentos", "financas/impostos")
      if (namespaces.some(ns => ns.includes("/"))) {
        const prefixes = namespaces.map(ns => ns.split("/")[0]);
        const uniquePrefixes = new Set(prefixes);
        return uniquePrefixes.size === 1; // All must share same root namespace
      }
      
      return true;
    },
    {
      message: "SubAgent namespaces must all belong to the same parent namespace (e.g., 'financas/investimentos', 'financas/impostos')"
    }
  ),
});

export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agents.$inferSelect;

/**
 * Agent Relationships - Hierarchical parent-child agent orchestration
 * Parent agents can delegate to specialized sub-agents
 * Based on SOTA 2024-2025 research: HALO, Puppeteer, MoA architectures
 */
export const agentRelationships = pgTable("agent_relationships", {
  id: serial("id").primaryKey(),
  parentAgentId: varchar("parent_agent_id", { length: 120 }).notNull().references(() => agents.id),
  childAgentId: varchar("child_agent_id", { length: 120 }).notNull().references(() => agents.id),
  
  // Delegation configuration
  delegationMode: varchar("delegation_mode", { length: 32 }).notNull().default("dynamic"), // "always" | "dynamic" | "fallback"
  budgetSharePercent: real("budget_share_percent").notNull().default(0.4), // IMPORTANT: 0.0-1.0 range (0.4 = 40%, NOT 40)
  maxDepth: integer("max_depth").notNull().default(3), // Max recursion depth
  
  // Tool & namespace overrides
  toolDelta: jsonb("tool_delta").$type<{
    add?: string[]; // Additional tools for child
    remove?: string[]; // Tools to exclude from inheritance
  }>(),
  namespaceSuffix: varchar("namespace_suffix", { length: 256 }), // Append to parent namespace (e.g., "/linux" → "tech/linux/*")
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  parentIdx: index("agent_relationships_parent_idx").on(table.parentAgentId),
  childIdx: index("agent_relationships_child_idx").on(table.childAgentId),
}));

export const insertAgentRelationshipSchema = createInsertSchema(agentRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAgentRelationship = z.infer<typeof insertAgentRelationshipSchema>;
export type AgentRelationship = typeof agentRelationships.$inferSelect;

/**
 * Agent Budget Snapshots - Track budget consumption per agent/session
 * Enables dynamic budget allocation and cost monitoring
 */
export const agentBudgets = pgTable("agent_budgets", {
  id: serial("id").primaryKey(),
  agentId: varchar("agent_id", { length: 120 }).notNull().references(() => agents.id),
  sessionId: varchar("session_id", { length: 256 }).notNull(),
  
  // Budget tracking
  allocatedUSD: real("allocated_usd").notNull(),
  consumedUSD: real("consumed_usd").notNull().default(0),
  remainingUSD: real("remaining_usd").notNull(),
  
  // Metrics
  requestCount: integer("request_count").notNull().default(0),
  tokenCount: integer("token_count").notNull().default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  agentSessionIdx: index("agent_budgets_agent_session_idx").on(table.agentId, table.sessionId),
}));

export const insertAgentBudgetSchema = createInsertSchema(agentBudgets).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});
export type InsertAgentBudget = z.infer<typeof insertAgentBudgetSchema>;
export type AgentBudget = typeof agentBudgets.$inferSelect;

/**
 * Agent Traces - Detailed parent→child delegation chain tracking
 * Enables observability, debugging, and performance optimization
 */
export const agentTraces = pgTable("agent_traces", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 256 }).notNull(),
  traceId: varchar("trace_id", { length: 256 }).notNull(),
  
  // Agent chain
  parentAgentId: varchar("parent_agent_id", { length: 120 }).references(() => agents.id),
  currentAgentId: varchar("current_agent_id", { length: 120 }).notNull().references(() => agents.id),
  depth: integer("depth").notNull().default(0), // 0 = root, 1 = child, 2 = grandchild, etc
  
  // Execution details
  query: text("query").notNull(),
  result: text("result"),
  confidence: real("confidence"), // 0-1 confidence score from agent
  
  // Performance metrics
  latencyMs: integer("latency_ms"),
  tokensUsed: integer("tokens_used"),
  costUSD: real("cost_usd"),
  
  // Metadata
  metadata: jsonb("metadata").$type<{
    toolsUsed?: string[];
    namespace?: string;
    model?: string;
    error?: string;
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  sessionIdx: index("agent_traces_session_idx").on(table.sessionId),
  traceIdx: index("agent_traces_trace_idx").on(table.traceId),
  agentIdx: index("agent_traces_agent_idx").on(table.currentAgentId),
}));

export const insertAgentTraceSchema = createInsertSchema(agentTraces).omit({
  id: true,
  createdAt: true
});
export type InsertAgentTrace = z.infer<typeof insertAgentTraceSchema>;
export type AgentTrace = typeof agentTraces.$inferSelect;

/**
 * Tools - External integrations and capabilities
 * Tools can be assigned to specific agents
 */
export const tools = pgTable("tools", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(), // "whatsapp"|"crm"|"catalog"|"payments"|"calendar"|"web_search"|...
  config: jsonb("config"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertToolSchema = createInsertSchema(tools).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertTool = z.infer<typeof insertToolSchema>;
export type Tool = typeof tools.$inferSelect;

/**
 * Agent-Tools mapping (many-to-many)
 */
export const agentTools = pgTable("agent_tools", {
  agentId: varchar("agent_id").notNull().references(() => agents.id),
  toolId: varchar("tool_id").notNull().references(() => tools.id),
});

// ============================================================================
// NAMESPACES - Knowledge base namespace management
// Allows admins to create, edit, and organize KB namespaces
// Hierarchy is AUTOMATIC via naming (e.g., "financas" → "financas/investimentos")
// ============================================================================
export const namespaces = pgTable("namespaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull().unique(), // e.g., "financas/investimentos" (serve como ID e nome de exibição)
  description: text("description"),
  icon: varchar("icon", { length: 50 }), // Lucide icon name
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameIdx: index("namespaces_name_idx").on(table.name),
}));

export const insertNamespaceSchema = createInsertSchema(namespaces).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
});
export type InsertNamespace = z.infer<typeof insertNamespaceSchema>;
export type Namespace = typeof namespaces.$inferSelect;

/**
 * Curation Queue - HITL (Human-in-the-Loop) content curation workflow
 * Stores pending content for human review before indexing into Knowledge Base
 */
export const curationQueue = pgTable("curation_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  suggestedNamespaces: jsonb("suggested_namespaces").$type<string[]>().notNull().default([]),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  
  // Multimodal attachments (images, videos, documents from web crawling or uploads)
  attachments: jsonb("attachments").$type<Array<{
    type: "image" | "video" | "audio" | "document";
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    description?: string; // AI-generated description for images
    base64?: string; // NOVO: base64 temporário para curadoria (ZERO BYPASS!)
    tempPath?: string;
    // Image deduplication hashes (perceptual + exact)
    perceptualHash?: string;  // dHash (64-bit hex) - detects visually similar images
    md5Hash?: string;         // MD5 for exact byte match
    imageDuplicationStatus?: "unique" | "exact" | "near" | null;
    imageSimilarityScore?: number;  // 0-100%
    imageDuplicateOfId?: string;    // ID do item/imagem duplicado
  }>>(),
  
  status: varchar("status", { length: 20 }).notNull().default("pending"), // "pending" | "approved" | "rejected"
  submittedBy: varchar("submitted_by", { length: 255 }),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  reviewedAt: timestamp("reviewed_at"),
  statusChangedAt: timestamp("status_changed_at"), // Timestamp when status changed
  expiresAt: timestamp("expires_at"), // Auto-deletion timestamp for rejected items (30 days after rejection)
  note: text("note"), // Admin notes (reason for rejection, etc.)
  publishedId: varchar("published_id", { length: 50 }), // Document ID after approval
  
  // Auto-quality score from chat ingestion (0-100)
  score: real("score"), // Quality score calculated by chat-ingestion.ts and quality-gates-enterprise.ts
  
  // AUTO-ANALYSIS: Structured AI analysis for automatic approval (ENTERPRISE FEATURE)
  autoAnalysis: jsonb("auto_analysis").$type<{
    score: number; // 0-100
    flags: string[]; // ["tech", "finance", "pii", etc]
    suggestedNamespaces: string[]; // Auto-detected namespaces
    reasoning: string;
    recommended: "approve" | "reject" | "review";
    concerns?: string[];
  }>(),
  
  // Deduplication fields
  contentHash: varchar("content_hash", { length: 64 }), // SHA256 hash for exact duplicate detection
  normalizedContent: text("normalized_content"), // Lowercased, trimmed content for fuzzy matching
  embedding: jsonb("embedding").$type<number[]>(), // OpenAI embedding for semantic similarity
  duplicationStatus: varchar("duplication_status", { length: 20 }), // "unique" | "exact" | "near" | null
  similarityScore: real("similarity_score"), // Cosine similarity score (0-1) if near-duplicate
  duplicateOfId: varchar("duplicate_of_id", { length: 50 }), // Reference to original KB document if duplicate
  
  // Consolidated chat conversations (HITL review for full chat sessions)
  conversationId: integer("conversation_id").references(() => conversations.id), // Optional: link to conversation
  messageTranscript: jsonb("message_transcript").$type<Array<{
    role: "user" | "assistant" | "system";
    content: string;
    attachments?: Array<{
      type: "image" | "video" | "audio" | "document";
      url: string;
      filename: string;
      mimeType: string;
      size: number;
    }>;
    createdAt?: string; // ISO timestamp
  }>>(), // Full conversation transcript for consolidated chat submissions
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  statusIdx: index("curation_queue_status_idx").on(table.status),
  submittedAtIdx: index("curation_queue_submitted_at_idx").on(table.submittedAt),
  statusChangedAtIdx: index("curation_queue_status_changed_at_idx").on(table.statusChangedAt),
  expiresAtIdx: index("curation_queue_expires_at_idx").on(table.expiresAt), // Index for daily cleanup job
  contentHashIdx: index("curation_queue_content_hash_idx").on(table.contentHash), // Index for O(1) duplicate lookup
  duplicationStatusIdx: index("curation_queue_duplication_status_idx").on(table.duplicationStatus), // Index for filtering by dedup status
  conversationIdx: index("curation_queue_conversation_idx").on(table.conversationId), // Index for conversation-linked curation items
  // Composite index for admin dashboard queries (status + date ordering)
  statusSubmittedIdx: index("curation_queue_status_submitted_idx").on(table.status, table.submittedAt),
}));

export const insertCurationQueueSchema = createInsertSchema(curationQueue).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertCurationQueue = z.infer<typeof insertCurationQueueSchema>;
export type CurationQueue = typeof curationQueue.$inferSelect;

// ============================================================================
// CURATION_ATTACHMENTS - Armazenamento permanente de anexos da curadoria
// ============================================================================
export const curationAttachments = pgTable("curation_attachments", {
  id: serial("id").primaryKey(),
  curationId: varchar("curation_id").notNull().references(() => curationQueue.id, { onDelete: 'cascade' }),
  
  // Arquivo
  fileType: varchar("file_type", { length: 20 }).notNull(), // "image" | "video" | "audio" | "document"
  storagePath: text("storage_path").notNull(), // Caminho permanente: curation_storage/pending/filename
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  size: integer("size").notNull(), // bytes
  
  // Checksums para integridade
  md5Hash: varchar("md5_hash", { length: 32 }),
  sha256Hash: varchar("sha256_hash", { length: 64 }),
  
  // Metadata adicional
  sourceUrl: text("source_url"), // URL original se foi baixado da web
  description: text("description"), // Descrição AI para imagens
  
  // Base64 temporário (apenas para preview durante curadoria, limpo após aprovação)
  tempBase64: text("temp_base64"), // Removido após aprovação para economizar espaço
  
  // Image deduplication (se aplicável)
  perceptualHash: varchar("perceptual_hash", { length: 16 }), // dHash para imagens
  imageDuplicationStatus: varchar("image_duplication_status", { length: 20 }), // "unique" | "exact" | "near"
  imageSimilarityScore: real("image_similarity_score"), // 0-100%
  imageDuplicateOfId: integer("image_duplicate_of_id"), // ID do attachment duplicado
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  curationIdIdx: index("curation_attachments_curation_id_idx").on(table.curationId),
  md5HashIdx: index("curation_attachments_md5_hash_idx").on(table.md5Hash),
  perceptualHashIdx: index("curation_attachments_perceptual_hash_idx").on(table.perceptualHash),
}));

export const insertCurationAttachmentSchema = createInsertSchema(curationAttachments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCurationAttachment = z.infer<typeof insertCurationAttachmentSchema>;
export type CurationAttachment = typeof curationAttachments.$inferSelect;

// ============================================================================
// LINK CAPTURE JOBS - Sistema de Jobs para Deep Crawling com progresso
// ============================================================================
export const linkCaptureJobs = pgTable("link_capture_jobs", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(), // URL sendo processada
  
  // Status e controle
  status: varchar("status", { length: 20 }).notNull().default("pending"), // "pending" | "running" | "paused" | "completed" | "failed" | "cancelled"
  
  // Progresso
  progress: real("progress").notNull().default(0), // 0-100
  totalItems: integer("total_items").default(0), // Total de items (páginas/imagens) estimado
  processedItems: integer("processed_items").default(0), // Items já processados
  currentItem: text("current_item"), // Descrição do item atual (ex: "Processando página X")
  
  // Controles
  paused: boolean("paused").notNull().default(false),
  cancelled: boolean("cancelled").notNull().default(false),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Error handling
  errorMessage: text("error_message"),
  
  // Metadata (opções do crawler, namespace, etc)
  metadata: jsonb("metadata").$type<{
    namespace?: string;
    mode?: "single" | "deep"; // NEW: Modo de aprendizado
    maxDepth?: number;
    maxPages?: number;
    includeImages?: boolean;
    submittedBy?: string;
  }>(),
}, (table) => ({
  statusIdx: index("link_capture_jobs_status_idx").on(table.status),
  createdAtIdx: index("link_capture_jobs_created_at_idx").on(table.createdAt),
  // Composite index for admin dashboard queries (status + date ordering)
  statusCreatedIdx: index("link_capture_jobs_status_created_idx").on(table.status, table.createdAt),
}));

export const insertLinkCaptureJobSchema = createInsertSchema(linkCaptureJobs).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertLinkCaptureJob = z.infer<typeof insertLinkCaptureJobSchema>;
export type LinkCaptureJob = typeof linkCaptureJobs.$inferSelect;

/**
 * Traces - Multi-agent execution traces for observability
 * Records router decisions, agents called, costs, and latencies
 */
export const traces = pgTable("traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  userQuery: text("user_query").notNull(),
  routerDecision: jsonb("router_decision").$type<{
    selectedAgents?: { agentId: string; score: number; reason?: string }[];
    topP?: number;
    fanOut?: number;
  }>(),
  agentsCalled: jsonb("agents_called").$type<{
    agentId: string;
    costUSD: number;
    tokens: { prompt: number; completion: number };
    latencyMs: number;
  }[]>(),
  sources: jsonb("sources").$type<{
    namespace: string;
    chunkId: string;
    score: number;
  }[]>(),
  totalCostUSD: real("total_cost_usd"),
  totalLatencyMs: integer("total_latency_ms"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTraceSchema = createInsertSchema(traces).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertTrace = z.infer<typeof insertTraceSchema>;
export type Trace = typeof traces.$inferSelect;

/**
 * SECURITY FIX: Rate Limits - Persistent rate limiting storage
 * 
 * Stores rate limit counters in PostgreSQL for persistence across restarts.
 * Prevents memory-based rate limiting bypass via server restart.
 * 
 * Key: IP address or user identifier
 * Window: "minute" | "hour" | "day"
 */
export const rateLimits = pgTable("rate_limits", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 255 }).notNull(), // IP or user ID
  window: varchar("window", { length: 10 }).notNull(), // "minute" | "hour" | "day"
  count: integer("count").notNull().default(0),
  tokens: integer("tokens").notNull().default(0), // Token usage tracking
  resetAt: timestamp("reset_at").notNull(), // When counter resets
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  // UNIQUE constraint for upsert operations (Drizzle syntax)
  keyWindowUnique: unique("rate_limits_key_window_unique").on(table.key, table.window),
  // Index for cleanup queries
  resetAtIdx: index("rate_limits_reset_at_idx").on(table.resetAt),
}));

export const insertRateLimitSchema = createInsertSchema(rateLimits).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertRateLimit = z.infer<typeof insertRateLimitSchema>;
export type RateLimit = typeof rateLimits.$inferSelect;

// ============================================================================
// RBAC - Enterprise Role-Based Access Control System
// PRODUCTION-READY: Granular permissions for ALL modules and sub-modules
// ============================================================================

/**
 * ROLES - User roles (Admin, Manager, Editor, Viewer, etc.)
 * 
 * Built-in roles that come pre-configured:
 * - Super Admin: Full access to everything
 * - Admin: Full access except system settings
 * - Manager: Can manage content and users (no system settings)
 * - Editor: Can create/edit content (no deletion or user management)
 * - Viewer: Read-only access to all content
 * - Chat User: Can only use chat interface (no admin access)
 * 
 * Custom roles can be created dynamically via UI
 */
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  isSystemRole: boolean("is_system_role").notNull().default(false), // Cannot be deleted if true
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRoleSchema = createInsertSchema(roles).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type Role = typeof roles.$inferSelect;

/**
 * PERMISSIONS - Granular permissions for ALL platform modules
 * 
 * Permission format: "module:submodule:action"
 * 
 * MODULES:
 * - dashboard: Admin dashboard overview
 * - kb: Knowledge Base (documents + images)
 * - agents: Specialist agents management
 * - curation: HITL curation queue
 * - namespaces: Knowledge namespace management
 * - gpu: GPU pool management
 * - vision: Vision system (image processing)
 * - telemetry: Analytics and metrics
 * - training: Training jobs and datasets
 * - settings: System settings
 * - users: User management
 * - chat: Chat interface
 * 
 * ACTIONS:
 * - read: View/list items
 * - create: Create new items
 * - update: Edit existing items
 * - delete: Delete items
 * - manage: Advanced management (approve/reject, assign roles, etc.)
 * - execute: Execute operations (GPU jobs, training, etc.)
 * 
 * Examples:
 * - "dashboard:overview:read" - View dashboard
 * - "kb:documents:create" - Create documents in KB
 * - "kb:documents:update" - Edit KB documents
 * - "kb:documents:delete" - Delete KB documents
 * - "kb:images:read" - View KB images
 * - "agents:list:read" - List agents
 * - "agents:create:create" - Create new agents
 * - "curation:queue:read" - View curation queue
 * - "curation:queue:manage" - Approve/reject items in queue
 * - "users:list:read" - List users
 * - "users:create:create" - Create new users
 * - "users:roles:manage" - Assign roles to users
 * - "settings:timezone:update" - Update timezone settings
 * - "gpu:pool:execute" - Execute GPU operations
 * - "training:jobs:execute" - Start training jobs
 * - "chat:messages:create" - Send chat messages
 */
export const permissions = pgTable("permissions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(), // User-friendly name (e.g., "Visualizar Usuários")
  code: varchar("code", { length: 255 }).notNull().unique(), // Auto-generated: "module:submodule:action"
  module: varchar("module", { length: 50 }).notNull(), // e.g., "kb", "agents", "users"
  submodule: varchar("submodule", { length: 50 }).notNull(), // e.g., "documents", "images", "list"
  action: varchar("action", { length: 50 }).notNull(), // e.g., "read", "write", "delete", "manage"
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  moduleIdx: index("permissions_module_idx").on(table.module),
  codeIdx: index("permissions_code_idx").on(table.code),
}));

export const insertPermissionSchema = createInsertSchema(permissions).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type Permission = typeof permissions.$inferSelect;

/**
 * USER_ROLES - Many-to-Many relationship between users and roles
 * 
 * A user can have multiple roles (e.g., Editor + Manager)
 */
export const userRoles = pgTable("user_roles", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: 'cascade' }),
  assignedBy: varchar("assigned_by").references(() => users.id), // Who assigned this role
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => ({
  userRoleUnique: unique("user_roles_user_role_unique").on(table.userId, table.roleId),
  userIdx: index("user_roles_user_idx").on(table.userId),
  roleIdx: index("user_roles_role_idx").on(table.roleId),
}));

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ 
  id: true, 
  assignedAt: true 
});
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRoles.$inferSelect;

/**
 * ROLE_PERMISSIONS - Many-to-Many relationship between roles and permissions
 * 
 * Defines which permissions each role has
 */
export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  rolePermUnique: unique("role_permissions_role_perm_unique").on(table.roleId, table.permissionId),
  roleIdx: index("role_permissions_role_idx").on(table.roleId),
  permIdx: index("role_permissions_perm_idx").on(table.permissionId),
}));

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

/**
 * USER_PERMISSIONS - User-specific permission overrides
 * 
 * Allows assigning permissions directly to users (in addition to role-based permissions)
 * Use case: Grant specific permissions to a user without changing their role
 */
export const userPermissions = pgTable("user_permissions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  permissionId: integer("permission_id").notNull().references(() => permissions.id, { onDelete: 'cascade' }),
  assignedBy: varchar("assigned_by").references(() => users.id), // Who assigned this permission
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => ({
  userPermUnique: unique("user_permissions_user_perm_unique").on(table.userId, table.permissionId),
  userIdx: index("user_permissions_user_idx").on(table.userId),
  permIdx: index("user_permissions_perm_idx").on(table.permissionId),
}));

export const insertUserPermissionSchema = createInsertSchema(userPermissions).omit({ 
  id: true, 
  assignedAt: true 
});
export type InsertUserPermission = z.infer<typeof insertUserPermissionSchema>;
export type UserPermission = typeof userPermissions.$inferSelect;

// ============================================================================
// USAGE_RECORDS - Agent and Namespace usage tracking (PRODUCTION-READY)
// ============================================================================
/**
 * Rastreia uso de agentes e namespaces com hierarquia
 * - Agentes: root agents vs subagents
 * - Namespaces: root namespaces vs sub-namespaces
 */
export const usageRecords = pgTable("usage_records", {
  id: serial("id").primaryKey(),
  
  // Entity info
  entityType: text("entity_type").notNull(), // "agent" | "namespace"
  entityId: text("entity_id").notNull(),
  entityName: text("entity_name").notNull(),
  operation: text("operation").notNull(), // "query" | "search" | "generation" | "tool_use"
  
  // Hierarchy tracking
  agentTier: text("agent_tier"), // "agent" | "subagent" (null for namespaces)
  parentAgentId: text("parent_agent_id"), // ID do agent pai (null se root agent)
  isRootNamespace: boolean("is_root_namespace"), // true se namespace raiz (null para agents)
  parentNamespace: text("parent_namespace"), // Namespace pai (null se root)
  
  // Metadata
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  
  // Timestamp
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  entityTypeIdx: index("usage_records_entity_type_idx").on(table.entityType),
  entityIdIdx: index("usage_records_entity_id_idx").on(table.entityId),
  timestampIdx: index("usage_records_timestamp_idx").on(table.timestamp),
  agentTierIdx: index("usage_records_agent_tier_idx").on(table.agentTier),
  parentAgentIdx: index("usage_records_parent_agent_idx").on(table.parentAgentId),
  parentNamespaceIdx: index("usage_records_parent_namespace_idx").on(table.parentNamespace),
}));

export const insertUsageRecordSchema = createInsertSchema(usageRecords).omit({ id: true, timestamp: true });
export type InsertUsageRecord = z.infer<typeof insertUsageRecordSchema>;
export type UsageRecord = typeof usageRecords.$inferSelect;

// ============================================================================
// NAMESPACE_RELEVANCE_RECORDS - KB search quality tracking (PRODUCTION-READY)
// ============================================================================
/**
 * Rastreia qualidade real de buscas RAG por namespace
 * - Scores de similaridade coseno (0-1)
 * - Quantidade de resultados retornados
 */
export const namespaceRelevanceRecords = pgTable("namespace_relevance_records", {
  id: serial("id").primaryKey(),
  
  namespace: text("namespace").notNull(),
  avgRelevanceScore: real("avg_relevance_score").notNull(), // 0-1 (cosine similarity)
  resultCount: integer("result_count").notNull(),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  namespaceIdx: index("namespace_relevance_namespace_idx").on(table.namespace),
  timestampIdx: index("namespace_relevance_timestamp_idx").on(table.timestamp),
}));

export const insertNamespaceRelevanceRecordSchema = createInsertSchema(namespaceRelevanceRecords).omit({ 
  id: true, 
  timestamp: true 
});
export type InsertNamespaceRelevanceRecord = z.infer<typeof insertNamespaceRelevanceRecordSchema>;
export type NamespaceRelevanceRecord = typeof namespaceRelevanceRecords.$inferSelect;

// ============================================================================
// QUERY_METRICS - API latency and performance tracking (PRODUCTION-READY)
// ============================================================================
/**
 * Rastreia métricas de performance de queries
 * - Latência em ms
 * - Success/error rates
 * - Provider usado
 */
export const queryMetrics = pgTable("query_metrics", {
  id: serial("id").primaryKey(),
  
  // Query info
  queryType: text("query_type").notNull(), // "chat" | "embedding" | "rag" | "tool"
  provider: text("provider"), // "openai" | "groq" | "kb" | "web" etc
  
  // Performance
  latencyMs: integer("latency_ms").notNull(),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  
  // Metadata
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  queryTypeIdx: index("query_metrics_query_type_idx").on(table.queryType),
  providerIdx: index("query_metrics_provider_idx").on(table.provider),
  timestampIdx: index("query_metrics_timestamp_idx").on(table.timestamp),
  latencyIdx: index("query_metrics_latency_idx").on(table.latencyMs),
}));

export const insertQueryMetricSchema = createInsertSchema(queryMetrics).omit({ id: true, timestamp: true });
export type InsertQueryMetric = z.infer<typeof insertQueryMetricSchema>;
export type QueryMetric = typeof queryMetrics.$inferSelect;

// ============================================================================
// AGENT_QUERY_RESULTS - Agent execution results (PRODUCTION-READY)
// ============================================================================
/**
 * Rastreia resultados de execuções de agentes ReAct
 * - Total steps, sucesso/falha
 * - Tokens usados, latência
 */
export const agentQueryResults = pgTable("agent_query_results", {
  id: serial("id").primaryKey(),
  
  // Agent info
  agentId: text("agent_id"),
  agentName: text("agent_name"),
  
  // Query
  query: text("query").notNull(),
  
  // Results
  totalSteps: integer("total_steps").notNull(),
  success: boolean("success").notNull(),
  finalAnswer: text("final_answer"),
  
  // Performance
  latencyMs: integer("latency_ms").notNull(),
  tokensUsed: integer("tokens_used").default(0),
  
  // Metadata (tools used, etc)
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  agentIdIdx: index("agent_query_results_agent_id_idx").on(table.agentId),
  timestampIdx: index("agent_query_results_timestamp_idx").on(table.timestamp),
  successIdx: index("agent_query_results_success_idx").on(table.success),
}));

export const insertAgentQueryResultSchema = createInsertSchema(agentQueryResults).omit({ 
  id: true, 
  timestamp: true 
});
export type InsertAgentQueryResult = z.infer<typeof insertAgentQueryResultSchema>;
export type AgentQueryResult = typeof agentQueryResults.$inferSelect;

// ============================================================================
// SECRETS_VAULT - Encrypted credentials storage (AES-256-GCM)
// ============================================================================
/**
 * Armazena credentials de forma segura com encryption
 * - Kaggle API keys
 * - Google OAuth credentials
 * - Outros secrets sensíveis
 * 
 * NUNCA armazenar em plaintext!
 */
export const secretsVault = pgTable("secrets_vault", {
  id: serial("id").primaryKey(),
  
  // Secret identifier (e.g., "kaggle:default:username", "google:colab:email@gmail.com")
  name: text("name").notNull().unique(),
  
  // Encrypted data (JSON string com iv, authTag, salt, etc)
  encryptedData: jsonb("encrypted_data").notNull(),
  
  // Metadata
  createdAt: timestamp("created_at").notNull().defaultNow(),
  rotatedAt: timestamp("rotated_at"), // Last rotation
  expiresAt: timestamp("expires_at"), // Auto-expire
  accessCount: integer("access_count").notNull().default(0),
}, (table) => ({
  nameIdx: index("secrets_vault_name_idx").on(table.name),
  expiresAtIdx: index("secrets_vault_expires_at_idx").on(table.expiresAt),
}));

export const insertSecretSchema = createInsertSchema(secretsVault).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertSecret = z.infer<typeof insertSecretSchema>;
export type Secret = typeof secretsVault.$inferSelect;

// ============================================================================
// META-LEARNING SYSTEM - Autonomous Learning & Self-Improvement
// Based on TMLR 2025: Metalearning Continual Learning Algorithms
// Paper: arXiv:2312.00276
// ============================================================================

/**
 * Learning Algorithms - Self-discovered learning algorithms by the AI
 * The AI learns its own learning algorithms through meta-learning
 */
export const learningAlgorithms = pgTable("learning_algorithms", {
  id: serial("id").primaryKey(),
  
  // Algorithm identification
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 50 }).notNull().default("1.0.0"),
  
  // Algorithm specification (self-referential network parameters)
  algorithmType: varchar("algorithm_type", { length: 50 }).notNull(), // "continual" | "few_shot" | "domain_adaptation" | "transfer"
  parameters: jsonb("parameters").notNull().$type<{
    learning_rate_schedule?: any;
    regularization_strategy?: any;
    memory_management?: any;
    plasticity_control?: any;
    custom_rules?: any; // AI-generated custom optimization rules
  }>(),
  
  // Self-referential neural network architecture
  architecture: jsonb("architecture").notNull().$type<{
    layers: number;
    hidden_size: number;
    attention_heads?: number;
    custom_modules?: any[];
  }>(),
  
  // Performance metrics
  avgAccuracy: real("avg_accuracy").notNull().default(0),
  avgLoss: real("avg_loss").notNull().default(0),
  catastrophicForgettingScore: real("catastrophic_forgetting_score").notNull().default(0), // 0-1, lower is better
  adaptationSpeed: real("adaptation_speed").notNull().default(0), // Tasks/hour
  
  // Task distribution it was learned on
  taskDistribution: jsonb("task_distribution").$type<{
    domains: string[];
    num_tasks: number;
    data_characteristics: any;
  }>(),
  
  // Usage statistics
  timesApplied: integer("times_applied").notNull().default(0),
  successRate: real("success_rate").notNull().default(0), // 0-1
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false), // Default algorithm for new tasks
  
  // Metadata
  discoveredBy: varchar("discovered_by", { length: 50 }).notNull().default("meta_learner"), // "meta_learner" | "human" | "hybrid"
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  nameVersionIdx: index("learning_algorithms_name_version_idx").on(table.name, table.version),
  isActiveIdx: index("learning_algorithms_is_active_idx").on(table.isActive),
  successRateIdx: index("learning_algorithms_success_rate_idx").on(table.successRate),
}));

export const insertLearningAlgorithmSchema = createInsertSchema(learningAlgorithms).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertLearningAlgorithm = z.infer<typeof insertLearningAlgorithmSchema>;
export type LearningAlgorithm = typeof learningAlgorithms.$inferSelect;

/**
 * Meta Performance Metrics - Track performance of learned algorithms
 * Enables comparison and selection of best algorithms
 */
export const metaPerformanceMetrics = pgTable("meta_performance_metrics", {
  id: serial("id").primaryKey(),
  
  algorithmId: integer("algorithm_id").notNull().references(() => learningAlgorithms.id, { onDelete: 'cascade' }),
  trainingJobId: integer("training_job_id").references(() => trainingJobs.id),
  
  // Performance data
  taskName: varchar("task_name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 100 }),
  
  // Metrics
  accuracy: real("accuracy").notNull(),
  loss: real("loss").notNull(),
  f1Score: real("f1_score"),
  perplexity: real("perplexity"),
  
  // Continual learning specific
  forwardTransfer: real("forward_transfer"), // Improvement on new tasks due to old knowledge
  backwardTransfer: real("backward_transfer"), // Retention of old tasks after learning new ones
  forgettingMeasure: real("forgetting_measure"), // Catastrophic forgetting quantification
  
  // Efficiency
  trainingTime: integer("training_time"), // seconds
  samplesUsed: integer("samples_used"),
  convergenceSteps: integer("convergence_steps"),
  
  // Comparison to baseline
  baselineAlgorithm: varchar("baseline_algorithm", { length: 255 }),
  improvementOverBaseline: real("improvement_over_baseline"), // Percentage
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  algorithmIdIdx: index("meta_performance_algorithm_id_idx").on(table.algorithmId),
  taskNameIdx: index("meta_performance_task_name_idx").on(table.taskName),
  timestampIdx: index("meta_performance_timestamp_idx").on(table.timestamp),
}));

export const insertMetaPerformanceMetricSchema = createInsertSchema(metaPerformanceMetrics).omit({ 
  id: true, 
  timestamp: true 
});
export type InsertMetaPerformanceMetric = z.infer<typeof insertMetaPerformanceMetricSchema>;
export type MetaPerformanceMetric = typeof metaPerformanceMetrics.$inferSelect;

// ============================================================================
// ADAPTIVE MIXTURE OF EXPERTS (ShiftEx)
// Based on June 2025 paper: "Shift Happens: MoE Continual Adaptation in FL"
// ============================================================================

/**
 * MoE Experts - Dynamic experts spawned/consolidated by ShiftEx
 * Experts specialize in different data distributions/domains
 */
export const moeExperts = pgTable("moe_experts", {
  id: serial("id").primaryKey(),
  
  // Expert identification
  name: varchar("name", { length: 255 }).notNull(),
  expertType: varchar("expert_type", { length: 50 }).notNull(), // "domain_specialist" | "general" | "temporal" | "task_specific"
  
  // Specialization
  domain: varchar("domain", { length: 100 }),
  namespace: varchar("namespace", { length: 255 }),
  dataDistribution: jsonb("data_distribution").$type<{
    mean_embedding?: number[];
    covariance_summary?: any;
    characteristic_samples?: string[];
  }>(),
  
  // Expert parameters (LoRA-style lightweight)
  parameters: jsonb("parameters").notNull().$type<{
    lora_rank: number;
    adapter_alpha: number;
    modules_to_save?: string[];
    custom_config?: any;
  }>(),
  
  // Model weights location
  weightsPath: text("weights_path"), // S3/storage path
  weightsChecksum: varchar("weights_checksum", { length: 64 }),
  
  // Performance tracking
  avgAccuracy: real("avg_accuracy").notNull().default(0),
  avgLoss: real("avg_loss").notNull().default(0),
  numSamplesProcessed: integer("num_samples_processed").notNull().default(0),
  
  // Expert lifecycle
  spawnedFrom: integer("spawned_from").references((): any => moeExperts.id), // Parent expert ID (self-reference)
  spawnReason: varchar("spawn_reason", { length: 100 }), // "shift_detected" | "specialization" | "consolidation"
  
  // MMD (Maximum Mean Discrepancy) tracking for shift detection
  lastMMDScore: real("last_mmd_score"), // Distance to nearest expert
  shiftDetectionThreshold: real("shift_detection_threshold").notNull().default(0.1),
  
  // Facility location optimization
  creationCost: real("creation_cost").notNull().default(0), // Cost to spawn this expert
  maintenanceCost: real("maintenance_cost").notNull().default(0), // Cost to keep active
  
  // Consolidation tracking
  consolidatedInto: integer("consolidated_into").references((): any => moeExperts.id), // If merged (self-reference)
  consolidatedAt: timestamp("consolidated_at"),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  usageCount: integer("usage_count").notNull().default(0),
  lastUsedAt: timestamp("last_used_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  domainIdx: index("moe_experts_domain_idx").on(table.domain),
  expertTypeIdx: index("moe_experts_expert_type_idx").on(table.expertType),
  isActiveIdx: index("moe_experts_is_active_idx").on(table.isActive),
  namespaceIdx: index("moe_experts_namespace_idx").on(table.namespace),
}));

export const insertMoeExpertSchema = createInsertSchema(moeExperts).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertMoeExpert = z.infer<typeof insertMoeExpertSchema>;
export type MoeExpert = typeof moeExperts.$inferSelect;

/**
 * Expert Performance - Granular tracking of expert performance over time
 * Enables dynamic routing and expert selection
 */
export const expertPerformance = pgTable("expert_performance", {
  id: serial("id").primaryKey(),
  
  expertId: integer("expert_id").notNull().references(() => moeExperts.id, { onDelete: 'cascade' }),
  
  // Context
  taskName: varchar("task_name", { length: 255 }),
  domain: varchar("domain", { length: 100 }),
  dataCharacteristics: jsonb("data_characteristics").$type<{
    input_distribution?: any;
    label_distribution?: any;
  }>(),
  
  // Performance metrics
  accuracy: real("accuracy").notNull(),
  loss: real("loss").notNull(),
  latencyMs: integer("latency_ms"),
  
  // Expert selection
  gatingScore: real("gating_score"), // Score from gating network (0-1)
  wasSelected: boolean("was_selected").notNull(),
  
  // Energy-based filtering (PM-MoE)
  energyScore: real("energy_score"), // Lower = better quality expert
  passedEnergyFilter: boolean("passed_energy_filter"),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  expertIdIdx: index("expert_performance_expert_id_idx").on(table.expertId),
  timestampIdx: index("expert_performance_timestamp_idx").on(table.timestamp),
  wasSelectedIdx: index("expert_performance_was_selected_idx").on(table.wasSelected),
}));

export const insertExpertPerformanceSchema = createInsertSchema(expertPerformance).omit({ 
  id: true, 
  timestamp: true 
});
export type InsertExpertPerformance = z.infer<typeof insertExpertPerformanceSchema>;
export type ExpertPerformance = typeof expertPerformance.$inferSelect;

/**
 * Data Shifts - Detection of distribution shifts in incoming data
 * Triggers expert spawning in ShiftEx
 */
export const dataShifts = pgTable("data_shifts", {
  id: serial("id").primaryKey(),
  
  // Shift detection
  shiftType: varchar("shift_type", { length: 50 }).notNull(), // "covariate" | "label" | "concept" | "temporal"
  mmdScore: real("mmd_score").notNull(), // Maximum Mean Discrepancy
  threshold: real("threshold").notNull(),
  isSignificant: boolean("is_significant").notNull(), // mmdScore > threshold
  
  // Context
  sourceDistribution: jsonb("source_distribution").$type<{
    mean?: number[];
    variance?: number[];
    domain?: string;
  }>(),
  targetDistribution: jsonb("target_distribution").$type<{
    mean?: number[];
    variance?: number[];
    domain?: string;
  }>(),
  
  // Response
  actionTaken: varchar("action_taken", { length: 100 }), // "spawn_expert" | "reuse_expert" | "consolidate" | "none"
  expertSpawned: integer("expert_spawned").references(() => moeExperts.id),
  expertReused: integer("expert_reused").references(() => moeExperts.id),
  
  // Metadata
  namespace: varchar("namespace", { length: 255 }),
  trainingJobId: integer("training_job_id").references(() => trainingJobs.id),
  
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
}, (table) => ({
  isSignificantIdx: index("data_shifts_is_significant_idx").on(table.isSignificant),
  shiftTypeIdx: index("data_shifts_shift_type_idx").on(table.shiftType),
  detectedAtIdx: index("data_shifts_detected_at_idx").on(table.detectedAt),
}));

export const insertDataShiftSchema = createInsertSchema(dataShifts).omit({ 
  id: true, 
  detectedAt: true 
});
export type InsertDataShift = z.infer<typeof insertDataShiftSchema>;
export type DataShift = typeof dataShifts.$inferSelect;

// ============================================================================
// RECURSIVE SELF-IMPROVEMENT
// AI analyzes, suggests, validates, and applies code improvements autonomously
// ============================================================================

/**
 * Self Improvements - Log of autonomous code improvements
 * The AI improves its own codebase
 */
export const selfImprovements = pgTable("self_improvements", {
  id: serial("id").primaryKey(),
  
  // Improvement identification
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(), // "performance" | "bug_fix" | "feature" | "refactor" | "optimization"
  severity: varchar("severity", { length: 50 }).notNull().default("medium"), // "critical" | "high" | "medium" | "low"
  
  // Analysis
  problemDescription: text("problem_description").notNull(),
  rootCause: text("root_cause"),
  impactAnalysis: jsonb("impact_analysis").$type<{
    affected_modules: string[];
    estimated_improvement: string;
    risks: string[];
  }>(),
  
  // Proposed solution
  proposedChanges: jsonb("proposed_changes").notNull().$type<{
    files_to_modify: Array<{
      path: string;
      changes: string;
      diff?: string;
    }>;
    new_files?: Array<{
      path: string;
      content: string;
    }>;
    tests_to_add?: string[];
  }>(),
  
  // Validation
  validationStatus: varchar("validation_status", { length: 50 }).notNull().default("pending"), // "pending" | "passed" | "failed" | "skipped"
  validationResults: jsonb("validation_results").$type<{
    tests_passed?: number;
    tests_failed?: number;
    coverage_change?: number;
    performance_impact?: any;
    errors?: string[];
  }>(),
  
  // Application
  applicationStatus: varchar("application_status", { length: 50 }).notNull().default("proposed"), // "proposed" | "applied" | "rejected" | "rolled_back"
  appliedAt: timestamp("applied_at"),
  appliedBy: varchar("applied_by", { length: 50 }), // "autonomous" | "human_approved" | "hybrid"
  
  // Rollback capability
  rollbackData: jsonb("rollback_data").$type<{
    original_code: any;
    rollback_script?: string;
  }>(),
  rolledBackAt: timestamp("rolled_back_at"),
  rollbackReason: text("rollback_reason"),
  
  // Metrics
  performanceBeforeAfter: jsonb("performance_before_after").$type<{
    before: any;
    after: any;
    improvement_percentage?: number;
  }>(),
  
  // Human review
  requiresHumanReview: boolean("requires_human_review").notNull().default(false),
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  categoryIdx: index("self_improvements_category_idx").on(table.category),
  validationStatusIdx: index("self_improvements_validation_status_idx").on(table.validationStatus),
  applicationStatusIdx: index("self_improvements_application_status_idx").on(table.applicationStatus),
  requiresReviewIdx: index("self_improvements_requires_review_idx").on(table.requiresHumanReview),
}));

export const insertSelfImprovementSchema = createInsertSchema(selfImprovements).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertSelfImprovement = z.infer<typeof insertSelfImprovementSchema>;
export type SelfImprovement = typeof selfImprovements.$inferSelect;

/**
 * Improvement Validations - Detailed validation logs for self-improvements
 * Tracks test results, performance benchmarks, and safety checks
 */
export const improvementValidations = pgTable("improvement_validations", {
  id: serial("id").primaryKey(),
  
  improvementId: integer("improvement_id").notNull().references(() => selfImprovements.id, { onDelete: 'cascade' }),
  
  // Validation type
  validationType: varchar("validation_type", { length: 50 }).notNull(), // "unit_test" | "integration_test" | "e2e_test" | "performance_benchmark" | "security_scan"
  
  // Results
  passed: boolean("passed").notNull(),
  score: real("score"), // 0-100 score
  
  // Details
  testName: varchar("test_name", { length: 255 }),
  output: text("output"),
  errors: jsonb("errors").$type<string[]>(),
  
  // Performance
  executionTimeMs: integer("execution_time_ms"),
  
  // Comparison
  baselineValue: real("baseline_value"),
  newValue: real("new_value"),
  improvementPercentage: real("improvement_percentage"),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  improvementIdIdx: index("improvement_validations_improvement_id_idx").on(table.improvementId),
  validationTypeIdx: index("improvement_validations_validation_type_idx").on(table.validationType),
  passedIdx: index("improvement_validations_passed_idx").on(table.passed),
}));

export const insertImprovementValidationSchema = createInsertSchema(improvementValidations).omit({ 
  id: true, 
  timestamp: true 
});
export type InsertImprovementValidation = z.infer<typeof insertImprovementValidationSchema>;
export type ImprovementValidation = typeof improvementValidations.$inferSelect;

// ============================================================================
// BACKUP OPERATIONS - Enterprise Backup/Recovery System
// Track all database backup and restore operations with audit trail
// ============================================================================
export const backupOperations = pgTable("backup_operations", {
  id: serial("id").primaryKey(),
  
  // Operation type
  operationType: varchar("operation_type", { length: 20 }).notNull(), // "backup" | "restore" | "safety_snapshot"
  
  // User who initiated the operation
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  
  // File information
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  fileChecksum: varchar("file_checksum", { length: 64 }), // SHA-256 hash
  
  // Backup metadata
  metadata: jsonb("metadata").$type<{
    schemaVersion: string;
    dumpType: string; // "pg_dump" | "drizzle_json" | "neon_branch"
    compression: string; // "gzip" | "none"
    encrypted: boolean;
    tableCount: number;
    rowCount?: number;
  }>(),
  
  // Operation status
  status: varchar("status", { length: 20 }).notNull().default("in_progress"), // "in_progress" | "completed" | "failed" | "cancelled"
  progress: integer("progress").default(0), // 0-100 percentage
  
  // Timing
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  
  // Error handling
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details"),
  
  // Pre-restore safety snapshot ID (for restore operations) - stored as plain integer to avoid circular reference
  safetySnapshotId: integer("safety_snapshot_id"),
  
  // Download/Upload information
  storageLocation: text("storage_location"), // Local path or signed URL
  expiresAt: timestamp("expires_at"), // For temporary download links
  
  // IP and user agent for audit
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
}, (table) => ({
  operationTypeIdx: index("backup_operations_operation_type_idx").on(table.operationType),
  statusIdx: index("backup_operations_status_idx").on(table.status),
  userIdIdx: index("backup_operations_user_id_idx").on(table.userId),
  startedAtIdx: index("backup_operations_started_at_idx").on(table.startedAt),
}));

export const insertBackupOperationSchema = createInsertSchema(backupOperations).omit({ 
  id: true, 
  startedAt: true 
});
export type InsertBackupOperation = z.infer<typeof insertBackupOperationSchema>;
export type BackupOperation = typeof backupOperations.$inferSelect;

// ============================================================================
// ENTERPRISE CASCADE DELETION - Data Lineage Tracking
// ============================================================================

/**
 * DATASET VERSIONS - Tracks dataset lineage and source KB documents
 * Used to implement cascade deletion with dependency tracking
 */
export const datasetVersions = pgTable("dataset_versions", {
  id: serial("id").primaryKey(),
  
  // Dataset reference
  datasetId: integer("dataset_id").notNull().references(() => datasets.id, { onDelete: 'cascade' }),
  versionNumber: integer("version_number").notNull().default(1),
  
  // Source KB documents (lineage tracking)
  sourceKbDocumentIds: integer("source_kb_document_ids").array().notNull().default(sql`ARRAY[]::integer[]`),
  
  // Dataset state snapshot
  totalExamples: integer("total_examples").notNull(),
  averageQualityScore: real("average_quality_score"), // 0-100
  
  // Metadata
  metadata: jsonb("metadata").$type<{
    generationMethod?: string; // "auto" | "manual" | "curated"
    kbNamespaces?: string[]; // Which namespaces contributed to this dataset
    conversationIds?: number[]; // Source conversations
    createdBy?: string; // User ID
  }>(),
  
  // Status
  status: varchar("status", { length: 20 }).notNull().default("active"), // "active" | "deprecated" | "tainted"
  taintReason: text("taint_reason"), // Why this version was tainted (e.g., "Source KB document deleted")
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deprecatedAt: timestamp("deprecated_at"),
}, (table) => ({
  datasetIdIdx: index("dataset_versions_dataset_id_idx").on(table.datasetId),
  statusIdx: index("dataset_versions_status_idx").on(table.status),
  // UNIQUE constraint - prevent duplicate versions for same dataset
  datasetVersionUnique: unique("dataset_versions_dataset_id_version_unique").on(table.datasetId, table.versionNumber),
  // GIN index for efficient array containment queries (@> and && operators)
  sourceKbDocumentsIdx: index("dataset_versions_source_kb_documents_idx").using("gin", table.sourceKbDocumentIds),
}));

export const insertDatasetVersionSchema = createInsertSchema(datasetVersions).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertDatasetVersion = z.infer<typeof insertDatasetVersionSchema>;
export type DatasetVersion = typeof datasetVersions.$inferSelect;

/**
 * MODEL VERSIONS - Tracks deployed models and their dataset/KB dependencies
 * Used to implement model tainting when source data is deleted
 */
export const modelVersions = pgTable("model_versions", {
  id: serial("id").primaryKey(),
  
  // Model metadata
  modelName: varchar("model_name", { length: 255 }).notNull(),
  versionId: varchar("version_id", { length: 100 }).notNull().unique(), // e.g., "v1234567890-job123"
  
  // Training job reference
  trainingJobId: integer("training_job_id").references(() => trainingJobs.id, { onDelete: 'set null' }),
  
  // Lineage tracking - which datasets were used to train this model
  sourceDatasetIds: integer("source_dataset_ids").array().notNull().default(sql`ARRAY[]::integer[]`),
  
  // Indirect lineage - KB documents that contributed to training data
  indirectKbDocumentIds: integer("indirect_kb_document_ids").array().notNull().default(sql`ARRAY[]::integer[]`),
  
  // Model state
  status: varchar("status", { length: 20 }).notNull().default("deployed"), // "deployed" | "deprecated" | "tainted"
  taintReason: text("taint_reason"), // Why this model was tainted
  performanceMetrics: jsonb("performance_metrics").$type<{
    accuracy?: number;
    loss?: number;
    perplexity?: number;
    bleuScore?: number;
    customMetrics?: Record<string, number>;
  }>(),
  
  // Deployment info
  deployedAt: timestamp("deployed_at"),
  deployedBy: varchar("deployed_by").references(() => users.id),
  
  // Metadata
  metadata: jsonb("metadata").$type<{
    baseModel?: string;
    loraConfig?: any;
    trainingDuration?: number;
    hardwareUsed?: string;
    tags?: string[];
  }>(),
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deprecatedAt: timestamp("deprecated_at"),
}, (table) => ({
  modelNameIdx: index("model_versions_model_name_idx").on(table.modelName),
  statusIdx: index("model_versions_status_idx").on(table.status),
  trainingJobIdIdx: index("model_versions_training_job_id_idx").on(table.trainingJobId),
  // GIN indexes for efficient array containment queries (@> and && operators)
  sourceDatasetIdsIdx: index("model_versions_source_dataset_ids_idx").using("gin", table.sourceDatasetIds),
  indirectKbDocumentIdsIdx: index("model_versions_indirect_kb_document_ids_idx").using("gin", table.indirectKbDocumentIds),
}));

export const insertModelVersionSchema = createInsertSchema(modelVersions).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertModelVersion = z.infer<typeof insertModelVersionSchema>;
export type ModelVersion = typeof modelVersions.$inferSelect;

/**
 * DELETION TOMBSTONES - Immutable audit log for deleted data
 * Preserves metadata after deletion for GDPR compliance and lineage tracking
 * NEVER deleted - soft preserve for retention policy compliance
 */
export const deletionTombstones = pgTable("deletion_tombstones", {
  id: serial("id").primaryKey(),
  
  // What was deleted
  entityType: varchar("entity_type", { length: 50 }).notNull(), // "kb_document" | "dataset" | "model" | "conversation"
  entityId: integer("entity_id").notNull(), // Original ID (no FK - entity is deleted)
  
  // Preserved metadata (GDPR-compliant - no PII)
  entityMetadata: jsonb("entity_metadata").$type<{
    title?: string;
    namespace?: string;
    createdAt?: string;
    size?: number;
    tags?: string[];
    // NO PII: emails, names, personal data redacted
  }>(),
  
  // Deletion context
  deletedBy: varchar("deleted_by").references(() => users.id, { onDelete: 'set null' }),
  deletionReason: text("deletion_reason"), // "user_request" | "retention_policy" | "gdpr_right_to_erasure" | "cascade"
  
  // Cascade impact tracking
  cascadeImpact: jsonb("cascade_impact").$type<{
    affectedDatasets?: number[]; // IDs of datasets tainted by this deletion
    affectedModels?: number[]; // IDs of models tainted by this deletion
    totalAffectedEntities?: number;
  }>(),
  
  // Retention policy
  retentionUntil: timestamp("retention_until"), // When this tombstone can be purged (null = keep forever)
  
  // Immutable audit trail
  deletedAt: timestamp("deleted_at").notNull().defaultNow(),
  
  // GDPR compliance
  gdprReason: varchar("gdpr_reason", { length: 100 }), // "right_to_erasure" | "data_minimization" | "storage_limitation"
}, (table) => ({
  entityTypeIdx: index("deletion_tombstones_entity_type_idx").on(table.entityType),
  entityIdIdx: index("deletion_tombstones_entity_id_idx").on(table.entityId),
  deletedByIdx: index("deletion_tombstones_deleted_by_idx").on(table.deletedBy),
  deletedAtIdx: index("deletion_tombstones_deleted_at_idx").on(table.deletedAt),
  retentionUntilIdx: index("deletion_tombstones_retention_until_idx").on(table.retentionUntil),
}));

export const insertDeletionTombstoneSchema = createInsertSchema(deletionTombstones).omit({ 
  id: true, 
  deletedAt: true 
});
export type InsertDeletionTombstone = z.infer<typeof insertDeletionTombstoneSchema>;
export type DeletionTombstone = typeof deletionTombstones.$inferSelect;

// ============================================================================
// RETENTION POLICIES - Policy-driven tombstone cleanup
// Defines retention windows per entity type and namespace
// ============================================================================
export const retentionPolicies = pgTable("retention_policies", {
  id: serial("id").primaryKey(),
  
  // Policy scope (which entities does this apply to?)
  entityType: varchar("entity_type", { length: 50 }).notNull(), // "kb_document" | "dataset" | "model" | "conversation" | "*" (wildcard)
  namespace: varchar("namespace", { length: 100 }).notNull().default('*'), // Specific namespace, or "*" for all namespaces
  
  // Retention configuration
  retentionDays: integer("retention_days").notNull(), // Days to keep tombstones before auto-deletion
  
  // Policy metadata
  description: text("description"), // Human-readable description
  enabled: boolean("enabled").notNull().default(true),
  
  // Audit fields
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Unique constraint: One policy per (entityType, namespace) combination
  // Using NOT NULL namespace with wildcard "*" ensures uniqueness works correctly in PostgreSQL
  unique("retention_policies_entity_namespace_unique").on(table.entityType, table.namespace),
  index("retention_policies_entity_type_idx").on(table.entityType),
  index("retention_policies_namespace_idx").on(table.namespace),
  index("retention_policies_enabled_idx").on(table.enabled),
]);

export const insertRetentionPolicySchema = createInsertSchema(retentionPolicies).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertRetentionPolicy = z.infer<typeof insertRetentionPolicySchema>;
export type RetentionPolicy = typeof retentionPolicies.$inferSelect;

// ============================================================================
// AUTO_APPROVAL_CONFIG - Configuration for automatic curation approval
// Controls threshold-based auto-approval with namespace filtering and content flags
// ============================================================================
export const autoApprovalConfig = pgTable("auto_approval_config", {
  id: serial("id").primaryKey(),
  
  // Global enable/disable
  enabled: boolean("enabled").notNull().default(true),
  
  // Score thresholds (0-100)
  minApprovalScore: integer("min_approval_score").notNull().default(80), // Score ≥ this → auto-approve
  maxRejectScore: integer("max_reject_score").notNull().default(50), // Score < this → auto-reject
  
  // Sensitive content flags that require HITL review
  sensitiveFlags: jsonb("sensitive_flags").$type<string[]>().notNull().default(['adult', 'violence', 'medical', 'finance', 'legal', 'pii', 'hate-speech']),
  
  // Namespace filtering (null or [] = all namespaces, ["tech", "science"] = only these)
  enabledNamespaces: jsonb("enabled_namespaces").$type<string[]>().notNull().default(['*']), // "*" = all namespaces
  
  // Auto-reject settings
  autoRejectEnabled: boolean("auto_reject_enabled").notNull().default(true),
  
  // Quality gates integration
  requireAllQualityGates: boolean("require_all_quality_gates").notNull().default(false), // true = must pass all 5 gates
  
  // Audit fields
  createdBy: varchar("created_by"),
  updatedBy: varchar("updated_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("auto_approval_config_enabled_idx").on(table.enabled),
]);

export const insertAutoApprovalConfigSchema = createInsertSchema(autoApprovalConfig).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertAutoApprovalConfig = z.infer<typeof insertAutoApprovalConfigSchema>;
export type AutoApprovalConfig = typeof autoApprovalConfig.$inferSelect;

// ============================================================================
// USER_QUERY_FREQUENCY - Query frequency tracking for reuse-aware auto-approval
// Tracks how often users ask similar questions to enable cost-optimization via indexing
// ============================================================================
export const userQueryFrequency = pgTable("user_query_frequency", {
  id: serial("id").primaryKey(),
  
  // Query identification (SHA-256 hash of normalized query)
  queryHash: varchar("query_hash", { length: 64 }).notNull().unique(),
  normalizedQuery: text("normalized_query").notNull(),
  
  // Semantic similarity (OpenAI embedding for detecting similar queries)
  queryEmbedding: vector("query_embedding", { dimensions: 1536 }),
  
  // Frequency tracking
  hitCount: integer("hit_count").notNull().default(1),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  
  // Exponential decay factor (0.95^days_since_last_seen)
  decayFactor: real("decay_factor").notNull().default(1.0),
  
  // Context metadata
  namespace: varchar("namespace", { length: 255 }),
  conversationId: varchar("conversation_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("user_query_frequency_hash_idx").on(table.queryHash),
  index("user_query_frequency_last_seen_idx").on(table.lastSeenAt),
  index("user_query_frequency_hit_count_idx").on(table.hitCount),
  index("user_query_frequency_namespace_idx").on(table.namespace),
]);

export const insertUserQueryFrequencySchema = createInsertSchema(userQueryFrequency).omit({ 
  id: true, 
  updatedAt: true 
});
export type InsertUserQueryFrequency = z.infer<typeof insertUserQueryFrequencySchema>;
export type UserQueryFrequency = typeof userQueryFrequency.$inferSelect;
