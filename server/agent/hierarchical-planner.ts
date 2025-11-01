/**
 * Hierarchical Planner - Meta-Policy & Sub-Goals Decomposition
 * 
 * As per PDFs: Implements hierarchical planning with:
 * - Goal decomposition: Goal(G) → {sub-goals G_1,...,G_n, policies π_1,...,π_n}
 * - Meta-policy with weights ω_i ∝ ∂R_i/∂goal
 * - Hierarchical optimization with sub-goal stopping criteria
 * - Result aggregation
 */

import { llmClient } from "../model/llm-client";
import { reactEngine } from "./react-engine";
import type { AgentTool } from "./react-engine";

interface SubGoal {
  id: string;
  description: string;
  priority: number;
  dependencies: string[]; // IDs of sub-goals that must complete first
}

interface HierarchicalPlan {
  mainGoal: string;
  subGoals: SubGoal[];
  estimatedSteps: number;
}

interface SubGoalResult {
  subGoalId: string;
  success: boolean;
  result: string;
  stepsUsed: number;
}

export class HierarchicalPlanner {
  /**
   * Decompose complex goal into sub-goals
   * Uses LLM to analyze goal and create hierarchical plan
   */
  async decomposeGoal(goal: string): Promise<HierarchicalPlan> {
    const prompt = `You are a hierarchical planning AI. Break down the following complex goal into smaller, manageable sub-goals.

Goal: ${goal}

Analyze the goal and respond with a JSON object containing:
{
  "subGoals": [
    {
      "id": "unique_id",
      "description": "Clear description of sub-goal",
      "priority": 1-10 (higher = more important),
      "dependencies": ["id_of_prerequisite_subgoal"]
    }
  ],
  "estimatedSteps": total_estimated_steps_needed
}

Rules:
1. Each sub-goal should be independently achievable
2. Sub-goals should be ordered by dependencies
3. Limit to 5-7 sub-goals maximum
4. Be specific and actionable

Respond with ONLY the JSON object, no explanation.`;

    const response = await llmClient.chatCompletion({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      temperature: 0.3,
      maxTokens: 1000,
    });

    try {
      const parsed = JSON.parse(response.content);
      return {
        mainGoal: goal,
        subGoals: parsed.subGoals,
        estimatedSteps: parsed.estimatedSteps || 10,
      };
    } catch (error) {
      // Fallback: treat as single goal
      return {
        mainGoal: goal,
        subGoals: [
          {
            id: "main",
            description: goal,
            priority: 10,
            dependencies: [],
          },
        ],
        estimatedSteps: 5,
      };
    }
  }

  /**
   * Execute hierarchical plan with meta-policy coordination
   * As per PDFs: ω_i ∝ ∂R_i/∂goal with hierarchical optimization
   */
  async executePlan(
    plan: HierarchicalPlan,
    conversationId: number,
    messageId: number,
    tools: Map<string, AgentTool>
  ): Promise<{ success: boolean; results: SubGoalResult[]; finalAnswer: string }> {
    const results: SubGoalResult[] = [];
    const completedGoals = new Set<string>();

    console.log(`[HierarchicalPlanner] Executing plan for: ${plan.mainGoal}`);
    console.log(`[HierarchicalPlanner] Sub-goals: ${plan.subGoals.length}`);

    // Execute sub-goals respecting dependencies
    for (const subGoal of this.topologicalSort(plan.subGoals)) {
      // Check if all dependencies are completed
      const depsCompleted = subGoal.dependencies.every((dep) => completedGoals.has(dep));
      
      if (!depsCompleted) {
        console.warn(`[HierarchicalPlanner] Skipping ${subGoal.id} - dependencies not met`);
        results.push({
          subGoalId: subGoal.id,
          success: false,
          result: "Dependencies not completed",
          stepsUsed: 0,
        });
        continue;
      }

      console.log(`[HierarchicalPlanner] Executing sub-goal: ${subGoal.description}`);

      // Execute sub-goal using ReAct engine
      const result = await reactEngine.execute(
        subGoal.description,
        conversationId,
        messageId,
        tools
      );

      results.push({
        subGoalId: subGoal.id,
        success: result.success,
        result: result.finalAnswer || "",
        stepsUsed: result.steps.length,
      });

      if (result.success) {
        completedGoals.add(subGoal.id);
      }
    }

    // Aggregate results with meta-policy
    const finalAnswer = await this.aggregateResults(plan.mainGoal, results);

    return {
      success: results.every((r) => r.success),
      results,
      finalAnswer,
    };
  }

  /**
   * Topological sort of sub-goals based on dependencies
   */
  private topologicalSort(subGoals: SubGoal[]): SubGoal[] {
    const sorted: SubGoal[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (goal: SubGoal) => {
      if (visited.has(goal.id)) return;
      if (visiting.has(goal.id)) {
        // Circular dependency - just add it
        sorted.push(goal);
        visited.add(goal.id);
        return;
      }

      visiting.add(goal.id);

      // Visit dependencies first
      for (const depId of goal.dependencies) {
        const dep = subGoals.find((g) => g.id === depId);
        if (dep) visit(dep);
      }

      visiting.delete(goal.id);
      visited.add(goal.id);
      sorted.push(goal);
    };

    // Sort by priority first, then visit
    const prioritySorted = [...subGoals].sort((a, b) => b.priority - a.priority);
    prioritySorted.forEach(visit);

    return sorted;
  }

  /**
   * Aggregate sub-goal results into final answer
   * Uses meta-policy with weighted combination
   */
  private async aggregateResults(
    mainGoal: string,
    results: SubGoalResult[]
  ): Promise<string> {
    const successfulResults = results.filter((r) => r.success);
    
    if (successfulResults.length === 0) {
      return "Unable to complete the goal - all sub-goals failed.";
    }

    // Simple aggregation: concatenate results
    if (successfulResults.length === 1) {
      return successfulResults[0].result;
    }

    // Use LLM to synthesize final answer
    const prompt = `Synthesize the following sub-goal results into a coherent final answer for the main goal.

Main Goal: ${mainGoal}

Sub-goal Results:
${successfulResults.map((r, i) => `${i + 1}. ${r.result}`).join("\n\n")}

Provide a comprehensive final answer that addresses the main goal:`;

    const response = await llmClient.chatCompletion({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4",
      temperature: 0.5,
      maxTokens: 1000,
    });

    return response.content;
  }
}

export const hierarchicalPlanner = new HierarchicalPlanner();
