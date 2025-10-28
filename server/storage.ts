import { db } from "./db";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import {
  tenants, type Tenant, type InsertTenant,
  policies, type Policy, type InsertPolicy,
  conversations, type Conversation, type InsertConversation,
  messages, type Message, type InsertMessage,
  documents, type Document, type InsertDocument,
  embeddings, type Embedding, type InsertEmbedding,
  toolExecutions, type ToolExecution, type InsertToolExecution,
  metrics, type Metric, type InsertMetric,
  auditLogs, type AuditLog, type InsertAuditLog,
  knowledgeSources, type KnowledgeSource, type InsertKnowledgeSource,
} from "@shared/schema";

// ============================================================================
// STORAGE INTERFACE - Complete CRUD operations for all entities
// ============================================================================
export interface IStorage {
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
}

// ============================================================================
// DATABASE STORAGE - PostgreSQL implementation via Drizzle ORM
// ============================================================================
export class DatabaseStorage implements IStorage {
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
    const [created] = await db.insert(policies).values(policy).returning();
    return created;
  }

  async updatePolicy(id: number, data: Partial<InsertPolicy>): Promise<Policy> {
    const [updated] = await db.update(policies)
      .set({ ...data, updatedAt: new Date() })
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
    const [created] = await db.insert(messages).values(message).returning();
    return created;
  }

  async updateMessage(id: number, data: Partial<InsertMessage>): Promise<Message> {
    const [updated] = await db.update(messages)
      .set(data)
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
    const [created] = await db.insert(documents).values(document).returning();
    return created;
  }

  async updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document> {
    const [updated] = await db.update(documents)
      .set({ ...data, updatedAt: new Date() })
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
    const [created] = await db.insert(embeddings).values(embedding).returning();
    return created;
  }

  async createEmbeddingsBatch(embeddingList: InsertEmbedding[]): Promise<Embedding[]> {
    if (embeddingList.length === 0) return [];
    return db.insert(embeddings).values(embeddingList).returning();
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
    const [created] = await db.insert(toolExecutions).values(execution).returning();
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
    const [created] = await db.insert(metrics).values(metric).returning();
    return created;
  }

  async createMetricsBatch(metricList: InsertMetric[]): Promise<Metric[]> {
    if (metricList.length === 0) return [];
    return db.insert(metrics).values(metricList).returning();
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
    const [created] = await db.insert(auditLogs).values(log).returning();
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
    const [created] = await db.insert(knowledgeSources).values(source).returning();
    return created;
  }

  async updateKnowledgeSource(id: number, data: Partial<InsertKnowledgeSource>): Promise<KnowledgeSource> {
    const [updated] = await db.update(knowledgeSources)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(knowledgeSources.id, id))
      .returning();
    return updated;
  }

  async deleteKnowledgeSource(id: number): Promise<void> {
    await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id));
  }
}

export const storage = new DatabaseStorage();
