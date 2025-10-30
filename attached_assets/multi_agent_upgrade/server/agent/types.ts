// server/agent/types.ts
export interface AgentRunContext {
  tenantId: string;
  sessionId: string;
  budgetUSD: number;
  namespaces?: string[];
  tools?: string[];
}
export interface AgentInput {
  query: string;
  history?: { role: "user"|"assistant"|"tool", content: string }[];
  attachments?: { type: "pdf"|"img"|"url"|"code", ref: string }[];
}
export interface AgentOutput {
  text: string;
  citations?: { title: string; url?: string; namespace?: string; chunkId?: string }[];
  costUSD?: number;
  tokens?: { prompt: number; completion: number };
  latencyMs?: number;
}
export interface Agent {
  id: string;
  name: string;
  type: "specialist"|"generalist"|"router-only";
  run(input: AgentInput, ctx: AgentRunContext): Promise<AgentOutput>;
}
