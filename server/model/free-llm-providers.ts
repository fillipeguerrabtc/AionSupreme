/**
 * Free LLM Providers - 100% Grátis!
 * 
 * Implementa fallback automático entre APIs gratuitas:
 * 1. Groq (14,400 req/dia = ~432k req/mês)
 * 2. Gemini (1,500 req/dia = ~45k req/mês)
 * 3. HuggingFace (~720 req/dia = ~21.6k req/mês)
 * 
 * TOTAL: ~500k requisições/mês GRÁTIS!
 * 
 * Documentação: docs/FREE_GPU_API_STRATEGY.md
 */

import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { HfInference } from "@huggingface/inference";
import type { ChatMessage, ChatCompletionResult } from "./llm-client";

interface ProviderUsage {
  daily: number;
  limit: number;
  lastReset: Date;
}

export class FreeLLMProviders {
  private groq: Groq | null = null;
  private gemini: GoogleGenerativeAI | null = null;
  private hf: HfInference | null = null;

  // Limites diários gratuitos
  private usage = {
    groq: { daily: 0, limit: 14400, lastReset: new Date() } as ProviderUsage,
    gemini: { daily: 0, limit: 1500, lastReset: new Date() } as ProviderUsage,
    hf: { daily: 0, limit: 720, lastReset: new Date() } as ProviderUsage,
  };

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
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
   * 1. Groq (mais rápido, 14.4k/dia)
   * 2. Gemini (bom, 1.5k/dia)
   * 3. HuggingFace (backup, 720/dia)
   */
  async chatCompletion(messages: ChatMessage[]): Promise<ChatCompletionResult> {
    this.resetDailyUsageIfNeeded();

    const errors: string[] = [];

    // 1. Tentar Groq primeiro (mais rápido e maior limite)
    if (this.groq && this.hasCredits('groq')) {
      try {
        console.log("[Free LLM] → Usando Groq (Llama 3.1 70B)");
        return await this.groqChat(messages);
      } catch (error: any) {
        errors.push(`Groq: ${error.message}`);
        console.warn("[Free LLM] ⚠️  Groq falhou:", error.message);
      }
    }

    // 2. Fallback para Gemini
    if (this.gemini && this.hasCredits('gemini')) {
      try {
        console.log("[Free LLM] → Fallback para Gemini (1.5 Flash)");
        return await this.geminiChat(messages);
      } catch (error: any) {
        errors.push(`Gemini: ${error.message}`);
        console.warn("[Free LLM] ⚠️  Gemini falhou:", error.message);
      }
    }

    // 3. Fallback para HuggingFace
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
