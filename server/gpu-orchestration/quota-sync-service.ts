/**
 * QUOTA SYNC SERVICE
 * ==================
 * 
 * Orchestrates quota scraping for Kaggle + Colab, respecting activation rules.
 * 
 * ACTIVATION RULES (CRITICAL!):
 * 
 * KAGGLE - ON-DEMAND + IDLE:
 * - Liga quando tarefa chega (training/inference/KB/internet)
 * - Executa → Aguarda 10min idle
 * - Nova tarefa? → Executa + 10min idle novamente
 * - Sem tarefa em 10min? → DESLIGA
 * - Session: 8.4h (70% × 12h)
 * - Weekly: 21h (70% × 30h)
 * - Violar = BAN PERMANENTE!
 * 
 * COLAB - SCHEDULE FIXO:
 * - Liga → 8.4h → Desliga → 36h rest → Repete
 * - ❌ NUNCA on-demand!
 * - Session: 8.4h (70% × 12h)
 * - Cooldown: 36h obrigatório
 * - Violar = BAN PERMANENTE!
 * 
 * SYNC FREQUENCY:
 * - Auto-sync every 10 minutes (via node-cron)
 * - Manual sync via POST /api/gpu/sync-now
 * - Saves results to PostgreSQL (ZERO in-memory!)
 */

import { db } from '../db';
import { quotaScrapingResults, type InsertQuotaScrapingResult } from '../../shared/schema';
import { cookieSessionService } from './cookie-session-service';
import { kaggleScraperService, type KaggleQuotaData } from './kaggle-scraper-service';
import { colabScraperService, type ColabQuotaData } from './colab-scraper-service';
import { eq, desc, and } from 'drizzle-orm';
import { logger } from '../services/logger-service';

export interface QuotaSyncResult {
  provider: 'kaggle' | 'colab';
  accountEmail: string;
  success: boolean;
  quotaData?: KaggleQuotaData | ColabQuotaData;
  error?: string;
  durationMs: number;
}

export class QuotaSyncService {
  /**
   * Syncs quota for all valid sessions
   * Returns array of sync results for each provider + account
   */
  async syncAll(): Promise<QuotaSyncResult[]> {
    const results: QuotaSyncResult[] = [];
    
    // Get all valid sessions
    const sessions = await cookieSessionService.getAllSessions();
    
    if (sessions.length === 0) {
      logger.warn('[QuotaSyncService] No valid Google auth sessions found - skipping sync');
      return results;
    }
    
    // Sync each session (Kaggle + Colab per account)
    for (const session of sessions) {
      const email = session.accountEmail;
      const cookies = session.cookies;
      
      // Sync Kaggle
      const kaggleResult = await this.syncKaggle(email, cookies);
      results.push(kaggleResult);
      
      // Sync Colab
      const colabResult = await this.syncColab(email, cookies);
      results.push(colabResult);
      
      // Update last sync timestamp
      if (kaggleResult.success || colabResult.success) {
        await cookieSessionService.updateLastSync(email);
      }
      
      // If both failed, mark session as invalid (cookies likely expired)
      if (!kaggleResult.success && !colabResult.success) {
        logger.warn(`[QuotaSyncService] Both Kaggle and Colab sync failed for ${email} - invalidating session`);
        await cookieSessionService.invalidateSession(email);
      }
    }
    
    return results;
  }
  
