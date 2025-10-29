# AION - All-in-One Colab Setup
# ================================
# Este script instala TUDO automaticamente:
# - Tor Browser + DeepWeb
# - Llama 3 8B + LoRA
# - FastAPI Server
# - Ngrok + Auto-registro
# - Keep-alive
#
# Basta executar e aguardar ~5 minutos!

print("""
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   🚀 AION - All-in-One GPU Worker Setup                 ║
║                                                          ║
║   Setup completo em ~5 minutos:                          ║
║   ✓ Tor Browser + DeepWeb                                ║
║   ✓ Llama 3 8B + LoRA                                    ║
║   ✓ FastAPI Server (OpenAI-compatible)                   ║
║   ✓ Ngrok + Auto-registro no AION                        ║
║   ✓ Keep-alive automático                                ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
""")

import os
import time
import sys

# ==============================================================================
# SEÇÃO 1: CONFIGURAÇÃO DO USUÁRIO
# ==============================================================================

print("\n📝 CONFIGURAÇÃO\n" + "="*60)

# URL do AION no Replit
AION_URL = input("Digite a URL do seu AION Replit (ex: https://xxx.repl.co): ").strip()
if not AION_URL.startswith("http"):
    AION_URL = "https://" + AION_URL

# Ngrok Auth Token
print("\n📌 Obtenha seu token Ngrok:")
print("   1. Acesse: https://dashboard.ngrok.com/get-started/your-authtoken")
print("   2. Copie o token (começa com '2')")
NGROK_TOKEN = input("\nDigite seu Ngrok Auth Token: ").strip()

print("\n✅ Configuração salva!")
print(f"   AION URL: {AION_URL}")
print(f"   Ngrok Token: {NGROK_TOKEN[:10]}...")

# ==============================================================================
# SEÇÃO 2: MONTAR GOOGLE DRIVE
# ==============================================================================

print("\n\n📂 MONTANDO GOOGLE DRIVE\n" + "="*60)

from google.colab import drive
drive.mount('/content/drive', force_remount=True)

# Criar diretórios
os.makedirs('/content/drive/MyDrive/aion/lora_adapters/latest', exist_ok=True)
os.makedirs('/content/drive/MyDrive/aion/checkpoints', exist_ok=True)
os.makedirs('/content/drive/MyDrive/aion/data', exist_ok=True)
os.makedirs('/content/drive/MyDrive/aion/cache', exist_ok=True)

print("✅ Google Drive montado!")
print("✅ Diretórios criados em /content/drive/MyDrive/aion/")

# ==============================================================================
# SEÇÃO 3: INSTALAR TOR
# ==============================================================================

print("\n\n🌐 INSTALANDO TOR BROWSER\n" + "="*60)

!apt-get update -qq > /dev/null 2>&1
!apt-get install -y -qq tor > /dev/null 2>&1

# Configurar Tor
with open('/etc/tor/torrc', 'w') as f:
    f.write("""
SocksPort 9050
ControlPort 9051
CookieAuthentication 1
""")

# Iniciar Tor
!tor > /tmp/tor.log 2>&1 &

print("⏳ Aguardando Tor iniciar (30s)...")
time.sleep(30)

# Verificar
import subprocess
result = subprocess.run(
    ["curl", "--socks5", "localhost:9050", "--socks5-hostname", "localhost:9050", 
     "-s", "https://check.torproject.org/"],
    capture_output=True,
    text=True
)

if "Congratulations" in result.stdout:
    print("✅ Tor instalado e funcionando!")
    print("✅ SOCKS5 proxy: localhost:9050")
    print("✅ DeepWeb acessível!")
else:
    print("⚠️  Tor instalado mas não verificado")
    print("   Continuando...")

# ==============================================================================
# SEÇÃO 4: INSTALAR DEPENDÊNCIAS PYTHON
# ==============================================================================

print("\n\n📦 INSTALANDO DEPENDÊNCIAS\n" + "="*60)

!pip install -q fastapi uvicorn pyngrok
!pip install -q transformers peft torch accelerate bitsandbytes sentencepiece
!pip install -q requests beautifulsoup4 PySocks lxml
!pip install -q sentence-transformers faiss-cpu
!pip install -q nest-asyncio

print("✅ Dependências instaladas!")

# ==============================================================================
# SEÇÃO 5: CARREGAR MODELO LLAMA 3 8B + LORA
# ==============================================================================

print("\n\n🤖 CARREGANDO MODELO LLAMA 3 8B\n" + "="*60)

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel, PeftConfig

