import axios from 'axios';
import { db } from '../db';
import { llmProviderQuotas } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../utils/logger';

interface QuotaData {
  provider: string;
  dailyLimit: number;
  dailyUsed: number;
  requestsRemaining: number;
  tokensRemaining: number;
  resetTime?: Date;
}

export class RealQuotaSync {
  private static instance: RealQuotaSync;

  static getInstance(): RealQuotaSync {
    if (!RealQuotaSync.instance) {
      RealQuotaSync.instance = new RealQuotaSync();
    }
    return RealQuotaSync.instance;
  }

  async syncGroqQuota(): Promise<QuotaData | null> {
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        logger.error('[RealQuotaSync] GROQ_API_KEY não encontrada');
        return null;
      }

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const headers = response.headers;
      const requestsLimit = parseInt(headers['x-ratelimit-limit-requests'] || '0');
      const requestsRemaining = parseInt(headers['x-ratelimit-remaining-requests'] || '0');
      const tokensLimit = parseInt(headers['x-ratelimit-limit-tokens'] || '0');
      const tokensRemaining = parseInt(headers['x-ratelimit-remaining-tokens'] || '0');

      const dailyUsed = requestsLimit - requestsRemaining;

      await db.update(llmProviderQuotas)
        .set({
          dailyRequestLimit: requestsLimit,
          requestCount: dailyUsed,
          dailyTokenLimit: tokensLimit,
          tokenCount: tokensLimit - tokensRemaining,
          lastReset: new Date()
        })
        .where(eq(llmProviderQuotas.provider, 'groq'));

      logger.info('[RealQuotaSync] ✅ Groq quota atualizada', {
        requestsLimit,
        requestsRemaining,
        tokensLimit,
        tokensRemaining
      });

