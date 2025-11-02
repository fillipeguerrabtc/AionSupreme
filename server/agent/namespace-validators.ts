// server/agent/namespace-validators.ts
/**
 * Namespace validation utilities for Agent/SubAgent hierarchy
 * Ensures automatic hierarchy inference based on namespace structure
 */

export interface NamespaceValidationResult {
  valid: boolean;
  error?: string;
  rootNamespace?: string; // For subagents: the inferred parent namespace
}

/**
 * Validate namespace assignment for Agents (root level)
 * 
 * Rules:
 * - Must have exactly 1 namespace
 * - Namespace must NOT contain "/" (must be root)
 * 
 * Examples:
 * ✅ ["financas"] → valid
 * ✅ ["tech"] → valid
 * ❌ ["financas/investimentos"] → invalid (is subnamespace)
 * ❌ ["financas", "tech"] → invalid (multiple namespaces)
 * ❌ [] → invalid (empty)
 */
export function validateAgentNamespaces(
  namespaces: string[]
): NamespaceValidationResult {
  // Must have exactly 1 namespace
  if (namespaces.length === 0) {
    return {
      valid: false,
      error: "Agents must be assigned to exactly 1 root namespace",
    };
  }

  if (namespaces.length > 1) {
    return {
      valid: false,
      error: "Agents can only be assigned to 1 namespace. For multiple namespaces, create separate agents or use a SubAgent.",
    };
  }

  const namespace = namespaces[0];

  // Must be root namespace (no "/")
  if (namespace.includes("/")) {
    return {
      valid: false,
      error: `"${namespace}" is a subnamespace. Agents must be assigned to root namespaces only (e.g., "financas", "tech").`,
    };
  }

  return { valid: true };
}

/**
 * Validate namespace assignment for SubAgents (sub level)
 * 
 * Rules:
 * - Must have 1+ namespaces
 * - All namespaces must contain "/" (must be subnamespaces)
 * - All namespaces must share the same root prefix
 * 
 * Examples:
 * ✅ ["financas/investimentos"] → valid (root: financas)
 * ✅ ["financas/investimentos", "financas/impostos"] → valid (root: financas)
 * ❌ ["financas"] → invalid (is root namespace)
 * ❌ ["financas/investimentos", "tech/code"] → invalid (different roots)
 * ❌ [] → invalid (empty)
 */
export function validateSubAgentNamespaces(
  namespaces: string[]
): NamespaceValidationResult {
  // Must have at least 1 namespace
  if (namespaces.length === 0) {
    return {
      valid: false,
      error: "SubAgents must be assigned to at least 1 subnamespace",
    };
  }

  // All must be subnamespaces (contain "/")
  const rootNamespaces = namespaces.filter((ns) => !ns.includes("/"));
  if (rootNamespaces.length > 0) {
    return {
      valid: false,
      error: `SubAgents must be assigned to subnamespaces only. Found root namespace(s): ${rootNamespaces.join(", ")}. Use Agents for root namespaces.`,
    };
  }

  // All must share same root prefix
  const prefixes = namespaces.map((ns) => ns.split("/")[0]);
  const uniquePrefixes = new Set(prefixes);

  if (uniquePrefixes.size > 1) {
    return {
      valid: false,
      error: `All subnamespaces must belong to the same parent namespace. Found multiple roots: ${Array.from(uniquePrefixes).join(", ")}`,
    };
  }

  return {
    valid: true,
    rootNamespace: prefixes[0], // Return the shared root for hierarchy inference
  };
}

/**
 * Combined validator that routes to correct validator based on agentTier
 */
export function validateNamespaceAssignment(
  agentTier: "agent" | "subagent",
  namespaces: string[]
): NamespaceValidationResult {
  if (agentTier === "agent") {
    return validateAgentNamespaces(namespaces);
  } else {
    return validateSubAgentNamespaces(namespaces);
  }
}

/**
 * Find governing Agents for a given SubAgent based on namespace hierarchy
 * 
 * Example:
 * - SubAgent has namespaces: ["financas/investimentos", "financas/impostos"]
 * - This function finds all Agents with namespace "financas"
 * 
 * @param subAgentNamespaces - The SubAgent's assigned namespaces
 * @param allAgents - All available Agents in the system
 * @returns Array of Agent IDs that govern this SubAgent
 */
export function findGoverningAgents(
  subAgentNamespaces: string[],
  allAgents: Array<{ id: string; agentTier: "agent" | "subagent"; assignedNamespaces: string[] }>
): string[] {
  // Extract root namespace from subagent
  const validation = validateSubAgentNamespaces(subAgentNamespaces);
  if (!validation.valid || !validation.rootNamespace) {
    return [];
  }

  const rootNamespace = validation.rootNamespace;

  // Find all Agents (not SubAgents) with matching root namespace
  return allAgents
    .filter((agent) => 
      agent.agentTier === "agent" && 
      agent.assignedNamespaces.includes(rootNamespace)
    )
    .map((agent) => agent.id);
}

/**
 * ORPHAN PREVENTION: Validate that all namespaces exist in the database
 * 
 * Rules:
 * - All namespaces in assignedNamespaces MUST exist in the namespaces table
 * - Returns validation result with list of missing namespaces
 * 
 * Examples:
 * ✅ ["financas"] → valid (if exists)
 * ✅ ["financas/investimentos"] → valid (if exists)
 * ❌ ["nonexistent"] → invalid (namespace not found in DB)
 * ❌ ["financas", "fake"] → invalid (fake not found)
 * 
 * @param namespaces - Array of namespace names to validate
 * @returns Validation result with list of missing namespaces
 */
export async function validateNamespacesExist(
  namespaces: string[]
): Promise<NamespaceValidationResult & { missingNamespaces?: string[] }> {
  if (namespaces.length === 0) {
    return { valid: true };
  }

  // Import db and schema
  const { db } = await import("../db");
  const { namespaces: namespacesTable } = await import("../../shared/schema");
  const { inArray, eq } = await import("drizzle-orm");

  // Query DB for all specified namespaces
  const existingNamespaces = await db
    .select({ name: namespacesTable.name })
    .from(namespacesTable)
    .where(inArray(namespacesTable.name, namespaces));

  const existingNames = new Set(existingNamespaces.map((ns) => ns.name));
  const missingNamespaces = namespaces.filter((ns) => !existingNames.has(ns));

  if (missingNamespaces.length > 0) {
    return {
      valid: false,
      error: `Os seguintes namespaces não existem no banco de dados: ${missingNamespaces.join(", ")}. Crie os namespaces primeiro antes de atribuí-los ao agente.`,
      missingNamespaces,
    };
  }

  return { valid: true };
}
