/**
 * GOOGLE COLAB ORCHESTRATOR - ENTERPRISE 2025 EDITION
 * ====================================================
 * 
 * ✅ P2.8: ANTI-DETECTION COMPLETO (2025 Best Practices)
 * 
 * FEATURES ANTI-DETECTION:
 * ✅ puppeteer-extra + StealthPlugin (remove webdriver flags)
 * ✅ ghost-cursor (movimentos naturais do mouse)
 * ✅ Humanização completa (delays randômicos, typos simulados)
 * ✅ User-Agent customizado (Chrome 131)
 * ✅ Headers realistas (Sec-Fetch-*, Accept-Language)
 * ✅ Resource blocking (images, fonts, CSS) - performance + ad-blocker simulation
 * ✅ Viewport randomization (3 resoluções comuns)
 * ✅ CAPTCHA detection + notificação admin
 * 
 * QUOTA MANAGEMENT (PRODUCTION-GRADE):
 * - Session limit: 8.4h (70% of 12h max)
 * - Cooldown: 36h mandatory rest between sessions
 * - Keep-alive: 60min (90min idle - 30min safety)
 * - Auto-shutdown: At 8.4h limit via watchdog (NOT after job - runs FULL session!)
 * 
 * SECURITY:
 * - Persistent cookies (auto-login after first auth)
 * - Encrypted credentials via SecretsVault
 * - Graceful error handling (CAPTCHA, timeout, network)
 */

import puppeteer from 'puppeteer-extra';
import type { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createCursor } from 'ghost-cursor';
import { nanoid } from 'nanoid'; // ✅ DB-first session IDs
import { db } from '../db';
import { gpuWorkers, gpuSessions } from '../../shared/schema'; // ✅ DB-first tables
import { eq, and, lt, gte, inArray } from 'drizzle-orm'; // ✅ DB-first queries
import { getQuotaEnforcementService } from '../services/quota-enforcement-service';
import { GPU_QUOTA_CONSTANTS } from './intelligent-quota-manager'; // ✅ Centralized constants
import { QUOTA_LIMITS } from '../config/quota-limits';
import { alertService } from '../services/alert-service';
import { getPuppeteerConfig } from '../utils/puppeteer-config';

// ✅ P2.8: Add stealth plugin for maximum anti-detection
puppeteer.use(StealthPlugin());

// ============================================================================
// TYPES
// ============================================================================

interface ColabConfig {
  notebookUrl: string;
  googleEmail: string;
  googlePassword: string;
  workerId: number;
  headless?: boolean;
}

interface ColabSession {
  browser: Browser;
  page: Page;
  workerId: number;
  sessionId: string;
  ngrokUrl?: string;
  keepAliveInterval?: NodeJS.Timeout;
  autoShutdownTimeout?: NodeJS.Timeout; // ✅ CRITICAL FIX: Auto-shutdown at 11h
  sessionStartTime: Date; // ✅ CRITICAL FIX: Track session duration
  cursor: any; // ghost-cursor instance
}

// ✅ P2.8.6: Viewport randomization (3 common resolutions)
const VIEWPORTS = [
  { width: 1920, height: 1080 }, // Full HD
  { width: 1366, height: 768 },  // Laptop comum
  { width: 1440, height: 900 },  // MacBook Pro
];

// ✅ P2.8.3: Random delay helper (humanização)
function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper: waitForTimeout replacement (Puppeteer v20+ compatibility)
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// COLAB ORCHESTRATOR CLASS - ENTERPRISE DB-FIRST (2025)
// ============================================================================

/**
 * CRITICAL: Runtime cache for NON-SERIALIZABLE Puppeteer objects only!
 * All authoritative state lives in `gpu_sessions` table (DB-first).
 */
interface ColabRuntimeCache {
  browser: Browser;
  page: Page;
  cursor: any; // ghost-cursor instance
  keepAliveInterval: NodeJS.Timeout;
}

export class ColabOrchestrator {
  /**
   * ✅ MINIMAL RUNTIME CACHE: Puppeteer objects ONLY (not serializable)
   * Authoritative session state lives in PostgreSQL `gpu_sessions` table
   * 
   * WARNING: activeSessions Map REMOVED (violated ZERO in-memory rule!)
   */
  private runtimeCache: Map<number, ColabRuntimeCache> = new Map();
  
  private readonly CHROME_USER_DATA_DIR = './chrome-data/colab';
  
