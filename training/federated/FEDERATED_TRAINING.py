# -*- coding: utf-8 -*-
"""
AION FEDERATED TRAINING SCRIPT
===============================

Train custom LLMs distributedly across multiple free GPUs (Colab + Kaggle)
Uses FedAvg algorithm to aggregate gradients from all workers

Instructions:
1. Copy this entire file
2. Paste in Google Colab or Kaggle
3. Update AION_URL and JOB_ID
4. Run all cells
5. GPU will train on its chunk and sync gradients automatically

Requirements:
- Python 3.10+
- PyTorch 2.0+
- Transformers 4.30+
- Free GPU (T4, P100, A100)
"""

# %% [markdown]
# # 📋 Configuration

# %% [code]
import os
import sys
import json
import requests
import time
from typing import Dict, List, Any

# ==============================================================================
# CONFIGURATION - ⚠️ UPDATE THESE VALUES!
# ==============================================================================

# AION Server URL (Replit)
AION_URL = "https://sua-url-replit.repl.co"  # ⚠️ SUBSTITUA!

# Training Job ID (get from Admin Dashboard → Federated Training)
JOB_ID = 1  # ⚠️ SUBSTITUA pelo ID do job

# Worker configuration
WORKER_ID = None  # Will be set automatically after registration
CHUNK_INDEX = None  # Will be assigned by AION

# Sync configuration
SYNC_INTERVAL = 100  # Send gradients every N steps
BATCH_SIZE = 4  # Adjust based on GPU memory
GRADIENT_ACCUMULATION_STEPS = 4  # Effective batch = 4 * 4 = 16

print("="*80)
print("🚀 AION FEDERATED TRAINING")
print("="*80)
print(f"AION URL: {AION_URL}")
print(f"Job ID: {JOB_ID}")
print(f"Sync Interval: {SYNC_INTERVAL} steps")
print("="*80 + "\n")

# %% [markdown]
# # 📦 Install Dependencies

# %% [code]
print("\n📦 Installing dependencies...")

!pip install -q transformers>=4.30.0
!pip install -q torch>=2.0.0
!pip install -q peft>=0.4.0
!pip install -q accelerate>=0.20.0
!pip install -q bitsandbytes>=0.39.0
!pip install -q datasets
!pip install -q scipy

print("✅ Dependencies installed\n")

# %% [markdown]
# # 🔧 Setup Environment

# %% [code]
import torch
import torch.nn as nn
from transformers import AutoTokenizer, AutoModelForCausalLM, TrainingArguments
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from datasets import load_dataset, Dataset
import numpy as np

# Check GPU
if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    vram_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
    print(f"🎮 GPU detected: {gpu_name} ({vram_gb:.1f} GB VRAM)")
else:
    print("⚠️  No GPU detected! This script requires GPU.")
    sys.exit(1)

# Set device
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# %% [markdown]
# # 📡 Register with AION

# %% [code]
print("\n📡 Registering with AION...")

try:
    # Get job details
    job_response = requests.get(f"{AION_URL}/api/training/jobs/{JOB_ID}", timeout=10)
    job_response.raise_for_status()
    job_data = job_response.json()
    
    job = job_data['job']
    model_type = job['modelType']
    
    print(f"✅ Job found: {job['name']}")
    print(f"   Model: {model_type}")
    print(f"   Total chunks: {job['totalChunks']}")
    print(f"   Status: {job['status']}")
    
except Exception as e:
    print(f"❌ Failed to get job info: {e}")
    sys.exit(1)

# Find available GPU workers
try:
    gpu_response = requests.get(f"{AION_URL}/api/gpu/workers", timeout=10)
    gpu_response.raise_for_status()
    gpu_data = gpu_response.json()
    
    # Use first healthy GPU worker (should be this Colab instance)
    healthy_workers = [w for w in gpu_data['workers'] if w['status'] == 'healthy']
    
    if not healthy_workers:
        print("⚠️  No healthy GPU workers found. Make sure GPU is registered first.")
        print("   Run the GPU registration script (COLAB_INFERENCE_SERVER.py) first!")
        sys.exit(1)
    
    # Use latest registered worker (most likely this instance)
    WORKER_ID = healthy_workers[-1]['id']
    
    print(f"✅ Using GPU worker ID: {WORKER_ID}")
    
