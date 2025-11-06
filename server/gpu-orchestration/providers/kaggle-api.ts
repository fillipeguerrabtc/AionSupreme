/**
 * KAGGLE API INTEGRATION
 * ======================
 * 
 * Cria/deleta notebooks Kaggle PROGRAMATICAMENTE usando API oficial
 * 
 * Features:
 * - ✅ Create notebook via API (kernels push)
 * - ✅ Delete notebook
 * - ✅ Auto-inject worker code template
 * - ✅ Configure GPU/CPU accelerator
 * - ✅ Manage credentials securely
 * 
 * Docs: https://github.com/Kaggle/kaggle-api
 */

import axios, { AxiosInstance } from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { nanoid } from 'nanoid';

interface KaggleCredentials {
  username: string;
  key: string;
}

interface CreateNotebookOptions {
  title: string;
  enableGPU: boolean;
  enableInternet?: boolean;
  isPrivate?: boolean;
}

interface NotebookMetadata {
  id: string;
  title: string;
  code_file: string;
  language: 'python';
  kernel_type: 'notebook';
  is_private: boolean;
  enable_gpu: boolean;
  enable_tpu: boolean;
  enable_internet: boolean;
  dataset_sources: string[];
  competition_sources: string[];
  kernel_sources: string[];
}

export class KaggleAPI {
  private client: AxiosInstance;
  private credentials: KaggleCredentials;

