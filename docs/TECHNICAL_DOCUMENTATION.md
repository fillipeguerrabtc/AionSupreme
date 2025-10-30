# AION - Documentação Técnica Completa
## Autonomous AI System

**Status:** Production-Ready MVP  
**Última Atualização:** 30 de Janeiro de 2025  
**Baseado em:** 19 PDFs Técnicos + Documentação de APIs/GPUs Gratuitas

---

## 📋 ÍNDICE

1. [Fundamentos Matemáticos](#fundamentos-matemáticos)
2. [Arquitetura de Redes Neurais](#arquitetura-de-redes-neurais)
3. [Sistema RAG Avançado](#sistema-rag-avançado)
4. [Treinamento e LoRA](#treinamento-e-lora)
5. [Infraestrutura Gratuita](#infraestrutura-gratuita)
6. [APIs de IA Gratuitas](#apis-de-ia-gratuitas)
7. [Implementação Completa](#implementação-completa)

---

## 1. FUNDAMENTOS MATEMÁTICOS

### 1.1 Transformer com Atenção Escalonada

**Projeções QKV:**
```
Q = XW_Q,  K = XW_K,  V = XW_V
onde X ∈ ℝ^(T×d), W_Q, W_K, W_V ∈ ℝ^(d×d)
```

**Atenção Escalonada:**
```
Attn(Q,K,V) = Softmax(QK^T / √d_h + M) V

onde:
- M = máscara causal (M_ij = 0 se j≤i, -∞ se j>i)
- d_h = dimensão por cabeça
- √d_h previne saturação da softmax
```

**Multi-Cabeças (h cabeças):**
```
Q = [Q_1; Q_2; ...; Q_h]
H_i = Softmax(Q_i K_i^T / √d_h + M) V_i
Output = [H_1; H_2; ...; H_h] W_O
```

### 1.2 RoPE (Rotary Positional Embedding)

**Forma Complexa:**
```
z_i(t) = x_i(t) · e^(jθ_i(t))
θ_i(t) = t · ω_i
ω_i = base^(2i/d)  (base = 10000)
```

**Forma Real:**
```
[x~_2i  ]   [cos(θ_i)  -sin(θ_i)] [x_2i  ]
[x~_2i+1] = [sin(θ_i)   cos(θ_i)] [x_2i+1]
```

**Aplicação:**
- Aplica-se apenas em Q e K
- Preserva invariâncias temporais
- Melhora extrapolação para contextos longos

### 1.3 Mixture-of-Experts (MoE)

**Definição:**
```
g(x) = Softmax(W_g x)  ∈ ℝ^E
K(x) = Top-k(g(x))
y = Σ_{i∈K(x)} g_i(x) f_i(x)

onde:
- E = número de especialistas
- k = especialistas ativos por token
- f_i = FFN do especialista i
```

**Perda de Balanceamento:**
```
L_bal = λ · Σ_{i=1}^E p_i²

onde p_i = (1/BT) Σ_{b,t} 𝕀{i ∈ K(x_bt)}
```

**Objetivo:** Evitar colapso em poucos experts

### 1.4 LoRA (Low-Rank Adaptation)

**Parametrização:**
```
Ŵ = W + ΔW
ΔW = B·A

onde:
- B ∈ ℝ^(d_out × r)
- A ∈ ℝ^(r × d_in)
- r << min(d_out, d_in)
```

**Gradiente:**
```
∇_A L = B^T ∇_Ŵ L
∇_B L = ∇_Ŵ L A^T
```

**Vantagens:**
- Apenas A e B são treináveis
- W permanece congelado
- Redução dramática de parâmetros

### 1.5 Cross-Entropy Loss (LM Causal)

```
L_LM = -(1/T) Σ_{t=1}^T log P_θ(w_t | w_{<t})
```

**Com Label Smoothing:**
```
y = (1-ε)·1_{w_t} + ε/V
```

### 1.6 AdamW (Optimizer)

```
m_t = β_1 m_{t-1} + (1-β_1) g_t
v_t = β_2 v_{t-1} + (1-β_2) g_t²
θ ← θ - α·(m_t/√(v_t+ϵ)) - α·λ·θ

onde:
- α = learning rate (com warmup + cosine decay)
- λ = weight decay
- β_1 = 0.9, β_2 = 0.95 (typical)
```

**Schedule:**
```
Warmup:  α_t = α_max · (t/T_w)
Cosine:  α_t = α_min + 0.5(α_max-α_min)(1+cos(π(t-T_w)/T))
```

### 1.7 PPO (Proximal Policy Optimization)

**Ratio:**
```
r_t(θ) = π_θ(y_t|x) / π_θ_old(y_t|x)
```

**Loss:**
```
L_PPO = 𝔼[min(r_t Â_t, clip(r_t, 1-ϵ, 1+ϵ) Â_t)]
```

**Com KL Penalty:**
```
L = 𝔼[-log π_θ(y|x) R(x,y)] + β KL(π_θ || π_0)
```

### 1.8 Leis de Escalonamento (Chinchilla)

```
L(N,D) ≈ L_∞ + a/N^α + b/D^β

onde:
- N = parâmetros
- D = tokens de treino
- α, β ≈ 0.3-0.4
```

**Insight:** Para orçamento fixo (FLOPs ∝ N·D), existe um trade-off ótimo (N*, D*)

---

## 2. ARQUITETURA DE REDES NEURAIS

### 2.1 FlashAttention (Softmax Estável por Blocos)

**Algoritmo:**
```python
# Softmax estável
m = max(a)
softmax(a_i) = exp(a_i - m) / Σ_j exp(a_j - m)

# Por blocos (Q_b, K_b, V_b):
for Q_b:
    for K_b':
        S = Q_b K_b'^T / √d_h
        m_new = max(m_old, max(S))
        ℓ = ℓ·exp(m_old - m_new) + Σ exp(S - m_new)
        PV accumulate com re-escalonamento
    H_b = PV / ℓ
```

**Complexidade:**
- Compute: O(T² d_h / B)
- Memory: O(T d_h)  ← grande ganho!

### 2.2 KV-Cache (Inferência Auto-Regressiva)

```python
# Geração token t:
K_cache = [K_1, K_2, ..., K_{t-1}]
V_cache = [V_1, V_2, ..., V_{t-1}]

# Apenas compute K_t, V_t
K_cache.append(K_t)
V_cache.append(V_t)

# Atenção de Q_t contra histórico
Attn(Q_t, K_cache, V_cache)
```

**Redução:** O(T²) → O(T) por step

### 2.3 Código: Atenção Causal com RoPE

```python
class MultiHeadSelfAttention(nn.Module):
    def __init__(self, d_model, n_heads, rope=None, dropout=0.0):
        super().__init__()
        assert d_model % n_heads == 0
        self.d_head = d_model // n_heads
        self.n_heads = n_heads
        self.wq = nn.Linear(d_model, d_model, bias=False)
        self.wk = nn.Linear(d_model, d_model, bias=False)
        self.wv = nn.Linear(d_model, d_model, bias=False)
        self.wo = nn.Linear(d_model, d_model, bias=False)
        self.dropout = nn.Dropout(dropout)
        self.rope = rope
    
    def forward(self, x, mask=None):
        B, T, C = x.shape
        # Q, K, V projections
        q = self.wq(x).view(B,T,self.n_heads,self.d_head).transpose(1,2)
        k = self.wk(x).view(B,T,self.n_heads,self.d_head).transpose(1,2)
        v = self.wv(x).view(B,T,self.n_heads,self.d_head).transpose(1,2)
        
        # Apply RoPE
        if self.rope:
            pos = torch.arange(T, device=x.device)
            q = self.rope(q, pos)
            k = self.rope(k, pos)
        
        # Scaled dot-product attention
        att = (q @ k.transpose(-2,-1)) / math.sqrt(self.d_head)
        if mask is not None:
            att = att.masked_fill(mask == 0, float('-inf'))
        w = torch.softmax(att, dim=-1)
        w = self.dropout(w)
        
        o = (w @ v).transpose(1,2).contiguous().view(B,T,C)
        return self.wo(o)
```

### 2.4 Código: MoE com Top-K Gating

```python
class MoE(nn.Module):
    def __init__(self, d_model, d_ff, num_experts=16, top_k=2, lambda_bal=1e-3):
        super().__init__()
        self.num_experts = num_experts
        self.top_k = top_k
        self.lambda_bal = lambda_bal
        self.experts = nn.ModuleList([
            Expert(d_model, d_ff) for _ in range(num_experts)
        ])
        self.gate = nn.Linear(d_model, num_experts)
        self.register_buffer("usage", torch.zeros(num_experts))
    
    def forward(self, x):
        B, T, C = x.shape
        logits = self.gate(x)  # [B, T, E]
        probs = torch.softmax(logits, dim=-1)
        topv, topi = probs.topk(self.top_k, dim=-1)  # [B,T,k]
        
        out = torch.zeros_like(x)
        usage = torch.zeros(self.num_experts, device=x.device)
        
        for j in range(self.top_k):
            idx = topi[..., j]
            val = topv[..., j].unsqueeze(-1)
            for e in range(self.num_experts):
                mask = (idx == e)
                if mask.any():
                    xe = x[mask]
                    ye = self.experts[e](xe)
                    out[mask] += ye * val[mask]
                    usage[e] += mask.sum()
        
        # Balance loss
        p = usage / usage.sum().clamp_min(1)
        self.bal_loss = self.lambda_bal * self.num_experts * (p**2).sum()
        
        return out
```

---

## 3. SISTEMA RAG AVANÇADO

### 3.1 MMR (Maximal Marginal Relevance)

**Objetivo:** Diversidade + Relevância

```
MMR = λ·sim(q,d) - (1-λ)·max_{d'∈S} sim(d,d')

onde:
- q = query
- d = candidato
- S = documentos já selecionados
- λ = trade-off (típico: 0.7)
```

**Algoritmo:**
```python
def mmr_select(candidates, query_vec, k=8, lambda_=0.7):
    chosen = []
    remaining = candidates.copy()
    
    while len(chosen) < k and remaining:
        best_val = -1e9
        best_idx = 0
        
        for i, cand in enumerate(remaining):
            rel = cosine_sim(cand.vec, query_vec)
            div = max([cosine_sim(cand.vec, c.vec) for c in chosen]) if chosen else 0
            val = lambda_ * rel - (1-lambda_) * div
            
            if val > best_val:
                best_val = val
                best_idx = i
        
        chosen.append(remaining.pop(best_idx))
    
    return chosen
```

### 3.2 Chunking Ótimo

**Objetivo:** Maximizar informação por chunk sem exceder limite

```python
def smart_chunk(text, max_chars=1200, overlap=200):
    chunks = []
    i = 0
    
    while i < len(text):
        end = min(len(text), i + max_chars)
        
        # Tenta cortar em fim de frase
        cut = end
        for j in range(end, i+400, -1):
            if text[j] in '.!?':
                cut = j + 1
                break
        
        chunks.append(text[i:cut].strip())
        i = max(cut - overlap, i + 1)
    
    return [c for c in chunks if c]
```

### 3.3 PCA (3 Componentes para Visualização)

```python
def pca3(X):  # X: N x D
    N, D = X.shape
    
    # Centralizar
    mean = X.mean(axis=0)
    X_centered = X - mean
    
    # Matriz de covariância
    C = (X_centered.T @ X_centered) / (N - 1)
    
    # Power method para 3 autovetores
    comps = []
    M = C.copy()
    for k in range(3):
        v = power_iteration(M, iters=120)
        comps.append(v)
        # Deflação
        M -= np.outer(v, v) * C
    
    # Projetar
    proj = X_centered @ np.array(comps).T  # N x 3
    return proj

def power_iteration(M, iters=100):
    v = np.random.rand(M.shape[0])
    for _ in range(iters):
        v = M @ v
        v /= (np.linalg.norm(v) + 1e-12)
    return v
```

### 3.4 Métricas de Avaliação

**nDCG (Normalized Discounted Cumulative Gain):**
```
DCG@k = Σ_{i=1}^k (2^{rel_i} - 1) / log_2(i+1)
nDCG@k = DCG@k / IDCG@k
```

**MRR (Mean Reciprocal Rank):**
```
MRR = (1/|Q|) Σ_{q∈Q} 1/rank_q
```

**CTR (Click-Through Rate):**
```
CTR = cliques / impressões
```

**CR (Conversion Rate):**
```
CR = conversões / cliques
```

### 3.5 Código: Confiança e Fallback

```python
def compute_confidence(scores):
    """
    C = média normalizada dos top-k scores
    """
    top_scores = sorted(scores, reverse=True)[:8]
    avg = sum(top_scores) / len(top_scores)
    # Map cosine [-1,1] → [0,1]
    C = (avg + 1) / 2
    return min(1.0, max(0.0, C))

async def answer_with_fallback(query, tau=0.62):
    # 1. RAG search
    hits = await search_ann(query, k=24)
    qvec = hits['queryVec']
    
    # 2. MMR selection
    chosen = mmr_select(hits['candidates'], qvec, k=8, lambda_=0.7)
    
    # 3. Confidence
    scores = [c['score'] for c in chosen]
    C = compute_confidence(scores)
    
    # 4. Generate or fallback
    if C >= tau:
        # Use local model
        context = '\n\n'.join([c['text'] for c in chosen])
        answer = await local_generate(query, context)
        used = 'local'
    else:
        # Fallback to API
        answer = await openai_generate(query)
        used = 'fallback'
    
    return {'answer': answer, 'confidence': C, 'used': used}
```

---

## 4. TREINAMENTO E LORA

### 4.1 Treinamento LoRA (Fine-Tuning Eficiente)

**Script Python (trainer/sft/train_lora.py):**

```python
import os
from datasets import load_dataset
from transformers import (
    AutoTokenizer, AutoModelForCausalLM,
    TrainingArguments, Trainer
)
from peft import LoraConfig, get_peft_model

# Configs
MODEL = os.getenv("AION_BASE_MODEL", "mistralai/Mistral-7B-Instruct-v0.3")
DATA = os.getenv("AION_SFT_JSONL", "./data/sft/aion_sft.jsonl")
OUT = os.getenv("AION_LORA_OUT", "./models/adapters/aion-lora")
RANK = int(os.getenv("AION_LORA_RANK", "16"))
ALPHA = int(os.getenv("AION_LORA_ALPHA", "32"))

# Load
tokenizer = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForCausalLM.from_pretrained(MODEL)

# LoRA config
peft_config = LoraConfig(
    r=RANK,
    lora_alpha=ALPHA,
    lora_dropout=0.05,
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj", 
                    "gate_proj", "up_proj", "down_proj"]
)
model = get_peft_model(model, peft_config)

# Dataset
ds = load_dataset("json", data_files=DATA, split="train")
ds = ds.map(lambda x: tokenizer(x["text"], truncation=True, max_length=2048))

# Training
args = TrainingArguments(
    output_dir=OUT,
    per_device_train_batch_size=2,
    gradient_accumulation_steps=16,
    learning_rate=2e-4,
    num_train_epochs=1,
    fp16=True,
    logging_steps=50,
    save_steps=500
)

trainer = Trainer(
    model=model,
    args=args,
    train_dataset=ds
)

trainer.train()
model.save_pretrained(OUT)
tokenizer.save_pretrained(OUT)
print(f"Adapter saved to {OUT}")
```

### 4.2 Microserviço de Inferência Local

**FastAPI + PEFT (trainer/inference/app.py):**

```python
import os
from fastapi import FastAPI
from transformers import (
    AutoModelForCausalLM, AutoTokenizer,
    BitsAndBytesConfig
)
from peft import PeftModel

app = FastAPI()

BASE_MODEL = os.getenv("AION_BASE_MODEL")
ADAPTER_DIR = os.getenv("AION_ADAPTER_DIR")

# Load model
quant_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype="bfloat16"
)

tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    device_map="auto",
    quantization_config=quant_config
)

# Load LoRA adapter
if os.path.isdir(ADAPTER_DIR):
    model = PeftModel.from_pretrained(model, ADAPTER_DIR)
    model = model.merge_and_unload()

@app.get("/health")
def health():
    return {"status": "ok", "adapter_loaded": True}

@app.post("/generate")
def generate(req: dict):
    prompt = req["prompt"]
    context = req.get("context", "")
    
    text = f"{prompt}\n\n{context}" if context else prompt
    inputs = tokenizer(text, return_tensors="pt").to(model.device)
    
    outputs = model.generate(
        **inputs,
        max_new_tokens=512,
        temperature=0.6,
        top_p=0.9,
        do_sample=True
    )
    
    result = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return {"text": result}
```

### 4.3 Exportação de Dataset para Treino

```typescript
// trainer/sft/build_jsonl.ts
import fs from "fs";
import { db } from "../../server/db";
import { aiInteractions } from "../../shared/schema.ai.core";

async function buildDataset() {
    const rows = await db.select()
        .from(aiInteractions)
        .limit(50000);
    
    const lines = rows.map(r => JSON.stringify({
        messages: [
            { role: "system", content: "Você é a AION" },
            { role: "user", content: r.user_input },
            { role: "assistant", content: r.final_answer }
        ]
    }));
    
    fs.writeFileSync(
        "./data/sft/aion_sft.jsonl",
        lines.join("\n")
    );
    
    console.log(`Exported ${lines.length} examples`);
}

buildDataset();
```

---

## 5. INFRAESTRUTURA GRATUITA

### 5.1 GPUs Gratuitas Disponíveis

| Plataforma | GPU | Tempo/Sessão | Limite Semanal | VRAM |
|------------|-----|--------------|----------------|------|
| **Google Colab** | NVIDIA T4 | ~12h | Ilimitado (com pausas) | 16GB |
| **Kaggle** | NVIDIA P100/T4 | ~9h | 30h/semana | 16GB |
| **Google Cloud (novos)** | T4/V100 | Variável | US$300 crédito | 16-32GB |

### 5.2 Estratégia de Rotação Colab ↔ Kaggle

```python
# Persistência via Google Drive
from google.colab import drive
drive.mount('/content/drive')

# Salvar checkpoint
torch.save({
    'epoch': epoch,
    'model_state_dict': model.state_dict(),
    'optimizer_state_dict': optimizer.state_dict(),
    'loss': loss,
}, '/content/drive/MyDrive/aion/checkpoint.pt')

# Carregar checkpoint (próxima sessão)
checkpoint = torch.load('/content/drive/MyDrive/aion/checkpoint.pt')
model.load_state_dict(checkpoint['model_state_dict'])
optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
epoch = checkpoint['epoch']
```

**Rotação:**
1. Colab: Treina 10-12h → Salva checkpoint
2. Kaggle: Carrega checkpoint → Treina 8-9h → Salva
3. Repeat

### 5.3 Servidor Orquestrador (GCP e2-micro - Grátis)

```python
# orchestrator.py (roda na VM always-free)
import requests
import time

COLAB_URL = os.getenv("COLAB_NGROK_URL")
KAGGLE_URL = os.getenv("KAGGLE_URL")

def check_health(url):
    try:
        r = requests.get(f"{url}/health", timeout=5)
        return r.status_code == 200
    except:
        return False

while True:
    if not check_health(COLAB_URL):
        print("Colab down! Alert sent.")
        # Send alert (email/SMS)
        send_alert("Colab offline - start Kaggle")
    
    time.sleep(300)  # Check every 5min
```

### 5.4 Hosting Frontend/Backend Grátis

| Serviço | Uso | Free Tier |
|---------|-----|-----------|
| **Replit** | Backend FastAPI | Ilimitado (com ping) |
| **Vercel** | Frontend React | 100GB bandwidth/mês |
| **Netlify** | Frontend React | 100GB bandwidth/mês |
| **Supabase** | PostgreSQL | 500MB database |
| **Cloudflare** | CDN/DNS | Ilimitado |

---

## 6. APIS DE IA GRATUITAS

### 6.1 Tabela Comparativa

| API | Limite Grátis | Modelos | Latência | Censura |
|-----|---------------|---------|----------|---------|
| **Google AI Studio (Gemini)** | 180M tokens/mês | Gemini 2.5 Pro/Flash | ~1-2s | Sim |
| **OpenRouter** | Créditos + modelos grátis | 50+ (Claude, Llama, Mistral) | Variável | Depende do modelo |
| **Groq** | Generoso | Llama 3, Mistral, Gemma | <100ms | Não |
| **HuggingFace** | Rate-limited | Milhares (comunidade) | Variável | Depende do modelo |
| **OpenAI** | US$5 mínimo | GPT-3.5-turbo, GPT-4 | ~500ms | Sim |

### 6.2 Implementação: Rotação de APIs

```typescript
// server/llm/free-apis.ts

const FREE_APIS = [
    {
        name: 'groq',
        limit: 14400,  // req/dia
        endpoint: 'https://api.groq.com/v1/chat/completions',
        key: process.env.GROQ_API_KEY,
        models: ['llama-3-70b', 'mixtral-8x7b']
    },
    {
        name: 'gemini',
        limit: 180_000_000,  // tokens/mês
        endpoint: 'https://generativelanguage.googleapis.com/v1/models',
        key: process.env.GEMINI_API_KEY,
        models: ['gemini-2.5-pro', 'gemini-2.5-flash']
    },
    {
        name: 'openrouter',
        limit: 50,  // créditos iniciais
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        key: process.env.OPENROUTER_API_KEY,
        models: ['meta-llama/llama-3-70b', 'anthropic/claude-3-sonnet']
    },
    {
        name: 'huggingface',
        limit: 720,  // req/dia (estimado)
        endpoint: 'https://api-inference.huggingface.co/models',
        key: process.env.HUGGINGFACE_API_KEY,
        models: ['mistralai/Mistral-7B-Instruct-v0.3']
    }
];

let current_api_index = 0;
let usage_count = 0;

async function generate(prompt: string, fallback=true) {
    for (let attempt = 0; attempt < FREE_APIS.length; attempt++) {
        const api = FREE_APIS[current_api_index];
        
        try {
            const result = await callAPI(api, prompt);
            usage_count++;
            
            // Rotate if limit approached
            if (usage_count > api.limit * 0.8) {
                current_api_index = (current_api_index + 1) % FREE_APIS.length;
                usage_count = 0;
            }
            
            return result;
        } catch (error) {
            console.log(`${api.name} failed, trying next...`);
            current_api_index = (current_api_index + 1) % FREE_APIS.length;
        }
    }
    
    // All failed
    if (fallback) {
        return await callOpenAI(prompt);  // Último recurso (pago)
    }
    
    throw new Error("All free APIs exhausted");
}

async function callAPI(api, prompt) {
    const response = await fetch(api.endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${api.key}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: api.models[0],
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 512
        })
    });
    
    const data = await response.json();
    return data.choices[0].message.content;
}
```

### 6.3 Priorização Inteligente

```
1. Local Model (se disponível) → GRÁTIS, sem censura
   ↓ (se falhar ou C < tau)
2. Groq API → GRÁTIS, ultra-rápido, sem censura
   ↓ (se limit atingido)
3. Gemini API → GRÁTIS, 180M tokens/mês
   ↓ (se limit atingido)
4. HuggingFace → GRÁTIS, modelos open-source
   ↓ (se limit atingido)
5. OpenRouter → Créditos grátis + modelos grátis
   ↓ (último recurso)
6. OpenAI GPT-3.5 → Barato (~$0.002/1k tokens)
```

---

## 7. IMPLEMENTAÇÃO COMPLETA

### 7.1 Knowledge Base: Chunking + Embedding + ANN

```typescript
// server/ai/knowledge-indexer.ts

import { embedTextMany } from './embeddings';
import { smartChunk } from './math';
import { db } from '../db';
import { aiChunks } from '@shared/schema';

export async function indexDocument(docId: string, content: string) {
    // 1. Chunk
    const chunks = smartChunk(content, 1200, 200);
    
    // 2. Embed (batch)
    const vectors = await embedTextMany(chunks);
    
    // 3. Save to DB
    for (let i = 0; i < chunks.length; i++) {
        await db.insert(aiChunks).values({
            documentId: docId,
            order: i,
            text: chunks[i],
            vector: vectors[i],
            approved: true
        });
    }
    
    // 4. Rebuild ANN index
    await rebuildANN();
}

export async function rebuildANN() {
    const chunks = await db.select()
        .from(aiChunks)
        .where(eq(aiChunks.approved, true));
    
    // Build FAISS/HNSWlib index (pseudo-código)
    const index = new FAISSIndex(dimension=1536);
    for (const chunk of chunks) {
        index.add(chunk.id, chunk.vector);
    }
    
    index.save('./data/ann.index');
}
```

### 7.2 Curadoria Web Automática

```typescript
// server/learn/curator.ts

import fetch from 'node-fetch';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export async function discoverAndIndex(theme: string) {
    // 1. Search DuckDuckGo
    const urls = await searchDDG(theme, limit=10);
    
    // 2. Fetch + Extract
    const documents = [];
    for (const url of urls) {
        try {
            const html = await (await fetch(url)).text();
            const dom = new JSDOM(html, { url });
            const article = new Readability(dom.window.document).parse();
            
            if (article) {
                documents.push({
                    url,
                    title: article.title,
                    text: article.textContent,
                    score: scoreQuality(article.textContent)
                });
            }
        } catch (e) {
            console.log(`Failed to fetch ${url}`);
        }
    }
    
    // 3. Sort by quality
    documents.sort((a, b) => b.score - a.score);
    
    // 4. Index top 5
    for (const doc of documents.slice(0, 5)) {
        await indexDocument(doc.url, doc.text);
    }
    
    return documents.length;
}

function scoreQuality(text: string) {
    // Entropy + length + ...
    const entropy = calculateEntropy(text);
    const lengthScore = Math.min(1, text.length / 10000);
    return 0.7 * entropy + 0.3 * lengthScore;
}
```

### 7.3 Backup & Restore (Disaster Recovery)

```bash
#!/usr/bin/env bash
# ops/backup/backup.sh

set -euo pipefail

TS=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=./ops/backup/artifacts
mkdir -p "$BACKUP_DIR"

# 1. PostgreSQL dump
pg_dump -h localhost -U aion -F c -d aion \
    -f "$BACKUP_DIR/pg_$TS.dump"

# 2. LoRA adapters
tar czf "$BACKUP_DIR/adapters_$TS.tar.gz" \
    -C ./trainer/lora out

# 3. Knowledge Base (FAISS index)
tar czf "$BACKUP_DIR/kb_$TS.tar.gz" \
    -C ./server/ai/data kb

# 4. Upload to S3 (optional)
if [ -n "${S3_BUCKET:-}" ]; then
    aws s3 cp "$BACKUP_DIR/pg_$TS.dump" \
        "$S3_BUCKET/pg_$TS.dump"
    aws s3 cp "$BACKUP_DIR/adapters_$TS.tar.gz" \
        "$S3_BUCKET/adapters_$TS.tar.gz"
fi

echo "[AION] Backup completed: $TS"
```

### 7.4 Kubernetes Autoscale (HPA)

```yaml
# k8s/app-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: aion-app-hpa
  namespace: aion
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: aion-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 70
```

### 7.5 Prometheus Alertas

```yaml
# ops/prometheus/alerts.yml
groups:
- name: aion-alerts
  rules:
  - alert: HighFallbackRate
    expr: |
      sum(rate(aion_fallback_total[5m])) 
      / sum(rate(aion_answers_total[5m])) > 0.25
    for: 10m
    labels:
      severity: warning
    annotations:
      summary: "Taxa de fallback > 25%"
      description: "Sistema recorrendo demais a APIs externas"
  
  - alert: LowNDCG
    expr: avg_over_time(aion_ndcg[30m]) < 0.82
    for: 30m
    labels:
      severity: critical
    annotations:
      summary: "nDCG abaixo do threshold"
      description: "Qualidade das respostas degradada"
```

---

## 8. CAPACIDADES TOTAIS

### 8.1 Free LLM APIs (Capacidade Diária)

```
OpenRouter:     50 req/dia (créditos grátis)
Groq:           14,400 req/dia
Gemini:         6,000,000 tokens/dia (≈ 12k req)
HuggingFace:    ~720 req/dia
─────────────────────────────────
TOTAL:          ~27,170 req/dia GRÁTIS
```

**Antes de usar OpenAI (pago):** ~27k requisições gratuitas!

### 8.2 Free GPU Training (Capacidade Semanal)

```
Google Colab:   ~84h/semana (7 × 12h)
Kaggle:         30h/semana
GCP (crédito):  Variável (US$300)
─────────────────────────────────
TOTAL:          ~114h GPU/semana GRÁTIS
```

**Suficiente para:** Treinar LoRA em modelos 7B-13B continuamente

### 8.3 Hosting Gratuito

```
Frontend:       Vercel/Netlify (100GB/mês)
Backend:        Replit (ilimitado com ping)
Database:       Supabase (500MB)
Storage:        Google Drive (15GB)
CDN:            Cloudflare (ilimitado)
```

---

## 9. MODELOS OPEN-SOURCE RECOMENDADOS

### 9.1 Para Treinamento do Zero

| Modelo | Parâmetros | Contexto | Censura | GPU Mínima |
|--------|------------|----------|---------|------------|
| **Mistral 7B Instruct** | 7B | 8k | ❌ Não | T4 (16GB) |
| **Llama 3 8B** | 8B | 8k | ⚠️ Parcial | T4 (16GB) |
| **Phi-3 Mini** | 3.8B | 128k | ✅ Sim | CPU/T4 |
| **Gemma 7B** | 7B | 8k | ⚠️ Parcial | T4 (16GB) |

**Recomendação:** Mistral 7B Instruct (sem censura, excelente qualidade)

### 9.2 Para Fine-Tuning (LoRA)

**Configuração Ótima para Colab Free:**
```python
# Mistral 7B + 4-bit quantization + LoRA
model = AutoModelForCausalLM.from_pretrained(
    "mistralai/Mistral-7B-Instruct-v0.3",
    load_in_4bit=True,
    device_map="auto"
)

peft_config = LoraConfig(
    r=16,              # Rank
    lora_alpha=32,     # Scaling
    lora_dropout=0.05,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj"
    ]
)

model = get_peft_model(model, peft_config)

# Trainable params: ~9M (vs 7B frozen)
```

---

## 10. CHECKLIST DE IMPLANTAÇÃO

### ✅ Fase 1: Setup Inicial
- [ ] Criar conta Google Cloud (US$300 crédito)
- [ ] Criar conta Groq, OpenRouter, Gemini APIs
- [ ] Setup Google Drive para persistência
- [ ] Criar projeto Replit para backend
- [ ] Setup Supabase PostgreSQL

### ✅ Fase 2: Infraestrutura
- [ ] Deploy backend FastAPI no Replit
- [ ] Deploy frontend no Vercel
- [ ] Configure database migrations
- [ ] Setup Ngrok para Colab (se necessário)
- [ ] Configure DNS/CDN (Cloudflare)

### ✅ Fase 3: Treinamento
- [ ] Preparar dataset JSONL
- [ ] Treinar LoRA no Colab/Kaggle
- [ ] Validar qualidade do modelo
- [ ] Deploy adapter em microserviço
- [ ] Implementar rotação APIs grátis

### ✅ Fase 4: RAG & KB
- [ ] Indexar documentos iniciais
- [ ] Implementar chunking + embedding
- [ ] Build ANN index (FAISS/HNSWlib)
- [ ] Testar busca semântica
- [ ] Implementar MMR

### ✅ Fase 5: Produção
- [ ] Setup backup automático
- [ ] Configure Prometheus/alertas
- [ ] Implementar logging
- [ ] Testar failover Colab↔Kaggle
- [ ] Load testing

### ✅ Fase 6: Otimização
- [ ] Fine-tune thresholds (tau, lambda)
- [ ] Otimizar chunking
- [ ] Implementar caching
- [ ] Monitor métricas (nDCG, MRR)
- [ ] Continuous training pipeline

---

## 11. PRÓXIMOS PASSOS

1. **Implementar Microserviço Local** (FastAPI + LoRA)
2. **Deploy Rotação de APIs Gratuitas** (Groq → Gemini → HF → OpenRouter)
3. **Setup Treinamento Contínuo** (Colab ↔ Kaggle)
4. **Implementar Curadoria Web** (DuckDuckGo → Extract → Index)
5. **Deploy Kubernetes** (para scale em produção)

---

## 📚 REFERÊNCIAS

### Artigos Técnicos
- Attention Is All You Need (Vaswani et al., 2017)
- LoRA: Low-Rank Adaptation (Hu et al., 2021)
- FlashAttention (Dao et al., 2022)
- Chinchilla Scaling Laws (Hoffmann et al., 2022)
- RoPE (Su et al., 2021)

### Documentação APIs
- [Google AI Studio](https://ai.google.dev/)
- [OpenRouter](https://openrouter.ai/docs)
- [Groq](https://groq.com/docs)
- [HuggingFace](https://huggingface.co/docs/api-inference)

### Recursos Free GPU
- [Google Colab](https://colab.research.google.com/)
- [Kaggle Notebooks](https://www.kaggle.com/code)
- [GCP Free Tier](https://cloud.google.com/free)

---

**Documento criado em:** 29 de Outubro de 2025  
**Baseado em:** 19 PDFs Técnicos (549k chars) + 2 Documentos sobre APIs/GPUs Gratuitas  
**Status:** ✅ Documentação Completa e Pronta para Implementação
