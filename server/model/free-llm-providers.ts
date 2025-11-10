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
import { ENV } from "../utils/env";
import { apiQuotaRepository } from "../repositories/api-quota-repository";

export class FreeLLMProviders {
  private openrouter: OpenAI | null = null;
  private groq: Groq | null = null;
  private gemini: GoogleGenerativeAI | null = null;
  private hf: HfInference | null = null;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // SECURITY: NEVER log API keys or key prefixes - they can be used for brute-force attacks
    console.log("[Free LLM] 🔍 Initializing free API providers...");
    
    // 🔑 FASE 1 - ENV Padronizada (aceita OPEN_ROUTER_API_KEY ou OPENROUTER_API_KEY)
    if (ENV.OPENROUTER_API_KEY) {
      this.openrouter = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: ENV.OPENROUTER_API_KEY,
        defaultHeaders: {
          "HTTP-Referer": "https://aion.replit.dev",
          "X-Title": "AION - Autonomous AI System",
        },
      });
      console.log("[Free LLM] ✓ OpenRouter API inicializada (50 req/dia grátis, 400+ modelos)");
    } else {
      console.warn("[Free LLM] ⚠️  OPENROUTER_API_KEY não encontrada");
    }

    // Groq API
    if (ENV.GROQ_API_KEY) {
      this.groq = new Groq({ apiKey: ENV.GROQ_API_KEY });
      console.log("[Free LLM] ✓ Groq API inicializada (14.4k req/dia)");
    } else {
      console.warn("[Free LLM] ⚠️  GROQ_API_KEY não encontrada");
    }

    // Gemini API (aceita GEMINI_API_KEY ou GOOGLE_API_KEY)
    if (ENV.GOOGLE_API_KEY) {
      this.gemini = new GoogleGenerativeAI(ENV.GOOGLE_API_KEY);
      console.log("[Free LLM] ✓ Gemini API inicializada (1.5k req/dia)");
    } else {
      console.warn("[Free LLM] ⚠️  GOOGLE_API_KEY/GEMINI_API_KEY não encontrada");
    }

    // HuggingFace API (aceita HUGGINGFACE_API_KEY ou HF_API_KEY)
    if (ENV.HF_API_KEY) {
      this.hf = new HfInference(ENV.HF_API_KEY);
      console.log("[Free LLM] ✓ HuggingFace API inicializada (~720 req/dia)");
    } else {
      console.warn("[Free LLM] ⚠️  HF_API_KEY/HUGGINGFACE_API_KEY não encontrada");
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
   * Retorna status de todos os providers (PostgreSQL-backed)
   * Retorna ambos formatos para compatibilidade retroativa:
   * - `used`/`limit`: campos legados (requisições)
   * - `requests`/`tokens`/`requestLimit`: campos novos (métricas separadas)
   */
  async getStatus() {
    const dbStatus = await apiQuotaRepository.getStatus();
    
    // Merge with API initialization status
    return {
      openrouter: {
        ...dbStatus.openrouter,
        available: this.openrouter !== null && (dbStatus.openrouter?.available ?? false),
      },
      groq: {
        ...dbStatus.groq,
        available: this.groq !== null && (dbStatus.groq?.available ?? false),
      },
      gemini: {
        ...dbStatus.gemini,
        available: this.gemini !== null && (dbStatus.gemini?.available ?? false),
      },
      hf: {
        ...dbStatus.hf,
        available: this.hf !== null && (dbStatus.hf?.available ?? false),
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

    await apiQuotaRepository.incrementUsage('openrouter', 1, usage.total_tokens);

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

    await apiQuotaRepository.incrementUsage('groq', 1, usage.total_tokens);

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

    await apiQuotaRepository.incrementUsage('gemini', 1, 0);

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
    
    await apiQuotaRepository.incrementUsage('hf', 1, totalTokens);
    
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
    const errors: string[] = [];

    // 1. Tentar OpenRouter primeiro (Meta Llama 4 Scout)
    if (this.openrouter && await apiQuotaRepository.hasCredits('openrouter')) {
      try {
        console.log("[Free LLM] → Usando OpenRouter (Llama 4 Scout:free)");
        return await this.openrouterChat(messages);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`OpenRouter: ${errorMessage}`);
        console.warn("[Free LLM] ⚠️  OpenRouter falhou:", errorMessage);
      }
    }

    // 2. Fallback para Groq (Llama 3.3 70B - maior e mais rápido)
    if (this.groq && await apiQuotaRepository.hasCredits('groq')) {
      try {
        console.log("[Free LLM] → Fallback para Groq (Llama 3.3 70B Versatile)");
        return await this.groqChat(messages);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Groq: ${errorMessage}`);
        console.warn("[Free LLM] ⚠️  Groq falhou:", errorMessage);
      }
    }

    // 3. Fallback para Gemini (Google 2.0 Flash Experimental)
    if (this.gemini && await apiQuotaRepository.hasCredits('gemini')) {
      try {
        console.log("[Free LLM] → Fallback para Gemini (2.0 Flash Exp)");
        return await this.geminiChat(messages);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Gemini: ${errorMessage}`);
        console.warn("[Free LLM] ⚠️  Gemini falhou:", errorMessage);
      }
    }

    // 4. Último recurso: HuggingFace (Llama 3 8B)
    if (this.hf && await apiQuotaRepository.hasCredits('hf')) {
      try {
        console.log("[Free LLM] → Fallback para HuggingFace (Llama 3 8B Instruct)");
        return await this.hfChat(messages);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`HuggingFace: ${errorMessage}`);
        console.warn("[Free LLM] ⚠️  HuggingFace falhou:", errorMessage);
      }
    }

    // Todos falharam ou sem créditos
    const status = await this.getStatus();
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
  async getHealthStatus() {
    const dbStatus = await apiQuotaRepository.getStatus();
    
    return {
      openrouter: {
        configured: !!this.openrouter,
        available: await apiQuotaRepository.hasCredits('openrouter'),
        used: dbStatus.openrouter.requests,
        limit: dbStatus.openrouter.requestLimit,
        remaining: dbStatus.openrouter.remaining,
      },
      groq: {
        configured: !!this.groq,
        available: await apiQuotaRepository.hasCredits('groq'),
        used: dbStatus.groq.requests,
        limit: dbStatus.groq.requestLimit,
        remaining: dbStatus.groq.remaining,
      },
      gemini: {
        configured: !!this.gemini,
        available: await apiQuotaRepository.hasCredits('gemini'),
        used: dbStatus.gemini.requests,
        limit: dbStatus.gemini.requestLimit,
        remaining: dbStatus.gemini.remaining,
      },
      hf: {
        configured: !!this.hf,
        available: await apiQuotaRepository.hasCredits('hf'),
        used: dbStatus.hf.requests,
        limit: dbStatus.hf.requestLimit,
        remaining: dbStatus.hf.remaining,
      },
    };
  }
}

// Singleton instance
export const freeLLMProviders = new FreeLLMProviders();
