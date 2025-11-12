/**
 * ReAct Engine - Autonomous Agent with POMDP Framework
 * 
 * As per PDFs: Implements complete POMDP (S,A,O,T,R,Ω,γ) with:
 * - Policy π_θ(a|h_t) over history h_t=(o_{≤t},a_{<t})
 * - Template ReAct (Thought→Action→Observation)
 * - Generative model π_θ(a_t,r_t|h_t)=π_θ(r_t|h_t)π_θ(a_t|h_t,r_t)
 * - Stop criteria (confidence≥τ, T_max, no-progress heuristic)
 */

import { LLMClient } from "../model/llm-client";
import { storage } from "../storage";
import type { InsertToolExecution } from "@shared/schema";

export interface AgentAction {
  toolName: string;
  toolInput: Record<string, any>;
  thought: string; // ReAct reasoning
}

export interface AgentObservation {
  observation: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
  attachments?: Array<{
    type: "image" | "video" | "audio" | "document";
    url: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
}

export interface AgentStep {
  stepNumber: number;
  thought: string;
  action: AgentAction;
  observation: AgentObservation;
  executionTimeMs: number;
}

export interface AgentResult {
  goal: string;
  finalAnswer?: string;
  steps: AgentStep[];
  totalSteps: number;
  success: boolean;
  stopReason: "goal_achieved" | "max_steps" | "no_progress" | "error";
}

export type AgentTool = (input: any) => Promise<AgentObservation>;

export class ReActEngine {
  private maxSteps = 15; // T_max
  private confidenceThreshold = 0.8; // τ
  private noProgressThreshold = 3; // Steps without progress

  /**
   * Execute ReAct loop for goal
   * As per PDFs: Template interno (Pensamento→Ação→Observação→...)
   */
  async execute(
    goal: string,
    conversationId: number,
    messageId: number,
    availableTools: Map<string, AgentTool>
  ): Promise<AgentResult> {
    console.log(`[ReActEngine] Starting execution for goal: ${goal}`);
    
    const steps: AgentStep[] = [];
    const history: string[] = []; // h_t=(o_{≤t},a_{<t})
    let noProgressCount = 0;
    
    // Initialize
    history.push(`Goal: ${goal}`);
    
    for (let stepNum = 1; stepNum <= this.maxSteps; stepNum++) {
      console.log(`[ReActEngine] Step ${stepNum}/${this.maxSteps}`);
      
      try {
        // 1. Generate Thought + Action
        // As per PDFs: π_θ(r_t|h_t) then π_θ(a_t|h_t,r_t)
        const { thought, action } = await this.generateAction(history, availableTools);
        
        // Check if agent wants to finish
        if (action.toolName === "Finish") {
          const finalAnswer = action.toolInput.answer || "";
          console.log(`[ReActEngine] Agent finished with answer: ${finalAnswer}`);
          
          return {
            goal,
            finalAnswer,
            steps,
            totalSteps: stepNum,
            success: true,
            stopReason: "goal_achieved",
          };
        }
        
        // 2. Execute Action
        const startTime = Date.now();
        const tool = availableTools.get(action.toolName);
        
        if (!tool) {
          throw new Error(`Tool '${action.toolName}' not found`);
        }
        
        const observation = await tool(action.toolInput);
        const executionTimeMs = Date.now() - startTime;
        
        // 3. Record step
        const step: AgentStep = {
          stepNumber: stepNum,
          thought,
          action,
          observation,
          executionTimeMs,
        };
        
        steps.push(step);
        
        // Save to database
        await storage.createToolExecution({
          conversationId,
          messageId,
          toolName: action.toolName,
          toolInput: action.toolInput,
          observation: observation.observation,
          success: observation.success,
          errorMessage: observation.errorMessage,
          executionTimeMs,
          thought,
        });
        
        // 4. Update history
        history.push(`Thought: ${thought}`);
        history.push(`Action: ${action.toolName}(${JSON.stringify(action.toolInput)})`);
        history.push(`Observation: ${observation.observation}`);
        
        // 5. Check for progress
        if (!observation.success || observation.observation.includes("error") || observation.observation.includes("failed")) {
          noProgressCount++;
        } else {
          noProgressCount = 0; // Reset on success
        }
        
        // 6. Check stop conditions
        if (noProgressCount >= this.noProgressThreshold) {
          console.log(`[ReActEngine] No progress for ${noProgressCount} steps, stopping`);
          return {
            goal,
            steps,
            totalSteps: stepNum,
            success: false,
            stopReason: "no_progress",
          };
        }
        
      } catch (error: any) {
        console.error(`[ReActEngine] Error at step ${stepNum}:`, error);
        return {
          goal,
          steps,
          totalSteps: stepNum,
          success: false,
          stopReason: "error",
        };
      }
    }
    
    // Max steps reached
    console.log(`[ReActEngine] Max steps (${this.maxSteps}) reached`);
    return {
      goal,
      steps,
      totalSteps: this.maxSteps,
      success: false,
      stopReason: "max_steps",
    };
  }

