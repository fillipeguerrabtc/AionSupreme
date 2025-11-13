/**
 * Namespace & Agent Garbage Collection Service
 * 
 * Automatically identifies and deletes orphaned namespaces and agents:
 * - Namespaces with ZERO documents/knowledge base entries
 * - Agents linked to non-existent namespaces
 * 
 * Runs daily at 03:00 UTC (00:00 Brasília time) to keep system clean
 * Also provides manual trigger endpoint for on-demand cleanup
 */

import { db } from "../db";
import { namespaces as namespacesTable, agents as agentsTable, documents } from "@shared/schema";
import { eq, sql, inArray } from "drizzle-orm";

export interface GarbageCollectionResult {
  namespacesDeleted: number;
  agentsDeleted: number;
  orphanedNamespaces: string[];
  orphanedAgents: string[];
  errors: string[];
}

export class NamespaceGarbageCollector {
  private intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the garbage collection service (runs daily at 03:00 UTC / 00:00 Brasília)
   */
  start(): void {
    if (this.intervalId) {
      console.log("[Namespace GC] Service already running");
      return;
    }

    console.log("[Namespace GC] Starting automatic garbage collection (runs daily at 03:00 UTC / 00:00 Brasília)");

    let lastExecutionDate: string | null = null; // Track "YYYY-MM-DD" to prevent duplicate runs

    const checkAndRunGC = () => {
      const now = new Date();
      const isCorrectHour = now.getUTCHours() === 3; // 03:00 UTC = 00:00 Brasília
      const currentDate = now.toISOString().split('T')[0]; // "YYYY-MM-DD"

      if (isCorrectHour && lastExecutionDate !== currentDate) {
        console.log(`[Namespace GC] Daily cleanup triggered on ${now.toISOString()}`);

        this.collectGarbage().then(executed => {
          if (executed) {
            lastExecutionDate = currentDate;
            console.log(`[Namespace GC] Date ${currentDate} marked as cleaned`);
          }
        });
      }
    };

    // Check every hour (to catch 03:00 UTC window)
    this.intervalId = setInterval(checkAndRunGC, 60 * 60 * 1000);

    // Run check immediately if we're at 03:00 UTC
    checkAndRunGC();
  }

  /**
   * Stop the garbage collection service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[Namespace GC] Stopped garbage collection service");
    }
  }

  /**
   * Manual trigger for garbage collection (can be called via API endpoint)
   */
  async collectGarbage(dryRun: boolean = false): Promise<GarbageCollectionResult> {
    const result: GarbageCollectionResult = {
      namespacesDeleted: 0,
      agentsDeleted: 0,
      orphanedNamespaces: [],
      orphanedAgents: [],
      errors: [],
    };

    try {
      console.log(`[Namespace GC] 🗑️ Running garbage collection${dryRun ? ' (DRY RUN)' : ''}...`);

      // 1. Find orphaned namespaces (zero documents + zero KB entries)
      const orphanedNamespaces = await this.findOrphanedNamespaces();
      result.orphanedNamespaces = orphanedNamespaces.map(ns => ns.name);

      if (orphanedNamespaces.length === 0) {
        console.log("[Namespace GC] ✓ No orphaned namespaces found");
      } else {
        console.log(`[Namespace GC] 🔍 Found ${orphanedNamespaces.length} orphaned namespaces:`, 
          orphanedNamespaces.map(ns => ns.name).join(', '));

        if (!dryRun) {
          // Delete orphaned namespaces
          for (const namespace of orphanedNamespaces) {
            try {
              await db.delete(namespacesTable).where(eq(namespacesTable.id, namespace.id));
              result.namespacesDeleted++;
              console.log(`[Namespace GC] ✓ Deleted orphaned namespace: "${namespace.name}"`);
            } catch (error: any) {
              const errMsg = `Failed to delete namespace "${namespace.name}": ${error.message}`;
              result.errors.push(errMsg);
              console.error(`[Namespace GC] ✗ ${errMsg}`);
            }
          }
        } else {
          console.log(`[Namespace GC] [DRY RUN] Would delete ${orphanedNamespaces.length} namespaces`);
        }
      }

      // 2. Find orphaned agents (assigned to non-existent namespaces)
      // In dry-run mode, simulate namespace deletion by passing excluded namespace names
      const excludedNamespaces = dryRun ? orphanedNamespaces.map(ns => ns.name) : [];
      const orphanedAgents = await this.findOrphanedAgents(excludedNamespaces);
      result.orphanedAgents = orphanedAgents.map(a => a.name);

      if (orphanedAgents.length === 0) {
        console.log("[Namespace GC] ✓ No orphaned agents found");
      } else {
        console.log(`[Namespace GC] 🔍 Found ${orphanedAgents.length} orphaned agents:`, 
          orphanedAgents.map(a => a.name).join(', '));

        if (!dryRun) {
          // Delete orphaned agents
          for (const agent of orphanedAgents) {
            try {
              await db.delete(agentsTable).where(eq(agentsTable.id, agent.id));
              result.agentsDeleted++;
              console.log(`[Namespace GC] ✓ Deleted orphaned agent: "${agent.name}"`);
            } catch (error: any) {
              const errMsg = `Failed to delete agent "${agent.name}": ${error.message}`;
              result.errors.push(errMsg);
              console.error(`[Namespace GC] ✗ ${errMsg}`);
            }
          }
        } else {
          console.log(`[Namespace GC] [DRY RUN] Would delete ${orphanedAgents.length} agents`);
        }
      }

      // Log final summary
      if (dryRun) {
        console.log(`[Namespace GC] 📊 [DRY RUN] Summary:
  - Orphaned namespaces: ${result.orphanedNamespaces.length}
  - Orphaned agents: ${result.orphanedAgents.length}
  - Errors: ${result.errors.length}`);
      } else {
        console.log(`[Namespace GC] 📊 Cleanup complete:
  - Namespaces deleted: ${result.namespacesDeleted}
  - Agents deleted: ${result.agentsDeleted}
  - Errors: ${result.errors.length}`);
      }

      return result;
    } catch (error: any) {
      console.error("[Namespace GC] ❌ Garbage collection error:", error.message);
      result.errors.push(error.message);
      return result;
    }
  }