  constructor(credentials: KaggleCredentials) {
    this.credentials = credentials;
    
    // Kaggle API usa HTTP Basic Auth
    this.client = axios.create({
      baseURL: 'https://www.kaggle.com/api/v1',
      auth: {
        username: credentials.username,
        password: credentials.key,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Cria notebook Kaggle programaticamente
   * 
   * Estratégia:
   * 1. Gera metadata JSON
   * 2. Injeta código worker (Python notebook)
   * 3. Usa Kaggle CLI via subprocess (Node não tem SDK oficial)
   * 4. Retorna URL do notebook criado
   */
  async createNotebook(options: CreateNotebookOptions): Promise<{ 
    notebookUrl: string; 
    slug: string;
    metadata: NotebookMetadata;
  }> {
    const slug = `aion-worker-${nanoid(8).toLowerCase()}`;
    const notebookId = `${this.credentials.username}/${slug}`;
    
    // Metadata do notebook
    const metadata: NotebookMetadata = {
      id: notebookId,
      title: options.title,
      code_file: 'notebook.ipynb',
      language: 'python',
      kernel_type: 'notebook',
      is_private: options.isPrivate ?? true,
      enable_gpu: options.enableGPU,
      enable_tpu: false,
      enable_internet: options.enableInternet ?? true,
      dataset_sources: [],
      competition_sources: [],
      kernel_sources: [],
    };

    // Template do notebook (formato .ipynb)
    const notebookContent = this.generateNotebookTemplate(options.enableGPU);

    // Criar diretório temporário
    const tmpDir = path.join('/tmp', `kaggle-notebook-${nanoid(6)}`);
    await fs.mkdir(tmpDir, { recursive: true });

    try {
      // Salvar metadata
      await fs.writeFile(
        path.join(tmpDir, 'kernel-metadata.json'),
        JSON.stringify(metadata, null, 2)
      );

      // Salvar notebook
      await fs.writeFile(
        path.join(tmpDir, 'notebook.ipynb'),
        JSON.stringify(notebookContent, null, 2)
      );

      // PUSH via Kaggle CLI (chamada subprocess)
      await this.executeKaggleCLI(['kernels', 'push', '-p', tmpDir]);

      const notebookUrl = `https://www.kaggle.com/code/${notebookId}`;

      console.log(`[Kaggle API] ✅ Notebook criado: ${notebookUrl}`);

      return {
        notebookUrl,
        slug,
        metadata,
      };

    } finally {
      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Deleta notebook Kaggle
   */
  async deleteNotebook(slug: string): Promise<void> {
    const notebookId = `${this.credentials.username}/${slug}`;
    
    // Kaggle API não tem DELETE endpoint público
    // Workaround: usar CLI
    await this.executeKaggleCLI(['kernels', 'delete', notebookId]);
    
    console.log(`[Kaggle API] ✅ Notebook deletado: ${notebookId}`);
  }

  /**
   * Lista notebooks do usuário
   */
  async listNotebooks(): Promise<any[]> {
    try {
      const response = await this.client.get('/kernels/list', {
        params: {
          user: this.credentials.username,
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('[Kaggle API] Erro ao listar notebooks:', error.message);
      return [];
    }
  }

  /**
   * Get notebook status
   */
  async getNotebookStatus(slug: string): Promise<any> {
    const notebookId = `${this.credentials.username}/${slug}`;
    
    try {
      const response = await this.client.get(`/kernels/status/${notebookId}`);
      return response.data;
    } catch (error: any) {
      console.error('[Kaggle API] Erro ao obter status:', error.message);
      return null;
    }
  }

  /**
   * Gera template de notebook com código worker AION
   */
  private generateNotebookTemplate(enableGPU: boolean): any {
    const workerCode = `# AION GPU Worker - Auto-generated
# ====================================

import os
import sys
import time
import requests
from pyngrok import ngrok

# ============================================================================
# CONFIGURATION
# ============================================================================

AION_BACKEND_URL = os.getenv('AION_BACKEND_URL', 'https://your-aion-instance.replit.app')
NGROK_AUTH_TOKEN = os.getenv('NGROK_AUTH_TOKEN', '')

# ============================================================================
# GPU DETECTION
# ============================================================================

try:
    import torch
    GPU_AVAILABLE = torch.cuda.is_available()
    GPU_NAME = torch.cuda.get_device_name(0) if GPU_AVAILABLE else 'CPU'
    print(f"✅ GPU Detected: {GPU_NAME}")
except:
    GPU_AVAILABLE = False
    GPU_NAME = 'CPU'
    print("⚠️  No GPU available, using CPU")

# ============================================================================
# NGROK TUNNEL
# ============================================================================

if NGROK_AUTH_TOKEN:
    ngrok.set_auth_token(NGROK_AUTH_TOKEN)
    
# Start Flask server (will serve on port 5000)
public_url = ngrok.connect(5000)
print(f"🌐 Public URL: {public_url}")

# ============================================================================
# AUTO-REGISTER WITH AION
# ============================================================================

try:
    response = requests.post(f"{AION_BACKEND_URL}/api/gpu/workers/auto-register", json={
        "ngrokUrl": str(public_url),
        "provider": "kaggle",
        "capabilities": {
            "gpu": GPU_NAME,
            "model": "pending",
            "tor_enabled": False,
        }
    })
    
    if response.ok:
        print("✅ Registered with AION backend")
    else:
        print(f"⚠️  Failed to register: {response.text}")
except Exception as e:
    print(f"❌ Registration error: {e}")

# ============================================================================
# WORKER SERVER
# ============================================================================

from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "gpu": GPU_NAME,
        "gpu_available": GPU_AVAILABLE,
    })

@app.route('/inference', methods=['POST'])
def inference():
    # TODO: Implementar inferência com modelo
    return jsonify({"result": "inference_result"})

@app.route('/train', methods=['POST'])
def train():
    # TODO: Implementar treinamento
    return jsonify({"status": "training_started"})

# ============================================================================
# START SERVER
# ============================================================================

print("🚀 Starting AION worker server...")
app.run(host='0.0.0.0', port=5000)
`;

    return {
      cells: [
        {
          cell_type: 'markdown',
          metadata: {},
          source: [
            '# AION GPU Worker\n',
            '\n',
            `Provider: **Kaggle ${enableGPU ? 'GPU' : 'CPU'}**\n`,
            '\n',
            'This notebook auto-connects to AION backend via ngrok.\n',
          ],
        },
        {
          cell_type: 'code',
          execution_count: null,
          metadata: {},
          outputs: [],
          source: workerCode.split('\n'),
        },
      ],
      metadata: {
        kernelspec: {
          display_name: 'Python 3',
          language: 'python',
          name: 'python3',
        },
        language_info: {
          name: 'python',
          version: '3.10.0',
        },
      },
      nbformat: 4,
      nbformat_minor: 4,
    };
  }

  /**
   * Executa Kaggle CLI via subprocess
   * 
   * Requer:
   * - `kaggle` package instalado: pip install kaggle
   * - Credentials em ~/.kaggle/kaggle.json
   */
  private async executeKaggleCLI(args: string[]): Promise<string> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Garantir que credentials estão configuradas
    await this.ensureCredentialsFile();

    const command = `kaggle ${args.join(' ')}`;
    
    try {
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stderr.includes('100%')) {
        console.warn(`[Kaggle CLI] Warning: ${stderr}`);
      }
      
      return stdout;
      
    } catch (error: any) {
      console.error(`[Kaggle CLI] Error executing: ${command}`);
      console.error(error.message);
      throw new Error(`Kaggle CLI failed: ${error.message}`);
    }
  }

  /**
   * Garante que ~/.kaggle/kaggle.json existe com as credentials
   */
  private async ensureCredentialsFile(): Promise<void> {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
    const kaggleDir = path.join(homeDir, '.kaggle');
    const credentialsPath = path.join(kaggleDir, 'kaggle.json');

    try {
      // Criar diretório se não existe
      await fs.mkdir(kaggleDir, { recursive: true });

      // Escrever credentials
      const credentials = {
        username: this.credentials.username,
        key: this.credentials.key,
      };

      await fs.writeFile(credentialsPath, JSON.stringify(credentials, null, 2));

      // Set permissions (Linux/Mac)
      try {
        await fs.chmod(credentialsPath, 0o600);
      } catch {
        // Windows não suporta chmod, ignorar
      }

    } catch (error: any) {
      console.error('[Kaggle API] Failed to write credentials file:', error.message);
      throw error;
    }
  }
}

/**
 * Factory function
 */
export function createKaggleAPI(credentials: KaggleCredentials): KaggleAPI {
  return new KaggleAPI(credentials);
}
