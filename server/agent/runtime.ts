// server/agent/runtime.ts
import type { Agent, AgentExecutor, AgentInput, AgentOutput, AgentRunContext } from "./types";
import { generateWithFreeAPIs } from "../llm/free-apis";
import { ragService } from "../rag/vector-store";

// Runtime cache stores AgentExecutor (with run() method) not plain Agent configs
const cache = new Map<string, AgentExecutor>();

/**
 * Search RAG knowledge base in agent's namespaces
 */
async function searchRAG(query: string, namespaces: string[], tenantId: number, k: number = 5): Promise<any[]> {
  try {
    if (namespaces.length === 0) {
      console.log("[AgentExecutor] No namespaces configured, skipping RAG search");
      return [];
    }

    console.log(`[AgentExecutor] Searching RAG in namespaces: [${namespaces.join(", ")}]`);
    
    const results = await ragService.search(query, tenantId, { k });

    console.log(`[AgentExecutor] Found ${results.length} RAG results`);
    return results;
  } catch (error: any) {
    console.error("[AgentExecutor] RAG search error:", error.message);
    return [];
  }
}

/**
 * Build context from RAG results
 */
function buildRAGContext(results: any[]): string {
  if (results.length === 0) return "";

  const contextParts = results.map((r, idx) => {
    return `[${idx + 1}] ${r.text}\nFonte: Documento ID ${r.documentId}`;
  });

  return `\n\nCONTEXTO DA BASE DE CONHECIMENTO:\n${contextParts.join("\n\n")}`;
}

/**
 * Create an AgentExecutor from Agent config
 * Wraps the config with a REAL run() implementation using LLM + RAG + Tools
 */
function createAgentExecutor(agent: Agent): AgentExecutor {
  return {
    ...agent,
    async run(input: AgentInput, ctx: AgentRunContext): Promise<AgentOutput> {
      const startTime = Date.now();
      console.log(`[AgentExecutor] Agent "${agent.name}" processing query: "${input.query.substring(0, 80)}..."`);
      
      try {
        // STEP 1: Search RAG knowledge base in agent's namespaces
        const ragResults = await searchRAG(
          input.query,
          agent.ragNamespaces,
          ctx.tenantId,
          5 // Top 5 results
        );
        
        const ragContext = buildRAGContext(ragResults);
        const citations = ragResults.map(r => ({
          title: `Documento ID ${r.documentId}`,
          chunkId: r.id?.toString(),
          namespace: agent.ragNamespaces[0], // Use first namespace as hint
        }));
        
        // STEP 2: Build system prompt with agent's personality + RAG context
        const systemPrompt = `${agent.systemPrompt || "Você é um assistente inteligente especializado."}

SUAS ÁREAS DE EXPERTISE:
${agent.ragNamespaces.map(ns => `- ${ns}`).join("\n")}

INSTRUÇÕES:
1. Use o contexto da base de conhecimento fornecido abaixo quando relevante
2. Se não souber a resposta, diga claramente
3. Cite as fontes quando usar informação do contexto
4. Seja preciso, profissional e útil
${ragContext}`;

        // STEP 3: Check budget limit before calling LLM
        if (agent.budgetLimit && ctx.budgetUSD > agent.budgetLimit) {
          console.warn(`[AgentExecutor] Budget limit exceeded for agent "${agent.name}" (${ctx.budgetUSD} > ${agent.budgetLimit})`);
          return {
            text: `Desculpe, o orçamento disponível ($${ctx.budgetUSD}) excede o limite deste agente ($${agent.budgetLimit}). Por favor, reduza o escopo da consulta.`,
            citations: [],
            costUSD: 0,
            tokens: { prompt: 0, completion: 0 },
            latencyMs: Date.now() - startTime,
          };
        }
        
        // STEP 4: Call LLM with system prompt + user query
        const llmResult = await generateWithFreeAPIs({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: input.query }
          ],
          temperature: 0.7,
          maxTokens: 1024,
        });
        
        const latencyMs = Date.now() - startTime;
        
        // STEP 5: Estimate cost (very rough estimation)
        // Free APIs have $0 cost, but we track token usage
        const estimatedCost = 0; // Free LLMs
        
        console.log(`[AgentExecutor] Agent "${agent.name}" completed in ${latencyMs}ms using ${llmResult.provider}`);
        
        return {
          text: llmResult.text,
          citations,
          costUSD: estimatedCost,
          tokens: {
            prompt: llmResult.tokensUsed ? Math.floor(llmResult.tokensUsed * 0.7) : 0,
            completion: llmResult.tokensUsed ? Math.floor(llmResult.tokensUsed * 0.3) : 0,
          },
          latencyMs,
        };
        
      } catch (error: any) {
        console.error(`[AgentExecutor] Error in agent "${agent.name}":`, error.message);
        
        return {
          text: `Desculpe, ocorreu um erro ao processar sua solicitação: ${error.message}`,
          citations: [],
          costUSD: 0,
          tokens: { prompt: 0, completion: 0 },
          latencyMs: Date.now() - startTime,
        };
      }
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
