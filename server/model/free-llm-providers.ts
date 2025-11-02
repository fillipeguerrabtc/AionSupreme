/**
 * Free LLM Providers - 100% Grátis!
 * 
 * Implementa fallback automático entre APIs gratuitas:
 * 1. OpenRouter (50-1000 req/dia, DeepSeek R1, Llama 4, Gemini, etc.)
 * 2. Groq (14,400 req/dia = ~432k req/mês, Llama 3.1 70B)
 * 3. Gemini (1,500 req/dia = ~45k req/mês, Gemini 1.5 Flash)
 * 4. HuggingFace (~720 req/dia = ~21.6k req/mês, Mistral 7B)
 * 
 * TOTAL: ~500k+ requisições/mês GRÁTIS!
 * 
 * Documentação: docs/FREE_GPU_API_STRATEGY.md
 */

import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HfInference } from "@huggingface/inference";
import OpenAI from "openai";
import type { ChatMessage, ChatCompletionResult } from "./llm-client";

interface ProviderUsage {
  requests: number;     // Número de requisições (para limites)
  tokens: number;       // Tokens consumidos (para monitoramento)
  requestLimit: number; // Limite de requisições por dia
  lastReset: Date;
}

export class FreeLLMProviders {
  private openrouter: OpenAI | null = null;
  private groq: Groq | null = null;
  private gemini: GoogleGenerativeAI | null = null;
  private hf: HfInference | null = null;

  // Limites diários gratuitos (baseados em REQUISIÇÕES, não tokens)
  private usage = {
    openrouter: { requests: 0, tokens: 0, requestLimit: 50, lastReset: new Date() } as ProviderUsage, // 50 req/dia grátis
    groq: { requests: 0, tokens: 0, requestLimit: 14400, lastReset: new Date() } as ProviderUsage,    // 14.4k req/dia
    gemini: { requests: 0, tokens: 0, requestLimit: 1500, lastReset: new Date() } as ProviderUsage,   // 1.5k req/dia
    hf: { requests: 0, tokens: 0, requestLimit: 720, lastReset: new Date() } as ProviderUsage,        // 720 req/dia
  };

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // SECURITY: NEVER log API keys or key prefixes - they can be used for brute-force attacks
    console.log("[Free LLM] 🔍 Initializing free API providers...");
    
