import { readFile } from 'fs/promises';
import path from 'path';
import { db } from '../db';
import { 
  conversations, 
  trainingJobs, 
  trainingDataCollection,
  datasets, 
  documents, 
  embeddings,
  gpuWorkers, 
  agents, 
  namespaces 
} from '@shared/schema';
import { eq, and, lt, sql, inArray } from 'drizzle-orm';
import { curationStore } from '../curation/store';
import { FileCleanup } from '../cleanup/file-cleanup';

interface LifecyclePolicy {
  version: string;
  description: string;
  globalDefaults: {
    retentionYears: number;
    retentionDays: number;
    timezone: string;
    auditLogEnabled: boolean;
    dryRun: boolean;
  };
  modules: {
    [key: string]: ModuleConfig;
  };
  schedule: {
    description: string;
    timezone: string;
    runs: ScheduleRun[];
  };
  auditLog: {
    enabled: boolean;
    destination: string;
    format: string;
    includeFields: string[];
  };
}

interface ModuleConfig {
  enabled: boolean;
  description: string;
  policies: Policy[];
}

interface Policy {
  name: string;
  enabled: boolean;
  action: string;
  description: string;
  condition: any;
  preserveIf?: any;
  effect: any;
  implementation?: string;
}

interface ScheduleRun {
  frequency: string;
  dayOfMonth?: number;
  hour?: number;
  minute?: number;
  modules: string[];
}

interface CleanupResult {
  module: string;
  policy: string;
  recordsDeleted: number;
  recordsPreserved: number;
  errors: string[];
  timestamp: Date;
}

export class LifecycleManager {
  private policy: LifecyclePolicy | null = null;
  private fileCleanup: FileCleanup;

  constructor() {
    this.fileCleanup = new FileCleanup();
  }

  /**
   * Load lifecycle policy from config file
   */
  async loadPolicy(): Promise<void> {
    try {
      const policyPath = path.join(process.cwd(), 'config', 'lifecycle-policy.json');
      const policyContent = await readFile(policyPath, 'utf-8');
      this.policy = JSON.parse(policyContent);
      
      console.log(`[LifecycleManager] Policy loaded: v${this.policy?.version}`);
      console.log(`[LifecycleManager] ${Object.keys(this.policy?.modules || {}).length} modules configured`);
    } catch (error) {
      console.error('[LifecycleManager] Failed to load policy:', error);
      throw error;
    }
  }

  /**
   * Run full lifecycle pass for all scheduled modules
   */
  async runLifecyclePass(): Promise<CleanupResult[]> {
    if (!this.policy) {
      await this.loadPolicy();
    }

    const results: CleanupResult[] = [];
    const now = new Date();

    console.log(`[LifecycleManager] Starting lifecycle pass at ${now.toISOString()}`);

    // Get modules to run based on current time and schedule
    const modulesToRun = this.getScheduledModules();
    
    console.log(`[LifecycleManager] Running cleanup for modules: ${modulesToRun.join(', ')}`);

    for (const moduleName of modulesToRun) {
      const moduleConfig = this.policy?.modules[moduleName];
      
      if (!moduleConfig || !moduleConfig.enabled) {
        console.log(`[LifecycleManager] Skipping disabled module: ${moduleName}`);
        continue;
      }

      console.log(`[LifecycleManager] Processing module: ${moduleName}`);

      for (const policy of moduleConfig.policies) {
        if (!policy.enabled) {
          console.log(`[LifecycleManager]   Skipping disabled policy: ${policy.name}`);
          continue;
        }

        try {
          const result = await this.executePolicy(moduleName, policy);
          results.push(result);

          if (this.policy?.auditLog.enabled) {
            this.logAudit(result);
          }
        } catch (error) {
          console.error(`[LifecycleManager] Error executing policy ${policy.name}:`, error);
          results.push({
            module: moduleName,
            policy: policy.name,
            recordsDeleted: 0,
            recordsPreserved: 0,
            errors: [(error as Error).message],
            timestamp: new Date(),
          });
        }
      }
    }

    console.log(`[LifecycleManager] Lifecycle pass complete. ${results.length} policies executed.`);
    
    return results;
  }

