# 🛡️ SISTEMA ANTI-PREJUÍZO ENTERPRISE-GRADE

## 📋 RESUMO EXECUTIVO

**PROBLEMA RESOLVIDO:**
Sistema tratava throttle temporário (429 RPM/TPM) como "provider morto" → Circuit breaker abria → Fallback prematuro para OpenAI → 💸 **PREJUÍZO FINANCEIRO REAL**

**SOLUÇÃO IMPLEMENTADA:**
- Retry inteligente lendo `x-ratelimit-reset-*` headers
- Circuit breaker diferencia SOFT_THROTTLE vs HARD_FAILURE
- Verificação PostgreSQL quota ANTES de retry
- Orchestration budget (30s) respeitado
- Throttle coordinator (promise-based, leve)

**RESULTADO ESPERADO:**
- ✅ Máximo uso de free APIs (até 99% quota)
- ✅ OpenAI APENAS quando quota realmente esgotada
- ✅ Circuit breaker APENAS para problemas reais
- ✅ ZERO prejuízo financeiro

---

## 🏗️ ARQUITETURA

### Componentes Implementados

#### 1. **RetryCoordinator** (`server/llm/retry-coordinator.ts`)

**Responsabilidades:**
- Analisar erros 429 (rate limit)
- Diferenciar throttle temporário vs quota esgotada
- Calcular tempo de espera inteligente
- Coordenar retries sem desperdiçar quota

**Classes/Funções:**

##### `FailureType` enum
```typescript
enum FailureType {
  SOFT_THROTTLE,      // 429 temporário (RPM/TPM) - Provider OK
  QUOTA_EXHAUSTED,    // 429 permanente (RPD/TPD esgotado)
  HARD_FAILURE        // 500/503/timeout - Provider com problemas
}
```

##### `OrchestrationBudget` class
```typescript
// Garante retries não ultrapassam 30s deadline
class OrchestrationBudget {
  getRemainingMs(): number;
  canAfford(requiredMs): boolean;
  isExpired(): boolean;
}
```

##### `analyze429Error()` function
```typescript
async function analyze429Error(
  provider: string,
  error: any,
  headers: Record<string, string>,
  budget: OrchestrationBudget
): Promise<ThrottleAnalysis>
```

**Lógica ENTERPRISE:**
```
1. Verificar quota PostgreSQL:
   - Se quota ≥95% → QUOTA_EXHAUSTED (não retry)
   
2. Parsear headers provider-specific:
   - Groq: x-ratelimit-reset-requests + x-ratelimit-reset-tokens
   - Gemini: Estimate 20s (sem headers)
   - OpenRouter: Estimate 25s (sem headers)
   
3. Calcular waitMs e decidir:
   - waitMs <40s (estimate) ou <60s (headers) E budget permite → SOFT_THROTTLE
   - waitMs muito alto OU sem budget → HARD_FAILURE
```

##### `ThrottleCoordinator` class
```typescript
// Promise-based scheduler (leve, sem queue completa)
class ThrottleCoordinator {
  async waitForReset(provider, resetTime, budget): Promise<boolean>;
  isWaiting(provider): boolean;
  getStatus(): Record<string, {waiting, resetTime}>;
}
```

---

#### 2. **LLMCircuitBreaker Enhancement** (`server/llm/llm-circuit-breaker.ts`)

**Modificação Principal:**
```typescript
async recordFailure(
  error?: string,
  failureType: 'SOFT_THROTTLE' | 'QUOTA_EXHAUSTED' | 'HARD_FAILURE' = 'HARD_FAILURE'
): Promise<void>
```

**Comportamento NOVO:**

| FailureType | Incrementa failureCount? | Abre Circuit? | Persiste DB? | Uso |
|-------------|-------------------------|---------------|--------------|-----|
| **SOFT_THROTTLE** | ❌ NÃO | ❌ NÃO | ✅ SIM (lastFailureTime) | Throttle temporário (429 RPM/TPM) |
| **QUOTA_EXHAUSTED** | ✅ SIM | ✅ SIM (threshold) | ✅ SIM | Quota esgotada (429 RPD/TPD) |
| **HARD_FAILURE** | ✅ SIM | ✅ SIM (threshold) | ✅ SIM | Erros reais (500/503/timeout) |

**Logging:**
- SOFT_THROTTLE: `log.info("Soft throttle detected - NOT counting as failure")`
- QUOTA_EXHAUSTED/HARD: `log.warn("${failureType} detected - failure count incremented")`

---

## 🔄 FLUXO DE RETRY INTELIGENTE

### Cenário 1: Throttle Temporário (SUCCESS)

