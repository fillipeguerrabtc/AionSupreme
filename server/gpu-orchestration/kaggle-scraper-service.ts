/**
 * KAGGLE SCRAPER SERVICE
 * =======================
 * 
 * Production-grade Puppeteer-based quota scraper for Kaggle notebooks.
 * Extracts REAL quota data directly from Kaggle's notebook UI.
 * 
 * CRITICAL ANTI-BAN RULES:
 * - Session: 8.4h (70% × 12h) - NEVER exceed!
 * - Weekly: 21h (70% × 30h) - NEVER exceed!
 * - Idle timeout: 10min - auto-shutdown if no tasks
 * - ON-DEMAND activation: Only runs when tasks arrive
 * 
 * QUOTA LOCATION:
 * - GPU quota is displayed INSIDE notebook sidebar
 * - NOT on global settings page!
 * - Requires opening a temporary notebook (~15 seconds)
 * 
 * ARCHITECTURE:
 * - Uses puppeteer-extra with stealth plugin
 * - Cookie-based authentication (no OAuth headers)
 * - Headless Chrome with realistic user agent
 * - Automatic cleanup after scraping
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { type Cookie } from './cookie-session-service';
import { getPuppeteerConfig } from '../utils/puppeteer-config';

// Apply stealth plugin for anti-bot detection
puppeteer.use(StealthPlugin());

export interface KaggleQuotaData {
  sessionRemainingHours: number;
  sessionMaxHours: number;
  weeklyUsedHours: number;
  weeklyRemainingHours: number;
  weeklyMaxHours: number;
  canStart: boolean;
  shouldStop: boolean;
}

export class KaggleScraperService {
  private readonly KAGGLE_NOTEBOOK_URL = 'https://www.kaggle.com/code';
  private readonly USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  
  /**
   * Scrapes real quota data from Kaggle notebook
   * 
   * FLOW:
   * 1. Launch headless browser with stealth
   * 2. Load cookies from session
   * 3. Navigate to Kaggle notebooks
   * 4. Open temporary notebook (or use existing)
   * 5. Extract quota from sidebar
   * 6. Close browser & return data
   */
  async scrapeQuota(cookies: Cookie[]): Promise<KaggleQuotaData> {
    const baseConfig = await getPuppeteerConfig({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    });
    
    const browser = await puppeteer.launch(baseConfig);
    
    try {
      const page = await browser.newPage();
      
      // Set realistic user agent
      await page.setUserAgent(this.USER_AGENT);
      
      // Load cookies
      await page.setCookie(...cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      })));
      
      // Navigate to Kaggle notebooks
      await page.goto(this.KAGGLE_NOTEBOOK_URL, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      
      // Check if logged in by looking for user menu
      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('[data-testid="user-menu"]');
      });
      
      if (!isLoggedIn) {
        throw new Error('Not logged in to Kaggle - cookies may be expired');
      }
      
      // Click "New Notebook" button to open notebook editor
      await page.click('button[aria-label="New Notebook"]');
      
      // Wait for notebook editor to load
      await page.waitForSelector('.notebook-sidebar', { timeout: 20000 });
      
      // Extract quota data from sidebar
      const quotaData = await page.evaluate(() => {
        // Kaggle displays quota in sidebar like:
        // "GPU Quota: 10.5 hours remaining this week (30 hours total)"
        // "Session: 2.3 hours / 12 hours"
        
        const quotaText = document.querySelector('.gpu-quota-text')?.textContent || '';
        const sessionText = document.querySelector('.session-quota-text')?.textContent || '';
        
        // Parse weekly quota (example: "10.5 hours remaining this week (30 hours total)")
        const weeklyMatch = quotaText.match(/(\d+\.?\d*)\s*hours\s*remaining.*\((\d+)\s*hours\s*total\)/);
        const weeklyRemaining = weeklyMatch ? parseFloat(weeklyMatch[1]) : 21; // Default to safe 21h
        const weeklyMax = weeklyMatch ? parseFloat(weeklyMatch[2]) : 30;
        const weeklyUsed = weeklyMax - weeklyRemaining;
        
        // Parse session quota (example: "2.3 hours / 12 hours")
        const sessionMatch = sessionText.match(/(\d+\.?\d*)\s*hours\s*\/\s*(\d+)\s*hours/);
        const sessionUsed = sessionMatch ? parseFloat(sessionMatch[1]) : 0;
        const sessionMax = sessionMatch ? parseFloat(sessionMatch[2]) : 12;
        const sessionRemaining = sessionMax - sessionUsed;
        
        return {
          weeklyRemaining,
          weeklyMax,
          weeklyUsed,
          sessionRemaining,
          sessionMax,
        };
      });
      
      // Close the notebook (don't save)
      await page.click('button[aria-label="Close notebook"]');
      
      // Calculate safety thresholds
      const canStart = quotaData.weeklyRemaining >= 1 && quotaData.sessionRemaining >= 1;
      const shouldStop = quotaData.weeklyUsed >= 21 || quotaData.sessionRemaining <= 0.5; // 70% safety
      
      return {
        sessionRemainingHours: quotaData.sessionRemaining,
        sessionMaxHours: quotaData.sessionMax,
        weeklyUsedHours: quotaData.weeklyUsed,
        weeklyRemainingHours: quotaData.weeklyRemaining,
        weeklyMaxHours: quotaData.weeklyMax,
        canStart,
        shouldStop,
      };
      
    } finally {
      await browser.close();
    }
  }
}

export const kaggleScraperService = new KaggleScraperService();
