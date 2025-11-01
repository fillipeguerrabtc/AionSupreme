// server/agent/loader.ts
// Runtime loader that materializes DB agents into executable Agent instances
import { agentsStorage } from "../storage.agents";
import { agentRegistry } from "./registry";
import type { Agent } from "./types";

/**
 * Load all enabled agents from database and register them
 * Converts DB records into executable Agent objects with tools, budgets, prompts
 */
export async function loadAgentsFromDatabase(): Promise<void> {
  console.log(`[AgentLoader] Loading agents...`);
  
  try {
    // Fetch all agents (if exists in DB, it's active)
    const dbAgents = await agentsStorage.listAgents();
    
    console.log(`[AgentLoader] Found ${dbAgents.length} agents`);
    
    for (const dbAgent of dbAgents) {
      try {
        // Fetch tools for this agent
        const agentTools = await agentsStorage.getAgentTools(dbAgent.id);
        const toolNames = agentTools.map(t => t.name);
        
        // Build Agent object following types.ts interface
        const agent: Agent = {
          id: dbAgent.id,
          name: dbAgent.name,
          slug: dbAgent.slug,
          type: (dbAgent.type || "specialist") as "specialist" | "generalist" | "router-only",
          description: dbAgent.description || undefined,
          systemPrompt: dbAgent.systemPrompt || undefined,
          ragNamespaces: dbAgent.ragNamespaces || [],
          allowedTools: toolNames,
          policy: dbAgent.policy || {},
          budgetLimit: dbAgent.budgetLimit || undefined,
          escalationAgent: dbAgent.escalationAgent || undefined,
          inferenceConfig: dbAgent.inferenceConfig || {},
          metadata: dbAgent.metadata || {},
        };
        
        // Register agent in registry
        agentRegistry.registerAgent(agent);
        
        // Register agent in runtime (creates AgentExecutor with run() method)
        const { registerAgent } = await import("./runtime");
        await registerAgent(agent);
        
        console.log(`[AgentLoader] ✅ Registered agent: ${agent.name} (${agent.id}) with tools: [${toolNames.join(", ")}]`);
      } catch (error: any) {
        console.error(`[AgentLoader] Error loading agent ${dbAgent.id}:`, error.message);
      }
    }
    
    console.log(`[AgentLoader] ✅ Loaded ${agentRegistry.getAllAgents().length} agents into registry`);
  } catch (error: any) {
    console.error(`[AgentLoader] Fatal error loading agents:`, error.message);
    throw error;
  }
}

/**
 * Reload a single agent (useful after updates)
 */
export async function reloadAgent(agentId: string): Promise<void> {
  console.log(`[AgentLoader] Reloading agent ${agentId}...`);
  
  const dbAgent = await agentsStorage.getAgent(agentId);
  if (!dbAgent) {
    console.warn(`[AgentLoader] Agent ${agentId} not found`);
    return;
  }
  
  // Fetch tools
  const agentTools = await agentsStorage.getAgentTools(agentId);
  const toolNames = agentTools.map(t => t.name);
  
  // Build Agent object
  const agent: Agent = {
    id: dbAgent.id,
    name: dbAgent.name,
    slug: dbAgent.slug,
    type: (dbAgent.type || "specialist") as "specialist" | "generalist" | "router-only",
    description: dbAgent.description || undefined,
    systemPrompt: dbAgent.systemPrompt || undefined,
    ragNamespaces: dbAgent.ragNamespaces || [],
    allowedTools: toolNames,
    policy: dbAgent.policy || {},
    budgetLimit: dbAgent.budgetLimit || undefined,
    escalationAgent: dbAgent.escalationAgent || undefined,
    inferenceConfig: dbAgent.inferenceConfig || {},
    metadata: dbAgent.metadata || {},
  };
  
  // Re-register in registry and runtime
  agentRegistry.registerAgent(agent);
  const { registerAgent } = await import("./runtime");
  await registerAgent(agent);
  console.log(`[AgentLoader] ✅ Reloaded agent: ${agent.name}`);
}
