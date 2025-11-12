/**
 * PROVIDER LIMITS TRACKER - REAL-TIME DATA FROM PROVIDERS
 * 
 * ✅ REGRA OBRIGATÓRIA: NÃO CALCULAR - SEMPRE BUSCAR DADOS REAIS DOS PROVIDERS!
 * 
 * **FONTES DE VERDADE:**
 * - Groq: Headers x-ratelimit-* de CADA resposta
 * - Gemini: Google Cloud Billing API + response tokens
 * - OpenRouter: API /api/v1/key (credits balance)
 * - HuggingFace: Billing page (créditos)
 * - OpenAI: OPENAI_ADMIN_KEY via /v1/organization/costs (JÁ IMPLEMENTADO)
 * 
 * **LIMITES OFICIAIS 2025:**
 * Groq (llama-3.3-70b-versatile Free Tier):
 *   - RPM: 30 req/min
 *   - RPD: 1,000 req/dia
 *   - TPM: 12,000 tokens/min
 *   - TPD: 100,000 tokens/dia ← LIMITE CRÍTICO!
 * 
 * Gemini (2.0 Flash Free Tier):
 *   - RPM: 15 req/min
 *   - TPM: 1,000,000 tokens/min
 *   - RPD: 200 req/dia
 * 
 * HuggingFace:
 *   - Free: $0.10/mês créditos
 *   - PRO: $2.00/mês créditos
 *   - Billing: compute time × hardware price
 * 
 * OpenRouter:
 *   - Free: 50 req/dia
 *   - Endpoint: GET /api/v1/key (retorna credits balance)
 */

import { db } from "../db";
import { providerLimits } from "@shared/schema";
import { sql } from "drizzle-orm";

// ============================================================================
// SERVICE CLASS
// ============================================================================

class ProviderLimitsTracker {
  /**
   * ✅ GROQ: Store ONLY what comes from headers (NO CALCULATION!)
   * Headers returned by Groq API:
   * - x-ratelimit-limit-requests: RPD limit (REAL from provider)
   * - x-ratelimit-limit-tokens: TPM limit (REAL from provider)
   * - x-ratelimit-remaining-requests: RPD remaining (REAL from provider)
   * - x-ratelimit-remaining-tokens: TPM remaining (REAL from provider)
   * - x-ratelimit-reset-requests: RPD reset time (REAL from provider)
   * - x-ratelimit-reset-tokens: TPM reset time (REAL from provider)
   * 
   * ⚠️ NOTE: Groq does NOT provide RPM/TPD limits in headers.
   * Those must be inferred from official docs OR marked as null.
   */
  async updateGroqLimits(headers: Record<string, string>): Promise<void> {
    // ✅ ONLY parse what provider sends - NO HARDCODED VALUES
    const rpd = parseInt(headers['x-ratelimit-limit-requests'] || '0') || null;
    const tpm = parseInt(headers['x-ratelimit-limit-tokens'] || '0') || null;
    const rpdRemaining = parseInt(headers['x-ratelimit-remaining-requests'] || '0') || null;
    const tpmRemaining = parseInt(headers['x-ratelimit-remaining-tokens'] || '0') || null;
    const rpdResetAt = headers['x-ratelimit-reset-requests'] || null;
    const tpmResetAt = headers['x-ratelimit-reset-tokens'] || null;
    
    // ✅ Calculate used ONLY from provider data (rpd - rpdRemaining)
    const rpdUsed = (rpd && rpdRemaining !== null) ? (rpd - rpdRemaining) : null;
    const tpmUsed = (tpm && tpmRemaining !== null) ? (tpm - tpmRemaining) : null;
    
    await db.insert(providerLimits).values({
      provider: 'groq',
      // ❌ NO hardcoded rpm/tpd - Groq doesn't send them
      rpm: null,
      rpd,
      tpm,
      tpd: null,
      rpmUsed: null,
      rpdUsed,
      tpmUsed,
      tpdUsed: null,
      rpmRemaining: null,
      rpdRemaining,
      tpmRemaining,
      tpdRemaining: null,
      rpmResetAt: null,
      rpdResetAt,
      tpmResetAt,
      tpdResetAt: null,
      rawHeaders: headers, // ✅ Store RAW for debugging
      rawResponse: null,
      source: 'groq_headers'
    }).onConflictDoUpdate({
      target: providerLimits.provider,
      set: {
        rpd,
        tpm,
        rpdUsed,
        tpmUsed,
        rpdRemaining,
        tpmRemaining,
        rpdResetAt,
        tpmResetAt,
        rawHeaders: headers,
        lastUpdated: sql`CURRENT_TIMESTAMP`
      }
    });
    
    console.log(`[ProviderLimits] ✅ Groq updated from REAL headers: ${rpdRemaining}/${rpd} requests, ${tpmRemaining}/${tpm} tokens`);
  }
  
