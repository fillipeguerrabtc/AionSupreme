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
import { gpuWorkers } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { getQuotaEnforcementService } from '../services/quota-enforcement-service';

puppeteer.use(StealthPlugin());

interface KaggleConfig {
  notebookUrl: string;
  kaggleUsername: string;
  kagglePassword: string;
  workerId: number;
  useGPU?: boolean;  // true for GPU, false for CPU
  headless?: boolean;
}

interface KaggleSession {
  browser: Browser;
  page: Page;
  workerId: number;
  sessionId: string;
  ngrokUrl?: string;
  isGPU: boolean;
}

export class KaggleOrchestrator {
  private activeSessions: Map<number, KaggleSession> = new Map();
  private readonly CHROME_USER_DATA_DIR = './chrome-data/kaggle';
  
  /**
   * Start Kaggle notebook session
   */
  async startSession(config: KaggleConfig): Promise<{ success: boolean; ngrokUrl?: string; error?: string }> {
    try {
      console.log(`[Kaggle] Starting ${config.useGPU ? 'GPU' : 'CPU'} session for worker ${config.workerId}...`);
      
      // 0. GUARD: Check if session already exists (prevent duplicate GPU startups)
      if (this.activeSessions.has(config.workerId)) {
        console.warn(`[Kaggle] ⚠️  Session already active for worker ${config.workerId} - preventing duplicate startup`);
        return { 
          success: false, 
          error: `Session already active for worker ${config.workerId}` 
        };
      }
      
      // ============================================================================
      // 0B. CHECK QUOTA (ENTERPRISE 70% ENFORCEMENT - CRITICAL!)
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
      
      // 0C. RESERVE worker immediately (prevent race condition)
      // Set placeholder to block concurrent calls before browser launch
      this.activeSessions.set(config.workerId, null as any);
      
      // 1. Launch browser
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
      
      const sessionId = `kaggle-${config.workerId}-${Date.now()}`;
      
      // 2. Navigate to notebook
      console.log(`[Kaggle] Navigating to ${config.notebookUrl}...`);
      await page.goto(config.notebookUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // 3. Check if login required
      const isLoginPage = await page.url().includes('/account/login');
      if (isLoginPage) {
        console.log(`[Kaggle] Login required - authenticating...`);
        await this.performKaggleLogin(page, config.kaggleUsername, config.kagglePassword);
        
        // Navigate back to notebook
        await page.goto(config.notebookUrl, { waitUntil: 'networkidle2' });
      }
      
      // 4. Enable GPU if requested
      if (config.useGPU) {
        await this.enableGPU(page);
      }
      
      // 5. Run all cells
      console.log(`[Kaggle] Running all cells...`);
      await this.runAllCells(page);
      
      // 6. Monitor for Ngrok URL
      console.log(`[Kaggle] Monitoring for Ngrok URL...`);
      const ngrokUrl = await this.waitForNgrokUrl(page);
      
      if (!ngrokUrl) {
        throw new Error('Failed to detect Ngrok URL');
      }
      
      console.log(`[Kaggle] ✅ Ngrok URL detected: ${ngrokUrl}`);
      
      // 7. Store session
      const session: KaggleSession = {
        browser,
        page,
        workerId: config.workerId,
        sessionId,
        ngrokUrl,
        isGPU: config.useGPU ?? true,
      };
      
      this.activeSessions.set(config.workerId, session);
      
      // ============================================================================
      // 8. ENTERPRISE: Register session in PostgreSQL (70% quota enforcement)
      // ============================================================================
      
      const sessionRegistration = await quotaService.startSession(
        config.workerId,
        'kaggle',
        sessionId,
        ngrokUrl
      );
      
      if (!sessionRegistration.success) {
        console.error(`[Kaggle] ❌ FATAL: Failed to register session in DB: ${sessionRegistration.error}`);
        
        // CRITICAL: Clean up Puppeteer session before throwing (prevent quota leakage)
        console.log(`[Kaggle] 🧹 Cleaning up Puppeteer session due to DB registration failure...`);
        try {
          await browser.close();
        } catch (cleanupError) {
          console.error(`[Kaggle] ⚠️ Error during cleanup:`, cleanupError);
        }
        
        this.activeSessions.delete(config.workerId);
        throw new Error(`DB registration failed - cannot guarantee 70% quota enforcement: ${sessionRegistration.error}`);
      }
      
      console.log(`[Kaggle] ✅ Session registered in DB (ID: ${sessionRegistration.sessionId}, auto-shutdown at ${sessionRegistration.autoShutdownAt?.toISOString()})`);
      
      // 9. Update database (including sessionStartedAt for orchestrator-service guard)
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: sessionId,
          ngrokUrl: ngrokUrl,
          status: 'healthy',
          sessionStartedAt: new Date(), // Track session start time
        })
        .where(eq(gpuWorkers.id, config.workerId));
      
      return { success: true, ngrokUrl };
      
    } catch (error) {
      console.error(`[Kaggle] Error starting session:`, error);
      
      // CRITICAL: Clean up placeholder on failure (prevent lock)
      this.activeSessions.delete(config.workerId);
      
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Stop Kaggle session
   */
  async stopSession(workerId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const session = this.activeSessions.get(workerId);
      
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      
      console.log(`[Kaggle] Stopping session for worker ${workerId}...`);
      
      // 1. Stop notebook execution
      await this.stopNotebook(session.page);
      
      // 2. Close browser
      await session.browser.close();
      
      // 3. Remove session
      this.activeSessions.delete(workerId);
      
      // ============================================================================
      // 4. ENTERPRISE: End session in PostgreSQL (mark inactive, update quota)
      // ============================================================================
      
      const quotaService = await getQuotaEnforcementService();
      const activeSessions = await quotaService.getActiveSessions();
      const dbSession = activeSessions.find(s => s.workerId === workerId);
      
      if (dbSession) {
        const sessionEnded = await quotaService.endSession(dbSession.id, 'manual_stop');
        if (!sessionEnded) {
          console.error(`[Kaggle] ❌ Failed to end session in DB (ID: ${dbSession.id})`);
        } else {
          console.log(`[Kaggle] ✅ Session ended in DB (ID: ${dbSession.id}, quota updated)`);
        }
      } else {
        console.warn(`[Kaggle] ⚠️ Session not found in DB - may have been already ended by watchdog`);
      }
      
      // 5. Update database (clear sessionStartedAt to allow future restarts)
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: null,
          status: 'offline',
          sessionStartedAt: null, // Allow future startups
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
  private async waitForNgrokUrl(page: Page, timeout = 120000): Promise<string | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const ngrokUrl = await page.evaluate(() => {
          // Search cell outputs for ngrok URL
          const outputs = Array.from(document.querySelectorAll('.output'));
          
          for (const output of outputs) {
            const text = output.textContent || '';
            const match = text.match(/https:\/\/[\w-]+\.ngrok[-\w]*\.io/);
            if (match) return match[0];
          }
          
          return null;
        });
        
        if (ngrokUrl) return ngrokUrl;
        
      } catch (error) {
        // Continue
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
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
   * Get session status
   */
  getSessionStatus(workerId: number): KaggleSession | undefined {
    return this.activeSessions.get(workerId);
  }
  
  /**
   * Get all active sessions
   */
  getAllSessions(): KaggleSession[] {
    return Array.from(this.activeSessions.values());
  }
}

// Singleton instance
export const kaggleOrchestrator = new KaggleOrchestrator();
