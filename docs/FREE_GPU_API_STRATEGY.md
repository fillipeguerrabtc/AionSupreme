# 🚀 Plano para Executar AION Supreme 100% Gratuitamente

**Fonte**: GPU&API_1761707927196.txt (Documentação completa de infraestrutura gratuita)

---

## 📋 Índice

1. [Infraestrutura Gratuita Disponível](#infraestrutura-gratuita-disponível)
2. [Estratégia para Treinar o Modelo do Zero](#estratégia-para-treinar-o-modelo-do-zero)
3. [Alternância Entre Ferramentas Cloud/GPU](#alternância-entre-ferramentas-cloudgpu)
4. [Integração com APIs de IA Gratuitas](#integração-com-apis-de-ia-gratuitas)
5. [Adaptação do Código em Plataformas Gratuitas](#adaptação-do-código-em-plataformas-gratuitas)
6. [Modelos Open-Source Adequados](#modelos-open-source-adequados)

---

## 1. Infraestrutura Gratuita Disponível

### Google Colab (Free)
- **GPU**: NVIDIA T4 (~16GB VRAM)
- **Sessão**: ~12 horas contínuas
- **Desconexão**: Após ~90 min de inatividade
- **Persistência**: Montar Google Drive para salvar modelos/checkpoints
- **Configuração**:
```python
from google.colab import drive
drive.mount('/content/drive')
```

### Google Cloud Platform (Free Tier)
- **VM Always-Free**: e2-micro Linux (CPU) - Permanente
- **Storage**: 5 GiB Cloud Storage grátis
- **Créditos**: $300 para novos usuários (GPU temporária)
- **Uso**: Orquestrador ou servidor leve (FastAPI, agendador)

### Kaggle Notebooks
- **GPU**: Nvidia gratuita
- **Limite**: 30 horas/semana
- **Sessão**: ~9 horas contínuas
- **⚠️ Limitação**: Notebooks agendados não suportam GPU (apenas CPU)
- **Uso**: Recurso alternativo manual

### Replit
- **Tipo**: Plataforma de hosting contínuo
- **GPU**: ❌ Não oferece GPU no plano grátis
- **Uso**: Frontend React, Backend Node.js, Orquestrador
- **Continuidade**: Usar ping periódico (UptimeRobot a cada 5 min) para evitar hibernação

### APIs de Inferência com GPU (Gratuitas)

#### Hugging Face Inference API
- **Modelos**: Milhares de modelos open-source
- **GPU**: Nos servidores da HF (grátis para baixo volume)
- **Uso**: Chamadas REST sem hospedar localmente

#### OpenRouter
- **Agregador**: 50+ modelos (Claude, Llama, Mistral)
- **Créditos**: Grátis no cadastro
- **Modelos gratuitos**: Disponíveis para teste
- **API**: Unificada (trocar modelo mudando parâmetro)

#### Groq API
- **Modelos**: Llama 3, Mistral (open-source)
- **Hardware**: Especializado (ultrarrápido)
- **Limite gratuito**: ~14,400 requisições/dia
- **Uso**: Inferência em tempo real

---

## 2. Estratégia para Treinar o Modelo do Zero

### 🎯 Conceito-Chave: Treinamento em Blocos

**Problema**: Colab tem limite de ~12h por sessão  
**Solução**: Treinar em épocas curtas + salvar checkpoints

### 2.1. Dividir Treinamento em Sessões

```python
# Salvar checkpoint a cada N iterações
from transformers import TrainingArguments

training_args = TrainingArguments(
    output_dir="/content/drive/MyDrive/aion/checkpoints",
    save_steps=50,  # Salvar a cada 50 steps
    save_total_limit=3,  # Manter apenas 3 últimos checkpoints
)
```

**Fluxo**:
1. Treinar por N passos/épocas
2. Salvar checkpoint no Google Drive
3. Finalizar sessão
4. Nova sessão: Carregar checkpoint e continuar

### 2.2. Usar Precisão Mista e Modelos Menores

**GPU T4 do Colab**: ~16 GB VRAM

**Técnicas de Economia**:
- **FP16** (Half Precision): Reduz uso de VRAM
- **Modelos 7B-13B**: Mais rápidos que 175B
- **Quantização 4-bit**: 16GB → 4GB

```python
from transformers import BitsAndBytesConfig

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype="bfloat16",
)
```

### 2.3. Aproveitar Múltiplos Provedores em Paralelo

**Estratégia de Rotação**:
```
Seg-Qua: Colab (12h/dia) → 36h
Qui-Sex: Kaggle (9h/sessão) → 18h  
Sab-Dom: Modal ($30 créditos) → ~20h

TOTAL: ~74h GPU/semana (gratuito)
```

**Fluxo**:
1. Colab treina 9-12h → Salva checkpoint no Drive
2. Kaggle carrega checkpoint → Treina +9h
3. Repete ciclo

### 2.4. Datasets em Partes e Streaming

**Colab Free**: ~12 GB RAM

**Solução**:
```python
from torch.utils.data import DataLoader

# Carregar sob demanda (não tudo na memória)
train_loader = DataLoader(
    dataset,
    batch_size=4,
    num_workers=2,
)
```

- Armazenar dados no Google Drive
- Ler em batches conforme necessário
- PyTorch DataLoader com carregamento sob demanda

### 2.5. Monitoração e Logging

```python
# TensorBoard.dev (gratuito)
!tensorboard dev upload --logdir ./logs
```

- Log de perda, métricas, amostras
- Salvar logs no Drive
- TensorBoard.dev para visualização

### 2.6. Teste Contínuo e Ajuste

**Validação periódica**:
- Gerar respostas de exemplo
- Avaliar coerência
- Verificar deriva indesejada

**Curriculum Learning**:
- Começar com dados simples
- Aumentar complexidade gradualmente

---

## 3. Alternância Entre Ferramentas Cloud/GPU

### 🔄 Rotação de Notebooks (Colab/Kaggle)

**Esquema de Rotação**:
```
Manhã: Colab (salva estado periodicamente)
Tarde: Kaggle (carrega último estado)
Noite: Colab novamente
```

**Estado a Salvar**:
- Vetores de memória (FAISS)
- Últimos diálogos
- Checkpoints do modelo
- Configurações

### 🤖 Servidor Orquestrador Always-On

**Opções**:
1. **VM GCP e2-micro** (always-free)
2. **Replit** (com ping para evitar hibernação)

**Função**: Watchdog que verifica se instância principal está ativa

```typescript
// Pseudo-código
async function checkGPUHealth() {
  const response = await fetch('http://ngrok-url.io/health');
  if (!response.ok) {
    // GPU offline, acionar fallback
    await triggerBackupGPU();
  }
}

setInterval(checkGPUHealth, 60000); // A cada 1 min
```

**Soluções para Iniciar Colab Automaticamente**:

1. **Google Apps Script + Cloud Scheduler**:
   - Script que abre notebook Colab
   - Automação via Gmail ou similar

2. **Selenium em VM**:
   - Navegador headless na VM always-free
   - Login automático e abertura do Colab

3. **Alternativa Simples**:
   - Email/SMS quando Colab cair
   - Iniciar manualmente (reduz downtime)

### ⚖️ Balanceamento de Carga

**Arquitetura Distribuída**:

```
┌─────────────────────────────────────┐
│ Replit/GCP (Always-On)              │
│ • Frontend React                     │
│ • Backend FastAPI (CPU)              │
│ • Orquestrador                       │
└─────────────────────────────────────┘
          ↓ Delega tarefas GPU
┌─────────────────────────────────────┐
│ Colab/Kaggle (GPU Temporária)       │
│ • Modelo de linguagem                │
│ • Inferência complexa                │
└─────────────────────────────────────┘
```

**Fallback Automático**:
- GPU offline → Usar OpenRouter/HF API
- Frontend nunca sai do ar
- Apenas "motor" de IA muda

### 🌐 Ngrok e URLs Estáveis

**Problema**: Ngrok muda URL a cada sessão

**Soluções**:

1. **Domínio Gratuito + API de Redirecionamento**:
   - Cloudflare API
   - DynDNS
   - Atualizar subdomínio via script

2. **Frontend Separado**:
   - Hospedar em Replit/Vercel
   - Lista de possíveis URLs de backend
   - Tentar conectar em ordem

3. **Serviço de Discovery**:
   - Orquestrador informa qual backend está online

---

## 4. Integração com APIs de IA Gratuitas

### Google AI Studio (Gemini)

**Limites Generosos**:
- **6 milhões** de tokens/dia
- **180 milhões** de tokens/mês

**Integração**:
```python
from google.generativeai import GenerativeModel

model = GenerativeModel('gemini-1.5-flash')
response = model.generate_content(prompt)
```

**Caching**:
- Salvar respostas no Knowledge Base (FAISS)
- Economizar tokens
- Construir base não-censurada

### Hugging Face Inference API

**Modelos Não-Censurados**:
- Llama-2 sem filtro
- Mistral 7B Instruct
- Variantes da comunidade

**Uso como Fallback**:
```typescript
if (!localModel.isOnline()) {
  // Chamar HF API
  const response = await hfAPI.inference({
    model: "mistralai/Mistral-7B-Instruct-v0.2",
    inputs: prompt
  });
  
  // Gravar no KB local
  await knowledgeBase.index(response);
}
```

### OpenRouter

**Agregador de 50+ Modelos**:
- Claude, Llama, Mistral, etc.
- Trocar modelo mudando parâmetro

**Créditos Gratuitos**: Novos usuários ganham créditos

**Ensemble**:
```python
# Enviar para 2-3 modelos em paralelo
responses = await Promise.all([
  openrouter.complete({model: "claude-3", prompt}),
  openrouter.complete({model: "llama-3-70b", prompt}),
  openrouter.complete({model: "mistral-large", prompt}),
]);

// Combinar ou escolher melhor
const best = selectBestResponse(responses);
```

### APIs de Imagem/Vídeo

**Stable Diffusion via HuggingFace**:
```python
from diffusers import StableDiffusionPipeline

pipe = StableDiffusionPipeline.from_pretrained("CompVis/stable-diffusion-v1-4")
image = pipe(prompt).images[0]
```

**Craiyon API** (antigo DALL-E mini): Gratuito

**Cache de Resultados Visuais**:
- Armazenar no Drive
- CDN gratuita (Imgur via API)

### OpenAI (gpt-3.5-turbo)

**Custo**: Frações de centavo por mil tokens  
**$5**: Milhões de tokens

**⚠️ Censura**: OpenAI implementa filtros  
**Uso**: Benchmarks e comparações (não fonte de dados não-censurados)

---

## 5. Adaptação do Código em Plataformas Gratuitas

### No Google Colab

#### 5.1. Preparar Ambiente

```python
# Runtime > Change runtime type > GPU
from google.colab import drive
drive.mount('/content/drive')
```

#### 5.2. Instalar Dependências

```python
!pip install fastapi uvicorn faiss-cpu openai anthropic
!pip install pandas numpy scipy python-multipart
!pip install beautifulsoup4 lxml requests pillow opencv-python-headless
!pip install transformers==4.33.0 accelerate sentence-transformers langchain
```

#### 5.3. Obter Código

**Opção 1 - Clonar GitHub**:
```bash
!git clone https://github.com/fillipeguerrabtc/AionSupreme.git
%cd AionSupreme
```

**Opção 2 - Upload ZIP**:
```bash
!unzip /content/AionSupreme-main.zip -d /content/AionSupreme
%cd /content/AionSupreme/AionSupreme-main
```

#### 5.4. Configurar Variáveis de Ambiente

```python
import os

# Supabase (PostgreSQL grátis)
os.environ['DATABASE_URL'] = 'postgresql://user:pass@host.supabase.co:5432/postgres'

# APIs (se usar)
os.environ['OPENAI_API_KEY'] = '...'
os.environ['ANTHROPIC_API_KEY'] = '...'
```

**Alternativa**: SQLite local (protótipo)

#### 5.5. Iniciar Backend FastAPI

```python
!uvicorn app.main:app --host 0.0.0.0 --port 8000 &> log.txt &
```

#### 5.6. Expor com Ngrok

```python
!pip install pyngrok
from pyngrok import ngrok

NGROK_AUTH_TOKEN = "SEU_TOKEN_AQUI"
!ngrok authtoken $NGROK_AUTH_TOKEN

public_url = ngrok.connect(8000, "http")
print(f"🚀 API disponível em: {public_url}")
```

#### 5.7. Frontend React

**Opção Recomendada**: Hospedar separadamente em:
- Replit (Node.js)
- Vercel/Netlify (build automático)

**Configuração**:
```javascript
// .env
VITE_API_URL=https://1234.ngrok.io
```

#### 5.8. Salvar Estado Regularmente

```python
# Antes de encerrar sessão
model.save_pretrained('/content/drive/MyDrive/aion/model')
faiss_index.save('/content/drive/MyDrive/aion/faiss.index')
```

#### 5.9. Reiniciar Quando Necessário

- Sessão expira → Montar Drive
- Reinstalar dependências (ou usar notebook salvo)
- Banco Supabase mantém dados
- FAISS recarrega do Drive

### No Replit

#### Criar Repl Python

```bash
# replit.nix ou pip
pip install fastapi uvicorn
```

#### Configurar Secrets

```
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
```

#### Iniciar FastAPI

```python
# main.py
import uvicorn
from app.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

**URL Público**: `https://<project>.<username>.repl.co`

#### Manter Ativo

- Frontend rodando → Mantém acordado
- Ou usar ping externo (UptimeRobot)

### Ajustes no Código

#### Usar Modelos Locais

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained(
    "/content/drive/MyDrive/aion/model",
    load_in_4bit=True,
)
tokenizer = AutoTokenizer.from_pretrained("/content/drive/MyDrive/aion/model")

# Substituir chamadas OpenAI por inferência local
def generate(prompt):
    inputs = tokenizer(prompt, return_tensors="pt")
    outputs = model.generate(**inputs, max_new_tokens=512)
    return tokenizer.decode(outputs[0])
```

#### Desabilitar Filtros de Conteúdo

```typescript
// server/policy-enforcement.ts
const policy = {
  mode: "UNRESTRICTED",
  rules: [],
  outputModeration: { enabled: false }
};
```

---

## 6. Modelos Open-Source Adequados (Sem Censura)

### Llama 2 / Llama 3

**Parâmetros**: 7B até 70B  
**Licença**: Permissiva (pesquisa)  
**Censura**: Forks não-censurados disponíveis  
**Base**: Sem filtro nativo

**Exemplo**: Llama 3 70B Instruct
- 70B parâmetros
- Versátil (texto + código)
- Otimizações avançadas

### Mistral AI

**Mistral 7B**:
- 7B parâmetros
- Código aberto (Apache 2.0)
- Performance comparável a modelos maiores
- Sliding Window Attention (contexto longo)

**Mixtral 8x7B**:
- Mixture of Experts
- 47B parâmetros (8 experts de 7B)
- Qualidade próxima ao GPT-3.5

### Falcon

**Falcon 40B / 180B**:
- Treinado em 1 trilhão+ tokens
- Dados limpos (RefinedWeb)
- Apache 2.0
- Sem censura nativa

### MPT (MosaicML)

**MPT-7B / MPT-30B**:
- Treinado com contexto de 2k-8k tokens
- Código 100% open-source
- Apache 2.0
- Ótimo para fine-tuning

### Recomendação: Llama-3-8B + LoRA

**Por quê?**:
- ✅ 8B parâmetros cabem na T4 (4-bit)
- ✅ Base forte (Meta AI)
- ✅ LoRA fine-tuning (~200MB adaptadores)
- ✅ Comunidade ativa (forks não-censurados)
- ✅ Performance excelente

**Matemática LoRA**:
```
W' = W + BA
Onde:
- W = Peso original (congelado)
- B, A = Matrizes de baixo rank (r=16)
- Parâmetros treináveis: ~0.4% do total
```

**Vantagens**:
- Treino rápido (horas, não dias)
- Baixo uso de GPU
- Adaptadores pequenos (fácil salvar/carregar)
- Combinar múltiplos LoRAs

---

## 📊 Resumo de Limites Gratuitos

| Recurso | Limite | Uso Mensal |
|---------|--------|------------|
| **Colab** | 12h/dia | ~360h GPU |
| **Kaggle** | 30h/semana | ~120h GPU |
| **Modal** | $30 créditos | ~20-30h GPU |
| **Groq** | 14.4k req/dia | ~432k req |
| **Gemini** | 1.5k req/dia | ~45k req |
| **HF Inference** | ~720 req/dia | ~21.6k req |
| **GCP VM** | e2-micro | 24/7 CPU |
| **Replit** | Ilimitado* | 24/7 CPU |
| **Supabase** | 512MB DB | Ilimitado |

**Total**: ~500h GPU/mês + ~500k req LLM/mês = **$0**

---

## 🎯 Fluxo Completo de Trabalho

```
1. SETUP INICIAL
   ├─ Criar conta Supabase (PostgreSQL grátis)
   ├─ Obter API keys (Groq, Gemini, OpenRouter)
   ├─ Configurar Ngrok
   └─ Hospedar frontend em Replit/Vercel

2. TREINAMENTO
   ├─ Colab: Fine-tune Llama-3-8B + LoRA
   ├─ Salvar adaptadores no Google Drive
   └─ Alternar Colab/Kaggle conforme limites

3. INFERÊNCIA
   ├─ Colab/Kaggle: FastAPI + modelo local
   ├─ Ngrok: Expor para Replit
   └─ Fallback: Groq → Gemini → HF

4. ORQUESTRAÇÃO
   ├─ Replit: Always-on (frontend + orquestrador)
   ├─ Watchdog: Detectar GPU offline
   └─ Auto-fallback para APIs gratuitas

5. MANUTENÇÃO
   ├─ Rotação manual de GPUs (seg-dom)
   ├─ Salvar checkpoints a cada sessão
   └─ Monitorar via TensorBoard.dev
```

---

## 💡 Dicas Avançadas

### 1. Automação com Selenium

```python
from selenium import webdriver

# VM GCP always-free rodando Selenium
driver = webdriver.Chrome()
driver.get("https://colab.research.google.com/")
# Login automático e abrir notebook
```

### 2. Webhook para Notificações

```typescript
// Notificar quando GPU cair
await fetch('https://hooks.slack.com/...', {
  method: 'POST',
  body: JSON.stringify({
    text: '⚠️ GPU Colab offline! Iniciar Kaggle.'
  })
});
```

### 3. Curriculum Learning

```python
# Treinar do simples → complexo
datasets = [
  "simple_conversations.jsonl",  # Épocas 1-2
  "medium_conversations.jsonl",  # Épocas 3-5
  "complex_conversations.jsonl", # Épocas 6-10
]
```

### 4. Ensemble de Modelos

```python
# Combinar respostas de múltiplas fontes
responses = [
  local_model.generate(prompt),
  groq_api.generate(prompt),
  gemini_api.generate(prompt),
]

best = select_by_confidence(responses)
```

---

## ⚠️ Avisos Importantes

1. **Termos de Serviço**: Respeitar limites de cada plataforma
2. **Contas Secundárias**: Verificar se são permitidas
3. **Censura**: Modelos base não têm filtro, mas APIs externas (OpenAI) sim
4. **Persistência**: Sempre salvar no Drive/Storage (Colab/Kaggle são efêmeros)
5. **Monitoramento**: Logs e checkpoints para rastrear evolução

---

## 🚀 Conclusão

Com planejamento cuidadoso, é **100% viável** rodar AION Supreme gratuitamente:

✅ **500h GPU/mês** (Colab + Kaggle + Modal)  
✅ **500k+ requisições LLM/mês** (Groq + Gemini + HF)  
✅ **Always-on frontend** (Replit/Vercel)  
✅ **PostgreSQL persistente** (Supabase)  
✅ **Fine-tuning LoRA** (Llama-3-8B em T4)  
✅ **Fallback automático** (GPU offline → APIs)  

**Custo total**: **$0/mês** 🎉

---

**Última atualização**: Outubro 29, 2025  
**Fonte**: GPU&API_1761707927196.txt (208 linhas)
