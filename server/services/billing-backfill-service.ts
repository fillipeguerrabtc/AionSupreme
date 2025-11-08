/**
 * Billing Backfill Service
 * 
 * ✅ P1.3: Automated backfill service that runs on application startup
 * 
 * PURPOSE:
 * - Ensures all existing billing records have correct provider column
 * - Runs automatically on every startup (idempotent - safe to run multiple times)
 * - Handles migration from legacy schema to new provider-based schema
 * 
 * BACKFILL LOGIC:
 * - OpenRouter: periodKey starts with "openrouter-"
 * - Gemini: periodKey starts with "gemini-"
 * - OpenAI: Everything else (default)
 */

import { db } from "../db";
import { openai_billing_sync } from "@shared/schema";
import { sql } from "drizzle-orm";
import { logger } from "./logger-service";

class BillingBackfillService {
  /**
   * Run backfill for all providers
   * Called automatically on application startup
   */
  async runBackfill(): Promise<{
    openai: number;
    openrouter: number;
    gemini: number;
  }> {
    try {
      logger.info("[Billing Backfill] 🔄 Starting automated backfill...");

      // OpenRouter: periodKey like "openrouter-%"
      const openrouterResult = await db
        .update(openai_billing_sync)
        .set({ provider: "openrouter" })
        .where(
          sql`${openai_billing_sync.periodKey} LIKE 'openrouter-%' AND ${openai_billing_sync.provider} != 'openrouter'`
        );

      const openrouterCount = openrouterResult.rowCount || 0;

      // Gemini: periodKey like "gemini-%"
      const geminiResult = await db
        .update(openai_billing_sync)
        .set({ provider: "gemini" })
        .where(
          sql`${openai_billing_sync.periodKey} LIKE 'gemini-%' AND ${openai_billing_sync.provider} != 'gemini'`
        );

      const geminiCount = geminiResult.rowCount || 0;

      // OpenAI: No prefix (default)
      // Note: OpenAI records should already have provider='openai' from schema default
      // But we'll update any that might have been incorrectly set
      const openaiResult = await db
        .update(openai_billing_sync)
        .set({ provider: "openai" })
        .where(
          sql`${openai_billing_sync.periodKey} NOT LIKE 'openrouter-%' 
              AND ${openai_billing_sync.periodKey} NOT LIKE 'gemini-%' 
              AND ${openai_billing_sync.provider} != 'openai'`
        );

      const openaiCount = openaiResult.rowCount || 0;

      const totalUpdated = openaiCount + openrouterCount + geminiCount;

      if (totalUpdated > 0) {
        logger.info(`[Billing Backfill] ✅ Backfill complete: ${totalUpdated} records updated`);
        logger.info(`   - OpenAI: ${openaiCount}`);
        logger.info(`   - OpenRouter: ${openrouterCount}`);
        logger.info(`   - Gemini: ${geminiCount}`);
      } else {
        logger.info("[Billing Backfill] ✅ All records already have correct provider");
      }

      return {
        openai: openaiCount,
        openrouter: openrouterCount,
        gemini: geminiCount,
      };
    } catch (error: any) {
      logger.error("[Billing Backfill] ❌ Backfill failed:", error.message);
      throw error;
    }
  }

  /**
   * Verify all records have correct provider
   * Useful for testing/debugging
   */
  async verifyProviders(): Promise<{
    openai: number;
    openrouter: number;
    gemini: number;
    total: number;
  }> {
    const counts = await db
      .select({
        provider: openai_billing_sync.provider,
        count: sql<number>`count(*)::int`,
      })
      .from(openai_billing_sync)
      .groupBy(openai_billing_sync.provider);

    const result = {
      openai: 0,
      openrouter: 0,
      gemini: 0,
      total: 0,
    };

    for (const row of counts) {
      const count = Number(row.count);
      result.total += count;

      if (row.provider === "openai") result.openai = count;
      else if (row.provider === "openrouter") result.openrouter = count;
      else if (row.provider === "gemini") result.gemini = count;
    }

    return result;
  }
}

// Singleton
export const billingBackfillService = new BillingBackfillService();