  /**
   * Get modules scheduled to run based on current time
   * Respects policy timezone from config
   */
  private getScheduledModules(): string[] {
    if (!this.policy) return [];

    const now = new Date();
    
    // Parse timezone offset from policy (e.g., "America/Sao_Paulo" or "UTC-3")
    // For BRT (Brasília Time), the offset is UTC-3 (no DST since 2019)
    let timezoneOffset = -3; // Default to BRT
    
    if (this.policy.schedule.timezone) {
      const tz = this.policy.schedule.timezone;
      if (tz.includes('UTC')) {
        // Parse "UTC-3" format
        const match = tz.match(/UTC([+-]\d+)/);
        if (match) {
          timezoneOffset = parseInt(match[1]);
        }
      } else if (tz.includes('Sao_Paulo') || tz.includes('Brasilia')) {
        // BRT is permanently UTC-3 (no DST since 2019)
        timezoneOffset = -3;
      }
    }
    
    // Convert to policy timezone
    const localTime = new Date(now.getTime() + (timezoneOffset * 60 * 60 * 1000));
    
    const currentHour = localTime.getUTCHours();
    const currentDay = localTime.getUTCDate();
    const currentMinute = localTime.getUTCMinutes();
    
    const modulesToRun: Set<string> = new Set();

    for (const run of this.policy.schedule.runs) {
      if (run.frequency === 'hourly') {
        // Hourly runs execute every hour
        run.modules.forEach(m => modulesToRun.add(m));
      } else if (run.frequency === 'monthly') {
        // Monthly runs execute on specific day, hour, and minute
        const hourMatch = run.hour === currentHour;
        const dayMatch = run.dayOfMonth === currentDay;
        const minuteMatch = run.minute === undefined || run.minute === currentMinute;
        
        if (dayMatch && hourMatch && minuteMatch) {
          run.modules.forEach(m => modulesToRun.add(m));
        }
      }
    }

    return Array.from(modulesToRun);
  }

  /**
   * Execute a single policy
   */
  private async executePolicy(moduleName: string, policy: Policy): Promise<CleanupResult> {
    console.log(`[LifecycleManager]   Executing policy: ${policy.name}`);

    // Check if policy uses existing implementation
    if (policy.implementation) {
      return await this.executeExistingImplementation(moduleName, policy);
    }

    // Route to module-specific handler
    switch (moduleName) {
      case 'conversations':
        return await this.cleanupConversations(policy);
      case 'trainingData':
        return await this.cleanupTrainingData(policy);
      case 'datasets':
        return await this.cleanupDatasets(policy);
      case 'knowledgeBase':
        return await this.cleanupKnowledgeBase(policy);
      case 'gpu':
        return await this.cleanupGPU(policy);
      case 'agents':
        return await this.cleanupAgents(policy);
      case 'namespaces':
        return await this.cleanupNamespaces(policy);
      default:
        throw new Error(`No handler for module: ${moduleName}`);
    }
  }

  /**
   * Execute policy using existing implementation
   */
  private async executeExistingImplementation(moduleName: string, policy: Policy): Promise<CleanupResult> {
    let recordsDeleted = 0;

    if (!policy.implementation) {
      throw new Error(`Policy ${policy.name} has no implementation`);
    }

    if (policy.implementation.includes('FileCleanup.cleanupExpiredFiles')) {
      // Already running hourly via FileCleanup service
      console.log(`[LifecycleManager]     Using existing: FileCleanup.cleanupExpiredFiles()`);
      recordsDeleted = 0; // Not counted here, handled by FileCleanup
    } else if (policy.implementation.includes('FileCleanup.cleanupOldTokens')) {
      // Note: cleanupOldTokens is handled by FileCleanup startup routine
      // We don't call it directly here to avoid duplication
      console.log(`[LifecycleManager]     Using existing: FileCleanup.cleanupOldTokens() (via startup routine)`);
      recordsDeleted = 0;
    } else if (policy.implementation.includes('curationStore.cleanupExpiredRejectedItems')) {
      const result = await curationStore.cleanupExpiredRejectedItems();
      recordsDeleted = result?.curationItemsDeleted || 0;
    } else if (policy.implementation.includes('curationStore.cleanupOldCurationData')) {
      const result = await curationStore.cleanupOldCurationData();
      recordsDeleted = result?.curationItemsDeleted || 0;
    }

    return {
      module: moduleName,
      policy: policy.name,
      recordsDeleted,
      recordsPreserved: 0,
      errors: [],
      timestamp: new Date(),
    };
  }

