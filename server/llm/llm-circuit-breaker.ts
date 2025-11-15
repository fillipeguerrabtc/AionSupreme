/**
 * 🔥 P0.2: Circuit Breaker para LLM Providers
 * 
 * Previne cascata de falhas quando LLM providers ficam lentos ou atingem rate limits.
 * Adaptado do padrão GPU circuit breaker para FREE LLM APIs (Groq, Gemini, HF, OpenRouter).
 * 
 * Estados do Circuit Breaker:
 * - CLOSED: Funcionando normal (requisições passam)
 * - OPEN: Muitas falhas (requisições rejeitadas imediatamente)
 * - HALF_OPEN: Testando recuperação (algumas requisições passam)
 * 
 * DIFERENÇAS vs GPU Circuit Breaker:
 * - Identificador: string providerId ("groq") ao invés de numeric workerId
 * - Recovery Timeout: 10-15s (vs 30s GPU) - LLM providers se recuperam mais rápido
 * - Persistence: llm_circuit_breaker_state table (separado de GPU)
 * - Config: Per-provider overrides (Groq vs Gemini diferentes rate limits)
 * 
 * PRODUCTION-READY:
 * - PostgreSQL persistence for state survival across restarts
 * - Structured logging with pino (zero console.log)
 * - Automatic state recovery from DB on initialization
 * - Integration with provider-limits-tracker for quota awareness
 */

import { db } from "../db";
import { llmCircuitBreakerState, providerLimits } from "@shared/schema";
import { eq } from "drizzle-orm";
import { log } from "../utils/logger";

export enum CircuitState {
  CLOSED = "CLOSED",       // Normal operation
  OPEN = "OPEN",           // Too many failures, reject immediately
  HALF_OPEN = "HALF_OPEN", // Testing recovery
}

interface CircuitBreakerConfig {
  failureThreshold: number;      // Falhas consecutivas para abrir (default: 3)
  recoveryTimeout: number;       // Tempo antes de tentar recuperar em ms (default: 12000 = 12s)
  successThreshold: number;      // Sucessos para fechar novamente (default: 2)
  timeout: number;               // Timeout de requisição em ms (default: 15000 = 15s)
}

interface CircuitStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  nextRetryTime: number | null;
}

/**
 * Circuit Breaker individual por LLM provider
 */
