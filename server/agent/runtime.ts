import type { Agent, AgentExecutor, AgentInput, AgentOutput, AgentRunContext } from "./types";
import { generateWithPriority } from "../llm/priority-orchestrator";
import { ragService } from "../rag/vector-store";
import { ReActEngine } from "./react-engine";
import { agentTools } from "./tools";

const cache = new Map<string, AgentExecutor>();

async function searchRAG(query: string, namespaces: string[], k: number = 5) {
  try {
    if (namespaces.length === 0) {
      console.log("[AgentExecutor] No namespaces configured, skipping RAG search");
      return [];
    }

    console.log(`[AgentExecutor] Searching RAG in namespaces: [${namespaces.join(", ")}]`);
    
    // CRITICAL: Pass namespaces to filter RAG results to agent's allowed namespaces
    const results = await ragService.search(query, { 
      k,
      namespaces, // Filter by agent's namespaces
    });

    console.log(`[AgentExecutor] Found ${results.length} RAG results (filtered by namespaces)`);
    return results;
  } catch (error: unknown) {
    console.error("[AgentExecutor] RAG search error:", error instanceof Error ? error.message : String(error));
    return [];
  }
}

function buildRAGContext(results: Awaited<ReturnType<typeof searchRAG>>): string {
  if (results.length === 0) return "";

  const contextParts = results.map((r, idx) => {
    return `[${idx + 1}] ${r.chunkText}\nFonte: Documento ID ${r.documentId}`;
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
          5 // Top 5 results
        );
        
        const ragContext = buildRAGContext(ragResults);
        const citations = ragResults.map(r => ({
          title: `Documento ID ${r.documentId}`,
          chunkId: r.id?.toString(),
          namespace: r.metadata?.namespace || agent.ragNamespaces[0], // Use actual namespace from metadata
        }));
        
        // STEP 1.5: Collect attachments from RAG results (images, videos, documents)
        const attachments: Array<{type: "image"|"video"|"document"; url: string; filename: string; mimeType: string; size?: number}> = [];
        for (const result of ragResults) {
          if (result.attachments && Array.isArray(result.attachments)) {
            for (const att of result.attachments) {
              let type: "image"|"video"|"document";
              if (att.type === 'image') type = 'image';
              else if (att.type === 'video') type = 'video';
              else type = 'document';
              
              attachments.push({
                type,
                url: att.url,
                filename: att.filename || '',
                mimeType: att.mimeType || '',
                size: att.size
              });
            }
          }
        }
        console.log(`[AgentExecutor] Collected ${attachments.length} attachments from RAG results`);
        
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
        
        const normalizedHistory = (input.history || [])
          .filter((msg) => msg.role === "user" || msg.role === "assistant")
          .map((msg) => {
            // Handle different content formats (string, array, object)
            let contentText: string;
            if (typeof msg.content === "string") {
              contentText = msg.content;
            } else if (Array.isArray(msg.content)) {
              const content = msg.content as Array<{type?: string; text?: string} | string>;
              contentText = content
                .filter((part) => typeof part === "string" || (typeof part === "object" && part.type === "text"))
                .map((part) => typeof part === "string" ? part : part.text || "")
                .join(" ");
            } else {
              // Fallback for other formats
              contentText = JSON.stringify(msg.content);
            }
            
            return {
              role: msg.role,
              content: contentText
            };
          });
        
        // Build messages: [new_system_prompt, ...normalized_history, current_query]
        const conversationMessages = [
          { role: "system", content: systemPrompt },
          ...normalizedHistory,
          { role: "user", content: input.query }
        ];
        
        // ✅ CORREÇÃO CRÍTICA: Usar priority-orchestrator para seguir ordem obrigatória:
        // 1. KB (RAG global - além dos namespaces do agente)
        // 2. GPU Pool (Custom LoRA LLMs)
        // 3. Free APIs (Groq → Gemini → HF → OpenRouter)
        // 4. Web Search (se recusa detectada)
        // 5. OpenAI (último recurso, pago)
        const priorityResult = await generateWithPriority({
          messages: conversationMessages,
          temperature: 0.7,
          maxTokens: 1024,
          language: (ctx.language === "pt-BR" || ctx.language === "en-US" || ctx.language === "es-ES") 
            ? ctx.language 
            : undefined, // 🔥 FIX: Type-safe language propagation
        });
        
        const latencyMs = Date.now() - startTime;
        
        // STEP 5: Extrair custo e tokens do priority result
        const estimatedCost = priorityResult.usage?.totalTokens 
          ? (priorityResult.usage.totalTokens / 1000) * 0.002 // Estimativa rough
          : 0;
        
        console.log(`[AgentExecutor] Agent "${agent.name}" completed in ${latencyMs}ms using ${priorityResult.source} (${priorityResult.provider || 'unknown'})`);
        
        return {
          text: priorityResult.content,
          citations,
          attachments: attachments.length > 0 ? attachments : undefined,
          costUSD: estimatedCost,
          tokens: {
            prompt: priorityResult.usage?.promptTokens || 0,
            completion: priorityResult.usage?.completionTokens || 0,
          },
          latencyMs,
        };
        
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[AgentExecutor] Error in agent "${agent.name}":`, errorMessage);
        
        return {
          text: `Desculpe, ocorreu um erro ao processar sua solicitação: ${errorMessage}`,
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
