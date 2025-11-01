/**
 * VISION CASCADE - Sistema de fallback automático para Vision APIs
 * 
 * Cascata de prioridade:
 * 1. Gemini Vision (1.500 requisições/dia GRÁTIS)
 * 2. GPT-4V via OpenRouter (FREE tier)
 * 3. Claude 3 Haiku via OpenRouter (FREE tier)
 * 4. HuggingFace Vision (720 requisições/dia GRÁTIS)
 * 5. OpenAI GPT-4o Vision (PAGO - último recurso)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { HfInference } from "@huggingface/inference";
import OpenAI from "openai";
import { trackTokenUsage } from "../monitoring/token-tracker";

export type VisionProvider = 'gemini' | 'gpt4v-openrouter' | 'claude3-openrouter' | 'huggingface' | 'openai' | 'none';

export interface VisionResult {
  description: string;
  provider: VisionProvider;
  success: boolean;
  tokensUsed: number;
}

export class VisionCascade {
  private geminiKey: string | undefined;
  private openRouterKey: string | undefined;
  private hfKey: string | undefined;
  private openaiKey: string | undefined;
  
  private geminiQuota = { used: 0, limit: 1500, lastReset: Date.now() };
  private gpt4vQuota = { used: 0, limit: 50, lastReset: Date.now() }; // OpenRouter free tier
  private claude3Quota = { used: 0, limit: 50, lastReset: Date.now() }; // OpenRouter free tier
  private hfQuota = { used: 0, limit: 720, lastReset: Date.now() };

  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY;
    this.openRouterKey = process.env.OPEN_ROUTER_API_KEY;
    this.hfKey = process.env.HUGGINGFACE_API_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;
  }

  /**
   * Gera descrição de imagem usando cascade automático
   */
  async generateDescription(
    imageBuffer: Buffer,
    mimeType: string,
    alt?: string
  ): Promise<VisionResult> {
    const startTime = Date.now();
    
    // Reset quotas se necessário (a cada 24h)
    this.resetQuotasIfNeeded();

    // 1. Tenta Gemini primeiro (mais rápido e grátis)
    if (this.geminiKey && this.hasQuota('gemini')) {
      try {
        const result = await this.tryGemini(imageBuffer, mimeType, alt);
        console.log(`[VisionCascade] ✅ Gemini (${Date.now() - startTime}ms)`);
        return result;
      } catch (error: any) {
        console.warn(`[VisionCascade] ⚠️ Gemini falhou: ${error.message}`);
      }
    } else {
      console.log(`[VisionCascade] ⏭️ Gemini indisponível (${this.geminiQuota.used}/${this.geminiQuota.limit})`);
    }

    // 2. Fallback: GPT-4V via OpenRouter (FREE)
    if (this.openRouterKey && this.hasQuota('gpt4v-openrouter')) {
      try {
        const result = await this.tryGPT4VOpenRouter(imageBuffer, mimeType, alt);
        console.log(`[VisionCascade] ✅ GPT-4V OpenRouter (${Date.now() - startTime}ms)`);
        return result;
      } catch (error: any) {
        console.warn(`[VisionCascade] ⚠️ GPT-4V OpenRouter falhou: ${error.message}`);
      }
    } else {
      console.log(`[VisionCascade] ⏭️ GPT-4V OpenRouter indisponível (${this.gpt4vQuota.used}/${this.gpt4vQuota.limit})`);
    }

    // 3. Fallback: Claude 3 Haiku via OpenRouter (FREE)
    if (this.openRouterKey && this.hasQuota('claude3-openrouter')) {
      try {
        const result = await this.tryClaude3OpenRouter(imageBuffer, mimeType, alt);
        console.log(`[VisionCascade] ✅ Claude 3 OpenRouter (${Date.now() - startTime}ms)`);
        return result;
      } catch (error: any) {
        console.warn(`[VisionCascade] ⚠️ Claude 3 OpenRouter falhou: ${error.message}`);
      }
    } else {
      console.log(`[VisionCascade] ⏭️ Claude 3 OpenRouter indisponível (${this.claude3Quota.used}/${this.claude3Quota.limit})`);
    }

    // 4. Fallback: HuggingFace
    if (this.hfKey && this.hasQuota('huggingface')) {
      try {
        const result = await this.tryHuggingFace(imageBuffer, alt);
        console.log(`[VisionCascade] ✅ HuggingFace (${Date.now() - startTime}ms)`);
        return result;
      } catch (error: any) {
        console.warn(`[VisionCascade] ⚠️ HuggingFace falhou: ${error.message}`);
      }
    } else {
      console.log(`[VisionCascade] ⏭️ HuggingFace indisponível (${this.hfQuota.used}/${this.hfQuota.limit})`);
    }

    // 5. Último recurso: OpenAI GPT-4o (PAGO)
    if (this.openaiKey) {
      try {
        const result = await this.tryOpenAI(imageBuffer, mimeType, alt);
        console.log(`[VisionCascade] ✅ OpenAI Vision (${Date.now() - startTime}ms) - $$$`);
        return result;
      } catch (error: any) {
        console.error(`[VisionCascade] ❌ OpenAI falhou: ${error.message}`);
      }
    }

    // Todas falharam - retorna fallback sem provider hardcoded
    return {
      description: alt || 'Imagem sem descrição (todas APIs falharam)',
      provider: 'none', // No provider succeeded (don't hardcode fallback to 'gemini' or 'openai')
      success: false,
      tokensUsed: 0
    };
  }

  /**
   * Tenta Gemini Vision API
   */
  private async tryGemini(imageBuffer: Buffer, mimeType: string, alt?: string): Promise<VisionResult> {
    const startTime = Date.now();
    
    const prompt = `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`;

    const genAI = new GoogleGenerativeAI(this.geminiKey!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType
        }
      }
    ]);

    const text = result.response.text().trim();

    // Incrementa quota
    this.geminiQuota.used++;

    // Track usage
    const promptTokens = Math.ceil(prompt.length / 4);
    const imageTokens = Math.ceil(imageBuffer.length / 750);
    const completionTokens = Math.ceil(text.length / 4);
    const totalTokens = promptTokens + imageTokens + completionTokens;

    await trackTokenUsage({
      provider: 'gemini',
      model: 'gemini-2.0-flash-exp',
      requestType: 'image',
      promptTokens,
      completionTokens,
      totalTokens,
      cost: 0,
      success: true,
      metadata: {} as any
    });

    return {
      description: text,
      provider: 'gemini',
      success: true,
      tokensUsed: totalTokens
    };
  }

  /**
   * Tenta GPT-4V via OpenRouter (FREE tier)
   */
  private async tryGPT4VOpenRouter(imageBuffer: Buffer, mimeType: string, alt?: string): Promise<VisionResult> {
    const openrouter = new OpenAI({
      apiKey: this.openRouterKey!,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://aion.replit.app',
        'X-Title': 'AION Vision System'
      }
    });

    const base64Image = imageBuffer.toString('base64');

    const prompt = `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`;

    const response = await openrouter.chat.completions.create({
      model: 'openai/gpt-4-vision-preview:free',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 300
    } as any);

    const description = response.choices[0]?.message?.content || alt || 'Sem descrição';
    const tokensUsed = response.usage?.total_tokens || 0;

    // Incrementa quota
    this.gpt4vQuota.used++;

    // Track usage
    await trackTokenUsage({
      provider: 'openrouter',
      model: 'openai/gpt-4-vision-preview:free',
      requestType: 'image',
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: tokensUsed,
      cost: 0,
      success: true,
      metadata: {} as any
    });

    return {
      description,
      provider: 'gpt4v-openrouter',
      success: true,
      tokensUsed
    };
  }

  /**
   * Tenta Claude 3 Haiku via OpenRouter (FREE tier)
   * NOTA: Claude usa formato OpenAI-compatible via OpenRouter
   */
  private async tryClaude3OpenRouter(imageBuffer: Buffer, mimeType: string, alt?: string): Promise<VisionResult> {
    const openrouter = new OpenAI({
      apiKey: this.openRouterKey!,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://aion.replit.app',
        'X-Title': 'AION Vision System'
      }
    });

    const base64Image = imageBuffer.toString('base64');

    const prompt = `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`;

    // Claude via OpenRouter aceita formato OpenAI-compatible
    const response = await openrouter.chat.completions.create({
      model: 'anthropic/claude-3-haiku:free',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 300
    } as any);

    const description = response.choices[0]?.message?.content || alt || 'Sem descrição';
    const tokensUsed = response.usage?.total_tokens || 0;

    // Incrementa quota
    this.claude3Quota.used++;

    // Track usage
    await trackTokenUsage({
      provider: 'openrouter',
      model: 'anthropic/claude-3-haiku:free',
      requestType: 'image',
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: tokensUsed,
      cost: 0,
      success: true,
      metadata: {} as any
    });

    return {
      description,
      provider: 'claude3-openrouter',
      success: true,
      tokensUsed
    };
  }

  /**
   * Tenta HuggingFace Vision API
   */
  private async tryHuggingFace(imageBuffer: Buffer, alt?: string): Promise<VisionResult> {
    const hf = new HfInference(this.hfKey!);

    // Usa modelo de image-to-text
    const result = await hf.imageToText({
      data: imageBuffer,
      model: 'Salesforce/blip-image-captioning-large'
    });

    const description = result.generated_text || alt || 'Sem descrição';

    // Incrementa quota
    this.hfQuota.used++;

    // Track usage
    const tokensUsed = Math.ceil(description.length / 4);

    await trackTokenUsage({
      provider: 'huggingface',
      model: 'blip-image-captioning-large',
      requestType: 'image',
      promptTokens: 0,
      completionTokens: tokensUsed,
      totalTokens: tokensUsed,
      cost: 0,
      success: true,
      metadata: {} as any
    });

    return {
      description,
      provider: 'huggingface',
      success: true,
      tokensUsed
    };
  }

  /**
   * Tenta OpenAI Vision API (GPT-4 Vision)
   */
  private async tryOpenAI(imageBuffer: Buffer, mimeType: string, alt?: string): Promise<VisionResult> {
    const openai = new OpenAI({ apiKey: this.openaiKey! });

    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Descreva esta imagem em detalhes para indexação. ${alt ? `Contexto: "${alt}"` : ''}`
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl }
            }
          ]
        }
      ],
      max_tokens: 300
    });

    const description = response.choices[0]?.message?.content || alt || 'Sem descrição';
    const tokensUsed = response.usage?.total_tokens || 0;
    const cost = (response.usage?.total_tokens || 0) * 0.00003; // ~$0.03 per 1K tokens

    // Track usage
    await trackTokenUsage({
      provider: 'openai',
      model: 'gpt-4o',
      requestType: 'image',
      promptTokens: response.usage?.prompt_tokens || 0,
      completionTokens: response.usage?.completion_tokens || 0,
      totalTokens: tokensUsed,
      cost,
      success: true,
      metadata: {} as any
    });

    return {
      description,
      provider: 'openai',
      success: true,
      tokensUsed
    };
  }

  /**
   * Verifica se provider tem quota disponível
   */
  private hasQuota(provider: 'gemini' | 'gpt4v-openrouter' | 'claude3-openrouter' | 'huggingface'): boolean {
    let quota;
    switch (provider) {
      case 'gemini':
        quota = this.geminiQuota;
        break;
      case 'gpt4v-openrouter':
        quota = this.gpt4vQuota;
        break;
      case 'claude3-openrouter':
        quota = this.claude3Quota;
        break;
      case 'huggingface':
        quota = this.hfQuota;
        break;
    }
    return quota.used < quota.limit;
  }

  /**
   * Reset quotas a cada 24h
   */
  private resetQuotasIfNeeded(): void {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    if (now - this.geminiQuota.lastReset >= DAY_MS) {
      console.log(`[VisionCascade] 🔄 Reset Gemini quota (${this.geminiQuota.used} → 0)`);
      this.geminiQuota.used = 0;
      this.geminiQuota.lastReset = now;
    }

    if (now - this.gpt4vQuota.lastReset >= DAY_MS) {
      console.log(`[VisionCascade] 🔄 Reset GPT-4V OpenRouter quota (${this.gpt4vQuota.used} → 0)`);
      this.gpt4vQuota.used = 0;
      this.gpt4vQuota.lastReset = now;
    }

    if (now - this.claude3Quota.lastReset >= DAY_MS) {
      console.log(`[VisionCascade] 🔄 Reset Claude 3 OpenRouter quota (${this.claude3Quota.used} → 0)`);
      this.claude3Quota.used = 0;
      this.claude3Quota.lastReset = now;
    }

    if (now - this.hfQuota.lastReset >= DAY_MS) {
      console.log(`[VisionCascade] 🔄 Reset HuggingFace quota (${this.hfQuota.used} → 0)`);
      this.hfQuota.used = 0;
      this.hfQuota.lastReset = now;
    }
  }

  /**
   * Retorna status das quotas
   */
  getQuotaStatus() {
    return {
      gemini: {
        used: this.geminiQuota.used,
        limit: this.geminiQuota.limit,
        available: this.hasQuota('gemini'),
        percentage: (this.geminiQuota.used / this.geminiQuota.limit) * 100
      },
      gpt4vOpenRouter: {
        used: this.gpt4vQuota.used,
        limit: this.gpt4vQuota.limit,
        available: this.hasQuota('gpt4v-openrouter'),
        percentage: (this.gpt4vQuota.used / this.gpt4vQuota.limit) * 100
      },
      claude3OpenRouter: {
        used: this.claude3Quota.used,
        limit: this.claude3Quota.limit,
        available: this.hasQuota('claude3-openrouter'),
        percentage: (this.claude3Quota.used / this.claude3Quota.limit) * 100
      },
      huggingface: {
        used: this.hfQuota.used,
        limit: this.hfQuota.limit,
        available: this.hasQuota('huggingface'),
        percentage: (this.hfQuota.used / this.hfQuota.limit) * 100
      }
    };
  }
}
