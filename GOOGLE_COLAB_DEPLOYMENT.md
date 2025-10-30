# 🚀 AION - Google Colab Deployment Guide

## Rodando 100% GRATUITO com GPUs Google Colab

Este guia ensina como rodar o **AION** completamente GRÁTIS usando infraestrutura Google Colab com GPUs.

---

## 📋 Pré-requisitos

- Conta Google (gratuita)
- Google Colab (gratuito)
- Google Drive (para armazenar checkpoints)

---

## 🎯 Arquitetura para Colab

```
Google Colab (GPU Free Tier)
├── Backend Python
│   ├── FastAPI Server (porta 8000)
│   ├── RAG Service (FAISS + Embeddings)
│   ├── Agent Engine (ReAct + Tools)
│   └── Policy Enforcement
│
├── Frontend (Ngrok Tunnel)
│   └── React App servida via Vite
│
└── Storage
    ├── PostgreSQL (via ngrok ou Supabase Free)
    └── FAISS Vector Store (Google Drive mount)
```

---

## 🔧 Passos de Instalação

### 1. Criar Notebook no Colab

```python
# Instalar dependências
!pip install fastapi uvicorn faiss-cpu openai anthropic pandas numpy scipy python-multipart
!pip install beautifulsoup4 lxml requests pillow opencv-python-headless
!pip install drizzle-kit psycopg2-binary sqlalchemy

# Montar Google Drive (para armazenar checkpoints e FAISS index)
from google.colab import drive
drive.mount('/content/drive')

# Clonar repositório
!git clone https://github.com/SEU_USUARIO/AION.git
%cd AION
```

### 2. Configurar Variáveis de Ambiente

```python
import os

# OpenAI API Key (obtenha grátis em openai.com com $5 de crédito inicial)
os.environ['OPENAI_API_KEY'] = 'sk-...'

# Database URL (use Supabase free tier ou PostgreSQL local)
os.environ['DATABASE_URL'] = 'postgresql://...'

# Session secret
os.environ['SESSION_SECRET'] = 'your-secret-key-here'
```

### 3. Iniciar Backend FastAPI

```python
# Criar arquivo server_colab.py
server_code = '''
import sys
sys.path.append('/content/AION')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="AION API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routes
from server.routes import router
app.include_router(router)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
'''

with open('server_colab.py', 'w') as f:
    f.write(server_code)

# Rodar em background
!python server_colab.py &
```

### 4. Expor com Ngrok (para acesso externo)

```python
# Instalar pyngrok
!pip install pyngrok

from pyngrok import ngrok

# Expor porta 8000
public_url = ngrok.connect(8000)
print(f"🌐 Backend público em: {public_url}")
```

### 5. Rodar Frontend (opcional - pode usar Replit)

```python
# Instalar Node.js no Colab
!curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
!apt-get install -y nodejs

# Instalar dependências e rodar
!npm install
!npm run dev &

# Expor porta 5000 com ngrok
frontend_url = ngrok.connect(5000)
print(f"🎨 Frontend público em: {frontend_url}")
```

---

## 🧠 Otimizações para GPU Gratuita

### 1. FAISS com GPU (se disponível)

```python
import faiss

# Verificar GPU
if faiss.get_num_gpus() > 0:
    print(f"✅ {faiss.get_num_gpus()} GPU(s) disponível(is)")
    # Usar FAISS GPU
    index = faiss.IndexFlatL2(1536)  # OpenAI embedding dim
    gpu_index = faiss.index_cpu_to_gpu(faiss.StandardGpuResources(), 0, index)
else:
    print("⚠️  Usando FAISS CPU")
    index = faiss.IndexHNSWFlat(1536, 32)
```

### 2. Batch Processing de Embeddings

```python
# Processar embeddings em batches para economizar tokens
def batch_embed(texts, batch_size=100):
    embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i+batch_size]
        batch_embeddings = openai.Embedding.create(
            input=batch,
            model="text-embedding-ada-002"
        )
        embeddings.extend([e['embedding'] for e in batch_embeddings['data']])
    return embeddings
```

### 3. Cache de Respostas (economia de API calls)

