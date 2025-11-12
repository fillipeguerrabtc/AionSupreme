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
   * ❌ GEMINI: DISABLED - No real API available yet
   * 
   * Gemini does NOT provide rate limit headers in responses.
   * Google Cloud Billing API exists but requires complex setup.
   * 
   * TODO: Implement Google Cloud Billing API integration
   * Endpoint: projects.locations.endpoints.predict
   * Docs: https://cloud.google.com/vertex-ai/docs/quotas
   * 
   * For now: Mark as unavailable until real source exists.
   */
  async updateGeminiLimits(tokensUsed: number): Promise<void> {
    console.warn('[ProviderLimits] ⚠️  Gemini tracking DISABLED - no real API available (only local token counting)');
    // Do nothing - avoid storing misleading calculated data
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
