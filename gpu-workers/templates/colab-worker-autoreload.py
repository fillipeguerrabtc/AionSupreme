"""
AION GPU Worker - Auto-Reload Fine-Tuned Models
================================================

This template enables AUTOMATIC deployment of fine-tuned models to GPU workers.

Features:
- Auto-downloads latest checkpoint from AION backend
- Hot-reloads LoRA adapters without restart
- Periodic polling for new checkpoints
- Health check with model version validation

Setup Instructions:
1. Run this in Google Colab with GPU runtime
2. Set AION_BACKEND_URL environment variable
3. Execute all cells - server starts automatically
4. Worker registers itself and polls for checkpoint updates

Self-Improving AI Flow:
Training Job → Checkpoint Saved → Worker Auto-Downloads → LoRA Applied → Inference Ready
"""

import os
import time
import threading
import requests
from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel, PeftConfig
import torch

# ============================================================================
# CONFIGURATION
# ============================================================================

AION_BACKEND_URL = os.getenv("AION_BACKEND_URL", "https://your-aion-backend.replit.app")
TRAINING_JOB_ID = int(os.getenv("TRAINING_JOB_ID", "1"))  # Which job to track
BASE_MODEL_NAME = os.getenv("BASE_MODEL_NAME", "mistralai/Mistral-7B-v0.1")
CHECKPOINT_POLL_INTERVAL = 300  # Check for new checkpoint every 5min

# GPU Worker State
app = Flask(__name__)
current_model = None
current_tokenizer = None
current_checkpoint_version = 0
model_lock = threading.Lock()

# ============================================================================
# MODEL LOADING & HOT-RELOAD
# ============================================================================

def load_base_model():
    """Load base model from HuggingFace"""
    global current_model, current_tokenizer
    
    print(f"[Model Load] Loading base model: {BASE_MODEL_NAME}")
    
    current_tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_NAME)
    current_model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_NAME,
        device_map="auto",
        torch_dtype=torch.float16,
    )
    
    print(f"[Model Load] ✅ Base model loaded successfully")
    return current_model

def download_checkpoint(job_id: int) -> str:
    """Download latest checkpoint from AION backend"""
    download_url = f"{AION_BACKEND_URL}/api/training/checkpoints/{job_id}/download"
    local_path = f"/tmp/checkpoint-job-{job_id}.pt"
    
    print(f"[Checkpoint] Downloading from {download_url}...")
    
    response = requests.get(download_url, stream=True)
    response.raise_for_status()
    
    with open(local_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)
    
    print(f"[Checkpoint] ✅ Downloaded to {local_path}")
    return local_path

def get_checkpoint_version(job_id: int) -> int:
    """Get current checkpoint version from backend"""
    try:
        metadata_url = f"{AION_BACKEND_URL}/api/training/checkpoints/{job_id}"
        # Note: This endpoint requires auth - in production, pass API key
        response = requests.get(metadata_url)
        
        if response.status_code == 200:
            data = response.json()
            return data.get('version', 0)
        else:
            return 0
    except Exception as e:
        print(f"[Checkpoint] Warning: Could not fetch version: {e}")
        return 0

def apply_lora_adapter(checkpoint_path: str):
    """Apply LoRA adapter to base model (HOT RELOAD)"""
    global current_model, current_checkpoint_version
    
    with model_lock:
        print(f"[LoRA] Applying adapter from {checkpoint_path}...")
        
        # PEFT auto-detects LoRA config from checkpoint
        try:
            current_model = PeftModel.from_pretrained(
                current_model, 
                checkpoint_path,
                is_trainable=False  # Inference mode
            )
            current_model.eval()
            
            current_checkpoint_version = get_checkpoint_version(TRAINING_JOB_ID)
            
            print(f"[LoRA] ✅ Adapter applied! Version: {current_checkpoint_version}")
            
        except Exception as e:
            print(f"[LoRA] ❌ Error applying adapter: {e}")
            raise

