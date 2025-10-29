import { db } from "./db";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import {
  users, type User, type UpsertUser,
  tenants, type Tenant, type InsertTenant,
  policies, type Policy, type InsertPolicy,
  projects, type Project, type InsertProject,
  projectFiles, type ProjectFile, type InsertProjectFile,
  conversations, type Conversation, type InsertConversation,
  messages, type Message, type InsertMessage,
  documents, type Document, type InsertDocument,
  embeddings, type Embedding, type InsertEmbedding,
  toolExecutions, type ToolExecution, type InsertToolExecution,
  metrics, type Metric, type InsertMetric,
  auditLogs, type AuditLog, type InsertAuditLog,
  knowledgeSources, type KnowledgeSource, type InsertKnowledgeSource,
  generatedFiles, type GeneratedFile, type InsertGeneratedFile,
  videoJobs, type VideoJob, type InsertVideoJob,
  videoAssets, type VideoAsset, type InsertVideoAsset,
} from "@shared/schema";

// ============================================================================
// STORAGE INTERFACE - Complete CRUD operations for all entities
// ============================================================================
export interface IStorage {
  // Users (required for Replit Auth + Local Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User>;
  
  // Tenants
  getTenant(id: number): Promise<Tenant | undefined>;
  getTenantByApiKey(apiKey: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant>;
  
  // Policies
  getPolicy(id: number): Promise<Policy | undefined>;
  getPolicyByTenant(tenantId: number): Promise<Policy | undefined>;
  createPolicy(policy: InsertPolicy): Promise<Policy>;
  updatePolicy(id: number, data: Partial<InsertPolicy>): Promise<Policy>;
  deletePolicy(id: number): Promise<void>;
  
  // Conversations
  getConversation(id: number): Promise<Conversation | undefined>;
  getConversationsByTenant(tenantId: number, limit?: number): Promise<Conversation[]>;
  getConversationsByUser(userId: string, limit?: number): Promise<Conversation[]>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, data: Partial<InsertConversation>): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  
  // Messages
  getMessage(id: number): Promise<Message | undefined>;
  getMessagesByConversation(conversationId: number, limit?: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: number, data: Partial<InsertMessage>): Promise<Message>;
  
  // Documents
  getDocument(id: number): Promise<Document | undefined>;
  getDocumentsByTenant(tenantId: number, limit?: number): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;
  
  // Embeddings
  getEmbedding(id: number): Promise<Embedding | undefined>;
  getEmbeddingsByDocument(documentId: number): Promise<Embedding[]>;
  getEmbeddingsByTenant(tenantId: number, limit?: number): Promise<Embedding[]>;
  createEmbedding(embedding: InsertEmbedding): Promise<Embedding>;
  createEmbeddingsBatch(embeddings: InsertEmbedding[]): Promise<Embedding[]>;
  deleteEmbeddingsByDocument(documentId: number): Promise<void>;
  
  // Tool Executions
  getToolExecution(id: number): Promise<ToolExecution | undefined>;
  getToolExecutionsByConversation(conversationId: number): Promise<ToolExecution[]>;
  createToolExecution(execution: InsertToolExecution): Promise<ToolExecution>;
  
  // Metrics
  getMetric(id: number): Promise<Metric | undefined>;
  getMetricsByTenant(tenantId: number, metricType?: string, limit?: number): Promise<Metric[]>;
  getMetricsByTimeRange(tenantId: number, startTime: Date, endTime: Date): Promise<Metric[]>;
  createMetric(metric: InsertMetric): Promise<Metric>;
  createMetricsBatch(metrics: InsertMetric[]): Promise<Metric[]>;
  
  // Audit Logs
  getAuditLog(id: number): Promise<AuditLog | undefined>;
  getAuditLogsByTenant(tenantId: number, limit?: number): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Knowledge Sources
  getKnowledgeSource(id: number): Promise<KnowledgeSource | undefined>;
  getKnowledgeSourcesByTenant(tenantId: number): Promise<KnowledgeSource[]>;
  getActiveKnowledgeSources(): Promise<KnowledgeSource[]>;
  createKnowledgeSource(source: InsertKnowledgeSource): Promise<KnowledgeSource>;
  updateKnowledgeSource(id: number, data: Partial<InsertKnowledgeSource>): Promise<KnowledgeSource>;
  deleteKnowledgeSource(id: number): Promise<void>;
  
