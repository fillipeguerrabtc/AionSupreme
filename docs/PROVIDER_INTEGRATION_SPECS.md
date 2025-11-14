# Provider Integration Specifications (2024)

**⚠️ CRITICAL: Quotas hardcoded errados causam prejuízo financeiro via fallback incorreto para OpenAI!**

## 1. Groq

### Endpoint & Auth
```
Base URL: https://api.groq.com/openai/v1
Auth: Authorization: Bearer $GROQ_API_KEY
```

### FREE TIER QUOTAS (llama-3.1-8b-instant)
- **RPM**: 30 (Requests Per Minute)
- **RPD**: 14,400 (Requests Per Day)  
- **TPM**: 6,000 (Tokens Per Minute)
- **TPD**: 500,000 (Tokens Per Day)

### Real-Time Usage Tracking
✅ **Headers retornados em TODAS as respostas**:
```
x-ratelimit-limit-requests: 14400      (RPD)
x-ratelimit-remaining-requests: 14370  (RPD)
x-ratelimit-limit-tokens: 6000         (TPM)
x-ratelimit-remaining-tokens: 5997     (TPM)
x-ratelimit-reset-requests: 2m59.56s
x-ratelimit-reset-tokens: 7.66s
retry-after: 2                         (apenas em 429)
```

### Implementation
- ✅ Parse headers após cada request
- ✅ Atualizar tracking local com valores reais
- ❌ **NÃO tem API de consulta de quota**

---

## 2. Google Gemini

### Endpoint & Auth
```
Base URL: https://generativelanguage.googleapis.com/v1beta/models/
Auth: ?key=YOUR_API_KEY  (query param)
```

### FREE TIER QUOTAS (Gemini 1.5 Flash)
- **RPM**: 15 (Requests Per Minute)
- **RPD**: 1,500 (Requests Per Day)
- **TPM**: 1,000,000 (Tokens Per Minute)

### Quota Reset
⚠️ **Daily quotas reset at MIDNIGHT PACIFIC TIME** (não UTC!)

### Real-Time Usage Tracking
❌ **NÃO retorna headers de quota**
❌ **NÃO tem API de consulta**
✅ **SOLUÇÃO**: Tracking local via PostgreSQL (llm_provider_quotas)

### Implementation
- ✅ Incrementar contador local após cada request
- ✅ Reset diário às 00:00 Pacific (08:00 UTC)
- ✅ Calcular remaining localmente

---

## 3. HuggingFace Inference

### Endpoint & Auth (DEPRECATED!)
```
❌ OLD (retorna 410 Gone):
Base URL: https://api-inference.huggingface.co/models/
Error: "https://api-inference.huggingface.co is no longer supported"

✅ NEW (Inference Providers Router):
Base URL: https://router.huggingface.co/{provider}/
Auth: Authorization: Bearer hf_xxxxx
```

### FREE TIER QUOTAS
- **Monthly Credits**: $0.10 (free users)
- **Monthly Credits**: $2.00 (PRO users)
- **Rate Limit**: ~few hundred requests/hour (não especificado)

⚠️ **PROBLEMA CRÍTICO**: 
1. Endpoint antigo MORTO (HTTP 410)
2. Novo endpoint requer escolher provider (together, replicate, etc)
3. Billing via HuggingFace account (pay-as-you-go)

### Real-Time Usage Tracking
❌ **NÃO retorna headers de quota**
❌ **NÃO tem API de consulta de uso**
✅ **Billing page**: https://huggingface.co/settings/billing

### Implementation Options
1. **DESATIVAR** temporariamente (endpoint morto)
2. **MIGRAR** para router.huggingface.co com provider específico
3. **REMOVER** do free tier (usar apenas como paid API)

---

## 4. OpenRouter

### Endpoint & Auth
```
Base URL: https://openrouter.ai/api/v1
Auth: Authorization: Bearer YOUR_API_KEY
```

### FREE TIER QUOTAS
- **RPD**: 50 (sem créditos comprados)
- **RPD**: 1,000 (com ≥$10 créditos)
- **RPM**: 20 (ambos tiers)
- **Limite Total**: 200 requests/day (all free models combined)

