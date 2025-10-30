/**
 * Conversation Collector - Auto-evolution from high-quality conversations
 * 
 * Monitors conversations and automatically collects high-quality exchanges
 * for model fine-tuning, enabling continuous improvement based on real usage.
 */

import type { Message, Conversation } from "@shared/schema";

export interface QualityMetrics {
  score: number; // 0-100
  messageCount: number;
  totalTokens: number;
  avgLatency: number;
  providers: string[];
  toolsUsed: string[];
  hasAttachments: boolean;
  completionRate: number; // % of messages that got responses
}

export interface FormattedTrainingExample {
  instruction: string;
  input?: string;
  output: string;
  system?: string;
  context?: string; // Prior conversation context
  toolResults?: Array<{ tool: string; result: string }>; // Tool execution results
}

export class ConversationCollector {
  /**
   * Calculate automatic quality score for a conversation
   * Based on: token usage, message count, latency, tool diversity
   */
  static calculateQualityScore(messages: Message[]): QualityMetrics {
    if (messages.length === 0) {
      return {
        score: 0,
        messageCount: 0,
        totalTokens: 0,
        avgLatency: 0,
        providers: [],
        toolsUsed: [],
        hasAttachments: false,
        completionRate: 0,
      };
    }

    // Extract metadata
    let totalTokens = 0;
    let totalLatency = 0;
    let latencyCount = 0;
    const providers = new Set<string>();
    const toolsUsed = new Set<string>();
    let hasAttachments = false;
    let completedExchanges = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      // Count tokens
      if (msg.metadata?.tokensUsed) {
        totalTokens += msg.metadata.tokensUsed;
      }
      
      // Track latency
      if (msg.metadata?.latencyMs) {
        totalLatency += msg.metadata.latencyMs;
        latencyCount++;
      }
      
      // Track providers
      if (msg.metadata?.model) {
        providers.add(msg.metadata.model);
      }
      
      // Track tool usage
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        msg.toolCalls.forEach(tool => toolsUsed.add(tool.name));
      }
      
      // Check attachments
      if (msg.attachments && msg.attachments.length > 0) {
        hasAttachments = true;
      }
      
      // Count completed exchanges (user → assistant pairs)
      if (msg.role === 'user' && messages[i + 1]?.role === 'assistant') {
        completedExchanges++;
      }
    }

    const avgLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;
    const userMessages = messages.filter(m => m.role === 'user').length;
    const completionRate = userMessages > 0 ? (completedExchanges / userMessages) * 100 : 0;

    // Calculate quality score (0-100)
    let score = 0;
    
    // Message count (max 20 points)
    score += Math.min(messages.length * 2, 20);
    
    // Token usage indicates substantial content (max 25 points)
    score += Math.min(totalTokens / 100, 25);
    
    // Low latency is good (max 15 points)
    if (avgLatency > 0) {
      const latencyScore = Math.max(0, 15 - (avgLatency / 1000));
      score += latencyScore;
    }
    
    // Tool diversity (max 20 points)
    score += Math.min(toolsUsed.size * 5, 20);
    
    // Completion rate (max 20 points)
    score += (completionRate / 100) * 20;

    return {
      score: Math.min(Math.round(score), 100),
      messageCount: messages.length,
      totalTokens,
      avgLatency: Math.round(avgLatency),
      providers: Array.from(providers),
      toolsUsed: Array.from(toolsUsed),
      hasAttachments,
      completionRate: Math.round(completionRate),
    };
  }

  /**
   * Convert conversation messages to instruction tuning format
   * Returns array of training examples in JSONL-compatible format
   * Includes context from prior messages and tool execution results
   */
  static convertToTrainingFormat(
    messages: Message[],
    systemPrompt?: string
  ): FormattedTrainingExample[] {
    const examples: FormattedTrainingExample[] = [];
    
    // Extract user-assistant pairs with context
    for (let i = 0; i < messages.length - 1; i++) {
      const currentMsg = messages[i];
      const nextMsg = messages[i + 1];
      
      // Only create examples from user→assistant pairs
      if (currentMsg.role === 'user' && nextMsg.role === 'assistant') {
        const example: FormattedTrainingExample = {
          instruction: currentMsg.content,
          output: nextMsg.content,
        };
        
        // Add system prompt if provided
        if (systemPrompt) {
          example.system = systemPrompt;
        }
        
        // Add prior context (last 3 exchanges before current)
        if (i >= 2) {
          const contextMessages = messages.slice(Math.max(0, i - 6), i);
          const contextLines: string[] = [];
          
          for (const msg of contextMessages) {
            if (msg.role !== 'system') {
              const role = msg.role === 'user' ? 'User' : 'Assistant';
              contextLines.push(`${role}: ${msg.content.substring(0, 200)}`);
            }
          }
          
          if (contextLines.length > 0) {
            example.context = contextLines.join('\n');
          }
        }
        
        // Add tool execution details if tools were used
        if (nextMsg.toolCalls && nextMsg.toolCalls.length > 0) {
          example.toolResults = nextMsg.toolCalls.map(tc => ({
            tool: tc.name,
            result: JSON.stringify(tc.arguments).substring(0, 500),
          }));
          
          // Also add simplified tool context to input
          const toolContext = nextMsg.toolCalls
            .map(tc => `[Tool: ${tc.name}]`)
            .join(' ');
          example.input = toolContext;
        }
        
        examples.push(example);
      }
    }
    
    return examples;
  }

  /**
   * Determine if a conversation is worth collecting for training
   * Thresholds:
   * - Quality score >= 60
   * - At least 2 message exchanges
   * - At least 100 tokens total
   */
  static shouldCollect(metrics: QualityMetrics): boolean {
    return (
      metrics.score >= 60 &&
      metrics.messageCount >= 4 && // At least 2 exchanges (user+assistant pairs)
      metrics.totalTokens >= 100
    );
  }

  /**
   * Extract system prompt from messages if present
   */
  static extractSystemPrompt(messages: Message[]): string | undefined {
    const systemMsg = messages.find(m => m.role === 'system');
    return systemMsg?.content;
  }
}