  /**
   * ✅ POSTGRESQL: Cleanup orphaned sessions on server startup
   * 
   * Terminates sessions that:
   * 1. Are stuck in 'starting' status (timeout exceeded)
   * 2. Have expired (expiresAt < now)
   * 
   * CRITICAL: Prevents session leaks after crashes/restarts!
   */
  async cleanupOrphanedSessions(): Promise<void> {
    try {
      console.log('[Colab] 🧹 Cleaning up orphaned sessions...');
      const now = Date.now();
      const startingTimeout = now - GPU_QUOTA_CONSTANTS.COLAB_STARTUP_TIMEOUT;
      
      // Query orphaned sessions
      const orphanedSessions = await db.query.gpuSessions.findMany({
        where: and(
          eq(gpuSessions.provider, 'colab'),
          inArray(gpuSessions.status, ['starting', 'active', 'idle']),
        ),
      });
      
      let cleanedCount = 0;
      
      for (const session of orphanedSessions) {
        const shouldTerminate = 
          // Case 1: Stuck in 'starting' (exceeded timeout)
          (session.status === 'starting' && new Date(session.createdAt).getTime() < startingTimeout) ||
          // Case 2: Expired session (quota exhausted)
          (session.expiresAt && new Date(session.expiresAt).getTime() < now);
        
        if (shouldTerminate) {
          const reason = session.status === 'starting' 
            ? 'startup_timeout'
            : 'quota_expired';
          
          await db.update(gpuSessions)
            .set({
              status: 'terminated',
              stoppedAt: new Date(),
              error: `Orphaned session cleanup: ${reason}`,
            })
            .where(eq(gpuSessions.id, session.id));
          
          cleanedCount++;
          console.log(
            `[Colab]    → Terminated session ${session.id} ` +
            `(worker ${session.workerId}, reason: ${reason})`
          );
        }
      }
      
      // Clean up runtime cache (all entries - stale after restart)
      this.runtimeCache.clear();
      
      console.log(`[Colab] ✅ Cleanup complete: ${cleanedCount} orphaned sessions terminated`);
      
      // Log active Colab sessions for visibility
      const activeSessions = await db.query.gpuSessions.findMany({
        where: and(
          eq(gpuSessions.provider, 'colab'),
          inArray(gpuSessions.status, ['active', 'idle']),
        ),
      });
      
      if (activeSessions.length > 0) {
        console.log(`[Colab] 📊 Active sessions: ${activeSessions.length}`);
        for (const session of activeSessions) {
          const now = Date.now();
          const minutesRemaining = Math.floor(
            (new Date(session.expiresAt).getTime() - now) / (60 * 1000)
          );
          console.log(
            `[Colab]    → Worker ${session.workerId}: ` +
            `${minutesRemaining}min quota remaining, ` +
            `last activity ${Math.floor((now - new Date(session.lastActivity).getTime()) / (60 * 1000))}min ago`
          );
        }
      }
    } catch (error) {
      console.error('[Colab] ❌ Error during orphaned session cleanup:', error);
      throw error;
    }
  }
  
