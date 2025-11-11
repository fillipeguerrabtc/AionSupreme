/**
 * QUOTA ENFORCEMENT SERVICE - Enterprise-Grade GPU Quota Management
 * ===================================================================
 * 
 * 🎯 GARANTIAS CRÍTICAS (70% SAFETY LIMIT):
 * 
 * 1. AUTO-SHUTDOWN GARANTIDO
 *    - GPUs DESATIVAM automaticamente após treino/inferência
 *    - Zero vazamento de quota (GPU rodando sem controle)
 *    - Watchdog recupera timers após restart
 * 
 * 2. QUOTA 70% LIMITE RÍGIDO (NUNCA SUPERAR)
 *    Kaggle:
 *      - Semanal: 30h → 70% = 21h máximo (75600000ms)
 *      - Por sessão: 12h → 70% = 8.4h máximo (30240000ms)
 *      - Concurrent: 1 sessão apenas
 *      - Reset: Segunda-feira 00:00 UTC
 *    Colab:
 *      - Por sessão: 12h → 70% = 8.4h máximo (30240000ms)
 *      - Cooldown: 36h entre sessões (129600000ms)
 *      - Sem limite semanal (apenas cooldown)
 * 
 * 3. VERIFICAÇÃO PRÉ-STARTUP
 *    - SEMPRE verifica se já tem GPU online ANTES de ativar outra
 *    - Previne desperdício de quota
 *    - Enforce Kaggle single-session constraint
 * 
 * ARQUITETURA:
 * - PostgreSQL-backed (gpu_session_state table)
 * - Async factory pattern para DB hydration
 * - Structured logging (Pino)
 * - Non-throwing error handling
 */

import { db } from '../db';
import { gpuSessionState, gpuWorkers, type GpuSessionState } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import pino from 'pino';

const logger = pino({ name: 'QuotaEnforcementService' });

// ============================================================================
// CONSTANTS (70% SAFETY LIMITS)
// ============================================================================

const QUOTA_LIMITS = {
  // Kaggle limits (70% of official limits)
  KAGGLE_WEEKLY_LIMIT_MS: 21 * 60 * 60 * 1000, // 21h = 75600000ms (70% of 30h)
  KAGGLE_SESSION_LIMIT_MS: 8.4 * 60 * 60 * 1000, // 8.4h = 30240000ms (70% of 12h)
  KAGGLE_MAX_CONCURRENT: 1,
  KAGGLE_WEEK_RESET_DAY: 1, // Monday (0=Sunday, 1=Monday)
  
  // Colab limits (70% of official limits)
  COLAB_SESSION_LIMIT_MS: 8.4 * 60 * 60 * 1000, // 8.4h = 30240000ms (70% of 12h)
  COLAB_COOLDOWN_MS: 36 * 60 * 60 * 1000, // 36h = 129600000ms
  
  // Keep-alive interval (60min default)
  KEEP_ALIVE_INTERVAL_MS: 60 * 60 * 1000, // 60min = 3600000ms
} as const;

// ============================================================================
// TYPES
// ============================================================================

interface QuotaValidationResult {
  canStart: boolean;
  reason: string;
  quotaDetails?: {
    provider: 'kaggle' | 'colab';
    sessionLimitMs: number;
    weeklyUsedMs?: number; // Kaggle only
    weeklyLimitMs?: number; // Kaggle only
    cooldownUntil?: Date; // Colab only
    activeSessions?: number; // Current active sessions
  };
}

interface SessionStartResult {
  success: boolean;
  sessionId?: number;
  autoShutdownAt?: Date;
  error?: string;
}

interface SessionUpdateResult {
  success: boolean;
  shouldShutdown: boolean;
  reason?: string;
}

// ============================================================================
// QUOTA ENFORCEMENT SERVICE
// ============================================================================

export class QuotaEnforcementService {
  private static instance: QuotaEnforcementService | null = null;
  
  private constructor() {
    logger.info({ component: 'QuotaEnforcementService' }, 'Service initialized');
  }
  