```
1. callGroq → 35 requests/min → HTTP 429
2. Headers: x-ratelimit-reset-requests = "Unix timestamp em 45s"
3. analyze429Error():
   - Quota DB: 40/14,400 (0.3%) ✅ Disponível
   - Reset em: 45s ✅ < 60s threshold
   - Budget: 25s restante ✅ Suficiente
   → SOFT_THROTTLE, waitMs=45s
   
4. ThrottleCoordinator.wait(45s)
5. Retry callGroq → SUCCESS ✅
6. Circuit Breaker: recordFailure(error, 'SOFT_THROTTLE')
   → NÃO incrementa failureCount
   → Circuit PERMANECE HEALTHY ✅
   
RESULTADO: Zero uso OpenAI! Groq usou 41/14,400 requests.
```

### Cenário 2: Quota Esgotada (FALLBACK)

```
1. callGroq → HTTP 429
2. analyze429Error():
   - Quota DB: 13,680/14,400 (95%) ❌ Esgotada!
   → QUOTA_EXHAUSTED, waitMs=null
   
3. Circuit Breaker: recordFailure(error, 'QUOTA_EXHAUSTED')
   → Incrementa failureCount
   → 3 failures → Circuit OPEN
   
4. Próximas requests → Circuit OPEN → Groq BLOQUEADO
5. Fallback → Gemini → OpenRouter → OpenAI ✅
   
RESULTADO: OpenAI usado CORRETAMENTE (quota Groq realmente esgotada)
```

### Cenário 3: Provider com Problema (FALLBACK)

```
1. callGroq → HTTP 503 (Service Unavailable)
2. Error não é 429 → Vai direto para catch
3. Circuit Breaker: recordFailure(error, 'HARD_FAILURE')
   → Incrementa failureCount
   → 3 failures → Circuit OPEN
   
4. Fallback → Gemini → OpenRouter → OpenAI ✅
   
RESULTADO: OpenAI usado CORRETAMENTE (Groq realmente offline)
```

---

## 📊 PROVIDER-SPECIFIC LOGIC

### Groq
- **Headers:** ✅ `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`
- **Strategy:** Ler headers, aguardar até menor reset time
- **Fallback:** Se sem headers (raro) → Estimate 30s
- **Max Wait:** 60s (headers reais)

### Gemini
- **Headers:** ❌ Não retorna
- **Strategy:** Estimate conservador 20s
- **Reason:** TPM reset rápido (1M/min raramente atinge)
- **Max Wait:** 40s (estimate)

### OpenRouter
- **Headers:** ❌ Não retorna
- **Strategy:** Estimate conservador 25s
- **Reason:** RPM/RPD reset, sem info exata
- **Max Wait:** 40s (estimate)

---

## ⚙️ INTEGRAÇÃO (TODO - P0.8b, P0.8c, P0.8d)

### callGroq Integration (PENDING)
```typescript
async function callGroq(req: LLMRequest, orchestrationRemainingMs?: number) {
  const budget = new OrchestrationBudget(orchestrationRemainingMs || 30000);
  
  try {
    // ... existing code ...
  } catch (error: any) {
    if (error.status === 429) {
      // ✅ NEW: Intelligent retry with headers
      const analysis = await analyze429Error('groq', error, headers, budget);
      
      if (analysis.type === FailureType.SOFT_THROTTLE && analysis.waitMs) {
        // Aguardar reset
        const waited = await throttleCoordinator.waitForReset('groq', analysis.resetTime!, budget);
        
        if (waited) {
          // Retry SEM incrementar quota!
          continue; // Retry loop
        }
      }
      
      // ✅ NEW: Record com tipo correto
      const breaker = await llmCircuitBreakerManager.getBreaker('groq');
      await breaker.recordFailure(error.message, analysis.type);
      throw error;
    }
    
    // Outros erros → HARD_FAILURE
    const breaker = await llmCircuitBreakerManager.getBreaker('groq');
    await breaker.recordFailure(error.message, 'HARD_FAILURE');
    throw error;
  }
}
```

---

## 🎯 TESTES NECESSÁRIOS (P0.8f)

### Integration Tests

#### Test 1: Soft Throttle Retry
```typescript
// Simular: Groq 429 + headers reset 30s + quota disponível
// Expected: Aguarda 30s + retry + SUCCESS + circuit HEALTHY
```

#### Test 2: Quota Exhausted Fallback
```typescript
// Simular: Groq 429 + quota 95% + OpenAI disponível
// Expected: Circuit OPEN + fallback OpenAI + SUCCESS
```

#### Test 3: Hard Failure Fallback
```typescript
// Simular: Groq 503 (3x)
// Expected: Circuit OPEN + fallback Gemini + SUCCESS
```

