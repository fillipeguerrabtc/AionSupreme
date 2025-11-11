/**
 * GPU WATCHDOG SERVICE - Auto-Shutdown Recovery & Enforcement
 * ==============================================================
 * 
 * 🎯 GARANTIA CRÍTICA: Auto-shutdown MESMO após crash/restart
 * 
 * PROBLEMA RESOLVIDO:
 * - Timers in-memory são perdidos ao reiniciar processo
 * - GPUs podem ficar rodando indefinidamente após crash
 * - Vazamento de quota sem controle
 * 
 * SOLUÇÃO:
 * 1. Lê autoShutdownAt do DB após restart
 * 2. Agenda shutdown jobs duráveis (cron-based)
 * 3. Monitora todas sessões ativas a cada 1min
 * 4. Força shutdown ao atingir autoShutdownAt
 * 
 * ARQUITETURA:
 * - Node-cron para jobs duráveis (sobrevivem restart)
 * - PostgreSQL como source of truth
 * - Structured logging (Pino)
 * - Non-throwing error handling
 */

import cron from 'node-cron';
import { db } from '../db';
import { gpuSessionState } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getQuotaEnforcementService } from './quota-enforcement-service';
import pino from 'pino';

const logger = pino({ name: 'GpuWatchdogService' });

// ============================================================================
// TYPES
// ============================================================================

interface WatchdogStatus {
  isRunning: boolean;
  lastCheckAt: Date | null;
  activeSessionsCount: number;
  shutdownsPerformed: number;
}

interface ShutdownAction {
  sessionId: number;
  workerId: number;
  provider: string;
  reason: string;
  autoShutdownAt: Date;
  actualShutdownAt: Date;
}

// ============================================================================
// GPU WATCHDOG SERVICE
// ============================================================================

export class GpuWatchdogService {
  private static instance: GpuWatchdogService | null = null;
  
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;
  private lastCheckAt: Date | null = null;
  private shutdownsPerformed: number = 0;
  
  // Shutdown callback (called when GPU needs to be stopped)
  private shutdownCallback: ((sessionId: number, workerId: number, provider: string) => Promise<void>) | null = null;
  
  private constructor() {
    logger.info({ component: 'GpuWatchdogService' }, 'Service initialized');
  }
  
  /**
   * Async factory pattern (singleton)
   */
  static async create(): Promise<GpuWatchdogService> {
    if (!GpuWatchdogService.instance) {
      GpuWatchdogService.instance = new GpuWatchdogService();
      
      // Auto-start watchdog on service creation
      await GpuWatchdogService.instance.start();
    }
    
    return GpuWatchdogService.instance;
  }
  
  /**
   * Register shutdown callback (called when GPU needs to be stopped)
   * This is how orchestrators get notified to stop their Puppeteer sessions
   */
  setShutdownCallback(callback: (sessionId: number, workerId: number, provider: string) => Promise<void>): void {
    this.shutdownCallback = callback;
    logger.info({ component: 'GpuWatchdogService' }, 'Shutdown callback registered');
  }
  
