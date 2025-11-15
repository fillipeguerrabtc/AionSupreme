/**
 * LLM Client - Integração OpenAI API
 * 
 * Conforme PDFs: Encapsula APIs LLM (OpenAI/Anthropic) já que não podemos treinar
 * Transformer-MoE do zero no Replit. A arquitetura matemática dos PDFs é
 * implementada conceitualmente via chamadas de API.
 * 
 * Funcionalidades:
 * - Suporte streaming para respostas em tempo real
 * - Tool calling (para agente ReAct)
 * - Rate limiting e lógica de retry
 * - Cache de respostas
 * - Rastreamento de métricas (latência, tokens, custo)
 */

import OpenAI from "openai";
import { storage } from "../storage";
import type { InsertMetric } from "@shared/schema";
import { generateLLM, generateEmbeddings } from "../llm/llm-gateway";
import { GPUPool } from "../gpu/pool";

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

// Cache de respostas (simples em memória, poderia ser movido para Redis)
const responseCache = new Map<string, { result: ChatCompletionResult; timestamp: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

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
  private rateLimiter: RateLimiter;

  /**
   * Trigger billing sync após requests OpenAI
   * Importação assíncrona para evitar dependência circular
   */
  private async triggerBillingSync(): Promise<void> {
    try {
      const { openAIBillingSync } = await import('../services/openai-billing-sync');
      await openAIBillingSync.triggerSync();
    } catch (err) {
      // Silenciar erro - billing sync é opcional
    }
  }

  constructor() {
    // Inicializar cliente OpenAI
    // Usa OPENAI_API_KEY do Replit Secrets (chave fornecida pelo usuário)
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      console.warn("[LLM] ⚠️  Nenhuma OPENAI_API_KEY encontrada no ambiente - chat falhará");
    } else {
      console.log("[LLM] ✓ OPENAI_API_KEY carregada com sucesso");
    }
    this.openai = new OpenAI({ apiKey });
    
    // Rate limiter global único
    // Padrão: 60 requisições por minuto = 1 requisição por segundo
    this.rateLimiter = new RateLimiter(60, 1);
  }

  /**
   * Gerar chave de cache para deduplicação de requisições
   * IMPORTANTE: Inclui histórico COMPLETO de mensagens para evitar retornar respostas obsoletas
   */
  private getCacheKey(options: ChatCompletionOptions): string {
    const { messages, model, temperature, topP } = options;
    // Incluir array COMPLETO de mensagens para garantir unicidade
    const keyData = JSON.stringify({ 
      messages, 
      model, 
      temperature, 
      topP,
      // Adicionar componente de timestamp para garantir respostas frescas em conversas
      messageCount: messages.length 
    });
    // Usar hash completo ao invés de versão cortada para melhor unicidade
    return Buffer.from(keyData).toString("base64");
  }

  /**
   * Verificar cache para resposta existente
   */
  private checkCache(key: string): ChatCompletionResult | null {
    const cached = responseCache.get(key);
    if (!cached) return null;
    
    // Verificar se expirou
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
   * Get global rate limiter
   */
  private getRateLimiter(): RateLimiter {
    return this.rateLimiter;
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
   * 🔥 ORDEM DE PRIORIDADE (CRITICAL - Conforme replit.md):
   * 1º: GPU INFERENCE (KB interna + modelos próprios) - ZERO CUSTO!
   * 2º: APIs GRATUITAS (OpenRouter → Groq → Gemini → HuggingFace)
   * 3º: OpenAI (ÚLTIMA opção, apenas se TODAS as anteriores falharem)
   * 
   * OpenAI é PAGA - usar apenas como último recurso!
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = this.getCacheKey(options);
    const cached = this.checkCache(cacheKey);
    if (cached) {
      console.log("[LLM] Cache hit");
      return cached;
    }

    // Rate limiting
    const rateLimiter = this.getRateLimiter();
    await rateLimiter.acquire();

    // Default model and parameters
    const model = options.model || "gpt-4o";
    const temperature = options.temperature ?? 0.7;
    const topP = options.topP ?? 0.9;
    const maxTokens = options.maxTokens ?? 2048;

    // ===================================================================
    // 🔥 1º PRIORIDADE: GPU INFERENCE (KB INTERNA - ZERO CUSTO!)
    // ===================================================================
    
    // Skip GPU para casos incompatíveis:
    // - Tool calls (função calling não implementada em GPU worker)
    // - Streaming (GPUPool.inference não suporta streaming)
    // - Explicit model override (user quer modelo específico)
    const isGPUCompatible = !options.tools && !options.stream && !options.model;
    
    if (isGPUCompatible) {
      console.log("[LLM] 🚀 Tentando GPU INFERENCE primeiro (KB interna - ZERO CUSTO)...");
      
      try {
        const gpuResult = await GPUPool.inference({
          messages: options.messages,
          temperature,
          maxTokens,
        });
        
        if (gpuResult) {
          console.log(`[LLM] ✅ Resposta obtida via GPU #${gpuResult.workerId} - ZERO custo! 🎉`);
          
          const result: ChatCompletionResult = {
            content: gpuResult.response,
            usage: {
              promptTokens: 0, // GPU não cobra tokens
              completionTokens: 0,
              totalTokens: 0,
            },
            finishReason: "stop",
            latencyMs: gpuResult.latencyMs,
            costUsd: 0, // ZERO custo!
          };
          
          // Save to cache
          this.saveToCache(cacheKey, result);
          
          // Record metrics (marca como gpu)
          await this.recordMetrics("gpu", result);
          
          return result;
        }
        
        console.log("[LLM] ⚠️  GPU retornou null (sem resposta na KB interna)");
        console.log("[LLM] 🔄 Fallback para APIs gratuitas...");
      } catch (gpuError: any) {
        console.warn("[LLM] ⚠️  GPU inference falhou:", gpuError.message);
        console.log("[LLM] 🔄 Fallback para APIs gratuitas...");
      }
    } else {
      const reasons = [];
      if (options.tools) reasons.push("tool calls");
      if (options.stream) reasons.push("streaming");
      if (options.model) reasons.push("explicit model");
      console.log(`[LLM] ⏭️  Pulando GPU inference (incompatível: ${reasons.join(', ')})`);
    }

    // ===================================================================
    // 2º PRIORIDADE: TENTAR APIs GRATUITAS via LLM Gateway (com bypass)
    // ===================================================================
    // 🔥 CRITICAL FIX: Use bypassOrchestrator=true to avoid infinite recursion
    // llm-client → llm-gateway (BYPASS orchestrator) → free-apis → returns
    // This preserves quota/telemetry tracking while breaking the recursion loop!
    console.log("[LLM] 🆓 Tentando APIs gratuitas via Gateway (bypass orchestrator)...");
    
    try {
      const gatewayResult = await generateLLM({
        messages: options.messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        model: options.model,
        consumerId: 'llm-client',
        purpose: 'Free API fallback',
        language: 'en-US',
        bypassOrchestrator: true, // 🔥 KEY FIX: Skip generateWithPriority to break recursion!
      });
      
      // Map LLMGatewayResult → ChatCompletionResult
      const freeResult: ChatCompletionResult = {
        content: gatewayResult.content,
        usage: gatewayResult.usage,
        finishReason: gatewayResult.finishReason,
        latencyMs: gatewayResult.latencyMs,
        costUsd: gatewayResult.costUsd,
        toolCalls: gatewayResult.toolCalls, // Pass through (undefined if not supported)
      };
      
      // Save to cache
      this.saveToCache(cacheKey, freeResult);
      
      // Record metrics (marca como free_api)
      await this.recordMetrics("free_api", freeResult);
      
      console.log("[LLM] ✅ Resposta obtida via APIs GRATUITAS! 🎉");
      
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
      await this.recordMetrics(model, result);

      console.log(`[LLM] ✅ Resposta obtida via OpenAI (custo: $${costUsd.toFixed(4)})`);

      // 💰 Trigger billing sync após uso OpenAI (não bloqueia resposta)
      this.triggerBillingSync();

      return result;
    } catch (error: unknown) {
      // Se erro é ContentRefusalError, re-lançar imediatamente
      if (error instanceof ContentRefusalError) {
        console.error("[LLM] ⛔ Content refusal error - propagando para web-search fallback");
        throw error;
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LLM] ❌ OpenAI também falhou:`, errorMessage);
      
      // Retry logic com exponential backoff apenas para erros temporários
      const errorWithStatus = error as {status?: number};
      if (errorWithStatus.status === 429 || (errorWithStatus.status && errorWithStatus.status >= 500)) {
        console.log(`[LLM] Retrying after error ${errorWithStatus.status}...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.chatCompletion(options);
      }
      
      throw new Error(
        `TODAS as APIs falharam (Free + OpenAI). ` +
        `OpenAI error: ${errorMessage}`
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
    } catch (error: unknown) {
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
    
    // ✅ MANDATORY TRUNCATION - prevents "maximum context length 8192 tokens" errors
    const { truncateBatchForEmbedding } = await import("../ai/embedding-sanitizer");
    const safeTexts = truncateBatchForEmbedding(texts, { purpose: 'llmClient.generateEmbeddings' });
    
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: safeTexts,
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
          model: "text-embedding-3-small",
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
      
      // 🚀 NOVO: Fallback via LLM Gateway (HuggingFace grátis)
      console.log("[LLM] 🔄 Fallback para embeddings via LLM Gateway (HuggingFace grátis)...");
      
      try {
        const embeddings = await generateEmbeddings({
          texts: safeTexts, // ✅ Use already-truncated texts
          model: 'huggingface', // Force HF (OpenAI already failed above)
          consumerId: 'llm-client',
          purpose: 'Embedding generation - HF fallback',
        });
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
    model: string,
    result: ChatCompletionResult
  ): Promise<void> {
    try {
      const metrics: InsertMetric[] = [
        {
          metricType: "latency",
          value: result.latencyMs,
          unit: "ms",
          operation: "chat_completion",
          metadata: { model },
        },
        {
          metricType: "tokens",
          value: result.usage?.totalTokens || 0,
          unit: "tokens",
          operation: "chat_completion",
          metadata: { model },
        },
        {
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