  /**
   * Find namespaces with ZERO documents (orphaned)
   */
  private async findOrphanedNamespaces(): Promise<Array<{ id: string; name: string }>> {
    try {
      // Get all namespaces
      const allNamespaces = await db.select({
        id: namespacesTable.id,
        name: namespacesTable.name,
      }).from(namespacesTable);

      const orphaned: Array<{ id: string; name: string }> = [];

      for (const namespace of allNamespaces) {
        // Check if namespace has ANY documents with it in metadata.namespaces
        // Using PostgreSQL ? operator to check if array contains element
        // Works for both single and multi-namespace documents
        const docsWithNamespace = await db
          .select({ count: sql<number>`count(*)` })
          .from(documents)
          .where(
            sql`metadata->'namespaces' ? ${namespace.name}`
          );

        const docCount = Number(docsWithNamespace[0]?.count || 0);

        if (docCount === 0) {
          // No documents reference this namespace → orphaned!
          orphaned.push(namespace);
        }
      }

      return orphaned;
    } catch (error: any) {
      console.error("[Namespace GC] Error finding orphaned namespaces:", error.message);
      return [];
    }
  }

  /**
   * Find agents linked to non-existent namespaces
   * @param excludeNamespaces - Namespaces to exclude (simulate deletion in dry-run)
   */
  private async findOrphanedAgents(excludeNamespaces: string[] = []): Promise<Array<{ id: string; name: string; assignedNamespaces: string[] }>> {
    try {
      // Get all agents with their assigned namespaces
      const allAgents = await db
        .select({
          id: agentsTable.id,
          name: agentsTable.name,
          slug: agentsTable.slug,
          isSystemAgent: agentsTable.isSystemAgent,
          assignedNamespaces: agentsTable.assignedNamespaces,
        })
        .from(agentsTable);

      // Get all valid namespace names (excluding ones that would be deleted)
      const validNamespaces = await db.select({ name: namespacesTable.name }).from(namespacesTable);
      const validNamespaceSet = new Set(
        validNamespaces
          .map(ns => ns.name)
          .filter(name => !excludeNamespaces.includes(name))
      );

      const orphaned: Array<{ id: string; name: string; assignedNamespaces: string[] }> = [];

      for (const agent of allAgents) {
        // CRITICAL: Never delete system agents (Curator, etc.) regardless of namespace validity
        if (agent.isSystemAgent || agent.slug === "curator") {
          continue;
        }

        // Skip agents without assigned namespaces
        if (!agent.assignedNamespaces || agent.assignedNamespaces.length === 0) {
          continue;
        }

        // Check if ALL assigned namespaces are invalid (don't exist)
        const allNamespacesInvalid = agent.assignedNamespaces.every(ns => !validNamespaceSet.has(ns));

        if (allNamespacesInvalid) {
          // Agent is orphaned (all namespaces are invalid)
          orphaned.push({
            id: agent.id,
            name: agent.name,
            assignedNamespaces: agent.assignedNamespaces,
          });
        }
      }

      return orphaned;
    } catch (error: any) {
      console.error("[Namespace GC] Error finding orphaned agents:", error.message);
      return [];
    }
  }
}

export const namespaceGarbageCollector = new NamespaceGarbageCollector();
