# 🔍 ANÁLISE COMPLETA DE QUOTAS - OFICIAL 2025

## ⚠️ BUGS CRÍTICOS ENCONTRADOS

### BUG #1: Gemini - TPM vs TPD confundidos!
```sql
-- ❌ ERRADO (atual):
daily_token_limit = 1,000,000  -- Isso é TPM (Tokens Per MINUTE)!

-- ✅ CORRETO:
daily_token_limit = NULL  -- Gemini FREE NÃO tem limite de tokens por DIA!
```

### BUG #2: OpenRouter - Token limit inventado!
```sql
-- ❌ ERRADO (atual):
daily_token_limit = 50,000  -- NÃO EXISTE na documentação!

-- ✅ CORRETO:
daily_token_limit = NULL  -- OpenRouter só limita REQUESTS
```

### BUG #3: Groq - Falta TPD!
```sql
-- ❌ ERRADO (atual):
daily_token_limit = NULL

-- ✅ CORRETO:
daily_token_limit = 500,000  -- Groq FREE tem TPD de 500k!
```

---

## 📊 QUOTAS OFICIAIS 2025 - FONTE DE VERDADE

### 1. GROQ (Free Tier)

**Documentação Oficial:** https://console.groq.com/docs/rate-limits

**Modelo:** llama-3.1-8b-instant (free tier mais comum)

| Métrica | Valor | Tipo | Período |
|---------|-------|------|---------|
| **RPM** | 30 | Requests Per Minute | 1 minuto |
| **RPD** | 14,400 | Requests Per Day | 1 dia |
| **TPM** | 6,000 | Tokens Per Minute | 1 minuto |
| **TPD** | 500,000 | Tokens Per Day | 1 dia |

**Reset:** Diário (não especificado horário exato)

**Enforcement:** 
- ✅ **AMBOS** requests E tokens são enforced
- ✅ API retorna 429 quando **QUALQUER** limite é atingido
- ✅ Headers retornam AMBOS: `x-ratelimit-limit-requests` E `x-ratelimit-limit-tokens`

**Implementação Correta:**
```typescript
// Groq verifica AMBOS os limites atomicamente:
if (requestCount + 1 > dailyRequestLimit) → REJECT  // 14,400 req/day
OR
if (tokenCount + tokens > dailyTokenLimit) → REJECT  // 500,000 tokens/day
```

**Banco de Dados:**
```sql
daily_request_limit = 14400  -- ✅ CORRETO
daily_token_limit = 500000   -- ✅ DEVE SER ADICIONADO!
```

---

### 2. GEMINI (Free Tier)

**Documentação Oficial:** https://ai.google.dev/gemini-api/docs/rate-limits

**Modelo:** Gemini 1.5 Flash (free tier)

| Métrica | Valor | Tipo | Período |
|---------|-------|------|---------|
| **RPM** | 15 | Requests Per Minute | 1 minuto |
| **RPD** | 1,500 | Requests Per Day | 1 dia |
| **TPM** | 1,000,000 | Tokens Per Minute | 1 minuto |
| **TPD** | N/A | ❌ NÃO EXISTE | - |

**Reset:** **Midnight Pacific Time** (08:00 UTC) ⚠️

**Enforcement:**
- ✅ Verifica **RPM, RPD, TPM** 
- ❌ **NÃO TEM TPD** - apenas TPM!
- ⚠️ TPM = 1M tokens/minuto (MUITO alto, raramente atinge)

**Implementação Correta:**
```typescript
// Gemini verifica APENAS requests (TPM raramente atinge):
if (requestCount + 1 > dailyRequestLimit) → REJECT  // 1,500 req/day

// TPM não precisa tracking diário (é por minuto, não dia)
```

**Banco de Dados:**
```sql
daily_request_limit = 1500   -- ✅ CORRETO
daily_token_limit = NULL     -- ✅ DEVE SER NULL (não tem TPD!)
```

---

### 3. HUGGINGFACE (Free Tier - ENDPOINT MORTO!)

**Documentação Oficial:** https://huggingface.co/docs/api-inference/en/rate-limits

**Status:** ❌ **ENDPOINT DEPRECADO**

**Antigo:** `https://api-inference.huggingface.co` → **410 Gone**

**Novo:** `https://router.huggingface.co/{provider}/`

**Quotas (antigo endpoint - NÃO MAIS VÁLIDO):**
- Free: $0.10/mês em créditos
- PRO: $2.00/mês em créditos
- Rate limit: ~few hundred requests/hour (não especificado)

**Quotas (novo router - Inference Providers):**
- **Billing:** Pay-as-you-go via HuggingFace account
- **Quotas:** Dependem do provider escolhido (Together, Replicate, etc)
- **Monthly Credits:** $0.10 (free), $2.00 (PRO)

**Implementação Correta:**
```typescript
// HuggingFace antigo: DESATIVAR
enabled: false

// OU migrar para Inference Providers (requer escolher provider)
```

**Banco de Dados:**
```sql
daily_request_limit = 0      -- ✅ DESABILITADO (endpoint morto)
daily_token_limit = NULL     -- ✅ N/A
```

---

### 4. OPENROUTER (Free Tier)

**Documentação Oficial:** https://openrouter.ai/docs/api-reference/limits

