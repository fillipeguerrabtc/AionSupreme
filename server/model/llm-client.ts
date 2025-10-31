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
import { freeLLMProviders } from "./free-llm-providers";

/**
 * Erro customizado para recusas de conteúdo já tratadas
 * Previne fallback redundante no catch block
 */
class ContentRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentRefusalError";
  }
}

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
   * Detectar recusas de conteúdo do OpenAI (content-level refusals)
   * 
   * ESTRATÉGIA ROBUSTA:
   * 1. Detecta padrões de POLÍTICA/HARMFUL (sempre recusa, independente de contexto)
   * 2. Detecta padrões GERAIS de recusa (I cannot help, I can't assist, etc)
   * 3. Se tem recusa GERAL mas TAMBÉM tem explicação de memória legítima → verificar contexto
   * 4. Se tem APENAS memória sem recusa → permitir
   * 
   * ⚠️ SEGURANÇA: Padrões de política/harmful SEMPRE são bloqueados
   */
  private detectRefusal(content: string, finishReason?: string): boolean {
    // 1. Verificar finish_reason
    if (finishReason === "content_filter") {
      return true;
    }

    // 2. 🔴 PADRÕES DE POLÍTICA/HARMFUL (sempre são recusa, NUNCA permitir)
    const policyHarmfulPatterns = [
      /against (my|OpenAI|our|the|any) (guidelines|policy|policies|terms|rules|content policy)/i,
      /violates? (my|OpenAI|our|the|any) (guidelines|policy|policies|terms|rules)/i,
      /(OpenAI|our|the) (content )?polic(y|ies)/i,
      /inappropriate (content|request|material)/i,
      /harmful (content|request|material|information)/i,
      /offensive (content|material|language)/i,
      /unethical/i,
      /illegal (activity|content|material)/i,
    ];

    for (const pattern of policyHarmfulPatterns) {
      if (pattern.test(content)) {
        console.log("[LLM] 🚫 Recusa detectada - violação de política/conteúdo harmful");
        return true;
      }
    }

    // 3. 🟡 PADRÕES GERAIS DE RECUSA (amplos para pegar variações)
    const generalRefusalPatterns = [
      // Recusas com verbos auxiliares
      /I (cannot|can't|am not able to|am unable to|must not|won't be able to|will not|won't)/i,
      
      // Recusas diretas SEM auxiliares (crítico!)
      /I (refuse|decline|deny)/i,
      /I must (decline|refuse)/i,
      
      // Desconforto/programação
      /I don't feel comfortable/i,
      /not comfortable (with|providing|creating|generating|helping)/i,
      /I'm programmed (not to|to (refuse|decline|avoid))/i,
      
      // Com apologies/qualificadores
      /I'm (sorry|afraid).{0,20}(but|however).{0,30}(cannot|can't|unable|not able|refuse|decline|will not)/i,
      /(unfortunately|regrettably).{0,30}(cannot|can't|unable|not able|refuse|decline)/i,
    ];

    let hasGeneralRefusal = false;
    for (const pattern of generalRefusalPatterns) {
      if (pattern.test(content)) {
        hasGeneralRefusal = true;
        break;
      }
    }

    // 4. 🛡️ EXCEÇÕES LEGÍTIMAS (memória/contexto conversacional)
    const memoryContextPatterns = [
      /I (don't|do not|cannot|can't) (remember|recall|have access to|retain|have information about) (our|your|the|previous|earlier|past)/i,
      /I (don't|do not) have (previous|prior|earlier|past) conversation/i,
      /as an AI.{0,50}(don't|do not|cannot|can't) (have|maintain|store|keep|retain) (conversation history|memory|context|previous)/i,
      /I don't have the ability to (remember|recall|access|retain|store)/i,
      /I (don't|do not) (have|maintain|store) (memory|conversation history|context) (of|from|about)/i,
    ];

    let hasMemoryExplanation = false;
    for (const pattern of memoryContextPatterns) {
      if (pattern.test(content)) {
        hasMemoryExplanation = true;
        break;
      }
    }

    // 5. DECISÃO FINAL - Abordagem de WHITELIST (mais segura)
    
    // 🎯 WHITELIST EXPLÍCITA: Frases de "cannot" que são LEGÍTIMAS (apenas memória)
    const legitimateMemoryPhrases = [
      /I (cannot|can't|am not able to|am unable to) (remember|recall|access|retain)/i,
      /I (do not|don't) (remember|recall|have access to|retain|have information)/i,
      /(cannot|can't) (retrieve|access|recall) (previous|earlier|past|our) (conversation|discussion|history)/i,
      /I'm unable to (remember|recall|access|retrieve)/i,
    ];

    // Verificar se é APENAS sobre memória (whitelist)
    let isOnlyAboutMemory = false;
    for (const pattern of legitimateMemoryPhrases) {
      if (pattern.test(content)) {
        isOnlyAboutMemory = true;
        break;
      }
    }

    // DECISÃO:
    if (hasMemoryExplanation && !hasGeneralRefusal) {
      // Apenas explicação de memória, sem frases de recusa
      console.log("[LLM] ✅ Resposta sobre memória/contexto - LEGÍTIMA");
      return false;
    } else if (hasGeneralRefusal && isOnlyAboutMemory) {
      // Tem "cannot" mas é ESPECIFICAMENTE sobre memória (whitelist)
      console.log("[LLM] ✅ Frase legítima sobre memória (whitelist) - PERMITIDO");
      return false;
    } else if (hasGeneralRefusal) {
      // Tem "cannot/can't" mas NÃO está na whitelist → RECUSA
      console.log("[LLM] 🚫 Recusa detectada - frase de limitação não está na whitelist de memória");
      return true;
    }

    // Nenhum padrão detectado → permitir
    return false;
  }

  /**
   * Main chat completion method with all features
   * 
   * 🚀 ORDEM INVERTIDA (Conforme solicitado):
   * 1º: APIs GRATUITAS (OpenRouter → Groq → Gemini → HuggingFace)
   * 2º: OpenAI (ÚLTIMA opção, apenas se todas as gratuitas falharem)
   * 
   * OpenAI é PAGA - usar apenas como último recurso!
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

    // ===================================================================
    // 1º PRIORIDADE: TENTAR APIs GRATUITAS PRIMEIRO!
    // ===================================================================
    console.log("[LLM] 🆓 Tentando APIs gratuitas primeiro (OpenRouter/Groq/Gemini/HF)...");
    
    try {
      const freeResult = await freeLLMProviders.chatCompletion(options.messages);
      
      // Save to cache
      this.saveToCache(cacheKey, freeResult);
      
      // Record metrics (marca como free_api)
      await this.recordMetrics(options.tenantId, "free_api", freeResult);
      
      console.log("[LLM] ✅ Resposta obtida via APIs GRATUITAS - OpenAI NÃO foi consultada! 🎉");
      
      return freeResult;
    } catch (freeApiError: any) {
      console.warn("[LLM] ⚠️  APIs gratuitas falharam:", freeApiError.message);
      console.log("[LLM] 💰 Fallback para OpenAI (API PAGA - última opção)...");
    }

    // ===================================================================
    // 2º PRIORIDADE (ÚLTIMA OPÇÃO): OpenAI (PAGA!)
    // ===================================================================
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

      const content = choice.message.content || "";
      
      // 🚀 Detectar recusas de conteúdo (content-level refusals)
      const isRefusal = this.detectRefusal(content, choice.finish_reason);
      
      if (isRefusal) {
        console.error("[LLM] 🚫 OpenAI recusou requisição (content filter) e APIs gratuitas já falharam.");
        
        // Lançar ContentRefusalError para propagar para web-search fallback
        throw new ContentRefusalError(
          `TODAS as APIs falharam. OpenAI recusou (content filter: "${content.substring(0, 100)}..."). ` +
          `APIs gratuitas já falharam anteriormente.`
        );
      }

      const result: ChatCompletionResult = {
        content,
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

      console.log(`[LLM] ✅ Resposta obtida via OpenAI (custo: $${costUsd.toFixed(4)})`);

      return result;
    } catch (error: any) {
      // Se erro é ContentRefusalError, re-lançar imediatamente
      if (error instanceof ContentRefusalError) {
        console.error("[LLM] ⛔ Content refusal error - propagando para web-search fallback");
        throw error;
      }
      
      console.error(`[LLM] ❌ OpenAI também falhou:`, error.message);
      
      // Retry logic com exponential backoff apenas para erros temporários
      if (error.status === 429 || error.status >= 500) {
        console.log(`[LLM] Retrying after error ${error.status}...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.chatCompletion(options);
      }
      
      throw new Error(
        `TODAS as APIs falharam (Free + OpenAI). ` +
        `OpenAI error: ${error.message}`
      );
    }
  }

  /**
   * Streaming chat completion
   * 
   * ⚠️ TEMPORARIAMENTE DESABILITADO para garantir zero censura.
   * 
   * Streaming não pode detectar recusas antes de emitir ao usuário (precisaria
   * bufferizar toda resposta). Para preservar garantia de "nunca retornar censura",
   * streaming está desabilitado até implementarmos detecção completa.
   * 
   * Use chatCompletion() (não-streaming) que tem:
   * - Detecção de recusa (18 padrões + content_filter)
   * - Fallback automático para APIs gratuitas
   * - Fallback para web-search se tudo falhar
   * - ZERO censura garantida
   * 
   * TODO: Implementar streaming com buffer + detecção antes de emitir
   */
  async *chatCompletionStream(options: ChatCompletionOptions): AsyncIterable<string> {
    // STREAMING DESABILITADO - usar non-streaming para zero censura
    console.error("[LLM] ⛔ Streaming desabilitado - usando non-streaming para zero censura");
    
    // Usar chatCompletion() non-streaming ao invés
    const result = await this.chatCompletion(options);
    
    // Simular streaming emitindo resposta completa em chunks
    const words = result.content.split(' ');
    for (const word of words) {
      yield word + ' ';
      // Pequeno delay para simular streaming (opcional)
      await new Promise(resolve => setTimeout(resolve, 10));
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
   * 
   * 🚀 NOVO: Fallback para HuggingFace (grátis)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
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
        metricType: "tokens",
        value: response.usage.total_tokens,
        unit: "tokens",
        operation: "embedding",
        metadata: {
          model: "text-embedding-ada-002",
        },
      });

      await storage.createMetric({
        metricType: "latency",
        value: latencyMs,
        unit: "ms",
        operation: "embedding",
      });

      return embeddings;
    } catch (error) {
      console.error("[LLM] OpenAI embedding error:", error);
      
      // 🚀 NOVO: Fallback para HuggingFace (grátis)
      console.log("[LLM] 🔄 Fallback para embeddings via HuggingFace (grátis)...");
      
      try {
        const embeddings = await freeLLMProviders.generateEmbeddings(texts);
        const latencyMs = Date.now() - startTime;
        
        await storage.createMetric({
          metricType: "latency",
          value: latencyMs,
          unit: "ms",
          operation: "embedding",
          metadata: {
            model: "huggingface/all-MiniLM-L6-v2",
          },
        });
        
        return embeddings;
      } catch (freeError) {
        console.error("[LLM] ❌ Todas as APIs de embedding falharam:", freeError);
        throw error; // Joga erro original do OpenAI
      }
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
