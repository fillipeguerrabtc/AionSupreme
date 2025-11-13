/**
 * KAGGLE ORCHESTRATOR
 * ===================
 * 
 * Automação completa do Kaggle FREE via Puppeteer:
 * 
 * KAGGLE FREE LIMITS:
 * - GPU Runtime: 12h max → Stop at 11h (1h safety)
 * - CPU Runtime: 9h max → Stop at 8h (1h safety)
 * - Weekly Quota: 30h GPU/week (resets Monday 00:00 UTC)
 * - Concurrent: 1 notebook only
 * 
 * Features:
 * - Login Kaggle automático
 * - Start notebook (Run All)
 * - Monitor Ngrok URL
 * - Track weekly quota (30h limit)
 * - Auto-stop antes dos limites
 * - Smart rotation quando quota acabar
 */

import puppeteer from 'puppeteer-extra';
import type { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { db } from '../db';
import { gpuWorkers, gpuSessions } from '../../shared/schema';
import { eq, and, inArray, lt, gt } from 'drizzle-orm';
import { getQuotaEnforcementService } from '../services/quota-enforcement-service';
import { nanoid } from 'nanoid';

puppeteer.use(StealthPlugin());

interface KaggleConfig {
  notebookUrl: string;
  kaggleUsername: string;
  kagglePassword: string;
  workerId: number;
  useGPU?: boolean;  // true for GPU, false for CPU
  headless?: boolean;
}

// ✅ PRODUCTION: Runtime cache for Puppeteer objects ONLY (cannot be serialized to PostgreSQL)
// All session state (status, ngrokUrl, timing) persists in gpu_sessions table
interface RuntimeCacheEntry {
  browser: Browser;
  page: Page;
  sessionId: string;
}

export class KaggleOrchestrator {
  // ✅ MINIMAL runtime cache - Puppeteer objects only (not serializable)
  private runtimeCache: Map<number, RuntimeCacheEntry> = new Map();
  private readonly CHROME_USER_DATA_DIR = './chrome-data/kaggle';
  
  /**
   * ✅ STARTUP CLEANUP: Terminate orphaned sessions blocking new startups
   * Called on service initialization to handle process restarts
   * 
   * STRATEGY:
   * 1. Terminate 'starting' sessions older than 10min (startup timeout)
   * 2. Terminate 'active'/'idle' sessions past their expiresAt (expired quota)
   * 3. Log warning for valid active sessions (will be managed by idle timeout watcher)
   */
  async cleanupOrphanedSessions(): Promise<void> {
    try {
      console.log('[Kaggle] Cleaning up orphaned sessions...');
      
      const now = new Date();
      
      // 1. Terminate old 'starting' sessions (startup timeout = 10min)
      const failedStarting = await db.update(gpuSessions)
        .set({
          status: 'terminated',
          shutdownReason: 'startup_timeout',
          terminatedAt: now,
          lastActivity: now,
        })
        .where(and(
          eq(gpuSessions.provider, 'kaggle'),
          eq(gpuSessions.status, 'starting'),
          lt(gpuSessions.startedAt, new Date(Date.now() - 10 * 60 * 1000))
        ))
        .returning();
      
      if (failedStarting.length > 0) {
        console.log(`[Kaggle] Terminated ${failedStarting.length} stuck 'starting' sessions`);
      }
      
      // 2. ✅ CRITICAL FIX: Terminate sessions PAST their expiresAt (quota expired)
      // This is a DURABLE indicator - doesn't rely on runtime cache
      const expiredSessions = await db.update(gpuSessions)
        .set({
          status: 'terminated',
          shutdownReason: 'quota_expired',
          terminatedAt: now,
          lastActivity: now,
        })
        .where(and(
          eq(gpuSessions.provider, 'kaggle'),
          inArray(gpuSessions.status, ['active', 'idle']),
          lt(gpuSessions.expiresAt, now)
        ))
        .returning();
      
      if (expiredSessions.length > 0) {
        console.log(`[Kaggle] ✅ Terminated ${expiredSessions.length} quota-expired sessions`);
      }
      
      // 3. Log warning for valid active sessions (will be managed by idle timeout watcher)
      const validActive = await db.query.gpuSessions.findMany({
        where: and(
          eq(gpuSessions.provider, 'kaggle'),
          inArray(gpuSessions.status, ['active', 'idle']),
          gt(gpuSessions.expiresAt, now) // ✅ CORRECT: expiresAt > now (still valid)
        ),
      });
      
      if (validActive.length > 0) {
        console.log(
          `[Kaggle] ℹ️  Found ${validActive.length} valid active sessions ` +
          `(will be managed by idle timeout watcher)`
        );
        
        for (const session of validActive) {
          try {
            const minutesRemaining = Math.floor(
              (new Date(session.expiresAt).getTime() - now.getTime()) / (60 * 1000)
            );
            const lastActivityMs = session.lastActivity 
              ? Math.floor((now.getTime() - new Date(session.lastActivity).getTime()) / (60 * 1000))
              : 'unknown';
            console.log(
              `[Kaggle]    → Worker ${session.workerId}: ` +
              `${minutesRemaining}min quota remaining, ` +
              `last activity ${lastActivityMs}min ago`
            );
          } catch (err) {
            console.warn(`[Kaggle]    → Worker ${session.workerId}: failed to parse timestamp`, err);
          }
        }
      }
      
      // Clean up runtime cache (all entries - stale after restart)
      this.runtimeCache.clear();
      
      console.log('[Kaggle] ✅ Cleanup complete');
    } catch (error) {
      // ✅ NON-BLOCKING: Log error but don't crash startup
      console.error('[Kaggle] ❌ Error during orphaned session cleanup:', error);
    }
  }
  
  /**
   * ✅ POSTGRESQL-BACKED: Start Kaggle notebook session
   * 
   * DB-FIRST FLOW:
   * 1. INSERT gpu_sessions row (status='starting') - partial unique index prevents duplicates
   * 2. Launch Puppeteer browser
   * 3. UPDATE gpu_sessions to 'active' (with status guard)
   * 4. Cache Puppeteer objects in runtime cache
   * 5. Cleanup on failure (mark session terminated)
   */
  async startSession(config: KaggleConfig): Promise<{ success: boolean; ngrokUrl?: string; error?: string }> {
    let dbSessionId: number | undefined;
    let sessionId: string | undefined;
    
    try {
      console.log(`[Kaggle] Starting ${config.useGPU ? 'GPU' : 'CPU'} session for worker ${config.workerId}...`);
      
      // ============================================================================
      // 1. CHECK QUOTA (ENTERPRISE 70% ENFORCEMENT - CRITICAL!)
      // ============================================================================
      
      const quotaService = await getQuotaEnforcementService();
      const quotaValidation = await quotaService.validateCanStart(config.workerId, 'kaggle');
      
      if (!quotaValidation.canStart) {
        console.error(
          `[Kaggle] 🚫 Cannot start session - ${quotaValidation.reason}`
        );
        return {
          success: false,
          error: `Quota enforcement failed: ${quotaValidation.reason}`
        };
      }
      
      console.log(`[Kaggle] ✅ Quota validation passed - ${quotaValidation.reason}`);
      
      // ============================================================================
      // 2. ✅ POSTGRESQL: INSERT session row (DB-level exclusivity guard)
      // Partial unique index prevents duplicate sessions for same worker
      // ============================================================================
      
      sessionId = nanoid();
      const maxSessionDurationMs = quotaValidation.quotaDetails?.sessionLimitMs || (8.4 * 60 * 60 * 1000); // Default 8.4h
      const expiresAt = new Date(Date.now() + maxSessionDurationMs);
      const now = new Date();
      
      const [dbSession] = await db.insert(gpuSessions)
        .values({
          workerId: config.workerId,
          sessionId,
          provider: 'kaggle',
          status: 'starting',
          expiresAt,
          lastActivity: now, // ✅ CRITICAL: Initialize lastActivity (idle timeout tracking)
        })
        .onConflictDoNothing()
        .returning();
      
      if (!dbSession) {
        console.warn(`[Kaggle] ⚠️  Session already active for worker ${config.workerId} (DB partial unique index)`);
        return {
          success: false,
          error: `Session already active for worker ${config.workerId}`
        };
      }
      
      dbSessionId = dbSession.id;
      console.log(`[Kaggle] ✅ DB session created (ID: ${dbSessionId}, status: starting)`);
      
      // ============================================================================
      // 3. Launch Puppeteer browser
      // ============================================================================
      
      const browser = await puppeteer.launch({
        headless: config.headless ?? true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
        userDataDir: `${this.CHROME_USER_DATA_DIR}-${config.workerId}`,
      });
      
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Navigate to notebook
      console.log(`[Kaggle] Navigating to ${config.notebookUrl}...`);
      await page.goto(config.notebookUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Check if login required
      const isLoginPage = await page.url().includes('/account/login');
      if (isLoginPage) {
        console.log(`[Kaggle] Login required - authenticating...`);
        await this.performKaggleLogin(page, config.kaggleUsername, config.kagglePassword);
        
        // Navigate back to notebook
        await page.goto(config.notebookUrl, { waitUntil: 'networkidle2' });
      }
      
      // Enable GPU if requested
      if (config.useGPU) {
        await this.enableGPU(page);
      }
      
      // Run all cells
      console.log(`[Kaggle] Running all cells...`);
      await this.runAllCells(page);
      
      // Monitor for Ngrok URL
      console.log(`[Kaggle] Monitoring for Ngrok URL...`);
      const ngrokUrl = await this.waitForNgrokUrl(page);
      
      if (!ngrokUrl) {
        throw new Error('Failed to detect Ngrok URL');
      }
      
      console.log(`[Kaggle] ✅ Ngrok URL detected: ${ngrokUrl}`);
      
      // ============================================================================
      // 4. ✅ POSTGRESQL: UPDATE session to 'active' (with status guard!)
      // Status guard prevents race condition (concurrent stopSession overwriting)
      // ============================================================================
      
      const sessionNow = new Date();
      const updatedRows = await db.update(gpuSessions)
        .set({
          status: 'active',
          ngrokUrl,
          startedAt: sessionNow,
          lastActivity: sessionNow, // ✅ CRITICAL: Update lastActivity (idle timeout)
        })
        .where(and(
          eq(gpuSessions.id, dbSessionId!),
          eq(gpuSessions.status, 'starting') // ✅ Status guard
        ))
        .returning();
      
      if (updatedRows.length === 0) {
        // Session was terminated concurrently (watchdog/stopSession)
        console.warn(`[Kaggle] ⚠️  Session ${dbSessionId} was terminated during startup - closing browser`);
        await browser.close();
        return {
          success: false,
          error: 'Session was terminated during startup'
        };
      }
      
      console.log(`[Kaggle] ✅ DB session updated to 'active' (ID: ${dbSessionId})`);
      
      // ============================================================================
      // 5. ✅ CACHE: Store Puppeteer objects in runtime cache
      // ============================================================================
      
      this.runtimeCache.set(config.workerId, {
        browser,
        page,
        sessionId: sessionId!,
      });
      
      console.log(`[Kaggle] ✅ Runtime cache updated (worker ${config.workerId})`);
      
      // ============================================================================
      // 6. ENTERPRISE: Register quota tracking (QuotaEnforcementService)
      // ============================================================================
      
      const sessionRegistration = await quotaService.startSession(
        config.workerId,
        'kaggle',
        sessionId!,
        ngrokUrl
      );
      
      if (!sessionRegistration.success) {
        console.error(`[Kaggle] ❌ FATAL: Quota service registration failed: ${sessionRegistration.error}`);
        
        // Cleanup: Close browser + mark session terminated
        await browser.close();
        this.runtimeCache.delete(config.workerId);
        
        await db.update(gpuSessions)
          .set({
            status: 'terminated',
            shutdownReason: 'quota_service_error',
            terminatedAt: new Date(),
          })
          .where(eq(gpuSessions.id, dbSessionId!));
        
        throw new Error(`Quota service registration failed: ${sessionRegistration.error}`);
      }
      
      console.log(`[Kaggle] ✅ Quota service registered (auto-shutdown at ${sessionRegistration.autoShutdownAt?.toISOString()})`);
      
      // ============================================================================
      // 7. Update gpuWorkers table
      // ============================================================================
      
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: sessionId,
          ngrokUrl: ngrokUrl,
          status: 'healthy',
          sessionStartedAt: sessionNow, // ✅ Reuse sessionNow from line 260
          lastHealthCheck: sessionNow,
          lastUsedAt: sessionNow, // ✅ Track activity for idle timeout
          updatedAt: sessionNow,
        })
        .where(eq(gpuWorkers.id, config.workerId));
      
      return { success: true, ngrokUrl };
      
    } catch (error) {
      console.error(`[Kaggle] Error starting session:`, error);
      
      // ============================================================================
      // ✅ CLEANUP: Mark session terminated on failure (release partial unique index lock)
      // ============================================================================
      
      if (dbSessionId) {
        await db.update(gpuSessions)
          .set({
            status: 'terminated',
            shutdownReason: 'startup_error',
            terminatedAt: new Date(),
          })
          .where(eq(gpuSessions.id, dbSessionId))
          .catch(err => console.error(`[Kaggle] Failed to cleanup session ${dbSessionId}:`, err));
      }
      
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * ✅ POSTGRESQL-BACKED: Stop Kaggle session
   * 
   * DB-FIRST FLOW:
   * 1. Query gpu_sessions table for active session
   * 2. Close Puppeteer browser if available in runtime cache
   * 3. UPDATE gpu_sessions to 'terminated'
   * 4. End session in QuotaEnforcementService
   * 5. Update gpuWorkers table
   */
  async stopSession(workerId: number): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[Kaggle] Stopping session for worker ${workerId}...`);
      
      // ============================================================================
      // 1. ✅ POSTGRESQL: Query active session from DB (source of truth)
      // ============================================================================
      
      const dbSession = await db.query.gpuSessions.findFirst({
        where: and(
          eq(gpuSessions.workerId, workerId),
          eq(gpuSessions.provider, 'kaggle'),
          inArray(gpuSessions.status, ['starting', 'active', 'idle'])
        ),
      });
      
      if (!dbSession) {
        console.warn(`[Kaggle] ⚠️  No active session found in DB for worker ${workerId}`);
        return { success: false, error: 'Session not found in DB' };
      }
      
      console.log(`[Kaggle] Found session in DB (ID: ${dbSession.id}, status: ${dbSession.status})`);
      
      // ============================================================================
      // 2. ✅ RUNTIME CACHE: Close Puppeteer browser if available
      // ============================================================================
      
      const runtime = this.runtimeCache.get(workerId);
      
      if (runtime) {
        try {
          console.log(`[Kaggle] Stopping notebook execution...`);
          await this.stopNotebook(runtime.page);
          
          console.log(`[Kaggle] Closing browser...`);
          await runtime.browser.close();
          
          this.runtimeCache.delete(workerId);
          console.log(`[Kaggle] ✅ Runtime cache cleaned (worker ${workerId})`);
        } catch (browserError) {
          console.error(`[Kaggle] Error closing browser:`, browserError);
          // Continue with DB cleanup even if browser cleanup fails
        }
      } else {
        console.warn(
          `[Kaggle] ⚠️  Runtime cache missing for worker ${workerId} ` +
          `(process restart or orphaned session) - marking as terminated anyway`
        );
      }
      
      // ============================================================================
      // 3. ✅ POSTGRESQL: UPDATE session to 'terminated'
      // ============================================================================
      
      const stopNow = new Date();
      const durationSeconds = Math.floor(
        (stopNow.getTime() - new Date(dbSession.startedAt).getTime()) / 1000
      );
      
      // ✅ STATUS GUARD: Only update if session still active/starting/idle
      // Prevents race condition with concurrent stopSession/idle shutdown
      const updatedRows = await db.update(gpuSessions)
        .set({
          status: 'terminated',
          terminatedAt: stopNow,
          lastActivity: stopNow, // ✅ CRITICAL: Update lastActivity on stop
          durationSeconds,
          shutdownReason: 'manual_stop',
        })
        .where(and(
          eq(gpuSessions.id, dbSession.id),
          inArray(gpuSessions.status, ['starting', 'active', 'idle']) // ✅ Status guard
        ))
        .returning();
      
      if (updatedRows.length === 0) {
        console.warn(`[Kaggle] ⚠️  Session ${dbSession.id} was already terminated (concurrent shutdown)`);
      } else {
        console.log(`[Kaggle] ✅ DB session marked as terminated (ID: ${dbSession.id}, duration: ${durationSeconds}s)`);
      }
      
      // ============================================================================
      // 4. ENTERPRISE: End session in QuotaEnforcementService
      // ============================================================================
      
      const quotaService = await getQuotaEnforcementService();
      const sessionEnded = await quotaService.endSession(dbSession.id, 'manual_stop');
      
      if (!sessionEnded) {
        console.error(`[Kaggle] ❌ Failed to end session in QuotaEnforcementService (ID: ${dbSession.id})`);
      } else {
        console.log(`[Kaggle] ✅ Quota service session ended (ID: ${dbSession.id})`);
      }
      
      // ============================================================================
      // 5. Update gpuWorkers table
      // ============================================================================
      
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: null,
          status: 'offline',
          sessionStartedAt: null,
        })
        .where(eq(gpuWorkers.id, workerId));
      
      console.log(`[Kaggle] ✅ Session stopped for worker ${workerId}`);
      
      return { success: true };
      
    } catch (error) {
      console.error(`[Kaggle] Error stopping session:`, error);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Perform Kaggle login
   */
  private async performKaggleLogin(page: Page, username: string, password: string): Promise<void> {
    try {
      // Enter username
      await page.waitForSelector('input[name="username"]', { timeout: 10000 });
      await page.type('input[name="username"]', username);
      
      // Enter password
      await page.type('input[name="password"]', password);
      
      // Click login
      await page.click('button[type="submit"]');
      
      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      
      console.log(`[Kaggle] Login successful`);
      
    } catch (error) {
      throw new Error(`Kaggle login failed: ${error}`);
    }
  }
  
  /**
   * Enable GPU accelerator
   */
  private async enableGPU(page: Page): Promise<void> {
    try {
      console.log(`[Kaggle] Enabling GPU accelerator...`);
      
      // Click settings/accelerator dropdown
      await page.evaluate(() => {
        const acceleratorButton = Array.from(document.querySelectorAll('button')).find(
          btn => btn.textContent?.includes('Accelerator') || btn.textContent?.includes('GPU')
        );
        if (acceleratorButton) acceleratorButton.click();
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Select GPU option
      await page.evaluate(() => {
        const gpuOption = Array.from(document.querySelectorAll('div[role="option"]')).find(
          opt => opt.textContent?.includes('GPU')
        );
        if (gpuOption) (gpuOption as HTMLElement).click();
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`[Kaggle] GPU enabled`);
      
    } catch (error) {
      console.error(`[Kaggle] Warning: Could not enable GPU:`, error);
      // Non-fatal - might already be enabled
    }
  }
  
  /**
   * Run all cells
   */
  private async runAllCells(page: Page): Promise<void> {
    try {
      // Find and click "Run All" button
      await page.evaluate(() => {
        const runAllButton = Array.from(document.querySelectorAll('button')).find(
          btn => btn.textContent?.includes('Run All') || btn.textContent?.includes('Run all')
        );
        if (runAllButton) runAllButton.click();
      });
      
      console.log(`[Kaggle] Executed "Run All"`);
      
    } catch (error) {
      throw new Error(`Failed to run cells: ${error}`);
    }
  }
  
  /**
   * Monitor output for Ngrok URL
   */
  private async waitForNgrokUrl(page: Page, timeout = 180000): Promise<string | null> {
    const startTime = Date.now();
    let lastLogTime = 0;
    
    console.log(`[Kaggle] 🔍 Iniciando detecção de ngrok URL (timeout: ${timeout/1000}s)...`);
    
    while (Date.now() - startTime < timeout) {
      try {
        const ngrokUrl = await page.evaluate(() => {
          // ✅ BUSCAR EM MÚLTIPLOS SELETORES (Kaggle muda UI frequentemente)
          const selectors = [
            '.output',           // Output cells
            'pre',               // Code blocks
            '.code-output',      // Code output
            '[class*="output"]', // Any class with "output"
            'div[role="log"]',   // Log containers
          ];
          
          for (const selector of selectors) {
            const elements = Array.from(document.querySelectorAll(selector));
            for (const el of elements) {
              const text = el.textContent || '';
              
              // ✅ REGEX mais abrangente para ngrok URLs
              const patterns = [
                /https:\/\/[\w-]+\.ngrok[-\w]*\.io/,           // Standard
                /https:\/\/[\w-]+\.ngrok\.app/,                // New ngrok.app domain
                /https:\/\/[\w-]+\.ngrok-free\.app/,           // Free tier
                /Running on (https:\/\/[\w-]+\.ngrok[^\s]+)/,  // "Running on https://..."
              ];
              
              for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                  // Se capturou grupo, use grupo 1, senão match[0]
                  return match[1] || match[0];
                }
              }
            }
          }
          
          return null;
        });
        
        if (ngrokUrl) {
          console.log(`[Kaggle] ✅ Ngrok URL detectada: ${ngrokUrl}`);
          return ngrokUrl;
        }
        
        // Log progress a cada 30s
        const elapsed = Date.now() - startTime;
        if (elapsed - lastLogTime > 30000) {
          console.log(`[Kaggle] ⏳ Aguardando ngrok URL... (${Math.floor(elapsed/1000)}s/${timeout/1000}s)`);
          lastLogTime = elapsed;
        }
        
      } catch (error) {
        console.warn(`[Kaggle] ⚠️ Erro ao detectar ngrok:`, error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 3000)); // Check a cada 3s
    }
    
    console.error(`[Kaggle] ❌ TIMEOUT: Ngrok URL não detectada após ${timeout/1000}s`);
    return null;
  }
  
  /**
   * Stop notebook execution
   */
  private async stopNotebook(page: Page): Promise<void> {
    try {
      // Click stop button
      await page.evaluate(() => {
        const stopButton = Array.from(document.querySelectorAll('button')).find(
          btn => btn.getAttribute('aria-label')?.includes('Stop') ||
                 btn.textContent?.includes('Stop')
        );
        if (stopButton) stopButton.click();
      });
      
      console.log(`[Kaggle] Notebook stopped`);
      
    } catch (error) {
      console.error(`[Kaggle] Error stopping notebook:`, error);
    }
  }
  
  /**
   * ✅ POSTGRESQL-BACKED: Get session status from DB
   */
  async getSessionStatus(workerId: number): Promise<typeof gpuSessions.$inferSelect | undefined> {
    return await db.query.gpuSessions.findFirst({
      where: and(
        eq(gpuSessions.workerId, workerId),
        eq(gpuSessions.provider, 'kaggle'),
        inArray(gpuSessions.status, ['starting', 'active', 'idle'])
      ),
    });
  }
  
  /**
   * ✅ POSTGRESQL-BACKED: Get all active sessions from DB
   */
  async getAllSessions(): Promise<Array<typeof gpuSessions.$inferSelect>> {
    return await db.query.gpuSessions.findMany({
      where: and(
        eq(gpuSessions.provider, 'kaggle'),
        inArray(gpuSessions.status, ['starting', 'active', 'idle'])
      ),
    });
  }
  
  /**
   * 🔥 SYNC REAL KAGGLE QUOTA from settings page
   * 
   * Scrapes https://www.kaggle.com/settings to get the actual weekly GPU usage
   * displayed as "01:30 / 30 hrs" and updates the database.
   * 
   * This ensures we have the REAL quota value from Kaggle (not our internal tracking).
   * 
   * @param workerId - GPU worker ID to update
   * @returns {usedSeconds: number, maxSeconds: number} or null if failed
   */
  async syncWeeklyQuotaFromSettings(workerId: number): Promise<{usedSeconds: number; maxSeconds: number} | null> {
    let browser: Browser | undefined;
    let page: Page | undefined;
    
    try {
      console.log(`[Kaggle] 🔄 Syncing REAL weekly quota from settings page (worker ${workerId})...`);
      
      // Get worker and credentials from Replit Secrets
      const worker = await db.query.gpuWorkers.findFirst({
        where: eq(gpuWorkers.id, workerId),
      });
      
      if (!worker) {
        console.error(`[Kaggle] Worker ${workerId} not found`);
        return null;
      }
      
      // Extract account index from accountId (e.g., "KAGGLE_1" → "1")
      const accountIndex = worker.accountId?.split('_')[1] || '';
      const username = process.env[`KAGGLE_USERNAME_${accountIndex}`] || process.env.KAGGLE_USERNAME;
      const password = process.env[`KAGGLE_KEY_${accountIndex}`] || process.env.KAGGLE_PASSWORD;
      
      if (!username || !password) {
        console.error(`[Kaggle] Credentials not found in Replit Secrets for worker ${workerId}`);
        console.error(`[Kaggle] Add KAGGLE_USERNAME_${accountIndex} and KAGGLE_KEY_${accountIndex} to Replit Secrets`);
        return null;
      }
      
      // Launch browser
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
      });
      
      page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      
      // Navigate to settings page
      console.log('[Kaggle] Navigating to settings page...');
      await page.goto('https://www.kaggle.com/settings', { waitUntil: 'networkidle2', timeout: 60000 });
      
      // Check if we need to login
      const isLoggedIn = await page.evaluate(() => {
        return !window.location.href.includes('/account/login');
      });
      
      if (!isLoggedIn) {
        console.log('[Kaggle] Not logged in, performing login...');
        
        // Fill login form
        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await page.type('input[name="username"]', username);
        await page.type('input[name="password"]', password);
        
        // Click sign in
        await page.click('button[type="submit"]');
        
        // Wait for navigation to settings
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
        
        // Navigate to settings if not already there
        if (!page.url().includes('/settings')) {
          await page.goto('https://www.kaggle.com/settings', { waitUntil: 'networkidle2' });
        }
      }
      
      console.log('[Kaggle] Extracting GPU quota from settings page...');
      
      // Extract quota text from page
      const quotaText = await page.evaluate(() => {
        // Look for text containing "Kaggle GPU" section
        const gpuSection = Array.from(document.querySelectorAll('*')).find(el => 
          el.textContent?.includes('Kaggle GPU')
        );
        
        if (!gpuSection) return null;
        
        // Find the quota text (format: "01:30 / 30 hrs" or "1:30 / 30 hrs")
        const quotaMatch = gpuSection.parentElement?.textContent?.match(/(\d{1,2}):(\d{2})\s*\/\s*(\d+)\s*hrs?/);
        
        return quotaMatch ? {
          hours: quotaMatch[1],
          minutes: quotaMatch[2],
          maxHours: quotaMatch[3],
        } : null;
      });
      
      if (!quotaText) {
        console.error('[Kaggle] ❌ Failed to extract quota text from settings page');
        return null;
      }
      
      // Parse the quota values
      const usedHours = parseInt(quotaText.hours);
      const usedMinutes = parseInt(quotaText.minutes);
      const maxHours = parseInt(quotaText.maxHours);
      
      const usedSeconds = (usedHours * 3600) + (usedMinutes * 60);
      const maxSeconds = maxHours * 3600;
      
      console.log(
        `[Kaggle] ✅ Extracted quota: ${quotaText.hours}:${quotaText.minutes} / ${maxHours}h ` +
        `(${usedSeconds}s / ${maxSeconds}s)`
      );
      
      // Update database
      await db.update(gpuWorkers)
        .set({
          weeklyUsageSeconds: usedSeconds,
          maxWeeklySeconds: maxSeconds,
          weekStartedAt: new Date(), // Update week start to prevent auto-reset
        })
        .where(eq(gpuWorkers.id, workerId));
      
      console.log(`[Kaggle] ✅ Updated worker ${workerId} with REAL quota from Kaggle`);
      
      return { usedSeconds, maxSeconds };
      
    } catch (error) {
      console.error(`[Kaggle] ❌ Error syncing weekly quota:`, error);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

// Singleton instance
export const kaggleOrchestrator = new KaggleOrchestrator();