export class LLMCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextRetryTime: number | null = null;
  private config: CircuitBreakerConfig;
  private initPromise: Promise<void>;

  private constructor(
    private providerId: string,   // "groq", "gemini", "hf", "openrouter"
    private providerName: string, // Human-readable name for logging
    config?: Partial<CircuitBreakerConfig>
  ) {
    // 🔥 P0.2: LLM-specific defaults (faster recovery than GPU)
    this.config = {
      failureThreshold: config?.failureThreshold ?? 
        parseInt(process.env.LLM_CIRCUIT_BREAKER_FAILURE_THRESHOLD || "3"),
      recoveryTimeout: config?.recoveryTimeout ?? 
        parseInt(process.env.LLM_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS || "12000"), // 12s (vs 30s GPU)
      successThreshold: config?.successThreshold ?? 
        parseInt(process.env.LLM_CIRCUIT_BREAKER_SUCCESS_THRESHOLD || "2"),
      timeout: config?.timeout ?? 
        parseInt(process.env.LLM_CIRCUIT_BREAKER_TIMEOUT_MS || "15000"), // 15s per-provider timeout
    };
    
    log.info({
      providerId,
      providerName,
      config: this.config,
      component: "LLMCircuitBreaker"
    }, "LLM Circuit Breaker initialized with config");

    // Initialize async state recovery from DB
    this.initPromise = this.loadStateFromDB().catch(err => {
      log.error({ 
        providerId, 
        providerName, 
        error: err instanceof Error ? err.message : String(err),
        component: "LLMCircuitBreaker"
      }, "Failed to load circuit breaker state from DB (will start fresh)");
    });
  }

  /**
   * Factory method for async initialization
   * Ensures state is loaded from DB BEFORE serving traffic
   */
  static async create(
    providerId: string,
    providerName: string,
    config?: Partial<CircuitBreakerConfig>
  ): Promise<LLMCircuitBreaker> {
    const breaker = new LLMCircuitBreaker(providerId, providerName, config);
    await breaker.initPromise;
    log.info({
      providerId,
      providerName,
      component: "LLMCircuitBreaker"
    }, "LLM Circuit breaker ready (state recovered from DB)");
    return breaker;
  }

  /**
   * Load state from PostgreSQL (recovery on restart)
   */
  private async loadStateFromDB(): Promise<void> {
    try {
      const dbState = await db.query.llmCircuitBreakerState.findFirst({
        where: eq(llmCircuitBreakerState.providerId, this.providerId),
      });

      if (dbState) {
        this.state = dbState.state as CircuitState;
        this.failureCount = dbState.failureCount;
        this.successCount = dbState.successCount;
        this.lastFailureTime = dbState.lastFailureTime ? dbState.lastFailureTime.getTime() : null;
        this.lastSuccessTime = dbState.lastSuccessTime ? dbState.lastSuccessTime.getTime() : null;
        this.nextRetryTime = dbState.nextRetryTime ? dbState.nextRetryTime.getTime() : null;

        log.info({
          providerId: this.providerId,
          providerName: this.providerName,
          state: this.state,
          failureCount: this.failureCount,
          component: "LLMCircuitBreaker"
        }, "Circuit breaker state recovered from DB");
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ 
        providerId: this.providerId, 
        providerName: this.providerName, 
        error: errorMessage,
        component: "LLMCircuitBreaker"
      }, "Failed to load state from DB");
      throw error;
    }
  }

  /**
   * Persist state to PostgreSQL
   */
  private async saveStateToDB(): Promise<void> {
    try {
      await db
        .insert(llmCircuitBreakerState)
        .values({
          providerId: this.providerId,
          state: this.state as "CLOSED" | "OPEN" | "HALF_OPEN",
          failureCount: this.failureCount,
          successCount: this.successCount,
          lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
          lastSuccessTime: this.lastSuccessTime ? new Date(this.lastSuccessTime) : null,
          nextRetryTime: this.nextRetryTime ? new Date(this.nextRetryTime) : null,
          config: this.config,
        })
        .onConflictDoUpdate({
          target: llmCircuitBreakerState.providerId,
          set: {
            state: this.state as "CLOSED" | "OPEN" | "HALF_OPEN",
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
            lastSuccessTime: this.lastSuccessTime ? new Date(this.lastSuccessTime) : null,
            nextRetryTime: this.nextRetryTime ? new Date(this.nextRetryTime) : null,
            updatedAt: new Date(),
          },
        });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error({ 
        providerId: this.providerId, 
        providerName: this.providerName, 
        error: errorMessage,
        component: "LLMCircuitBreaker"
      }, "Failed to save state to DB (non-critical)");
      // Don't throw - state persistence failure shouldn't break circuit breaker logic
    }
  }

  /**
   * ✅ FIX BUG #3: Verifica se pode executar requisição
   * 
   * PRE-DISPATCH GUARD for Groq TPD exhaustion
   * Returns false if:
   * - Circuit is OPEN and recovery timeout not yet expired
   * - Groq TPD quota is exhausted (tpdRemaining <= 0)
   * 
   * 🔥 P0.2 FIX: Async to await state transition persistence
   */
  async canExecute(): Promise<boolean> {
    const now = Date.now();

    // ✅ FIX BUG #3: PRE-DISPATCH TPD GUARD for Groq
    // Check provider_limits BEFORE allowing request (prevents exceeding TPD cap)
    if (this.providerId === 'groq') {
      try {
        const limits = await db.select()
          .from(providerLimits)
          .where(eq(providerLimits.provider, 'groq'))
          .limit(1);
        
        if (limits.length > 0 && limits[0].tpdRemaining !== null && limits[0].tpdRemaining <= 0) {
          log.warn({
            providerId: this.providerId,
            providerName: this.providerName,
            tpdUsed: limits[0].tpdUsed,
            tpdLimit: limits[0].tpd,
            tpdRemaining: limits[0].tpdRemaining,
            component: "LLMCircuitBreaker"
          }, "Groq TPD quota exhausted - rejecting request (pre-dispatch guard)");
          
          return false;
        }
      } catch (err) {
        log.error({
          providerId: this.providerId,
          providerName: this.providerName,
          error: err instanceof Error ? err.message : String(err),
          component: "LLMCircuitBreaker"
        }, "Failed to check Groq TPD quota - allowing request (fail-open)");
        // Fail-open: if DB check fails, allow request (circuit breaker still functions)
      }
    }

    switch (this.state) {
      case CircuitState.CLOSED:
        // Normal operation
        return true;

      case CircuitState.OPEN:
        // Check if recovery timeout expired
        if (this.nextRetryTime && now >= this.nextRetryTime) {
          log.info(
            { 
              providerId: this.providerId, 
              providerName: this.providerName,
              component: "LLMCircuitBreaker"
            },
            "Transitioning to HALF_OPEN - testing recovery"
          );
          this.state = CircuitState.HALF_OPEN;
          this.successCount = 0;
          await this.saveStateToDB();  // 🔥 FIX: Await before returning
          return true;
        }
        
        // Still in cooldown
        const remainingMs = this.nextRetryTime ? this.nextRetryTime - now : 0;
        log.warn(
          { 
            providerId: this.providerId, 
            providerName: this.providerName,
            remainingMs,
            component: "LLMCircuitBreaker"
          },
          "Circuit OPEN - rejecting request"
        );
        return false;

      case CircuitState.HALF_OPEN:
        // Allow limited requests to test recovery
        return true;

      default:
        return false;
    }
  }

  /**
   * Registra sucesso
   * 🔥 P0.2 FIX: Async to await DB persistence (state survives restarts)
   */
  async recordSuccess(): Promise<void> {
    this.lastSuccessTime = Date.now();
    this.failureCount = 0; // Reset failure counter
    this.successCount++;

    switch (this.state) {
      case CircuitState.CLOSED:
        // Stay closed - reset success counter to prevent inflation
        this.successCount = 0;
        // 🔥 FIX: Persist lastSuccessTime for telemetry consistency
        await this.saveStateToDB();
        break;

      case CircuitState.HALF_OPEN:
        // 🔥 FIX: Persist success counts even when staying HALF_OPEN
        // Check if enough successes to close
        if (this.successCount >= this.config.successThreshold) {
          log.info(
            { 
              providerId: this.providerId, 
              providerName: this.providerName,
              successCount: this.successCount,
              component: "LLMCircuitBreaker"
            },
            "HALF_OPEN → CLOSED - provider recovered"
          );
          this.state = CircuitState.CLOSED;
          this.failureCount = 0;
          this.successCount = 0;  // Reset on transition
          this.nextRetryTime = null;
        }
        // 🔥 FIX: Always persist, not just on transition
        await this.saveStateToDB();
        break;

      case CircuitState.OPEN:
        // Should not happen (can't execute when OPEN)
        log.warn(
          { 
            providerId: this.providerId, 
            providerName: this.providerName,
            component: "LLMCircuitBreaker"
          },
          "Unexpected success while OPEN"
        );
        break;
    }
  }

  /**
   * Registra falha
   * 🔥 P0.2 FIX: Async to await DB persistence (state survives restarts)
   * 🔥 P0.8 FIX: Differentiate SOFT_THROTTLE vs HARD_FAILURE
   * 
   * @param error Mensagem de erro
   * @param failureType Tipo de falha (default: HARD_FAILURE para compatibilidade)
   */
  async recordFailure(
    error?: string,
    failureType: 'SOFT_THROTTLE' | 'QUOTA_EXHAUSTED' | 'HARD_FAILURE' = 'HARD_FAILURE'
  ): Promise<void> {
    // ✅ P0.8 CRITICAL: SOFT_THROTTLE não conta como failure!
    // Throttle temporário (429 RPM/TPM) não deve abrir circuit breaker
    if (failureType === 'SOFT_THROTTLE') {
      log.info(
        { 
          providerId: this.providerId, 
          providerName: this.providerName,
          error,
          component: "LLMCircuitBreaker"
        },
        "Soft throttle detected - NOT counting as failure (circuit stays healthy)"
      );
      // ✅ FIX: NÃO atualiza lastFailureTime para SOFT_THROTTLE (não é failure real!)
      // Isso mantém breaker metrics consistentes
      return;
    }
    
    // ✅ Apenas QUOTA_EXHAUSTED/HARD_FAILURE atualizam lastFailureTime
    this.lastFailureTime = Date.now();
    
    // ✅ QUOTA_EXHAUSTED e HARD_FAILURE contam como failure real
    this.failureCount++;
    
    log.warn(
      { 
        providerId: this.providerId, 
        providerName: this.providerName,
        failureType,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        error,
        component: "LLMCircuitBreaker"
      },
      `${failureType} detected - failure count incremented`
    );

    switch (this.state) {
      case CircuitState.CLOSED:
        // Check if threshold reached
        if (this.failureCount >= this.config.failureThreshold) {
          await this.openCircuit();  // Transitions to OPEN + persists
        } else {
          // 🔥 FIX: Persist failure count EVEN when below threshold
          // This ensures consecutive failures survive crashes
          await this.saveStateToDB();
        }
        break;

      case CircuitState.HALF_OPEN:
        // Failed during recovery, go back to OPEN
        log.warn(
          { 
            providerId: this.providerId, 
            providerName: this.providerName,
            failureType,
            error,
            component: "LLMCircuitBreaker"
          },
          "HALF_OPEN → OPEN - recovery failed"
        );
        await this.openCircuit();  // Transitions to OPEN + persists
        break;

      case CircuitState.OPEN:
        // 🔥 FIX: Refresh nextRetryTime on additional failures while OPEN
        // This ensures recovery timeout extends with new failures
        this.nextRetryTime = Date.now() + this.config.recoveryTimeout;
        await this.saveStateToDB();
        break;
    }
  }

  /**
   * Abre o circuito (OPEN state)
   * 🔥 P0.2 FIX: Async to await DB persistence
   */
  private async openCircuit(): Promise<void> {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = Date.now() + this.config.recoveryTimeout;
    this.successCount = 0;

    log.error(
      { 
        providerId: this.providerId, 
        providerName: this.providerName,
        failureCount: this.failureCount,
        recoveryTimeoutMs: this.config.recoveryTimeout,
        component: "LLMCircuitBreaker"
      },
      "Circuit OPEN - too many failures"
    );
    
    await this.saveStateToDB();  // 🔥 FIX: Await persistence
  }

  /**
   * Força circuito fechado (manual reset)
   * 🔥 P0.2 FIX: Async to await DB persistence
   */
  async reset(): Promise<void> {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextRetryTime = null;
    
    log.info(
      { 
        providerId: this.providerId, 
        providerName: this.providerName,
        component: "LLMCircuitBreaker"
      },
      "Circuit manually reset to CLOSED"
    );
    
    await this.saveStateToDB();  // 🔥 FIX: Await persistence
  }

  /**
   * Obtém estatísticas
   */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextRetryTime: this.nextRetryTime,
    };
  }

  /**
   * Verifica se está saudável
   */
  isHealthy(): boolean {
    return this.state === CircuitState.CLOSED;
  }

  /**
   * Timeout da configuração
   */
  getTimeout(): number {
    return this.config.timeout;
  }
}

