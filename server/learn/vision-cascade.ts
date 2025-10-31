/**
 * VISION CASCADE - Sistema de fallback automático para Vision APIs
 * 
 * Cascata de prioridade:
 * 1. Gemini Vision (1.500 requisições/dia GRÁTIS)
 * 2. HuggingFace Vision (720 requisições/dia GRÁTIS)
 * 3. OpenAI Vision (PAGO - último recurso)
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { HfInference } from "@huggingface/inference";
import OpenAI from "openai";
import { trackTokenUsage } from "../monitoring/token-tracker";

export interface VisionResult {
  description: string;
  provider: 'gemini' | 'huggingface' | 'openai';
  success: boolean;
  tokensUsed: number;
}

export class VisionCascade {
  private geminiKey: string | undefined;
  private hfKey: string | undefined;
  private openaiKey: string | undefined;
  
  private geminiQuota = { used: 0, limit: 1500, lastReset: Date.now() };
  private hfQuota = { used: 0, limit: 720, lastReset: Date.now() };

  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY;
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

    // Tenta Gemini primeiro (mais rápido e grátis)
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

    // Fallback: HuggingFace
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

    // Último recurso: OpenAI (PAGO)
    if (this.openaiKey) {
      try {
        const result = await this.tryOpenAI(imageBuffer, mimeType, alt);
        console.log(`[VisionCascade] ✅ OpenAI Vision (${Date.now() - startTime}ms) - $$$`);
        return result;
      } catch (error: any) {
        console.error(`[VisionCascade] ❌ OpenAI falhou: ${error.message}`);
      }
    }

    // Todas falharam - retorna fallback
    return {
      description: alt || 'Imagem sem descrição (todas APIs falharam)',
      provider: 'gemini',
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
      tenantId: 1,
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
      tenantId: 1,
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
      model: 'gpt-4-vision-preview',
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
      tenantId: 1,
      provider: 'openai',
      model: 'gpt-4-vision-preview',
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
  private hasQuota(provider: 'gemini' | 'huggingface'): boolean {
    const quota = provider === 'gemini' ? this.geminiQuota : this.hfQuota;
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
      huggingface: {
        used: this.hfQuota.used,
        limit: this.hfQuota.limit,
        available: this.hasQuota('huggingface'),
        percentage: (this.hfQuota.used / this.hfQuota.limit) * 100
      }
    };
  }
}
