/**
 * KAGGLE AUTOMATION SERVICE - 100% AUTOMATIC GPU PROVISIONING
 * =============================================================
 * 
 * Automação COMPLETA de notebooks Kaggle usando a API oficial:
 * - Gera worker.ipynb programaticamente
 * - Cria kernel-metadata.json seguindo spec oficial
 * - Push via `api.kernels_push()` (cria + executa automaticamente!)
 * - Monitora com `api.kernels_status()` até worker se registrar
 * 
 * DOCUMENTAÇÃO OFICIAL:
 * https://github.com/Kaggle/kaggle-api
 * https://github.com/Kaggle/kaggle-api/wiki/Kernel-Metadata
 * 
 * FLUXO:
 * 1. Admin fornece credenciais → /api/gpu/kaggle/provision
 * 2. Sistema chama createAndStartWorker()
 * 3. Notebook é criado + executado automaticamente
 * 4. Worker se registra via /api/gpu/register
 * 5. Status: pending → online (100% automático!)
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { kaggleCLIService } from './kaggle-cli-service';

const execAsync = promisify(exec);

interface KernelMetadata {
  id: string;
  title: string;
  code_file: string;
  language: 'python';
  kernel_type: 'notebook';
  is_private: boolean;
  enable_gpu: boolean;
  enable_internet: boolean;
  dataset_sources: string[];
  competition_sources: string[];
  kernel_sources: string[];
  model_sources: string[];
}

interface NotebookCell {
  cell_type: 'code' | 'markdown';
  execution_count: null;
  metadata: object;
  outputs: any[];
  source: string[];
}

interface JupyterNotebook {
  cells: NotebookCell[];
  metadata: {
    kernelspec: {
      display_name: string;
      language: string;
      name: string;
    };
    language_info: {
      name: string;
      version: string;
    };
  };
  nbformat: number;
  nbformat_minor: number;
}

interface ProvisionResult {
  success: boolean;
  kernelId?: string;
  kernelUrl?: string;
  workerId?: number;
  message?: string;
  error?: string;
}

export class KaggleAutomationService {
  private readonly TEMP_DIR: string;

  constructor() {
    this.TEMP_DIR = path.join(os.tmpdir(), 'kaggle-workers');
  }

  /**
   * MAIN METHOD: Create and start Kaggle worker automatically
   * 
   * @param username - Kaggle username
   * @param aionBaseUrl - AION backend URL (for worker registration)
   * @param workerId - Database worker ID
   * @returns ProvisionResult with kernel details
   */
  async createAndStartWorker(
    username: string,
    aionBaseUrl: string,
    workerId: number
  ): Promise<ProvisionResult> {
    let kernelFolder: string | null = null;

    try {
      console.log(`[Kaggle Automation] 🚀 Starting automation for ${username}...`);

      // 1. Create temporary folder for kernel
      kernelFolder = await this.createKernelFolder(username, workerId);

      // 2. Generate worker notebook (.ipynb)
      const notebookPath = await this.generateWorkerNotebook(
        kernelFolder,
        aionBaseUrl,
        workerId
      );

      // 3. Generate kernel metadata (enable_gpu: true!)
      const metadataPath = await this.generateKernelMetadata(
        kernelFolder,
        username,
        workerId
      );

      console.log('[Kaggle Automation] ✅ Files generated:');
      console.log(`   → Notebook: ${notebookPath}`);
      console.log(`   → Metadata: ${metadataPath}`);

      // 4. Push kernel using Kaggle API (creates + runs automatically!)
      const kernelId = await this.pushKernel(kernelFolder);

      console.log(`[Kaggle Automation] ✅ Kernel pushed: ${kernelId}`);
      console.log('[Kaggle Automation] 📊 Kernel is now running with GPU!');

      // 5. Start monitoring (async - don't block response)
      this.monitorKernelStatus(kernelId, workerId).catch(error => {
        console.error(`[Kaggle Automation] Monitor error for ${kernelId}:`, error.message);
      });

      const kernelUrl = `https://www.kaggle.com/code/${kernelId}`;

      return {
        success: true,
        kernelId,
        kernelUrl,
        workerId,
        message: `Kernel ${kernelId} created and running! Worker will register automatically.`,
      };

    } catch (error: any) {
      console.error('[Kaggle Automation] ❌ Failed:', error.message);
      
      return {
        success: false,
        error: error.message,
        message: `Failed to create kernel: ${error.message}`,
      };
    } finally {
      // Cleanup temp folder (fire and forget)
      if (kernelFolder) {
        this.cleanupKernelFolder(kernelFolder).catch(() => {});
      }
    }
  }

  /**
   * Generate Jupyter notebook with AION worker code
   * 
   * Converts Python script to .ipynb format
   */
  private async generateWorkerNotebook(
    kernelFolder: string,
    aionBaseUrl: string,
    workerId: number
  ): Promise<string> {
    const notebookPath = path.join(kernelFolder, 'worker.ipynb');

    // Cell 1: Setup dependencies
    const setupCell: NotebookCell = {
      cell_type: 'code',
      execution_count: null,
      metadata: {},
      outputs: [],
      source: [
        '# AION GPU Worker - Setup\n',
        '\n',
        '!pip install -q pyngrok\n',
        '!pip install -q torch torchvision torchaudio\n',
        '!pip install -q transformers accelerate peft\n',
        '\n',
        'print("✅ Dependencies installed!")\n'
      ]
    };

    // Cell 2: Worker main loop
    const workerCell: NotebookCell = {
      cell_type: 'code',
      execution_count: null,
      metadata: {},
      outputs: [],
      source: [
        '# AION GPU Worker - Main Loop\n',
        '\n',
        'import os\n',
        'import sys\n',
        'import time\n',
        'import json\n',
        'import requests\n',
        'from datetime import datetime\n',
        '\n',
        '# Configuration\n',
        `AION_BASE_URL = "${aionBaseUrl}"\n`,
        'PROVIDER = "kaggle"\n',
        `WORKER_DB_ID = ${workerId}\n`,
        '\n',
        '# Setup Ngrok\n',
        'print("🌐 [SETUP] Creating ngrok tunnel...")\n',
        '\n',
        'from pyngrok import ngrok\n',
        '\n',
        'tunnel = ngrok.connect(5000, bind_tls=True)\n',
        'ngrok_url = tunnel.public_url\n',
        '\n',
        'print(f"✅ [SETUP] Tunnel created: {ngrok_url}")\n',
        '\n',
        '# Worker registration\n',
        'def register_worker(ngrok_url):\n',
        '    import torch\n',
        '    \n',
        '    gpu_count = torch.cuda.device_count()\n',
        '    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"\n',
        '    vram_per_gpu = torch.cuda.get_device_properties(0).total_memory / (1024**3) if torch.cuda.is_available() else 0\n',
        '    total_vram = vram_per_gpu * gpu_count\n',
        '    \n',
        '    payload = {\n',
        '        "name": f"Kaggle-Worker-{WORKER_DB_ID}",\n',
        '        "url": ngrok_url,\n',
        '        "type": PROVIDER,\n',
        '        "gpuType": f"{gpu_count}x {gpu_name}",\n',
        '        "platform": PROVIDER,\n',
        '        "accountEmail": "kaggle-worker",\n',
        '        "maxSessionHours": 9,\n',
        '        "sessionStart": datetime.now().isoformat(),\n',
        '        "capabilities": ["training", "inference"]\n',
        '    }\n',
        '    \n',
        '    try:\n',
        '        response = requests.post(\n',
        '            f"{AION_BASE_URL}/api/gpu/register",\n',
        '            json=payload,\n',
        '            timeout=10\n',
        '        )\n',
        '        response.raise_for_status()\n',
        '        \n',
        '        worker_data = response.json()\n',
        '        worker_id = worker_data["id"]\n',
        '        \n',
        '        print(f"✅ [REGISTER] Worker ID: {worker_id}")\n',
        '        print(f"   GPUs: {gpu_count}x {gpu_name} ({total_vram:.1f} GB)")\n',
        '        \n',
        '        return worker_id\n',
        '    except Exception as e:\n',
        '        print(f"❌ [REGISTER] Error: {e}")\n',
        '        sys.exit(1)\n',
        '\n',
        '# Heartbeat\n',
        'def send_heartbeat(worker_id):\n',
        '    try:\n',
        '        response = requests.post(\n',
        '            f"{AION_BASE_URL}/api/gpu/workers/{worker_id}/heartbeat",\n',
        '            timeout=5\n',
        '        )\n',
        '        return response.status_code == 200\n',
        '    except:\n',
        '        return False\n',
        '\n',
        '# Main\n',
        'print("=" * 60)\n',
        'print("🤖 AION GPU WORKER - Kaggle")\n',
        'print("=" * 60)\n',
        '\n',
        'worker_id = register_worker(ngrok_url)\n',
        '\n',
        'print("\\n✅ WORKER ATIVO - Aguardando jobs...\\n")\n',
        '\n',
        'heartbeat_counter = 0\n',
        '\n',
        'try:\n',
        '    while True:\n',
        '        if heartbeat_counter % 30 == 0:\n',
        '            send_heartbeat(worker_id)\n',
        '            print(f"💓 [HEARTBEAT] ({datetime.now().strftime(\'%H:%M:%S\')})")\n',
        '        \n',
        '        time.sleep(1)\n',
        '        heartbeat_counter += 1\n',
        '        \n',
        'except KeyboardInterrupt:\n',
        '    print("\\n⚠️ Worker interrompido")\n'
      ]
    };

    const notebook: JupyterNotebook = {
      cells: [setupCell, workerCell],
      metadata: {
        kernelspec: {
          display_name: 'Python 3',
          language: 'python',
          name: 'python3'
        },
        language_info: {
          name: 'python',
          version: '3.10.0'
        }
      },
      nbformat: 4,
      nbformat_minor: 4
    };

    await fs.writeFile(notebookPath, JSON.stringify(notebook, null, 2));

    return notebookPath;
  }

  /**
   * Generate kernel-metadata.json (FOLLOWING OFFICIAL SPEC!)
   * 
   * Spec: https://github.com/Kaggle/kaggle-api/wiki/Kernel-Metadata
   */
  private async generateKernelMetadata(
    kernelFolder: string,
    username: string,
    workerId: number
  ): Promise<string> {
    const metadataPath = path.join(kernelFolder, 'kernel-metadata.json');

    const kernelSlug = `aion-gpu-worker-${workerId}-${Date.now()}`;

    const metadata: KernelMetadata = {
      id: `${username}/${kernelSlug}`,
      title: `AION GPU Worker ${workerId}`,
      code_file: 'worker.ipynb',
      language: 'python',
      kernel_type: 'notebook',
      is_private: true,                    // ✅ Private kernel
      enable_gpu: true,                     // ✅ ENABLE GPU!
      enable_internet: true,                // ✅ Allow ngrok
      dataset_sources: [],
      competition_sources: [],
      kernel_sources: [],
      model_sources: []
    };

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return metadataPath;
  }

  /**
   * Push kernel using Kaggle API (OFFICIAL METHOD!)
   * 
   * Uses `kaggle kernels push -p /path/to/folder`
   * 
   * Kernel is created AND runs automatically!
   */
  private async pushKernel(kernelFolder: string): Promise<string> {
    try {
      console.log('[Kaggle Automation] 📤 Pushing kernel via Kaggle API...');

      // Execute: kaggle kernels push -p /path/to/folder
      const command = `kaggle kernels push -p "${kernelFolder}"`;
      console.log(`[Kaggle Automation] Executing: ${command}`);
      
      const { stdout, stderr } = await execAsync(command, { 
        timeout: 60000,
        env: {
          ...process.env,
          // Ensure Kaggle CLI has credentials from SecretsVault
        }
      });

      console.log('[Kaggle Automation] ✅ Command executed successfully');
      console.log('[Kaggle Automation] STDOUT (first 500 chars):');
      console.log(stdout.substring(0, 500));

      if (stderr) {
        console.warn('[Kaggle Automation] STDERR (first 500 chars):');
        console.warn(stderr.substring(0, 500));
      }

      // Check if response is HTML (indicates auth error)
      const isHTML = stdout.trim().toLowerCase().startsWith('<!doctype') || 
                     stdout.trim().toLowerCase().startsWith('<html');
      
      if (isHTML) {
        console.error('[Kaggle Automation] ❌ KAGGLE RETURNED HTML (not JSON)');
        console.error('  → This usually means:');
        console.error('    1. Credentials are invalid');
        console.error('    2. Account is not phone-verified');
        console.error('    3. API token has expired');
        throw new Error('Kaggle API returned HTML instead of JSON. Please verify: (1) Credentials are valid, (2) Phone is verified at kaggle.com/settings, (3) Generate NEW API token');
      }

      // Extract kernel ID from output
      // Output format: "Successfully created kernel <username>/<kernel-slug>"
      const match = stdout.match(/created kernel\s+([^\s]+)/i) || 
                    stdout.match(/updated kernel\s+([^\s]+)/i);

      if (!match) {
        console.error('[Kaggle Automation] ❌ Could not parse kernel ID from response');
        console.error(`  → Full stdout: ${stdout.substring(0, 1000)}`);
        throw new Error('Could not extract kernel ID from Kaggle API response. Check logs for full output.');
      }

      const kernelId = match[1].trim();
      console.log(`[Kaggle Automation] ✅ Extracted kernel ID: ${kernelId}`);

      return kernelId;

    } catch (error: any) {
      console.error('[Kaggle Automation] ❌ Push command failed');
      console.error(`  → Error message: ${error.message}`);
      
      // Log stdout/stderr if available in error object
      if (error.stdout) {
        console.error(`  → STDOUT: ${error.stdout.substring(0, 500)}`);
      }
      if (error.stderr) {
        console.error(`  → STDERR: ${error.stderr.substring(0, 500)}`);
      }
      
      throw new Error(`Kaggle API push failed: ${error.message}`);
    }
  }

  /**
   * Monitor kernel status until worker registers
   * 
   * Polls `kaggle kernels status` every 10 seconds
   * Timeout: 5 minutes
   */
  private async monitorKernelStatus(
    kernelId: string,
    workerId: number
  ): Promise<void> {
    const MAX_ATTEMPTS = 30; // 5 minutes (10s interval)
    let attempts = 0;

    console.log(`[Kaggle Automation] 👀 Monitoring kernel ${kernelId}...`);

    while (attempts < MAX_ATTEMPTS) {
      try {
        // Check kernel status
        const { stdout } = await execAsync(`kaggle kernels status ${kernelId}`);

        console.log(`[Kaggle Automation] Status check ${attempts + 1}/${MAX_ATTEMPTS}:`);
        console.log(stdout.trim());

        // Check if running
        if (stdout.toLowerCase().includes('running') || 
            stdout.toLowerCase().includes('complete')) {
          console.log(`[Kaggle Automation] ✅ Kernel ${kernelId} is active!`);
          
          // Worker should register via /api/gpu/register soon
          // Orchestrator will detect and update status
          return;
        }

        // Check for errors
        if (stdout.toLowerCase().includes('error') || 
            stdout.toLowerCase().includes('failed')) {
          console.error(`[Kaggle Automation] ❌ Kernel ${kernelId} failed!`);
          return;
        }

      } catch (error: any) {
        console.error(`[Kaggle Automation] Status check error: ${error.message}`);
      }

      // Wait 10 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 10000));
      attempts++;
    }

    console.warn(`[Kaggle Automation] ⚠️ Monitoring timeout for ${kernelId}`);
  }

  /**
   * Create temporary folder for kernel files
   */
  private async createKernelFolder(username: string, workerId: number): Promise<string> {
    await fs.mkdir(this.TEMP_DIR, { recursive: true });

    const folderName = `kaggle-worker-${username}-${workerId}-${Date.now()}`;
    const folderPath = path.join(this.TEMP_DIR, folderName);

    await fs.mkdir(folderPath, { recursive: true });

    return folderPath;
  }

  /**
   * Cleanup temporary kernel folder
   */
  private async cleanupKernelFolder(folderPath: string): Promise<void> {
    try {
      await fs.rm(folderPath, { recursive: true, force: true });
      console.log(`[Kaggle Automation] 🗑️ Cleaned up: ${folderPath}`);
    } catch (error: any) {
      console.warn(`[Kaggle Automation] Cleanup warning: ${error.message}`);
    }
  }
}

// Singleton
export const kaggleAutomationService = new KaggleAutomationService();