def reload_model():
    """
    HOT RELOAD: Download latest checkpoint and apply LoRA without restart
    This is the KEY function for self-improving AI!
    """
    try:
        print(f"[Hot Reload] Checking for new checkpoint (job {TRAINING_JOB_ID})...")
        
        # Get latest checkpoint version
        latest_version = get_checkpoint_version(TRAINING_JOB_ID)
        
        if latest_version > current_checkpoint_version:
            print(f"[Hot Reload] 🔥 New checkpoint detected! {current_checkpoint_version} → {latest_version}")
            
            # Download checkpoint
            checkpoint_path = download_checkpoint(TRAINING_JOB_ID)
            
            # Apply LoRA adapter
            apply_lora_adapter(checkpoint_path)
            
            print(f"[Hot Reload] ✅ Model reloaded successfully!")
            return True
        else:
            print(f"[Hot Reload] No new checkpoint (current: {current_checkpoint_version})")
            return False
            
    except Exception as e:
        print(f"[Hot Reload] ❌ Error: {e}")
        return False

# ============================================================================
# BACKGROUND CHECKPOINT POLLING
# ============================================================================

def checkpoint_poller():
    """
    Background thread that polls for new checkpoints every N minutes
    This enables AUTOMATIC model updates without human intervention!
    """
    while True:
        try:
            time.sleep(CHECKPOINT_POLL_INTERVAL)
            reload_model()
        except Exception as e:
            print(f"[Poller] Error: {e}")

# ============================================================================
# OPENAI-COMPATIBLE API SERVER
# ============================================================================

@app.route('/v1/completions', methods=['POST'])
def completions():
    """OpenAI-compatible completions endpoint"""
    data = request.json
    prompt = data.get('prompt', '')
    max_tokens = data.get('max_tokens', 100)
    temperature = data.get('temperature', 0.7)
    
    with model_lock:
        # Tokenize
        inputs = current_tokenizer(prompt, return_tensors="pt").to(current_model.device)
        
        # Generate
        outputs = current_model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temperature,
            do_sample=temperature > 0,
        )
        
        # Decode
        generated_text = current_tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    return jsonify({
        "choices": [{
            "text": generated_text,
            "index": 0,
            "finish_reason": "stop"
        }],
        "model": BASE_MODEL_NAME,
        "checkpoint_version": current_checkpoint_version
    })

@app.route('/v1/models/reload', methods=['POST'])
def reload_endpoint():
    """
    Manual hot-reload trigger
    POST /v1/models/reload
    """
    success = reload_model()
    
    return jsonify({
        "success": success,
        "current_version": current_checkpoint_version,
        "message": "Model reloaded" if success else "No new checkpoint available"
    })

@app.route('/health', methods=['GET'])
def health():
    """
    Health check with model version validation
    AION backend can verify workers are using latest checkpoint
    """
    latest_version = get_checkpoint_version(TRAINING_JOB_ID)
    is_up_to_date = (current_checkpoint_version >= latest_version)
    
    return jsonify({
        "status": "healthy" if current_model else "initializing",
        "model": BASE_MODEL_NAME,
        "checkpoint_version": current_checkpoint_version,
        "latest_version": latest_version,
        "up_to_date": is_up_to_date,
        "device": str(current_model.device) if current_model else None
    })

# ============================================================================
# STARTUP
# ============================================================================

if __name__ == "__main__":
    print("=" * 80)
    print("AION GPU Worker - Auto-Reload Fine-Tuned Models")
    print("=" * 80)
    
    # 1. Load base model
    load_base_model()
    
    # 2. Try to load latest checkpoint (if available)
    try:
        print(f"\n[Startup] Checking for existing checkpoint...")
        reload_model()
    except Exception as e:
        print(f"[Startup] No checkpoint found (will use base model): {e}")
    
    # 3. Start background poller
    poller_thread = threading.Thread(target=checkpoint_poller, daemon=True)
    poller_thread.start()
    print(f"\n[Poller] Background checkpoint poller started (interval: {CHECKPOINT_POLL_INTERVAL}s)")
    
    # 4. Start Flask server
    print(f"\n[Server] Starting OpenAI-compatible API server...")
    print(f"[Server] Endpoints:")
    print(f"  - POST /v1/completions (inference)")
    print(f"  - POST /v1/models/reload (manual reload)")
    print(f"  - GET /health (health check + version)")
    print("=" * 80)
    
    # Run with ngrok for public access
    from flask_ngrok import run_with_ngrok
    run_with_ngrok(app)
    
    app.run()