/**
 * Manager de Circuit Breakers para todos os LLM providers
 */
export class LLMCircuitBreakerManager {
  private breakers = new Map<string, LLMCircuitBreaker>(); // keyed by providerId
  private globalConfig?: Partial<CircuitBreakerConfig>;

  /**
   * 🔥 P0.2: Per-provider config overrides
   * Groq/Gemini têm diferentes rate limit behaviors
   */
  private readonly PROVIDER_CONFIGS: Record<string, Partial<CircuitBreakerConfig>> = {
    groq: {
      // Groq: Fast recovery (TPM limits reset quickly)
      recoveryTimeout: 10000, // 10s
      failureThreshold: 3,
    },
    gemini: {
      // Gemini: Moderate recovery (RPD limits)
      recoveryTimeout: 15000, // 15s
      failureThreshold: 3,
    },
    hf: {
      // HuggingFace: Slower recovery (model loading delays)
      recoveryTimeout: 20000, // 20s
      failureThreshold: 2, // Lower threshold (fails faster)
    },
    openrouter: {
      // OpenRouter: Standard recovery
      recoveryTimeout: 12000, // 12s
      failureThreshold: 3,
    },
  };

  /**
   * Define configuração global para novos breakers
   */
  setGlobalConfig(config: Partial<CircuitBreakerConfig>): void {
    this.globalConfig = config;
    log.info(
      { 
        config,
        component: "LLMCircuitBreakerManager"
      },
      "Global LLM circuit breaker config updated"
    );
  }

