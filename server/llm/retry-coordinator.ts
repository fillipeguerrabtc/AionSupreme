/**
 * 🔥 P0.8: Intelligent Retry Coordinator - Enterprise Anti-Prejuízo System
 * 
 * PROBLEMA RESOLVIDO:
 * - Sistema tratava throttle temporário (429 RPM/TPM) como provider morto
 * - Circuit breaker abria incorretamente → Fallback prematuro para OpenAI → 💸 PREJUÍZO
 * 
 * SOLUÇÃO:
 * - Diferencia throttle temporário (soft) vs quota esgotada (hard)
 * - Retry inteligente lendo x-ratelimit-reset-* headers
 * - Verifica PostgreSQL quota ANTES de retry
 * - Respeita orchestration deadline (30s)
 * 
 * @module retry-coordinator
 */

import { log } from '../utils/logger';
import { apiQuotaRepository } from '../repositories/api-quota-repository';

/**
 * Tipo de falha para classificação correta
 */
export enum FailureType {
  /** Throttle temporário (429 por RPM/TPM) - Provider OK, apenas aguardar reset */
  SOFT_THROTTLE = 'SOFT_THROTTLE',
  
  /** Quota esgotada (429 por RPD/TPD) - Provider sem quota disponível */
  QUOTA_EXHAUSTED = 'QUOTA_EXHAUSTED',
  
  /** Falha real (500/503/timeout/network) - Provider com problemas */
  HARD_FAILURE = 'HARD_FAILURE',
}

/**
 * Resultado da análise de 429
 */
export interface ThrottleAnalysis {
  type: FailureType;
  waitMs: number | null;        // Tempo para aguardar antes de retry (null se não deve retry)
  reason: string;               // Motivo legível para logs
  resetTime?: number;           // Timestamp Unix do reset (se disponível)
  quotaUsed?: number;           // Quota atual usada
  quotaLimit?: number;          // Quota limite
}

/**
 * Budget compartilhado de orchestração
 * Garante que retries não ultrapassam deadline de 30s
 */
export class OrchestrationBudget {
  private startTime: number;
  private deadline: number;
  
  constructor(deadlineMs: number = 30000) {
    this.startTime = Date.now();
    this.deadline = deadlineMs;
  }
  
  /**
   * Tempo restante em ms (pode ser negativo se expirado)
   */
  getRemainingMs(): number {
    return this.deadline - (Date.now() - this.startTime);
  }
  
  /**
   * Verifica se tem tempo suficiente para uma operação
   */
  canAfford(requiredMs: number): boolean {
    return this.getRemainingMs() >= requiredMs;
  }
  
  /**
   * Verifica se budget esgotou
   */
  isExpired(): boolean {
    return this.getRemainingMs() <= 0;
  }
}

/**
 * Analisa erro 429 e determina estratégia de retry
 * 
 * LÓGICA ENTERPRISE:
 * 1. Se headers indicam reset <60s E quota DB disponível → SOFT_THROTTLE (retry)
 * 2. Se quota DB esgotada (≥95%) → QUOTA_EXHAUSTED (não retry)
 * 3. Se sem headers OU reset >60s → HARD_FAILURE (circuit breaker)
 */