  // Generated Files
  getGeneratedFile(id: number): Promise<GeneratedFile | undefined>;
  getGeneratedFilesByConversation(conversationId: number): Promise<GeneratedFile[]>;
  createGeneratedFile(file: InsertGeneratedFile): Promise<GeneratedFile>;
  markFileAsDeleted(id: number): Promise<void>;
  getExpiredFiles(): Promise<GeneratedFile[]>;
  
  // Video Jobs
  getVideoJob(id: number): Promise<VideoJob | undefined>;
  getVideoJobsByTenant(tenantId: number, limit?: number): Promise<VideoJob[]>;
  getPendingVideoJobs(): Promise<VideoJob[]>;
  createVideoJob(job: InsertVideoJob): Promise<VideoJob>;
  updateVideoJob(id: number, data: Partial<InsertVideoJob>): Promise<VideoJob>;
  
  // Video Assets
  getVideoAsset(id: number): Promise<VideoAsset | undefined>;
  getVideoAssetByJobId(jobId: number): Promise<VideoAsset | undefined>;
  getVideoAssetsByTenant(tenantId: number, limit?: number): Promise<VideoAsset[]>;
  createVideoAsset(asset: InsertVideoAsset): Promise<VideoAsset>;
  markVideoAssetAsDeleted(id: number): Promise<void>;
  getExpiredVideoAssets(): Promise<VideoAsset[]>;
  
