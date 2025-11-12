// server/agent/router.ts
import { loadAgents } from "./registry";
import { generateWithFreeAPIs } from "../llm/free-apis";
import type { Agent } from "./types";

type RouterChoice = { agentId: string; score: number; reason?: string };

/**
 * Softmax normalization for probability distribution
 */
function softmax(xs: number[]): number[] {
  if (xs.length === 0) return [];
  const m = Math.max(...xs);
  const exps = xs.map(x => Math.exp(x - m));
  const sum = exps.reduce((a,b)=>a+b,0);
  return exps.map(e => e / sum);
}

/**
 * Top-p (nucleus) sampling for agent selection
 * Selects agents based on cumulative probability threshold
 */
function topP(choices: RouterChoice[], p=0.9, maxFanOut=2): RouterChoice[] {
  if (choices.length === 0) return [];
  
  const scores = choices.map(c => c.score);
  const probs = softmax(scores);
  const z = choices.map((c,i)=>({ ...c, prob: probs[i]})).sort((a,b)=>b.prob-a.prob);
  
  let acc = 0;
  const out: RouterChoice[] = [];
  
  for (const c of z) {
    if (out.length >= maxFanOut) break;
    out.push({ agentId: c.agentId, score: c.score, reason: c.reason });
    acc += c.prob;
    if (acc >= p) break;
  }
  
  return out;
}

/**
 * LLM-based intent classification and agent scoring
 * Uses Groq (free, fast) to analyze query and match with agent capabilities
 */
async function classifyAndScore(query: string, agents: Agent[]): Promise<RouterChoice[]> {
  try {
    // Build agent descriptions for LLM
    const agentDescriptions = agents.map((agent, idx) => {
      const namespaces = agent.ragNamespaces.join(", ");
      const prompt = agent.systemPrompt?.substring(0, 150) || "Agente genérico";
      return `${idx}. ${agent.name} - Especialista em: ${namespaces}. ${prompt}`;
    }).join("\n");

    // Create classification prompt
    const classificationPrompt = `Você é um roteador inteligente que analisa consultas de usuários e seleciona os agentes mais adequados.

CONSULTA DO USUÁRIO:
"${query}"

AGENTES DISPONÍVEIS:
${agentDescriptions}

TAREFA:
Analise a consulta e atribua uma pontuação de 0 a 100 para cada agente baseado em:
1. Relevância dos namespaces do agente para a consulta
2. Expertise do agente conforme descrito no prompt
3. Capacidade de responder à pergunta com qualidade

RESPONDA APENAS NO FORMATO JSON:
{
  "scores": [
    {"agentIndex": 0, "score": 85, "reason": "Especialista em finanças, consulta sobre investimentos"},
    {"agentIndex": 1, "score": 45, "reason": "Conhecimento parcial em economia"}
  ]
}`;

    // 🔥 USE CENTRALIZED SYSTEM PROMPT (ensures conversational tone + 7 sliders!)
    const { buildSimpleConversation } = await import('../llm/system-prompt');
    
    const llmRequest = await buildSimpleConversation(
      [{ role: 'user', content: classificationPrompt }],
      {
        temperature: 0.3, // Low temperature for consistent routing
        maxTokens: 500
      }
    );

    // Call LLM (Groq first, fallback to others)
    const result = await generateWithFreeAPIs(llmRequest);
    const response = result.text;

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[Router] LLM response not in expected JSON format, using fallback");
      return fallbackScoring(query, agents);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const scores = parsed.scores || [];

    // Map scores to agents
    const choices: RouterChoice[] = scores
      .filter((s: any) => s.agentIndex >= 0 && s.agentIndex < agents.length)
      .map((s: any) => ({
        agentId: agents[s.agentIndex].id,
        score: Math.max(0, Math.min(100, s.score)), // Clamp to 0-100
        reason: s.reason || "LLM classification",
      }));

    console.log(`[Router] LLM classified ${choices.length} agents for query: "${query.substring(0, 50)}..."`);
    return choices;

  } catch (error: any) {
    console.error("[Router] Error in LLM classification:", error.message);
    return fallbackScoring(query, agents);
  }
}

/**
 * Fallback scoring using keyword matching
 * Used when LLM classification fails
 */
function fallbackScoring(query: string, agents: Agent[]): RouterChoice[] {
  console.log("[Router] Using fallback keyword-based scoring");
  
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/);
  
  return agents.map(agent => {
    let score = 30; // Base score
    
    // Score based on namespace keyword match
    for (const ns of agent.ragNamespaces) {
      const nsWords = ns.toLowerCase().split(/[\/\-_]/);
      for (const nsWord of nsWords) {
        if (queryWords.some(qw => qw.includes(nsWord) || nsWord.includes(qw))) {
          score += 20;
        }
      }
    }
    
    // Score based on agent name match
    const nameWords = agent.name.toLowerCase().split(/\s+/);
    for (const nameWord of nameWords) {
      if (queryWords.some(qw => qw.includes(nameWord) || nameWord.includes(qw))) {
        score += 15;
      }
    }
    
    // Cap at 100
    score = Math.min(100, score);
    
    return {
      agentId: agent.id,
      score,
      reason: "keyword-match-fallback",
    };
  });
}

/**
 * Main routing function - selects best agents for a query using MoE strategy
 */
export async function route(query: string, budgetUSD: number = 1.0): Promise<RouterChoice[]> {
  console.log(`[Router] Routing query: "${query.substring(0, 80)}..." (budget: $${budgetUSD})`);
  
  // Load available agents
  const pool = await loadAgents();
  
  if (pool.length === 0) {
    console.warn("[Router] No agents available for routing");
    return [];
  }
  
  // Classify and score using LLM
  const scored = await classifyAndScore(query, pool);
  
  // Filter agents within budget (basic check)
  const affordable = scored.filter(choice => {
    const agent = pool.find(a => a.id === choice.agentId);
    return !agent?.budgetLimit || agent.budgetLimit >= budgetUSD * 0.5; // Allow agents with at least 50% of requested budget
  });
  
  // Apply top-p sampling to select final agents
  const selected = topP(affordable.length > 0 ? affordable : scored, 0.9, 2);
  
  console.log(`[Router] Selected ${selected.length} agents:`, selected.map(s => {
    const agent = pool.find(a => a.id === s.agentId);
    return `${agent?.name} (score: ${s.score})`;
  }).join(", "));
  
  return selected;
}