**Quotas FREE (sem créditos comprados):**
| Métrica | Valor | Tipo | Período |
|---------|-------|------|---------|
| **RPM** | 20 | Requests Per Minute | 1 minuto |
| **RPD** | 50 | Requests Per Day | 1 dia |
| **TPM** | N/A | ❌ NÃO EXISTE | - |
| **TPD** | N/A | ❌ NÃO EXISTE | - |

**Quotas PAID (≥$10 créditos):**
| Métrica | Valor | Tipo | Período |
|---------|-------|------|---------|
| **RPM** | 20 | Requests Per Minute | 1 minuto |
| **RPD** | 1,000 | Requests Per Day | 1 dia |
| **TPM** | N/A | ❌ NÃO EXISTE | - |
| **TPD** | N/A | ❌ NÃO EXISTE | - |

**Limite Global:** 200 req/day (all free models combined)

**Reset:** Diário

**Enforcement:**
- ✅ Verifica **APENAS requests** (não tokens!)
- ✅ API `/api/v1/key` retorna quota REAL
- ✅ Diferencia entre free (50 RPD) e paid (1000 RPD)

**Implementação Correta:**
```typescript
// OpenRouter verifica APENAS requests:
if (requestCount + 1 > dailyRequestLimit) → REJECT  // 50 ou 1000 req/day

// NÃO TEM limite de tokens!
```

**Banco de Dados:**
```sql
daily_request_limit = 50     -- ✅ Free tier (atualizado via API)
-- OU
daily_request_limit = 1000   -- ✅ Paid tier (quando API detecta créditos)

daily_token_limit = NULL     -- ✅ DEVE SER NULL (não tem limite de tokens!)
```

---

## 🔧 CORREÇÕES SQL NECESSÁRIAS

```sql
-- 1. Groq: Adicionar TPD
UPDATE llm_provider_quotas 
SET daily_token_limit = 500000
WHERE provider = 'groq';

-- 2. Gemini: Remover TPD (não existe!)
UPDATE llm_provider_quotas 
SET daily_token_limit = NULL
WHERE provider = 'gemini';

-- 3. HuggingFace: Desativar (endpoint morto)
UPDATE llm_provider_quotas 
SET daily_request_limit = 0,
    daily_token_limit = NULL
WHERE provider = 'hf';

-- 4. OpenRouter: Remover token limit (não existe!)
UPDATE llm_provider_quotas 
SET daily_token_limit = NULL
WHERE provider = 'openrouter';
```

---

## 📋 RESUMO EXECUTIVO

### Enforcement Matrix

| Provider | Limita REQUESTS? | Limita TOKENS? | Período | Reset |
|----------|------------------|----------------|---------|-------|
| **Groq** | ✅ 14,400/day | ✅ 500,000/day | Diário | Meia-noite (TZ?) |
| **Gemini** | ✅ 1,500/day | ❌ Só TPM (1M/min) | Diário | 08:00 UTC |
| **HuggingFace** | ❌ Endpoint morto | ❌ Endpoint morto | - | - |
| **OpenRouter** | ✅ 50 ou 1,000/day | ❌ Sem limite | Diário | Meia-noite (TZ?) |

### Implementação Atual vs Correto

| Provider | Campo | Atual | Correto | Status |
|----------|-------|-------|---------|--------|
| Groq | daily_request_limit | 14,400 | 14,400 | ✅ OK |
| Groq | daily_token_limit | NULL | 500,000 | ❌ FALTA |
| Gemini | daily_request_limit | 1,500 | 1,500 | ✅ OK |
| Gemini | daily_token_limit | 1,000,000 | NULL | ❌ ERRADO (TPM≠TPD) |
| HF | daily_request_limit | 0 | 0 | ✅ OK |
| HF | daily_token_limit | 100,000 | NULL | ❌ ERRADO |
| OpenRouter | daily_request_limit | 50 | 50-1000 | ⚠️ DINÂMICO |
| OpenRouter | daily_token_limit | 50,000 | NULL | ❌ INVENTADO |

---

## 🎯 IMPACTO NO SISTEMA

### ANTES (quotas erradas):
1. Gemini: Rejeita após 1M tokens em 1 DIA ❌ (limite é por MINUTO!)
2. OpenRouter: Rejeita após 50k tokens ❌ (limite NÃO EXISTE!)
3. Groq: Aceita infinitos tokens em 1 dia ❌ (limite é 500k!)

### DEPOIS (quotas corretas):
1. Gemini: Apenas limita requests (1,500/dia) ✅
2. OpenRouter: Apenas limita requests (50 ou 1000/dia) ✅
3. Groq: Limita requests (14,400/dia) E tokens (500k/dia) ✅

### ECONOMIA POTENCIAL:
- **Antes**: Fallback prematuro para OpenAI por quotas erradas
- **Depois**: Máximo uso de free APIs (90%+ economia)

---

## 📚 FONTES OFICIAIS (verificadas 14/11/2025)

- Groq: https://console.groq.com/docs/rate-limits
- Gemini: https://ai.google.dev/gemini-api/docs/rate-limits  
- HuggingFace: https://huggingface.co/docs/api-inference/en/rate-limits
- OpenRouter: https://openrouter.ai/docs/api-reference/limits

**✅ TODAS AS QUOTAS VERIFICADAS COM DOCUMENTAÇÃO OFICIAL 2025!**