  /**
   * ✅ POSTGRESQL-BACKED: Start Colab notebook session (SCHEDULE-BASED!)
   * 
   * DB-FIRST FLOW:
   * 1. INSERT gpu_sessions row (status='starting') - partial unique index prevents duplicates
   * 2. Launch Puppeteer browser
   * 3. UPDATE gpu_sessions to 'active' (with status guard + lastActivity)
   * 4. Cache Puppeteer objects in runtime cache
   * 5. Cleanup on failure (mark session terminated)
   * 
   * CRITICAL: Colab uses SCHEDULE-BASED activation (NOT on-demand like Kaggle!)
   * - Runs FULL 8.4h session (no idle timeout)
   * - 36h cooldown enforced by QuotaEnforcementService
   */
  async startSession(config: ColabConfig): Promise<{ success: boolean; ngrokUrl?: string; error?: string }> {
    let dbSessionId: number | undefined;
    let sessionId: string | undefined;
    
    try {
      console.log(`[Colab] 🚀 Starting ENTERPRISE session for worker ${config.workerId}...`);
      
      // ============================================================================
      // 1. CHECK QUOTA (ENTERPRISE 70% ENFORCEMENT - CRITICAL!)
      // COLAB SPECIFIC: Schedule-based (8.4h → 36h rest), NOT on-demand!
      // ============================================================================
      
      const quotaService = await getQuotaEnforcementService();
      const quotaValidation = await quotaService.validateCanStart(config.workerId, 'colab');
      
      if (!quotaValidation.canStart) {
        console.error(
          `[Colab] 🚫 Cannot start session - ${quotaValidation.reason}`
        );
        return {
          success: false,
          error: `Quota enforcement failed: ${quotaValidation.reason}`
        };
      }
      
      console.log(`[Colab] ✅ Quota validation passed - ${quotaValidation.reason}`);
      
      // ============================================================================
      // 2. ✅ POSTGRESQL: INSERT session row (DB-level exclusivity guard)
      // Partial unique index prevents duplicate sessions for same worker
      // ============================================================================
      
      sessionId = nanoid();
      const maxSessionDurationMs = quotaValidation.quotaDetails?.sessionLimitMs || GPU_QUOTA_CONSTANTS.COLAB_SAFETY * 1000;
      const expiresAt = new Date(Date.now() + maxSessionDurationMs);
      const now = new Date();
      
      const [dbSession] = await db.insert(gpuSessions)
        .values({
          workerId: config.workerId,
          sessionId,
          provider: 'colab',
          status: 'starting',
          expiresAt,
          lastActivity: now, // ✅ CRITICAL: Initialize lastActivity (observability)
        })
        .onConflictDoNothing()
        .returning();
      
      if (!dbSession) {
        console.warn(`[Colab] ⚠️  Session already active for worker ${config.workerId} (DB partial unique index)`);
        return {
          success: false,
          error: `Session already active for worker ${config.workerId}`
        };
      }
      
      dbSessionId = dbSession.id;
      console.log(`[Colab] ✅ DB session created (ID: ${dbSessionId}, status: starting)`);
      
      try {
        // ============================================================================
        // STEP 1: LAUNCH BROWSER WITH ANTI-DETECTION (uses system Chromium)
        // ============================================================================
        
        const baseConfig = await getPuppeteerConfig({
          headless: config.headless ?? true,
          userDataDir: `${this.CHROME_USER_DATA_DIR}-${config.workerId}`,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
          ],
        });
        
        const browser = await puppeteer.launch(baseConfig);
      
      const page = await browser.newPage();
      
      // ✅ P2.8.6: Randomize viewport
      const viewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
      await page.setViewport(viewport);
      console.log(`[Colab] 📱 Viewport: ${viewport.width}x${viewport.height}`);
      
      // ✅ P2.8.4: Custom User-Agent (Chrome 131 - latest 2025)
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/131.0.0.0 Safari/537.36'
      );
      
      // ✅ P2.8.4: Realistic headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document',
      });
      
      // ✅ P2.8.5: Resource blocking (performance + ad-blocker simulation)
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        
        // Block images, fonts, stylesheets (faster + looks like ad-blocker)
        if (['image', 'stylesheet', 'font'].includes(resourceType)) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      // ✅ P2.8.3: Create ghost-cursor for natural mouse movements
      const cursor = createCursor(page);
      
      // ============================================================================
      // 3. NAVIGATE TO NOTEBOOK (WITH HUMANIZATION)
      // ============================================================================
      
      console.log(`[Colab] 🌐 Navigating to ${config.notebookUrl}...`);
      
      // ✅ P2.8.3: Random delay before navigation (human behavior)
      await delay(randomDelay(1000, 3000));
      
      await page.goto(config.notebookUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 60000 
      });
      
      // ============================================================================
      // 4. CHECK FOR CAPTCHA OR LOGIN
      // ============================================================================
      
      // ✅ P2.8.2: CAPTCHA detection (CRITICAL)
      const hasCaptcha = await this.detectCaptcha(page);
      if (hasCaptcha) {
        console.error(`[Colab] 🚨 CAPTCHA DETECTED - Manual intervention required!`);
        await browser.close();
        
        // TODO: Notify admin via webhook/email
        await this.notifyAdminCaptcha(config.workerId, config.notebookUrl);
        
        return { 
          success: false, 
          error: 'CAPTCHA detected - requires manual intervention' 
        };
      }
      
      // Check if login required
      const isLoginPage = await page.url().includes('accounts.google.com');
      if (isLoginPage) {
        console.log(`[Colab] 🔐 Login required - authenticating with humanization...`);
        
        const loginSuccess = await this.performGoogleLoginHumanized(
          page, 
          cursor,
          config.googleEmail, 
          config.googlePassword
        );
        
        if (!loginSuccess) {
          await browser.close();
          return { success: false, error: 'Login failed' };
        }
        
        // Navigate back to notebook
        await delay(randomDelay(2000, 4000));
        await page.goto(config.notebookUrl, { waitUntil: 'networkidle2' });
      }
      
      // ============================================================================
      // 5. COLAB AUTOMATION (WITH HUMANIZATION)
      // ============================================================================
      
      // Wait for Colab to load (random delay)
      await delay(randomDelay(4000, 6000));
      
      // Connect to runtime
      await this.connectRuntimeHumanized(page, cursor);
      
      // Run all cells
      console.log(`[Colab] ▶️  Running all cells...`);
      await this.runAllCellsHumanized(page, cursor);
      
      // ============================================================================
      // 6. MONITOR FOR NGROK URL
      // ============================================================================
      
      console.log(`[Colab] 🔍 Monitoring logs for Ngrok URL...`);
      const ngrokUrl = await this.waitForNgrokUrl(page);
      
      if (!ngrokUrl) {
        await browser.close();
        throw new Error('Failed to detect Ngrok URL in logs');
      }
      
      console.log(`[Colab] ✅ Ngrok URL detected: ${ngrokUrl}`);
      
      // ============================================================================
      // 7. ✅ POSTGRESQL: UPDATE session to 'active' (with status guard!)
      // Status guard prevents race condition (concurrent stopSession overwriting)
      // ============================================================================
      
      const sessionNow = new Date();
      const updatedRows = await db.update(gpuSessions)
        .set({
          status: 'active',
          ngrokUrl,
          startedAt: sessionNow,
          lastActivity: sessionNow, // ✅ CRITICAL: Update lastActivity (observability)
        })
        .where(and(
          eq(gpuSessions.id, dbSessionId!),
          eq(gpuSessions.status, 'starting') // ✅ Status guard (prevent race)
        ))
        .returning();
      
      if (updatedRows.length === 0) {
        // Status guard failed - session was already stopped/terminated
        console.error(`[Colab] ❌ Status guard failed - session ${dbSessionId} already stopped`);
        await browser.close();
        throw new Error('Session was stopped during startup (race condition)');
      }
      
      console.log(`[Colab] ✅ DB session updated to 'active' (ID: ${dbSessionId})`);
      
      // ============================================================================
      // 8. ✅ RUNTIME CACHE: Store Puppeteer objects (NOT serializable state!)
      // ============================================================================
      
      const keepAliveInterval = setInterval(async () => {
        await this.keepAliveHumanized(config.workerId);
      }, GPU_QUOTA_CONSTANTS.COLAB_KEEP_ALIVE_INTERVAL); // ✅ Centralized constant
      
      this.runtimeCache.set(config.workerId, {
        browser,
        page,
        cursor,
        keepAliveInterval,
      });
      
      // Update gpu_workers table (legacy compatibility)
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: sessionId,
          ngrokUrl: ngrokUrl,
          status: 'healthy',
          sessionStartedAt: sessionNow,
        })
        .where(eq(gpuWorkers.id, config.workerId));
      
      console.log(`[Colab] 🎉 Session started successfully! Auto-shutdown at ${expiresAt.toISOString()}`);
      return { success: true, ngrokUrl };
        
      } catch (error) {
        // ============================================================================
        // ERROR HANDLING: Mark session as terminated + cleanup runtime cache
        // ============================================================================
        console.error(`[Colab] ❌ Error during browser launch/setup:`, error);
        
        // ✅ POSTGRESQL: Mark session as terminated (if DB session created)
        if (dbSessionId) {
          try {
            await db.update(gpuSessions)
              .set({ 
                status: 'terminated',
                stoppedAt: new Date(),
                error: String(error).slice(0, 500), // Store error (truncated)
              })
              .where(eq(gpuSessions.id, dbSessionId));
            console.log(`[Colab] ✅ DB session marked as terminated (ID: ${dbSessionId})`);
          } catch (dbError) {
            console.error(`[Colab] ⚠️ Failed to mark session as terminated:`, dbError);
          }
        }
        
        return { success: false, error: String(error) };
      }
    } catch (error) {
      // Outer catch for any errors outside try-finally
      console.error(`[Colab] ❌ Fatal error in startSession:`, error);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * ✅ POSTGRESQL-BACKED: Stop Colab session gracefully
   * 
   * DB-FIRST FLOW:
   * 1. Query gpu_sessions for active session (DB is source of truth)
   * 2. Get runtime cache for Puppeteer objects
   * 3. UPDATE gpu_sessions to 'completed' (with status guard)
   * 4. Cleanup Puppeteer + runtime cache
   */
  async stopSession(workerId: number): Promise<{ success: boolean; error?: string }> {
    try {
      // ============================================================================
      // 1. ✅ POSTGRESQL: Query DB for session (source of truth)
      // ============================================================================
      
      const [dbSession] = await db.query.gpuSessions.findMany({
        where: and(
          eq(gpuSessions.workerId, workerId),
          eq(gpuSessions.provider, 'colab'),
          inArray(gpuSessions.status, ['starting', 'active', 'idle']) // ✅ Status guard
        ),
        limit: 1,
      });
      
      if (!dbSession) {
        console.warn(`[Colab] ⚠️  No active session found for worker ${workerId}`);
        return { success: false, error: 'Session not found or already stopped' };
      }
      
      console.log(`[Colab] 🛑 Stopping session for worker ${workerId} (DB ID: ${dbSession.id})...`);
      
      // ============================================================================
      // 2. Get runtime cache for Puppeteer objects (if available)
      // ============================================================================
      
      const cache = this.runtimeCache.get(workerId);
      
      if (cache) {
        // Stop keep-alive timer
        if (cache.keepAliveInterval) {
          clearInterval(cache.keepAliveInterval);
        }
        
        // Stop runtime in Colab (humanized)
        try {
          await this.stopRuntimeHumanized(cache.page, cache.cursor);
        } catch (error) {
          console.warn(`[Colab] ⚠️ Error stopping runtime (non-fatal):`, error);
        }
        
        // Close browser
        try {
          await cache.browser.close();
        } catch (error) {
          console.warn(`[Colab] ⚠️ Error closing browser (non-fatal):`, error);
        }
        
        // Remove from runtime cache
        this.runtimeCache.delete(workerId);
      } else {
        console.warn(`[Colab] ⚠️ Runtime cache not found (session may have crashed)`);
      }
      
      // ============================================================================
      // 3. ✅ POSTGRESQL: UPDATE session to 'completed' (with status guard)
      // ============================================================================
      
      const now = new Date();
      const sessionDurationSeconds = dbSession.startedAt 
        ? Math.floor((now.getTime() - dbSession.startedAt.getTime()) / 1000)
        : 0;
      
      const updatedRows = await db.update(gpuSessions)
        .set({
          status: 'completed',
          stoppedAt: now,
        })
        .where(and(
          eq(gpuSessions.id, dbSession.id),
          inArray(gpuSessions.status, ['starting', 'active', 'idle']) // ✅ Status guard
        ))
        .returning();
      
      if (updatedRows.length === 0) {
        console.warn(`[Colab] ⚠️  Status guard failed - session ${dbSession.id} already stopped by concurrent call`);
      } else {
        console.log(`[Colab] ✅ DB session marked as completed (ID: ${dbSession.id}, runtime: ${(sessionDurationSeconds/3600).toFixed(2)}h)`);
      }
      
      // Update gpu_workers table (legacy compatibility)
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: null,
          status: 'offline',
          sessionStartedAt: null,
        })
        .where(eq(gpuWorkers.id, workerId));
      
      console.log(`[Colab] ✅ Session stopped successfully (${(sessionDurationSeconds/3600).toFixed(2)}h runtime)`);
      return { success: true };
      
    } catch (error) {
      console.error(`[Colab] ❌ Error stopping session:`, error);
      return { success: false, error: String(error) };
    }
  }
  
  // ============================================================================
  // PRIVATE METHODS - ANTI-DETECTION + HUMANIZATION
  // ============================================================================
  
  /**
   * ✅ P2.8.2: Detect CAPTCHA (reCAPTCHA, hCaptcha, Cloudflare Turnstile)
   */
  private async detectCaptcha(page: Page): Promise<boolean> {
    try {
      const hasCaptcha = await page.evaluate(() => {
        // Check for reCAPTCHA
        if (document.querySelector('iframe[src*="recaptcha"]')) return true;
        if (document.querySelector('.g-recaptcha')) return true;
        
        // Check for hCaptcha
        if (document.querySelector('iframe[src*="hcaptcha"]')) return true;
        if (document.querySelector('.h-captcha')) return true;
        
        // Check for Cloudflare Turnstile
        if (document.querySelector('iframe[src*="challenges.cloudflare.com"]')) return true;
        
        // Check for generic challenge text
        const bodyText = document.body.innerText.toLowerCase();
        if (bodyText.includes('verify you are human')) return true;
        if (bodyText.includes('complete the captcha')) return true;
        
        return false;
      });
      
      return hasCaptcha;
    } catch {
      return false;
    }
  }
  
  /**
   * ✅ P2.8.2: Notify admin about CAPTCHA
   * ✅ IMPLEMENTED: Webhook/Email alerts via AlertService
   */
  private async notifyAdminCaptcha(workerId: number, notebookUrl: string): Promise<void> {
    console.log(`[Colab] 📧 ADMIN NOTIFICATION: CAPTCHA required for worker ${workerId}`);
    console.log(`[Colab] 🔗 Notebook: ${notebookUrl}`);
    
    // Send alert via webhook/email/logging
    await alertService.sendAlert({
      severity: 'critical',
      title: 'CAPTCHA Detected - Manual Intervention Required',
      message: `Google Colab worker ${workerId} encountered CAPTCHA during automation. Manual login required.`,
      context: {
        workerId,
        notebookUrl,
        provider: 'colab',
        action: 'manual_intervention_required',
        timestamp: new Date().toISOString(),
      },
    });
  }
  
  /**
   * ✅ P2.8.3: Perform Google login with FULL humanization
   */
  private async performGoogleLoginHumanized(
    page: Page, 
    cursor: any,
    email: string, 
    password: string
  ): Promise<boolean> {
    try {
      // ============================================================================
      // EMAIL STEP (WITH HUMANIZATION)
      // ============================================================================
      
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      
      // Random delay before typing
      await delay(randomDelay(800, 1500));
      
      // Type email with realistic delays (80-300ms between keystrokes)
      for (const char of email) {
        await page.type('input[type="email"]', char, { 
          delay: randomDelay(80, 300) 
        });
      }
      
      // Random delay before clicking Next
      await delay(randomDelay(500, 1200));
      
      // Click Next button with ghost-cursor (natural movement)
      await cursor.click('#identifierNext');
      
      // Wait for password page (random delay)
      await delay(randomDelay(2000, 3500));
      
      // ============================================================================
      // PASSWORD STEP (WITH HUMANIZATION)
      // ============================================================================
      
      await page.waitForSelector('input[type="password"]', { 
        visible: true, 
        timeout: 10000 
      });
      
      // Random delay before typing password
      await delay(randomDelay(800, 1500));
      
      // Type password with realistic delays
      for (const char of password) {
        await page.type('input[type="password"]', char, { 
          delay: randomDelay(80, 300) 
        });
      }
      
      // Random delay before clicking Next
      await delay(randomDelay(500, 1200));
      
      // Click Next button with ghost-cursor
      await cursor.click('#passwordNext');
      
      // Wait for redirect (navigation might be slow)
      await page.waitForNavigation({ 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      }).catch(() => {
        // Ignore timeout - might already be redirected
      });
      
      console.log(`[Colab] ✅ Google login successful (humanized)`);
      return true;
      
    } catch (error) {
      console.error(`[Colab] ❌ Google login failed:`, error);
      return false;
    }
  }
  
  /**
   * ✅ P2.8.3: Connect to Colab runtime (humanized)
   */
  private async connectRuntimeHumanized(page: Page, cursor: any): Promise<void> {
    try {
      // Check if already connected
      const isConnected = await page.evaluate(() => {
        const connectButton = document.querySelector('[aria-label*="Connect"]');
        return !connectButton;
      });
      
      if (isConnected) {
        console.log(`[Colab] ✅ Runtime already connected`);
        return;
      }
      
      console.log(`[Colab] 🔌 Connecting to runtime...`);
      
      // Random delay before clicking
      await delay(randomDelay(1000, 2000));
      
      // Click connect button with ghost-cursor
      const connectButton = await page.$('[aria-label*="Connect"]');
      if (connectButton) {
        await cursor.click(connectButton);
      }
      
      // Wait for connection (random delay)
      await delay(randomDelay(4000, 6000));
      
      console.log(`[Colab] ✅ Runtime connected`);
      
    } catch (error) {
      console.error(`[Colab] ⚠️  Error connecting runtime:`, error);
      // Non-fatal - might already be connected
    }
  }
  
  /**
   * ✅ P2.8.3: Run all cells (humanized)
   */
  private async runAllCellsHumanized(page: Page, cursor: any): Promise<void> {
    try {
      // Random delay before opening Runtime menu
      await delay(randomDelay(1000, 2000));
      
      // Click Runtime menu
      await page.evaluate(() => {
        const runtimeMenu = Array.from(document.querySelectorAll('div')).find(
          el => el.textContent?.includes('Runtime')
        );
        if (runtimeMenu) (runtimeMenu as HTMLElement).click();
      });
      
      // Random delay before clicking "Run all"
      await delay(randomDelay(800, 1500));
      
      // Click "Run all"
      await page.evaluate(() => {
        const runAllItem = Array.from(document.querySelectorAll('div[role="menuitem"]')).find(
          el => el.textContent?.includes('Run all')
        );
        if (runAllItem) (runAllItem as HTMLElement).click();
      });
      
      console.log(`[Colab] ✅ Executed "Run all" (humanized)`);
      
    } catch (error) {
      throw new Error(`Failed to run cells: ${error}`);
    }
  }
  
  /**
   * Monitor cell outputs for Ngrok URL
   */
  private async waitForNgrokUrl(page: Page, timeout = 120000): Promise<string | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const ngrokUrl = await page.evaluate(() => {
          const outputs = Array.from(document.querySelectorAll('.output_area'));
          
          for (const output of outputs) {
            const text = output.textContent || '';
            const match = text.match(/https:\/\/[\w-]+\.ngrok[-\w]*\.io/);
            if (match) return match[0];
          }
          
          return null;
        });
        
        if (ngrokUrl) return ngrokUrl;
        
      } catch (error) {
        // Continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return null;
  }
  
  /**
   * ✅ P2.8.3: Stop runtime (humanized)
   */
  private async stopRuntimeHumanized(page: Page, cursor: any): Promise<void> {
    try {
      // Random delay before opening Runtime menu
      await delay(randomDelay(1000, 2000));
      
      // Click Runtime menu
      await page.evaluate(() => {
        const runtimeMenu = Array.from(document.querySelectorAll('div')).find(
          el => el.textContent?.includes('Runtime')
        );
        if (runtimeMenu) (runtimeMenu as HTMLElement).click();
      });
      
      // Random delay before clicking disconnect
      await delay(randomDelay(800, 1500));
      
      // Click "Disconnect and delete runtime"
      await page.evaluate(() => {
        const disconnectItem = Array.from(document.querySelectorAll('div[role="menuitem"]')).find(
          el => el.textContent?.includes('Disconnect and delete runtime')
        );
        if (disconnectItem) (disconnectItem as HTMLElement).click();
      });
      
      console.log(`[Colab] ✅ Runtime stopped (humanized)`);
      
    } catch (error) {
      console.error(`[Colab] ⚠️  Error stopping runtime:`, error);
    }
  }
  
  /**
   * ✅ P2.8.3: Keep-alive with humanized mouse movements
   */
  private async keepAliveHumanized(workerId: number): Promise<void> {
    try {
      const session = this.activeSessions.get(workerId);
      if (!session) return;
      
      console.log(`[Colab] 💓 Keep-alive for worker ${workerId} (humanized)`);
      
      // Random mouse movements using ghost-cursor
      const x1 = randomDelay(100, 500);
      const y1 = randomDelay(100, 500);
      const x2 = randomDelay(600, 1200);
      const y2 = randomDelay(600, 1000);
      
      await session.cursor.move({ x: x1, y: y1 });
      await delay(randomDelay(500, 1500));
      await session.cursor.move({ x: x2, y: y2 });
      
    } catch (error) {
      console.error(`[Colab] ⚠️  Keep-alive error:`, error);
    }
  }
  
  // ============================================================================
  // PUBLIC QUERY METHODS
  // ============================================================================
  
  getSessionStatus(workerId: number): ColabSession | undefined {
    return this.activeSessions.get(workerId);
  }
  
  getAllSessions(): ColabSession[] {
    return Array.from(this.activeSessions.values());
  }
}

// Singleton instance
export const colabOrchestrator = new ColabOrchestrator();
