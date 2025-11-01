// server/agent/types.ts
export interface AgentRunContext {
  tenantId: number;
  sessionId: string;
  budgetUSD: number;
  namespaces?: string[];
  tools?: string[];
  // Hierarchical orchestration
  parentAgentId?: string;
  depth?: number;
  traceId?: string;
}
export interface AgentInput {
  query: string;
  history?: { role: "user"|"assistant"|"tool", content: string }[];
  attachments?: { type: "pdf"|"img"|"url"|"code", ref: string }[];
}
export interface AgentOutput {
  text: string;
  citations?: { title: string; url?: string; namespace?: string; chunkId?: string }[];
  attachments?: Array<{  // Multimodal attachments (images, videos, docs)
    type: "image" | "video" | "document";
    url: string;
    filename: string;
    mimeType: string;
    size?: number;
  }>;
  costUSD?: number;
  tokens?: { prompt: number; completion: number };
  latencyMs?: number;
}

// Agent configuration (stored in DB and used by registry)
export interface Agent {
  id: string;
  name: string;
  slug: string;
  type: "specialist" | "generalist" | "router-only";
  description?: string;
  systemPrompt?: string;
  enabled: boolean;
  ragNamespaces: string[];
  allowedTools: string[];
  policy: any;
  budgetLimit?: number;
  escalationAgent?: string;
  inferenceConfig?: any;
  metadata?: any;
}

// Runtime executor (implements run method, wraps Agent config)
export interface AgentExecutor extends Agent {
  run(input: AgentInput, ctx: AgentRunContext): Promise<AgentOutput>;
}
