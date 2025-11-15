/**
 * PROVIDER LIMITS TRACKER - REAL-TIME DATA FROM PROVIDERS
 * 
 * ✅ REGRA OBRIGATÓRIA: NÃO CALCULAR - SEMPRE BUSCAR DADOS REAIS DOS PROVIDERS!
 * 
 * **FONTES DE VERDADE:**
 * - Groq: Headers x-ratelimit-* de CADA resposta
 * - Gemini: Google Cloud Billing API + response tokens
 * - OpenRouter: API /api/v1/key (credits balance)
 * - OpenAI: OPENAI_ADMIN_KEY via /v1/organization/costs (JÁ IMPLEMENTADO)
 * 
 * **LIMITES OFICIAIS 2025:**
 * Groq (llama-3.3-70b-versatile Free Tier):
 *   - RPM: 30-50 req/min (varies by account)
 *   - RPD: 14,400 req/dia (free tier verified 2025)
 *   - TPM: 6,000-18,000 tokens/min (model-specific, from headers)
 *   - TPD: Not provided in headers (track via RPD × avg tokens)
 *   - Source: console.groq.com/docs/rate-limits + headers
 * 
 * Gemini (2.0 Flash Free Tier):
 *   - RPM: 15 req/min
 *   - TPM: 1,000,000 tokens/min
 *   - RPD: 1,500 req/dia (updated 2025)
 *   - Source: ai.google.dev/gemini-api/docs/rate-limits
 * 
 * OpenRouter:
 *   - Free: 50 req/dia
 *   - Endpoint: GET /api/v1/key (retorna credits balance)
 */

import { db } from "../db";
import { providerLimits, llmProviderQuotas } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

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
    
    // ✅ NOTA: NÃO atualizamos llm_provider_quotas aqui!
    // apiQuotaRepository.incrementUsage() JÁ incrementa corretamente após cada chamada
    // Aqui apenas gravamos dados RAW em provider_limits para dashboard detalhado
    
    await db.insert(providerLimits).values({
      provider: 'groq',
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
      rawHeaders: headers,
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
   * - RPD: 1,500 req/day (verified November 2025)
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
      
      // ✅ NOTA: NÃO atualizamos llm_provider_quotas aqui!
      // apiQuotaRepository.incrementUsage() JÁ incrementa corretamente após cada chamada
      
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
          rpdRemaining: officialLimits.rpd - rpdUsed, // ✅ Simple calculation (not SQL)
          lastUpdated: sql`CURRENT_TIMESTAMP`
        }
      });
      
      console.log(`[ProviderLimits] ✅ Gemini updated: ${rpdUsed}/${officialLimits.rpd} req/day (source: official docs 2025)`);
    } catch (error: any) {
      console.error(`[ProviderLimits] Gemini update failed:`, error.message);
    }
  }
  
  /**
   * ✅ OPENROUTER: Fetch credits from API + track usage
   * 
   * OFFICIAL DOCS 2025: https://openrouter.ai/docs/api-reference/limits
   * - Free users: 50 requests/day, 20 RPM
   * - Users with $10+ credits: 1,000 requests/day, 20 RPM
   * 
   * GET /api/v1/key returns: { data: { credits: 1.50 } }
   * 
   * ✅ CRITICAL: Use PROVISIONING key for billing/quotas, NOT the model API key!
   * OPEN_ROUTER_API_KEY → Para chamar modelos (llama-3.3, etc)
   * OPEN_ROUTER_PROVISIONING_KEY → Para consultar billing/quotas/usage (esta!)
   */
  async updateOpenRouterLimits(): Promise<void> {
    const apiKey = process.env.OPEN_ROUTER_PROVISIONING_KEY;
    if (!apiKey) {
      console.warn('[ProviderLimits] OpenRouter Provisioning key not set');
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
      
      // ✅ OFFICIAL 2025 LIMITS: 50 RPD (free), 20 RPM
      const officialLimits = {
        rpm: 20, // Official: 20 requests per minute
        rpd: creditsBalance >= 10 ? 1000 : 50, // Official: 50 free, 1000 with $10+ credits
        tpm: null,
        tpd: null
      };
      
      // ✅ Get usage from token_usage table (our DB tracking)
      const usage = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 minute') as rpm_used,
          COUNT(*) FILTER (WHERE timestamp > NOW() - INTERVAL '1 day') as rpd_used
        FROM token_usage 
        WHERE provider = 'openrouter'
      `);
      
      const rpmUsed = Number((usage.rows[0] as any)?.rpm_used || 0);
      const rpdUsed = Number((usage.rows[0] as any)?.rpd_used || 0);
      
      // ✅ NOTA: NÃO atualizamos llm_provider_quotas aqui!
      // apiQuotaRepository.incrementUsage() JÁ incrementa corretamente após cada chamada
      
      await db.insert(providerLimits).values({
        provider: 'openrouter',
        rpm: officialLimits.rpm,
        rpd: officialLimits.rpd,
        tpm: officialLimits.tpm,
        tpd: officialLimits.tpd,
        rpmUsed,
        rpdUsed,
        tpmUsed: null,
        tpdUsed: null,
        rpmRemaining: officialLimits.rpm - rpmUsed,
        rpdRemaining: officialLimits.rpd - rpdUsed,
        tpmRemaining: null,
        tpdRemaining: null,
        rpmResetAt: null,
        rpdResetAt: null,
        tpmResetAt: null,
        tpdResetAt: null,
        creditsBalance,
        creditsUsed: null,
        rawHeaders: null,
        rawResponse: data,
        source: 'openrouter_api_official_2025'
      }).onConflictDoUpdate({
        target: providerLimits.provider,
        set: {
          rpm: officialLimits.rpm,
          rpd: officialLimits.rpd,
          rpmUsed,
          rpdUsed,
          rpmRemaining: officialLimits.rpm - rpmUsed,
          rpdRemaining: officialLimits.rpd - rpdUsed,
          creditsBalance,
          rawResponse: data,
          lastUpdated: sql`CURRENT_TIMESTAMP`
        }
      });
      
      console.log(`[ProviderLimits] ✅ OpenRouter updated: ${rpdUsed}/${officialLimits.rpd} req/day, $${creditsBalance} credits (source: official docs 2025)`);
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
