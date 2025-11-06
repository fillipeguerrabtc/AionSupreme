# AION - Inference Server Notebook (Google Colab)
# =================================================
# Este notebook serve o modelo fine-tuned (Llama-3-8B + LoRA) via
# FastAPI + Ngrok, permitindo que o AION no Replit use a GPU do Colab.
#
# GPU necessária: T4 (Colab grátis)
# Uptime: ~12h por sessão
# Compatível com: OpenAI API format
#
# Documentação: docs/FREE_GPU_API_STRATEGY.md

# %% [markdown]
# # 🚀 AION - Inference Server (Llama-3-8B + LoRA)
# 
# Este notebook transforma o Colab em um servidor de inferência para o modelo
# fine-tuned do AION. Ele expõe uma API compatível com OpenAI via Ngrok.
# 
# **Benefícios:**
# - ✅ GPU T4 grátis (vs $0.50/h em serviços pagos)
# - ✅ API compatível com OpenAI (drop-in replacement)
# - ✅ Integração automática com orquestrador AION
# - ✅ Modelo próprio (sem censura)
# - ✅ Latência baixa (~2s por resposta)

# %% [code]
# ==============================================================================
# SEÇÃO 1: Configuração Inicial
# ==============================================================================

from google.colab import drive
drive.mount('/content/drive')

import os
import torch