# Verificar GPU
if not torch.cuda.is_available():
    print("❌ ERRO: GPU não disponível!")
    print("   Vá em Runtime > Change runtime type > GPU")
    sys.exit(1)

print(f"✅ GPU detectada: {torch.cuda.get_device_name(0)}")
print(f"✅ VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

# Caminho adaptadores LoRA
LORA_PATH = "/content/drive/MyDrive/aion/lora_adapters/latest"

# Quantização 4-bit
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
    bnb_4bit_use_double_quant=True,
)

if os.path.exists(f"{LORA_PATH}/adapter_config.json"):
    print(f"📦 Carregando modelo fine-tuned...")
    
    config = PeftConfig.from_pretrained(LORA_PATH)
    base_model = AutoModelForCausalLM.from_pretrained(
        config.base_model_name_or_path,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model = PeftModel.from_pretrained(base_model, LORA_PATH)
    tokenizer = AutoTokenizer.from_pretrained(LORA_PATH)
    
    print("✅ Modelo fine-tuned carregado!")
    print(f"✅ Base: {config.base_model_name_or_path}")
else:
    print("📦 Carregando modelo base (sem fine-tuning)...")
    print("ℹ️  Execute COLAB_FINE_TUNING.py para criar seu modelo personalizado")
    
    MODEL_NAME = "meta-llama/Meta-Llama-3-8B-Instruct"
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    print(f"✅ Modelo base carregado: {MODEL_NAME}")

model.eval()
tokenizer.pad_token = tokenizer.eos_token

# ==============================================================================
# SEÇÃO 6: CRIAR FASTAPI SERVER
# ==============================================================================

print("\n\n🔧 CONFIGURANDO FASTAPI SERVER\n" + "="*60)

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

app = FastAPI(
    title="AION GPU Worker",
    description="Llama 3 8B + LoRA + Tor",
    version="1.0.0"
)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    max_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9
    stream: bool = False

class DeepWebSearchRequest(BaseModel):
    query: str
    max_results: int = 10

def generate_response(messages: List[Message], max_tokens: int, temp: float, top_p: float):
    """Gerar resposta usando modelo"""
    
    # Formatar prompt Alpaca
    prompt = ""
    for msg in messages:
        if msg.role == "system":
            prompt += f"### System:\n{msg.content}\n\n"
        elif msg.role == "user":
            prompt += f"### Instruction:\n{msg.content}\n\n"
        elif msg.role == "assistant":
            prompt += f"### Response:\n{msg.content}\n\n"
    
    prompt += "### Response:\n"
    
    # Tokenizar
    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    
    # Gerar
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_tokens,
            temperature=temp,
            top_p=top_p,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )
    
    # Decodificar
    full_response = tokenizer.decode(outputs[0], skip_special_tokens=True)
    response = full_response.split("### Response:")[-1].strip()
    
    return response

@app.get("/health")
async def health_check():
    """Health check para GPU orchestrator"""
    return {
        "status": "healthy",
        "model": "llama-3-8b-lora",
        "gpu": torch.cuda.get_device_name(0),
        "tor_enabled": True,
        "provider": "colab"
    }

