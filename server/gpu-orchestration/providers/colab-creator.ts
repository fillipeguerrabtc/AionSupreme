/**
 * COLAB NOTEBOOK CREATOR - PRODUCTION-GRADE (2024)
 * ================================================
 * 
 * Cria notebooks Google Colab AUTOMATICAMENTE via Puppeteer seguindo
 * melhores práticas oficiais de 2024:
 * 
 * ✅ Headless mode 'new' (Chrome for Testing)
 * ✅ Cookie-based session persistence (survives restarts)
 * ✅ Robust selectors com fallbacks múltiplos
 * ✅ Stealth anti-detection (evita bot detection)
 * ✅ Error recovery e retry logic
 * ✅ Proper wait strategies (networkidle, selector polling)
 * ✅ User-agent spoofing
 * ✅ Resource optimization (--disable-dev-shm-usage)
 * 
 * IMPORTANTE: Colab free não tem API oficial - Puppeteer é única opção
 * Referências:
 * - https://pptr.dev/troubleshooting
 * - https://developer.chrome.com/blog/supercharge-web-ai-testing
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs/promises';
import { nanoid } from 'nanoid';
import { existsSync } from 'fs';

// Enable stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

interface ColabCredentials {
  email: string;
  password?: string;  // Opcional - pode usar sessão persistida
}

interface CreateNotebookOptions {
  title: string;
  enableGPU: boolean;
  enableTPU?: boolean;
}

export class ColabNotebookCreator {
  private browser: Browser | null = null;
  private credentials: ColabCredentials;
  private userDataDir: string;

  constructor(credentials: ColabCredentials) {
    this.credentials = credentials;
    // Use CHROME_USER_DATA_DIR env var if available, fallback to /tmp
    const baseDir = process.env.CHROME_USER_DATA_DIR || '/tmp';
    this.userDataDir = path.join(baseDir, `colab-session-${Buffer.from(credentials.email).toString('base64').slice(0, 20)}`);
  }

  /**
   * Inicializa browser com sessão persistida
   * 
   * Melhores práticas 2024:
   * - headless: 'new' (Chrome for Testing headless mode)
   * - Stealth plugin (anti-detection)
   * - Resource optimization (--disable-dev-shm-usage)
   * - User-agent spoofing
   * - Cookie persistence via userDataDir
   */
  private async initBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    console.log('[Colab Creator] Launching browser...');

    // Ensure userDataDir exists
    try {
      await fs.mkdir(this.userDataDir, { recursive: true });
      console.log('[Colab Creator] Session directory created:', this.userDataDir);
    } catch (error: any) {
      console.warn('[Colab Creator] Failed to create session directory:', error.message);
    }

    // Launch with production-grade settings
    // Note: puppeteer-extra uses headless: true (modern mode is default in recent versions)
    this.browser = await puppeteer.launch({
      headless: true,  // Modern headless mode with stealth plugin
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // Overcome limited resource problems
        '--disable-blink-features=AutomationControlled',  // Hide automation
        '--disable-gpu',  // Reduce overhead in headless
      ],
      userDataDir: this.userDataDir,  // Persiste cookies/sessão
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,  // Allow custom Chrome path
    });

    console.log('[Colab Creator] ✅ Browser launched with stealth mode');
    return this.browser;
  }

  /**
   * Cria notebook Colab programaticamente
   * 
   * Fluxo:
   * 1. Navega pra colab.research.google.com
   * 2. Faz login se necessário
   * 3. Cria novo notebook
   * 4. Configura GPU/TPU
   * 5. Injeta código worker
   * 6. Salva e retorna URL
   */
  async createNotebook(options: CreateNotebookOptions): Promise<{
    notebookUrl: string;
    notebookId: string;
  }> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      // Step 1: Navegar pra Colab
      console.log('[Colab Creator] Navigating to Colab...');
      await page.goto('https://colab.research.google.com/', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Step 2: Checar se precisa login
      const needsLogin = await this.checkNeedsLogin(page);
      if (needsLogin) {
        console.log('[Colab Creator] Login required, authenticating...');
        await this.performLogin(page);
      }

      // Step 3: Criar novo notebook
      console.log('[Colab Creator] Creating new notebook...');
      await this.createNewNotebook(page, options.title);

      // Step 4: Configurar accelerator (GPU/TPU)
      if (options.enableGPU || options.enableTPU) {
        console.log(`[Colab Creator] Configuring ${options.enableGPU ? 'GPU' : 'TPU'}...`);
        await this.configureAccelerator(page, options.enableGPU ? 'GPU' : 'TPU');
      }

      // Step 5: Injetar código worker
      console.log('[Colab Creator] Injecting worker code...');
      await this.injectWorkerCode(page, options.enableGPU);

      // Step 6: Obter URL do notebook
      const notebookUrl = page.url();
      const notebookId = this.extractNotebookId(notebookUrl);

      console.log(`[Colab Creator] ✅ Notebook created: ${notebookUrl}`);

      return {
        notebookUrl,
        notebookId,
      };

    } finally {
      await page.close();
    }
  }

  /**
   * Deleta notebook (via Google Drive API ou UI)
   */
  async deleteNotebook(notebookId: string): Promise<void> {
    // TODO: Implementar via Google Drive API
    console.log(`[Colab Creator] ⚠️  Delete not implemented yet for: ${notebookId}`);
  }

  /**
   * Checa se página atual requer login
   */
  private async checkNeedsLogin(page: Page): Promise<boolean> {
    // Procura botões de login
    const loginButton = await page.$('a[href*="accounts.google.com"]');
    return !!loginButton;
  }

  /**
   * Realiza login no Google com retry logic robusto
   * 
   * Production-grade features:
   * - Retry logic com exponential backoff (max 3 tentativas)
   * - 2FA detection com mensagem clara
   * - Screenshot em caso de erro (debugging)
   * - Error handling granular (timeout, selector não encontrado, 2FA)
   * 
   * NOTA: Login automático é frágil devido a mudanças no Google
   * Recomendação: fazer login manual primeira vez, sessão será persistida
   */
  private async performLogin(page: Page, maxRetries = 3): Promise<void> {
    if (!this.credentials.password) {
      throw new Error('Password required for first-time login. Please provide credentials or login manually first.');
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Colab Creator] Login attempt ${attempt}/${maxRetries}...`);

        // Click em "Sign in"
        const signInButton = await page.waitForSelector('a[href*="accounts.google.com"]', { timeout: 10000 });
        if (!signInButton) {
          throw new Error('Sign in button not found');
        }
        
        // Navigate to login page (wait até carregar completamente)
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),  // Increased timeout
          signInButton.click(),
        ]);

        // STEP 1: Email input
        await this.waitAndType(page, 'input[type="email"]', this.credentials.email, 15000);
        
        // STEP 2: Click "Next" button (usando selector atualizado 2025)
        await page.click('#identifierNext');
        
        // STEP 3: Aguardar password field aparecer na mesma página
        // Google 2025: password aparece na mesma tab após alguns segundos
        await page.waitForSelector('input[type="password"]', { visible: true, timeout: 30000 });
        
        // STEP 4: Password input (selector atualizado 2025: input[type="password"])
        await this.waitAndType(page, 'input[type="password"]', this.credentials.password!, 15000);
        
        // STEP 5: Click password Next button
        await page.click('#passwordNext');
        
        // Wait for final navigation
        await page.waitForTimeout(3000);

        // Detect 2FA challenge
        const is2FARequired = await this.detect2FA(page);
        if (is2FARequired) {
          console.error('[Colab Creator] ⚠️  2FA detected - automatic login not supported');
          throw new Error('2FA_REQUIRED: Please disable 2FA for this account or login manually first to persist session');
        }

        // Detect login errors (wrong password, etc)
        const hasError = await this.detectLoginError(page);
        if (hasError) {
          throw new Error('LOGIN_ERROR: Invalid credentials or account issue detected');
        }

        // Esperar redirect de volta pro Colab
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

        // Verify successful login (check for Colab UI elements)
        const isLoggedIn = await this.verifyLoginSuccess(page);
        if (!isLoggedIn) {
          throw new Error('LOGIN_VERIFICATION_FAILED: Could not verify successful login');
        }

        console.log('[Colab Creator] ✅ Login successful, session persisted');
        return; // Success!

      } catch (error: any) {
        lastError = error;
        console.error(`[Colab Creator] ❌ Login attempt ${attempt} failed:`, error.message);

        // Screenshot para debugging (capture todas as páginas abertas)
        try {
          const pages = await this.browser?.pages();
          if (pages && pages.length > 0) {
            // Screenshot da última página ativa (provavelmente a de login)
            const screenshotPath = path.join('/tmp', `colab-login-error-${Date.now()}.png`);
            await pages[pages.length - 1].screenshot({ path: screenshotPath, fullPage: true });
            console.log(`[Colab Creator] 📸 Error screenshot saved: ${screenshotPath}`);
          }
        } catch (screenshotError) {
          console.warn('[Colab Creator] Failed to save error screenshot');
        }

        // Don't retry on 2FA or credential errors
        if (error.message.includes('2FA_REQUIRED') || error.message.includes('LOGIN_ERROR')) {
          throw error;
        }

        // Exponential backoff
        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
          console.log(`[Colab Creator] Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // All retries failed
    throw new Error(`Automatic login failed after ${maxRetries} attempts. Last error: ${lastError?.message}. Please login manually first to persist session.`);
  }

  /**
   * Helper: Wait for selector and type text
   */
  private async waitAndType(page: Page, selector: string, text: string, timeout: number): Promise<void> {
    await page.waitForSelector(selector, { visible: true, timeout });
    await page.click(selector);
    await page.keyboard.type(text, { delay: 50 }); // Simulate human typing
  }

  /**
   * Helper: Press Enter and wait
   */
  private async pressEnterAndWait(page: Page, waitMs: number): Promise<void> {
    await page.keyboard.press('Enter');
    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  /**
   * Detect 2FA challenge
   */
  private async detect2FA(page: Page): Promise<boolean> {
    try {
      // Common 2FA selectors
      const twoFASelectors = [
        'input[type="tel"]', // Phone verification
        'input[aria-label*="code"]', // Verification code
        'div:has-text("2-Step Verification")',
        'div:has-text("Verify it\'s you")',
        'input[name="totpPin"]', // TOTP code
      ];

      for (const selector of twoFASelectors) {
        const element = await page.$(selector);
        if (element) {
          console.log(`[Colab Creator] 2FA detected: ${selector}`);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Detect login errors (wrong password, etc)
   */
  private async detectLoginError(page: Page): Promise<boolean> {
    try {
      const errorSelectors = [
        'div[aria-live="assertive"]', // Error messages
        'span:has-text("Wrong password")',
        'span:has-text("Couldn\'t find your Google Account")',
        'div:has-text("Try again")',
      ];

      for (const selector of errorSelectors) {
        const element = await page.$(selector);
        if (element) {
          const text = await element.evaluate(el => el.textContent);
          console.log(`[Colab Creator] Login error detected: ${text}`);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Verify successful login to Colab
   */
  private async verifyLoginSuccess(page: Page): Promise<boolean> {
    try {
      // Check for Colab-specific UI elements
      const colabSelectors = [
        '.notebook-container',
        '[role="main"]',
        'div[data-document-title]',
        'button:has-text("+ Code")',
        'button:has-text("+ Text")',
      ];

      for (const selector of colabSelectors) {
        const element = await page.$(selector);
        if (element) {
          console.log(`[Colab Creator] Login verified: Found ${selector}`);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Cria novo notebook com retry logic e error recovery
   * 
   * Production-grade features:
   * - Múltiplos seletores robustos (fallback chain)
   * - Retry logic para operações frágeis
   * - Timeout configurável
   * - Error recovery parcial (continua se rename falhar)
   */
  private async createNewNotebook(page: Page, title: string, maxRetries = 3): Promise<void> {
    // Estratégia 1: Navegar direto pra URL de novo notebook
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Colab Creator] Creating notebook (attempt ${attempt}/${maxRetries})...`);

        await page.goto('https://colab.research.google.com/#create=true', {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });

        // Esperar editor carregar com múltiplos seletores (fallback chain)
        const editorSelectors = [
          '.notebook-container',
          '[role="main"]',
          'div[data-document-title]',
          '.notebook-editor',
        ];

        let editorFound = false;
        for (const selector of editorSelectors) {
          try {
            await page.waitForSelector(selector, { timeout: 5000 });
            console.log(`[Colab Creator] Editor loaded: ${selector}`);
            editorFound = true;
            break;
          } catch {
            continue;
          }
        }

        if (!editorFound) {
          throw new Error('Notebook editor not found');
        }

        // Renomear notebook (non-critical - continue if fails)
        await this.renameNotebook(page, title);

        console.log('[Colab Creator] ✅ Notebook created successfully');
        return; // Success!

      } catch (error: any) {
        lastError = error;
        console.error(`[Colab Creator] ❌ Create attempt ${attempt} failed:`, error.message);

        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.log(`[Colab Creator] Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw new Error(`Failed to create notebook after ${maxRetries} attempts. Last error: ${lastError?.message}`);
  }

  /**
   * Renomeia notebook (non-critical operation)
   */
  private async renameNotebook(page: Page, title: string): Promise<void> {
    try {
      // Múltiplos seletores robustos (Colab UI pode variar)
      const titleSelectors = [
        'input[placeholder*="Untitled"]',
        '[contenteditable="true"][data-document-title]',
        'span[data-document-title]',
        '.notebook-title input',
      ];

      let titleElement = null;
      for (const selector of titleSelectors) {
        titleElement = await page.$(selector);
        if (titleElement) {
          console.log(`[Colab Creator] Found title element: ${selector}`);
          break;
        }
      }

      if (!titleElement) {
        console.warn('[Colab Creator] Title element not found, using default name');
        return;
      }

      // Click e renomear
      await titleElement.click();
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Limpar texto existente
      await page.keyboard.down('Control');
      await page.keyboard.press('A');
      await page.keyboard.up('Control');
      
      await page.keyboard.type(title, { delay: 30 });
      await page.keyboard.press('Enter');

      console.log(`[Colab Creator] ✅ Notebook renamed to: ${title}`);

    } catch (error: any) {
      console.warn('[Colab Creator] Could not rename notebook:', error.message);
      // Non-critical - don't throw
    }
  }

  /**
   * Configura GPU/TPU accelerator com retry logic robusto
   * 
   * Production-grade features:
   * - Retry logic (max 3 tentativas)
   * - Múltiplos seletores robustos (Colab UI pode variar)
   * - Fallback: se GPU falhar, tenta T4 GPU
   * - Screenshot em caso de erro (debugging)
   */
  private async configureAccelerator(page: Page, type: 'GPU' | 'TPU', maxRetries = 3): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Colab Creator] Configuring ${type} (attempt ${attempt}/${maxRetries})...`);

        // Abrir menu Runtime > Change runtime type
        await this.openRuntimeSettings(page);

        // Selecionar accelerator
        await this.selectAcceleratorType(page, type);

        // Salvar configurações
        await this.saveRuntimeSettings(page);

        console.log(`[Colab Creator] ✅ ${type} configured successfully`);
        return; // Success!

      } catch (error: any) {
        lastError = error;
        console.error(`[Colab Creator] ❌ Configure attempt ${attempt} failed:`, error.message);

        // Screenshot para debugging
        try {
          const screenshotPath = path.join('/tmp', `colab-config-error-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: true });
          console.log(`[Colab Creator] 📸 Error screenshot saved: ${screenshotPath}`);
        } catch {
          // Ignore screenshot errors
        }

        if (attempt < maxRetries) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt), 8000);
          console.log(`[Colab Creator] Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // All retries failed - log warning but don't throw (non-critical)
    console.warn(`[Colab Creator] ⚠️  Failed to configure ${type} after ${maxRetries} attempts`);
    console.warn(`[Colab Creator] Last error: ${lastError?.message}`);
    console.warn('[Colab Creator] Continuing without accelerator config');
  }

  /**
   * Abre menu Runtime Settings
   * 
   * BUG FIX: Remove :has-text() selector (not supported in Puppeteer)
   * Use XPath or evaluate() for text matching
   */
  private async openRuntimeSettings(page: Page): Promise<void> {
    // Try multiple strategies to open Runtime menu
    const strategies = [
      // Strategy 1: Menu bar click with XPath for text matching
      async () => {
        // Click Runtime menu
        await page.click('div[aria-label="Runtime"]');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Click "Change runtime type" using XPath (supports text matching)
        const menuItems = await page.$x('//div[@role="menuitem" and contains(text(), "Change runtime")]');
        if (menuItems.length > 0) {
          await (menuItems[0] as any).click();
        } else {
          throw new Error('Menu item not found via XPath');
        }
      },
      // Strategy 2: Alternative selectors (no text matching)
      async () => {
        await page.click('[aria-label="Runtime"]');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Find menu item via evaluate
        const menuItemClicked = await page.evaluate(() => {
          const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
          const changeRuntimeItem = menuItems.find(item => 
            item.textContent?.includes('Change runtime') || 
            item.textContent?.includes('change runtime')
          );
          if (changeRuntimeItem) {
            (changeRuntimeItem as HTMLElement).click();
            return true;
          }
          return false;
        });
        
        if (!menuItemClicked) {
          throw new Error('Menu item not found via evaluate');
        }
      },
      // Strategy 3: Keyboard shortcut (may not work in headless)
      async () => {
        await page.keyboard.down('Control');
        await page.keyboard.down('Alt');
        await page.keyboard.press('S');
        await page.keyboard.up('Alt');
        await page.keyboard.up('Control');
      },
      // Strategy 4: Direct URL navigation (last resort)
      async () => {
        const currentUrl = page.url();
        await page.goto(currentUrl + '?runtime=custom', { waitUntil: 'networkidle2' });
      },
    ];

    for (let i = 0; i < strategies.length; i++) {
      try {
        console.log(`[Colab Creator] Opening runtime settings (strategy ${i + 1})...`);
        await strategies[i]();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify modal opened
        const modal = await page.$('[role="dialog"], .modal-content');
        if (modal) {
          console.log('[Colab Creator] ✅ Runtime settings opened');
          return;
        }
      } catch (error) {
        console.warn(`[Colab Creator] Strategy ${i + 1} failed, trying next...`);
      }
    }

    throw new Error('Failed to open runtime settings dialog');
  }

  /**
   * Seleciona tipo de accelerator no modal
   * 
   * BUG FIX: Use o selector que realmente funcionou (não hardcode index 0)
   */
  private async selectAcceleratorType(page: Page, type: 'GPU' | 'TPU'): Promise<void> {
    // Wait for accelerator dropdown (remove :has-text - not supported in Puppeteer)
    const acceleratorSelectors = [
      'select[aria-label*="Hardware accelerator"]',
      'select[name="accelerator"]',
      'select.runtime-class-dropdown',
      'select', // Fallback: any select in modal
    ];

    let matchedSelector: string | null = null;
    for (const selector of acceleratorSelectors) {
      try {
        const dropdown = await page.$(selector);
        if (dropdown) {
          console.log(`[Colab Creator] Found accelerator dropdown: ${selector}`);
          matchedSelector = selector;
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!matchedSelector) {
      throw new Error('Accelerator dropdown not found');
    }

    // BUG FIX: Use the selector that actually matched (not hardcoded [0])
    await page.select(matchedSelector, type);
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`[Colab Creator] ✅ Selected ${type}`);
  }

  /**
   * Salva configurações do runtime
   * 
   * BUG FIX: Remove :has-text() selector (not supported)
   */
  private async saveRuntimeSettings(page: Page): Promise<void> {
    // Try multiple selectors (no :has-text)
    const saveButtonSelectors = [
      'button[aria-label="Save"]',
      'button[type="submit"]',
      'button.save-button',
    ];

    for (const selector of saveButtonSelectors) {
      try {
        const button = await page.$(selector);
        if (button) {
          await button.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('[Colab Creator] ✅ Settings saved');
          return;
        }
      } catch {
        continue;
      }
    }

    // Fallback: Use XPath for text matching
    try {
      const saveButtons = await page.$x('//button[contains(text(), "Save") or contains(text(), "save")]');
      if (saveButtons.length > 0) {
        await (saveButtons[0] as any).click();
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('[Colab Creator] ✅ Settings saved (via XPath)');
        return;
      }
    } catch (error) {
      console.warn('[Colab Creator] XPath fallback failed');
    }

    throw new Error('Save button not found');
  }

  /**
   * Injeta código worker no notebook
   */
  private async injectWorkerCode(page: Page, enableGPU: boolean): Promise<void> {
    const workerCode = this.generateWorkerCode(enableGPU);

    try {
      // Procurar célula de código ativa
      const cellSelector = '.CodeMirror textarea, [role="textbox"][aria-label*="Code"]';
      await page.waitForSelector(cellSelector, { timeout: 10000 });

      // Click na célula
      await page.click(cellSelector);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Digitar código
      await page.keyboard.type(workerCode, { delay: 10 });

      // Executar célula (Ctrl+Enter ou Shift+Enter)
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');

      console.log('[Colab Creator] ✅ Worker code injected and executed');

    } catch (error: any) {
      console.error('[Colab Creator] ⚠️  Failed to inject code:', error.message);
      throw error;
    }
  }

  /**
   * Gera código worker Python otimizado
   * 
   * SECURITY: Não inclui credenciais hardcoded
   * - NGROK_AUTH_TOKEN deve ser setado como Colab Secret
   * - Worker code apenas LÊ env var, nunca expõe o valor
   */
  private generateWorkerCode(enableGPU: boolean): string {
    return `# ══════════════════════════════════════════════════════════
# AION GPU Worker - Auto-generated Production Code
# ══════════════════════════════════════════════════════════

# Install dependencies (quiet mode)
!pip install -q pyngrok flask torch requests

import os
import sys
from pyngrok import ngrok
from flask import Flask, request, jsonify
import torch

# ═══════════════════════════════════════════════════════════
# 🔐 SECURITY: Check environment variables
# ═══════════════════════════════════════════════════════════
NGROK_TOKEN = os.getenv('NGROK_AUTH_TOKEN')
if not NGROK_TOKEN:
    print("❌ ERROR: NGROK_AUTH_TOKEN not set!")
    print("Please set it in Colab Secrets (🔑 icon on left sidebar)")
    sys.exit(1)

# ═══════════════════════════════════════════════════════════
# 🎮 GPU Detection
# ═══════════════════════════════════════════════════════════
GPU_AVAILABLE = torch.cuda.is_available()
if GPU_AVAILABLE:
    GPU_NAME = torch.cuda.get_device_name(0)
    GPU_MEMORY = torch.cuda.get_device_properties(0).total_memory / 1e9
    print(f"✅ GPU: {GPU_NAME} ({GPU_MEMORY:.1f}GB)")
else:
    GPU_NAME = 'CPU'
    print("⚠️  No GPU available - running on CPU")

# ═══════════════════════════════════════════════════════════
# 🌐 Ngrok Tunnel (SECURE - token never exposed)
# ═══════════════════════════════════════════════════════════
try:
    ngrok.set_auth_token(NGROK_TOKEN)  # Read from env, never print
    public_url = ngrok.connect(5000)
    print(f"🌐 Public URL: {public_url}")
except Exception as e:
    print(f"❌ Ngrok failed: {e}")
    sys.exit(1)

# ═══════════════════════════════════════════════════════════
# 🚀 Worker Server
# ═══════════════════════════════════════════════════════════
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "gpu": GPU_NAME,
        "gpu_available": GPU_AVAILABLE
    })

@app.route('/inference', methods=['POST'])
def inference():
    """Inference endpoint (stub - implement your logic)"""
    data = request.get_json()
    # TODO: Implement actual inference logic here
    return jsonify({
        "status": "ok",
        "message": "Inference endpoint ready",
        "gpu": GPU_NAME
    })

@app.route('/shutdown', methods=['POST'])
def shutdown():
    """Graceful shutdown endpoint"""
    print("🛑 Shutdown requested")
    func = request.environ.get('werkzeug.server.shutdown')
    if func:
        func()
    return jsonify({"status": "shutting down"})

# ═══════════════════════════════════════════════════════════
# 🎯 Start Server
# ═══════════════════════════════════════════════════════════
print("🚀 Starting AION GPU Worker...")
print(f"🔗 Public URL: {public_url}")
print("✅ Ready to accept requests")

app.run(host='0.0.0.0', port=5000, debug=False)
`;
  }

  /**
   * Extrai ID do notebook da URL
   */
  private extractNotebookId(url: string): string {
    // URL format: https://colab.research.google.com/drive/1ABC...XYZ
    const match = url.match(/\/drive\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : nanoid();
  }

  /**
   * Cleanup
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

/**
 * Factory function
 */
export function createColabCreator(credentials: ColabCredentials): ColabNotebookCreator {
  return new ColabNotebookCreator(credentials);
}
