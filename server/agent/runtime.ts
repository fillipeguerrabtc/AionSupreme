// server/agent/runtime.ts
import type { Agent } from "./types";
const cache = new Map<string, Agent>();

export async function registerAgent(agent: Agent) { cache.set(agent.id, agent); }
export async function getAgentById(id: string): Promise<Agent> {
  const a = cache.get(id);
  if (!a) throw new Error("Agent not registered: " + id);
  return a;
}
