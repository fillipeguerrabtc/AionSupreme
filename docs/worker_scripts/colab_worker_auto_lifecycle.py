"""
AION GPU Worker - Auto Lifecycle Script (Google Colab)
========================================================

IMPORTANTE: Este script é dividido em 2 CÉLULAS para evitar erros de sintaxe.

CÉLULA 1: SETUP (Executar PRIMEIRO)
CÉLULA 2: WORKER MAIN LOOP (Executar SEGUNDO)

Copie cada célula separadamente para o Colab.
"""

# ===========================================================================
# CÉLULA 1: SETUP - Instalar Dependências
# ===========================================================================
# Cole isso na PRIMEIRA célula do Colab e execute (Shift+Enter)

!pip install -q pyngrok
!pip install -q torch torchvision torchaudio
!pip install -q transformers accelerate peft
!pip install -q flask

print("✅ Dependências instaladas! Agora execute CÉLULA 2")

# ===========================================================================
# CÉLULA 2: WORKER MAIN LOOP
# ===========================================================================
# Cole isso na SEGUNDA célula do Colab e execute (Shift+Enter)

import os
import sys
import time
import json
import requests
from datetime import datetime

# ============================================================================
# CONFIGURAÇÕES - EDITE AQUI
# ============================================================================

AION_BASE_URL = "https://seu-aion-aqui.replit.app"  # ⚠️ MUDAR ISSO!
PROVIDER = "colab"

# ============================================================================
# SETUP NGROK
# ============================================================================

print("🌐 [SETUP] Criando túnel ngrok...")

from pyngrok import ngrok

# Criar túnel ngrok na porta 5000
tunnel = ngrok.connect(5000, bind_tls=True)
ngrok_url = tunnel.public_url

print(f"✅ [SETUP] Túnel criado: {ngrok_url}")

# ============================================================================
# WORKER REGISTRATION
# ============================================================================

def register_worker(ngrok_url):
    """Registra worker no AION"""
    print("📝 [REGISTER] Registrando worker no AION...")
    
    import torch
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3) if torch.cuda.is_available() else 0
    
    payload = {
        "provider": PROVIDER,
        "ngrokUrl": ngrok_url,
        "capabilities": {
            "tor_enabled": False,
            "model": "llama-3-8b",
            "gpu": gpu_name,
            "vram_gb": int(vram_gb),
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
        
        print(f"✅ [REGISTER] Worker registrado! ID: {worker_id}")
        print(f"   GPU: {gpu_name} ({vram_gb:.1f} GB VRAM)")
        
        return worker_id
    except Exception as e:
        print(f"❌ [REGISTER] Erro ao registrar: {e}")
        sys.exit(1)

# ============================================================================
# HEARTBEAT
# ============================================================================

def send_heartbeat(worker_id):
    """Envia heartbeat"""
    try:
        response = requests.post(
            f"{AION_BASE_URL}/api/gpu/workers/{worker_id}/heartbeat",
            timeout=5
        )
        return response.status_code == 200
    except:
        return False

# ============================================================================
# JOB POLLING
# ============================================================================

def check_for_pending_job(worker_id):
    """Verifica job pendente"""
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

# ============================================================================
# TRAINING
# ============================================================================

def execute_training_job(job):
    """Executa treino"""
    print(f"🔥 [TRAIN] Iniciando treino do job {job['id']}...")
    
    try:
        import random
        
        # Simular treino (substituir por treino real)
        for i in range(6):
            print(f"   Epoch {i+1}/6 - Loss: {random.uniform(0.5, 2.0):.4f}")
            time.sleep(10)
        
        gradients = {
            "layer1": [random.random() for _ in range(10)],
            "layer2": [random.random() for _ in range(10)],
        }
        
        print(f"✅ [TRAIN] Treino concluído!")
        return gradients
    except Exception as e:
        print(f"❌ [TRAIN] Erro: {e}")
        raise

# ============================================================================
# SEND GRADIENTS
# ============================================================================

def send_gradients(worker_id, job_id, gradients):
    """Envia gradientes"""
    print(f"📤 [GRADIENTS] Enviando gradientes...")
    
    try:
        response = requests.post(
            f"{AION_BASE_URL}/api/gpu/gradients",
            json={
                "workerId": worker_id,
                "jobId": job_id,
                "gradients": gradients
            },
            timeout=30
        )
        response.raise_for_status()
        
        print(f"✅ [GRADIENTS] Enviados!")
        return True
    except Exception as e:
        print(f"❌ [GRADIENTS] Erro: {e}")
        return False

# ============================================================================
# AUTO-SHUTDOWN
# ============================================================================

def auto_shutdown():
    """Desliga GPU automaticamente"""
    print("━" * 60)
    print("💤 [SHUTDOWN] Desligando GPU...")
    print("━" * 60)
    
    try:
        from google.colab import runtime
        
        print("⏳ Desligando em 10 segundos...")
        time.sleep(10)
        
        runtime.unassign()  # 🔥 DESLIGA
        print("✅ Runtime desligado!")
    except Exception as e:
        print(f"⚠️ Erro ao desligar: {e}")

# ============================================================================
# MAIN LOOP
# ============================================================================

print("=" * 60)
print("🤖 AION GPU WORKER - Auto Lifecycle")
print("=" * 60)
print(f"⏰ Início: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 60)

# Register worker
worker_id = register_worker(ngrok_url)

print("\n" + "=" * 60)
print("✅ WORKER ATIVO - Aguardando jobs...")
print("=" * 60)
print(f"Worker ID: {worker_id}")
print(f"Túnel: {ngrok_url}")
print("=" * 60)
print("\n⏳ Pressione Ctrl+C para parar\n")

heartbeat_counter = 0
job_check_counter = 0

try:
    while True:
        # Heartbeat a cada 30s
        if heartbeat_counter % 30 == 0:
            send_heartbeat(worker_id)
            print(f"💓 [HEARTBEAT] ({datetime.now().strftime('%H:%M:%S')})")
        
        # Check jobs a cada 10s
        if job_check_counter % 10 == 0:
            job = check_for_pending_job(worker_id)
            
            if job:
                print("\n" + "🎯" * 30)
                print(f"🔔 JOB RECEBIDO: {job['id']}")
                print("🎯" * 30 + "\n")
                
                # Executar treino
                gradients = execute_training_job(job)
                
                # Enviar gradientes
                success = send_gradients(worker_id, job['id'], gradients)
                
                if success:
                    print("\n" + "✨" * 30)
                    print("✅ JOB COMPLETO!")
                    print("✨" * 30 + "\n")
                    
                    # AUTOSHUTDOWN
                    auto_shutdown()
                    break
        
        time.sleep(1)
        heartbeat_counter += 1
        job_check_counter += 1
        
except KeyboardInterrupt:
    print("\n\n⚠️ Worker interrompido (Ctrl+C)")
except Exception as e:
    print(f"\n\n❌ Erro fatal: {e}")
