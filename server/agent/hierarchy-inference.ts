// server/agent/hierarchy-inference.ts
/**
 * Automatic hierarchy inference based on namespace structure
 * Replaces manual agent_relationships with automatic parent→child detection
 */

import { findGoverningAgents } from "./namespace-validators";

export interface Agent {
  id: string;
  name: string;
  agentTier: "agent" | "subagent";
  assignedNamespaces: string[];
}

export interface HierarchyNode {
  agent: Agent;
  governingAgents?: Agent[]; // For subagents: their parent agents
  subAgents?: Agent[]; // For agents: their child subagents
}

/**
 * Infer complete hierarchy tree for all agents
 * 
 * @param allAgents - All agents in the system
 * @returns Hierarchy tree with parent-child relationships
 */
export function inferHierarchyTree(allAgents: Agent[]): HierarchyNode[] {
  // Separate agents and subagents (all agents in DB are active)
  const agents = allAgents.filter((a) => a.agentTier === "agent");
  const subAgents = allAgents.filter((a) => a.agentTier === "subagent");

  // Build hierarchy nodes
  const hierarchyNodes: HierarchyNode[] = [];

  // Process Agents (root level)
  for (const agent of agents) {
    const rootNamespace = agent.assignedNamespaces[0]; // Agents have exactly 1 namespace
    
    // Find all SubAgents governed by this Agent
    const childSubAgents = subAgents.filter((subAgent) => {
      // SubAgent is governed if all its namespaces start with Agent's root namespace
      return subAgent.assignedNamespaces.every((ns) => ns.startsWith(rootNamespace + "/"));
    });

    hierarchyNodes.push({
      agent,
      subAgents: childSubAgents,
    });
  }

  // Process SubAgents (child level)
  for (const subAgent of subAgents) {
    // Find governing agents
    const governingAgentIds = findGoverningAgents(subAgent.assignedNamespaces, agents);
    const parentAgents = agents.filter((a) => governingAgentIds.includes(a.id));

    hierarchyNodes.push({
      agent: subAgent,
      governingAgents: parentAgents,
    });
  }

  return hierarchyNodes;
}

/**
 * Find agents responsible for a given namespace or query
 * 
 * Algorithm:
 * 1. Try to match exact subnamespace → return SubAgents
 * 2. Try to match root namespace → return Agents
 * 3. If no match, return all Agents for fallback routing
 * 
 * @param namespace - Target namespace (e.g., "financas/investimentos" or "financas")
 * @param allAgents - All available agents
 * @returns Array of responsible agents (prioritized: SubAgents > Agents > All Agents)
 */
export function findResponsibleAgents(
  namespace: string,
  allAgents: Agent[]
): Agent[] {
  // Step 1: Try exact subnamespace match (e.g., "financas/investimentos")
  const exactSubAgents = allAgents.filter((agent) =>
    agent.agentTier === "subagent" &&
    agent.assignedNamespaces.includes(namespace)
  );

  if (exactSubAgents.length > 0) {
    return exactSubAgents;
  }

  // Step 2: Try root namespace match (e.g., "financas")
  const rootNamespace = namespace.includes("/") ? namespace.split("/")[0] : namespace;
  
  const rootAgents = allAgents.filter((agent) =>
    agent.agentTier === "agent" &&
    agent.assignedNamespaces.includes(rootNamespace)
  );

  if (rootAgents.length > 0) {
    return rootAgents;
  }

  // Step 3: Fallback - return all Agents (generalist routing)
  return allAgents.filter((agent) => agent.agentTier === "agent");
}

/**
 * Get delegation chain for a SubAgent
 * 
 * Returns the hierarchy: Agent(s) → SubAgent
 * 
 * @param subAgentId - ID of the SubAgent
 * @param allAgents - All available agents
 * @returns Delegation chain from parent Agents to this SubAgent
 */
export function getDelegationChain(
  subAgentId: string,
  allAgents: Agent[]
): { parents: Agent[]; subAgent: Agent | null } {
  const subAgent = allAgents.find((a) => a.id === subAgentId && a.agentTier === "subagent");
  
  if (!subAgent) {
    return { parents: [], subAgent: null };
  }

  const governingAgentIds = findGoverningAgents(
    subAgent.assignedNamespaces,
    allAgents.filter((a) => a.agentTier === "agent")
  );
  
  const parentAgents = allAgents.filter((a) => governingAgentIds.includes(a.id));

  return { parents: parentAgents, subAgent };
}

/**
 * Calculate automatic budget allocation for SubAgents
 * 
 * Distributes parent Agent budget evenly among its SubAgents
 * 
 * @param parentBudget - Parent Agent's total budget in USD
 * @param subAgentCount - Number of SubAgents governed by this Agent
 * @returns Budget share per SubAgent (0-1 decimal)
 */
export function calculateSubAgentBudgetShare(
  parentBudget: number,
  subAgentCount: number
): number {
  if (subAgentCount === 0) return 0;
  
  // Even split among SubAgents
  const share = 1.0 / subAgentCount;
  
  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, share));
}
