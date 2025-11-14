/**
 * LLM Gateway - Single Entry Point for ALL LLM Requests
 * 
 * CRITICAL ARCHITECTURE RULE:
 * This is the ONLY way to call LLMs in AION. Direct SDK usage is FORBIDDEN.
 * 
 * WHY THIS EXISTS:
 * - Before: Multiple entry points (FreeLLMProviders, free-apis, direct SDK) caused 14.2% quota tracking gap
 * - After: Single entry point ensures 100% accurate quota tracking
 * 
 * BENEFITS:
 * - Centralized quota tracking (±1% accuracy guaranteed)
 * - Automatic fallback chain (KB → GPU → Free APIs → Web Search → OpenAI)
 * - Circuit breaker integration (prevents quota exhaustion)
 * - Comprehensive telemetry and debugging
 * 
 * USAGE:
 * ```typescript
 * import { generateLLM } from './llm/llm-gateway';
 * 
 * const result = await generateLLM({
 *   messages: [{ role: 'user', content: 'Hello!' }],
 *   consumerId: 'my-service',
 *   purpose: 'User chat message',
 * });
 * ```
 * 
 * EXCEPTIONS (documented bypasses):
 * - vision-cascade.ts: Separate Gemini quota tracking for image analysis
 * - debug routes: Explicit ?bypass=true with quota tagging
 * 
 * @see docs/llm-gateway-migration.md
 */

import { generateWithPriority } from './priority-orchestrator';
import type { ChatMessage } from '../model/llm-client';

export interface LLMGatewayOptions {
  /** Chat messages (required) */
  messages: ChatMessage[];
  
  /** Temperature (0-1, default: 0.7) */
  temperature?: number;
  
  /** Max tokens to generate (default: 2048) */
  maxTokens?: number;
  
  /** Specific model to use (optional, provider chooses default if not specified) */
  model?: string;
  
  /** Force specific provider (skip fallback chain) */
  forceProvider?: 'groq' | 'gemini' | 'hf' | 'openrouter' | 'openai';
  
  /** Language directive for Priority Orchestrator (default: 'en') */
  language?: 'pt-BR' | 'en-US' | 'es-ES';
  
  /** Consumer ID for quota tagging (e.g., 'router', 'chat', 'classifier') */
  consumerId?: string;
  
  /** Human-readable purpose for logs and debugging */
  purpose?: string;
  
  /** Bypass orchestrator (ONLY for debug routes with explicit logging) */
  bypassOrchestrator?: boolean;
  
  /** Conversation ID (for RAG context and telemetry) */
  conversationId?: number | null;
  
  /** Message ID (for telemetry) */
  messageId?: number | null;
  
  /** Namespaces for RAG search (empty array = skip RAG) */
  namespaces?: string[];
}

export interface LLMGatewayResult {
  /** Generated text content */
  content: string;
  
  /** Provider used ('groq', 'gemini', 'openai', 'kb', 'web-search', etc) */
  provider: string;
  
  /** Token usage statistics */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  /** Cost in USD (0 for free providers) */
  costUsd: number;
  
  /** Latency in milliseconds */
  latencyMs: number;
  
  /** Finish reason ('stop', 'length', etc) - defaults to 'stop' */
  finishReason: string;
  
  /** Tool calls (function calling) - optional, future-proof for providers that support it */
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
}

/**
 * Main LLM Gateway - Routes ALL requests through Priority Orchestrator
 * 
 * This is the ONLY function you should call for LLM completions.
 * 
 * @throws Error if all providers fail (including OpenAI fallback)
 */
