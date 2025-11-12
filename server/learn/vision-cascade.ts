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
import { log } from "../utils/logger";
import { db } from "../db";
import { visionQuotaState } from "../../shared/schema";
import { eq } from "drizzle-orm";

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

  /**
   * Async factory - creates VisionCascade with quota state restored from DB
   */
  static async create(): Promise<VisionCascade> {
    const instance = new VisionCascade();
    await instance.initializeFromDB();
    return instance;
  }

  constructor() {
    this.geminiKey = process.env.GEMINI_API_KEY;
    this.openRouterKey = process.env.OPEN_ROUTER_API_KEY;
    this.hfKey = process.env.HUGGINGFACE_API_KEY;
    this.openaiKey = process.env.OPENAI_API_KEY;
  }

  /**
   * Loads persisted quota state from PostgreSQL for all providers
   */
  private async initializeFromDB(): Promise<void> {
    try {
      // Load state for all 4 providers
      const providers: Array<'gemini' | 'gpt4v-openrouter' | 'claude3-openrouter' | 'huggingface'> = [
        'gemini',
        'gpt4v-openrouter',
        'claude3-openrouter',
        'huggingface'
      ];

      for (const provider of providers) {
        const state = await this.loadQuotaFromDB(provider);
        if (state) {
          // Restore quota state from DB
          switch (provider) {
            case 'gemini':
              this.geminiQuota = state;
              break;
            case 'gpt4v-openrouter':
              this.gpt4vQuota = state;
              break;
            case 'claude3-openrouter':
              this.claude3Quota = state;
              break;
            case 'huggingface':
              this.hfQuota = state;
              break;
          }
          
          log.info('Vision quota state recovered from DB', {
            component: 'VisionCascade',
            provider,
            used: state.used,
            limit: state.limit,
            lastReset: new Date(state.lastReset).toISOString()
          });
        }
      }
    } catch (error) {
      log.warn('Failed to initialize vision quota state from DB', {
        component: 'VisionCascade',
        error: error instanceof Error ? error.message : String(error)
      });
      // Non-throwing: startup continues with default quota state
    }
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
    await this.resetQuotasIfNeeded();

    // 1. Tenta Gemini primeiro (mais rápido e grátis)
    if (this.geminiKey && this.hasQuota('gemini')) {
      try {
        const result = await this.tryGemini(imageBuffer, mimeType, alt);
        log.info('Vision inference successful', {
          component: 'VisionCascade',
          provider: 'gemini',
          durationMs: Date.now() - startTime
        });
        return result;
      } catch (error: any) {
        log.warn('Vision inference failed', {
          component: 'VisionCascade',
          provider: 'gemini',
          error: error.message
        });
      }
    } else {
      log.info('Vision provider unavailable', {
        component: 'VisionCascade',
        provider: 'gemini',
        quotaUsed: this.geminiQuota.used,
        quotaLimit: this.geminiQuota.limit
      });
    }

    // 2. Fallback: GPT-4V via OpenRouter (FREE)
    if (this.openRouterKey && this.hasQuota('gpt4v-openrouter')) {
      try {
        const result = await this.tryGPT4VOpenRouter(imageBuffer, mimeType, alt);
        log.info('Vision inference successful', {
          component: 'VisionCascade',
          provider: 'gpt4v-openrouter',
          durationMs: Date.now() - startTime
        });
        return result;
      } catch (error: any) {
        log.warn('Vision inference failed', {
          component: 'VisionCascade',
          provider: 'gpt4v-openrouter',
          error: error.message
        });
      }
    } else {
      log.info('Vision provider unavailable', {
        component: 'VisionCascade',
        provider: 'gpt4v-openrouter',
        quotaUsed: this.gpt4vQuota.used,
        quotaLimit: this.gpt4vQuota.limit
      });
    }

    // 3. Fallback: Claude 3 Haiku via OpenRouter (FREE)
    if (this.openRouterKey && this.hasQuota('claude3-openrouter')) {
      try {
        const result = await this.tryClaude3OpenRouter(imageBuffer, mimeType, alt);
        log.info('Vision inference successful', {
          component: 'VisionCascade',
          provider: 'claude3-openrouter',
          durationMs: Date.now() - startTime
        });
        return result;
      } catch (error: any) {
        log.warn('Vision inference failed', {
          component: 'VisionCascade',
          provider: 'claude3-openrouter',
          error: error.message
        });
      }
    } else {
      log.info('Vision provider unavailable', {
        component: 'VisionCascade',
        provider: 'claude3-openrouter',
        quotaUsed: this.claude3Quota.used,
        quotaLimit: this.claude3Quota.limit
      });
    }

    // 4. Fallback: HuggingFace
    if (this.hfKey && this.hasQuota('huggingface')) {
      try {
        const result = await this.tryHuggingFace(imageBuffer, alt);
        log.info('Vision inference successful', {
          component: 'VisionCascade',
          provider: 'huggingface',
          durationMs: Date.now() - startTime
        });
        return result;
      } catch (error: any) {
        log.warn('Vision inference failed', {
          component: 'VisionCascade',
          provider: 'huggingface',
          error: error.message
        });
      }
    } else {
      log.info('Vision provider unavailable', {
        component: 'VisionCascade',
        provider: 'huggingface',
        quotaUsed: this.hfQuota.used,
        quotaLimit: this.hfQuota.limit
      });
    }

    // 5. Último recurso: OpenAI GPT-4o (PAGO)
    if (this.openaiKey) {
      try {
        const result = await this.tryOpenAI(imageBuffer, mimeType, alt);
        log.info('Vision inference successful (paid)', {
          component: 'VisionCascade',
          provider: 'openai',
          durationMs: Date.now() - startTime,
          paid: true
        });
        return result;
      } catch (error: any) {
        log.error('Vision inference failed (all providers exhausted)', {
          component: 'VisionCascade',
          provider: 'openai',
          error: error.message
        });
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
   * 🔥 Uses centralized system prompt to ensure behavior sliders affect image descriptions
   */
  private async tryGemini(imageBuffer: Buffer, mimeType: string, alt?: string): Promise<VisionResult> {
    const startTime = Date.now();
    
    // 🔥 NEW: Use centralized system prompt for consistent behavior
    const { buildSimpleConversation } = await import('../llm/system-prompt');
    
    const llmRequest = await buildSimpleConversation(
      [
        {
          role: 'user',
          content: `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`
        }
      ],
      {
        maxTokens: 300
      }
    );
    
    // Compose final prompt with system message + user request
    const systemMessage = llmRequest.messages.find(m => m.role === 'system')?.content || '';
    const userMessage = `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`;
    
    const fullPrompt = systemMessage ? `${systemMessage}\n\n${userMessage}` : userMessage;

    const genAI = new GoogleGenerativeAI(this.geminiKey!);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash-exp',
      // NOTE: Gemini doesn't accept system message in generateContent,
      // so we prepend it to the user prompt
      generationConfig: {
        temperature: llmRequest.temperature,
        topP: llmRequest.topP,
        topK: llmRequest.topK,
        maxOutputTokens: llmRequest.maxTokens
      }
    });

    const result = await model.generateContent([
      fullPrompt,
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
    
    // Persist quota state to DB
    await this.saveQuotaToDB(
      'gemini',
      this.geminiQuota.used,
      this.geminiQuota.limit,
      new Date(this.geminiQuota.lastReset)
    );

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
   * 🔥 Uses centralized system prompt to ensure behavior sliders affect image descriptions
   */
  private async tryGPT4VOpenRouter(imageBuffer: Buffer, mimeType: string, alt?: string): Promise<VisionResult> {
    // 🔥 NEW: Use centralized system prompt for consistent behavior
    const { buildSimpleConversation } = await import('../llm/system-prompt');
    
    const llmRequest = await buildSimpleConversation(
      [
        {
          role: 'user',
          content: `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`
        }
      ],
      {
        maxTokens: 300
      }
    );
    
    const openrouter = new OpenAI({
      apiKey: this.openRouterKey!,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://aion.replit.app',
        'X-Title': 'AION Vision System'
      }
    });

    const base64Image = imageBuffer.toString('base64');

    const openrouterParams: any = {
      model: 'openai/gpt-4-vision-preview:free',
      messages: [
        // Include system message from buildSimpleConversation
        ...llmRequest.messages.filter(m => m.role === 'system'),
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`
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
      max_tokens: llmRequest.maxTokens
    };
    
    // 🔥 Pass temperature/topP from policy
    if (llmRequest.temperature !== undefined) {
      openrouterParams.temperature = llmRequest.temperature;
    }
    if (llmRequest.topP !== undefined) {
      openrouterParams.top_p = llmRequest.topP;
    }
    if (llmRequest.stop && llmRequest.stop.length > 0) {
      openrouterParams.stop = llmRequest.stop;
    }

    const response = await openrouter.chat.completions.create(openrouterParams);

    const description = response.choices[0]?.message?.content || alt || 'Sem descrição';
    const tokensUsed = response.usage?.total_tokens || 0;

    // Incrementa quota
    this.gpt4vQuota.used++;
    
    // Persist quota state to DB
    await this.saveQuotaToDB(
      'gpt4v-openrouter',
      this.gpt4vQuota.used,
      this.gpt4vQuota.limit,
      new Date(this.gpt4vQuota.lastReset)
    );

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
   * 🔥 Uses centralized system prompt to ensure behavior sliders affect image descriptions
   */
  private async tryClaude3OpenRouter(imageBuffer: Buffer, mimeType: string, alt?: string): Promise<VisionResult> {
    // 🔥 NEW: Use centralized system prompt for consistent behavior
    const { buildSimpleConversation } = await import('../llm/system-prompt');
    
    const llmRequest = await buildSimpleConversation(
      [
        {
          role: 'user',
          content: `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`
        }
      ],
      {
        maxTokens: 300
      }
    );
    
    const openrouter = new OpenAI({
      apiKey: this.openRouterKey!,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://aion.replit.app',
        'X-Title': 'AION Vision System'
      }
    });

    const base64Image = imageBuffer.toString('base64');

    const openrouterParams: any = {
      model: 'anthropic/claude-3-haiku:free',
      messages: [
        // Include system message from buildSimpleConversation
        ...llmRequest.messages.filter(m => m.role === 'system'),
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Descreva esta imagem em detalhes para indexação em uma base de conhecimento. 
Inclua:
- O que está na imagem
- Cores, formas, objetos principais
- Contexto e ambiente
- Qualquer texto visível
- Informações relevantes para busca semântica

${alt ? `Contexto do alt text: "${alt}"` : ''}

Descrição detalhada:`
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
      max_tokens: llmRequest.maxTokens
    };
    
    // 🔥 Pass temperature/topP from policy
    if (llmRequest.temperature !== undefined) {
      openrouterParams.temperature = llmRequest.temperature;
    }
    if (llmRequest.topP !== undefined) {
      openrouterParams.top_p = llmRequest.topP;
    }
    if (llmRequest.stop && llmRequest.stop.length > 0) {
      openrouterParams.stop = llmRequest.stop;
    }

    // Claude via OpenRouter aceita formato OpenAI-compatible
    const response = await openrouter.chat.completions.create(openrouterParams);

    const description = response.choices[0]?.message?.content || alt || 'Sem descrição';
    const tokensUsed = response.usage?.total_tokens || 0;

    // Incrementa quota
    this.claude3Quota.used++;
    
    // Persist quota state to DB
    await this.saveQuotaToDB(
      'claude3-openrouter',
      this.claude3Quota.used,
      this.claude3Quota.limit,
      new Date(this.claude3Quota.lastReset)
    );

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
   * 🔥 BLIP é modelo image-to-text simples (sem customização), mas fazemos segundo LLM pass
   * para aplicar system prompt e garantir que descrição final honra os 7 sliders behavior
   */
  private async tryHuggingFace(imageBuffer: Buffer, alt?: string): Promise<VisionResult> {
    const hf = new HfInference(this.hfKey!);

    // STEP 1: BLIP gera caption básico (sem system prompt - limitação do modelo)
    const result = await hf.imageToText({
      data: imageBuffer,
      model: 'Salesforce/blip-image-captioning-large'
    });

    const rawCaption = result.generated_text || alt || 'Imagem sem descrição';

    // Incrementa quota BLIP
    this.hfQuota.used++;
    
    // Persist quota state to DB
    await this.saveQuotaToDB(
      'huggingface',
      this.hfQuota.used,
      this.hfQuota.limit,
      new Date(this.hfQuota.lastReset)
    );

    // Track usage BLIP
    const blipTokens = Math.ceil(rawCaption.length / 4);
    await trackTokenUsage({
      provider: 'huggingface',
      model: 'blip-image-captioning-large',
      requestType: 'image',
      promptTokens: 0,
      completionTokens: blipTokens,
      totalTokens: blipTokens,
      cost: 0,
      success: true,
      metadata: {} as any
    });

    // 🔥 STEP 2: Second LLM pass para aplicar system prompt aos 7 sliders behavior
    // Usamos free API (Groq preferred) para reescrever caption com personality
    const { buildSimpleConversation } = await import('../llm/system-prompt');
    const { LLMClient } = await import('../model/llm-client');
    
    const llmRequest = await buildSimpleConversation(
      [
        {
          role: 'user',
          content: `Reescreva esta descrição de imagem seguindo o estilo configurado:

Descrição original: "${rawCaption}"

${alt ? `Contexto: "${alt}"` : ''}

Mantenha o conteúdo factual, apenas ajuste o tom e estilo.`
        }
      ],
      {
        maxTokens: 300
      }
    );

    try {
      const llmClient = await LLMClient.create();
      const enhancedResponse = await llmClient.chatCompletion(llmRequest);
      const enhancedDescription = enhancedResponse.content.trim();

      // Track usage do segundo LLM pass
      await trackTokenUsage({
        provider: enhancedResponse.provider,
        model: enhancedResponse.model,
        requestType: 'image-enhancement',
        promptTokens: Math.ceil((rawCaption.length + 100) / 4),
        completionTokens: Math.ceil(enhancedDescription.length / 4),
        totalTokens: Math.ceil((rawCaption.length + enhancedDescription.length + 100) / 4),
        cost: enhancedResponse.cost || 0,
        success: true,
        metadata: {} as any
      });

      return {
        description: enhancedDescription,
        provider: 'huggingface+llm-enhancement', // Indica que usou dois passos
        success: true,
        tokensUsed: blipTokens + Math.ceil(enhancedDescription.length / 4)
      };
    } catch (error) {
      // 🔥 CRITICAL: Se LLM enhancement falhar, propagamos erro para continuar cascade
      // NÃO retornamos descrição sem system prompt completo - isso violaria policy enforcement
      log.error('HuggingFace BLIP enhancement failed - marking provider as failed', {
        component: 'VisionCascade',
        error: error instanceof Error ? error.message : String(error),
        rawCaption: rawCaption.substring(0, 100) // Log snippet para debugging
      });
      
      // Lança erro para cascade continuar tentando próximo provider
      // (ou retornar fallback final se TODOS falharem)
      throw new Error(`BLIP caption enhancement failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Tenta OpenAI Vision API (GPT-4 Vision)
   * 🔥 Uses centralized system prompt to ensure behavior sliders affect image descriptions
   */
  private async tryOpenAI(imageBuffer: Buffer, mimeType: string, alt?: string): Promise<VisionResult> {
    // 🔥 NEW: Use centralized system prompt for consistent behavior
    const { buildSimpleConversation } = await import('../llm/system-prompt');
    
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    // Build request with system prompt
    const llmRequest = await buildSimpleConversation(
      [
        {
          role: 'user',
          content: `Descreva esta imagem em detalhes para indexação. ${alt ? `Contexto: "${alt}"` : ''}`
        }
      ],
      {
        maxTokens: 300
      }
    );
    
    const openai = new OpenAI({ apiKey: this.openaiKey! });

    // 🔥 Build OpenAI-compatible params with ALL behavior sliders (temp, topP, topK)
    const openaiParams: any = {
      model: 'gpt-4o',
      messages: [
        // Include system message from buildSimpleConversation
        ...llmRequest.messages.filter(m => m.role === 'system'),
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
      max_tokens: llmRequest.maxTokens
    };

    // 🔥 CRITICAL: Pass temperature/topP from policy to ensure behavior sliders take effect
    if (llmRequest.temperature !== undefined) {
      openaiParams.temperature = llmRequest.temperature;
    }
    if (llmRequest.topP !== undefined) {
      openaiParams.top_p = llmRequest.topP;
    }
    if (llmRequest.topK !== undefined && llmRequest.topK > 0) {
      // OpenAI doesn't support top_k, but we log it for consistency
      log.info('topK parameter not supported by OpenAI Vision', {
        component: 'VisionCascade',
        topK: llmRequest.topK
      });
    }
    if (llmRequest.stop && llmRequest.stop.length > 0) {
      openaiParams.stop = llmRequest.stop;
    }

    const response = await openai.chat.completions.create(openaiParams);

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
  private async resetQuotasIfNeeded(): Promise<void> {
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    if (now - this.geminiQuota.lastReset >= DAY_MS) {
      log.info('Vision quota reset', {
        component: 'VisionCascade',
        provider: 'gemini',
        previousUsed: this.geminiQuota.used,
        limit: this.geminiQuota.limit
      });
      this.geminiQuota.used = 0;
      this.geminiQuota.lastReset = now;
      
      // Persist reset to DB
      await this.saveQuotaToDB('gemini', 0, this.geminiQuota.limit, new Date(now));
    }

    if (now - this.gpt4vQuota.lastReset >= DAY_MS) {
      log.info('Vision quota reset', {
        component: 'VisionCascade',
        provider: 'gpt4v-openrouter',
        previousUsed: this.gpt4vQuota.used,
        limit: this.gpt4vQuota.limit
      });
      this.gpt4vQuota.used = 0;
      this.gpt4vQuota.lastReset = now;
      
      // Persist reset to DB
      await this.saveQuotaToDB('gpt4v-openrouter', 0, this.gpt4vQuota.limit, new Date(now));
    }

    if (now - this.claude3Quota.lastReset >= DAY_MS) {
      log.info('Vision quota reset', {
        component: 'VisionCascade',
        provider: 'claude3-openrouter',
        previousUsed: this.claude3Quota.used,
        limit: this.claude3Quota.limit
      });
      this.claude3Quota.used = 0;
      this.claude3Quota.lastReset = now;
      
      // Persist reset to DB
      await this.saveQuotaToDB('claude3-openrouter', 0, this.claude3Quota.limit, new Date(now));
    }

    if (now - this.hfQuota.lastReset >= DAY_MS) {
      log.info('Vision quota reset', {
        component: 'VisionCascade',
        provider: 'huggingface',
        previousUsed: this.hfQuota.used,
        limit: this.hfQuota.limit
      });
      this.hfQuota.used = 0;
      this.hfQuota.lastReset = now;
      
      // Persist reset to DB
      await this.saveQuotaToDB('huggingface', 0, this.hfQuota.limit, new Date(now));
    }
  }

  /**
   * Salva estado de quota no PostgreSQL
   */
  private async saveQuotaToDB(
    provider: 'gemini' | 'gpt4v-openrouter' | 'claude3-openrouter' | 'huggingface',
    used: number,
    limit: number,
    lastReset: Date
  ): Promise<void> {
    try {
      await db
        .insert(visionQuotaState)
        .values({
          provider,
          used,
          limit,
          lastReset
        })
        .onConflictDoUpdate({
          target: visionQuotaState.provider,
          set: {
            used,
            limit,
            lastReset,
            updatedAt: new Date()
          }
        });
    } catch (error) {
      // Non-throwing: persistence failure doesn't break vision logic
      log.error('Failed to save vision quota state to DB', {
        component: 'VisionCascade',
        provider,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Carrega estado de quota do PostgreSQL
   */
  private async loadQuotaFromDB(
    provider: 'gemini' | 'gpt4v-openrouter' | 'claude3-openrouter' | 'huggingface'
  ): Promise<{ used: number; limit: number; lastReset: number } | null> {
    try {
      const result = await db
        .select()
        .from(visionQuotaState)
        .where(eq(visionQuotaState.provider, provider))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      return {
        used: result[0].used,
        limit: result[0].limit,
        lastReset: result[0].lastReset.getTime()
      };
    } catch (error) {
      log.warn('Failed to load vision quota state from DB', {
        component: 'VisionCascade',
        provider,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
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