  /**
   * Async factory pattern (singleton)
   * Ensures DB is ready before service is used
   */
  static async create(): Promise<QuotaEnforcementService> {
    if (!QuotaEnforcementService.instance) {
      QuotaEnforcementService.instance = new QuotaEnforcementService();
      
      // Recovery: Find orphaned sessions and log warnings
      await QuotaEnforcementService.instance.recoverOrphanedSessions();
    }
    
    return QuotaEnforcementService.instance;
  }
  
  /**
   * GARANTIA 3: Verificação PRÉ-STARTUP
   * SEMPRE verifica se já tem GPU online ANTES de ativar outra
   */
  async validateCanStart(workerId: number, provider: 'kaggle' | 'colab'): Promise<QuotaValidationResult> {
    try {
      logger.info({ workerId, provider, component: 'QuotaEnforcementService' }, 'Validating quota before start');
      
      // 1. Check if worker already has active session
      const existingSession = await db.query.gpuSessionState.findFirst({
        where: and(
          eq(gpuSessionState.workerId, workerId),
          eq(gpuSessionState.isActive, true)
        ),
      });
      
      if (existingSession) {
        logger.warn({ workerId, sessionId: existingSession.id, component: 'QuotaEnforcementService' }, 'Worker already has active session - preventing duplicate');
        return {
          canStart: false,
          reason: `Worker ${workerId} already has active session (ID: ${existingSession.id})`,
        };
      }
      
      // 2. Check for active sessions globally (prevent multiple startups)
      const allActiveSessions = await db.query.gpuSessionState.findMany({
        where: eq(gpuSessionState.isActive, true),
      });
      
      if (provider === 'kaggle') {
        // Kaggle: max 1 concurrent session GLOBALLY
        const kaggleActiveSessions = allActiveSessions.filter(s => s.provider === 'kaggle');
        
        if (kaggleActiveSessions.length >= QUOTA_LIMITS.KAGGLE_MAX_CONCURRENT) {
          logger.warn({ 
            activeKaggleSessions: kaggleActiveSessions.length, 
            component: 'QuotaEnforcementService' 
          }, 'Kaggle concurrent session limit reached');
          
          return {
            canStart: false,
            reason: `Kaggle concurrent session limit reached (${kaggleActiveSessions.length}/${QUOTA_LIMITS.KAGGLE_MAX_CONCURRENT})`,
            quotaDetails: {
              provider: 'kaggle',
              sessionLimitMs: QUOTA_LIMITS.KAGGLE_SESSION_LIMIT_MS,
              activeSessions: kaggleActiveSessions.length,
            },
          };
        }
        
        // 3. Check Kaggle weekly quota (70% = 21h)
        const weeklyQuotaCheck = await this.checkKaggleWeeklyQuota(workerId);
        if (!weeklyQuotaCheck.canStart) {
          return weeklyQuotaCheck;
        }
      } else if (provider === 'colab') {
        // 4. Check Colab cooldown (36h between sessions)
        const cooldownCheck = await this.checkColabCooldown(workerId);
        if (!cooldownCheck.canStart) {
          return cooldownCheck;
        }
      }
      
      // All checks passed
      logger.info({ workerId, provider, component: 'QuotaEnforcementService' }, 'Quota validation PASSED - can start session');
      return {
        canStart: true,
        reason: 'All quota checks passed',
        quotaDetails: {
          provider,
          sessionLimitMs: provider === 'kaggle' ? QUOTA_LIMITS.KAGGLE_SESSION_LIMIT_MS : QUOTA_LIMITS.COLAB_SESSION_LIMIT_MS,
          activeSessions: allActiveSessions.length,
        },
      };
      
    } catch (error) {
      logger.error({ workerId, provider, error, component: 'QuotaEnforcementService' }, 'Error validating quota');
      return {
        canStart: false,
        reason: `Quota validation error: ${error}`,
      };
    }
  }
  