### Real-Time Usage Tracking
✅ **TEM API DE CONSULTA**:
```bash
curl https://openrouter.ai/api/v1/key \
  -H "Authorization: Bearer YOUR_API_KEY"

Response:
{
  "data": {
    "label": "My Key",
    "usage": 1.23,        # USD spent
    "limit": 10.00,       # Credit limit
    "is_free_tier": true,
    "rate_limit": {
      "requests": 50,     # Daily limit
      "interval": "1d"
    }
  }
}
```

### Implementation
- ✅ Chamar `/api/v1/key` periodicamente (a cada 10 min)
- ✅ Atualizar quotas REAIS no PostgreSQL
- ✅ Alertar quando próximo do limite

---

## QUOTAS REAIS vs HARDCODED

### ❌ ANTES (valores ERRADOS hardcoded):
```typescript
{
  groq: { dailyLimit: 14400, used: 0 },      // ❓ Estimativa
  gemini: { dailyLimit: 1500, used: 0 },     // ❓ Estimativa
  hf: { dailyLimit: 7200, used: 0 },         // ❌ ENDPOINT MORTO!
  openrouter: { dailyLimit: 50, used: 0 }    // ❓ Estimativa
}
```

### ✅ DEPOIS (consulta REAL):
```typescript
{
  groq: { 
    dailyLimit: 14400, 
    used: 40,              // ✅ Via headers x-ratelimit-remaining
    remaining: 14360       // ✅ REAL
  },
  gemini: { 
    dailyLimit: 1500, 
    used: 0,               // ✅ Via tracking PostgreSQL
    remaining: 1500        // ✅ REAL
  },
  hf: { 
    status: 'disabled',    // ❌ Endpoint deprecated
    error: '410 Gone'
  },
  openrouter: { 
    dailyLimit: 1000,      // ✅ Via API /api/v1/key (user tem créditos)
    used: 0,               // ✅ REAL
    remaining: 1000        // ✅ REAL
  }
}
```

---

## ACTION ITEMS

### P0 (CRÍTICO - Prejuízo Financeiro)
1. ✅ Implementar consulta REAL OpenRouter via `/api/v1/key`
2. ✅ Implementar parse de headers Groq (x-ratelimit-*)
3. ❌ Desativar HuggingFace (endpoint 410 Gone)
4. ✅ Atualizar quotas hardcoded com valores REAIS
5. ✅ Dashboard mostrar quotas REAIS (não estimativas)

### P1 (Alto - Funcionalidade)
6. ⚠️ Investigar migração HF para router.huggingface.co
7. ⚠️ Implementar background job de sync (OpenRouter a cada 10min)
8. ⚠️ Alertas quando quota < 20%

### P2 (Médio - Observabilidade)
9. ⚠️ Telemetria de precisão de quotas (real vs estimado)
10. ⚠️ Logs quando fallback acontece por quota (vs erro)

---

## IMPACT ANALYSIS

### Antes (quotas erradas):
```
1. Groq mostra 0/14400 → Circuit breaker OPEN → Pula Groq ❌
2. Gemini mostra 0/1500 → Circuit breaker OPEN → Pula Gemini ❌
3. HuggingFace 401/410 → Circuit breaker OPEN → Pula HF ❌
4. OpenRouter 401 → Circuit breaker OPEN → Pula OpenRouter ❌
5. Fallback para OpenAI → 💰 GASTA DINHEIRO DESNECESSARIAMENTE
```

### Depois (quotas REAIS):
```
1. Groq mostra 40/14400 (headers) → Circuit breaker CLOSED → USA ✅
2. Gemini mostra 0/1500 (tracking) → Circuit breaker CLOSED → USA ✅
3. HuggingFace DISABLED → Pula HF (proposital) ⚠️
4. OpenRouter mostra 0/1000 (API) → Circuit breaker CLOSED → USA ✅
5. OpenAI APENAS quando TODOS falharem → 💰 ECONOMIA MÁXIMA
```

**ECONOMIA ESTIMADA**: 90%+ das requests usando free APIs ao invés de OpenAI!