#### Test 4: Budget Expired
```typescript
// Simular: Groq 429 + reset 50s + budget 20s restante
// Expected: HARD_FAILURE + fallback
```

---

## 📈 TELEMETRIA (Frontend - P0.8e)

### Dashboard Display

**Estado Atual:**
```
Provider: Groq
Status: Online ✅
Quota: 40/14,400 (0.3%)
```

**Estado NOVO (com throttle info):**
```
Provider: Groq
Status: Throttled ⏸️ (reset in 45s)
Quota: 40/14,400 (0.3%) ✅ Available
Circuit: HEALTHY
```

**Estados possíveis:**
- ✅ **Online**: Circuit CLOSED, quota disponível
- ⏸️ **Throttled**: Soft throttle (429 RPM/TPM), aguardando reset
- 🚫 **Quota Exhausted**: Quota ≥95%, circuit pode estar OPEN
- ❌ **Offline**: Hard failure (500/503), circuit OPEN
- 🔄 **Recovering**: Circuit HALF_OPEN

---

## 🔍 OBSERVABILITY

### Logs ENTERPRISE

**SOFT_THROTTLE:**
```json
{
  "level": "info",
  "provider": "groq",
  "waitMs": 45000,
  "resetTime": "2025-11-14T20:00:00Z",
  "usingEstimate": false,
  "quotaUsed": 40,
  "quotaLimit": 14400,
  "component": "RetryCoordinator",
  "msg": "Soft throttle detected (from headers) - scheduling intelligent retry"
}
```

**QUOTA_EXHAUSTED:**
```json
{
  "level": "warn",
  "provider": "groq",
  "requestUsagePercent": 95.5,
  "tokenUsagePercent": 92.3,
  "component": "RetryCoordinator",
  "msg": "Quota exhausted - treating 429 as HARD failure"
}
```

**Circuit Breaker:**
```json
{
  "level": "info",
  "providerId": "groq",
  "providerName": "groq",
  "component": "LLMCircuitBreaker",
  "msg": "Soft throttle detected - NOT counting as failure (circuit stays healthy)"
}
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [x] P0.8a: RetryCoordinator implementation
- [x] P0.8a: LLMCircuitBreaker enhancement
- [x] P0.8a: Architect approval
- [x] Bug #1: Fix provider-sem-headers fallback
- [x] Bug #2: Improve estimate-based retry logic
- [ ] P0.8b: Integrate callGroq
- [ ] P0.8c: Integrate callGemini
- [ ] P0.8d: Integrate callOpenRouter
- [ ] P0.8e: Frontend telemetria update
- [ ] P0.8f: Integration tests
- [ ] Final architect review
- [ ] E2E testing with real scenarios

---

## 💰 IMPACTO FINANCEIRO

### ANTES (Prejuízo REAL)
```
Groq: 40/14,400 requests (0.3% usado)
Burst: 35 requests/min → 429
→ 3 retries fail (1s, 2s, 4s)
→ Circuit OPEN
→ Fallback: Gemini → OpenRouter → OpenAI 💸

CUSTO: OpenAI usado com 99.7% quota Groq DISPONÍVEL!
Perda: ~$0.002/request × 14,000 requests = ~$28/dia desperdiçados
```

### DEPOIS (Sistema Anti-Prejuízo)
```
Groq: 40/14,400 requests (0.3% usado)
Burst: 35 requests/min → 429
→ analyze429Error(): quota 0.3%, reset 45s → SOFT_THROTTLE
→ ThrottleCoordinator.wait(45s)
→ Retry Groq → SUCCESS ✅
→ Circuit: HEALTHY (soft não conta)

CUSTO: $0 (free API)
Economia: ~$28/dia = ~$840/mês = ~$10,080/ano
```

**ROI:** Sistema se paga IMEDIATAMENTE (zero custo OpenAI desnecessário)

---

## 🎓 LIÇÕES APRENDIDAS

1. **Throttle ≠ Failure**: 429 RPM/TPM é temporário, não deve abrir circuit
2. **Headers são OURO**: x-ratelimit-reset-* evita guesswork
3. **Quota Check PRIMEIRO**: Verificar DB antes de retry evita desperdício
4. **Budget é CRITICAL**: Retries devem respeitar deadline orchestração
5. **Estimates são OK**: Providers sem headers podem usar backoff conservador
6. **Logging salva vidas**: Observability detalhada para debug production

---

**Status:** ✅ Core implementado, integrações PENDING
**Next:** P0.8b (callGroq), P0.8c (callGemini), P0.8d (callOpenRouter), P0.8e (Frontend), P0.8f (Tests)