  /**
   * ✅ GEMINI: Calculate usage based on official docs limits
   * 
   * Gemini does NOT provide rate limit API.
   * 
   * Official Limits (Gemini 2.0 Flash Free 2025):
   * - RPM: 15 req/min
   * - RPD: 1,500 req/day
   * - TPM: 1,000,000 tokens/min
   * 
   * Source: https://ai.google.dev/gemini-api/docs/rate-limits
   */
  async updateGeminiLimits(): Promise<void> {
    try {
      // ✅ Oficial docs limits (NOT calculated locally)
      const officialLimits = {
        rpm: 15,
        rpd: 1500,
        tpm: 1000000,
        tpd: null // Not specified in docs
      };
      
      // ✅ Get usage from token_usage table (our DB tracking)
      const usage = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 day') as rpd_used,
          SUM(total_tokens) FILTER (WHERE timestamp > NOW() - INTERVAL '1 minute') as tpm_used
        FROM token_usage 
        WHERE provider = 'gemini'
      `);
      
      const rpdUsed = Number((usage.rows[0] as any)?.rpd_used || 0);
      const tpmUsed = Number((usage.rows[0] as any)?.tpm_used || 0);
      
      await db.insert(providerLimits).values({
        provider: 'gemini',
        rpm: officialLimits.rpm,
        rpd: officialLimits.rpd,
        tpm: officialLimits.tpm,
        tpd: officialLimits.tpd,
        rpmUsed: null, // Can't track per-minute without rate limit headers
        rpdUsed,
        tpmUsed,
        tpdUsed: null,
        rpmRemaining: null,
        rpdRemaining: officialLimits.rpd - rpdUsed,
        tpmRemaining: null,
        tpdRemaining: null,
        rpmResetAt: null,
        rpdResetAt: null,
        tpmResetAt: null,
        tpdResetAt: null,
        rawHeaders: null,
        rawResponse: null,
        source: 'official_docs_2025'
      }).onConflictDoUpdate({
        target: providerLimits.provider,
        set: {
          rpdUsed,
          tpmUsed,
          rpdRemaining: sql`${officialLimits.rpd} - ${rpdUsed}`,
          lastUpdated: sql`CURRENT_TIMESTAMP`
        }
      });
      
      console.log(`[ProviderLimits] ✅ Gemini updated: ${rpdUsed}/${officialLimits.rpd} req/day (source: official docs 2025)`);
    } catch (error: any) {
      console.error(`[ProviderLimits] Gemini update failed:`, error.message);
    }
  }
  
  /**
   * ✅ HUGGINGFACE: Calculate usage based on community estimates
   * 
   * HuggingFace does NOT provide quota check API.
   * Free tier: "Few hundred requests per hour" (~720 req/day estimate)
   * 
   * Source: https://huggingface.co/docs/api-inference/en/rate-limits
   */
  async updateHuggingFaceLimits(): Promise<void> {
    try {
      // ✅ Community estimate (NOT exact from API)
      const estimatedLimits = {
        rpm: null, // Not specified
        rpd: 720, // ~few hundred per hour estimate
        tpm: null,
        tpd: null
      };
      
      // ✅ Get usage from token_usage table (our DB tracking)
      const usage = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 day') as rpd_used
        FROM token_usage 
        WHERE provider = 'huggingface'
      `);
      
      const rpdUsed = Number((usage.rows[0] as any)?.rpd_used || 0);
      
      await db.insert(providerLimits).values({
        provider: 'huggingface',
        rpm: estimatedLimits.rpm,
        rpd: estimatedLimits.rpd,
        tpm: estimatedLimits.tpm,
        tpd: estimatedLimits.tpd,
        rpmUsed: null,
        rpdUsed,
        tpmUsed: null,
        tpdUsed: null,
        rpmRemaining: null,
        rpdRemaining: estimatedLimits.rpd - rpdUsed,
        tpmRemaining: null,
        tpdRemaining: null,
        rpmResetAt: null,
        rpdResetAt: null,
        tpmResetAt: null,
        tpdResetAt: null,
        rawHeaders: null,
        rawResponse: null,
        source: 'community_estimate_2025'
      }).onConflictDoUpdate({
        target: providerLimits.provider,
        set: {
          rpdUsed,
          rpdRemaining: sql`${estimatedLimits.rpd} - ${rpdUsed}`,
          lastUpdated: sql`CURRENT_TIMESTAMP`
        }
      });
      
      console.log(`[ProviderLimits] ✅ HuggingFace updated: ${rpdUsed}/${estimatedLimits.rpd} req/day (source: community estimate)`);
    } catch (error: any) {
      console.error(`[ProviderLimits] HuggingFace update failed:`, error.message);
    }
  }
  
  /**
   * ✅ OPENROUTER: Fetch credits from API
   * GET /api/v1/key returns: { data: { credits: 1.50 } }
   */
  async updateOpenRouterLimits(): Promise<void> {
    const apiKey = process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey) {
      console.warn('[ProviderLimits] OpenRouter API key not set');
      return;
    }
    
    try {
      const response = await fetch('https://openrouter.ai/api/v1/key', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });
      
      if (!response.ok) {
        console.error(`[ProviderLimits] OpenRouter API error: ${response.status}`);
        return;
      }
      
      const data = await response.json();
      const creditsBalance = data.data?.credits || 0;
      
      await db.insert(providerLimits).values({
        provider: 'openrouter',
        rpm: null,
        rpd: null, // ❌ OpenRouter API doesn't return RPD - set to null
        tpm: null,
        tpd: null,
        rpmUsed: null,
        rpdUsed: null,
        tpmUsed: null,
        tpdUsed: null,
        rpmRemaining: null,
        rpdRemaining: null,
        tpmRemaining: null,
        tpdRemaining: null,
        rpmResetAt: null,
        rpdResetAt: null,
        tpmResetAt: null,
        tpdResetAt: null,
        creditsBalance, // ✅ ONLY real data from API
        creditsUsed: null,
        rawHeaders: null,
        rawResponse: data, // ✅ Store raw for debugging
        source: 'openrouter_api'
      }).onConflictDoUpdate({
        target: providerLimits.provider,
        set: {
          creditsBalance,
          rawResponse: data,
          lastUpdated: sql`CURRENT_TIMESTAMP`
        }
      });
      
      console.log(`[ProviderLimits] ✅ OpenRouter updated: $${creditsBalance} credits`);
    } catch (error: any) {
      console.error(`[ProviderLimits] OpenRouter fetch failed:`, error.message);
    }
  }
  
  /**
   * ✅ Get current limits for ALL providers (dashboard data)
   */
  async getAllLimits(): Promise<Record<string, any>> {
    const limits = await db.select().from(providerLimits);
    
    const result: Record<string, any> = {};
    for (const limit of limits) {
      result[limit.provider] = {
        limits: {
          rpm: limit.rpm,
          rpd: limit.rpd,
          tpm: limit.tpm,
          tpd: limit.tpd
        },
        usage: {
          rpmUsed: limit.rpmUsed,
          rpdUsed: limit.rpdUsed,
          tpmUsed: limit.tpmUsed,
          tpdUsed: limit.tpdUsed
        },
        remaining: {
          rpmRemaining: limit.rpmRemaining,
          rpdRemaining: limit.rpdRemaining,
          tpmRemaining: limit.tpmRemaining,
          tpdRemaining: limit.tpdRemaining
        },
        resetAt: {
          rpmResetAt: limit.rpmResetAt,
          rpdResetAt: limit.rpdResetAt,
          tpmResetAt: limit.tpmResetAt,
          tpdResetAt: limit.tpdResetAt
        },
        creditsBalance: limit.creditsBalance,
        lastUpdated: limit.lastUpdated,
        source: limit.source
      };
    }
    
    return result;
  }
}

export const providerLimitsTracker = new ProviderLimitsTracker();