@app.post("/v1/chat/completions")
async def chat_completions(request: ChatRequest):
    """
    Endpoint compatível com OpenAI Chat Completions API
    """
    try:
        start_time = time.time()
        
        response_text = generate_response(
            messages=request.messages,
            max_tokens=request.max_tokens,
            temp=request.temperature,
            top_p=request.top_p,
        )
        
        latency_ms = (time.time() - start_time) * 1000
        
        # Estimar tokens
        prompt_tokens = sum(len(m.content) // 4 for m in request.messages)
        completion_tokens = len(response_text) // 4
        
        return {
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": response_text,
                },
                "finish_reason": "stop",
                "index": 0,
            }],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
            "latency_ms": latency_ms,
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/deepweb/search")
async def deepweb_search(request: DeepWebSearchRequest):
    """
    Busca DeepWeb via Tor
    """
    import requests
    from bs4 import BeautifulSoup
    
    # Configurar proxy SOCKS5
    proxies = {
        'http': 'socks5h://localhost:9050',
        'https': 'socks5h://localhost:9050'
    }
    
    try:
        # Buscar via Ahmia.fi (motor DeepWeb)
        search_url = f"https://ahmia.fi/search/?q={request.query}"
        
        response = requests.get(
            search_url,
            proxies=proxies,
            timeout=30,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        
        soup = BeautifulSoup(response.text, 'html.parser')
        results = []
        
        # Parse resultados (adaptável conforme estrutura do site)
        for item in soup.find_all('li', class_='result')[:request.max_results]:
            title = item.find('h4')
            url = item.find('a', href=True)
            snippet = item.find('p')
            
            if title and url:
                results.append({
                    "title": title.text.strip(),
                    "url": url['href'],
                    "snippet": snippet.text.strip() if snippet else "",
                    "is_onion": ".onion" in url['href']
                })
        
        return {
            "query": request.query,
            "results": results,
            "total": len(results),
            "tor_enabled": True
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DeepWeb search error: {str(e)}")

print("✅ FastAPI Server configurado!")
print("✅ Endpoints:")
print("   - GET  /health")
print("   - POST /v1/chat/completions")
print("   - POST /deepweb/search")

# ==============================================================================
# SEÇÃO 7: NGROK + AUTO-REGISTRO
# ==============================================================================

print("\n\n🌐 EXPONDO VIA NGROK + REGISTRANDO NO AION\n" + "="*60)

from pyngrok import ngrok
import nest_asyncio
import uvicorn
import threading
import requests as http_requests

# Permitir event loop aninhado
nest_asyncio.apply()

# Configurar Ngrok
!ngrok authtoken {NGROK_TOKEN}

# Iniciar servidor em background
def start_server():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="error")

server_thread = threading.Thread(target=start_server, daemon=True)
server_thread.start()

print("⏳ Aguardando servidor iniciar...")
time.sleep(5)

# Expor via Ngrok
public_url = ngrok.connect(8000, "http")

print(f"\n{'='*60}")
print(f"🎉 SETUP COMPLETO!")
print(f"{'='*60}")
print(f"🔗 URL Pública: {public_url}")
print(f"✅ Tor: localhost:9050 (SOCKS5)")
print(f"✅ GPU: {torch.cuda.get_device_name(0)}")
print(f"✅ Modelo: Llama 3 8B")
print(f"{'='*60}\n")

# AUTO-REGISTRO NO AION
print("📡 Registrando GPU no AION...")

try:
    register_response = http_requests.post(
        f"{AION_URL}/api/gpu/register",
        json={
            "provider": "colab",
            "ngrok_url": str(public_url),
            "capabilities": {
                "tor_enabled": True,
                "model": "llama-3-8b-lora",
                "gpu": torch.cuda.get_device_name(0),
                "vram_gb": torch.cuda.get_device_properties(0).total_memory / 1e9,
            }
        },
        timeout=15
    )
    
    if register_response.status_code == 200:
        print("✅ GPU registrada no AION com sucesso!")
        print("   O AION agora pode usar esta GPU automaticamente.\n")
    else:
        print(f"⚠️  Erro no registro: HTTP {register_response.status_code}")
        print(f"   Resposta: {register_response.text}")
        print("   Você pode registrar manualmente depois.\n")
        
except Exception as e:
    print(f"⚠️  Erro conectando ao AION: {e}")
    print("   Certifique-se que o Replit está online")
    print("   Você pode registrar manualmente depois.\n")

# ==============================================================================
# SEÇÃO 8: KEEP-ALIVE
# ==============================================================================

print("\n🔄 ATIVANDO KEEP-ALIVE\n" + "="*60)

from IPython.display import display, Javascript

def keep_alive_loop():
    """Manter sessão Colab ativa"""
    while True:
        display(Javascript('document.querySelector("colab-toolbar-button#connect").click()'))
        time.sleep(60)

keep_alive_thread = threading.Thread(target=keep_alive_loop, daemon=True)
keep_alive_thread.start()

print("✅ Keep-alive ativado!")
print("   Sessão será mantida ativa automaticamente\n")

# ==============================================================================
# FINALIZAÇÃO
# ==============================================================================

print("\n" + "="*60)
print("🎊 TUDO PRONTO!")
print("="*60)
print("\n📝 Próximos passos:")
print("   1. NÃO feche este notebook")
print("   2. Acesse seu AION Replit e teste!")
print("   3. O AION usará esta GPU automaticamente")
print("\n⏰ Duração: ~12h (sessão Colab)")
print("   Depois, execute novamente este script\n")
print("💡 Para treinar modelo próprio:")
print("   Execute o notebook COLAB_FINE_TUNING.py\n")

# Manter vivo
print("🔴 Aguardando requisições...")
print("   (Este script continuará rodando indefinidamente)")

while True:
    time.sleep(3600)  # Sleep por 1 hora
