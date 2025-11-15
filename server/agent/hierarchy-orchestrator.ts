/**
 * Hierarchical Sub-Agent Orchestrator
 * Implements parent-child delegation based on SOTA 2024-2025 research:
 * - HALO (Monte-Carlo Tree Search)
 * - Puppeteer (RL-based orchestration)
 * - MetaGPT (company-like hierarchies)
 * - MoA (Mixture of Agents layered approach)
 */

import { loadAgentChildren, hasChildren } from "./registry";
import { getAgentById } from "./runtime";
import type { AgentInput, AgentOutput, AgentRunContext } from "./types";
import { nanoid } from "nanoid";
import { queryMonitor } from "../services/query-monitor";

const MAX_HIERARCHY_DEPTH = 3; // Safeguard: prevent infinite recursion

interface DelegationDecision {
  shouldDelegate: boolean;
  reason: string;
  selectedChildren: Array<{
    childId: string;
    childName: string;
    confidence: number;
    budgetShare: number;
  }>;
}

interface HierarchicalResult extends AgentOutput {
  agentId: string;
  agentName: string;
  depth: number;
  childResults?: HierarchicalResult[];
}

/**
 * Execute agent with hierarchical delegation support
 * If agent has children, analyzes intent and may delegate to specialized sub-agents
 */
export async function executeWithHierarchy(
  agentId: string,
  input: AgentInput,
  ctx: AgentRunContext
): Promise<HierarchicalResult> {
  const depth = ctx.depth || 0;
  const traceId = ctx.traceId || nanoid();
  
  // SAFEGUARD 1: Max depth check
  if (depth >= MAX_HIERARCHY_DEPTH) {
    console.warn(`[Hierarchy] Max depth ${MAX_HIERARCHY_DEPTH} reached for agent ${agentId}`);
    const executor = await getAgentById(agentId);
    const startTime = Date.now();
    try {
      const result = await executor.run(input, ctx);
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQuerySuccess(agentId, latency);
      return { ...result, agentId, agentName: executor.name, depth };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQueryError(agentId, error.name || "UnknownError", latency);
      throw error;
    }
  }
  
  // Load agent executor
  const executor = await getAgentById(agentId);
  
  // Check if agent has children
  const childrenAvailable = await hasChildren(agentId);
  
  if (!childrenAvailable) {
    // No children - execute normally
    console.log(`[Hierarchy] Agent ${executor.name} has no children, executing directly`);
    const startTime = Date.now();
    try {
      const result = await executor.run(input, ctx);
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQuerySuccess(agentId, latency);
      return { ...result, agentId, agentName: executor.name, depth };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQueryError(agentId, error.name || "UnknownError", latency);
      throw error;
    }
  }
  
  // HIERARCHICAL EXECUTION: Parent → Children → Aggregation
  console.log(`[Hierarchy] Agent ${executor.name} has children at depth ${depth}`);
  
  // STEP 1: Intent & Capability Analysis
  const delegation = await analyzeAndDecideDelegation(agentId, input, ctx);
  
  if (!delegation.shouldDelegate) {
    // Parent handles directly (delegation not beneficial)
    console.log(`[Hierarchy] ${executor.name} handling directly: ${delegation.reason}`);
    const startTime = Date.now();
    try {
      const result = await executor.run(input, ctx);
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQuerySuccess(agentId, latency);
      return { ...result, agentId, agentName: executor.name, depth };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQueryError(agentId, error.name || "UnknownError", latency);
      throw error;
    }
  }
  
  // STEP 2: Delegate to selected children
  console.log(`[Hierarchy] Delegating to ${delegation.selectedChildren.length} children`);
  
  const childContext: AgentRunContext = {
    ...ctx,
    parentAgentId: agentId,
    depth: depth + 1,
    traceId,
  };
  
  const childResults = await Promise.all(
    delegation.selectedChildren.map(async (child) => {
      // SAFEGUARD: Normalize budget share to 0-1 range (handle both 0.4 and 40 formats)
      const normalizedShare = child.budgetShare > 1 
        ? child.budgetShare / 100 
        : child.budgetShare;
      const clampedShare = Math.max(0, Math.min(1, normalizedShare)); // Clamp to [0, 1]
      const childBudget = ctx.budgetUSD * clampedShare;
      
      console.log(`[Hierarchy] Child ${child.childName} allocated ${(clampedShare * 100).toFixed(1)}% of budget ($${childBudget.toFixed(4)})`);
      
      const childCtx = { ...childContext, budgetUSD: childBudget };
      
      try {
        // RECURSIVE: Child may also have sub-agents
        const result = await executeWithHierarchy(child.childId, input, childCtx);
        
        // Log trace
        await logAgentTrace({
          sessionId: ctx.sessionId,
          traceId,
          parentAgentId: agentId,
          currentAgentId: child.childId,
          depth: depth + 1,
          query: input.query,
          result: result.text,
          confidence: child.confidence,
          latencyMs: result.latencyMs,
          tokensUsed: result.tokens ? result.tokens.prompt + result.tokens.completion : undefined,
          costUSD: result.costUSD,
          metadata: {
            toolsUsed: ctx.tools,
            namespace: ctx.namespaces?.join(","),
          },
        });
        
        return result;
      } catch (error: any) {
        console.error(`[Hierarchy] Child ${child.childName} failed:`, error.message);
        return null;
      }
    })
  );
  
  const validChildResults = childResults.filter((r) => r !== null) as HierarchicalResult[];
  
  if (validChildResults.length === 0) {
    // All children failed - parent fallback
    console.warn(`[Hierarchy] All children failed, parent ${executor.name} falling back`);
    const startTime = Date.now();
    try {
      const result = await executor.run(input, ctx);
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQuerySuccess(agentId, latency);
      return { ...result, agentId, agentName: executor.name, depth };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      queryMonitor.trackAgentQueryError(agentId, error.name || "UnknownError", latency);
      throw error;
    }
  }
  
  // STEP 3: Aggregate child results (confidence-weighted)
  const aggregated = aggregateChildResults(validChildResults, delegation.selectedChildren);
  
  // STEP 4: Parent review/refinement (optional)
  // For now, return aggregated result directly
  // Future: Add parent LLM call to review/refine aggregated output
  
  return {
    text: aggregated.text,
    citations: aggregated.citations,
    attachments: aggregated.attachments,
    costUSD: aggregated.totalCost,
    tokens: aggregated.totalTokens,
    latencyMs: aggregated.totalLatency,
    agentId,
    agentName: executor.name,
    depth,
    childResults: validChildResults,
  };
}