export async function analyze429Error(
  provider: string,
  error: any,
  headers: Record<string, string>,
  budget: OrchestrationBudget
): Promise<ThrottleAnalysis> {
  // ✅ FIX CRITICAL BUG #1: Check TPD (tokens-per-day) FIRST
  // Groq sends TPD exceeded in error message body, NOT headers!
  if (provider === 'groq' && error.tpdExceeded) {
    log.warn({
      provider,
      tpdLimit: error.tpdLimit,
      tpdUsed: error.tpdUsed,
      component: 'RetryCoordinator'
    }, 'TPD (tokens-per-day) quota exhausted - treating as HARD failure');
    
    // ✅ Persist TPD to provider_limits for dashboard visibility
    try {
      const { providerLimitsTracker } = await import('../services/provider-limits-tracker');
      await providerLimitsTracker.updateGroqTPD(error.tpdLimit, error.tpdUsed);
    } catch (trackerError: any) {
      log.warn({ error: trackerError.message }, 'Failed to persist TPD (non-critical)');
    }
    
    return {
      type: FailureType.QUOTA_EXHAUSTED,
      waitMs: null,
      reason: `TPD (tokens-per-day) exhausted: ${error.tpdUsed}/${error.tpdLimit}`,
      quotaUsed: error.tpdUsed,
      quotaLimit: error.tpdLimit,
    };
  }
  
  // 1. Verificar quota no PostgreSQL ANTES de tudo
  const quota = await apiQuotaRepository.getQuota(provider);
  
  if (!quota) {
    return {
      type: FailureType.HARD_FAILURE,
      waitMs: null,
      reason: `Provider ${provider} not found in quota table`,
    };
  }
  
  // ✅ CRITICAL FIX: Guard against divide-by-zero (architect review finding)
  const requestUsagePercent = quota.dailyRequestLimit && quota.dailyRequestLimit > 0
    ? (quota.requestCount / quota.dailyRequestLimit) * 100
    : 0;
  const tokenUsagePercent = quota.dailyTokenLimit && quota.dailyTokenLimit > 0
    ? (quota.tokenCount / quota.dailyTokenLimit) * 100
    : 0;
  
  const maxUsagePercent = Math.max(requestUsagePercent, tokenUsagePercent);
  
  // ✅ CRITICAL: Se quota ≥95% → QUOTA_EXHAUSTED (não retry)
  if (maxUsagePercent >= 95) {
    log.warn({
      provider,
      requestUsagePercent: requestUsagePercent.toFixed(1),
      tokenUsagePercent: tokenUsagePercent.toFixed(1),
      requestsUsed: quota.requestCount,
      requestsLimit: quota.dailyRequestLimit,
      tokensUsed: quota.tokenCount,
      tokensLimit: quota.dailyTokenLimit,
      component: 'RetryCoordinator'
    }, 'Quota exhausted - treating 429 as HARD failure');
    
    // ✅ FIX: Retornar quota data correta (requestCount É a quota usada!)
    return {
      type: FailureType.QUOTA_EXHAUSTED,
      waitMs: null,
      reason: `Quota exhausted (${maxUsagePercent.toFixed(1)}% used)`,
      quotaUsed: quota.requestCount,  // ✅ FIX: requestCount é a quota usada
      quotaLimit: quota.dailyRequestLimit,  // ✅ FIX: dailyRequestLimit é o limite
    };
  }
  
  // 2. Parsear headers de rate limit (provider-specific)
  let resetTime: number | null = null;
  let usingEstimate = false; // Flag para indicar se é estimativa (sem headers)
  
  if (provider === 'groq') {
    // Groq: x-ratelimit-reset-requests e x-ratelimit-reset-tokens (Unix timestamps em SECONDS)
    const resetRequests = headers['x-ratelimit-reset-requests'];
    const resetTokens = headers['x-ratelimit-reset-tokens'];
    
    if (resetRequests || resetTokens) {
      // ✅ FIX CRITICAL: Headers são Unix timestamps em SECONDS, converter para MS!
      // ✅ FIX: Validate parsed timestamps (prevent NaN)
      const resetReqParsed = resetRequests ? parseInt(resetRequests) : NaN;
      const resetTokParsed = resetTokens ? parseInt(resetTokens) : NaN;
      
      const resetReqTimestamp = (!isNaN(resetReqParsed) && resetReqParsed > 0) ? resetReqParsed * 1000 : Infinity;
      const resetTokTimestamp = (!isNaN(resetTokParsed) && resetTokParsed > 0) ? resetTokParsed * 1000 : Infinity;
      
      resetTime = Math.min(resetReqTimestamp, resetTokTimestamp);
      
      log.debug({
        provider,
        resetRequests,
        resetTokens,
        resetReqMs: resetReqTimestamp,
        resetTokMs: resetTokTimestamp,
        selectedResetMs: resetTime,
        component: 'RetryCoordinator'
      }, 'Parsed Groq rate limit reset headers');
    } else {
      // ✅ FIX: Groq sem headers (raro) → Usar estimate conservador
      resetTime = Date.now() + 30000; // 30s
      usingEstimate = true;
    }
  } else if (provider === 'gemini') {
    // Gemini: Não retorna headers! Usar exponential backoff conservador
    // Reset é midnight Pacific (08:00 UTC) mas não sabemos quando dentro do minuto
    // Estratégia: Aguardar 20s e retry (assume TPM reset + buffer)
    resetTime = Date.now() + 20000; // 20s (aumentado de 15s para segurança)
    usingEstimate = true;
  } else if (provider === 'openrouter') {
    // OpenRouter: Não retorna headers! Usar exponential backoff conservador
    resetTime = Date.now() + 25000; // 25s (aumentado de 20s para segurança)
    usingEstimate = true;
  }
  
  // 3. Calcular waitMs
  if (resetTime !== null) {
    const waitMs = Math.max(0, resetTime - Date.now());
    
    // ✅ CRITICAL: Apenas retry se:
    // - waitMs < 60s (reset rápido)
    // - Budget permite (orchestration não expira)
    // - Quota disponível (já verificado acima)
    
    // ✅ FIX: Providers sem headers (estimativa) → Threshold menor (40s vs 60s)
    // Evita wait muito longo baseado em estimate
    const maxWaitMs = usingEstimate ? 40000 : 60000;
    
    if (waitMs < maxWaitMs && budget.canAfford(waitMs + 5000)) { // +5s buffer para request
      log.info({
        provider,
        waitMs,
        resetTime: new Date(resetTime).toISOString(),
        usingEstimate,
        quotaUsed: quota.requestCount,
        quotaLimit: quota.dailyRequestLimit,
        component: 'RetryCoordinator'
      }, `Soft throttle detected (${usingEstimate ? 'estimated' : 'from headers'}) - scheduling intelligent retry`);
      
      return {
        type: FailureType.SOFT_THROTTLE,
        waitMs,
        reason: usingEstimate 
          ? `Throttled (estimated reset in ${(waitMs / 1000).toFixed(1)}s)` 
          : `Throttled (reset in ${(waitMs / 1000).toFixed(1)}s)`,
        resetTime,
        quotaUsed: quota.requestCount,  // ✅ FIX: requestCount é a quota usada
        quotaLimit: quota.dailyRequestLimit,  // ✅ FIX: dailyRequestLimit é o limite
      };
    } else if (waitMs >= maxWaitMs) {
      // ✅ FIX: Apenas HARD_FAILURE se estimate é muito alto OU headers reais são altos
      // Para estimates, ser conservador mas não bloquear totalmente
      if (usingEstimate && waitMs < 60000) {
        // Estimate entre 40-60s → Tentar mesmo assim (SOFT_THROTTLE)
        const cappedWaitMs = Math.min(waitMs, 40000); // Cap no máximo 40s
        const cappedResetTime = Date.now() + cappedWaitMs; // ✅ FIX CRITICAL: Clamp resetTime também!
        
        log.warn({
          provider,
          originalWaitMs: waitMs,
          cappedWaitMs,
          originalResetTime: new Date(resetTime).toISOString(),
          cappedResetTime: new Date(cappedResetTime).toISOString(),
          maxWaitMs,
          component: 'RetryCoordinator'
        }, 'Estimated wait time high but acceptable - capping and allowing retry');
        
        return {
          type: FailureType.SOFT_THROTTLE,
          waitMs: cappedWaitMs,
          reason: `Throttled (capped wait ${cappedWaitMs / 1000}s)`,
          resetTime: cappedResetTime, // ✅ FIX: resetTime também capped!
          quotaUsed: quota.requestCount,
          quotaLimit: quota.dailyRequestLimit,
        };
      }
      
      return {
        type: FailureType.HARD_FAILURE,
        waitMs: null,
        reason: `Reset time too far (${(waitMs / 1000).toFixed(0)}s > ${maxWaitMs / 1000}s threshold)`,
      };
    } else {
      return {
        type: FailureType.HARD_FAILURE,
        waitMs: null,
        reason: `Insufficient orchestration budget (need ${waitMs}ms, have ${budget.getRemainingMs()}ms)`,
      };
    }
  }
  
  // 4. Sem resetTime (não deve acontecer após fix acima, mas safety net)
  return {
    type: FailureType.HARD_FAILURE,
    waitMs: null,
    reason: 'No rate limit information available',
  };
}