      return {
        provider: 'groq',
        dailyLimit: requestsLimit,
        dailyUsed,
        requestsRemaining,
        tokensRemaining
      };
    } catch (error: any) {
      logger.error('[RealQuotaSync] ❌ Erro ao sincronizar Groq', {
        error: error.message,
        status: error.response?.status
      });
      return null;
    }
  }

  async syncOpenRouterQuota(): Promise<QuotaData | null> {
    try {
      const apiKey = process.env.OPEN_ROUTER_API_KEY;
      if (!apiKey) {
        logger.error('[RealQuotaSync] OPEN_ROUTER_API_KEY não encontrada');
        return null;
      }

      const response = await axios.get(
        'https://openrouter.ai/api/v1/auth/key',
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );

      const data = response.data.data;
      const limit = data.rate_limit?.requests || 50000;
      const remaining = limit - (data.usage?.requests || 0);

      await db.update(llmProviderQuotas)
        .set({
          dailyRequestLimit: limit,
          requestCount: data.usage?.requests || 0,
          lastReset: new Date()
        })
        .where(eq(llmProviderQuotas.provider, 'openrouter'));

      logger.info('[RealQuotaSync] ✅ OpenRouter quota atualizada', {
        limit,
        used: data.usage?.requests || 0,
        remaining
      });

      return {
        provider: 'openrouter',
        dailyLimit: limit,
        dailyUsed: data.usage?.requests || 0,
        requestsRemaining: remaining,
        tokensRemaining: 0
      };
    } catch (error: any) {
      logger.error('[RealQuotaSync] ❌ Erro ao sincronizar OpenRouter', {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText
      });
      
      if (error.response?.status === 401) {
        await db.update(llmProviderQuotas)
          .set({
            dailyRequestLimit: 0,
            requestCount: 0,
            lastReset: new Date()
          })
          .where(eq(llmProviderQuotas.provider, 'openrouter'));
        
        logger.warn('[RealQuotaSync] ⚠️  OpenRouter: API key inválida - quota zerada no DB');
      }
      
      return null;
    }
  }

  async syncGeminiQuota(): Promise<QuotaData | null> {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.error('[RealQuotaSync] GEMINI_API_KEY não encontrada');
        return null;
      }

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
        {
          contents: [{ parts: [{ text: 'ping' }] }]
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );

      await db.update(llmProviderQuotas)
        .set({
          dailyRequestLimit: 1500000,
          requestCount: 0,
          dailyTokenLimit: 1500000,
          tokenCount: 0,
          lastReset: new Date()
        })
        .where(eq(llmProviderQuotas.provider, 'gemini'));

      logger.info('[RealQuotaSync] ✅ Gemini quota atualizada (200 OK - funcionando)');

      return {
        provider: 'gemini',
        dailyLimit: 1500000,
        dailyUsed: 0,
        requestsRemaining: 1500000,
        tokensRemaining: 1500000
      };
    } catch (error: any) {
      if (error.response?.status === 429) {
        const errorMsg = error.response?.data?.error?.message || '';
        const quotaMatch = errorMsg.match(/limit:\s*(\d+)/i);
        const quota = quotaMatch ? parseInt(quotaMatch[1]) : 0;

        await db.update(llmProviderQuotas)
          .set({
            dailyRequestLimit: quota,
            requestCount: quota,
            dailyTokenLimit: quota,
            tokenCount: quota,
            lastReset: new Date()
          })
          .where(eq(llmProviderQuotas.provider, 'gemini'));

        logger.warn('[RealQuotaSync] ⚠️  Gemini bloqueada pelo Google', {
          quota,
          error: errorMsg
        });

        return {
          provider: 'gemini',
          dailyLimit: quota,
          dailyUsed: quota,
          requestsRemaining: 0,
          tokensRemaining: 0
        };
      }

      logger.error('[RealQuotaSync] ❌ Erro ao sincronizar Gemini', {
        error: error.message,
        status: error.response?.status
      });
      return null;
    }
  }

  async syncHuggingFaceQuota(): Promise<QuotaData | null> {
    try {
      const apiKey = process.env.HUGGINGFACE_API_KEY;
      if (!apiKey) {
        logger.error('[RealQuotaSync] HUGGINGFACE_API_KEY não encontrada');
        return null;
      }

      const response = await axios.post(
        'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
        { inputs: 'ping', parameters: { max_new_tokens: 1 } },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const headers = response.headers;
      const limit = parseInt(headers['x-ratelimit-limit'] || '100000');
      const remaining = parseInt(headers['x-ratelimit-remaining'] || '0');
      const used = limit - remaining;

      await db.update(llmProviderQuotas)
        .set({
          dailyRequestLimit: limit,
          requestCount: used,
          lastReset: new Date()
        })
        .where(eq(llmProviderQuotas.provider, 'huggingface'));

      logger.info('[RealQuotaSync] ✅ HuggingFace quota atualizada', {
        limit,
        used,
        remaining
      });

      return {
        provider: 'huggingface',
        dailyLimit: limit,
        dailyUsed: used,
        requestsRemaining: remaining,
        tokensRemaining: 0
      };
    } catch (error: any) {
      logger.error('[RealQuotaSync] ❌ Erro ao sincronizar HuggingFace', {
        error: error.message,
        status: error.response?.status
      });
      return null;
    }
  }

  async syncAllProviders(): Promise<QuotaData[]> {
    logger.info('[RealQuotaSync] 🔄 Iniciando sync de TODAS as quotas reais...');
    
    const results = await Promise.allSettled([
      this.syncGroqQuota(),
      this.syncOpenRouterQuota(),
      this.syncGeminiQuota(),
      this.syncHuggingFaceQuota()
    ]);

    const quotas: QuotaData[] = results
      .filter((r): r is PromiseFulfilledResult<QuotaData | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter((q): q is QuotaData => q !== null);

    logger.info('[RealQuotaSync] ✅ Sync completo', {
      total: results.length,
      success: quotas.length,
      failed: results.length - quotas.length
    });

    return quotas;
  }
}

export const realQuotaSync = RealQuotaSync.getInstance();
