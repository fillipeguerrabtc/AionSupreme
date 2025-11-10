/**
 * API Quota Repository
 * PostgreSQL-backed quota management with atomic operations and daily reset logic
 */

import { db } from '../db';
import { llmProviderQuotas, type LlmProviderQuota } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ name: 'api-quota-repository' });

// 5s TTL cache to reduce DB round-trips
interface CacheEntry {
  data: LlmProviderQuota;
  expiresAt: number;
}

const quotaCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5000; // 5 seconds

export class ApiQuotaRepository {
  /**
   * Get quota for a specific provider (with 5s cache)
   */
  async getQuota(provider: string): Promise<LlmProviderQuota | null> {
    // Check cache first
    const cached = quotaCache.get(provider);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    // Fetch from DB
    const [quota] = await db
      .select()
      .from(llmProviderQuotas)
      .where(eq(llmProviderQuotas.provider, provider))
      .limit(1);

    if (!quota) {
      logger.warn({ provider }, 'Provider quota not found');
      return null;
    }

    // Auto-reset if needed (application-side)
    const shouldReset = this.shouldResetDaily(quota.lastResetAt);
    if (shouldReset) {
      return await this.resetQuota(provider);
    }

    // Update cache
    quotaCache.set(provider, {
      data: quota,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return quota;
  }

  /**
   * Get all quotas ordered by rotation priority (with cache)
   */
  async getAllQuotas(): Promise<LlmProviderQuota[]> {
    const quotas = await db
      .select()
      .from(llmProviderQuotas)
      .orderBy(llmProviderQuotas.rotationPriority);

    // Auto-reset any that need it
    const now = Date.now();
    const resetPromises = quotas
      .filter(q => this.shouldResetDaily(q.lastResetAt))
      .map(q => this.resetQuota(q.provider));

    if (resetPromises.length > 0) {
      await Promise.all(resetPromises);
      // Re-fetch after resets
      return await db
        .select()
        .from(llmProviderQuotas)
        .orderBy(llmProviderQuotas.rotationPriority);
    }

    return quotas;
  }

  /**
   * Atomically increment quota usage (returns updated row)
   * Throws error if quota exceeded
   * 
   * CRITICAL: Uses atomic WHERE clause to prevent race conditions
   * The UPDATE only succeeds if the new count stays within limits
   */
  async incrementUsage(
    provider: string,
    requestsDelta: number = 1,
    tokensDelta: number = 0
  ): Promise<LlmProviderQuota> {
    // Atomic UPDATE with WHERE guards to prevent overshooting
    // The UPDATE only executes if the increment stays within limits
    const [updated] = await db
      .update(llmProviderQuotas)
      .set({
        requestCount: sql`${llmProviderQuotas.requestCount} + ${requestsDelta}`,
        tokenCount: sql`${llmProviderQuotas.tokenCount} + ${tokensDelta}`,
        updatedAt: sql`NOW()`,
      })
      .where(
        and(
          eq(llmProviderQuotas.provider, provider),
          // Atomic check: new request count must stay within limit
          sql`${llmProviderQuotas.requestCount} + ${requestsDelta} <= ${llmProviderQuotas.dailyRequestLimit}`,
          // Atomic check: new token count must stay within limit (if limit exists)
          sql`(${llmProviderQuotas.dailyTokenLimit} IS NULL OR ${llmProviderQuotas.tokenCount} + ${tokensDelta} <= ${llmProviderQuotas.dailyTokenLimit})`
        )
      )
      .returning();

    // If no row updated, either provider doesn't exist OR quota was exceeded
    if (!updated) {
      // Fetch current state to provide better error message
      const current = await db
        .select()
        .from(llmProviderQuotas)
        .where(eq(llmProviderQuotas.provider, provider))
        .limit(1);

      if (current.length === 0) {
        throw new Error(`Provider ${provider} not found`);
      }

      const quota = current[0];
      
      // Check which limit was hit
      if (quota.requestCount + requestsDelta > quota.dailyRequestLimit) {
        logger.warn(
          {
            provider,
            currentCount: quota.requestCount,
            requestsDelta,
            dailyRequestLimit: quota.dailyRequestLimit,
          },
          'Request quota exceeded - atomic enforcement prevented increment'
        );
        throw new Error(`Quota exceeded for ${provider}: ${quota.requestCount}/${quota.dailyRequestLimit} requests used`);
      }

      if (quota.dailyTokenLimit && quota.tokenCount + tokensDelta > quota.dailyTokenLimit) {
        logger.warn(
          {
            provider,
            currentTokens: quota.tokenCount,
            tokensDelta,
            dailyTokenLimit: quota.dailyTokenLimit,
          },
          'Token quota exceeded - atomic enforcement prevented increment'
        );
        throw new Error(`Token quota exceeded for ${provider}: ${quota.tokenCount}/${quota.dailyTokenLimit} tokens used`);
      }

      // Should never reach here
      throw new Error(`Failed to increment quota for ${provider} (unknown reason)`);
    }

    // Invalidate cache
    quotaCache.delete(provider);

    logger.debug(
      {
        provider,
        requestCount: updated.requestCount,
        tokenCount: updated.tokenCount,
      },
      'Quota incremented atomically'
    );

    return updated;
  }

  /**
   * Reset quota for a provider (sets counters to 0)
   */
  async resetQuota(provider: string): Promise<LlmProviderQuota> {
    const [updated] = await db
      .update(llmProviderQuotas)
      .set({
        requestCount: 0,
        tokenCount: 0,
        lastResetAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      })
      .where(eq(llmProviderQuotas.provider, provider))
      .returning();

    if (!updated) {
      throw new Error(`Provider ${provider} not found`);
    }

    // Invalidate cache
    quotaCache.delete(provider);

    logger.info({ provider }, 'Quota reset');
    return updated;
  }

  /**
   * Check if quota should be reset based on last reset timestamp
   * Resets daily at midnight (UTC)
   */
  private shouldResetDaily(lastResetAt: Date): boolean {
    const now = new Date();
    const lastReset = new Date(lastResetAt);

    // Check if we've crossed a day boundary
    return (
      lastReset.getUTCDate() !== now.getUTCDate() ||
      lastReset.getUTCMonth() !== now.getUTCMonth() ||
      lastReset.getUTCFullYear() !== now.getUTCFullYear()
    );
  }

  /**
   * Get status for all providers (for backwards compatibility with existing code)
   * Returns legacy format: { used, limit, remaining } + new format: { requests, tokens, requestLimit }
   */
  async getStatus() {
    const quotas = await this.getAllQuotas();

    const status: Record<string, any> = {};

    for (const quota of quotas) {
      const hasCredits = quota.requestCount < quota.dailyRequestLimit;

      status[quota.provider] = {
        // New format (recommended)
        available: hasCredits,
        requests: quota.requestCount,
        tokens: quota.tokenCount,
        requestLimit: quota.dailyRequestLimit,
        tokenLimit: quota.dailyTokenLimit,
        remaining: quota.dailyRequestLimit - quota.requestCount,

        // Legacy format (backwards compatibility)
        used: quota.requestCount,
        limit: quota.dailyRequestLimit,
      };
    }

    return status;
  }

  /**
   * Check if provider has available credits
   */
  async hasCredits(provider: string): Promise<boolean> {
    const quota = await this.getQuota(provider);
    if (!quota) return false;

    return quota.requestCount < quota.dailyRequestLimit;
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    quotaCache.clear();
    logger.debug('Quota cache cleared');
  }
}

// Singleton instance
export const apiQuotaRepository = new ApiQuotaRepository();