  /**
   * Check Kaggle weekly quota (70% = 21h)
   */
  private async checkKaggleWeeklyQuota(workerId: number): Promise<QuotaValidationResult> {
    try {
      const now = new Date();
      const weekStart = this.getWeekStart(now);
      
      // Sum weekly usage from all Kaggle sessions (current week)
      const weekSessions = await db.query.gpuSessionState.findMany({
        where: and(
          eq(gpuSessionState.provider, 'kaggle'),
          sql`${gpuSessionState.sessionStarted} >= ${weekStart}`
        ),
      });
      
      const weeklyUsedMs = weekSessions.reduce((total, session) => {
        return total + (session.sessionDurationMs || 0);
      }, 0);
      
      const weeklyRemainingMs = QUOTA_LIMITS.KAGGLE_WEEKLY_LIMIT_MS - weeklyUsedMs;
      
      if (weeklyRemainingMs < QUOTA_LIMITS.KAGGLE_SESSION_LIMIT_MS) {
        logger.warn({ 
          weeklyUsedMs, 
          weeklyLimitMs: QUOTA_LIMITS.KAGGLE_WEEKLY_LIMIT_MS,
          weeklyRemainingMs,
          component: 'QuotaEnforcementService'
        }, 'Kaggle weekly quota limit reached (70%)');
        
        return {
          canStart: false,
          reason: `Kaggle weekly quota exceeded: ${this.msToHours(weeklyUsedMs)}h / ${this.msToHours(QUOTA_LIMITS.KAGGLE_WEEKLY_LIMIT_MS)}h used`,
          quotaDetails: {
            provider: 'kaggle',
            sessionLimitMs: QUOTA_LIMITS.KAGGLE_SESSION_LIMIT_MS,
            weeklyUsedMs,
            weeklyLimitMs: QUOTA_LIMITS.KAGGLE_WEEKLY_LIMIT_MS,
          },
        };
      }
      
      return {
        canStart: true,
        reason: 'Kaggle weekly quota OK',
        quotaDetails: {
          provider: 'kaggle',
          sessionLimitMs: QUOTA_LIMITS.KAGGLE_SESSION_LIMIT_MS,
          weeklyUsedMs,
          weeklyLimitMs: QUOTA_LIMITS.KAGGLE_WEEKLY_LIMIT_MS,
        },
      };
      
    } catch (error) {
      logger.error({ workerId, error, component: 'QuotaEnforcementService' }, 'Error checking Kaggle weekly quota');
      return {
        canStart: false,
        reason: `Kaggle quota check error: ${error}`,
      };
    }
  }
  
  /**
   * Check Colab cooldown (36h between sessions)
   */
  private async checkColabCooldown(workerId: number): Promise<QuotaValidationResult> {
    try {
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });
      
      if (!worker) {
        return {
          canStart: false,
          reason: `Worker ${workerId} not found`,
        };
      }
      
      const cooldownUntil = worker.cooldownUntil;
      
      if (!cooldownUntil) {
        // No cooldown = first session or reset
        return {
          canStart: true,
          reason: 'Colab: no cooldown active',
          quotaDetails: {
            provider: 'colab',
            sessionLimitMs: QUOTA_LIMITS.COLAB_SESSION_LIMIT_MS,
          },
        };
      }
      
      const now = new Date();
      const cooldownEnd = new Date(cooldownUntil);
      
      if (now < cooldownEnd) {
        const remainingMs = cooldownEnd.getTime() - now.getTime();
        
        logger.warn({ 
          workerId, 
          cooldownUntil, 
          remainingMs, 
          component: 'QuotaEnforcementService' 
        }, 'Colab cooldown active');
        
        return {
          canStart: false,
          reason: `Colab cooldown active: ${this.msToHours(remainingMs)}h remaining`,
          quotaDetails: {
            provider: 'colab',
            sessionLimitMs: QUOTA_LIMITS.COLAB_SESSION_LIMIT_MS,
            cooldownUntil: cooldownEnd,
          },
        };
      }
      