    // OpenRouter API (400+ modelos via único endpoint)
    const openrouterKey = process.env.OPEN_ROUTER_API_KEY;
    if (openrouterKey) {
      this.openrouter = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: openrouterKey,
        defaultHeaders: {
          "HTTP-Referer": "https://aion.replit.dev",
          "X-Title": "AION - Autonomous AI System",
        },
      });
      console.log("[Free LLM] ✓ OpenRouter API inicializada (50 req/dia grátis, 400+ modelos)");
    } else {
      console.warn("[Free LLM] ⚠️  OPEN_ROUTER_API_KEY não encontrada");
    }

    // Groq API
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      this.groq = new Groq({ apiKey: groqKey });
      console.log("[Free LLM] ✓ Groq API inicializada (14.4k req/dia)");
    } else {
      console.warn("[Free LLM] ⚠️  GROQ_API_KEY não encontrada");
    }

    // Gemini API
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      this.gemini = new GoogleGenerativeAI(geminiKey);
      console.log("[Free LLM] ✓ Gemini API inicializada (1.5k req/dia)");
    } else {
      console.warn("[Free LLM] ⚠️  GEMINI_API_KEY não encontrada");
    }

    // HuggingFace API
    const hfKey = process.env.HUGGINGFACE_API_KEY;
    if (hfKey) {
      this.hf = new HfInference(hfKey);
      console.log("[Free LLM] ✓ HuggingFace API inicializada (~720 req/dia)");
    } else {
      console.warn("[Free LLM] ⚠️  HUGGINGFACE_API_KEY não encontrada");
    }
    
    // Resumo final
    const initialized = [
      this.openrouter ? 'OpenRouter' : null,
      this.groq ? 'Groq' : null,
      this.gemini ? 'Gemini' : null,
      this.hf ? 'HuggingFace' : null,
    ].filter(Boolean);
    
    if (initialized.length > 0) {
      console.log(`[Free LLM] ✅ ${initialized.length} APIs inicializadas: ${initialized.join(', ')}`);
    } else {
      console.error("[Free LLM] ❌ NENHUMA API gratuita foi inicializada! Adicione as keys nos Secrets do Replit.");
    }
  }

  /**
   * Reseta contadores diários
   */
  private resetDailyUsageIfNeeded(): void {
    const now = new Date();
    
    for (const [provider, usage] of Object.entries(this.usage)) {
      const hoursSinceReset = (now.getTime() - usage.lastReset.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceReset >= 24) {
        usage.requests = 0;
        usage.tokens = 0;
        usage.lastReset = now;
        console.log(`[Free LLM] Reset ${provider} usage counters (requests + tokens)`);
      }
    }
  }

  /**
   * Verifica se provider tem créditos disponíveis (baseado em REQUISIÇÕES)
   */
  private hasCredits(provider: keyof typeof this.usage): boolean {
    const usage = this.usage[provider];
    return usage.requests < usage.requestLimit;
  }

  /**
   * Incrementa contadores de uso (requisições + tokens)
   */
  private incrementUsage(provider: keyof typeof this.usage, tokens: number = 0): void {
    this.usage[provider].requests++;  // Sempre incrementa requisições
    this.usage[provider].tokens += tokens;  // Adiciona tokens consumidos
  }

  /**
   * Retorna status de todos os providers
   * 
   * Retorna ambos formatos para compatibilidade retroativa:
   * - `used`/`limit`: campos legados (requisições)
   * - `requests`/`tokens`/`requestLimit`: campos novos (métricas separadas)
   */
  getStatus() {
    this.resetDailyUsageIfNeeded();
    
    return {
      openrouter: {
        available: this.openrouter !== null && this.hasCredits('openrouter'),
        used: this.usage.openrouter.requests,        // Campo legado (alias para requests)
        limit: this.usage.openrouter.requestLimit,   // Campo legado (alias para requestLimit)
        requests: this.usage.openrouter.requests,    // Novo: contador de requisições
        tokens: this.usage.openrouter.tokens,        // Novo: contador de tokens
        requestLimit: this.usage.openrouter.requestLimit,
        remaining: this.usage.openrouter.requestLimit - this.usage.openrouter.requests,
      },
      groq: {
        available: this.groq !== null && this.hasCredits('groq'),
        used: this.usage.groq.requests,              // Campo legado (alias para requests)
        limit: this.usage.groq.requestLimit,         // Campo legado (alias para requestLimit)
        requests: this.usage.groq.requests,          // Novo: contador de requisições
        tokens: this.usage.groq.tokens,              // Novo: contador de tokens
        requestLimit: this.usage.groq.requestLimit,
        remaining: this.usage.groq.requestLimit - this.usage.groq.requests,
      },
      gemini: {
        available: this.gemini !== null && this.hasCredits('gemini'),
        used: this.usage.gemini.requests,            // Campo legado (alias para requests)
        limit: this.usage.gemini.requestLimit,       // Campo legado (alias para requestLimit)
        requests: this.usage.gemini.requests,        // Novo: contador de requisições
        tokens: this.usage.gemini.tokens,            // Novo: contador de tokens
        requestLimit: this.usage.gemini.requestLimit,
        remaining: this.usage.gemini.requestLimit - this.usage.gemini.requests,
      },
      hf: {
        available: this.hf !== null && this.hasCredits('hf'),
        used: this.usage.hf.requests,                // Campo legado (alias para requests)
        limit: this.usage.hf.requestLimit,           // Campo legado (alias para requestLimit)
        requests: this.usage.hf.requests,            // Novo: contador de requisições
        tokens: this.usage.hf.tokens,                // Novo: contador de tokens
        requestLimit: this.usage.hf.requestLimit,
        remaining: this.usage.hf.requestLimit - this.usage.hf.requests,
      },
    };
  }

  /**
   * OpenRouter Chat Completion (Llama 4 Scout:free - ATUALIZADO 2025)
   */
  private async openrouterChat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    if (!this.openrouter) throw new Error("OpenRouter not initialized");
    
    const startTime = Date.now();
    
    // ATUALIZADO (Out 2025): Llama 4 Scout é mais estável que DeepSeek R1
    // Alternativas free: meta-llama/llama-4-maverick:free, google/gemini-2.0-flash-exp:free
    // Lista completa: https://openrouter.ai/models?q=free
    const completion = await this.openrouter.chat.completions.create({
      model: "meta-llama/llama-4-scout:free", // Modelo grátis Meta, geral purpose, 50 req/dia
      messages: messages.map(m => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 2048,
    });

    const choice = completion.choices[0];
    const usage = completion.usage!;

    this.incrementUsage('openrouter', usage.total_tokens);

    return {
      content: choice.message.content || "",
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
      finishReason: choice.finish_reason as string,
      latencyMs: Date.now() - startTime,
      costUsd: 0, // GRÁTIS! 🎉
    };
  }

  /**
   * Groq Chat Completion (Llama 3.3 70B - ATUALIZADO 2025)
   */
  private async groqChat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    if (!this.groq) throw new Error("Groq not initialized");
    
    const startTime = Date.now();
    
    // ATUALIZADO (Out 2025): llama-3.1-70b-versatile DEPRECIADO em Jan 2025
    // llama-3.3-70b-versatile: mesmo preço, MELHOR performance (iguala Llama 405B)
    const completion = await this.groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: messages.map(m => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 2048,
    });

    const choice = completion.choices[0];
    const usage = completion.usage!;

    this.incrementUsage('groq', usage.total_tokens);

    return {
      content: choice.message.content || "",
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
      finishReason: choice.finish_reason,
      latencyMs: Date.now() - startTime,
      costUsd: 0, // GRÁTIS! 🎉
    };
  }

  /**
   * Gemini Chat Completion (Gemini 2.0 Flash Exp - ATUALIZADO 2025)
   */
  private async geminiChat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    if (!this.gemini) throw new Error("Gemini not initialized");
    
    const startTime = Date.now();
    
    // Edge case defensivo: conversa vazia (não deveria acontecer na prática)
    if (messages.length === 0) {
      console.warn("[Free LLM] ⚠️ Gemini recebeu conversa vazia - usando mensagem default");
      messages = [{ role: "user", content: "Hello" }];
    }
    
    // ATUALIZADO (Out 2025): Gemini 1.5 Flash DESCONTINUADO
    // gemini-2.0-flash-exp: novo modelo 2.0, experimental, FREE TIER (10 RPM, 250 RPD)
    const model = this.gemini.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    
    let response;
    
    // Se há apenas 1 mensagem, usar generateContent diretamente (sem histórico)
    if (messages.length === 1) {
      const result = await model.generateContent(messages[0].content);
      response = result.response;
    } else {
      // Converter mensagens para formato Gemini (com histórico)
      const lastMessage = messages[messages.length - 1];
      const history = messages.slice(0, -1).map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(lastMessage.content);
      response = result.response;
    }

    this.incrementUsage('gemini');

    return {
      content: response.text(),
      usage: {
        promptTokens: 0, // Gemini não retorna contagem de tokens na API grátis
        completionTokens: 0,
        totalTokens: 0,
      },
      finishReason: "stop",
      latencyMs: Date.now() - startTime,
      costUsd: 0, // GRÁTIS! 🎉
    };
  }

  /**
   * HuggingFace Chat Completion (Llama 3 8B Instruct - ATUALIZADO 2025)
   */
  private async hfChat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    if (!this.hf) throw new Error("HuggingFace not initialized");
    
    const startTime = Date.now();
    
    // ATUALIZADO (Out 2025): Usar chatCompletion API (OpenAI-compatible)
    // meta-llama/Meta-Llama-3-8B-Instruct suporta conversational
    // Alternativa: deepseek-ai/DeepSeek-V3-0324 (state-of-the-art free)
    const response = await this.hf.chatCompletion({
      model: "meta-llama/Meta-Llama-3-8B-Instruct",
      messages: messages.map(m => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      max_tokens: 2048,
      temperature: 0.7,
    });

    const choice = response.choices[0];
    const totalTokens = response.usage?.total_tokens || 0;
    
    this.incrementUsage('hf', totalTokens);
    
    return {
      content: choice.message.content || "",
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: totalTokens,
      },
      finishReason: choice.finish_reason || "stop",
      latencyMs: Date.now() - startTime,
      costUsd: 0, // GRÁTIS! 🎉
    };
  }

  /**
   * Chat Completion com Fallback Automático
   * 
   * 🆕 MODELOS ATUALIZADOS (Out 2025) - TODOS 100% GRATUITOS:
   * 1. OpenRouter (Llama 4 Scout:free, 50/dia)
   * 2. Groq (Llama 3.3 70B Versatile, 14.4k/dia)
   * 3. Gemini (Gemini 2.0 Flash Exp, 1.5k/dia)
   * 4. HuggingFace (Llama 3 8B Instruct, 720/dia)
   * 
   * TOTAL: ~16.7k requisições/dia GRÁTIS! 🎉
   */
  async chatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    this.resetDailyUsageIfNeeded();

    const errors: string[] = [];

    // 1. Tentar OpenRouter primeiro (Meta Llama 4 Scout)
    if (this.openrouter && this.hasCredits('openrouter')) {
      try {
        console.log("[Free LLM] → Usando OpenRouter (Llama 4 Scout:free)");
        return await this.openrouterChat(messages);
      } catch (error: any) {
        errors.push(`OpenRouter: ${error.message}`);
        console.warn("[Free LLM] ⚠️  OpenRouter falhou:", error.message);
      }
    }

    // 2. Fallback para Groq (Llama 3.3 70B - maior e mais rápido)
    if (this.groq && this.hasCredits('groq')) {
      try {
        console.log("[Free LLM] → Fallback para Groq (Llama 3.3 70B Versatile)");
        return await this.groqChat(messages);
      } catch (error: any) {
        errors.push(`Groq: ${error.message}`);
        console.warn("[Free LLM] ⚠️  Groq falhou:", error.message);
      }
    }

    // 3. Fallback para Gemini (Google 2.0 Flash Experimental)
    if (this.gemini && this.hasCredits('gemini')) {
      try {
        console.log("[Free LLM] → Fallback para Gemini (2.0 Flash Exp)");
        return await this.geminiChat(messages);
      } catch (error: any) {
        errors.push(`Gemini: ${error.message}`);
        console.warn("[Free LLM] ⚠️  Gemini falhou:", error.message);
      }
    }

    // 4. Último recurso: HuggingFace (Llama 3 8B)
    if (this.hf && this.hasCredits('hf')) {
      try {
        console.log("[Free LLM] → Fallback para HuggingFace (Llama 3 8B Instruct)");
        return await this.hfChat(messages);
      } catch (error: any) {
        errors.push(`HuggingFace: ${error.message}`);
        console.warn("[Free LLM] ⚠️  HuggingFace falhou:", error.message);
      }
    }

    // Todos falharam ou sem créditos
    const status = this.getStatus();
    throw new Error(
      `Todas as APIs gratuitas falharam ou sem créditos.\n` +
      `Status:\n` +
      `- OpenRouter: ${status.openrouter.remaining}/${status.openrouter.limit} restantes\n` +
      `- Groq: ${status.groq.remaining}/${status.groq.limit} restantes\n` +
      `- Gemini: ${status.gemini.remaining}/${status.gemini.limit} restantes\n` +
      `- HF: ${status.hf.remaining}/${status.hf.limit} restantes\n` +
      `Erros: ${errors.join(', ')}`
    );
  }

  /**
   * Gerar embeddings usando HuggingFace (grátis)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.hf) throw new Error("HuggingFace not initialized");

    console.log(`[Free LLM] Gerando embeddings para ${texts.length} textos via HF`);

    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.hf.featureExtraction({
        model: "sentence-transformers/all-MiniLM-L6-v2",
        inputs: text,
      });

      // HF retorna array ou número dependendo do modelo
      if (Array.isArray(embedding)) {
        embeddings.push(embedding as number[]);
      } else {
        throw new Error("Unexpected embedding format from HuggingFace");
      }
    }

    return embeddings;
  }

  /**
   * Get health status of all providers (for monitoring/health checks)
   */
  getHealthStatus() {
    return {
      openrouter: {
        configured: !!this.openrouter,
        available: this.hasCredits('openrouter'),
        used: this.usage.openrouter.daily,
        limit: this.usage.openrouter.limit,
        remaining: this.usage.openrouter.limit - this.usage.openrouter.daily,
      },
      groq: {
        configured: !!this.groq,
        available: this.hasCredits('groq'),
        used: this.usage.groq.daily,
        limit: this.usage.groq.limit,
        remaining: this.usage.groq.limit - this.usage.groq.daily,
      },
      gemini: {
        configured: !!this.gemini,
        available: this.hasCredits('gemini'),
        used: this.usage.gemini.daily,
        limit: this.usage.gemini.limit,
        remaining: this.usage.gemini.limit - this.usage.gemini.daily,
      },
      hf: {
        configured: !!this.hf,
        available: this.hasCredits('hf'),
        used: this.usage.hf.daily,
        limit: this.usage.hf.limit,
        remaining: this.usage.hf.limit - this.usage.hf.daily,
      },
    };
  }
}

// Singleton instance
export const freeLLMProviders = new FreeLLMProviders();