  /**
   * Start watchdog monitoring (cron every 1 minute)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn({ component: 'GpuWatchdogService' }, 'Watchdog already running - skipping start');
      return;
    }
    
    try {
      // Perform initial check immediately
      await this.performWatchdogCheck();
      
      // Schedule cron job (every 1 minute)
      this.cronJob = cron.schedule('*/1 * * * *', async () => {
        await this.performWatchdogCheck();
      });
      
      this.isRunning = true;
      
      logger.info({ 
        component: 'GpuWatchdogService',
        cronSchedule: 'every 1 minute'
      }, 'Watchdog started successfully');
      
    } catch (error) {
      logger.error({ error, component: 'GpuWatchdogService' }, 'Error starting watchdog');
    }
  }
  
  /**
   * Stop watchdog monitoring
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    this.isRunning = false;
    
    logger.info({ component: 'GpuWatchdogService' }, 'Watchdog stopped');
  }
  
  /**
   * Perform watchdog check (called every 1 minute by cron)
   * 
   * CRITICAL LOGIC:
   * 1. Get all active sessions from DB
   * 2. Check if any session passed autoShutdownAt
   * 3. Force shutdown via callback + update DB
   */
  private async performWatchdogCheck(): Promise<void> {
    try {
      const now = new Date();
      this.lastCheckAt = now;
      
      logger.debug({ component: 'GpuWatchdogService' }, 'Performing watchdog check');
      
      // Get quota enforcement service
      const quotaService = await getQuotaEnforcementService();
      
      // Get all active sessions
      const activeSessions = await quotaService.getActiveSessions();
      
      if (activeSessions.length === 0) {
        logger.debug({ component: 'GpuWatchdogService' }, 'No active sessions to monitor');
        return;
      }
      
      logger.info({ 
        activeSessionsCount: activeSessions.length,
        component: 'GpuWatchdogService' 
      }, 'Monitoring active sessions');
      
      // Check each session for shutdown conditions
      const shutdownActions: ShutdownAction[] = [];
      
      for (const session of activeSessions) {
        // Check if autoShutdownAt has passed
        if (session.autoShutdownAt && now >= new Date(session.autoShutdownAt)) {
          shutdownActions.push({
            sessionId: session.id,
            workerId: session.workerId,
            provider: session.provider,
            reason: 'auto_shutdown_timeout',
            autoShutdownAt: new Date(session.autoShutdownAt),
            actualShutdownAt: now,
          });
        }
        
        // Check if session duration exceeded (backup check)
        const sessionDurationMs = session.sessionDurationMs || 0;
        if (session.maxSessionDurationMs && sessionDurationMs >= session.maxSessionDurationMs) {
          shutdownActions.push({
            sessionId: session.id,
            workerId: session.workerId,
            provider: session.provider,
            reason: 'quota_70%_exceeded',
            autoShutdownAt: session.autoShutdownAt || now,
            actualShutdownAt: now,
          });
        }
      }
      
      // Execute shutdowns
      if (shutdownActions.length > 0) {
        logger.warn({ 
          shutdownCount: shutdownActions.length,
          shutdownActions,
          component: 'GpuWatchdogService' 
        }, 'FORCING SHUTDOWN - quota limit reached');
        
        for (const action of shutdownActions) {
          await this.executeShutdown(action);
        }
      }
      
    } catch (error) {
      logger.error({ error, component: 'GpuWatchdogService' }, 'Error in watchdog check');
    }
  }
  
  /**
   * Execute shutdown action
   */
  private async executeShutdown(action: ShutdownAction): Promise<void> {
    try {
      logger.warn({ 
        sessionId: action.sessionId,
        workerId: action.workerId,
        provider: action.provider,
        reason: action.reason,
        autoShutdownAt: action.autoShutdownAt,
        component: 'GpuWatchdogService'
      }, 'EXECUTING FORCED SHUTDOWN');
      
      // Call shutdown callback (orchestrator stops Puppeteer session)
      if (this.shutdownCallback) {
        try {
          await this.shutdownCallback(action.sessionId, action.workerId, action.provider);
          logger.info({ sessionId: action.sessionId, component: 'GpuWatchdogService' }, 'Shutdown callback executed successfully');
        } catch (callbackError) {
          logger.error({ 
            sessionId: action.sessionId, 
            callbackError, 
            component: 'GpuWatchdogService' 
          }, 'Shutdown callback failed - marking session inactive anyway');
        }
      } else {
        logger.warn({ component: 'GpuWatchdogService' }, 'No shutdown callback registered - marking session inactive only');
      }
      
      // Update session state (mark inactive)
      const quotaService = await getQuotaEnforcementService();
      await quotaService.endSession(action.sessionId, action.reason);
      
      this.shutdownsPerformed++;
      
      logger.info({ 
        sessionId: action.sessionId,
        totalShutdowns: this.shutdownsPerformed,
        component: 'GpuWatchdogService'
      }, 'Forced shutdown completed successfully');
      
    } catch (error) {
      logger.error({ 
        sessionId: action.sessionId, 
        error, 
        component: 'GpuWatchdogService' 
      }, 'Error executing shutdown');
    }
  }
  
  /**
   * Manual check (can be called by admin UI)
   */
  async performManualCheck(): Promise<void> {
    logger.info({ component: 'GpuWatchdogService' }, 'Manual watchdog check triggered');
    await this.performWatchdogCheck();
  }
  
  /**
   * Get watchdog status
   */
  getStatus(): WatchdogStatus {
    return {
      isRunning: this.isRunning,
      lastCheckAt: this.lastCheckAt,
      activeSessionsCount: 0, // Will be updated by next check
      shutdownsPerformed: this.shutdownsPerformed,
    };
  }
  
  /**
   * Force shutdown specific session (admin override)
   */
  async forceShutdownSession(sessionId: number, reason: string): Promise<boolean> {
    try {
      logger.warn({ sessionId, reason, component: 'GpuWatchdogService' }, 'Admin forced shutdown');
      
      // Get session details
      const session = await db.query.gpuSessionState.findFirst({
        where: eq(gpuSessionState.id, sessionId),
      });
      
      if (!session) {
        logger.error({ sessionId, component: 'GpuWatchdogService' }, 'Session not found');
        return false;
      }
      
      // Execute shutdown
      await this.executeShutdown({
        sessionId,
        workerId: session.workerId,
        provider: session.provider,
        reason: `admin_override: ${reason}`,
        autoShutdownAt: session.autoShutdownAt || new Date(),
        actualShutdownAt: new Date(),
      });
      
      return true;
      
    } catch (error) {
      logger.error({ sessionId, error, component: 'GpuWatchdogService' }, 'Error forcing shutdown');
      return false;
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let gpuWatchdogService: GpuWatchdogService | null = null;

export async function getGpuWatchdogService(): Promise<GpuWatchdogService> {
  if (!gpuWatchdogService) {
    gpuWatchdogService = await GpuWatchdogService.create();
  }
  return gpuWatchdogService;
}