      // Cooldown elapsed
      return {
        canStart: true,
        reason: 'Colab: cooldown elapsed',
        quotaDetails: {
          provider: 'colab',
          sessionLimitMs: QUOTA_LIMITS.COLAB_SESSION_LIMIT_MS,
        },
      };
      
    } catch (error) {
      logger.error({ workerId, error, component: 'QuotaEnforcementService' }, 'Error checking Colab cooldown');
      return {
        canStart: false,
        reason: `Colab cooldown check error: ${error}`,
      };
    }
  }
  
  /**
   * GARANTIA 1 & 2: Start session with auto-shutdown timer
   * Persists session state with autoShutdownAt for watchdog recovery
   */
  async startSession(
    workerId: number,
    provider: 'kaggle' | 'colab',
    puppeteerSessionId: string,
    ngrokUrl: string
  ): Promise<SessionStartResult> {
    try {
      const now = new Date();
      const sessionLimitMs = provider === 'kaggle' ? QUOTA_LIMITS.KAGGLE_SESSION_LIMIT_MS : QUOTA_LIMITS.COLAB_SESSION_LIMIT_MS;
      const autoShutdownAt = new Date(now.getTime() + sessionLimitMs);
      
      // Calculate Kaggle weekly quota reset (Monday 00:00 UTC)
      const weeklyQuotaResetAt = provider === 'kaggle' ? this.getNextWeekStart(now) : null;
      
      // Insert session state into DB
      const [session] = await db.insert(gpuSessionState).values({
        workerId,
        provider,
        puppeteerSessionId,
        ngrokUrl,
        sessionStarted: now,
        sessionDurationMs: 0,
        maxSessionDurationMs: sessionLimitMs,
        weeklyQuotaUsedMs: 0,
        weeklyQuotaLimitMs: provider === 'kaggle' ? QUOTA_LIMITS.KAGGLE_WEEKLY_LIMIT_MS : null,
        weeklyQuotaResetAt: weeklyQuotaResetAt,
        cooldownUntil: null, // Will be set on session end (Colab only)
        lastKeepAlive: now,
        keepAliveIntervalMs: QUOTA_LIMITS.KEEP_ALIVE_INTERVAL_MS,
        autoShutdownAt,
        shutdownReason: null,
        browserUserDataDir: null,
        isActive: true,
      }).returning();
      
      logger.info({ 
        workerId, 
        provider, 
        sessionId: session.id,
        autoShutdownAt, 
        sessionLimitHours: this.msToHours(sessionLimitMs),
        component: 'QuotaEnforcementService' 
      }, 'Session started with auto-shutdown timer');
      
      return {
        success: true,
        sessionId: session.id,
        autoShutdownAt,
      };
      
    } catch (error) {
      logger.error({ workerId, provider, error, component: 'QuotaEnforcementService' }, 'Error starting session');
      return {
        success: false,
        error: String(error),
      };
    }
  }
  
  /**
   * Update session duration (called periodically during session)
   */
  async updateSessionDuration(sessionId: number, currentDurationMs: number): Promise<SessionUpdateResult> {
    try {
      const session = await db.query.gpuSessionState.findFirst({
        where: eq(gpuSessionState.id, sessionId),
      });
      
      if (!session) {
        return {
          success: false,
          shouldShutdown: false,
          reason: 'Session not found',
        };
      }
      
      // Update duration
      await db.update(gpuSessionState)
        .set({
          sessionDurationMs: currentDurationMs,
          updatedAt: new Date(),
        })
        .where(eq(gpuSessionState.id, sessionId));
      
      // Check if should shutdown (reached 70% limit)
      const shouldShutdown = currentDurationMs >= session.maxSessionDurationMs;
      
      if (shouldShutdown) {
        logger.warn({ 
          sessionId, 
          currentDurationMs, 
          maxSessionDurationMs: session.maxSessionDurationMs,
          component: 'QuotaEnforcementService'
        }, 'Session reached 70% quota limit - forcing shutdown');
        
        return {
          success: true,
          shouldShutdown: true,
          reason: 'quota_70%_reached',
        };
      }
      
      return {
        success: true,
        shouldShutdown: false,
      };
      
    } catch (error) {
      logger.error({ sessionId, error, component: 'QuotaEnforcementService' }, 'Error updating session duration');
      return {
        success: false,
        shouldShutdown: false,
        reason: String(error),
      };
    }
  }
  
  /**
   * End session (update cooldown for Colab, mark inactive)
   */
  async endSession(sessionId: number, shutdownReason: string): Promise<boolean> {
    try {
      const session = await db.query.gpuSessionState.findFirst({
        where: eq(gpuSessionState.id, sessionId),
      });
      
      if (!session) {
        logger.warn({ sessionId, component: 'QuotaEnforcementService' }, 'Session not found - cannot end');
        return false;
      }
      
      const now = new Date();
      
      // Calculate cooldown for Colab
      const cooldownUntil = session.provider === 'colab' 
        ? new Date(now.getTime() + QUOTA_LIMITS.COLAB_COOLDOWN_MS)
        : null;
      
      // Update session state
      await db.update(gpuSessionState)
        .set({
          isActive: false,
          cooldownUntil,
          shutdownReason,
          updatedAt: now,
        })
        .where(eq(gpuSessionState.id, sessionId));
      
      // Update worker cooldown (for Colab)
      if (cooldownUntil) {
        await db.update(gpuWorkers)
          .set({
            cooldownUntil,
            updatedAt: now,
          })
          .where(eq(gpuWorkers.id, session.workerId));
      }
      
      logger.info({ 
        sessionId, 
        workerId: session.workerId,
        provider: session.provider,
        shutdownReason, 
        cooldownUntil,
        component: 'QuotaEnforcementService' 
      }, 'Session ended successfully');
      
      return true;
      
    } catch (error) {
      logger.error({ sessionId, error, component: 'QuotaEnforcementService' }, 'Error ending session');
      return false;
    }
  }
  
  /**
   * Recovery: Find orphaned sessions (active but past autoShutdownAt)
   */
  private async recoverOrphanedSessions(): Promise<void> {
    try {
      const now = new Date();
      
      const orphanedSessions = await db.query.gpuSessionState.findMany({
        where: and(
          eq(gpuSessionState.isActive, true),
          sql`${gpuSessionState.autoShutdownAt} < ${now}`
        ),
      });
      
      if (orphanedSessions.length > 0) {
        logger.warn({ 
          count: orphanedSessions.length,
          sessionIds: orphanedSessions.map(s => s.id),
          component: 'QuotaEnforcementService'
        }, 'Found orphaned sessions past autoShutdownAt - marking inactive');
        
        // Mark as inactive (watchdog should have stopped them)
        for (const session of orphanedSessions) {
          await this.endSession(session.id, 'orphaned_recovery');
        }
      }
      
    } catch (error) {
      logger.error({ error, component: 'QuotaEnforcementService' }, 'Error recovering orphaned sessions');
    }
  }
  
  /**
   * Get all active sessions (for watchdog monitoring)
   */
  async getActiveSessions(): Promise<GpuSessionState[]> {
    try {
      return await db.query.gpuSessionState.findMany({
        where: eq(gpuSessionState.isActive, true),
      });
    } catch (error) {
      logger.error({ error, component: 'QuotaEnforcementService' }, 'Error getting active sessions');
      return [];
    }
  }
  
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  
  /**
   * Get week start (Monday 00:00 UTC)
   */
  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday = 1, Sunday = 0
    d.setUTCDate(d.getUTCDate() + diff);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  
  /**
   * Get next week start (next Monday 00:00 UTC)
   */
  private getNextWeekStart(date: Date): Date {
    const weekStart = this.getWeekStart(date);
    weekStart.setUTCDate(weekStart.getUTCDate() + 7);
    return weekStart;
  }
  
  /**
   * Convert milliseconds to hours (rounded to 1 decimal)
   */
  private msToHours(ms: number): number {
    return Math.round((ms / (1000 * 60 * 60)) * 10) / 10;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let quotaEnforcementService: QuotaEnforcementService | null = null;

export async function getQuotaEnforcementService(): Promise<QuotaEnforcementService> {
  if (!quotaEnforcementService) {
    quotaEnforcementService = await QuotaEnforcementService.create();
  }
  return quotaEnforcementService;
}
