/**
 * AION Supreme - GPU Orchestrator
 * Automatic rotation between Google Colab (12h sessions) ↔ Kaggle (30h/week)
 * Manages: Training jobs, model uploads, Google Drive persistence
 */

export interface GPUProvider {
  name: 'colab' | 'kaggle' | 'modal' | 'gcp';
  available: boolean;
  quotaRemaining: number;  // hours
  quotaTotal: number;       // hours per period
  resetTime?: Date;
}

export interface TrainingJob {
  id: string;
  model: string;  // 'mistral-7b' | 'llama-3-8b' | 'phi-3'
  dataset: string;  // Path to JSONL file
  outputPath: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  provider?: GPUProvider['name'];
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface LoRAConfig {
  r: number;              // Rank (4, 8, 16, 32)
  alpha: number;          // Scaling (typically 2*r)
  dropout: number;        // Dropout (0.05-0.1)
  targetModules: string[]; // ['q_proj', 'k_proj', 'v_proj', 'o_proj']
  biasMode: 'none' | 'all' | 'lora_only';
}

// ============================================================================
// GPU PROVIDER STATUS
// ============================================================================

const providers: GPUProvider[] = [
  {
    name: 'colab',
    available: true,
    quotaRemaining: 84,  // 12h/session × 7 days = 84h/week
    quotaTotal: 84,
    resetTime: getNextMonday()
  },
  {
    name: 'kaggle',
    available: true,
    quotaRemaining: 30,  // 30h/week
    quotaTotal: 30,
    resetTime: getNextMonday()
  },
  {
    name: 'gcp',
    available: false,   // Requires setup
    quotaRemaining: 0,
    quotaTotal: 0
  },
  {
    name: 'modal',
    available: false,   // Requires setup
    quotaRemaining: 0,
    quotaTotal: 0
  }
];

function getNextMonday(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilMonday = (8 - dayOfWeek) % 7 || 7;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
}

// ============================================================================
// PROVIDER SELECTION
// ============================================================================

export function selectBestProvider(estimatedHours: number = 3): GPUProvider | null {
  // Reset quotas if needed
  const now = new Date();
  for (const provider of providers) {
    if (provider.resetTime && now >= provider.resetTime) {
      provider.quotaRemaining = provider.quotaTotal;
      provider.resetTime = getNextMonday();
    }
  }

  // Sort by priority: quotaRemaining DESC
  const available = providers
    .filter(p => p.available && p.quotaRemaining >= estimatedHours)
    .sort((a, b) => b.quotaRemaining - a.quotaRemaining);

  return available.length > 0 ? available[0] : null;
}

export function updateQuota(providerName: GPUProvider['name'], hoursUsed: number) {
  const provider = providers.find(p => p.name === providerName);
  if (provider) {
    provider.quotaRemaining = Math.max(0, provider.quotaRemaining - hoursUsed);
  }
}

export function getProviderStatus(): GPUProvider[] {
  return providers;
}

// ============================================================================
// GOOGLE COLAB AUTOMATION
// ============================================================================

/**
 * Generate Google Colab notebook for LoRA training
 */
export function generateColabNotebook(job: TrainingJob, config: LoRAConfig): string {
  return `{
  "cells": [
    {
      "cell_type": "markdown",
      "metadata": {},
      "source": ["# AION Supreme - LoRA Fine-Tuning\\n", "Model: ${job.model}\\n", "Dataset: ${job.dataset}"]
    },
    {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Install dependencies\\n",
        "!pip install -q transformers peft accelerate bitsandbytes datasets wandb\\n",
        "!pip install -q torch --upgrade"
      ],
      "execution_count": null,
      "outputs": []
    },
    {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Mount Google Drive for persistence\\n",
        "from google.colab import drive\\n",
        "drive.mount('/content/drive')"
      ],
      "execution_count": null,
      "outputs": []
    },
    {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Load model and dataset\\n",
        "import torch\\n",
        "from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments\\n",
        "from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training\\n",
        "from datasets import load_dataset\\n",
        "\\n",
        "model_name = '${getModelHFPath(job.model)}'\\n",
        "\\n",
        "# Load in 4-bit for memory efficiency\\n",
        "model = AutoModelForCausalLM.from_pretrained(\\n",
        "    model_name,\\n",
        "    load_in_4bit=True,\\n",
        "    torch_dtype=torch.float16,\\n",
        "    device_map='auto'\\n",
        ")\\n",
        "tokenizer = AutoTokenizer.from_pretrained(model_name)\\n",
        "\\n",
        "# Prepare for training\\n",
        "model = prepare_model_for_kbit_training(model)"
      ],
      "execution_count": null,
      "outputs": []
    },
    {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# LoRA configuration\\n",
        "lora_config = LoraConfig(\\n",
        "    r=${config.r},\\n",
        "    lora_alpha=${config.alpha},\\n",
        "    lora_dropout=${config.dropout},\\n",
        "    target_modules=${JSON.stringify(config.targetModules)},\\n",
        "    bias='${config.biasMode}',\\n",
        "    task_type='CAUSAL_LM'\\n",
        ")\\n",
        "\\n",
        "model = get_peft_model(model, lora_config)\\n",
        "model.print_trainable_parameters()"
      ],
      "execution_count": null,
      "outputs": []
    },
    {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Load training data\\n",
        "dataset = load_dataset('json', data_files='/content/drive/MyDrive/${job.dataset}')\\n",
        "\\n",
        "# Tokenize\\n",
        "def tokenize_function(examples):\\n",
        "    return tokenizer(examples['text'], truncation=True, max_length=2048)\\n",
        "\\n",
        "tokenized_dataset = dataset.map(tokenize_function, batched=True)"
      ],
      "execution_count": null,
      "outputs": []
    },
    {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Training arguments\\n",
        "training_args = TrainingArguments(\\n",
        "    output_dir='/content/drive/MyDrive/${job.outputPath}',\\n",
        "    num_train_epochs=3,\\n",
        "    per_device_train_batch_size=4,\\n",
        "    gradient_accumulation_steps=4,\\n",
        "    learning_rate=2e-4,\\n",
        "    fp16=True,\\n",
        "    logging_steps=10,\\n",
        "    save_steps=100,\\n",
        "    save_total_limit=3,\\n",
        "    warmup_steps=100,\\n",
        "    weight_decay=0.01,\\n",
        "    optim='paged_adamw_8bit'\\n",
        ")"
      ],
      "execution_count": null,
      "outputs": []
    },
    {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Train\\n",
        "from transformers import Trainer\\n",
        "\\n",
        "trainer = Trainer(\\n",
        "    model=model,\\n",
        "    args=training_args,\\n",
        "    train_dataset=tokenized_dataset['train']\\n",
        ")\\n",
        "\\n",
        "trainer.train()"
      ],
      "execution_count": null,
      "outputs": []
    },
    {
      "cell_type": "code",
      "metadata": {},
      "source": [
        "# Save final model\\n",
        "model.save_pretrained('/content/drive/MyDrive/${job.outputPath}/final')\\n",
        "tokenizer.save_pretrained('/content/drive/MyDrive/${job.outputPath}/final')"
      ],
      "execution_count": null,
      "outputs": []
    }
  ],
  "metadata": {
    "accelerator": "GPU",
    "colab": {
      "provenance": [],
      "gpuType": "T4"
    },
    "kernelspec": {
      "display_name": "Python 3",
      "name": "python3"
    }
  },
  "nbformat": 4,
  "nbformat_minor": 0
}`;
}

function getModelHFPath(model: string): string {
  const map: Record<string, string> = {
    'mistral-7b': 'mistralai/Mistral-7B-Instruct-v0.3',
    'llama-3-8b': 'meta-llama/Meta-Llama-3-8B-Instruct',
    'phi-3': 'microsoft/Phi-3-mini-4k-instruct',
    'gemma-7b': 'google/gemma-7b-it'
  };
  return map[model] || model;
}

// ============================================================================
// KAGGLE AUTOMATION
// ============================================================================

/**
 * Generate Kaggle kernel script for LoRA training
 */
export function generateKaggleKernel(job: TrainingJob, config: LoRAConfig): string {
  return `# AION Supreme - LoRA Fine-Tuning (Kaggle)
# Model: ${job.model}
# Dataset: ${job.dataset}

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from datasets import load_dataset
import os

# Kaggle GPU: T4 (16GB)
print(f"GPU: {torch.cuda.get_device_name(0)}")
print(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")

# Load model
model_name = "${getModelHFPath(job.model)}"
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    load_in_4bit=True,
    torch_dtype=torch.float16,
    device_map="auto"
)
tokenizer = AutoTokenizer.from_pretrained(model_name)

# Prepare for training
model = prepare_model_for_kbit_training(model)

# LoRA config
lora_config = LoraConfig(
    r=${config.r},
    lora_alpha=${config.alpha},
    lora_dropout=${config.dropout},
    target_modules=${JSON.stringify(config.targetModules)},
    bias="${config.biasMode}",
    task_type="CAUSAL_LM"
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# Load dataset (from Kaggle datasets)
dataset = load_dataset("json", data_files="/kaggle/input/${job.dataset}")

def tokenize_function(examples):
    return tokenizer(examples["text"], truncation=True, max_length=2048)

tokenized_dataset = dataset.map(tokenize_function, batched=True)

# Training arguments
training_args = TrainingArguments(
    output_dir="/kaggle/working/output",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    save_steps=100,
    save_total_limit=3,
    warmup_steps=100,
    weight_decay=0.01,
    optim="paged_adamw_8bit"
)

# Train
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset["train"]
)

trainer.train()

# Save
model.save_pretrained("/kaggle/working/final")
tokenizer.save_pretrained("/kaggle/working/final")

print("✓ Training complete!")
`;
}

// ============================================================================
// DEFAULT LORA CONFIGURATIONS
// ============================================================================

export const DEFAULT_LORA_CONFIGS: Record<string, LoRAConfig> = {
  'mistral-7b': {
    r: 16,
    alpha: 32,
    dropout: 0.05,
    targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj'],
    biasMode: 'none'
  },
  'llama-3-8b': {
    r: 16,
    alpha: 32,
    dropout: 0.1,
    targetModules: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
    biasMode: 'none'
  },
  'phi-3': {
    r: 8,
    alpha: 16,
    dropout: 0.05,
    targetModules: ['qkv_proj', 'o_proj'],
    biasMode: 'none'
  }
};
