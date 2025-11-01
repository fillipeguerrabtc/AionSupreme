// server/agent/registry.ts
// Central registry for all active agents in the system
import type { Agent } from "./types";

class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  
  /**
   * Register an agent (or update if already exists)
   */
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    console.log(`[Registry] Registered agent: ${agent.name} (${agent.id})`);
  }
  
  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    console.log(`[Registry] Unregistered agent: ${agentId}`);
  }
  
  /**
   * Get agent by ID
   */
  getAgentById(agentId: string): Agent | null {
    return this.agents.get(agentId) || null;
  }
  
  /**
   * Get agent by slug
   */
  getAgentBySlug(slug: string): Agent | null {
    return Array.from(this.agents.values()).find(a => a.slug === slug) || null;
  }
  
  /**
   * Get all registered agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }
  
  /**
   * Get agents by type
   */
  getAgentsByType(type: string): Agent[] {
    return this.getAllAgents().filter(a => a.type === type);
  }
  
  /**
   * Clear all agents (useful for testing/reloading)
   */
  clear(): void {
    this.agents.clear();
    console.log("[Registry] Cleared all agents");
  }
}

// Singleton instance
export const agentRegistry = new AgentRegistry();

// Compatibility export for router.ts and other callers
export async function loadAgents(): Promise<Agent[]> {
  // Returns all agents from registry (tenantless)
  return agentRegistry.getAllAgents();
}

/**
 * Load child agents for a given parent agent (hierarchical orchestration)
 * Returns agent relationships from DB
 */
export async function loadAgentChildren(parentAgentId: string): Promise<any[]> {
  try {
    const { db } = await import("../db");
    const { agentRelationships, agents } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    
    const relationships = await db
      .select({
        relationship: agentRelationships,
        childAgent: agents,
      })
      .from(agentRelationships)
      .innerJoin(agents, eq(agents.id, agentRelationships.childAgentId))
      .where(
        and(
          eq(agentRelationships.parentAgentId, parentAgentId),
          eq(agentRelationships.enabled, true),
          eq(agents.enabled, true)
        )
      );
    
    return relationships;
  } catch (error: any) {
    console.error(`[Registry] Error loading children for agent ${parentAgentId}:`, error.message);
    return [];
  }
}

/**
 * Check if an agent has sub-agents configured
 */
export async function hasChildren(agentId: string): Promise<boolean> {
  const children = await loadAgentChildren(agentId);
  return children.length > 0;
}