# Verificar GPU disponível
if torch.cuda.is_available():
    gpu_name = torch.cuda.get_device_name(0)
    print(f"✓ GPU detectada: {gpu_name}")
    print(f"✓ VRAM disponível: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
else:
    print("❌ ERRO: GPU não disponível!")
    print("   Vá em Runtime > Change runtime type > GPU")
    raise RuntimeError("GPU não disponível")

# %% [code]
# ==============================================================================
# SEÇÃO 2: Instalação de Dependências
# ==============================================================================

!pip install -q fastapi uvicorn pyngrok transformers peft torch accelerate bitsandbytes sentencepiece

print("✓ Dependências instaladas!")

# %% [code]
# ==============================================================================
# SEÇÃO 3: Carregar Modelo Fine-Tuned
# ==============================================================================

from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel, PeftConfig

# Caminho dos adaptadores LoRA
LORA_PATH = "/content/drive/MyDrive/aion/lora_adapters/latest"

# Verificar se adaptadores existem
if not os.path.exists(LORA_PATH):
    print("❌ ERRO: Adaptadores LoRA não encontrados!")
    print(f"   Caminho esperado: {LORA_PATH}")
    print(f"\n   Execute primeiro o notebook COLAB_FINE_TUNING.py")
    raise FileNotFoundError(LORA_PATH)

print(f"📦 Carregando modelo fine-tuned de {LORA_PATH}...")

# Carregar config do LoRA
config = PeftConfig.from_pretrained(LORA_PATH)

# Configuração de quantização 4-bit
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

# Carregar modelo base
base_model = AutoModelForCausalLM.from_pretrained(
    config.base_model_name_or_path,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
)

# Carregar adaptadores LoRA
model = PeftModel.from_pretrained(base_model, LORA_PATH)
model.eval()  # Modo de inferência

# Carregar tokenizer
tokenizer = AutoTokenizer.from_pretrained(LORA_PATH)
tokenizer.pad_token = tokenizer.eos_token

print("✓ Modelo fine-tuned carregado com sucesso!")
print(f"✓ Modelo base: {config.base_model_name_or_path}")
print(f"✓ Adaptadores: {LORA_PATH}")

# %% [code]
# ==============================================================================
# SEÇÃO 4: Criar API FastAPI (Compatível com OpenAI)
# ==============================================================================

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import time
import json

app = FastAPI(title="AION Inference Server")

class Message(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    messages: List[Message]
    max_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9
    stream: bool = False

class ChatCompletionResponse(BaseModel):
    choices: List[dict]
    usage: dict
    model: str = "aion-llama3-8b-lora"

def generate_response(messages: List[Message], max_tokens: int, temperature: float, top_p: float) -> str:
    """Gerar resposta usando modelo fine-tuned"""
    
    # Formatar mensagens no template Alpaca
    conversation = ""
    for msg in messages:
        if msg.role == "system":
            conversation += f"### System:\n{msg.content}\n\n"
        elif msg.role == "user":
            conversation += f"### Instruction:\n{msg.content}\n\n"
        elif msg.role == "assistant":
            conversation += f"### Response:\n{msg.content}\n\n"
    
    # Adicionar prompt para próxima resposta
    conversation += "### Response:\n"
    
    # Tokenizar
    inputs = tokenizer(conversation, return_tensors="pt").to(model.device)
    
    # Gerar
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    
    # Decodificar
    full_response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    
    # Extrair apenas a última resposta
    response = full_response.split("### Response:")[-1].strip()
    
    return response

@app.get("/health")
async def health_check():
    """Health check para GPU orchestrator"""
    return {
        "status": "healthy",
        "model": "aion-llama3-8b-lora",
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none",
    }

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """
    Endpoint compatível com OpenAI Chat Completions API
    """
    try:
        start_time = time.time()
        
        # Gerar resposta
        response_text = generate_response(
            messages=request.messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
        )
        
        latency_ms = (time.time() - start_time) * 1000
        
        # Estimar tokens (aproximado)
        prompt_tokens = sum(len(m.content) // 4 for m in request.messages)
        completion_tokens = len(response_text) // 4
        
        return ChatCompletionResponse(
            choices=[{
                "message": {
                    "role": "assistant",
                    "content": response_text,
                },
                "finish_reason": "stop",
                "index": 0,
            }],
            usage={
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ReloadModelRequest(BaseModel):
    version: str
    job_id: int
    checkpoint_url: str
    lora_path: str

@app.post("/reload_model")
async def reload_model(request: ReloadModelRequest):
    """
    Hot reload model with new checkpoint (ZERO DOWNTIME)
    Called by AION after federated training completes
    
    IMPORTANT: checkpoint_url points to BINARY .pt file, not JSON!
    """
    global model, tokenizer
    
    try:
        print(f"\n🔄 [Hot Reload] Versão {request.version} (Job #{request.job_id})")
        print(f"   Checkpoint URL: {request.checkpoint_url}")
        print(f"   LoRA path: {request.lora_path}")
        
        # Download new checkpoint (BINARY .pt file)
        import requests
        import tempfile
        
        print("   📥 [1/4] Downloading checkpoint BINÁRIO (.pt)...")
        response = requests.get(request.checkpoint_url, timeout=30, stream=True)
        
        if response.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Failed to download checkpoint: HTTP {response.status_code}")
        
        # Save binary checkpoint to temp directory
        checkpoint_dir = f"/tmp/aion_checkpoint_job_{request.job_id}"
        os.makedirs(checkpoint_dir, exist_ok=True)
        
        checkpoint_file = os.path.join(checkpoint_dir, "checkpoint.pt")
        
        # Write binary file
        with open(checkpoint_file, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        
        print(f"   ✓ Checkpoint binário salvo em {checkpoint_file}")
        print(f"   ✓ Tamanho: {os.path.getsize(checkpoint_file) / 1024 / 1024:.1f} MB")
        
        # If lora_path is a remote URL, use it directly
        # If it's a local path, try to infer from checkpoint
        if request.lora_path.startswith('http'):
            lora_location = request.lora_path
            print(f"   🌐 [2/4] LoRA path é remoto: {lora_location}")
        else:
            # For local paths, use the checkpoint directory
            lora_location = checkpoint_dir
            print(f"   📁 [2/4] Usando checkpoint local: {lora_location}")
        
        print(f"   🔧 [3/4] Recarregando LoRA adapters...")
        
        # Reload LoRA adapters WITHOUT restarting server
        from peft import PeftModel, PeftConfig
        
        try:
            # Try to load config from lora_location
            new_config = PeftConfig.from_pretrained(lora_location)
            
            # Reload model with new adapters
            model = PeftModel.from_pretrained(base_model, lora_location)
            model.eval()
            
            # Reload tokenizer
            tokenizer = AutoTokenizer.from_pretrained(lora_location)
            tokenizer.pad_token = tokenizer.eos_token
            
            print(f"   ✅ [4/4] Modelo recarregado com sucesso!")
            print(f"   📦 Version: {request.version}")
            print(f"   🎯 Job ID: {request.job_id}")
            print(f"   💾 Checkpoint: {checkpoint_file}")
            
            return {
                "status": "success",
                "version": request.version,
                "job_id": request.job_id,
                "checkpoint_size_mb": os.path.getsize(checkpoint_file) / 1024 / 1024,
                "message": "Model reloaded successfully (zero downtime)"
            }
            
        except Exception as load_error:
            # If loading from checkpoint fails, keep old model
            print(f"   ⚠️  Falha ao carregar LoRA: {load_error}")
            print(f"   💡 Mantendo modelo anterior ativo (sem downtime)")
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to load LoRA adapters: {str(load_error)}"
            )
        
    except Exception as e:
        print(f"   ❌ Hot reload failed: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Hot reload failed: {str(e)}")

print("✓ API FastAPI configurada!")
print("✓ Endpoints:")
print("   - GET  /health")
print("   - POST /v1/chat/completions")
print("   - POST /reload_model (Hot Reload)")

# %% [code]
# ==============================================================================
# SEÇÃO 5: Expor via Ngrok
# ==============================================================================

from pyngrok import ngrok
import nest_asyncio

# Permitir uvicorn rodar em notebook
nest_asyncio.apply()

# Configurar Ngrok (obtenha token grátis em ngrok.com)
NGROK_AUTH_TOKEN = "SEU_TOKEN_AQUI"  # ⚠️ SUBSTITUA PELO SEU TOKEN!

ngrok.set_auth_token(NGROK_AUTH_TOKEN)

# Criar túnel
public_url = ngrok.connect(8000)
print("\n" + "="*80)
print("🌐 SERVIDOR PÚBLICO ATIVO!")
print("="*80)
print(f"\n🔗 URL pública: {public_url}")
print(f"\n📋 Para registrar no AION, execute:")
print(f"\n   curl -X POST {public_url.replace('https://', 'https://')}/api/gpu/register \\")
print(f"     -H 'Content-Type: application/json' \\")
print(f"     -d '{json.dumps({'provider': 'colab', 'ngrok_url': str(public_url)})}'\n")
print("="*80 + "\n")

# %% [code]
# ==============================================================================
# SEÇÃO 6: Iniciar Servidor FastAPI
# ==============================================================================

import uvicorn
import threading

def run_server():
    """Rodar servidor em thread separada"""
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

# Iniciar servidor em background
server_thread = threading.Thread(target=run_server, daemon=True)
server_thread.start()

print("🚀 Servidor iniciado!")
print("⏳ Aguardando requisições...")
print("\n" + "="*80)
print("📊 MONITORAMENTO")
print("="*80)
print("\nServidor rodará até:")
print("  - Você interromper o notebook (Runtime > Interrupt)")
print("  - Colab hibernar por inatividade (~90min)")
print("  - Limite de 12h da sessão ser atingido")
print("\n💡 Dica: Mantenha esta janela aberta para evitar hibernação")
print("="*80)

# %% [code]
# ==============================================================================
# SEÇÃO 7: Registrar no AION (Automático com Metadados Completos)
# ==============================================================================

import requests
import getpass

# URL do AION no Replit
AION_URL = "https://sua-url-replit.repl.co"  # ⚠️ SUBSTITUA!

# Coletar informações da GPU
gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none"
vram_gb = torch.cuda.get_device_properties(0).total_memory / 1e9 if torch.cuda.is_available() else 0

# Account ID (email da conta Google Colab)
try:
    # Tenta pegar o email do usuário do Colab
    account_id = getpass.getuser() + "@gmail.com"  # Placeholder
except:
    account_id = "colab-user"

print("\n" + "="*80)
print("📡 REGISTRANDO GPU NO AION")
print("="*80)

try:
    # Registrar GPU com metadados completos
    registration_payload = {
        "provider": "colab",
        "accountId": account_id,
        "ngrokUrl": str(public_url),
        "capabilities": {
            "tor_enabled": False,  # Tor não disponível no Colab por padrão
            "model": "llama-3-8b-lora",
            "gpu": gpu_name,
            "vram_gb": round(vram_gb, 1),
            "max_concurrent": 2  # T4 pode processar 2 requisições simultâneas
        }
    }
    
    print(f"\n📦 Enviando metadados:")
    print(f"   - Provider: colab")
    print(f"   - Account: {account_id}")
    print(f"   - GPU: {gpu_name} ({vram_gb:.1f} GB VRAM)")
    print(f"   - Model: llama-3-8b-lora")
    print(f"   - Ngrok URL: {public_url}")
    
    response = requests.post(
        f"{AION_URL}/api/gpu/register",
        json=registration_payload,
        timeout=10
    )
    
    if response.status_code == 200:
        result = response.json()
        print("\n✅ GPU REGISTRADA COM SUCESSO!")
        print(f"   Worker ID: {result.get('worker', {}).get('id', 'N/A')}")
        print(f"   Status: {result.get('worker', {}).get('status', 'pending')}")
        print(f"\n🎉 O AION agora pode usar esta GPU automaticamente via load balancing!")
        print(f"   Health checks serão executados a cada 30 segundos.")
    else:
        print(f"\n⚠️  ERRO ao registrar GPU (HTTP {response.status_code}):")
        print(f"   {response.text}")
        print(f"\n📋 Registre manualmente com:")
        print(f"\n   curl -X POST {AION_URL}/api/gpu/register \\")
        print(f"     -H 'Content-Type: application/json' \\")
        print(f"     -d '{json.dumps(registration_payload, indent=2)}'")
        
except Exception as e:
    print(f"\n⚠️  EXCEÇÃO ao registrar automaticamente:")
    print(f"   {type(e).__name__}: {e}")
    print(f"\n📋 Registre manualmente quando o AION estiver online.")
    print(f"   A GPU ainda funcionará localmente para testes.")

print("="*80 + "\n")

# %% [code]
# ==============================================================================
# SEÇÃO 8: Teste Local
# ==============================================================================

print("\n" + "="*80)
print("🧪 TESTE LOCAL")
print("="*80 + "\n")

# Testar endpoint local
test_request = {
    "messages": [
        {"role": "user", "content": "Olá! Como você está?"}
    ],
    "max_tokens": 128,
    "temperature": 0.7,
}

import requests
response = requests.post(
    "http://localhost:8000/v1/chat/completions",
    json=test_request,
)

if response.status_code == 200:
    data = response.json()
    print(f"✅ Teste bem-sucedido!")
    print(f"\nPrompt: {test_request['messages'][0]['content']}")
    print(f"Resposta: {data['choices'][0]['message']['content']}")
    print(f"Tokens: {data['usage']['total_tokens']}")
else:
    print(f"❌ Erro: {response.text}")

print("\n" + "="*80)
print("\n✅ SERVIDOR FUNCIONANDO!")
print("\n🎉 Seu modelo próprio está servindo respostas via GPU do Colab!")
print("\n💡 Mantenha este notebook rodando para que o AION possa usar a GPU.")
print("\n" + "="*80)

# %% [code]
# ==============================================================================
# SEÇÃO 9: Manter Notebook Ativo (Anti-Hibernação)
# ==============================================================================

import time
from datetime import datetime

print("\n🔄 Modo anti-hibernação ativado")
print("   O notebook enviará requests periódicos para evitar desconexão\n")

def keep_alive():
    """Fazer requests periódicos para evitar hibernação"""
    count = 0
    while True:
        try:
            # Health check a cada 5 minutos
            response = requests.get("http://localhost:8000/health", timeout=5)
            count += 1
            
            if count % 12 == 0:  # A cada hora
                print(f"[{datetime.now().strftime('%H:%M:%S')}] ✓ Servidor ativo ({count*5} min uptime)")
            
            time.sleep(300)  # 5 minutos
            
        except Exception as e:
            print(f"⚠️  Health check falhou: {e}")
            time.sleep(60)

# Rodar keep-alive (bloqueante - manterá célula executando)
keep_alive()
