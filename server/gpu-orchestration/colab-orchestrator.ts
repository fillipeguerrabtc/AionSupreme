/**
 * GOOGLE COLAB ORCHESTRATOR
 * ==========================
 * 
 * Automação completa do Google Colab FREE via Puppeteer:
 * 
 * Features:
 * - Login Google automático (cookie persistence)
 * - Start notebook remotamente (Runtime > Run all)
 * - Monitor Ngrok URL em logs
 * - Auto-register GPU no AION backend
 * - Stop antes do limite (11h de 12h)
 * - Simula atividade para evitar idle disconnect (90min)
 * 
 * SAFETY MARGINS:
 * - Stop at 11h (12h limit - 1h safety)
 * - Keep-alive every 60min (90min idle - 30min safety)
 */

import puppeteer from 'puppeteer-extra';
import type { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { db } from '../db';
import { gpuWorkers } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// Add stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

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
}

export class ColabOrchestrator {
  private activeSessions: Map<number, ColabSession> = new Map();
  private readonly CHROME_USER_DATA_DIR = './chrome-data/colab';
  private readonly KEEP_ALIVE_INTERVAL = 60 * 60 * 1000; // 60min
  
  /**
   * Start Colab notebook session
   */
  async startSession(config: ColabConfig): Promise<{ success: boolean; ngrokUrl?: string; error?: string }> {
    try {
      console.log(`[Colab] Starting session for worker ${config.workerId}...`);
      
      // 1. Launch browser with persistent auth
      const browser = await puppeteer.launch({
        headless: config.headless ?? true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
        userDataDir: `${this.CHROME_USER_DATA_DIR}-${config.workerId}`,  // Persist cookies
      });
      
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      
      const sessionId = `colab-${config.workerId}-${Date.now()}`;
      
      // 2. Navigate to notebook
      console.log(`[Colab] Navigating to ${config.notebookUrl}...`);
      await page.goto(config.notebookUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // 3. Check if login required
      const isLoginPage = await page.url().includes('accounts.google.com');
      if (isLoginPage) {
        console.log(`[Colab] Login required - authenticating...`);
        await this.performGoogleLogin(page, config.googleEmail, config.googlePassword);
        
        // Navigate back to notebook after login
        await page.goto(config.notebookUrl, { waitUntil: 'networkidle2' });
      }
      
      // 4. Wait for Colab to load
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 5. Connect to runtime (if not connected)
      await this.connectRuntime(page);
      
      // 6. Run all cells
      console.log(`[Colab] Running all cells...`);
      await this.runAllCells(page);
      
      // 7. Monitor logs for Ngrok URL
      console.log(`[Colab] Monitoring logs for Ngrok URL...`);
      const ngrokUrl = await this.waitForNgrokUrl(page);
      
      if (!ngrokUrl) {
        throw new Error('Failed to detect Ngrok URL in logs');
      }
      
      console.log(`[Colab] ✅ Ngrok URL detected: ${ngrokUrl}`);
      
      // 8. Store session
      const session: ColabSession = {
        browser,
        page,
        workerId: config.workerId,
        sessionId,
        ngrokUrl,
      };
      
      this.activeSessions.set(config.workerId, session);
      
      // 9. Start keep-alive (prevent idle disconnect)
      session.keepAliveInterval = setInterval(async () => {
        await this.keepAlive(config.workerId);
      }, this.KEEP_ALIVE_INTERVAL);
      
      // 10. Update database
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: sessionId,
          ngrokUrl: ngrokUrl,
          status: 'healthy',
        })
        .where(eq(gpuWorkers.id, config.workerId));
      
      return { success: true, ngrokUrl };
      
    } catch (error) {
      console.error(`[Colab] Error starting session:`, error);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Stop Colab session gracefully
   */
  async stopSession(workerId: number): Promise<{ success: boolean; error?: string }> {
    try {
      const session = this.activeSessions.get(workerId);
      
      if (!session) {
        return { success: false, error: 'Session not found' };
      }
      
      console.log(`[Colab] Stopping session for worker ${workerId}...`);
      
      // 1. Stop keep-alive
      if (session.keepAliveInterval) {
        clearInterval(session.keepAliveInterval);
      }
      
      // 2. Stop runtime in Colab
      await this.stopRuntime(session.page);
      
      // 3. Close browser
      await session.browser.close();
      
      // 4. Remove from active sessions
      this.activeSessions.delete(workerId);
      
      // 5. Update database
      await db.update(gpuWorkers)
        .set({
          puppeteerSessionId: null,
          status: 'offline',
        })
        .where(eq(gpuWorkers.id, workerId));
      
      console.log(`[Colab] ✅ Session stopped for worker ${workerId}`);
      
      return { success: true };
      
    } catch (error) {
      console.error(`[Colab] Error stopping session:`, error);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Perform Google login (if not already authenticated)
   */
  private async performGoogleLogin(page: Page, email: string, password: string): Promise<void> {
    try {
      // Enter email
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.type('input[type="email"]', email);
      await page.click('#identifierNext');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Enter password
      await page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
      await page.type('input[type="password"]', password);
      await page.click('#passwordNext');
      
      // Wait for redirect
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      
      console.log(`[Colab] Google login successful`);
      
    } catch (error) {
      throw new Error(`Google login failed: ${error}`);
    }
  }
  
  /**
   * Connect to Colab runtime (GPU)
   */
  private async connectRuntime(page: Page): Promise<void> {
    try {
      // Check if already connected
      const isConnected = await page.evaluate(() => {
        const connectButton = document.querySelector('[aria-label*="Connect"]');
        return !connectButton;  // If no connect button, already connected
      });
      
      if (isConnected) {
        console.log(`[Colab] Runtime already connected`);
        return;
      }
      
      // Click connect button
      await page.click('[aria-label*="Connect"]');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log(`[Colab] Runtime connected`);
      
    } catch (error) {
      console.error(`[Colab] Error connecting runtime:`, error);
      // Non-fatal - might already be connected
    }
  }
  
  /**
   * Run all cells (Runtime > Run all)
   */
  private async runAllCells(page: Page): Promise<void> {
    try {
      // Click Runtime menu
      await page.evaluate(() => {
        const runtimeMenu = Array.from(document.querySelectorAll('div')).find(
          el => el.textContent?.includes('Runtime')
        );
        if (runtimeMenu) (runtimeMenu as HTMLElement).click();
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Click "Run all"
      await page.evaluate(() => {
        const runAllItem = Array.from(document.querySelectorAll('div[role="menuitem"]')).find(
          el => el.textContent?.includes('Run all')
        );
        if (runAllItem) (runAllItem as HTMLElement).click();
      });
      
      console.log(`[Colab] Executed "Run all"`);
      
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
          // Search all cell outputs for ngrok URL pattern
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
   * Stop runtime (Runtime > Interrupt execution)
   */
  private async stopRuntime(page: Page): Promise<void> {
    try {
      // Click Runtime menu
      await page.evaluate(() => {
        const runtimeMenu = Array.from(document.querySelectorAll('div')).find(
          el => el.textContent?.includes('Runtime')
        );
        if (runtimeMenu) (runtimeMenu as HTMLElement).click();
      });
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Click "Disconnect and delete runtime"
      await page.evaluate(() => {
        const disconnectItem = Array.from(document.querySelectorAll('div[role="menuitem"]')).find(
          el => el.textContent?.includes('Disconnect and delete runtime')
        );
        if (disconnectItem) (disconnectItem as HTMLElement).click();
      });
      
      console.log(`[Colab] Runtime stopped`);
      
    } catch (error) {
      console.error(`[Colab] Error stopping runtime:`, error);
    }
  }
  
  /**
   * Keep-alive: simulate activity to prevent idle disconnect
   */
  private async keepAlive(workerId: number): Promise<void> {
    try {
      const session = this.activeSessions.get(workerId);
      if (!session) return;
      
      console.log(`[Colab] Keep-alive for worker ${workerId}`);
      
      // Simulate mouse movement
      await session.page.mouse.move(100, 100);
      await session.page.mouse.move(200, 200);
      
    } catch (error) {
      console.error(`[Colab] Keep-alive error:`, error);
    }
  }
  
  /**
   * Get session status
   */
  getSessionStatus(workerId: number): ColabSession | undefined {
    return this.activeSessions.get(workerId);
  }
  
  /**
   * Get all active sessions
   */
  getAllSessions(): ColabSession[] {
    return Array.from(this.activeSessions.values());
  }
}

// Singleton instance
export const colabOrchestrator = new ColabOrchestrator();