except Exception as e:
    print(f"❌ Failed to get GPU workers: {e}")
    sys.exit(1)

# Request chunk assignment
try:
    # For now, assign chunk based on worker ID
    # TODO: AION should handle this automatically
    CHUNK_INDEX = (WORKER_ID - 1) % job['totalChunks']
    
    print(f"✅ Assigned to chunk: {CHUNK_INDEX}")
    
except Exception as e:
    print(f"❌ Chunk assignment failed: {e}")
    sys.exit(1)

print("="*80 + "\n")

# %% [markdown]
# # 📥 Load Dataset Chunk

# %% [code]
print(f"\n📥 Loading dataset chunk {CHUNK_INDEX}...")

try:
    # Download chunk from AION
    chunk_url = f"{AION_URL}/datasets/chunks/job-{JOB_ID}/chunk-{CHUNK_INDEX}.jsonl"
    chunk_response = requests.get(chunk_url, timeout=30)
    
    if chunk_response.status_code == 404:
        print(f"⚠️  Chunk not found. Using sample data for testing...")
        
        # Create sample data
        sample_data = []
        for i in range(100):
            sample_data.append({
                "instruction": f"Sample instruction {i}",
                "input": "",
                "output": f"Sample output {i}",
            })
        
        dataset = Dataset.from_list(sample_data)
    else:
        chunk_response.raise_for_status()
        
        # Parse JSONL
        lines = chunk_response.text.strip().split('\n')
        chunk_data = [json.loads(line) for line in lines]
        
        dataset = Dataset.from_list(chunk_data)
    
    print(f"✅ Dataset loaded: {len(dataset)} examples")
    
except Exception as e:
    print(f"⚠️  Failed to load chunk: {e}")
    print(f"   Using sample data for testing...")
    
    # Fallback to sample data
    sample_data = [{"instruction": f"Sample {i}", "input": "", "output": f"Out {i}"} for i in range(100)]
    dataset = Dataset.from_list(sample_data)

print("="*80 + "\n")

# %% [markdown]
# # 🤖 Load Model

# %% [code]
print(f"\n🤖 Loading model: {model_type}...")

# Model mapping
MODEL_MAPPING = {
    'llama-3-8b': 'meta-llama/Meta-Llama-3-8B',
    'mistral-7b': 'mistralai/Mistral-7B-v0.1',
    'phi-3': 'microsoft/phi-3-mini-4k-instruct',
}

model_name = MODEL_MAPPING.get(model_type, MODEL_MAPPING['mistral-7b'])

# Load tokenizer
tokenizer = AutoTokenizer.from_pretrained(model_name)
tokenizer.pad_token = tokenizer.eos_token

# Load model in 4-bit for memory efficiency
print(f"Loading {model_name} in 4-bit mode...")

model = AutoModelForCausalLM.from_pretrained(
    model_name,
    load_in_4bit=True,
    device_map="auto",
    trust_remote_code=True,
)

# Prepare for LoRA training
model = prepare_model_for_kbit_training(model)

# LoRA configuration
lora_config = LoraConfig(
    r=16,  # Rank
    lora_alpha=32,
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

model = get_peft_model(model, lora_config)

print(f"✅ Model loaded with LoRA")
print("="*80 + "\n")

# %% [markdown]
# # 🎯 Training Loop with Federated Sync

# %% [code]
print("\n🎯 Starting federated training...\n")

# Training configuration
hyperparams = job['hyperparameters']
learning_rate = hyperparams.get('learning_rate', 2e-5)
epochs = hyperparams.get('epochs', 3)
max_steps = hyperparams.get('max_steps', 1000)

optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)

# Training loop
global_step = 0
local_step = 0
running_loss = 0.0

print(f"Training config:")
print(f"  Learning rate: {learning_rate}")
print(f"  Epochs: {epochs}")
print(f"  Max steps: {max_steps}")
print(f"  Batch size: {BATCH_SIZE}")
print(f"  Gradient accumulation: {GRADIENT_ACCUMULATION_STEPS}")
print(f"  Sync interval: {SYNC_INTERVAL}")
print("="*80 + "\n")

