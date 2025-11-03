/**
 * Multi-Agent Orchestrator
 * Connects chat to the MoE router + agent runtime
 * Automatically selects and executes best agents for each query
 */

import { route } from "./router";
import { getAgentById } from "./runtime";
import { executeWithHierarchy } from "./hierarchy-orchestrator";
import { hasChildren } from "./registry";
import type { AgentInput, AgentOutput, AgentRunContext } from "./types";
import { usageTracker } from "../services/usage-tracker";
import { queryMonitor } from "../services/query-monitor";

interface OrchestratorResult {
  content: string;
  citations: any[];
  attachments?: any[];
  metadata: {
    source: string;
    agentsUsed: string[];
    totalCost: number;
    totalLatency: number;
  };
}

/**
 * Orchestrate multi-agent response
 * 1. Routes query to best agents (MoE)
 * 2. Executes selected agents in parallel
 * 3. Aggregates results into final response
 */
export async function orchestrateAgents(
  query: string,
  options: {
    history?: any[];
    budgetUSD?: number;
    tenantId?: number;
    sessionId?: string;
  } = {}
): Promise<OrchestratorResult> {
  const { history = [], budgetUSD = 1.0, tenantId = 1, sessionId = "default" } = options;

  console.log(`[Orchestrator] Starting agent orchestration for query: "${query.substring(0, 80)}..."`);
  
  try {
    // STEP 1: Route to best agents using MoE
    const selectedAgents = await route(query, budgetUSD);
    
    if (selectedAgents.length === 0) {
      console.warn("[Orchestrator] No agents selected by router");
      return {
        content: "Desculpe, não consegui encontrar agentes especializados para sua pergunta. Tente reformular ou seja mais específico.",
        citations: [],
        metadata: {
          source: "multi-agent",
          agentsUsed: [],
          totalCost: 0,
          totalLatency: 0,
        },
      };
    }

    console.log(`[Orchestrator] Router selected ${selectedAgents.length} agents`);

    // STEP 2: Execute selected agents in parallel
    const agentInput: AgentInput = {
      query,
      history, // Pass conversation history to agents
      attachments: [],
    };

    const agentContext: AgentRunContext = {
      tenantId,
      sessionId,
      budgetUSD,
    };

    const startTime = Date.now();
    const agentResults = await Promise.all(
      selectedAgents.map(async (choice) => {
        try {
          // Check if agent has hierarchical sub-agents
          const agentHasChildren = await hasChildren(choice.agentId);
          
          if (agentHasChildren) {
            // Use hierarchical orchestrator for parent agents
            console.log(`[Orchestrator] Agent ${choice.agentId} has children, using hierarchical execution`);
            const hierarchicalResult = await executeWithHierarchy(choice.agentId, agentInput, agentContext);
            return {
              agentId: choice.agentId,
              agentName: hierarchicalResult.agentName,
              score: choice.score,
              result: hierarchicalResult,
            };
          } else {
            // Standard execution for leaf agents
            const executor = await getAgentById(choice.agentId);
            const execStartTime = Date.now();
            try {
              const result = await executor.run(agentInput, agentContext);
              const execLatency = Date.now() - execStartTime;
              // Fix: Pass as number explicitly to avoid TypeScript error
              queryMonitor.trackAgentQuerySuccess(choice.agentId, execLatency as number);
              return {
                agentId: choice.agentId,
                agentName: executor.name,
                score: choice.score,
                result,
              };
            } catch (execError: any) {
              const execLatency = Date.now() - execStartTime;
              // Fix: Pass as number explicitly to avoid TypeScript error
              queryMonitor.trackAgentQueryError(choice.agentId, execError.name || "UnknownError", execLatency as number);
              throw execError; // Re-throw to be caught by outer catch
            }
          }
        } catch (error: any) {
          console.error(`[Orchestrator] Error executing agent ${choice.agentId}:`, error.message);
          return null;
        }
      })
    );

    const validResults = agentResults.filter((r) => r !== null);
    const totalLatency = Date.now() - startTime;

    if (validResults.length === 0) {
      throw new Error("All agents failed to execute");
    }

    // STEP 3: Aggregate results
    const aggregatedContent = aggregateResponses(validResults);
    const aggregatedCitations = aggregateCitations(validResults);
    const aggregatedAttachments = aggregateAttachments(validResults);
    const totalCost = validResults.reduce((sum, r) => sum + (r!.result.costUSD || 0), 0);

    console.log(`[Orchestrator] Completed with ${validResults.length} agents in ${totalLatency}ms`);
    
    // Track agent usage for telemetry (com hierarquia)
    for (const agentResult of validResults) {
      if (agentResult) {
        try {
          const executor = await getAgentById(agentResult.agentId);
          usageTracker.trackAgentUse(
            agentResult.agentId,
            agentResult.agentName,
            "generation",
            { query: query.substring(0, 100), score: agentResult.score },
            executor.agentTier,    // Hierarquia: "agent" ou "subagent"
            undefined              // parentAgentId não disponível no root orchestrator
          );
        } catch (error) {
          // Fallback se agente não encontrado
          usageTracker.trackAgentUse(
            agentResult.agentId,
            agentResult.agentName,
            "generation",
            { query: query.substring(0, 100), score: agentResult.score }
          );
        }
      }
    }

    return {
      content: aggregatedContent,
      citations: aggregatedCitations,
      attachments: aggregatedAttachments.length > 0 ? aggregatedAttachments : undefined,
      metadata: {
        source: "multi-agent",
        agentsUsed: validResults.map((r) => r!.agentName),
        totalCost,
        totalLatency,
      },
    };
  } catch (error: any) {
    console.error("[Orchestrator] Error:", error.message);
    throw error;
  }
}

/**
 * Aggregate responses from multiple agents
 * Strategy: If single agent, return as-is. If multiple, synthesize
 */
function aggregateResponses(results: any[]): string {
  if (results.length === 1) {
    return results[0].result.text;
  }

  // Multiple agents - combine their responses
  const responses = results.map((r, idx) => {
    const agentName = r.agentName;
    const text = r.result.text;
    return `**${agentName}:**\n${text}`;
  });

  return responses.join("\n\n---\n\n");
}

/**
 * Aggregate citations from all agents (deduplicate)
 */
function aggregateCitations(results: any[]): any[] {
  const allCitations: any[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    const citations = r.result.citations || [];
    for (const citation of citations) {
      const key = `${citation.namespace}:${citation.chunkId}`;
      if (!seen.has(key)) {
        seen.add(key);
        allCitations.push(citation);
      }
    }
  }

  return allCitations;
}

/**
 * Aggregate attachments from all agents (deduplicate by URL)
 */
function aggregateAttachments(results: any[]): any[] {
  const allAttachments: any[] = [];
  const seen = new Set<string>();

  for (const r of results) {
    const attachments = r.result.attachments || [];
    for (const attachment of attachments) {
      if (!seen.has(attachment.url)) {
        seen.add(attachment.url);
        allAttachments.push(attachment);
      }
    }
  }

  return allAttachments;
}
