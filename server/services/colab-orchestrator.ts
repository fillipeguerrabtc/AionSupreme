/**
 * GOOGLE COLAB ORCHESTRATOR SERVICE
 * ==================================
 * 
 * Orquestra notebooks Google Colab via Puppeteer (sem API pública).
 * 
 * Features:
 * - Login automático no Google
 * - Criação/abertura de notebooks
 * - Execução de scripts AION GPU worker
 * - Monitoramento de sessão
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { logger } from './logger-service';
import { AppError } from '../errors/app-errors';

export interface ColabCredentials {
  email: string;
  password: string;
}

export interface ColabProvisionOptions {
  credentials: ColabCredentials;
  notebookUrl?: string; // Existing notebook URL (optional)
  workerScript?: string; // Custom worker script (optional)
}

export interface ColabProvisionResult {
  notebookUrl: string;
  sessionId: string;
  status: 'provisioning' | 'running' | 'failed';
  message: string;
}

export class ColabOrchestrator {
  private browser: Browser | null = null;

  /**
   * Initialize headless browser
   */
  private async initBrowser(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    logger.info('[ColabOrch] Iniciando navegador headless...');
    
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    return this.browser;
  }

  /**
   * Close browser instance
   */
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('[ColabOrch] Navegador fechado');
    }
  }

  /**
   * Login to Google Account
   */
  private async loginToGoogle(page: Page, credentials: ColabCredentials): Promise<void> {
    logger.info('[ColabOrch] Fazendo login no Google...');

    try {
      // Navigate to Google login
      await page.goto('https://accounts.google.com/signin', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Enter email
      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      await page.type('input[type="email"]', credentials.email, { delay: 100 });
      await page.click('#identifierNext');
      
      // Wait for password field
      await page.waitForSelector('input[type="password"]', { 
        visible: true, 
        timeout: 15000 
      });
      await page.type('input[type="password"]', credentials.password, { delay: 100 });
      await page.click('#passwordNext');

      // Wait for login to complete
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      logger.info('[ColabOrch] ✅ Login realizado com sucesso');
    } catch (error: any) {
      logger.error('[ColabOrch] Erro no login Google:', error);
      throw new AppError(`Falha no login Google: ${error.message}`, 'COLAB_LOGIN_FAILED');
    }
  }

  /**
   * Create new Colab notebook
   */
  private async createNotebook(page: Page): Promise<string> {
    logger.info('[ColabOrch] Criando novo notebook Colab...');

    try {
      // Navigate to Colab
      await page.goto('https://colab.research.google.com/notebooks/welcome.ipynb', {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Click "New Notebook"
      await page.waitForSelector('[aria-label="New notebook"]', { timeout: 15000 });
      await page.click('[aria-label="New notebook"]');

      // Wait for new notebook to load
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      const notebookUrl = page.url();
      logger.info(`[ColabOrch] ✅ Notebook criado: ${notebookUrl}`);

      return notebookUrl;
    } catch (error: any) {
      logger.error('[ColabOrch] Erro ao criar notebook:', error);
      throw new AppError(`Falha ao criar notebook: ${error.message}`, 'COLAB_CREATE_FAILED');
    }
  }

  /**
   * Execute AION GPU worker script in notebook
   */
  private async executeWorkerScript(page: Page, script?: string): Promise<void> {
    logger.info('[ColabOrch] Executando script AION GPU worker...');

    const defaultScript = `
!pip install -q flask ngrok pyngrok requests

# AION GPU Worker Auto-Registration
import os
import requests
from flask import Flask, request, jsonify
from pyngrok import ngrok

# Setup ngrok tunnel
ngrok_token = os.environ.get('NGROK_AUTH_TOKEN')
if ngrok_token:
    ngrok.set_auth_token(ngrok_token)

# Start Flask server
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'gpu': 'T4'}), 200

@app.route('/generate', methods=['POST'])
def generate():
    # GPU inference endpoint
    return jsonify({'result': 'generated'}), 200

# Start ngrok tunnel
public_url = ngrok.connect(5000)
print(f"🌐 Public URL: {public_url}")

# Auto-register with AION
registration_url = os.environ.get('AION_REGISTRATION_URL', 'https://your-aion-url.replit.dev/api/gpu/register')
requests.post(registration_url, json={
    'provider': 'colab',
    'ngrokUrl': str(public_url),
    'capabilities': {
        'gpu': 'T4',
        'model': 'gemma-2b',
        'vram_gb': 15
    }
})

# Start server
app.run(port=5000)
`;

    const scriptToExecute = script || defaultScript;

    try {
      // Click on first code cell
      await page.waitForSelector('.code-cell', { timeout: 15000 });
      await page.click('.code-cell');

      // Type script into cell
      await page.keyboard.type(scriptToExecute, { delay: 10 });

      // Execute cell (Ctrl+Enter or click Run)
      await page.keyboard.down('Control');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');

      logger.info('[ColabOrch] ✅ Script executado no notebook');
    } catch (error: any) {
      logger.error('[ColabOrch] Erro ao executar script:', error);
      throw new AppError(`Falha ao executar script: ${error.message}`, 'COLAB_EXECUTE_FAILED');
    }
  }

  /**
   * Provision new Colab GPU worker
   */
  async provision(options: ColabProvisionOptions): Promise<ColabProvisionResult> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Login to Google
      await this.loginToGoogle(page, options.credentials);

      // Create or open notebook
      let notebookUrl: string;
      if (options.notebookUrl) {
        logger.info(`[ColabOrch] Abrindo notebook existente: ${options.notebookUrl}`);
        await page.goto(options.notebookUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        notebookUrl = options.notebookUrl;
      } else {
        notebookUrl = await this.createNotebook(page);
      }

      // Execute worker script
      await this.executeWorkerScript(page, options.workerScript);

      // Generate session ID
      const sessionId = `colab-${Date.now()}`;

      logger.info(`[ColabOrch] ✅ Provisionamento concluído: ${notebookUrl}`);

      return {
        notebookUrl,
        sessionId,
        status: 'running',
        message: 'Colab GPU worker provisionado com sucesso',
      };
    } catch (error: any) {
      logger.error('[ColabOrch] Erro no provisionamento:', error);
      
      return {
        notebookUrl: '',
        sessionId: '',
        status: 'failed',
        message: error.message || 'Falha no provisionamento Colab',
      };
    } finally {
      // Keep page open to maintain session
      // await page.close(); // Commented: keep alive for GPU session
    }
  }
}

// Singleton instance
export const colabOrchestrator = new ColabOrchestrator();