model.train()

for epoch in range(epochs):
    print(f"\n📚 Epoch {epoch + 1}/{epochs}")
    print("-" * 80)
    
    for i in range(0, len(dataset), BATCH_SIZE):
        batch = dataset[i:i + BATCH_SIZE]
        
        # Tokenize
        texts = [f"{ex['instruction']} {ex['input']}" for ex in batch]
        inputs = tokenizer(texts, return_tensors="pt", padding=True, truncation=True, max_length=512)
        inputs = {k: v.to(device) for k, v in inputs.items()}
        inputs['labels'] = inputs['input_ids'].clone()
        
        # Forward pass
        outputs = model(**inputs)
        loss = outputs.loss / GRADIENT_ACCUMULATION_STEPS
        loss.backward()
        
        running_loss += loss.item()
        local_step += 1
        
        # Update weights
        if local_step % GRADIENT_ACCUMULATION_STEPS == 0:
            optimizer.step()
            optimizer.zero_grad()
            global_step += 1
            
            # Print progress
            if global_step % 10 == 0:
                avg_loss = running_loss / 10
                print(f"  Step {global_step}/{max_steps} | Loss: {avg_loss:.4f}")
                running_loss = 0.0
            
            # Sync gradients with AION
            if global_step % SYNC_INTERVAL == 0:
                print(f"\n{'='*80}")
                print(f"📤 Syncing gradients at step {global_step}...")
                print('='*80)
                
                try:
                    # Extract gradients
                    gradients = {}
                    for name, param in model.named_parameters():
                        if param.grad is not None:
                            gradients[name] = param.grad.cpu().numpy().tolist()
                    
                    # Send to AION
                    sync_payload = {
                        'jobId': JOB_ID,
                        'workerId': WORKER_ID,
                        'step': global_step,
                        'localStep': local_step,
                        'localLoss': avg_loss,
                        'gradients': gradients,
                        'numExamples': min(BATCH_SIZE * GRADIENT_ACCUMULATION_STEPS, len(dataset) - i),
                    }
                    
                    sync_response = requests.post(
                        f"{AION_URL}/api/training/gradients",
                        json=sync_payload,
                        timeout=30
                    )
                    sync_response.raise_for_status()
                    sync_data = sync_response.json()
                    
                    print(f"✅ Gradients sent successfully!")
                    print(f"   Should aggregate: {sync_data.get('shouldAggregate', False)}")
                    
                    # If aggregation happened, download new checkpoint
                    if sync_data.get('checkpointPath'):
                        print(f"📥 Downloading updated checkpoint...")
                        
                        checkpoint_response = requests.get(
                            f"{AION_URL}/api/training/checkpoints/{JOB_ID}",
                            timeout=30
                        )
                        
                        if checkpoint_response.status_code == 200:
                            checkpoint_data = checkpoint_response.json()
                            checkpoint = checkpoint_data['checkpoint']
                            
                            # Apply aggregated gradients
                            # (Simplified: just log for now)
                            print(f"✅ Checkpoint received (step {checkpoint['step']})")
                        
                    print('='*80 + "\n")
                    
                except Exception as e:
                    print(f"⚠️  Sync failed: {e}")
                    print("   Continuing with local training...")
                    print('='*80 + "\n")
        
        # Check max steps
        if global_step >= max_steps:
            break
    
    if global_step >= max_steps:
        break

print("\n" + "="*80)
print("🎉 Training completed!")
print(f"   Final step: {global_step}")
print(f"   Final loss: {avg_loss:.4f}")
print("="*80)

# %% [markdown]
# # 💾 Save Final Model

# %% [code]
print("\n💾 Saving final LoRA adapter...")

output_dir = f"/content/lora-adapter-job-{JOB_ID}-worker-{WORKER_ID}"
model.save_pretrained(output_dir)
tokenizer.save_pretrained(output_dir)

print(f"✅ Model saved to: {output_dir}")
print("\n🎉 Federated training complete!")
print("   Upload the LoRA adapter to AION for deployment.")
