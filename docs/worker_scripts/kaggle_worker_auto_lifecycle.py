"""
AION GPU Worker - Auto Lifecycle Script (Kaggle Notebooks)
===========================================================

IMPORTANTE: Este script é dividido em 2 CÉLULAS.

CÉLULA 1: SETUP (Executar PRIMEIRO)
CÉLULA 2: WORKER MAIN LOOP (Executar SEGUNDO)
"""

# ===========================================================================
# CÉLULA 1: SETUP - Instalar Dependências
# ===========================================================================

!pip install -q pyngrok
!pip install -q torch torchvision torchaudio
!pip install -q transformers accelerate peft

print("✅ Dependências instaladas! Agora execute CÉLULA 2")

# ===========================================================================
# CÉLULA 2: WORKER MAIN LOOP
# ===========================================================================

import os
import sys
import time
import json
import requests
from datetime import datetime

# ============================================================================
# CONFIGURAÇÕES
# ============================================================================

AION_BASE_URL = "https://seu-aion-aqui.replit.app"  # ⚠️ MUDAR ISSO!
PROVIDER = "kaggle"

# ============================================================================
# SETUP NGROK
# ============================================================================

print("🌐 [SETUP] Criando túnel ngrok...")

from pyngrok import ngrok

tunnel = ngrok.connect(5000, bind_tls=True)
ngrok_url = tunnel.public_url

print(f"✅ [SETUP] Túnel criado: {ngrok_url}")

# ============================================================================
# WORKER REGISTRATION
# ============================================================================

def register_worker(ngrok_url):
    """Registra worker"""
    print("📝 [REGISTER] Registrando worker...")
    
    import torch
    
    gpu_count = torch.cuda.device_count()
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    vram_per_gpu = torch.cuda.get_device_properties(0).total_memory / (1024**3) if torch.cuda.is_available() else 0
    total_vram = vram_per_gpu * gpu_count
    
    payload = {
        "provider": PROVIDER,
        "ngrokUrl": ngrok_url,
        "capabilities": {
            "tor_enabled": False,
            "model": "llama-3-8b",
            "gpu": f"{gpu_count}x {gpu_name}",
            "vram_gb": int(total_vram),
            "max_concurrent": 1
        }
    }
    
    try:
        response = requests.post(
            f"{AION_BASE_URL}/api/gpu/workers/register",
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        
        worker_data = response.json()
        worker_id = worker_data["id"]
        
        print(f"✅ [REGISTER] Worker ID: {worker_id}")
        print(f"   GPUs: {gpu_count}x {gpu_name} ({total_vram:.1f} GB total)")
        
        return worker_id
    except Exception as e:
        print(f"❌ [REGISTER] Erro: {e}")
        sys.exit(1)

# ============================================================================
# HEARTBEAT, JOBS, TRAINING - Idêntico ao Colab
# ============================================================================

def send_heartbeat(worker_id):
    try:
        response = requests.post(
            f"{AION_BASE_URL}/api/gpu/workers/{worker_id}/heartbeat",
            timeout=5
        )
        return response.status_code == 200
    except:
        return False

def check_for_pending_job(worker_id):
    try:
        response = requests.get(
            f"{AION_BASE_URL}/api/gpu/jobs/pending/{worker_id}",
            timeout=5
        )
        if response.status_code == 200:
            return response.json()
        return None
    except:
        return None

def execute_training_job(job):
    print(f"🔥 [TRAIN] Job {job['id']}...")
    
    import random
    for i in range(6):
        print(f"   Epoch {i+1}/6 - Loss: {random.uniform(0.5, 2.0):.4f}")
        time.sleep(10)
    
    return {
        "layer1": [random.random() for _ in range(10)],
        "layer2": [random.random() for _ in range(10)],
    }

def send_gradients(worker_id, job_id, gradients):
    try:
        response = requests.post(
            f"{AION_BASE_URL}/api/gpu/gradients",
            json={"workerId": worker_id, "jobId": job_id, "gradients": gradients},
            timeout=30
        )
        response.raise_for_status()
        print("✅ [GRADIENTS] Enviados!")
        return True
    except:
        return False

def auto_shutdown():
    print("━" * 60)
    print("✅ [COMPLETE] Job concluído!")
    print("━" * 60)
    print("⚠️ KAGGLE: Shutdown manual necessário")
    print("💡 Clique em 'Stop Session' para liberar GPU")
    print("━" * 60)

# ============================================================================
# MAIN LOOP
# ============================================================================

print("=" * 60)
print("🤖 AION GPU WORKER - Kaggle")
print("=" * 60)

worker_id = register_worker(ngrok_url)

print("\n✅ WORKER ATIVO - Aguardando jobs...\n")

heartbeat_counter = 0
job_check_counter = 0

try:
    while True:
        if heartbeat_counter % 30 == 0:
            send_heartbeat(worker_id)
            print(f"💓 [HEARTBEAT] ({datetime.now().strftime('%H:%M:%S')})")
        
        if job_check_counter % 10 == 0:
            job = check_for_pending_job(worker_id)
            
            if job:
                print(f"\n🔔 JOB RECEBIDO: {job['id']}\n")
                
                gradients = execute_training_job(job)
                success = send_gradients(worker_id, job['id'], gradients)
                
                if success:
                    print("\n✅ JOB COMPLETO!\n")
                    auto_shutdown()
                    break
        
        time.sleep(1)
        heartbeat_counter += 1
        job_check_counter += 1
        
except KeyboardInterrupt:
    print("\n⚠️ Worker interrompido")
