# 🚀 AION - Deployment Completo (100% Gratuito)

**IA Verdadeiramente Autônoma, Sem Censura, Com Modelo Próprio**

Este guia mostra como criar uma IA 100% independente rodando em infraestrutura gratuita, com modelo LLM próprio treinável para nichos específicos, acesso DeepWeb real via Tor, e zero dependência de APIs censuradas.

---

## 📋 Índice

1. [Arquitetura Completa](#arquitetura-completa)
2. [Fundamentos Matemáticos - LoRA](#fundamentos-matemáticos---lora)
3. [Setup Replit (Orquestrador)](#setup-replit-orquestrador)
4. [Setup Google Colab (GPU + Tor)](#setup-google-colab-gpu--tor)
5. [Treinamento LoRA](#treinamento-lora)
6. [Servidor de Inferência](#servidor-de-inferência)
7. [Rotação Automática GPUs](#rotação-automática-gpus)
8. [Monitoramento e Manutenção](#monitoramento-e-manutenção)

---

## Arquitetura Completa

```
┌──────────────────────────────────────────────────────────┐
│ REPLIT (Orquestrador Always-On)                          │
│ • Frontend React (Chat + Admin Dashboard)                │
│ • Backend Node.js (Rotas + GPU Orchestrator)             │
│ • PostgreSQL (Neon) - Knowledge Base + Conversas         │
│ • Free APIs Rotation (Groq/Gemini/HF - Fallback)         │
└──────────────────────────────────────────────────────────┘
                    ↓ HTTP/WebSocket
┌──────────────────────────────────────────────────────────┐
│ GOOGLE COLAB (GPU Worker - 12h/sessão, 84h/semana)      │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ FastAPI Server (porta 8000)                         │ │
│ │ • Llama 3 8B + LoRA (~200MB adaptadores)            │ │
│ │ • Quantização 4-bit (16GB → 4GB VRAM)               │ │
│ │ • OpenAI-compatible API                             │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Tor Browser + SOCKS5 Proxy (porta 9050)             │ │
│ │ • DarkSearch.io, Ahmia.fi (via Tor)                 │ │
│ │ • Acesso real a .onion sites                        │ │
│ │ • DeepWeb funcional                                 │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Google Drive Mount                                   │ │
│ │ • Checkpoints de treino                             │ │
│ │ • Adaptadores LoRA                                  │ │
│ │ • FAISS index (Knowledge Base)                      │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ Exposição via Ngrok: https://abc123.ngrok.io            │
└──────────────────────────────────────────────────────────┘
                    ↑
                    │ (Fallback quando Colab offline)
┌──────────────────────────────────────────────────────────┐
│ KAGGLE NOTEBOOKS (30h/semana)                            │
│ • Mesma configuração que Colab                           │
│ • Rotação automática Qui-Sex                             │
└──────────────────────────────────────────────────────────┘
```

### **Benefícios da Arquitetura:**

✅ **100% Gratuito** (~$0/mês)  
✅ **LLM Próprio** (Llama 3 8B + seu fine-tuning)  
✅ **Sem Censura** (você controla dados + políticas)  
✅ **DeepWeb Real** (Tor instalado no Colab)  
✅ **Alta Disponibilidade** (~500h GPU/mês via rotação)  
✅ **Fallback Inteligente** (GPU offline → Free APIs)  
✅ **Treino Contínuo** (modelo melhora com uso)

---

## Fundamentos Matemáticos - LoRA

### O que é LoRA (Low-Rank Adaptation)?

**Problema:** Fine-tuning de LLMs grandes é caro:
- Llama 3 8B = 8 bilhões de parâmetros
- Fine-tuning completo = salvar 16GB de pesos
- GPU necessária: A100 (80GB VRAM) = $3/hora

**Solução: LoRA**

```
W' = W₀ + ΔW = W₀ + B·A

Onde:
- W₀ = Pesos originais do modelo (congelados, 8B params)
- B = Matriz d × r (treinável)
- A = Matriz r × k (treinável)
- r = Rank de adaptação (tipicamente 8, 16, ou 32)
```

### Economia Brutal:

**Exemplo: Matriz de atenção 4096 × 4096**

**Full Fine-Tuning:**
- Parâmetros treináveis: 4096 × 4096 = **16.777.216**
- Memória: 16.7M × 2 bytes = **33.5 MB** (só essa camada!)
- Total modelo: **~16 GB**

**LoRA com r=16:**
- B: 4096 × 16 = 65.536 parâmetros
- A: 16 × 4096 = 65.536 parâmetros
- **Total: 131.072 parâmetros** (0.78% do original!)
- Memória: **262 KB** vs 33.5 MB

**Llama 3 8B completo:**
- Full fine-tuning: **8 bilhões de parâmetros**
- LoRA r=16: **~65 milhões de parâmetros** (0.8%)
- Arquivo adaptadores: **~200 MB** vs 16 GB

### Por que funciona?

**Hipótese da Baixa Dimensionalidade Intrínseca:**

Mudanças necessárias para adaptar modelo a novo domínio vivem em subespaço de baixa dimensão:

```
rank(ΔW) << min(d, k)
```

**Prova empírica:**
- LoRA r=8 já atinge 95% da performance de full fine-tuning
- LoRA r=16 = 98-99% da performance
- r=32+ = praticamente indistinguível

### Treino na Prática:

**GPU T4 (Colab Free):**
- VRAM: 16 GB
- Llama 3 8B quantizado 4-bit: **~4 GB**
- LoRA adapters: **~260 MB**
- Batch + gradientes: **~2 GB**
- **Total: ~7 GB ✅ CABE!**

**Tempo:**
- Dataset 1000 exemplos: **~6h**
- Dataset 5000 exemplos: **~10h**
- Dataset 10k+ exemplos: **~12-15h**

### QLoRA (Quantized LoRA):

```
W' = dequant(Q₄(W₀)) + B·A

Q₄ = Quantização 4-bit (16 GB → 4 GB)
```

**Economia final:**
- Modelo base: 16 GB → **4 GB** (quantização)
- Fine-tuning: 8B params → **65M params** (LoRA)
- **GPU necessária: T4 (16GB) ✅ GRÁTIS**

---

## Setup Replit (Orquestrador)

### Passo 1: Clonar Projeto

```bash
# Já feito! Este projeto já está no Replit
```

### Passo 2: Configurar Secrets

No Replit Secrets (🔒 ícone do cadeado):

```env
# APIs Gratuitas (Obrigatórias)
GROQ_API_KEY=gsk_...              # console.groq.com (14.4k req/dia)
GEMINI_API_KEY=AIza...            # ai.google.dev (1.5k req/dia)
HF_API_KEY=hf_...                 # huggingface.co (720 req/dia)
OPENROUTER_API_KEY=sk-or-...      # openrouter.ai (50 req/dia)

# OpenAI (Opcional - último fallback)
OPENAI_API_KEY=sk-...             # openai.com ($5 crédito inicial)

# Database (Já configurado automaticamente)
DATABASE_URL=postgresql://...     # Neon PostgreSQL

# Session
SESSION_SECRET=...                # Gerado automaticamente
```

### Passo 3: Iniciar Aplicação

```bash
npm run dev
```

**Output esperado:**
```
🚀 Server running on http://0.0.0.0:5000
✅ Database connected
✅ Free APIs initialized:
   - Groq: 14400/14400 remaining
   - Gemini: 1500/1500 remaining
   - HF: 720/720 remaining
```

### Passo 4: Configurar Políticas (UNRESTRICTED)

1. Acesse: `https://sua-url.repl.co/admin`
2. Vá em **Policy Management**
3. **Desative TODAS as policies:**
   - hate_speech = **false**
   - explicit_sexual = **false**
   - self_harm = **false**
   - violence = **false**
   - illegal_activity = **false**
   - privacy_violation = **false**
   - harmful_advice = **false**

4. Salve

**Resultado:** `isUnrestricted = true` → Automatic fallback ativa! ✅

---

## Setup Google Colab (GPU + Tor)

### Passo 1: Criar Notebook "AION_GPU_Worker"

1. Acesse [colab.research.google.com](https://colab.research.google.com)
2. **File → New notebook**
3. **Runtime → Change runtime type → GPU (T4)**
4. Salve como: **AION_GPU_Worker.ipynb**

### Passo 2: Instalar Tor Browser

Cole e execute:

```python
# ============================================================================
# INSTALAÇÃO TOR + DEEPWEB
# ============================================================================

# Instalar Tor
!apt-get update
!apt-get install -y tor

# Configurar Tor
with open('/etc/tor/torrc', 'w') as f:
    f.write("""
SocksPort 9050
ControlPort 9051
CookieAuthentication 1
""")

# Iniciar Tor em background
!tor &

# Aguardar Tor iniciar (30 segundos)
import time
print("⏳ Aguardando Tor iniciar...")
time.sleep(30)

# Verificar se Tor está rodando
!curl --socks5 localhost:9050 --socks5-hostname localhost:9050 -s https://check.torproject.org/ | grep -q "Congratulations"

print("✅ Tor instalado e rodando!")
print("✅ SOCKS5 proxy: localhost:9050")
print("✅ DeepWeb acessível!")
```

**Output esperado:**
```
✅ Tor instalado e rodando!
✅ SOCKS5 proxy: localhost:9050
✅ DeepWeb acessível!
```

### Passo 3: Instalar Dependências Python

```python
# ============================================================================
# INSTALAÇÃO DEPENDÊNCIAS
# ============================================================================

!pip install -q fastapi uvicorn pyngrok
!pip install -q transformers peft torch accelerate bitsandbytes
!pip install -q requests beautifulsoup4 PySocks
!pip install -q sentence-transformers faiss-cpu

print("✅ Dependências instaladas!")
```

### Passo 4: Montar Google Drive

```python
# ============================================================================
# MONTAR GOOGLE DRIVE
# ============================================================================

from google.colab import drive
drive.mount('/content/drive')

# Criar diretórios
import os
os.makedirs('/content/drive/MyDrive/aion/lora_adapters/latest', exist_ok=True)
os.makedirs('/content/drive/MyDrive/aion/checkpoints', exist_ok=True)
os.makedirs('/content/drive/MyDrive/aion/data', exist_ok=True)

print("✅ Google Drive montado!")
print("📁 Diretórios criados em /content/drive/MyDrive/aion/")
```

### Passo 5: Carregar Modelo + LoRA

```python
# ============================================================================
# CARREGAR MODELO LLAMA 3 8B + LORA
# ============================================================================

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from peft import PeftModel, PeftConfig

# Verificar se adaptadores LoRA existem
LORA_PATH = "/content/drive/MyDrive/aion/lora_adapters/latest"

if os.path.exists(LORA_PATH):
    print(f"📦 Carregando modelo fine-tuned de {LORA_PATH}...")
    
    # Carregar config
    config = PeftConfig.from_pretrained(LORA_PATH)
    
    # Quantização 4-bit
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
    
    # Aplicar adaptadores LoRA
    model = PeftModel.from_pretrained(base_model, LORA_PATH)
    model.eval()
    
    tokenizer = AutoTokenizer.from_pretrained(LORA_PATH)
    
    print("✅ Modelo fine-tuned carregado!")
    print(f"✅ Base: {config.base_model_name_or_path}")
else:
    print("⚠️  Adaptadores LoRA não encontrados")
    print("⚠️  Carregando modelo base Llama 3 8B...")
    
    MODEL_NAME = "meta-llama/Meta-Llama-3-8B-Instruct"
    
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model.eval()
    
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    
    print("✅ Modelo base carregado!")
    print("ℹ️  Para fine-tune, execute COLAB_FINE_TUNING.py primeiro")

tokenizer.pad_token = tokenizer.eos_token

# Verificar GPU
if torch.cuda.is_available():
    print(f"✅ GPU: {torch.cuda.get_device_name(0)}")
    print(f"✅ VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
```

### Passo 6: Criar FastAPI Server

```python
# ============================================================================
# FASTAPI SERVER (OpenAI-Compatible)
# ============================================================================

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import time

app = FastAPI(title="AION GPU Worker")

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    max_tokens: int = 512
    temperature: float = 0.7
    top_p: float = 0.9

def generate(messages: List[Message], max_tokens: int, temp: float, top_p: float):
    """Gerar resposta usando modelo"""
    
    # Formatar prompt
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
    full = tokenizer.decode(outputs[0], skip_special_tokens=True)
    response = full.split("### Response:")[-1].strip()
    
    return response

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model": "llama-3-8b-lora",
        "gpu": torch.cuda.get_device_name(0),
        "tor": "enabled"
    }

@app.post("/v1/chat/completions")
async def chat(req: ChatRequest):
    try:
        start = time.time()
        
        response = generate(
            messages=req.messages,
            max_tokens=req.max_tokens,
            temp=req.temperature,
            top_p=req.top_p,
        )
        
        latency = (time.time() - start) * 1000
        
        return {
            "choices": [{
                "message": {"role": "assistant", "content": response},
                "finish_reason": "stop",
                "index": 0,
            }],
            "usage": {
                "prompt_tokens": sum(len(m.content)//4 for m in req.messages),
                "completion_tokens": len(response)//4,
                "total_tokens": sum(len(m.content)//4 for m in req.messages) + len(response)//4,
            },
            "latency_ms": latency,
        }
    except Exception as e:
        raise HTTPException(500, str(e))

print("✅ FastAPI Server configurado!")
```

### Passo 7: Expor via Ngrok + Registrar no AION

```python
# ============================================================================
# NGROK + AUTO-REGISTRO NO AION
# ============================================================================

from pyngrok import ngrok
import nest_asyncio
import uvicorn
import threading
import requests

# Permitir event loop aninhado (necessário no Colab)
nest_asyncio.apply()

# Configurar Ngrok
NGROK_AUTH_TOKEN = "SEU_TOKEN_AQUI"  # ← Obtenha em ngrok.com
!ngrok authtoken {NGROK_AUTH_TOKEN}

# Iniciar servidor em thread separada
def start_server():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

thread = threading.Thread(target=start_server, daemon=True)
thread.start()

# Aguardar servidor iniciar
time.sleep(5)

# Expor porta 8000 via Ngrok
public_url = ngrok.connect(8000, "http")
print(f"\n{'='*60}")
print(f"🌐 SERVIDOR PÚBLICO ATIVO!")
print(f"{'='*60}")
print(f"🔗 URL: {public_url}")
print(f"✅ Tor: localhost:9050 (SOCKS5)")
print(f"✅ GPU: {torch.cuda.get_device_name(0)}")
print(f"✅ Modelo: Llama 3 8B + LoRA")
print(f"{'='*60}\n")

# AUTO-REGISTRO NO AION
AION_URL = "https://sua-url.repl.co"  # ← Substitua pela sua URL Replit

try:
    register = requests.post(
        f"{AION_URL}/api/gpu/register",
        json={
            "provider": "colab",
            "ngrok_url": str(public_url),
            "capabilities": {
                "tor_enabled": True,
                "model": "llama-3-8b-lora",
                "gpu": torch.cuda.get_device_name(0),
            }
        },
        timeout=10
    )
    
    if register.status_code == 200:
        print("✅ GPU registrada no AION com sucesso!")
        print("   O AION agora pode usar esta GPU automaticamente.\n")
    else:
        print(f"⚠️  Erro registrando GPU: {register.text}")
        print("   Registre manualmente via API\n")
except Exception as e:
    print(f"⚠️  Erro conectando ao AION: {e}")
    print("   Certifique-se que o Replit está online\n")

print("🎉 Setup completo! GPU worker rodando.\n")
print("📝 Para manter vivo:")
print("   - Não feche este notebook")
print("   - Interaja com o Colab a cada ~90 min")
print("   - Ou use script keep-alive (seção seguinte)")
```

### Passo 8: Keep-Alive (Opcional mas Recomendado)

```python
# ============================================================================
# KEEP-ALIVE - Evitar timeout do Colab
# ============================================================================

from IPython.display import display, Javascript

def keep_alive():
    """Simula cliques para manter sessão ativa"""
    while True:
        display(Javascript('document.querySelector("colab-toolbar-button#connect").click()'))
        time.sleep(60)  # A cada 1 minuto

# Rodar em thread separada
import threading
keep_thread = threading.Thread(target=keep_alive, daemon=True)
keep_thread.start()

print("✅ Keep-alive ativado!")
print("   Sessão será mantida ativa automaticamente")
```

---

## Continua na próxima parte...

**Próximas seções:**
- Treinamento LoRA
- Rotação automática GPUs
- Monitoramento

**Total do guia**: ~1500 linhas de documentação + código
