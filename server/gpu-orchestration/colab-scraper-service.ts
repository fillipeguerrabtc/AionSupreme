/**
 * COLAB SCRAPER SERVICE
 * ======================
 * 
 * Production-grade Puppeteer-based quota scraper for Google Colab.
 * Extracts REAL compute units data directly from Colab's notebook UI.
 * 
 * CRITICAL ANTI-BAN RULES:
 * - Session: 8.4h (70% × 12h) - NEVER exceed!
 * - Cooldown: 36h mandatory after each session
 * - SCHEDULE-BASED: Liga → 8.4h → Desliga → 36h rest
 * - ❌ NEVER on-demand! Always fixed schedule!
 * 
 * QUOTA LOCATION:
 * - Compute units shown in "Resources" menu
 * - Located in top-right of notebook editor
 * - Format: "X.XX compute units remaining"
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

export interface ColabQuotaData {
  computeUnitsUsed: number;
  computeUnitsTotal: number;
  computeUnitsRemaining: number;
  sessionRemainingMinutes: number | null; // null if no active session
  canStart: boolean;
  shouldStop: boolean;
  inCooldown: boolean;
  cooldownRemainingHours: number | null;
}

export class ColabScraperService {
  private readonly COLAB_URL = 'https://colab.research.google.com';
  private readonly USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  
  /**
   * Scrapes real quota data from Google Colab
   * 
   * FLOW:
   * 1. Launch headless browser with stealth
   * 2. Load cookies from session
   * 3. Navigate to Colab
   * 4. Open "Resources" menu
   * 5. Extract compute units
   * 6. Check cooldown status
   * 7. Close browser & return data
   */
  async scrapeQuota(cookies: Cookie[]): Promise<ColabQuotaData> {
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
      
      // Navigate to Colab
      await page.goto(this.COLAB_URL, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      
      // Check if logged in by looking for Google account profile
      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('[data-testid="google-account-chip"]');
      });
      
      if (!isLoggedIn) {
        throw new Error('Not logged in to Colab - cookies may be expired');
      }
      
      // Create new notebook to access Resources menu
      await page.click('button[aria-label="New notebook"]');
      
      // Wait for notebook editor to load
      await page.waitForSelector('.notebook-container', { timeout: 20000 });
      
      // Click "Resources" menu (top-right)
      await page.click('button[aria-label="Resources"]');
      
      // Wait for resources panel to appear
      await page.waitForSelector('.resources-panel', { timeout: 10000 });
      
      // Extract quota data from resources panel
      const quotaData = await page.evaluate(() => {
        // Colab displays quota like:
        // "Compute units: 15.2 / 100"
        // "Session runtime: 3 hours 25 minutes"
        // "Cooldown: 24 hours remaining" (if in cooldown)
        
        const computeText = document.querySelector('.compute-units-text')?.textContent || '';
        const sessionText = document.querySelector('.session-runtime-text')?.textContent || '';
        const cooldownText = document.querySelector('.cooldown-text')?.textContent || '';
        
        // Parse compute units (example: "15.2 / 100")
        const computeMatch = computeText.match(/(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)/);
        const computeUsed = computeMatch ? parseFloat(computeMatch[1]) : 0;
        const computeTotal = computeMatch ? parseFloat(computeMatch[2]) : 100;
        const computeRemaining = computeTotal - computeUsed;
        
        // Parse session runtime (example: "3 hours 25 minutes")
        const hoursMatch = sessionText.match(/(\d+)\s*hours?/);
        const minutesMatch = sessionText.match(/(\d+)\s*minutes?/);
        const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
        const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
        const sessionMinutes = hours * 60 + minutes;
        
        // Parse cooldown (example: "24 hours remaining")
        const cooldownMatch = cooldownText.match(/(\d+\.?\d*)\s*hours?\s*remaining/);
        const cooldownHours = cooldownMatch ? parseFloat(cooldownMatch[1]) : null;
        
        return {
          computeUsed,
          computeTotal,
          computeRemaining,
          sessionMinutes: sessionMinutes > 0 ? sessionMinutes : null,
          cooldownHours,
        };
      });
      
      // Close resources panel
      await page.click('button[aria-label="Close resources"]');
      
      // Close the notebook (don't save)
      await page.keyboard.press('Escape');
      
      // Calculate safety thresholds
      const inCooldown = quotaData.cooldownHours !== null && quotaData.cooldownHours > 0;
      const canStart = !inCooldown && quotaData.computeRemaining >= 10; // Need at least 10 units
      const shouldStop = quotaData.computeRemaining <= 5; // Stop if < 5 units remaining
      
      return {
        computeUnitsUsed: quotaData.computeUsed,
        computeUnitsTotal: quotaData.computeTotal,
        computeUnitsRemaining: quotaData.computeRemaining,
        sessionRemainingMinutes: quotaData.sessionMinutes,
        canStart,
        shouldStop,
        inCooldown,
        cooldownRemainingHours: quotaData.cooldownHours,
      };
      
    } finally {
      await browser.close();
    }
  }
}

export const colabScraperService = new ColabScraperService();