  /**
   * Obtém ou cria circuit breaker para provider
   * Async para aguardar recovery de state do DB
   */
  async getBreaker(
    providerId: string,
    customConfig?: Partial<CircuitBreakerConfig>
  ): Promise<LLMCircuitBreaker> {
    if (!this.breakers.has(providerId)) {
      // Deep merge: custom > provider-specific > global > defaults
      const mergedConfig: Partial<CircuitBreakerConfig> = {
        ...this.globalConfig,                  // Global defaults primeiro
        ...this.PROVIDER_CONFIGS[providerId],  // Provider-specific overrides
        ...customConfig,                       // Custom overrides (highest priority)
      };
      
      const breaker = await LLMCircuitBreaker.create(providerId, providerId, mergedConfig);
      this.breakers.set(providerId, breaker);
      log.info(
        { 
          providerId,
          hasCustomConfig: !!customConfig,
          hasGlobalConfig: !!this.globalConfig,
          component: "LLMCircuitBreakerManager"
        },
        "Created new LLM circuit breaker"
      );
    }
    
    return this.breakers.get(providerId)!;
  }

  /**
   * Remove circuit breaker (provider removido)
   */
  removeBreaker(providerId: string): void {
    if (this.breakers.has(providerId)) {
      this.breakers.delete(providerId);
      log.info(
        { 
          providerId,
          component: "LLMCircuitBreakerManager"
        },
        "Removed LLM circuit breaker"
      );
    }
  }

  /**
   * Reseta todos os circuit breakers
   * 🔥 P0.2 FIX: Async to await all resets
   */
  async resetAll(): Promise<void> {
    for (const breaker of Array.from(this.breakers.values())) {
      await breaker.reset();  // 🔥 FIX: Await each reset
    }
    log.info(
      { 
        count: this.breakers.size,
        component: "LLMCircuitBreakerManager"
      },
      "Reset all LLM circuit breakers"
    );
  }

  /**
   * Obtém estatísticas de todos os breakers
   */
  getAllStats(): Map<string, CircuitStats> {
    const stats = new Map<string, CircuitStats>();
    
    for (const [providerId, breaker] of Array.from(this.breakers.entries())) {
      stats.set(providerId, breaker.getStats());
    }
    
    return stats;
  }

  /**
   * Filtra providers saudáveis (circuit CLOSED)
   */
  filterHealthyProviders(providerNames: string[]): string[] {
    return providerNames.filter((providerId) => {
      const breaker = this.breakers.get(providerId);
      if (!breaker) return true; // Sem circuit breaker = saudável
      
      return breaker.canExecute();
    });
  }
}

// Singleton instance
export const llmCircuitBreakerManager = new LLMCircuitBreakerManager();