  /**
   * Cleanup conversations based on policy
   */
  private async cleanupConversations(policy: Policy): Promise<CleanupResult> {
    const now = new Date();
    let recordsDeleted = 0;
    let recordsPreserved = 0;

    if (policy.name === 'archive_inactive') {
      // Archive conversations inactive for 18 months
      const archiveThreshold = new Date();
      archiveThreshold.setMonth(archiveThreshold.getMonth() - 18);

      // Find candidates
      const candidates = await db
        .select()
        .from(conversations)
        .where(
          and(
            sql`${conversations.lastActivityAt} IS NOT NULL`,
            lt(conversations.lastActivityAt, archiveThreshold),
            sql`${conversations.archivedAt} IS NULL`
          )
        );

      // Check preserve conditions (linked to training data)
      for (const conv of candidates) {
        const linkedToTraining = await db
          .select()
          .from(trainingDataCollection)
          .where(eq(trainingDataCollection.conversationId, conv.id))
          .limit(1);

        if (linkedToTraining.length > 0) {
          recordsPreserved++;
          continue;
        }

        // Archive
        await db
          .update(conversations)
          .set({ archivedAt: now })
          .where(eq(conversations.id, conv.id));
        
        recordsDeleted++;
      }

      console.log(`[LifecycleManager]     Archived ${recordsDeleted} conversations, preserved ${recordsPreserved}`);
    } else if (policy.name === 'purge_old') {
      // Delete conversations older than 5 years
      const purgeThreshold = new Date();
      purgeThreshold.setFullYear(purgeThreshold.getFullYear() - 5);

      const candidates = await db
        .select()
        .from(conversations)
        .where(lt(conversations.createdAt, purgeThreshold));

      for (const conv of candidates) {
        // Check preserve conditions
        const linkedToTraining = await db
          .select()
          .from(trainingDataCollection)
          .where(eq(trainingDataCollection.conversationId, conv.id))
          .limit(1);

        if (linkedToTraining.length > 0) {
          recordsPreserved++;
          continue;
        }

        // Delete (cascade will handle messages)
        await db
          .delete(conversations)
          .where(eq(conversations.id, conv.id));
        
        recordsDeleted++;
      }

      console.log(`[LifecycleManager]     Purged ${recordsDeleted} conversations, preserved ${recordsPreserved}`);
    }

    return {
      module: 'conversations',
      policy: policy.name,
      recordsDeleted,
      recordsPreserved,
      errors: [],
      timestamp: now,
    };
  }

  /**
   * Cleanup training data based on policy
   */
  private async cleanupTrainingData(policy: Policy): Promise<CleanupResult> {
    const now = new Date();
    let recordsDeleted = 0;
    let recordsPreserved = 0;

    if (policy.name === 'cleanup_stale_jobs') {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 30);

      const staleJobs = await db
        .select()
        .from(trainingJobs)
        .where(
          and(
            inArray(trainingJobs.status, ['completed', 'failed', 'cancelled']),
            sql`${trainingJobs.completedAt} IS NOT NULL`,
            lt(trainingJobs.completedAt, threshold)
          )
        );

      // Check preservation conditions before deleting
      for (const job of staleJobs) {
        // Preserve if checkpoint is actively used by agents
        if (job.latestCheckpoint) {
          const agentsUsingCheckpoint = await db
            .select()
            .from(agents)
            .where(
              and(
                eq(agents.enabled, true),
                sql`${agents.inferenceConfig}->>'adapterIds' @> ${JSON.stringify([job.latestCheckpoint])}`
              )
            )
            .limit(1);

          if (agentsUsingCheckpoint.length > 0) {
            recordsPreserved++;
            continue; // Skip deletion - checkpoint is in use
          }
        }

        // Safe to delete
        await db
          .delete(trainingJobs)
          .where(eq(trainingJobs.id, job.id));
        
        recordsDeleted++;
      }

      console.log(`[LifecycleManager]     Deleted ${recordsDeleted} stale training jobs, preserved ${recordsPreserved}`);
    } else if (policy.name === 'cleanup_orphaned_collections') {
      // Delete training data collections with null conversation references
      const orphanedCollections = await db
        .select()
        .from(trainingDataCollection)
        .where(sql`${trainingDataCollection.conversationId} IS NOT NULL`);

      for (const collection of orphanedCollections) {
        // Check if conversation exists
        const convExists = await db
          .select()
          .from(conversations)
          .where(eq(conversations.id, collection.conversationId!))
          .limit(1);

        if (convExists.length === 0) {
          await db
            .delete(trainingDataCollection)
            .where(eq(trainingDataCollection.id, collection.id));
          
          recordsDeleted++;
        }
      }

      console.log(`[LifecycleManager]     Deleted ${recordsDeleted} orphaned training collections`);
    }