  /**
   * Syncs Kaggle quota for a single account
   */
  private async syncKaggle(email: string, cookies: any[]): Promise<QuotaSyncResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`[QuotaSyncService] Syncing Kaggle quota for ${email}...`);
      
      const quotaData = await kaggleScraperService.scrapeQuota(cookies);
      const durationMs = Date.now() - startTime;
      
      // Save to PostgreSQL
      await db.insert(quotaScrapingResults).values({
        provider: 'kaggle',
        accountEmail: email,
        quotaData: {
          sessionRemainingHours: quotaData.sessionRemainingHours,
          sessionMaxHours: quotaData.sessionMaxHours,
          weeklyUsedHours: quotaData.weeklyUsedHours,
          weeklyRemainingHours: quotaData.weeklyRemainingHours,
          weeklyMaxHours: quotaData.weeklyMaxHours,
          canStart: quotaData.canStart,
          shouldStop: quotaData.shouldStop,
        },
        scrapingSuccess: true,
        scrapingDurationMs: durationMs,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Expires in 10 minutes
      });
      
      logger.info(`[QuotaSyncService] ✅ Kaggle sync successful for ${email} (${durationMs}ms)`);
      
      return {
        provider: 'kaggle',
        accountEmail: email,
        success: true,
        quotaData,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`[QuotaSyncService] ❌ Kaggle sync failed for ${email}: ${errorMessage}`);
      
      // Save error to PostgreSQL
      await db.insert(quotaScrapingResults).values({
        provider: 'kaggle',
        accountEmail: email,
        quotaData: {},
        scrapingSuccess: false,
        scrapingError: errorMessage,
        scrapingDurationMs: durationMs,
      });
      
      return {
        provider: 'kaggle',
        accountEmail: email,
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }
  
  /**
   * Syncs Colab quota for a single account
   */
  private async syncColab(email: string, cookies: any[]): Promise<QuotaSyncResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`[QuotaSyncService] Syncing Colab quota for ${email}...`);
      
      const quotaData = await colabScraperService.scrapeQuota(cookies);
      const durationMs = Date.now() - startTime;
      
      // Save to PostgreSQL
      await db.insert(quotaScrapingResults).values({
        provider: 'colab',
        accountEmail: email,
        quotaData: {
          computeUnitsUsed: quotaData.computeUnitsUsed,
          computeUnitsTotal: quotaData.computeUnitsTotal,
          computeUnitsRemaining: quotaData.computeUnitsRemaining,
          sessionRemainingMinutes: quotaData.sessionRemainingMinutes,
          canStart: quotaData.canStart,
          shouldStop: quotaData.shouldStop,
          inCooldown: quotaData.inCooldown,
          cooldownRemainingHours: quotaData.cooldownRemainingHours,
        },
        scrapingSuccess: true,
        scrapingDurationMs: durationMs,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // Expires in 10 minutes
      });
      
      logger.info(`[QuotaSyncService] ✅ Colab sync successful for ${email} (${durationMs}ms)`);
      
      return {
        provider: 'colab',
        accountEmail: email,
        success: true,
        quotaData,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`[QuotaSyncService] ❌ Colab sync failed for ${email}: ${errorMessage}`);
      
      // Save error to PostgreSQL
      await db.insert(quotaScrapingResults).values({
        provider: 'colab',
        accountEmail: email,
        quotaData: {},
        scrapingSuccess: false,
        scrapingError: errorMessage,
        scrapingDurationMs: durationMs,
      });
      
      return {
        provider: 'colab',
        accountEmail: email,
        success: false,
        error: errorMessage,
        durationMs,
      };
    }
  }
  
  /**
   * Gets latest quota data from PostgreSQL (cached)
   * Returns null if no data or data is stale (>10 minutes old)
   */
  async getLatestQuota(provider: 'kaggle' | 'colab', email: string) {
    const result = await db.query.quotaScrapingResults.findFirst({
      where: and(
        eq(quotaScrapingResults.provider, provider),
        eq(quotaScrapingResults.accountEmail, email),
        eq(quotaScrapingResults.scrapingSuccess, true)
      ),
      orderBy: [desc(quotaScrapingResults.scrapedAt)],
    });
    
    if (!result) {
      return null;
    }
    
    // Check if data is stale
    if (result.expiresAt && result.expiresAt < new Date()) {
      return null;
    }
    
    return result;
  }
  
  /**
   * Gets all latest quota data (all providers, all accounts)
   */
  async getAllLatestQuotas() {
    const sessions = await cookieSessionService.getAllSessions();
    const quotas = [];
    
    for (const session of sessions) {
      const kaggle = await this.getLatestQuota('kaggle', session.accountEmail);
      const colab = await this.getLatestQuota('colab', session.accountEmail);
      
      quotas.push({
        email: session.accountEmail,
        name: session.accountName,
        kaggle: kaggle?.quotaData || null,
        colab: colab?.quotaData || null,
        lastSyncAt: session.lastSyncAt,
      });
    }
    
    return quotas;
  }
}

export const quotaSyncService = new QuotaSyncService();