  // Projects
  getProject(id: number): Promise<Project | undefined>;
  getProjectsByUser(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, data: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  
  // Project Files
  getProjectFile(id: number): Promise<ProjectFile | undefined>;
  getProjectFilesByProject(projectId: number): Promise<ProjectFile[]>;
  createProjectFile(file: InsertProjectFile): Promise<ProjectFile>;
  deleteProjectFile(id: number): Promise<void>;
}

// ============================================================================
// DATABASE STORAGE - PostgreSQL implementation via Drizzle ORM
// ============================================================================
export class DatabaseStorage implements IStorage {
  // --------------------------------------------------------------------------
  // USERS (required for Replit Auth) - blueprint:javascript_log_in_with_replit
  // --------------------------------------------------------------------------
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.verificationToken, token));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User> {
    const [updated] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  // --------------------------------------------------------------------------
  // TENANTS
  // --------------------------------------------------------------------------
  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async getTenantByApiKey(apiKey: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.apiKey, apiKey));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    return created;
  }

  async updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant> {
    const [updated] = await db.update(tenants)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return updated;
  }

  // --------------------------------------------------------------------------
  // POLICIES
  // --------------------------------------------------------------------------
  async getPolicy(id: number): Promise<Policy | undefined> {
    const [policy] = await db.select().from(policies).where(eq(policies.id, id));
    return policy;
  }

  async getPolicyByTenant(tenantId: number): Promise<Policy | undefined> {
    const [policy] = await db.select().from(policies)
      .where(and(eq(policies.tenantId, tenantId), eq(policies.isActive, true)))
      .orderBy(desc(policies.createdAt));
    return policy;
  }

  async createPolicy(policy: InsertPolicy): Promise<Policy> {
    const [created] = await db.insert(policies).values([policy] as any).returning();
    return created;
  }

  async updatePolicy(id: number, data: Partial<InsertPolicy>): Promise<Policy> {
    const [updated] = await db.update(policies)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(policies.id, id))
      .returning();
    return updated;
  }

  async deletePolicy(id: number): Promise<void> {
    await db.delete(policies).where(eq(policies.id, id));
  }

  // --------------------------------------------------------------------------
  // CONVERSATIONS
  // --------------------------------------------------------------------------
  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async getConversationsByTenant(tenantId: number, limit: number = 50): Promise<Conversation[]> {
    return db.select().from(conversations)
      .where(eq(conversations.tenantId, tenantId))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
  }

  async getConversationsByUser(userId: string, limit: number = 50): Promise<Conversation[]> {
    return db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [created] = await db.insert(conversations).values(conversation).returning();
    return created;
  }

  async updateConversation(id: number, data: Partial<InsertConversation>): Promise<Conversation> {
    const [updated] = await db.update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return updated;
  }

  async deleteConversation(id: number): Promise<void> {
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  // --------------------------------------------------------------------------
  // MESSAGES
  // --------------------------------------------------------------------------
  async getMessage(id: number): Promise<Message | undefined> {
    const [message] = await db.select().from(messages).where(eq(messages.id, id));
    return message;
  }

  async getMessagesByConversation(conversationId: number, limit: number = 100): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(limit);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [created] = await db.insert(messages).values([message] as any).returning();
    return created;
  }

  async updateMessage(id: number, data: Partial<InsertMessage>): Promise<Message> {
    const [updated] = await db.update(messages)
      .set(data as any)
      .where(eq(messages.id, id))
      .returning();
    return updated;
  }

  // --------------------------------------------------------------------------
  // DOCUMENTS
  // --------------------------------------------------------------------------
  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }

  async getDocumentsByTenant(tenantId: number, limit: number = 100): Promise<Document[]> {
    return db.select().from(documents)
      .where(eq(documents.tenantId, tenantId))
      .orderBy(desc(documents.createdAt))
      .limit(limit);
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const [created] = await db.insert(documents).values([document] as any).returning();
    return created;
  }

  async updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document> {
    const [updated] = await db.update(documents)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(documents.id, id))
      .returning();
    return updated;
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }

  // --------------------------------------------------------------------------
  // EMBEDDINGS
  // --------------------------------------------------------------------------
  async getEmbedding(id: number): Promise<Embedding | undefined> {
    const [embedding] = await db.select().from(embeddings).where(eq(embeddings.id, id));
    return embedding;
  }

  async getEmbeddingsByDocument(documentId: number): Promise<Embedding[]> {
    return db.select().from(embeddings)
      .where(eq(embeddings.documentId, documentId))
      .orderBy(embeddings.chunkIndex);
  }

  async getEmbeddingsByTenant(tenantId: number, limit: number = 1000): Promise<Embedding[]> {
    return db.select().from(embeddings)
      .where(eq(embeddings.tenantId, tenantId))
      .limit(limit);
  }

  async createEmbedding(embedding: InsertEmbedding): Promise<Embedding> {
    const [created] = await db.insert(embeddings).values([embedding] as any).returning();
    return created;
  }

  async createEmbeddingsBatch(embeddingList: InsertEmbedding[]): Promise<Embedding[]> {
    if (embeddingList.length === 0) return [];
    return db.insert(embeddings).values(embeddingList as any).returning();
  }

  async deleteEmbeddingsByDocument(documentId: number): Promise<void> {
    await db.delete(embeddings).where(eq(embeddings.documentId, documentId));
  }

  // --------------------------------------------------------------------------
  // TOOL EXECUTIONS
  // --------------------------------------------------------------------------
  async getToolExecution(id: number): Promise<ToolExecution | undefined> {
    const [execution] = await db.select().from(toolExecutions).where(eq(toolExecutions.id, id));
    return execution;
  }

  async getToolExecutionsByConversation(conversationId: number): Promise<ToolExecution[]> {
    return db.select().from(toolExecutions)
      .where(eq(toolExecutions.conversationId, conversationId))
      .orderBy(toolExecutions.createdAt);
  }

  async createToolExecution(execution: InsertToolExecution): Promise<ToolExecution> {
    const [created] = await db.insert(toolExecutions).values([execution]).returning();
    return created;
  }

  // --------------------------------------------------------------------------
  // METRICS
  // --------------------------------------------------------------------------
  async getMetric(id: number): Promise<Metric | undefined> {
    const [metric] = await db.select().from(metrics).where(eq(metrics.id, id));
    return metric;
  }

  async getMetricsByTenant(tenantId: number, metricType?: string, limit: number = 1000): Promise<Metric[]> {
    const conditions = [eq(metrics.tenantId, tenantId)];
    if (metricType) {
      conditions.push(eq(metrics.metricType, metricType));
    }
    return db.select().from(metrics)
      .where(and(...conditions))
      .orderBy(desc(metrics.timestamp))
      .limit(limit);
  }

  async getMetricsByTimeRange(tenantId: number, startTime: Date, endTime: Date): Promise<Metric[]> {
    return db.select().from(metrics)
      .where(and(
        eq(metrics.tenantId, tenantId),
        gte(metrics.timestamp, startTime),
        lte(metrics.timestamp, endTime)
      ))
      .orderBy(metrics.timestamp);
  }

  async createMetric(metric: InsertMetric): Promise<Metric> {
    const [created] = await db.insert(metrics).values([metric] as any).returning();
    return created;
  }

  async createMetricsBatch(metricList: InsertMetric[]): Promise<Metric[]> {
    if (metricList.length === 0) return [];
    return db.insert(metrics).values(metricList as any).returning();
  }

  // --------------------------------------------------------------------------
  // AUDIT LOGS
  // --------------------------------------------------------------------------
  async getAuditLog(id: number): Promise<AuditLog | undefined> {
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.id, id));
    return log;
  }

  async getAuditLogsByTenant(tenantId: number, limit: number = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values([log] as any).returning();
    return created;
  }

  // --------------------------------------------------------------------------
  // KNOWLEDGE SOURCES
  // --------------------------------------------------------------------------
  async getKnowledgeSource(id: number): Promise<KnowledgeSource | undefined> {
    const [source] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, id));
    return source;
  }

  async getKnowledgeSourcesByTenant(tenantId: number): Promise<KnowledgeSource[]> {
    return db.select().from(knowledgeSources)
      .where(eq(knowledgeSources.tenantId, tenantId))
      .orderBy(desc(knowledgeSources.createdAt));
  }

  async getActiveKnowledgeSources(): Promise<KnowledgeSource[]> {
    return db.select().from(knowledgeSources)
      .where(eq(knowledgeSources.status, 'active'));
  }

  async createKnowledgeSource(source: InsertKnowledgeSource): Promise<KnowledgeSource> {
    const [created] = await db.insert(knowledgeSources).values([source] as any).returning();
    return created;
  }

  async updateKnowledgeSource(id: number, data: Partial<InsertKnowledgeSource>): Promise<KnowledgeSource> {
    const [updated] = await db.update(knowledgeSources)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(knowledgeSources.id, id))
      .returning();
    return updated;
  }

  async deleteKnowledgeSource(id: number): Promise<void> {
    await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
  }

  // --------------------------------------------------------------------------
  // GENERATED FILES
  // --------------------------------------------------------------------------
  async getGeneratedFile(id: number): Promise<GeneratedFile | undefined> {
    const [file] = await db.select().from(generatedFiles).where(eq(generatedFiles.id, id));
    return file;
  }

  async getGeneratedFilesByConversation(conversationId: number): Promise<GeneratedFile[]> {
    return db.select().from(generatedFiles)
      .where(and(eq(generatedFiles.conversationId, conversationId), eq(generatedFiles.isDeleted, false)))
      .orderBy(desc(generatedFiles.createdAt));
  }

  async createGeneratedFile(file: InsertGeneratedFile): Promise<GeneratedFile> {
    const [created] = await db.insert(generatedFiles).values([file] as any).returning();
    return created;
  }

  async markFileAsDeleted(id: number): Promise<void> {
    await db.update(generatedFiles)
      .set({ isDeleted: true })
      .where(eq(generatedFiles.id, id));
  }

  async getExpiredFiles(): Promise<GeneratedFile[]> {
    return db.select().from(generatedFiles)
      .where(and(
        lte(generatedFiles.expiresAt, new Date()),
        eq(generatedFiles.isDeleted, false)
      ));
  }

  // --------------------------------------------------------------------------
  // VIDEO JOBS
  // --------------------------------------------------------------------------
  async getVideoJob(id: number): Promise<VideoJob | undefined> {
    const [job] = await db.select().from(videoJobs).where(eq(videoJobs.id, id));
    return job;
  }

  async getVideoJobsByTenant(tenantId: number, limit: number = 50): Promise<VideoJob[]> {
    return db.select().from(videoJobs)
      .where(eq(videoJobs.tenantId, tenantId))
      .orderBy(desc(videoJobs.createdAt))
      .limit(limit);
  }

  async getPendingVideoJobs(): Promise<VideoJob[]> {
    return db.select().from(videoJobs)
      .where(eq(videoJobs.status, 'pending'))
      .orderBy(videoJobs.createdAt);
  }

  async createVideoJob(job: InsertVideoJob): Promise<VideoJob> {
    const [created] = await db.insert(videoJobs).values([job] as any).returning();
    return created;
  }

  async updateVideoJob(id: number, data: Partial<InsertVideoJob>): Promise<VideoJob> {
    const [updated] = await db.update(videoJobs)
      .set(data as any)
      .where(eq(videoJobs.id, id))
      .returning();
    return updated;
  }

  // --------------------------------------------------------------------------
  // VIDEO ASSETS
  // --------------------------------------------------------------------------
  async getVideoAsset(id: number): Promise<VideoAsset | undefined> {
    const [asset] = await db.select().from(videoAssets).where(eq(videoAssets.id, id));
    return asset;
  }

  async getVideoAssetByJobId(jobId: number): Promise<VideoAsset | undefined> {
    const [asset] = await db.select().from(videoAssets).where(eq(videoAssets.jobId, jobId));
    return asset;
  }

  async getVideoAssetsByTenant(tenantId: number, limit: number = 50): Promise<VideoAsset[]> {
    return db.select().from(videoAssets)
      .where(and(eq(videoAssets.tenantId, tenantId), eq(videoAssets.isDeleted, false)))
      .orderBy(desc(videoAssets.createdAt))
      .limit(limit);
  }

  async createVideoAsset(asset: InsertVideoAsset): Promise<VideoAsset> {
    const [created] = await db.insert(videoAssets).values([asset] as any).returning();
    return created;
  }

  async markVideoAssetAsDeleted(id: number): Promise<void> {
    await db.update(videoAssets)
      .set({ isDeleted: true })
      .where(eq(videoAssets.id, id));
  }

  async getExpiredVideoAssets(): Promise<VideoAsset[]> {
    return db.select().from(videoAssets)
      .where(and(
        lte(videoAssets.expiresAt, new Date()),
        eq(videoAssets.isDeleted, false)
      ));
  }

  // --------------------------------------------------------------------------
  // PROJECTS
  // --------------------------------------------------------------------------
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async getProjectsByUser(userId: string): Promise<Project[]> {
    return db.select().from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.updatedAt));
  }

  async createProject(project: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values(project).returning();
    return created;
  }

  async updateProject(id: number, data: Partial<InsertProject>): Promise<Project> {
    const [updated] = await db.update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  // --------------------------------------------------------------------------
  // PROJECT FILES
  // --------------------------------------------------------------------------
  async getProjectFile(id: number): Promise<ProjectFile | undefined> {
    const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, id));
    return file;
  }

  async getProjectFilesByProject(projectId: number): Promise<ProjectFile[]> {
    return db.select().from(projectFiles)
      .where(eq(projectFiles.projectId, projectId))
      .orderBy(desc(projectFiles.uploadedAt));
  }

  async createProjectFile(file: InsertProjectFile): Promise<ProjectFile> {
    const [created] = await db.insert(projectFiles).values(file).returning();
    return created;
  }

  async deleteProjectFile(id: number): Promise<void> {
    await db.delete(projectFiles).where(eq(projectFiles.id, id));
  }
}

export const storage = new DatabaseStorage();
