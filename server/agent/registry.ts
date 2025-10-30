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