/**
 * Promise-based throttle coordinator por provider
 * Coordena wait times sem queue completa (mantém simplicidade)
 */
export class ThrottleCoordinator {
  private waitingUntil: Record<string, number> = {}; // providerId -> Unix timestamp
  
  /**
   * Aguarda até reset time do provider
   * Retorna true se aguardou, false se budget expirou/cancelou
   * 
   * ✅ FIX: Limpa waiting flag em TODOS os exit paths (previne bloqueio permanente)
   */
  async waitForReset(
    provider: string,
    resetTime: number,
    budget: OrchestrationBudget
  ): Promise<boolean> {
    const waitMs = Math.max(0, resetTime - Date.now());
    
    if (!budget.canAfford(waitMs)) {
      log.warn({
        provider,
        waitMs,
        budgetRemaining: budget.getRemainingMs(),
        component: 'ThrottleCoordinator'
      }, 'Cannot wait - budget insufficient');
      // ✅ FIX: NÃO setar waiting flag se não vai aguardar!
      return false;
    }
    
    // ✅ FIX: Try-finally para garantir cleanup em TODOS os casos
    try {
      this.waitingUntil[provider] = resetTime;
      
      log.info({
        provider,
        waitMs,
        resetTime: new Date(resetTime).toISOString(),
        component: 'ThrottleCoordinator'
      }, 'Waiting for rate limit reset');
      
      await new Promise(resolve => setTimeout(resolve, waitMs));
      
      return true;
    } finally {
      // ✅ FIX CRITICAL: SEMPRE limpa waiting flag (success, error, cancel)
      delete this.waitingUntil[provider];
      
      log.debug({
        provider,
        component: 'ThrottleCoordinator'
      }, 'Cleared waiting flag for provider');
    }
  }
  
  /**
   * Verifica se provider está aguardando reset
   */
  isWaiting(provider: string): boolean {
    const resetTime = this.waitingUntil[provider];
    if (!resetTime) return false;
    return Date.now() < resetTime;
  }
  
  /**
   * Obtém status de todos providers
   */
  getStatus(): Record<string, { waiting: boolean; resetTime?: number }> {
    const status: Record<string, { waiting: boolean; resetTime?: number }> = {};
    
    for (const [provider, resetTime] of Object.entries(this.waitingUntil)) {
      const waiting = Date.now() < resetTime;
      status[provider] = { waiting, resetTime: waiting ? resetTime : undefined };
    }
    
    return status;
  }
}

// Singleton coordinator
export const throttleCoordinator = new ThrottleCoordinator();
