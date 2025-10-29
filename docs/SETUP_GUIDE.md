# 🚀 AION - Guia Completo de Setup ($0/mês)

**Bem-vindo ao AION!** Este guia mostra como configurar todo o sistema de IA autônoma rodando 100% grátis usando infraestrutura em nuvem gratuita.

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Pré-requisitos](#pré-requisitos)
3. [Parte 1: Configurar APIs Gratuitas](#parte-1-configurar-apis-gratuitas)
4. [Parte 2: Coletar Dados de Treino](#parte-2-coletar-dados-de-treino)
5. [Parte 3: Fine-Tuning LoRA (Colab)](#parte-3-fine-tuning-lora-colab)
6. [Parte 4: Servidor de Inferência (Colab/Kaggle)](#parte-4-servidor-de-inferência-colabkaggle)
7. [Parte 5: Rotação de GPUs](#parte-5-rotação-de-gpus)
8. [Solução de Problemas](#solução-de-problemas)

---

## Visão Geral

### O que você vai construir

Um sistema de IA completo que:

- ✅ **Usa APIs gratuitas** (Groq 14.4k/dia + Gemini 1.5k/dia + HuggingFace 720/dia)
- ✅ **Treina modelo próprio** usando LoRA em GPU grátis (~500h/mês)
- ✅ **Rotaciona GPUs automaticamente** (Colab → Kaggle → Modal)
- ✅ **100% sem censura** (você controla dados e políticas)
- ✅ **Custo: $0/mês**

### Arquitetura Final

```
┌─────────────────────────────────────────────────┐
│ REPLIT (Always-On)                               │
│ • Frontend React (Chat + Admin)                 │
│ • Backend Node.js (APIs + Orquestrador)         │
│ • PostgreSQL (Neon) - Knowledge Base            │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ CAMADA DE INFERÊNCIA (Rotação Automática)      │
│                                                  │
│ ┌─────────────┐  ┌─────────────┐               │
│ │ APIs Grátis │  │ GPUs Grátis │               │
│ │ (Fallback)  │  │ (LoRA)      │               │
│ │             │  │             │               │
│ │ • Groq      │  │ Seg-Qua:    │               │
│ │ • Gemini    │  │ Colab       │               │
│ │ • HF        │  │             │               │
│ │             │  │ Qui-Sex:    │               │
│ │             │  │ Kaggle      │               │
│ │             │  │             │               │
│ │             │  │ Sab-Dom:    │               │
│ │             │  │ Modal       │               │
│ └─────────────┘  └─────────────┘               │
└─────────────────────────────────────────────────┘
```

---

## Pré-requisitos

### Contas Gratuitas Necessárias

1. **Google Account** (para Colab + Drive)
2. **Kaggle Account** (kaggle.com)
3. **Modal Account** (modal.com)
4. **Groq Account** (console.groq.com)
5. **Google AI Studio** (ai.google.dev)
6. **HuggingFace Account** (huggingface.co)
7. **Ngrok Account** (ngrok.com) - opcional mas recomendado

### Tempo Estimado

- Setup inicial: **30 minutos**
- Primeiro fine-tuning: **8-12 horas** (automático)
- Total: **~1 dia** (incluindo treino)

---

## Parte 1: Configurar APIs Gratuitas

### 1.1. Groq API (14,400 req/dia grátis)

1. Acesse [console.groq.com](https://console.groq.com)
2. Faça login/cadastro
3. Vá em **API Keys** → **Create API Key**
4. Copie a chave gerada
5. No AION Replit, configure:
   ```bash
   # Via UI Admin:
   Admin Dashboard → Settings → API Keys → Add Groq Key
   
   # Ou via ambiente (secrets):
   GROQ_API_KEY=gsk_...
   ```

### 1.2. Google Gemini (1,500 req/dia grátis)

1. Acesse [ai.google.dev](https://ai.google.dev)
2. Clique em **Get API Key**
3. Copie a chave
4. Configure no AION:
   ```bash
   GEMINI_API_KEY=AIza...
   ```

### 1.3. HuggingFace (720 req/dia grátis)

1. Acesse [huggingface.co](https://huggingface.co)
2. Settings → Access Tokens → New token
3. Nome: "AION Access" (permissões: read)
4. Configure no AION:
   ```bash
   HF_API_KEY=hf_...
   ```

### 1.4. Testar APIs

Execute via Admin Dashboard ou curl:

```bash
# Testar status de todas as APIs
curl https://sua-url.repl.co/api/llm/status

# Resposta esperada:
{
  "providers": {
    "groq": {"limit": 14400, "used": 0, "remaining": 14400},
    "gemini": {"limit": 1500, "used": 0, "remaining": 1500},
    "hf": {"limit": 720, "used": 0, "remaining": 720}
  },
  "summary": {
    "totalRemaining": 16620,
    "totalLimit": 16620
  }
}
```

✅ **Checkpoint 1**: Você agora tem ~16k requisições gratuitas por dia!

---

## Parte 2: Coletar Dados de Treino

### 2.1. Usar o AION Normalmente

Durante 1-2 semanas, use o AION normalmente via chat. O sistema coletará automaticamente conversas de alta qualidade para treino.

**Dica:** Quanto mais você usar, melhor o modelo ficará treinado para seu domínio específico.

### 2.2. Verificar Dados Disponíveis

```bash
# Via API
curl https://sua-url.repl.co/api/training/stats?tenant_id=1

# Resposta esperada:
{
  "stats": {
    "totalExamples": 1250,
    "avgInstructionLength": 145,
    "avgOutputLength": 320,
    "totalTokens": 580000
  },
  "validation": {
    "valid": true,
    "errors": [],
    "warnings": []
  },
  "ready": true
}
```

**Recomendação mínima:** 
- ✅ 1000+ exemplos (ideal: 5000+)
- ✅ ~500k+ tokens totais
- ✅ Conversas diversificadas

### 2.3. Exportar Dataset

```bash
# Preparar dataset JSONL para treino
curl -X POST https://sua-url.repl.co/api/training/prepare \
  -H "Content-Type: application/json" \
  -d '{"tenant_id": 1}'

# Resposta:
{
  "success": true,
  "filepath": "/workspace/training/data/training_2025-10-29.jsonl",
  "stats": { ... }
}
```

### 2.4. Download do Arquivo

O arquivo `.jsonl` foi salvo no servidor Replit. Para usar no Colab:

**Opção A - Via Google Drive (recomendado):**
```bash
# No shell do Replit:
cp training/data/training_*.jsonl /tmp/dataset.jsonl

# Depois, faça upload manual para seu Google Drive em:
# /MyDrive/aion/data/training_data.jsonl
```

**Opção B - Via API direta:**
O notebook Colab pode baixar via API (implementado nos notebooks).

✅ **Checkpoint 2**: Dataset de treino pronto!

---

## Parte 3: Fine-Tuning LoRA (Colab)

### 3.1. Preparar Google Colab

1. Acesse [colab.research.google.com](https://colab.research.google.com)
2. **Runtime → Change runtime type → GPU (T4)**
3. Copie o conteúdo de `training/colab/COLAB_FINE_TUNING.py` para um novo notebook
4. Ou faça upload direto do arquivo `.py`

### 3.2. Configurar Dataset

No notebook Colab, seção "Carregar Dados de Treino":

```python
# Verifique o caminho do dataset
data_path = "/content/drive/MyDrive/aion/data/training_data.jsonl"

# Se não existe, faça upload para o Drive
```

### 3.3. Iniciar Treinamento

Execute célula por célula (Shift+Enter) ou:
- **Runtime → Run all**

**Tempo esperado:**
- Dataset 1k exemplos: ~6h
- Dataset 5k exemplos: ~10h
- Dataset 10k+ exemplos: ~12-15h

**Monitoramento:**
O notebook mostrará logs a cada 10 steps:
```
Step 10/500 | Loss: 1.234 | Time: 45s
Step 20/500 | Loss: 1.102 | Time: 45s
...
```

### 3.4. Salvamento Automático

Checkpoints são salvos automaticamente no Google Drive a cada 50 steps:
```
/MyDrive/aion/checkpoints/
  ├── checkpoint-50/
  ├── checkpoint-100/
  └── ...
```

Adaptadores finais:
```
/MyDrive/aion/lora_adapters/latest/
  ├── adapter_config.json
  ├── adapter_model.safetensors (~200MB)
  └── tokenizer files
```

### 3.5. Validação

Ao final do treino, o notebook executa teste automático:

```
🧪 TESTE RÁPIDO DO MODELO
=====================================
Prompt: Olá! Como você está?
Resposta: Olá! Estou funcionando perfeitamente...

✅ Modelo funcionando corretamente!
```

✅ **Checkpoint 3**: Modelo próprio treinado e salvo!

---

## Parte 4: Servidor de Inferência (Colab/Kaggle)

### 4.1. Configurar Ngrok (Obrigatório)

1. Acesse [ngrok.com](https://ngrok.com) e crie conta grátis
2. Dashboard → Your Authtoken
3. Copie o token: `2a... (42 chars)`
4. No notebook de inferência, substitua:
   ```python
   NGROK_AUTH_TOKEN = "SEU_TOKEN_AQUI"  # Cole seu token
   ```

### 4.2. Iniciar Servidor (Colab)

1. Abra novo notebook Colab (GPU T4)
2. Copie conteúdo de `training/colab/COLAB_INFERENCE_SERVER.py`
3. **Importante:** Substitua variáveis:
   ```python
   NGROK_AUTH_TOKEN = "2a..."  # Seu token ngrok
   AION_URL = "https://sua-url.repl.co"  # URL do Replit
   ```
4. Execute todas as células

**Output esperado:**
```
🌐 SERVIDOR PÚBLICO ATIVO!
========================================
🔗 URL pública: https://abc123.ngrok.io

✅ GPU registrada no AION com sucesso!
   O AION agora pode usar esta GPU automaticamente.
```

### 4.3. Verificar Registro

No AION Replit:
```bash
curl https://sua-url.repl.co/api/gpu/status

# Resposta:
{
  "registeredGPUs": {
    "colab": {
      "url": "https://abc123.ngrok.io",
      "status": "healthy",
      "lastCheck": "2025-10-29T10:30:00Z"
    }
  },
  "schedule": {
    "current": "colab",
    "next": "kaggle"
  }
}
```

### 4.4. Testar Inferência

```bash
# Testar via AION
curl -X POST https://sua-url.repl.co/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Olá!"}],
    "tenant_id": 1
  }'

# O AION usará sua GPU automaticamente!
```

✅ **Checkpoint 4**: GPU Colab servindo seu modelo!

---

## Parte 5: Rotação de GPUs

### 5.1. Adicionar Kaggle

Repita Parte 4 usando Kaggle:

1. Acesse [kaggle.com](https://kaggle.com)
2. Create → New Notebook
3. Settings → Accelerator → GPU T4 x2
4. Copie mesmo código do servidor Colab
5. Execute e registre:
   ```python
   "provider": "kaggle"  # Ao invés de "colab"
   ```

### 5.2. Adicionar Modal (Opcional)

1. Acesse [modal.com](https://modal.com)
2. Crie conta (ganhe $30 créditos)
3. Siga guia de deploy do Modal
4. Registre no AION

### 5.3. Configurar Rotação Automática

O orquestrador já faz rotação automática:

```javascript
// server/model/gpu-orchestrator.ts
getScheduledProvider() {
  const day = new Date().getDay();
  
  // Seg-Qua: Colab (12h/dia)
  if (day >= 1 && day <= 3) return "colab";
  
  // Qui-Sex: Kaggle (30h/semana)
  if (day >= 4 && day <= 5) return "kaggle";
  
  // Sab-Dom: Modal (backup)
  return "modal";
}
```

**Resultado:**
- ✅ **Segunda-Quarta:** Colab (12h/dia × 3 = 36h)
- ✅ **Quinta-Sexta:** Kaggle (30h/semana)
- ✅ **Sábado-Domingo:** Modal ($30 créditos)

**Total:** ~500h GPU/mês 100% grátis! 🎉

### 5.4. Monitoramento

Via Admin Dashboard ou API:

```bash
# Status de todas as GPUs
curl https://sua-url.repl.co/api/gpu/status

# Forçar troca de GPU
curl -X POST https://sua-url.repl.co/api/gpu/unregister \
  -d '{"provider": "colab"}'

# Sistema automaticamente usará próxima disponível
```

✅ **Checkpoint 5**: Rotação automática de GPUs configurada!

---

## Solução de Problemas

### Problema: "GPU não disponível" no Colab

**Solução:**
```
Runtime → Change runtime type → GPU → Save
Runtime → Factory reset runtime
```

### Problema: Ngrok tunnel expirou

**Causa:** Sessão Colab hibernou

**Solução:**
1. Execute novamente célula do Ngrok
2. Re-registre GPU via API:
   ```bash
   curl -X POST .../api/gpu/register \
     -d '{"provider": "colab", "ngrok_url": "NOVA_URL"}'
   ```

### Problema: Dataset muito pequeno

**Causa:** Poucas conversas coletadas

**Solução:**
1. Use AION por mais tempo (1-2 semanas)
2. Ou crie dados sintéticos:
   ```bash
   # Gere conversas de exemplo via API
   curl -X POST .../api/chat \
     -d '{"messages": [...], "save_for_training": true}'
   ```

### Problema: API grátis bloqueou

**Causa:** Limite diário atingido

**Solução:**
O AION automaticamente rotaciona para próxima API. Aguarde 24h para reset.

### Problema: Fine-tuning travou

**Causa:** Colab desconectou

**Solução:**
Checkpoints estão salvos no Drive. Continue de onde parou:
```python
# No notebook, modificar:
training_args = TrainingArguments(
    resume_from_checkpoint="/content/drive/.../checkpoint-150"
)
```

---

## 🎉 Parabéns!

Você configurou:
- ✅ ~16k requisições LLM gratuitas por dia
- ✅ ~500h GPU gratuita por mês
- ✅ Modelo próprio treinado (sem censura)
- ✅ Rotação automática de infraestrutura
- ✅ **Custo total: $0/mês**

### Próximos Passos

1. **Use normalmente** - Quanto mais usar, melhor o modelo fica
2. **Re-treine periodicamente** - A cada 5k conversas novas
3. **Experimente hyperparâmetros** - LoRA rank, learning rate, etc.
4. **Compartilhe** - Ajude outros a construir IA livre!

### Recursos Adicionais

- 📖 [Documentação Técnica Completa](./docs/MATHEMATICAL_FOUNDATIONS.md)
- 📊 [Estratégia de GPU & APIs](./docs/FREE_GPU_API_STRATEGY.md)
- 🔬 [19 PDFs de Fundamentos](./docs/pdfs/)
- 💬 [Suporte via Issues](https://github.com/seu-repo/issues)

---

**Made with ❤️ by AION Community**  
*IA Livre, Suprema & Ilimitada*