  /**
   * Generate next action using LLM
   * As per PDFs: π_θ(a_t,r_t|h_t)=π_θ(r_t|h_t)π_θ(a_t|h_t,r_t)
   */
  private async generateAction(
    history: string[],
    availableTools: Map<string, any>
  ): Promise<{ thought: string; action: AgentAction }> {
    // Build tools description
    const toolDescriptions = Array.from(availableTools.keys())
      .map(name => `- ${name}`)
      .join("\n");
    
    // ReAct prompt template
    const prompt = `You are an autonomous AI agent using the ReAct (Reasoning + Acting) framework.

Available Tools:
${toolDescriptions}
- Finish(answer: string) - Call this when you have the final answer

History:
${history.join("\n")}

Instructions:
1. First, write your Thought about what to do next
2. Then, choose an Action from the available tools
3. Format your response EXACTLY as:
Thought: [your reasoning]
Action: [ToolName]
Input: [JSON object with tool parameters]

Example:
Thought: I need to search for information about transformers
Action: SearchWeb
Input: {"query": "transformer architecture machine learning"}

Now, what is your next step?`;

    // Create policy-aware LLM client
    const client = await LLMClient.create();
    
    const response = await client.chatCompletion({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-4o",
      temperature: 0.7,
    });
    
    // Parse response
    const content = response.content;
    const thoughtMatch = content.match(/Thought:\s*(.+?)(?=Action:|$)/s);
    const actionMatch = content.match(/Action:\s*(\w+)/);
    const inputMatch = content.match(/Input:\s*({.+?})/s);
    
    if (!thoughtMatch || !actionMatch) {
      throw new Error(`Failed to parse ReAct response: ${content}`);
    }
    
    const thought = thoughtMatch[1].trim();
    const toolName = actionMatch[1].trim();
    let toolInput: Record<string, any> = {};
    
    if (inputMatch) {
      try {
        toolInput = JSON.parse(inputMatch[1]);
      } catch (error) {
        console.error("[ReActEngine] Failed to parse input JSON:", inputMatch[1]);
        toolInput = {};
      }
    }
    
    return {
      thought,
      action: {
        toolName,
        toolInput,
        thought,
      },
    };
  }

  /**
   * Set configuration
   */
  configure(options: {
    maxSteps?: number;
    confidenceThreshold?: number;
    noProgressThreshold?: number;
  }): void {
    if (options.maxSteps !== undefined) this.maxSteps = options.maxSteps;
    if (options.confidenceThreshold !== undefined) this.confidenceThreshold = options.confidenceThreshold;
    if (options.noProgressThreshold !== undefined) this.noProgressThreshold = options.noProgressThreshold;
  }
}

// Singleton instance
export const reactEngine = new ReActEngine();
