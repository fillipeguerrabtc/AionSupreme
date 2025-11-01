import { db } from "../db";
import { namespaces, agents } from "@shared/schema";
import { eq, like, inArray } from "drizzle-orm";

/**
 * Cascade Delete Service for Namespaces
 * 
 * Deleting a namespace triggers:
 * 1. Delete all child namespaces (recursive)
 * 2. Delete all agents with assigned_namespaces matching
 * 3. Delete all subagents with assigned_namespaces matching
 * 
 * Prevents orphans/zombie data across the system.
 */

export interface CascadeDeleteResult {
  deletedNamespaces: string[];
  deletedAgents: string[];
  totalDeleted: number;
}

/**
 * Recursively find all child namespaces
 * @param parentName Parent namespace name (e.g., "financas")
 * @returns Array of child namespace names (e.g., ["financas/investimentos", "financas/impostos"])
 */
async function findChildNamespaces(parentName: string): Promise<string[]> {
  const children = await db
    .select()
    .from(namespaces)
    .where(like(namespaces.name, `${parentName}/%`));

  return children.map((ns) => ns.name);
}

/**
 * Find all agents/subagents assigned to a namespace
 * @param namespaceName Namespace name to match against assigned_namespaces
 * @returns Array of agent IDs
 */
async function findAgentsByNamespace(namespaceName: string): Promise<string[]> {
  // Query ALL agents (enabled + disabled) to prevent orphans
  const matchingAgents = await db
    .select()
    .from(agents);

  // Filter in-memory (Drizzle doesn't support JSON array contains natively)
  const filtered = matchingAgents.filter((agent) => {
    if (!agent.assignedNamespaces) return false;
    return agent.assignedNamespaces.includes(namespaceName);
  });

  return filtered.map((a) => a.id);
}

/**
 * Cascade delete namespace and all related entities
 * @param namespaceName Namespace name to delete (e.g., "financas")
 * @returns Cascade delete result with counts
 */
export async function cascadeDeleteNamespace(namespaceName: string): Promise<CascadeDeleteResult> {
  const deletedNamespaces: string[] = [];
  const deletedAgents: string[] = [];

  // CRITICAL: Wrap in transaction for atomicity
  await db.transaction(async (tx) => {
    // Step 1: Find all child namespaces (recursive)
    const children = await tx
      .select()
      .from(namespaces)
      .where(like(namespaces.name, `${namespaceName}/%`))
      .then((rows) => rows.map((ns) => ns.name));
    
    // Step 2: Delete all agents/subagents for THIS namespace and all children
    const namespacesToDelete = [namespaceName, ...children];
    
    for (const ns of namespacesToDelete) {
      // Find ALL agents (enabled + disabled) to prevent orphans
      const matchingAgents = await tx
        .select()
        .from(agents)
        .then((rows) =>
          rows.filter((a) => a.assignedNamespaces?.includes(ns))
        );
      
      const agentIds = matchingAgents.map((a) => a.id);
      
      // Delete agents (hard delete for cascade) - batch operation
      if (agentIds.length > 0) {
        await tx.delete(agents).where(inArray(agents.id, agentIds));
        deletedAgents.push(...agentIds);
      }
    }

    // Step 3: Delete all child namespaces (batch)
    if (children.length > 0) {
      await tx.delete(namespaces).where(inArray(namespaces.name, children));
      deletedNamespaces.push(...children);
    }

    // Step 4: Delete the parent namespace itself
    await tx.delete(namespaces).where(eq(namespaces.name, namespaceName));
    deletedNamespaces.push(namespaceName);
  });

  return {
    deletedNamespaces,
    deletedAgents,
    totalDeleted: deletedNamespaces.length + deletedAgents.length,
  };
}
