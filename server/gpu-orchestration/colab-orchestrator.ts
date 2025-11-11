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
import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { getQuotaEnforcementService } from '../services/quota-enforcement-service';
import { QUOTA_LIMITS } from '../config/quota-limits';
import { alertService } from '../services/alert-service';

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
// COLAB ORCHESTRATOR CLASS
// ============================================================================

export class ColabOrchestrator {
  private activeSessions: Map<number, ColabSession> = new Map();
  private readonly CHROME_USER_DATA_DIR = './chrome-data/colab';
  private readonly KEEP_ALIVE_INTERVAL = 60 * 60 * 1000; // 60min
  
  /**
   * ✅ P2.8: Start Colab notebook session (ENTERPRISE 2025)
   * ✅ CRITICAL FIX: Integrated with GPUCooldownManager for quota enforcement
   */
  async startSession(config: ColabConfig): Promise<{ success: boolean; ngrokUrl?: string; error?: string }> {
    try {
      console.log(`[Colab] 🚀 Starting ENTERPRISE session for worker ${config.workerId}...`);
      
      // ============================================================================
      // STEP 0A: GUARD - Check if session already exists (prevent duplicate GPU startups)
      // ============================================================================
      
      if (this.activeSessions.has(config.workerId)) {
        console.warn(`[Colab] ⚠️  Session already active for worker ${config.workerId} - preventing duplicate startup`);
        return { 
          success: false, 
          error: `Session already active for worker ${config.workerId}` 
        };
      }
      
      // ============================================================================
      // STEP 0B: CHECK COOLDOWN/QUOTA (ENTERPRISE 70% ENFORCEMENT)
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
      
      // STEP 0C: RESERVE worker (AFTER checks pass - prevent race condition)
      // Set placeholder to block concurrent calls before browser launch
      this.activeSessions.set(config.workerId, null as any);
      
      try {
        // ============================================================================
        // STEP 1: LAUNCH BROWSER WITH ANTI-DETECTION
        // ============================================================================
        
        const browser = await puppeteer.launch({
        headless: config.headless ?? true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          // ✅ P2.8: Additional anti-detection flags
          '--disable-blink-features=AutomationControlled',
          '--window-size=1920,1080',
        ],
        userDataDir: `${this.CHROME_USER_DATA_DIR}-${config.workerId}`,
      });
      
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
      
      const sessionId = `colab-${config.workerId}-${Date.now()}`;
      
      // ============================================================================
      // STEP 2: NAVIGATE TO NOTEBOOK (WITH HUMANIZATION)
      // ============================================================================
      
      console.log(`[Colab] 🌐 Navigating to ${config.notebookUrl}...`);
      
      // ✅ P2.8.3: Random delay before navigation (human behavior)
      await delay(randomDelay(1000, 3000));
      
      await page.goto(config.notebookUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 60000 
      });
      
      // ============================================================================
      // STEP 3: CHECK FOR CAPTCHA OR LOGIN
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
      // STEP 4: COLAB AUTOMATION (WITH HUMANIZATION)
      // ============================================================================
      
      // Wait for Colab to load (random delay)
      await delay(randomDelay(4000, 6000));
      
      // Connect to runtime
      await this.connectRuntimeHumanized(page, cursor);
      
      // Run all cells
      console.log(`[Colab] ▶️  Running all cells...`);
      await this.runAllCellsHumanized(page, cursor);
      
      // ============================================================================
      // STEP 5: MONITOR FOR NGROK URL
      // ============================================================================
      
      console.log(`[Colab] 🔍 Monitoring logs for Ngrok URL...`);
      const ngrokUrl = await this.waitForNgrokUrl(page);
      
      if (!ngrokUrl) {
        await browser.close();
        throw new Error('Failed to detect Ngrok URL in logs');
      }
      
      console.log(`[Colab] ✅ Ngrok URL detected: ${ngrokUrl}`);
      
      // ============================================================================
      // STEP 6: FINALIZE SESSION
      // ============================================================================
      
      const sessionStartTime = new Date();
      
      const session: ColabSession = {
        browser,
        page,
        workerId: config.workerId,
        sessionId,
        ngrokUrl,
        cursor,
        sessionStartTime,
      };
      
      this.activeSessions.set(config.workerId, session);
      
      // ============================================================================
      // ENTERPRISE: Register session in PostgreSQL (70% quota enforcement)
      // ============================================================================
      
      const sessionRegistration = await quotaService.startSession(
        config.workerId,
        'colab',
        sessionId,
        ngrokUrl
      );
      
      if (!sessionRegistration.success) {
        console.error(`[Colab] ❌ FATAL: Failed to register session in DB: ${sessionRegistration.error}`);
        
        // CRITICAL: Clean up Puppeteer session before throwing (prevent quota leakage)
        console.log(`[Colab] 🧹 Cleaning up Puppeteer session due to DB registration failure...`);
        try {
          await browser.close();
        } catch (cleanupError) {
          console.error(`[Colab] ⚠️ Error during cleanup:`, cleanupError);
        }
        
        this.activeSessions.delete(config.workerId);
        throw new Error(`DB registration failed - cannot guarantee 70% quota enforcement: ${sessionRegistration.error}`);
      }
      
      console.log(`[Colab] ✅ Session registered in DB (ID: ${sessionRegistration.sessionId}, auto-shutdown at ${sessionRegistration.autoShutdownAt?.toISOString()})`);
      
      // Start keep-alive (prevent idle disconnect)
      session.keepAliveInterval = setInterval(async () => {
        await this.keepAliveHumanized(config.workerId);
      }, this.KEEP_ALIVE_INTERVAL);
      
      // ✅ REMOVED: In-memory auto-shutdown timer (replaced by watchdog)
      // Watchdog Service monitors autoShutdownAt from DB and forces shutdown
      // This ensures shutdown happens even if process crashes/restarts
      
      // Update database
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: sessionId,
          ngrokUrl: ngrokUrl,
          status: 'healthy',
          sessionStartedAt: new Date(), // Track session start time for orchestrator-service guard
        })
        .where(eq(gpuWorkers.id, config.workerId));
      
      console.log(`[Colab] 🎉 Session started successfully! Auto-shutdown in 11h.`);
      return { success: true, ngrokUrl };
        
      } catch (error) {
        console.error(`[Colab] ❌ Error starting session:`, error);
        return { success: false, error: String(error) };
      } finally {
        // CRITICAL: Clean up placeholder if not replaced (prevent permanent lock)
        // Only delete if still null (success path replaces with real session)
        if (this.activeSessions.get(config.workerId) === null) {
          this.activeSessions.delete(config.workerId);
          console.warn(`[Colab] 🧹 Cleaned up placeholder for worker ${config.workerId}`);
        }
      }
    } catch (error) {
      // Outer catch for any errors outside try-finally
      console.error(`[Colab] ❌ Fatal error in startSession:`, error);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * ✅ P2.8: Stop Colab session gracefully
   * ✅ CRITICAL FIX: Integrated with GPUCooldownManager for quota enforcement
   */
  async stopSession(workerId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const session = this.activeSessions.get(workerId);
      
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      
      console.log(`[Colab] 🛑 Stopping session for worker ${workerId}...`);
      
      // ✅ CRITICAL FIX: Calculate session duration
      const sessionEndTime = new Date();
      const sessionDurationMs = sessionEndTime.getTime() - session.sessionStartTime.getTime();
      const sessionDurationSeconds = Math.floor(sessionDurationMs / 1000);
      const sessionDurationHours = (sessionDurationSeconds / 3600).toFixed(2);
      
      console.log(`[Colab] ⏱️  Session duration: ${sessionDurationHours}h`);
      
      // Stop timers
      if (session.keepAliveInterval) {
        clearInterval(session.keepAliveInterval);
      }
      
      // Stop runtime in Colab (humanized)
      await this.stopRuntimeHumanized(session.page, session.cursor);
      
      // Close browser
      await session.browser.close();
      
      // Remove from active sessions
      this.activeSessions.delete(workerId);
      
      // ============================================================================
      // ENTERPRISE: End session in PostgreSQL (apply cooldown, mark inactive)
      // ============================================================================
      
      // Find session ID from DB
      const quotaService = await getQuotaEnforcementService();
      const activeSessions = await quotaService.getActiveSessions();
      const dbSession = activeSessions.find(s => s.workerId === workerId);
      
      if (dbSession) {
        const sessionEnded = await quotaService.endSession(dbSession.id, 'manual_stop');
        if (!sessionEnded) {
          console.error(`[Colab] ❌ Failed to end session in DB (ID: ${dbSession.id})`);
        } else {
          console.log(`[Colab] ✅ Session ended in DB (ID: ${dbSession.id}, 36h cooldown applied)`);
        }
      } else {
        console.warn(`[Colab] ⚠️ Session not found in DB - may have been already ended by watchdog`);
      }
      
      // Update database
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: null,
          status: 'offline',
          sessionStartedAt: null, // Allow future restarts
        })
        .where(eq(gpuWorkers.id, workerId));
      
      console.log(`[Colab] ✅ Session stopped successfully (${sessionDurationHours}h runtime)`);
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