/**
 * Analyze query intent and decide whether to delegate to children
 * Uses heuristics (future: LLM-based analysis like Puppeteer)
 */
async function analyzeAndDecideDelegation(
  parentAgentId: string,
  input: AgentInput,
  ctx: AgentRunContext
): Promise<DelegationDecision> {
  const children = await loadAgentChildren(parentAgentId);
  
  if (children.length === 0) {
    return {
      shouldDelegate: false,
      reason: "No children available",
      selectedChildren: [],
    };
  }
  
  // HEURISTIC 1: Query complexity (word count, question marks)
  const queryWords = input.query.split(/\s+/).length;
  const hasMultipleQuestions = (input.query.match(/\?/g) || []).length > 1;
  const isComplex = queryWords > 20 || hasMultipleQuestions;
  
  // HEURISTIC 2: Namespace matching
  const childrenWithNamespaceMatch = children.filter((c) => {
    const childNamespaces = c.childAgent.ragNamespaces || [];
    const parentNamespaces = ctx.namespaces || [];
    
    // Check if child namespace is more specific than parent
    return childNamespaces.some((childNs: string) =>
      parentNamespaces.some((parentNs: string) => childNs.startsWith(parentNs))
    );
  });
  
  // DECISION LOGIC
  if (!isComplex && childrenWithNamespaceMatch.length === 0) {
    return {
      shouldDelegate: false,
      reason: "Simple query with no specialized children",
      selectedChildren: [],
    };
  }
  
  // Select top children based on namespace match and budget share
  const selectedChildren = children
    .map((c) => ({
      childId: c.childAgent.id,
      childName: c.childAgent.name,
      confidence: childrenWithNamespaceMatch.includes(c) ? 0.9 : 0.6,
      budgetShare: c.relationship.budgetSharePercent || 0.4, // 0-1 range expected
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3); // Max 3 children in parallel (cost control)
  
  // SAFEGUARD: Ensure total budget allocation doesn't exceed 1.0 (100%)
  const totalBudgetShare = selectedChildren.reduce((sum, c) => sum + c.budgetShare, 0);
  if (totalBudgetShare > 1.0) {
    console.warn(`[Hierarchy] Total budget share ${totalBudgetShare} exceeds 100%, normalizing...`);
    selectedChildren.forEach((c) => {
      c.budgetShare = c.budgetShare / totalBudgetShare; // Normalize proportionally
    });
  }
  
  return {
    shouldDelegate: true,
    reason: isComplex ? "Complex query benefits from specialization" : "Children have specialized namespaces",
    selectedChildren,
  };
}

/**
 * Aggregate child results using confidence-weighted strategy
 * Based on MoA (Mixture of Agents) aggregation pattern
 */
function aggregateChildResults(
  results: HierarchicalResult[],
  selectedChildren: DelegationDecision["selectedChildren"]
): {
  text: string;
  citations: any[];
  attachments: any[];
  totalCost: number;
  totalTokens: { prompt: number; completion: number };
  totalLatency: number;
} {
  // Build confidence map
  const confidenceMap = new Map<string, number>();
  selectedChildren.forEach((c) => {
    confidenceMap.set(c.childId, c.confidence);
  });
  
  // Sort by confidence
  const sortedResults = results.sort((a, b) => {
    const confA = confidenceMap.get(a.agentId) || 0.5;
    const confB = confidenceMap.get(b.agentId) || 0.5;
    return confB - confA;
  });
  
  // Aggregation strategy: Highest confidence first, others as supporting context
  const primaryResult = sortedResults[0];
  const supportingResults = sortedResults.slice(1);
  
  let aggregatedText = `**${primaryResult.agentName}:**\n${primaryResult.text}`;
  
  if (supportingResults.length > 0) {
    aggregatedText += "\n\n---\n\n**Additional Perspectives:**\n\n";
    supportingResults.forEach((r) => {
      aggregatedText += `**${r.agentName}:** ${r.text.substring(0, 200)}...\n\n`;
    });
  }
  
  // Deduplicate citations
  const allCitations = results.flatMap((r) => r.citations || []);
  const seenCitations = new Set<string>();
  const uniqueCitations = allCitations.filter((c) => {
    const key = `${c.namespace}:${c.chunkId}`;
    if (seenCitations.has(key)) return false;
    seenCitations.add(key);
    return true;
  });
  
  // Deduplicate attachments
  const allAttachments = results.flatMap((r) => r.attachments || []);
  const seenAttachments = new Set<string>();
  const uniqueAttachments = allAttachments.filter((a) => {
    if (seenAttachments.has(a.url)) return false;
    seenAttachments.add(a.url);
    return true;
  });
  
  // Sum metrics
  const totalCost = results.reduce((sum, r) => sum + (r.costUSD || 0), 0);
  const totalPrompt = results.reduce((sum, r) => sum + (r.tokens?.prompt || 0), 0);
  const totalCompletion = results.reduce((sum, r) => sum + (r.tokens?.completion || 0), 0);
  const totalLatency = results.reduce((sum, r) => sum + (r.latencyMs || 0), 0);
  
  return {
    text: aggregatedText,
    citations: uniqueCitations,
    attachments: uniqueAttachments,
    totalCost,
    totalTokens: { prompt: totalPrompt, completion: totalCompletion },
    totalLatency,
  };
}

/**
 * Log agent trace to database for observability
 */
async function logAgentTrace(trace: {
  sessionId: string;
  traceId: string;
  parentAgentId?: string;
  currentAgentId: string;
  depth: number;
  query: string;
  result?: string;
  confidence?: number;
  latencyMs?: number;
  tokensUsed?: number;
  costUSD?: number;
  metadata?: any;
}): Promise<void> {
  try {
    const { db } = await import("../db");
    const { agentTraces } = await import("@shared/schema");
    
    await db.insert(agentTraces).values({
      sessionId: trace.sessionId,
      traceId: trace.traceId,
      parentAgentId: trace.parentAgentId,
      currentAgentId: trace.currentAgentId,
      depth: trace.depth,
      query: trace.query,
      result: trace.result,
      confidence: trace.confidence,
      latencyMs: trace.latencyMs,
      tokensUsed: trace.tokensUsed,
      costUSD: trace.costUSD,
      metadata: trace.metadata,
    });
  } catch (error: any) {
    console.error("[Hierarchy] Failed to log trace:", error.message);
  }
}
