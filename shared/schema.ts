import { pgTable, text, integer, serial, timestamp, boolean, jsonb, real, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from 'drizzle-orm';

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
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

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
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: varchar("user_id").references(() => users.id), // Optional: null for anonymous sessions
  projectId: integer("project_id").references(() => projects.id), // Optional: link to project
  title: text("title").notNull().default("New Conversation"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("conversations_tenant_idx").on(table.tenantId),
  userIdx: index("conversations_user_idx").on(table.userId),
  projectIdx: index("conversations_project_idx").on(table.projectId),
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
// DOCUMENTS - Knowledge base documents (PDFs, Word, Excel, etc + manual text)
// ============================================================================
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  
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
  
  // Processing status
  status: text("status").notNull().default("indexed"), // "pending" | "processing" | "indexed" | "failed"
  errorMessage: text("error_message"),
  
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
  }>(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("documents_tenant_idx").on(table.tenantId),
  statusIdx: index("documents_status_idx").on(table.status),
  sourceIdx: index("documents_source_idx").on(table.source),
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

// ============================================================================
// VIDEO_JOBS - Async video generation job queue
// As per Architect plan: GPU worker orchestration with job polling
// ============================================================================
export const videoJobs = pgTable("video_jobs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
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
  tenantIdx: index("video_jobs_tenant_idx").on(table.tenantId),
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
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
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
  tenantIdx: index("video_assets_tenant_idx").on(table.tenantId),
  expiresIdx: index("video_assets_expires_idx").on(table.expiresAt),
}));

export const insertVideoAssetSchema = createInsertSchema(videoAssets).omit({ id: true, createdAt: true });
export type InsertVideoAsset = z.infer<typeof insertVideoAssetSchema>;
export type VideoAsset = typeof videoAssets.$inferSelect;

// ============================================================================
// TOKEN_USAGE - Token consumption tracking for all APIs
// ============================================================================
export const tokenUsage = pgTable("token_usage", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  
  // API Provider
  provider: text("provider").notNull(), // "groq" | "gemini" | "huggingface" | "openrouter" | "openai" | "kb" | "web" | "deepweb"
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
  
  // Metadata for web/deepweb searches (URLs, titles, sources)
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
  }>(),
  
  timestamp: timestamp("timestamp").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("token_usage_tenant_idx").on(table.tenantId),
  providerIdx: index("token_usage_provider_idx").on(table.provider),
  timestampIdx: index("token_usage_timestamp_idx").on(table.timestamp),
}));

export const insertTokenUsageSchema = createInsertSchema(tokenUsage).omit({ id: true, timestamp: true });
export type InsertTokenUsage = z.infer<typeof insertTokenUsageSchema>;
export type TokenUsage = typeof tokenUsage.$inferSelect;

// ============================================================================
// TOKEN_LIMITS - Configurable limits per tenant/provider
// ============================================================================
export const tokenLimits = pgTable("token_limits", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  
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
  tenantProviderIdx: index("token_limits_tenant_provider_idx").on(table.tenantId, table.provider),
}));

export const insertTokenLimitSchema = createInsertSchema(tokenLimits).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTokenLimit = z.infer<typeof insertTokenLimitSchema>;
export type TokenLimit = typeof tokenLimits.$inferSelect;

// ============================================================================
// TOKEN_ALERTS - Alert history for token usage
// ============================================================================
export const tokenAlerts = pgTable("token_alerts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  
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
  tenantIdx: index("token_alerts_tenant_idx").on(table.tenantId),
  acknowledgedIdx: index("token_alerts_acknowledged_idx").on(table.acknowledged),
}));

export const insertTokenAlertSchema = createInsertSchema(tokenAlerts).omit({ id: true, createdAt: true });
export type InsertTokenAlert = z.infer<typeof insertTokenAlertSchema>;
export type TokenAlert = typeof tokenAlerts.$inferSelect;

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
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"), // When last served a request
}, (table) => ({
  providerIdx: index("gpu_workers_provider_idx").on(table.provider),
  statusIdx: index("gpu_workers_status_idx").on(table.status),
  accountIdIdx: index("gpu_workers_account_id_idx").on(table.accountId),
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
// FEDERATED LEARNING SYSTEM - Distributed Training with Multi-GPU
// ============================================================================

// Training Jobs - Coordina treinamento distribuído entre múltiplas GPUs
export const trainingJobs = pgTable("training_jobs", {
  id: serial("id").primaryKey(),
  
  // Job identification
  name: text("name").notNull(),
  description: text("description"),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  
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
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  tenantIdx: index("training_jobs_tenant_idx").on(table.tenantId),
  statusIdx: index("training_jobs_status_idx").on(table.status),
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
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
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
  
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index("datasets_tenant_idx").on(table.tenantId),
  userIdx: index("datasets_user_idx").on(table.userId),
  statusIdx: index("datasets_status_idx").on(table.status),
}));

export const insertDatasetSchema = createInsertSchema(datasets).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true,
});
export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type Dataset = typeof datasets.$inferSelect;
