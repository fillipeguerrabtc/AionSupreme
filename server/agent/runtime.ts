// server/agent/runtime.ts
import type { Agent, AgentExecutor, AgentInput, AgentOutput, AgentRunContext } from "./types";

// Runtime cache stores AgentExecutor (with run() method) not plain Agent configs
const cache = new Map<string, AgentExecutor>();

/**
 * Create an AgentExecutor from Agent config
 * Wraps the config with a run() implementation
 */
function createAgentExecutor(agent: Agent): AgentExecutor {
  return {
    ...agent,
    async run(input: AgentInput, ctx: AgentRunContext): Promise<AgentOutput> {
      // TODO: Implement actual LLM call with agent's systemPrompt, ragNamespaces, allowedTools
      // For now, return a placeholder to prevent runtime errors
      const startTime = Date.now();
      
      // This is a placeholder implementation
      // In production, this would:
      // 1. Use agent.systemPrompt as system message
      // 2. Search agent.ragNamespaces for relevant context
      // 3. Call LLM with allowed tools from agent.allowedTools
      // 4. Enforce agent.budgetLimit if set
      
      return {
        text: `[Agent ${agent.name}] Received: "${input.query}"\n\nThis is a placeholder response. The actual implementation would use the agent's system prompt: "${agent.systemPrompt?.substring(0, 100)}..." and search RAG namespaces: [${agent.ragNamespaces.join(", ")}]`,
        citations: [],
        costUSD: 0,
        tokens: { prompt: 0, completion: 0 },
        latencyMs: Date.now() - startTime,
      };
    }
  };
}

/**
 * Register an agent (converts to AgentExecutor with run() method)
 */
export async function registerAgent(agent: Agent): Promise<void> {
  const executor = createAgentExecutor(agent);
  cache.set(agent.id, executor);
  console.log(`[Runtime] Registered executor for agent: ${agent.name} (${agent.id})`);
}

/**
 * Get AgentExecutor by ID
 */
export async function getAgentById(id: string): Promise<AgentExecutor> {
  const executor = cache.get(id);
  if (!executor) throw new Error(`Agent not registered in runtime: ${id}`);
  return executor;
}