```python
import pickle
from pathlib import Path

cache_dir = Path("/content/drive/MyDrive/AION_cache")
cache_dir.mkdir(exist_ok=True)

def cache_llm_response(prompt_hash, response):
    with open(cache_dir / f"{prompt_hash}.pkl", "wb") as f:
        pickle.dump(response, f)

def get_cached_response(prompt_hash):
    cache_file = cache_dir / f"{prompt_hash}.pkl"
    if cache_file.exists():
        with open(cache_file, "rb") as f:
            return pickle.load(f)
    return None
```

---

## 💾 Persistência no Google Drive

```python
# Salvar FAISS index no Drive
import pickle

drive_path = "/content/drive/MyDrive/AION_data"
os.makedirs(drive_path, exist_ok=True)

# Salvar index
faiss.write_index(index, f"{drive_path}/faiss_index.bin")

# Salvar metadados
with open(f"{drive_path}/metadata.pkl", "wb") as f:
    pickle.dump(metadata, f)

# Carregar na próxima sessão
index = faiss.read_index(f"{drive_path}/faiss_index.bin")
with open(f"{drive_path}/metadata.pkl", "rb") as f:
    metadata = pickle.load(f)
```

---

## 🔄 Auto-Restart (manter Colab rodando)

```python
# Adicionar este código para evitar timeout do Colab
from IPython.display import display, Javascript
import time

def keep_alive():
    while True:
        display(Javascript('document.querySelector("colab-toolbar-button#connect").click()'))
        time.sleep(60)

# Rodar em thread separada
import threading
thread = threading.Thread(target=keep_alive, daemon=True)
thread.start()
```

---

## 📊 Monitoramento de Recursos

```python
import psutil
import GPUtil

def print_resources():
    # CPU
    print(f"CPU: {psutil.cpu_percent()}%")
    
    # RAM
    ram = psutil.virtual_memory()
    print(f"RAM: {ram.percent}% ({ram.used/1e9:.1f}GB/{ram.total/1e9:.1f}GB)")
    
    # GPU
    gpus = GPUtil.getGPUs()
    if gpus:
        gpu = gpus[0]
        print(f"GPU: {gpu.load*100:.1f}% | Memória: {gpu.memoryUsed}MB/{gpu.memoryTotal}MB")

# Monitorar a cada 30 segundos
import time
while True:
    print_resources()
    time.sleep(30)
```

---

## 🎁 Recursos Gratuitos Complementares

1. **Database**: Supabase Free Tier (500MB)
2. **Object Storage**: Google Drive (15GB grátis)
3. **LLM API**: OpenAI ($5 crédito inicial) + Anthropic (Claude)
4. **Search API**: SerpAPI (100 queries/mês grátis)
5. **Vector DB**: FAISS (local, sem custo)

---

## ⚠️ Limitações do Colab Grátis

- **Timeout**: Sessão expira após 12h (use auto-restart)
- **GPU**: Disponibilidade variável (não garantida)
- **RAM**: ~12GB (GPU tier) ou ~25GB (CPU tier)
- **Disco**: ~100GB temporário

### Solução: Salvar tudo no Drive

```python
# Checkpoint a cada hora
import schedule

def save_checkpoint():
    faiss.write_index(index, f"{drive_path}/faiss_index.bin")
    print("✅ Checkpoint salvo!")

schedule.every(1).hours.do(save_checkpoint)
```

---

## 🚀 Script Completo de Inicialização

Copie e cole este código em um novo notebook Colab:

```python
# === AION - Colab Setup Completo ===

# 1. Instalar tudo
!pip install -q fastapi uvicorn faiss-cpu openai pandas numpy scipy
!pip install -q beautifulsoup4 lxml requests pillow pyngrok

# 2. Montar Drive
from google.colab import drive
drive.mount('/content/drive')

# 3. Configurar env
import os
os.environ['OPENAI_API_KEY'] = 'sua-chave-aqui'
os.environ['DATABASE_URL'] = 'postgresql://sua-db-aqui'

# 4. Clonar repo
!git clone https://github.com/SEU_USUARIO/AION.git
%cd AION

# 5. Iniciar backend
!python server_colab.py &

# 6. Expor com ngrok
from pyngrok import ngrok
public_url = ngrok.connect(8000)
print(f"🎉 AION rodando em: {public_url}")
```

---

## 📞 Suporte

Para dúvidas sobre deployment no Google Colab, consulte a documentação completa ou abra uma issue no repositório.

**AION - Autonomous AI System** 🚀
