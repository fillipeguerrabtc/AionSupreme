import { db } from "../db";
import { providerLimits } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * ProviderLimitsService - Single source of truth for provider limits
 * 
 * ZERO hardcoded values. All data fetched from PostgreSQL (provider_limits table).
 * If provider doesn't supply data, returns null (honest approach).
 * 
 * Production-grade helper for:
 * - Backend orchestrators (free-apis.ts)
 * - API routes (/api/tokens/quotas)
 * - Admin dashboards
 */

type LimitMetric = 'rpm' | 'rpd' | 'tpm' | 'tpd';
type UsageMetric = 'rpmUsed' | 'rpdUsed' | 'tpmUsed' | 'tpdUsed';
type RemainingMetric = 'rpmRemaining' | 'rpdRemaining' | 'tpmRemaining' | 'tpdRemaining';

export interface ProviderLimitData {
  limits: {
    rpm: number | null;
    rpd: number | null;
    tpm: number | null;
    tpd: number | null;
  };
  usage: {
    rpmUsed: number | null;
    rpdUsed: number | null;
    tpmUsed: number | null;
    tpdUsed: number | null;
  };
  remaining: {
    rpmRemaining: number | null;
    rpdRemaining: number | null;
    tpmRemaining: number | null;
    tpdRemaining: number | null;
  };
  resetAt: {
    rpmResetAt: string | null;
    rpdResetAt: string | null;
    tpmResetAt: string | null;
    tpdResetAt: string | null;
  };
  creditsBalance: number | null;
  creditsUsed: number | null;
  lastUpdated: Date | null;
  source: string | null;
}

class ProviderLimitsService {
  /**
   * Get limit for a specific provider and metric
   * @param provider - 'groq', 'gemini', 'openrouter', etc.
   * @param metric - 'rpm', 'rpd', 'tpm', 'tpd'
   * @returns number | null - REAL value from DB, or null if provider doesn't supply it
   */
  async getLimit(provider: string, metric: LimitMetric): Promise<number | null> {
    try {
      const result = await db
        .select()
        .from(providerLimits)
        .where(eq(providerLimits.provider, provider))
        .limit(1);

      if (!result || result.length === 0) {
        console.log(`[ProviderLimitsService] No data for provider: ${provider}`);
        return null;
      }

      const data = result[0];
      return data[metric] ?? null;
    } catch (error: any) {
      console.error(`[ProviderLimitsService] Error fetching ${metric} for ${provider}:`, error.message);
      return null;
    }
  }

  /**
   * Get usage for a specific provider and metric
   */
  async getUsage(provider: string, metric: UsageMetric): Promise<number | null> {
    try {
      const result = await db
        .select()
        .from(providerLimits)
        .where(eq(providerLimits.provider, provider))
        .limit(1);

      if (!result || result.length === 0) return null;
      return result[0][metric] ?? null;
    } catch (error: any) {
      console.error(`[ProviderLimitsService] Error fetching ${metric} for ${provider}:`, error.message);
      return null;
    }
  }

  /**
   * Get remaining quota for a specific provider and metric
   */
  async getRemaining(provider: string, metric: RemainingMetric): Promise<number | null> {
    try {
      const result = await db
        .select()
        .from(providerLimits)
        .where(eq(providerLimits.provider, provider))
        .limit(1);

      if (!result || result.length === 0) return null;
      return result[0][metric] ?? null;
    } catch (error: any) {
      console.error(`[ProviderLimitsService] Error fetching ${metric} for ${provider}:`, error.message);
      return null;
    }
  }

  /**
   * Get ALL data for a provider (limits, usage, remaining, credits)
   * @returns ProviderLimitData | null
   */
  async getProviderData(provider: string): Promise<ProviderLimitData | null> {
    try {
      const result = await db
        .select()
        .from(providerLimits)
        .where(eq(providerLimits.provider, provider))
        .limit(1);

      if (!result || result.length === 0) {
        console.log(`[ProviderLimitsService] No data for provider: ${provider}`);
        return null;
      }

      const data = result[0];
      return {
        limits: {
          rpm: data.rpm ?? null,
          rpd: data.rpd ?? null,
          tpm: data.tpm ?? null,
          tpd: data.tpd ?? null,
        },
        usage: {
          rpmUsed: data.rpmUsed ?? null,
          rpdUsed: data.rpdUsed ?? null,
          tpmUsed: data.tpmUsed ?? null,
          tpdUsed: data.tpdUsed ?? null,
        },
        remaining: {
          rpmRemaining: data.rpmRemaining ?? null,
          rpdRemaining: data.rpdRemaining ?? null,
          tpmRemaining: data.tpmRemaining ?? null,
          tpdRemaining: data.tpdRemaining ?? null,
        },
        resetAt: {
          rpmResetAt: data.rpmResetAt ?? null,
          rpdResetAt: data.rpdResetAt ?? null,
          tpmResetAt: data.tpmResetAt ?? null,
          tpdResetAt: data.tpdResetAt ?? null,
        },
        creditsBalance: data.creditsBalance ?? null,
        creditsUsed: data.creditsUsed ?? null,
        lastUpdated: data.lastUpdated ?? null,
        source: data.source ?? null,
      };
    } catch (error: any) {
      console.error(`[ProviderLimitsService] Error fetching data for ${provider}:`, error.message);
      return null;
    }
  }

  /**
   * Get credits balance (for OpenRouter, etc.)
   */
  async getCreditsBalance(provider: string): Promise<number | null> {
    try {
      const result = await db
        .select()
        .from(providerLimits)
        .where(eq(providerLimits.provider, provider))
        .limit(1);

      if (!result || result.length === 0) return null;
      return result[0].creditsBalance ?? null;
    } catch (error: any) {
      console.error(`[ProviderLimitsService] Error fetching credits for ${provider}:`, error.message);
      return null;
    }
  }

  /**
   * Check if provider has any data in DB
   */
  async hasData(provider: string): Promise<boolean> {
    try {
      const result = await db
        .select()
        .from(providerLimits)
        .where(eq(providerLimits.provider, provider))
        .limit(1);

      return result && result.length > 0;
    } catch (error: any) {
      console.error(`[ProviderLimitsService] Error checking provider existence:`, error.message);
      return false;
    }
  }
}

// Singleton instance
export const providerLimitsService = new ProviderLimitsService();