    return {
      module: 'trainingData',
      policy: policy.name,
      recordsDeleted,
      recordsPreserved,
      errors: [],
      timestamp: now,
    };
  }

  /**
   * Cleanup datasets based on policy (flag-only, no auto-delete)
   */
  private async cleanupDatasets(policy: Policy): Promise<CleanupResult> {
    // Datasets cleanup is flag-only (handled by platform orphan scan)
    // No active cleanup here to prevent accidental data loss
    console.log(`[LifecycleManager]     Datasets cleanup is flag-only (see platform orphan scan)`);
    
    return {
      module: 'datasets',
      policy: policy.name,
      recordsDeleted: 0,
      recordsPreserved: 0,
      errors: [],
      timestamp: new Date(),
    };
  }

  /**
   * Cleanup knowledge base based on policy
   */
  private async cleanupKnowledgeBase(policy: Policy): Promise<CleanupResult> {
    const now = new Date();
    let recordsDeleted = 0;
    let recordsPreserved = 0;

    if (policy.name === 'cleanup_old_documents') {
      // DOCUMENT-LEVEL PRESERVATION: Use recent activity as proxy for training dataset usage
      // 
      // Schema limitation: trainingDataCollection doesn't store sourceDocumentIds
      // - Cannot directly verify if document ID is in training datasets
      // - formatted_data contains instruction/output pairs, not source document IDs
      // - metadata.namespaces[] is too coarse-grained (preserves entire namespaces)
      //
      // PRESERVATION STRATEGY: Use recent embeddings as proxy for "active in training"
      // - If document has embeddings created in last 12 months → likely used in RAG → preserve
      // - If document namespace is in trainingDataCollection.metadata.namespaces[] → preserve
      // - Otherwise → safe to delete (not actively used in training)
      
      const threshold = new Date();
      threshold.setFullYear(threshold.getFullYear() - 5);

      const oldDocs = await db
        .select()
        .from(documents)
        .where(lt(documents.createdAt, threshold));

      // Get all namespaces used in training data collections
      const trainingCollections = await db
        .select({ metadata: trainingDataCollection.metadata })
        .from(trainingDataCollection);

      // Build set of all namespaces referenced by training data
      const trainingNamespaces = new Set<string>();
      for (const collection of trainingCollections) {
        const metadata = collection.metadata as { namespaces?: string[] };
        if (metadata?.namespaces) {
          metadata.namespaces.forEach(ns => trainingNamespaces.add(ns));
        }
      }

      const recentEmbeddingThreshold = new Date();
      recentEmbeddingThreshold.setMonth(recentEmbeddingThreshold.getMonth() - 12);

      for (const doc of oldDocs) {
        let shouldPreserve = false;

        // Preservation check 1: Document namespace in training data
        if (doc.namespace && trainingNamespaces.has(doc.namespace)) {
          shouldPreserve = true;
        }

        // Preservation check 2: Document has recent embeddings (actively queried via RAG)
        if (!shouldPreserve) {
          const recentEmbeddings = await db
            .select({ id: embeddings.id })
            .from(embeddings)
            .where(
              and(
                eq(embeddings.documentId, doc.id),
                sql`${embeddings.createdAt} > ${recentEmbeddingThreshold}`
              )
            )
            .limit(1);

          if (recentEmbeddings.length > 0) {
            shouldPreserve = true;
          }
        }

        if (shouldPreserve) {
          recordsPreserved++;
        } else {
          // Safe to delete (embeddings cascade via FK, physical files handled by cleanup service)
          await db
            .delete(documents)
            .where(eq(documents.id, doc.id));
          
          recordsDeleted++;
        }
      }

      console.log(`[LifecycleManager]     Deleted ${recordsDeleted} KB documents (>5yr, inactive)`);
      console.log(`[LifecycleManager]     Preserved ${recordsPreserved} KB documents (training namespaces + recent embeddings)`);

    } else if (policy.name === 'cleanup_orphaned_embeddings') {
      // Delete embeddings without parent documents
      const allEmbeddings = await db.select().from(embeddings);
      
      for (const embedding of allEmbeddings) {
        const docExists = await db
          .select()
          .from(documents)
          .where(eq(documents.id, embedding.documentId))
          .limit(1);

        if (docExists.length === 0) {
          await db
            .delete(embeddings)
            .where(eq(embeddings.id, embedding.id));
          
          recordsDeleted++;
        }
      }

      console.log(`[LifecycleManager]     Deleted ${recordsDeleted} orphaned embeddings`);
    }

    return {
      module: 'knowledgeBase',
      policy: policy.name,
      recordsDeleted,
      recordsPreserved,
      errors: [],
      timestamp: now,
    };
  }

  /**
   * Cleanup GPU resources based on policy
   */
  private async cleanupGPU(policy: Policy): Promise<CleanupResult> {
    const now = new Date();
    let recordsDeleted = 0;

    if (policy.name === 'cleanup_stale_workers') {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 7);

      const staleWorkers = await db
        .select()
        .from(gpuWorkers)
        .where(
          and(
            inArray(gpuWorkers.status, ['offline', 'error']),
            sql`${gpuWorkers.lastUsedAt} IS NOT NULL`,
            lt(gpuWorkers.lastUsedAt, threshold)
          )
        );

      for (const worker of staleWorkers) {
        await db
          .delete(gpuWorkers)
          .where(eq(gpuWorkers.id, worker.id));
        
        recordsDeleted++;
      }

      console.log(`[LifecycleManager]     Deleted ${recordsDeleted} stale GPU workers`);
    }

    return {
      module: 'gpu',
      policy: policy.name,
      recordsDeleted,
      recordsPreserved: 0,
      errors: [],
      timestamp: now,
    };
  }

  /**
   * Cleanup soft-deleted agents based on policy
   */
  private async cleanupAgents(policy: Policy): Promise<CleanupResult> {
    const now = new Date();
    let recordsDeleted = 0;

    if (policy.name === 'gc_disabled_agents') {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 90);

      const disabledAgents = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.enabled, false),
            sql`${agents.disabledAt} IS NOT NULL`,
            lt(agents.disabledAt, threshold)
          )
        );

      for (const agent of disabledAgents) {
        // Preserve audit log (minimal metadata) before deletion
        console.log(`[LifecycleManager]     Audit: Deleting agent ${agent.id} (${agent.name}) disabled since ${agent.disabledAt}`);
        
        await db
          .delete(agents)
          .where(eq(agents.id, agent.id));
        
        recordsDeleted++;
      }

      console.log(`[LifecycleManager]     Garbage collected ${recordsDeleted} disabled agents`);
    }

    return {
      module: 'agents',
      policy: policy.name,
      recordsDeleted,
      recordsPreserved: 0,
      errors: [],
      timestamp: now,
    };
  }

  /**
   * Cleanup soft-deleted namespaces based on policy
   */
  private async cleanupNamespaces(policy: Policy): Promise<CleanupResult> {
    const now = new Date();
    let recordsDeleted = 0;

    if (policy.name === 'gc_disabled_namespaces') {
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 90);

      const disabledNamespaces = await db
        .select()
        .from(namespaces)
        .where(
          and(
            eq(namespaces.enabled, false),
            sql`${namespaces.disabledAt} IS NOT NULL`,
            lt(namespaces.disabledAt, threshold)
          )
        );

      for (const ns of disabledNamespaces) {
        // Preserve audit log before deletion
        console.log(`[LifecycleManager]     Audit: Deleting namespace ${ns.id} (${ns.name}) disabled since ${ns.disabledAt}`);
        
        await db
          .delete(namespaces)
          .where(eq(namespaces.id, ns.id));
        
        recordsDeleted++;
      }

      console.log(`[LifecycleManager]     Garbage collected ${recordsDeleted} disabled namespaces`);
    }

    return {
      module: 'namespaces',
      policy: policy.name,
      recordsDeleted,
      recordsPreserved: 0,
      errors: [],
      timestamp: now,
    };
  }

  /**
   * Log audit trail
   */
  private logAudit(result: CleanupResult): void {
    const auditEntry = {
      timestamp: result.timestamp.toISOString(),
      module: result.module,
      policy: result.policy,
      recordsAffected: result.recordsDeleted,
      preservedCount: result.recordsPreserved,
      errors: result.errors,
    };

    console.log(`[LifecycleManager] Audit:`, JSON.stringify(auditEntry));
  }
}

// Export singleton instance
export const lifecycleManager = new LifecycleManager();
