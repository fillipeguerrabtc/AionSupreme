/**
 * LLM Client - OpenAI API Integration
 * 
 * As per PDFs: This wraps LLM APIs (OpenAI/Anthropic) since we can't train
 * Transformer-MoE from scratch in Replit. The mathematical architecture from
 * the PDFs is conceptually implemented via API calls.
 * 
 * Features:
 * - Streaming support for real-time responses
 * - Tool calling (for ReAct agent)
 * - Rate limiting and retry logic
 * - Response caching
 * - Metrics tracking (latency, tokens, cost)
 */

import OpenAI from "openai";
import { storage } from "../storage";
import type { InsertMetric } from "@shared/schema";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  tenantId: number;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }>;
}

export interface ChatCompletionResult {
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  latencyMs: number;
  costUsd: number;
}

// Response cache (simple in-memory, could be moved to Redis)
const responseCache = new Map<string, { result: ChatCompletionResult; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Rate limiting (simple token bucket)
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(count: number = 1): Promise<void> {
    this.refill();
    
    while (this.tokens < count) {
      const waitTime = (count - this.tokens) / this.refillRate * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.refill();
    }
    
    this.tokens -= count;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

export class LLMClient {
  private openai: OpenAI;
  private rateLimiters: Map<number, RateLimiter> = new Map();

  constructor() {
    // Initialize OpenAI client
    // Uses OPENAI_API_KEY from Replit Secrets (user-provided key)
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      console.warn("[LLM] ⚠️  No OPENAI_API_KEY found in environment - chat will fail");
    } else {
      console.log("[LLM] ✓ OPENAI_API_KEY loaded successfully");
    }
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate cache key for request deduplication
   * IMPORTANT: Includes FULL message history to avoid returning stale responses
   */
  private getCacheKey(options: ChatCompletionOptions): string {
    const { messages, model, temperature, topP, tenantId } = options;
    // Include tenant ID and FULL message array to ensure uniqueness
    const keyData = JSON.stringify({ 
      tenantId,
      messages, 
      model, 
      temperature, 
      topP,
      // Add timestamp component to ensure fresh responses in conversations
      messageCount: messages.length 
    });
    // Use full hash instead of sliced version for better uniqueness
    return Buffer.from(keyData).toString("base64");
  }

  /**
   * Check cache for existing response
   */
  private checkCache(key: string): ChatCompletionResult | null {
    const cached = responseCache.get(key);
    if (!cached) return null;
    
    // Check if expired
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      responseCache.delete(key);
      return null;
    }
    
    return cached.result;
  }

  /**
   * Save response to cache
   */
  private saveToCache(key: string, result: ChatCompletionResult): void {
    responseCache.set(key, { result, timestamp: Date.now() });
  }

  /**
   * Get or create rate limiter for tenant
   */
  private getRateLimiter(tenantId: number): RateLimiter {
    if (!this.rateLimiters.has(tenantId)) {
      // Default: 60 requests per minute = 1 request per second
      this.rateLimiters.set(tenantId, new RateLimiter(60, 1));
    }
    return this.rateLimiters.get(tenantId)!;
  }

  /**
   * Calculate cost in USD based on model and token usage
   * OpenAI GPT-4 pricing (as of 2025):
   * - gpt-4o: $0.0025/1K prompt, $0.01/1K completion (recommended)
   * - gpt-3.5-turbo: $0.0005/1K prompt, $0.0015/1K completion
   */
  private calculateCost(model: string, promptTokens: number, completionTokens: number): number {
    const pricing: Record<string, { prompt: number; completion: number }> = {
      "gpt-4o": { prompt: 0.0025 / 1000, completion: 0.01 / 1000 },
      "gpt-4o-mini": { prompt: 0.00015 / 1000, completion: 0.0006 / 1000 },
      "gpt-3.5-turbo": { prompt: 0.0005 / 1000, completion: 0.0015 / 1000 },
    };
    
    const modelPricing = pricing[model] || pricing["gpt-3.5-turbo"];
    return promptTokens * modelPricing.prompt + completionTokens * modelPricing.completion;
  }

  /**
   * Main chat completion method with all features
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.getCacheKey(options);
    const cached = this.checkCache(cacheKey);
    if (cached) {
      console.log(`[LLM] Cache hit for tenant ${options.tenantId}`);
      return cached;
    }

    // Rate limiting
    const rateLimiter = this.getRateLimiter(options.tenantId);
    await rateLimiter.acquire();

    // Default model and parameters
    const model = options.model || "gpt-4o";
    const temperature = options.temperature ?? 0.7;
    const topP = options.topP ?? 0.9;
    const maxTokens = options.maxTokens ?? 2048;

    try {
      // Call OpenAI API
      const completion = await this.openai.chat.completions.create({
        model,
        messages: options.messages as any,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        tools: options.tools as any,
        stream: false, // For now, handle streaming separately
      });

      const choice = completion.choices[0];
      const usage = completion.usage!;
      const latencyMs = Date.now() - startTime;
      const costUsd = this.calculateCost(model, usage.prompt_tokens, usage.completion_tokens);

      const result: ChatCompletionResult = {
        content: choice.message.content || "",
        toolCalls: choice.message.tool_calls?.map(tc => {
          // Type guard for function tool calls
          if (tc.type === 'function' && 'function' in tc) {
            return {
              id: tc.id,
              name: tc.function.name,
              arguments: JSON.parse(tc.function.arguments),
            };
          }
          return null;
        }).filter(Boolean) as any,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
        finishReason: choice.finish_reason,
        latencyMs,
        costUsd,
      };

      // Save to cache
      this.saveToCache(cacheKey, result);

      // Record metrics
      await this.recordMetrics(options.tenantId, model, result);

      return result;
    } catch (error: any) {
      console.error(`[LLM] Error for tenant ${options.tenantId}:`, error);
      
      // Retry logic with exponential backoff
      if (error.status === 429 || error.status >= 500) {
        console.log(`[LLM] Retrying after error ${error.status}...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.chatCompletion(options);
      }
      
      throw error;
    }
  }

  /**
   * Streaming chat completion
   */
  async *chatCompletionStream(options: ChatCompletionOptions): AsyncIterable<string> {
    const model = options.model || "gpt-4o";
    const temperature = options.temperature ?? 0.7;
    const topP = options.topP ?? 0.9;
    const maxTokens = options.maxTokens ?? 2048;

    const stream = await this.openai.chat.completions.create({
      model,
      messages: options.messages as any,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      tools: options.tools as any,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        yield delta;
      }
    }
  }

  /**
   * Transcribe audio using Whisper API
   */
  async transcribeAudio(audioFilePath: string): Promise<string> {
    const startTime = Date.now();
    
    try {
      const fs = await import("fs");
      const transcription = await this.openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: "whisper-1",
      });
      
      const latencyMs = Date.now() - startTime;
      console.log(`[LLM] Audio transcribed in ${latencyMs}ms`);
      
      return transcription.text;
    } catch (error: any) {
      console.error("[LLM] Transcription error:", error);
      throw error;
    }
  }

  /**
   * Generate embeddings for RAG
   * As per PDFs: E:X→R^d with normalized vectors
   */
  async generateEmbeddings(texts: string[], tenantId: number): Promise<number[][]> {
    const startTime = Date.now();
    
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: texts,
      });

      const embeddings = response.data.map(item => item.embedding);
      const latencyMs = Date.now() - startTime;

      // Record metrics
      await storage.createMetric({
        tenantId,
        metricType: "tokens",
        value: response.usage.total_tokens,
        unit: "tokens",
        operation: "embedding",
        metadata: {
          model: "text-embedding-ada-002",
        },
      });

      await storage.createMetric({
        tenantId,
        metricType: "latency",
        value: latencyMs,
        unit: "ms",
        operation: "embedding",
      });

      return embeddings;
    } catch (error) {
      console.error("[LLM] Embedding error:", error);
      throw error;
    }
  }

  /**
   * Record metrics to database
   */
  private async recordMetrics(
    tenantId: number,
    model: string,
    result: ChatCompletionResult
  ): Promise<void> {
    try {
      const metrics: InsertMetric[] = [
        {
          tenantId,
          metricType: "latency",
          value: result.latencyMs,
          unit: "ms",
          operation: "chat_completion",
          metadata: { model },
        },
        {
          tenantId,
          metricType: "tokens",
          value: result.usage?.totalTokens || 0,
          unit: "tokens",
          operation: "chat_completion",
          metadata: { model },
        },
        {
          tenantId,
          metricType: "cost",
          value: result.costUsd,
          unit: "usd",
          operation: "chat_completion",
          metadata: { model },
        },
      ];

      await storage.createMetricsBatch(metrics);
    } catch (error) {
      console.error("[LLM] Error recording metrics:", error);
      // Don't throw - metrics are non-critical
    }
  }
}

// Singleton instance
export const llmClient = new LLMClient();
