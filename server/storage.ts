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
  trainingDataCollection, type TrainingDataCollection, type InsertTrainingDataCollection,
  roles, type Role,
  userRoles, type UserRole,
  permissions, type Permission, type InsertPermission,
  rolePermissions, type RolePermission, type InsertRolePermission,
  userPermissions, type UserPermission, type InsertUserPermission,
  usageRecords, type UsageRecord, type InsertUsageRecord,
  namespaceRelevanceRecords, type NamespaceRelevanceRecord, type InsertNamespaceRelevanceRecord,
  queryMetrics, type QueryMetric, type InsertQueryMetric,
  agentQueryResults, type AgentQueryResult, type InsertAgentQueryResult,
  backupOperations, type BackupOperation, type InsertBackupOperation,
  normalizeBehavior
} from "@shared/schema";
import { type PermissionAction, generatePermissionCode, validatePermissionSelection } from "@shared/permissions-catalog";

// Structured permission creation payload
export interface PermissionCreationPayload {
  name: string;
  module: string;
  submodule: string;
  actions: PermissionAction[];
  description?: string;
}

export interface PermissionUpdatePayload {
  name?: string;
  module?: string;
  submodule?: string;
  actions?: PermissionAction[];
  description?: string;
}

// ============================================================================
// INTERFACE DE STORAGE - Operações CRUD completas para todas as entidades
// ============================================================================
export interface IStorage {
  // Usuários (necessário para Replit Auth + Local Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User>;
  getUserRoles(userId: string): Promise<Role[]>;
  getUsers(limit?: number): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  
  // Roles & Permissions (RBAC)
  getRoles(): Promise<Role[]>;
  getRole(id: number): Promise<Role | undefined>;
  getPermissions(): Promise<Permission[]>;
  getPermission(id: number): Promise<Permission | undefined>;
  createPermission(permission: InsertPermission): Promise<Permission>;
  updatePermission(id: number, permission: Partial<InsertPermission>): Promise<Permission>;
  deletePermission(id: number): Promise<void>;
  checkPermissionUsage(permissionId: number): Promise<{ inUse: boolean; roleCount: number; userCount: number }>;
  getRolePermissions(roleId: number): Promise<Permission[]>;
  getUserPermissions(userId: string): Promise<Permission[]>;
  assignPermissionToRole(roleId: number, permissionId: number): Promise<void>;
  revokePermissionFromRole(roleId: number, permissionId: number): Promise<void>;
  assignPermissionToUser(userId: string, permissionId: number, assignedBy?: string): Promise<void>;
  revokePermissionFromUser(userId: string, permissionId: number): Promise<void>;
  getUserSpecificPermissions(userId: string): Promise<Permission[]>;
  
  // Structured permission creation (new UX)
  createPermissionStructured(payload: PermissionCreationPayload): Promise<Permission[]>;
  updatePermissionStructured(id: number, payload: PermissionUpdatePayload): Promise<Permission>;
  
  // Políticas
  getPolicy(id: number): Promise<Policy | undefined>;
  getActivePolicy(): Promise<Policy | undefined>;
  createPolicy(policy: InsertPolicy): Promise<Policy>;
  updatePolicy(id: number, data: Partial<InsertPolicy>): Promise<Policy>;
  deletePolicy(id: number): Promise<void>;
  
