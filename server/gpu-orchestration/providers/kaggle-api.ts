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
except ImportError:
    torch = None
    GPU_AVAILABLE = False
    GPU_NAME = 'CPU'
    print("⚠️  torch not installed - CPU-only mode")

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

# Global state
model = None
tokenizer = None
current_job = None
WORKER_ID = None  # Will be set after registration

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "gpu": GPU_NAME,
        "gpu_available": GPU_AVAILABLE,
    })

@app.route('/inference', methods=['POST'])
def inference():
    """
    OpenAI-compatible chat completion endpoint
    POST /inference
    Body: { "messages": [...], "max_tokens": 512, "temperature": 0.7, "top_p": 0.9 }
    """
    global model, tokenizer
    
    try:
        # Check if torch is available
        if torch is None:
            return jsonify({
                "error": "Torch not available - GPU runtime required for inference"
            }), 503
        
        # Lazy load model if not initialized
        if model is None or tokenizer is None:
            print("[Inference] Loading base model...")
            from transformers import AutoModelForCausalLM, AutoTokenizer
            
            model_name = "meta-llama/Llama-3.2-1B"
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = AutoModelForCausalLM.from_pretrained(
                model_name,
                device_map="auto",
                torch_dtype="auto"
            )
            tokenizer.pad_token = tokenizer.eos_token
            print("[Inference] ✅ Model loaded")
        
        data = request.json
        messages = data.get('messages', [])
        max_tokens = data.get('max_tokens', 512)
        temperature = data.get('temperature', 0.7)
        top_p = data.get('top_p', 0.9)
        
        print(f"[Inference] 📝 Processing {len(messages)} messages...")
        
        # Format messages in Alpaca template
        conversation = ""
        for msg in messages:
            role = msg.get('role')
            content = msg.get('content')
            if role == "system":
                conversation += f"### System:\\n{content}\\n\\n"
            elif role == "user":
                conversation += f"### Instruction:\\n{content}\\n\\n"
            elif role == "assistant":
                conversation += f"### Response:\\n{content}\\n\\n"
        
        conversation += "### Response:\\n"
        
        # Tokenize
        inputs = tokenizer(conversation, return_tensors="pt").to(model.device)
        
        # Generate
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=True,
                pad_token_id=tokenizer.eos_token_id,
            )
        
        # Decode
        full_response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        response = full_response.split("### Response:")[-1].strip()
        
        # Estimate tokens
        prompt_tokens = len(inputs['input_ids'][0])
        completion_tokens = len(outputs[0]) - prompt_tokens
        
        print(f"[Inference] ✅ Generated {completion_tokens} tokens")
        
        return jsonify({
            "choices": [{
                "message": {"role": "assistant", "content": response},
                "finish_reason": "stop",
                "index": 0
            }],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens
            },
            "model": "aion-llama3-lora"
        })
    except Exception as e:
        print(f"[Inference] ❌ Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/train', methods=['POST'])
def train():
    """
    LoRA training endpoint
    POST /train
    Body: {
      "jobId": 123,
      "dataset": "https://backend/api/datasets/123.json",
      "lora": { "r": 16, "alpha": 32, "dropout": 0.05 },
      "training": { "epochs": 1, "batchSize": 2, "learningRate": 2e-4 }
    }
    """
    global model, tokenizer, current_job
    
    try:
        # Check if torch is available
        if torch is None:
            return jsonify({
                "error": "Torch not available - GPU runtime required for training"
            }), 503
        
        data = request.json
        job_id = data.get('jobId')
        dataset_url = data.get('dataset')
        lora_config = data.get('lora', {})
        training_args = data.get('training', {})
        
        current_job = job_id
        print(f"[Train] 🔥 Starting training job {job_id}...")
        
        # Download dataset
        print(f"[Train] Downloading dataset from {dataset_url}...")
        dataset_response = requests.get(dataset_url, timeout=60)
        
        if dataset_response.status_code != 200:
            raise Exception(f"Failed to download dataset: HTTP {dataset_response.status_code}")
        
        dataset_data = dataset_response.json()
        
        if not dataset_data or len(dataset_data) == 0:
            raise Exception("Dataset is empty")
        
        # Load base model if not loaded
        if model is None:
            print("[Train] Loading base model...")
            from transformers import AutoModelForCausalLM, AutoTokenizer
            
            model_name = "meta-llama/Llama-3.2-1B"
            tokenizer = AutoTokenizer.from_pretrained(model_name)
            model = AutoModelForCausalLM.from_pretrained(
                model_name,
                device_map="auto",
                torch_dtype="auto"
            )
            tokenizer.pad_token = tokenizer.eos_token
        
        # Configure LoRA
        print("[Train] Configuring LoRA...")
        from peft import LoraConfig, get_peft_model, TaskType
        
        peft_config = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            inference_mode=False,
            r=lora_config.get('r', 16),
            lora_alpha=lora_config.get('alpha', 32),
            lora_dropout=lora_config.get('dropout', 0.05),
            target_modules=["q_proj", "v_proj"]
        )
        
        model = get_peft_model(model, peft_config)
        model.print_trainable_parameters()
        
        # Prepare dataset
        print("[Train] Preparing dataset...")
        from datasets import Dataset
        
        train_data = []
        for item in dataset_data[:100]:  # Limit for Kaggle quota
            train_data.append({
                "text": f"{item.get('instruction', '')}\\n{item.get('response', '')}"
            })
        
        dataset = Dataset.from_list(train_data)
        
        def tokenize_function(examples):
            return tokenizer(
                examples["text"],
                truncation=True,
                max_length=512,
                padding="max_length"
            )
        
        tokenized_dataset = dataset.map(tokenize_function, batched=True)
        
        # Train
        print("[Train] Starting training...")
        from transformers import Trainer, TrainingArguments
        
        training_arguments = TrainingArguments(
            output_dir=f"/kaggle/working/lora_{job_id}",
            num_train_epochs=training_args.get('epochs', 1),
            per_device_train_batch_size=training_args.get('batchSize', 2),
            learning_rate=training_args.get('learningRate', 2e-4),
            logging_steps=10,
            save_steps=100,
            fp16=GPU_AVAILABLE,
            report_to="none"
        )
        
        trainer = Trainer(
            model=model,
            args=training_arguments,
            train_dataset=tokenized_dataset
        )
        
        trainer.train()
        
        # Save LoRA adapters
        print("[Train] Saving LoRA adapters...")
        output_dir = f"/kaggle/working/lora_{job_id}"
        model.save_pretrained(output_dir)
        tokenizer.save_pretrained(output_dir)
        
        print(f"[Train] ✅ Training completed!")
        
        # Send completion notification to backend
        print("[Train] Notifying AION backend...")
        try:
            response = requests.post(
                f"{AION_BACKEND_URL}/api/gpu/training/complete",
                json={
                    "jobId": job_id,
                    "workerId": WORKER_ID,
                    "status": "completed",
                    "output_path": output_dir
                },
                timeout=30
            )
            if response.ok:
                print("[Train] ✅ Backend notified")
        except Exception as e:
            print(f"[Train] ⚠️  Failed to notify backend: {e}")
        
        current_job = None
        
        return jsonify({
            "status": "completed",
            "jobId": job_id,
            "output_path": output_dir
        })
        
    except Exception as e:
        print(f"[Train] ❌ Error: {e}")
        current_job = None
        return jsonify({"error": str(e)}), 500

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
