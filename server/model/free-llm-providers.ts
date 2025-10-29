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
  daily: number;
  limit: number;
  lastReset: Date;
}

export class FreeLLMProviders {
  private openrouter: OpenAI | null = null;
  private groq: Groq | null = null;
  private gemini: GoogleGenerativeAI | null = null;
  private hf: HfInference | null = null;

  // Limites diários gratuitos
  private usage = {
    openrouter: { daily: 0, limit: 50, lastReset: new Date() } as ProviderUsage, // 50 req/dia grátis (1000 com $10+ créditos)
    groq: { daily: 0, limit: 14400, lastReset: new Date() } as ProviderUsage,
    gemini: { daily: 0, limit: 1500, lastReset: new Date() } as ProviderUsage,
    hf: { daily: 0, limit: 720, lastReset: new Date() } as ProviderUsage,
  };

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    console.log("[Free LLM] 🔍 Verificando API Keys disponíveis...");
    console.log("[Free LLM] DEBUG - process.env keys:", Object.keys(process.env).filter(k => k.includes('API_KEY') || k.includes('KEY')));
    
    // OpenRouter API (400+ modelos via único endpoint)
    const openrouterKey = process.env.OPEN_ROUTER_API_KEY;
    console.log(`[Free LLM] DEBUG - OPEN_ROUTER_API_KEY: ${openrouterKey ? `[PRESENTE - ${openrouterKey.substring(0, 10)}...]` : '[NÃO ENCONTRADA]'}`);
    if (openrouterKey) {
      this.openrouter = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: openrouterKey,
        defaultHeaders: {
          "HTTP-Referer": "https://aion.replit.dev",
          "X-Title": "AION - AI Suprema",
        },
      });
      console.log("[Free LLM] ✓ OpenRouter API inicializada (50 req/dia grátis, 400+ modelos)");
    } else {
      console.warn("[Free LLM] ⚠️  OPEN_ROUTER_API_KEY não encontrada");
    }

    // Groq API
    const groqKey = process.env.GROQ_API_KEY;
    console.log(`[Free LLM] DEBUG - GROQ_API_KEY: ${groqKey ? `[PRESENTE - ${groqKey.substring(0, 10)}...]` : '[NÃO ENCONTRADA]'}`);
    if (groqKey) {
      this.groq = new Groq({ apiKey: groqKey });
      console.log("[Free LLM] ✓ Groq API inicializada (14.4k req/dia)");
    } else {
      console.warn("[Free LLM] ⚠️  GROQ_API_KEY não encontrada");
    }

    // Gemini API
    const geminiKey = process.env.GEMINI_API_KEY;
    console.log(`[Free LLM] DEBUG - GEMINI_API_KEY: ${geminiKey ? `[PRESENTE - ${geminiKey.substring(0, 10)}...]` : '[NÃO ENCONTRADA]'}`);
    if (geminiKey) {
      this.gemini = new GoogleGenerativeAI(geminiKey);
      console.log("[Free LLM] ✓ Gemini API inicializada (1.5k req/dia)");
    } else {
      console.warn("[Free LLM] ⚠️  GEMINI_API_KEY não encontrada");
    }

    // HuggingFace API
    const hfKey = process.env.HUGGINGFACE_API_KEY;
    console.log(`[Free LLM] DEBUG - HUGGINGFACE_API_KEY: ${hfKey ? `[PRESENTE - ${hfKey.substring(0, 10)}...]` : '[NÃO ENCONTRADA]'}`);
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
        usage.daily = 0;
        usage.lastReset = now;
        console.log(`[Free LLM] Reset ${provider} usage counter`);
      }
    }
  }

  /**
   * Verifica se provider tem créditos disponíveis
   */
  private hasCredits(provider: keyof typeof this.usage): boolean {
    const usage = this.usage[provider];
    return usage.daily < usage.limit;
  }

  /**
   * Incrementa contador de uso
   */
  private incrementUsage(provider: keyof typeof this.usage): void {
    this.usage[provider].daily++;
  }

  /**
   * Retorna status de todos os providers
   */
  getStatus() {
    this.resetDailyUsageIfNeeded();
    
    return {
      openrouter: {
        available: this.openrouter !== null && this.hasCredits('openrouter'),
        used: this.usage.openrouter.daily,
        limit: this.usage.openrouter.limit,
        remaining: this.usage.openrouter.limit - this.usage.openrouter.daily,
      },
      groq: {
        available: this.groq !== null && this.hasCredits('groq'),
        used: this.usage.groq.daily,
        limit: this.usage.groq.limit,
        remaining: this.usage.groq.limit - this.usage.groq.daily,
      },
      gemini: {
        available: this.gemini !== null && this.hasCredits('gemini'),
        used: this.usage.gemini.daily,
        limit: this.usage.gemini.limit,
        remaining: this.usage.gemini.limit - this.usage.gemini.daily,
      },
      hf: {
        available: this.hf !== null && this.hasCredits('hf'),
        used: this.usage.hf.daily,
        limit: this.usage.hf.limit,
        remaining: this.usage.hf.limit - this.usage.hf.daily,
      },
    };
  }

  /**
   * OpenRouter Chat Completion (DeepSeek R1:free ou outro modelo grátis)
   */
  private async openrouterChat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    if (!this.openrouter) throw new Error("OpenRouter not initialized");
    
    const startTime = Date.now();
    
    // Usar modelo GRATUITO do OpenRouter (DeepSeek R1 é um dos melhores free)
    // Lista completa: https://openrouter.ai/models?q=free
    const completion = await this.openrouter.chat.completions.create({
      model: "deepseek/deepseek-r1:free", // Modelo grátis, MIT licensed, excelente para coding
      messages: messages.map(m => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 2048,
    });

    this.incrementUsage('openrouter');

    const choice = completion.choices[0];
    const usage = completion.usage!;

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
   * Groq Chat Completion (Llama 3.1 70B)
   */
  private async groqChat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    if (!this.groq) throw new Error("Groq not initialized");
    
    const startTime = Date.now();
    
    const completion = await this.groq.chat.completions.create({
      model: "llama-3.1-70b-versatile",
      messages: messages.map(m => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      temperature: 0.7,
      max_tokens: 2048,
    });

    this.incrementUsage('groq');

    const choice = completion.choices[0];
    const usage = completion.usage!;

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
   * Gemini Chat Completion (Gemini 1.5 Flash)
   */
  private async geminiChat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    if (!this.gemini) throw new Error("Gemini not initialized");
    
    const startTime = Date.now();
    
    const model = this.gemini.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    // Converter mensagens para formato Gemini
    const lastMessage = messages[messages.length - 1];
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    const response = result.response;

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
   * HuggingFace Chat Completion (Mistral 7B Instruct)
   */
  private async hfChat(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    if (!this.hf) throw new Error("HuggingFace not initialized");
    
    const startTime = Date.now();
    
    // Formatar mensagens como prompt único
    const prompt = messages.map(m => {
      if (m.role === "system") return `<s>[INST] ${m.content} [/INST]`;
      if (m.role === "user") return `<s>[INST] ${m.content} [/INST]`;
      if (m.role === "assistant") return m.content;
      return "";
    }).join("\n");

    const response = await this.hf.textGeneration({
      model: "mistralai/Mistral-7B-Instruct-v0.2",
      inputs: prompt,
      parameters: {
        max_new_tokens: 2048,
        temperature: 0.7,
        top_p: 0.9,
        return_full_text: false,
      },
    });

    this.incrementUsage('hf');

    return {
      content: response.generated_text,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      finishReason: "stop",
      latencyMs: Date.now() - startTime,
      costUsd: 0, // GRÁTIS! 🎉
    };
  }

  /**
   * Chat Completion com Fallback Automático
   * 
   * Ordem de tentativa:
   * 1. OpenRouter (400+ modelos, DeepSeek R1:free, 50/dia)
   * 2. Groq (mais rápido, Llama 3.1 70B, 14.4k/dia)
   * 3. Gemini (Google, Gemini 1.5 Flash, 1.5k/dia)
   * 4. HuggingFace (backup, Mistral 7B, 720/dia)
   */
  async chatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    this.resetDailyUsageIfNeeded();

    const errors: string[] = [];

    // 1. Tentar OpenRouter primeiro (400+ modelos, muito versátil)
    if (this.openrouter && this.hasCredits('openrouter')) {
      try {
        console.log("[Free LLM] → Usando OpenRouter (DeepSeek R1:free)");
        return await this.openrouterChat(messages);
      } catch (error: any) {
        errors.push(`OpenRouter: ${error.message}`);
        console.warn("[Free LLM] ⚠️  OpenRouter falhou:", error.message);
      }
    }

    // 2. Fallback para Groq (mais rápido e maior limite)
    if (this.groq && this.hasCredits('groq')) {
      try {
        console.log("[Free LLM] → Fallback para Groq (Llama 3.1 70B)");
        return await this.groqChat(messages);
      } catch (error: any) {
        errors.push(`Groq: ${error.message}`);
        console.warn("[Free LLM] ⚠️  Groq falhou:", error.message);
      }
    }

    // 3. Fallback para Gemini
    if (this.gemini && this.hasCredits('gemini')) {
      try {
        console.log("[Free LLM] → Fallback para Gemini (1.5 Flash)");
        return await this.geminiChat(messages);
      } catch (error: any) {
        errors.push(`Gemini: ${error.message}`);
        console.warn("[Free LLM] ⚠️  Gemini falhou:", error.message);
      }
    }

    // 4. Fallback para HuggingFace
    if (this.hf && this.hasCredits('hf')) {
      try {
        console.log("[Free LLM] → Fallback para HuggingFace (Mistral 7B)");
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
}

// Singleton instance
export const freeLLMProviders = new FreeLLMProviders();