  // Conversas
  getConversation(id: number): Promise<Conversation | undefined>;
  getConversations(limit?: number): Promise<Conversation[]>;
  getConversationsByUser(userId: string, limit?: number): Promise<Conversation[]>;
  getConversationsWithMessageCount(userId: string, limit?: number): Promise<Array<Conversation & { messagesCount: number }>>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: number, data: Partial<InsertConversation>): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  
  // Mensagens
  getMessage(id: number): Promise<Message | undefined>;
  getMessagesByConversation(conversationId: number, limit?: number): Promise<Message[]>;
  countMessagesByConversation(conversationId: number): Promise<number>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: number, data: Partial<InsertMessage>): Promise<Message>;
  deleteMessage(id: number): Promise<void>;
  
  // Documentos
  getDocument(id: number): Promise<Document | undefined>;
  getDocuments(limit?: number): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, data: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;
  
  // Embeddings
  getEmbedding(id: number): Promise<Embedding | undefined>;
  getEmbeddingsByDocument(documentId: number): Promise<Embedding[]>;
  getEmbeddings(limit?: number): Promise<Embedding[]>;
  createEmbedding(embedding: InsertEmbedding): Promise<Embedding>;
  createEmbeddingsBatch(embeddings: InsertEmbedding[]): Promise<Embedding[]>;
  deleteEmbeddingsByDocument(documentId: number): Promise<void>;
  
  // Execuções de Ferramentas
  getToolExecution(id: number): Promise<ToolExecution | undefined>;
  getToolExecutionsByConversation(conversationId: number): Promise<ToolExecution[]>;
  createToolExecution(execution: InsertToolExecution): Promise<ToolExecution>;
  
  // Métricas
  getMetric(id: number): Promise<Metric | undefined>;
  getMetrics(metricType?: string, limit?: number): Promise<Metric[]>;
  getMetricsByTimeRange(startTime: Date, endTime: Date): Promise<Metric[]>;
  createMetric(metric: InsertMetric): Promise<Metric>;
  createMetricsBatch(metrics: InsertMetric[]): Promise<Metric[]>;
  
  // Logs de Auditoria
  getAuditLog(id: number): Promise<AuditLog | undefined>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  
  // Fontes de Conhecimento
  getKnowledgeSource(id: number): Promise<KnowledgeSource | undefined>;
  getKnowledgeSources(): Promise<KnowledgeSource[]>;
  getActiveKnowledgeSources(): Promise<KnowledgeSource[]>;
  createKnowledgeSource(source: InsertKnowledgeSource): Promise<KnowledgeSource>;
  updateKnowledgeSource(id: number, data: Partial<InsertKnowledgeSource>): Promise<KnowledgeSource>;
  deleteKnowledgeSource(id: number): Promise<void>;
  
  // Arquivos Gerados
  getGeneratedFile(id: number): Promise<GeneratedFile | undefined>;
  getGeneratedFilesByConversation(conversationId: number): Promise<GeneratedFile[]>;
  createGeneratedFile(file: InsertGeneratedFile): Promise<GeneratedFile>;
  markFileAsDeleted(id: number): Promise<void>;
  getExpiredFiles(): Promise<GeneratedFile[]>;
  
  // Jobs de Vídeo
  getVideoJob(id: number): Promise<VideoJob | undefined>;
  getVideoJobs(limit?: number): Promise<VideoJob[]>;
  getPendingVideoJobs(): Promise<VideoJob[]>;
  createVideoJob(job: InsertVideoJob): Promise<VideoJob>;
  updateVideoJob(id: number, data: Partial<InsertVideoJob>): Promise<VideoJob>;
  
  // Assets de Vídeo
  getVideoAsset(id: number): Promise<VideoAsset | undefined>;
  getVideoAssetByJobId(jobId: number): Promise<VideoAsset | undefined>;
  getVideoAssets(limit?: number): Promise<VideoAsset[]>;
  createVideoAsset(asset: InsertVideoAsset): Promise<VideoAsset>;
  markVideoAssetAsDeleted(id: number): Promise<void>;
  getExpiredVideoAssets(): Promise<VideoAsset[]>;
  
  // Projetos
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
  
  // Training Data Collection (auto-evolution from conversations)
  getTrainingDataCollection(id: number): Promise<TrainingDataCollection | undefined>;
  getAllTrainingDataCollection(status?: string, limit?: number): Promise<TrainingDataCollection[]>;
  getTrainingDataCollectionByConversation(conversationId: number): Promise<TrainingDataCollection | undefined>;
  createTrainingDataCollection(data: InsertTrainingDataCollection): Promise<TrainingDataCollection>;
  updateTrainingDataCollection(id: number, data: Partial<InsertTrainingDataCollection>): Promise<TrainingDataCollection>;
  deleteTrainingDataCollection(id: number): Promise<void>;
  
  // Backup Operations (Enterprise Backup/Recovery)
  getBackupOperation(id: number): Promise<BackupOperation | undefined>;
  listBackupOperations(userId?: string, limit?: number): Promise<BackupOperation[]>;
  getRecentBackupOperations(userId: string, hours: number): Promise<BackupOperation[]>;
  createBackupOperation(operation: InsertBackupOperation): Promise<BackupOperation>;
  updateBackupOperation(id: number, data: Partial<InsertBackupOperation>): Promise<BackupOperation>;
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

  async getUserRoles(userId: string): Promise<Role[]> {
    const result = await db
      .select({ role: roles })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    
    return result.map(r => r.role);
  }

  // ============================================================================
  // Roles & Permissions (RBAC)
  // ============================================================================

  async getRoles(): Promise<Role[]> {
    return await db.select().from(roles);
  }

  async getRole(id: number): Promise<Role | undefined> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    return role;
  }

  async getPermissions(): Promise<Permission[]> {
    return await db.select().from(permissions).orderBy(permissions.code);
  }

  async getPermission(id: number): Promise<Permission | undefined> {
    const [permission] = await db.select().from(permissions).where(eq(permissions.id, id));
    return permission;
  }

  async createPermission(permission: InsertPermission): Promise<Permission> {
    const [created] = await db.insert(permissions).values(permission).returning();
    return created;
  }

  async createPermissionStructured(payload: PermissionCreationPayload): Promise<Permission[]> {
    // Validate payload against catalog
    const validation = validatePermissionSelection(payload.module, payload.submodule, payload.actions);
    if (!validation.valid) {
      throw new Error(`Invalid permission selection: ${validation.errors.join(', ')}`);
    }

    // Generate one permission per action
    const permissionsToCreate: InsertPermission[] = payload.actions.map(action => ({
      name: payload.name,
      code: generatePermissionCode(payload.module, payload.submodule, action),
      module: payload.module,
      submodule: payload.submodule,
      action,
      description: payload.description || null,
    }));

    // Insert all permissions
    const created = await db.insert(permissions).values(permissionsToCreate).returning();
    return created;
  }

  async updatePermission(id: number, data: Partial<InsertPermission>): Promise<Permission> {
    const [updated] = await db.update(permissions)
      .set(data)
      .where(eq(permissions.id, id))
      .returning();
    return updated;
  }

  async updatePermissionStructured(id: number, payload: PermissionUpdatePayload): Promise<Permission> {
    // Build update data
    const updateData: Partial<InsertPermission> = {};
    
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.description !== undefined) updateData.description = payload.description;
    
    // If changing module/submodule/action, regenerate code and validate
    if (payload.module || payload.submodule || payload.actions) {
      const existing = await this.getPermission(id);
      if (!existing) throw new Error('Permission not found');
      
      const newModule = payload.module || existing.module;
      const newSubmodule = payload.submodule || existing.submodule;
      const newActions = payload.actions || [existing.action as PermissionAction];
      
      // Validate new selection
      const validation = validatePermissionSelection(newModule, newSubmodule, newActions);
      if (!validation.valid) {
        throw new Error(`Invalid permission selection: ${validation.errors.join(', ')}`);
      }
      
      // Update fields
      updateData.module = newModule;
      updateData.submodule = newSubmodule;
      updateData.action = newActions[0]; // For single update, use first action
      updateData.code = generatePermissionCode(newModule, newSubmodule, newActions[0]);
    }
    
    const [updated] = await db.update(permissions)
      .set(updateData)
      .where(eq(permissions.id, id))
      .returning();
    
    return updated;
  }

  async deletePermission(id: number): Promise<void> {
    // CASCADE delete will handle rolePermissions and userPermissions
    await db.delete(permissions).where(eq(permissions.id, id));
  }

  async checkPermissionUsage(permissionId: number): Promise<{ inUse: boolean; roleCount: number; userCount: number }> {
    const [roleCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rolePermissions)
      .where(eq(rolePermissions.permissionId, permissionId));
    
    const [userCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userPermissions)
      .where(eq(userPermissions.permissionId, permissionId));
    
    const inUse = (roleCount.count > 0) || (userCount.count > 0);
    
    return {
      inUse,
      roleCount: roleCount.count,
      userCount: userCount.count
    };
  }

  async getRolePermissions(roleId: number): Promise<Permission[]> {
    const result = await db
      .select({ permission: permissions })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));
    
    return result.map(r => r.permission);
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    // Get permissions from roles
    const rolePerms = await db
      .select({ permission: permissions })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, userId));
    
    // Get user-specific permissions
    const userPerms = await db
      .select({ permission: permissions })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(eq(userPermissions.userId, userId));
    
    // Merge and deduplicate by permission code
    const allPerms = [...rolePerms.map(r => r.permission), ...userPerms.map(r => r.permission)];
    const uniquePerms = Array.from(new Map(allPerms.map(p => [p.code, p])).values());
    
    return uniquePerms;
  }

  async assignPermissionToRole(roleId: number, permissionId: number): Promise<void> {
    await db.insert(rolePermissions).values({ roleId, permissionId });
  }

  async revokePermissionFromRole(roleId: number, permissionId: number): Promise<void> {
    await db
      .delete(rolePermissions)
      .where(and(
        eq(rolePermissions.roleId, roleId),
        eq(rolePermissions.permissionId, permissionId)
      ));
  }

  async assignPermissionToUser(userId: string, permissionId: number, assignedBy?: string): Promise<void> {
    await db.insert(userPermissions).values({ 
      userId, 
      permissionId,
      assignedBy
    });
  }

  async revokePermissionFromUser(userId: string, permissionId: number): Promise<void> {
    await db
      .delete(userPermissions)
      .where(and(
        eq(userPermissions.userId, userId),
        eq(userPermissions.permissionId, permissionId)
      ));
  }

  async getUserSpecificPermissions(userId: string): Promise<Permission[]> {
    const result = await db
      .select({ permission: permissions })
      .from(userPermissions)
      .innerJoin(permissions, eq(userPermissions.permissionId, permissions.id))
      .where(eq(userPermissions.userId, userId));
    
    return result.map(r => r.permission);
  }

  async getUsers(limit: number = 100): Promise<User[]> {
    return db.select().from(users)
      .orderBy(desc(users.createdAt))
      .limit(limit);
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // --------------------------------------------------------------------------
  // POLICIES
  // --------------------------------------------------------------------------
  async getPolicy(id: number): Promise<Policy | undefined> {
    const [policy] = await db.select().from(policies).where(eq(policies.id, id));
    return policy;
  }

  async getActivePolicy(): Promise<Policy | undefined> {
    // 🔥 CRITICAL FIX: Use updatedAt instead of createdAt to get MOST RECENT policy
    // This ensures we load the policy that was last edited, not first created
    // Bug: User saves sliders → policy updated_at changes → but getActivePolicy()
    // was loading oldest policy by created_at, ignoring latest changes!
    const [policy] = await db.select().from(policies)
      .where(eq(policies.isActive, true))
      .orderBy(desc(policies.updatedAt));
    
    if (policy && policy.behavior) {
      policy.behavior = normalizeBehavior(policy.behavior);
    }
    
    return policy;
  }

  async createPolicy(policy: InsertPolicy): Promise<Policy> {
    const [created] = await db.insert(policies).values([policy] as any).returning();
    return created;
  }

  async updatePolicy(id: number, data: Partial<InsertPolicy>): Promise<Policy> {
    if (data.behavior) {
      data.behavior = normalizeBehavior(data.behavior);
    }
    
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

  async getConversations(limit: number = 50): Promise<Conversation[]> {
    return db.select().from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
  }

  async getConversationsByUser(userId: string, limit: number = 50): Promise<Conversation[]> {
    return db.select().from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
  }

  async getConversationsWithMessageCount(userId: string, limit: number = 50): Promise<Array<Conversation & { messagesCount: number }>> {
    // Efficient SQL query with LEFT JOIN and COUNT
    const results = await db
      .select({
        id: conversations.id,
        userId: conversations.userId,
        projectId: conversations.projectId,
        title: conversations.title,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        namespace: conversations.namespace,
        lastActivityAt: conversations.lastActivityAt,
        expiresAt: conversations.expiresAt,
        archivedAt: conversations.archivedAt,
        messagesCount: sql<number>`COUNT(${messages.id})::int`
      })
      .from(conversations)
      .leftJoin(messages, eq(conversations.id, messages.conversationId))
      .where(eq(conversations.userId, userId))
      .groupBy(conversations.id)
      .orderBy(desc(conversations.updatedAt))
      .limit(limit);
    
    return results as Array<Conversation & { messagesCount: number }>;
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

  async countMessagesByConversation(conversationId: number): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    return result[0]?.count || 0;
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

  async deleteMessage(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  // --------------------------------------------------------------------------
  // DOCUMENTS
  // --------------------------------------------------------------------------
  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }

  async getDocuments(limit: number = 100): Promise<Document[]> {
    return db.select().from(documents)
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
    // Delete embeddings first (foreign key constraint)
    await db.delete(embeddings).where(eq(embeddings.documentId, id));
    // Then delete the document
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
    // HITL FIX: Only return embeddings for approved documents (status='indexed')
    // This prevents unreviewed content from appearing in RAG searches
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, documentId),
    });
    
    if (!doc || doc.status !== 'indexed') {
      return []; // Document not approved, return no embeddings
    }
    
    return db.select().from(embeddings)
      .where(eq(embeddings.documentId, documentId))
      .orderBy(embeddings.chunkIndex);
  }

  async getEmbeddings(limit: number = 1000): Promise<Embedding[]> {
    // HITL FIX: Only return embeddings for approved documents (status='indexed')
    // Join with documents table to filter by status
    const approvedDocs = await db.query.documents.findMany({
      where: eq(documents.status, 'indexed'),
    });
    
    const approvedDocIds = approvedDocs.map(d => d.id);
    
    if (approvedDocIds.length === 0) {
      return []; // No approved docs, return no embeddings
    }
    
    return db.select().from(embeddings)
      .where(
        sql`${embeddings.documentId} IN (${sql.join(approvedDocIds.map(id => sql`${id}`), sql`, `)})` 
      )
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

  async getMetrics(metricType?: string, limit: number = 1000): Promise<Metric[]> {
    if (metricType) {
      return db.select().from(metrics)
        .where(eq(metrics.metricType, metricType))
        .orderBy(desc(metrics.timestamp))
        .limit(limit);
    }
    return db.select().from(metrics)
      .orderBy(desc(metrics.timestamp))
      .limit(limit);
  }

  async getMetricsByTimeRange(startTime: Date, endTime: Date): Promise<Metric[]> {
    return db.select().from(metrics)
      .where(and(
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

  async getAuditLogs(limit: number = 100): Promise<AuditLog[]> {
    return db.select().from(auditLogs)
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

  async getKnowledgeSources(): Promise<KnowledgeSource[]> {
    return db.select().from(knowledgeSources)
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

  async getVideoJobs(limit: number = 50): Promise<VideoJob[]> {
    return db.select().from(videoJobs)
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

  async getVideoAssets(limit: number = 50): Promise<VideoAsset[]> {
    return db.select().from(videoAssets)
      .where(eq(videoAssets.isDeleted, false))
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

  // --------------------------------------------------------------------------
  // TRAINING DATA COLLECTION - Auto-evolution from conversations
  // --------------------------------------------------------------------------
  async getTrainingDataCollection(id: number): Promise<TrainingDataCollection | undefined> {
    const [record] = await db.select().from(trainingDataCollection).where(eq(trainingDataCollection.id, id));
    return record;
  }

  async getAllTrainingDataCollection(
    status?: string,
    limit: number = 100
  ): Promise<TrainingDataCollection[]> {
    if (status) {
      return db.select().from(trainingDataCollection)
        .where(eq(trainingDataCollection.status, status))
        .orderBy(desc(trainingDataCollection.createdAt))
        .limit(limit);
    }
    
    return db.select().from(trainingDataCollection)
      .orderBy(desc(trainingDataCollection.createdAt))
      .limit(limit);
  }

  async getTrainingDataCollectionByConversation(conversationId: number): Promise<TrainingDataCollection | undefined> {
    const [record] = await db.select().from(trainingDataCollection)
      .where(eq(trainingDataCollection.conversationId, conversationId));
    return record;
  }

  async createTrainingDataCollection(data: InsertTrainingDataCollection): Promise<TrainingDataCollection> {
    const [created] = await db.insert(trainingDataCollection).values([data] as any).returning();
    return created;
  }

  async updateTrainingDataCollection(id: number, data: Partial<InsertTrainingDataCollection>): Promise<TrainingDataCollection> {
    const [updated] = await db.update(trainingDataCollection)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(trainingDataCollection.id, id))
      .returning();
    return updated;
  }

  async deleteTrainingDataCollection(id: number): Promise<void> {
    await db.delete(trainingDataCollection).where(eq(trainingDataCollection.id, id));
  }

  // --------------------------------------------------------------------------
  // USAGE TRACKING - Agent and Namespace usage (PRODUCTION-READY)
  // --------------------------------------------------------------------------
  async createUsageRecord(data: InsertUsageRecord): Promise<UsageRecord> {
    const [created] = await db.insert(usageRecords).values([data] as any).returning();
    return created;
  }

  async getUsageRecords(filters?: {
    entityType?: "agent" | "namespace";
    entityId?: string;
    agentTier?: "agent" | "subagent";
    parentAgentId?: string;
    isRootNamespace?: boolean;
    parentNamespace?: string;
    daysAgo?: number;
    limit?: number;
  }): Promise<UsageRecord[]> {
    let query = db.select().from(usageRecords);
    
    const conditions: any[] = [];
    
    if (filters?.entityType) {
      conditions.push(eq(usageRecords.entityType, filters.entityType));
    }
    if (filters?.entityId) {
      conditions.push(eq(usageRecords.entityId, filters.entityId));
    }
    if (filters?.agentTier) {
      conditions.push(eq(usageRecords.agentTier, filters.agentTier));
    }
    if (filters?.parentAgentId) {
      conditions.push(eq(usageRecords.parentAgentId, filters.parentAgentId));
    }
    if (filters?.isRootNamespace !== undefined) {
      conditions.push(eq(usageRecords.isRootNamespace, filters.isRootNamespace));
    }
    if (filters?.parentNamespace) {
      conditions.push(eq(usageRecords.parentNamespace, filters.parentNamespace));
    }
    if (filters?.daysAgo) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.daysAgo);
      conditions.push(gte(usageRecords.timestamp, cutoffDate));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return query
      .orderBy(desc(usageRecords.timestamp))
      .limit(filters?.limit || 1000);
  }

  // --------------------------------------------------------------------------
  // NAMESPACE RELEVANCE - KB search quality (PRODUCTION-READY)
  // --------------------------------------------------------------------------
  async createNamespaceRelevanceRecord(data: InsertNamespaceRelevanceRecord): Promise<NamespaceRelevanceRecord> {
    const [created] = await db.insert(namespaceRelevanceRecords).values([data] as any).returning();
    return created;
  }

  async getNamespaceRelevanceRecords(filters?: {
    namespace?: string;
    daysAgo?: number;
    limit?: number;
  }): Promise<NamespaceRelevanceRecord[]> {
    let query = db.select().from(namespaceRelevanceRecords);
    
    const conditions: any[] = [];
    
    if (filters?.namespace) {
      conditions.push(eq(namespaceRelevanceRecords.namespace, filters.namespace));
    }
    if (filters?.daysAgo) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.daysAgo);
      conditions.push(gte(namespaceRelevanceRecords.timestamp, cutoffDate));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return query
      .orderBy(desc(namespaceRelevanceRecords.timestamp))
      .limit(filters?.limit || 1000);
  }

  // --------------------------------------------------------------------------
  // QUERY METRICS - API performance tracking (PRODUCTION-READY)
  // --------------------------------------------------------------------------
  async createQueryMetric(data: InsertQueryMetric): Promise<QueryMetric> {
    const [created] = await db.insert(queryMetrics).values([data] as any).returning();
    return created;
  }

  async getQueryMetrics(filters?: {
    queryType?: string;
    provider?: string;
    success?: boolean;
    daysAgo?: number;
    limit?: number;
  }): Promise<QueryMetric[]> {
    let query = db.select().from(queryMetrics);
    
    const conditions: any[] = [];
    
    if (filters?.queryType) {
      conditions.push(eq(queryMetrics.queryType, filters.queryType));
    }
    if (filters?.provider) {
      conditions.push(eq(queryMetrics.provider, filters.provider));
    }
    if (filters?.success !== undefined) {
      conditions.push(eq(queryMetrics.success, filters.success));
    }
    if (filters?.daysAgo) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.daysAgo);
      conditions.push(gte(queryMetrics.timestamp, cutoffDate));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return query
      .orderBy(desc(queryMetrics.timestamp))
      .limit(filters?.limit || 1000);
  }

  // --------------------------------------------------------------------------
  // AGENT QUERY RESULTS - Agent execution tracking (PRODUCTION-READY)
  // --------------------------------------------------------------------------
  async createAgentQueryResult(data: InsertAgentQueryResult): Promise<AgentQueryResult> {
    const [created] = await db.insert(agentQueryResults).values([data] as any).returning();
    return created;
  }

  async getAgentQueryResults(filters?: {
    agentId?: string;
    success?: boolean;
    daysAgo?: number;
    limit?: number;
  }): Promise<AgentQueryResult[]> {
    let query = db.select().from(agentQueryResults);
    
    const conditions: any[] = [];
    
    if (filters?.agentId) {
      conditions.push(eq(agentQueryResults.agentId, filters.agentId));
    }
    if (filters?.success !== undefined) {
      conditions.push(eq(agentQueryResults.success, filters.success));
    }
    if (filters?.daysAgo) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.daysAgo);
      conditions.push(gte(agentQueryResults.timestamp, cutoffDate));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return query
      .orderBy(desc(agentQueryResults.timestamp))
      .limit(filters?.limit || 1000);
  }

  // --------------------------------------------------------------------------
  // BACKUP OPERATIONS - Enterprise Backup/Recovery (PRODUCTION-READY)
  // --------------------------------------------------------------------------
  async getBackupOperation(id: number): Promise<BackupOperation | undefined> {
    const [operation] = await db
      .select()
      .from(backupOperations)
      .where(eq(backupOperations.id, id));
    return operation;
  }

  async listBackupOperations(userId?: string, limit = 50): Promise<BackupOperation[]> {
    let query = db
      .select()
      .from(backupOperations)
      .orderBy(desc(backupOperations.startedAt));
    
    if (userId) {
      query = query.where(eq(backupOperations.userId, userId)) as any;
    }
    
    return await query.limit(limit);
  }

  async getRecentBackupOperations(userId: string, hours: number): Promise<BackupOperation[]> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    return await db
      .select()
      .from(backupOperations)
      .where(
        and(
          eq(backupOperations.userId, userId),
          gte(backupOperations.startedAt, cutoffTime),
          eq(backupOperations.operationType, 'backup')
        )
      )
      .orderBy(desc(backupOperations.startedAt));
  }

  async createBackupOperation(operation: InsertBackupOperation): Promise<BackupOperation> {
    const [created] = await db
      .insert(backupOperations)
      .values([operation] as any)
      .returning();
    return created;
  }

  async updateBackupOperation(id: number, data: Partial<InsertBackupOperation>): Promise<BackupOperation> {
    const [updated] = await db
      .update(backupOperations)
      .set(data as any)
      .where(eq(backupOperations.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Backup operation ${id} not found`);
    }
    
    return updated;
  }
}

export const storage = new DatabaseStorage();