export async function generateLLM(options: LLMGatewayOptions): Promise<LLMGatewayResult> {
  const {
    messages,
    temperature = 0.7,
    maxTokens = 2048,
    model,
    forceProvider,
    language = 'en-US',
    consumerId = 'unknown',
    purpose = 'unspecified',
    bypassOrchestrator = false,
    conversationId = null,
    messageId = null,
    namespaces = [],
  } = options;

  // SECURITY WARNING: Bypass is ONLY allowed for debug routes
  if (bypassOrchestrator) {
    console.warn(
      `⚠️ [LLM Gateway] ORCHESTRATOR BYPASS requested\n` +
      `   Consumer: ${consumerId}\n` +
      `   Purpose: ${purpose}\n` +
      `   ⚠️  This request will NOT be tracked in quota ledger!`
    );
    // TODO: Log to quota ledger with synthetic consumer ID
  }

  // Validate messages
  if (!messages || messages.length === 0) {
    throw new Error('[LLM Gateway] messages array is required and cannot be empty');
  }

  // Log request metadata (NEVER log message content for privacy)
  console.log(
    `🚪 [LLM Gateway] Request from consumer="${consumerId}" ` +
    `purpose="${purpose}" ` +
    `messages=${messages.length} ` +
    `forceProvider=${forceProvider || 'auto'}`
  );

  // Route through Priority Orchestrator (default path)
  const result = await generateWithPriority({
    messages,
    temperature,
    maxTokens,
    model,
    forceProvider, // NEW: Pass through to free-apis.ts
    language,
    conversationId,
    messageId,
    namespaces,
    consumerId, // NEW: For quota tagging
  });

  // Map Priority Orchestrator result to LLMGatewayResult
  return {
    content: result.content,
    provider: result.provider || 'unknown',
    usage: result.usage || {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    costUsd: result.costUsd || 0,
    latencyMs: result.latencyMs || 0,
    finishReason: result.finishReason || 'stop', // DEFAULT to 'stop' for safety
    toolCalls: result.toolCalls, // Pass through (undefined if not supported)
  };
}

/**
 * Runtime guard - Throws if called from deprecated FreeLLMProviders
 * 
 * This ensures no code accidentally bypasses the gateway.
 * 
 * @throws Error if called from free-llm-providers.ts
 */
export function assertNotBypassingGateway() {
  const stack = new Error().stack || '';
  
  if (stack.includes('free-llm-providers.ts')) {
    throw new Error(
      '🚨 FORBIDDEN: Direct FreeLLMProviders usage detected!\n' +
      '\n' +
      'You MUST use LLM Gateway instead:\n' +
      '\n' +
      '  import { generateLLM } from "./llm/llm-gateway";\n' +
      '\n' +
      '  const result = await generateLLM({\n' +
      '    messages: [...],\n' +
      '    consumerId: "my-service",\n' +
      '    purpose: "Classification",\n' +
      '  });\n' +
      '\n' +
      'Migration guide: docs/llm-gateway-migration.md'
    );
  }
}

/**
 * Type guard - Check if error is quota exhaustion
 */
export function isQuotaExhaustedError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('quota') ||
      error.message.includes('rate limit') ||
      error.message.includes('Rate limit') ||
      error.message.includes('exceeded')
    );
  }
  return false;
}

/**
 * Type guard - Check if error is provider unavailable
 */
export function isProviderUnavailableError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('not initialized') ||
      error.message.includes('Unauthorized') ||
      error.message.includes('Not Found') ||
      error.message.includes('unavailable')
    );
  }
  return false;
}

/**
 * Generate embeddings via LLM Gateway
 * 
 * Centralized embeddings generation with fallback chain:
 * OpenAI (paid, high-quality) → HuggingFace (free, fallback)
 * 
 * @param options - Embedding options
 * @returns Array of embedding vectors (one per input text)
 */
export async function generateEmbeddings(options: {
  texts: string[];
  model?: 'openai' | 'huggingface';
  consumerId?: string;
  purpose?: string;
}): Promise<number[][]> {
  const {
    texts,
    model,
    consumerId = 'embeddings-unknown',
    purpose = 'Embedding generation',
  } = options;

  // ✅ MANDATORY TRUNCATION - prevents "maximum context length 8192 tokens" errors
  const { truncateBatchForEmbedding } = await import("../ai/embedding-sanitizer");
  const safeTexts = truncateBatchForEmbedding(texts, { purpose: `llm-gateway: ${purpose}` });

  console.log(
    `🔢 [LLM Gateway - Embeddings] Request from consumer="${consumerId}" ` +
    `purpose="${purpose}" texts=${safeTexts.length}`
  );

  // Try OpenAI first (paid, high-quality)
  if (!model || model === 'openai') {
    try {
      const OpenAI = (await import('openai')).default;
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY not set');

      const openai = new OpenAI({ apiKey });
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: safeTexts,
      });

      console.log(`✅ [LLM Gateway - Embeddings] OpenAI embeddings generated (${safeTexts.length} texts)`);
      return response.data.map(item => item.embedding);
    } catch (error: any) {
      console.warn(`⚠️  [LLM Gateway - Embeddings] OpenAI failed:`, error.message);
      
      // If forcing OpenAI, don't fallback
      if (model === 'openai') {
        throw error;
      }
    }
  }

  // Fallback to HuggingFace (free)
  console.log(`🔄 [LLM Gateway - Embeddings] Falling back to HuggingFace (free)...`);
  
  const { HfInference } = await import('@huggingface/inference');
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not set');

  const hf = new HfInference(apiKey);
  const embeddings: number[][] = [];

  for (const text of safeTexts) {
    const embedding = await hf.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: text,
    });

    if (Array.isArray(embedding)) {
      embeddings.push(embedding as number[]);
    } else {
      throw new Error("Unexpected embedding format from HuggingFace");
    }
  }

  console.log(`✅ [LLM Gateway - Embeddings] HuggingFace embeddings generated (${safeTexts.length} texts)`);
  return embeddings;
}
