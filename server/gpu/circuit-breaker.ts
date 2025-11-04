/**
 * ⚡ FASE 2 - C2: Circuit Breaker para GPU Workers
 * 
 * Previne cascata de falhas quando GPU workers caem ou ficam lentos.
 * 
 * Estados do Circuit Breaker:
 * - CLOSED: Funcionando normal (requisições passam)
 * - OPEN: Muitas falhas (requisições rejeitadas imediatamente)
 * - HALF_OPEN: Testando recuperação (algumas requisições passam)
 * 
 * Baseado no padrão "Release It!" de Michael Nygard
 */

import { log } from "../utils/logger";

export enum CircuitState {
  CLOSED = "CLOSED",       // Normal operation
  OPEN = "OPEN",           // Too many failures, reject immediately
  HALF_OPEN = "HALF_OPEN", // Testing recovery
}

interface CircuitBreakerConfig {
  failureThreshold: number;      // Falhas consecutivas para abrir
  recoveryTimeout: number;       // Tempo antes de tentar recuperar (ms)
  successThreshold: number;      // Sucessos para fechar novamente
  timeout: number;               // Timeout de requisição (ms)
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
 * Circuit Breaker individual por worker
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextRetryTime: number | null = null;
  private config: CircuitBreakerConfig;

  constructor(
    private workerId: number,
    private workerName: string,
    config?: Partial<CircuitBreakerConfig>
  ) {
    // ⚡ FASE 2 - C2: Configuração via ENV vars (production-ready)
    this.config = {
      failureThreshold: config?.failureThreshold ?? 
        parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || "3"),
      recoveryTimeout: config?.recoveryTimeout ?? 
        parseInt(process.env.CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS || "30000"),
      successThreshold: config?.successThreshold ?? 
        parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || "2"),
      timeout: config?.timeout ?? 
        parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || "60000"),
    };
    
    log.info({
      workerId,
      workerName,
      config: this.config,
    }, "[CircuitBreaker] Initialized with config");
  }

  /**
   * Verifica se pode executar requisição
   */
  canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitState.CLOSED:
        // Normal operation
        return true;

      case CircuitState.OPEN:
        // Check if recovery timeout expired
        if (this.nextRetryTime && now >= this.nextRetryTime) {
          log.info(
            { workerId: this.workerId, workerName: this.workerName },
            "[CircuitBreaker] Transitioning to HALF_OPEN - testing recovery"
          );
          this.state = CircuitState.HALF_OPEN;
          this.successCount = 0;
          return true;
        }
        
        // Still in cooldown
        const remainingMs = this.nextRetryTime ? this.nextRetryTime - now : 0;
        log.warn(
          { 
            workerId: this.workerId, 
            workerName: this.workerName,
            remainingMs,
          },
          "[CircuitBreaker] Circuit OPEN - rejecting request"
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
   */
  recordSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.failureCount = 0; // Reset failure counter
    this.successCount++;

    switch (this.state) {
      case CircuitState.CLOSED:
        // Stay closed
        break;

      case CircuitState.HALF_OPEN:
        // Check if enough successes to close
        if (this.successCount >= this.config.successThreshold) {
          log.info(
            { 
              workerId: this.workerId, 
              workerName: this.workerName,
              successCount: this.successCount,
            },
            "[CircuitBreaker] HALF_OPEN → CLOSED - worker recovered"
          );
          this.state = CircuitState.CLOSED;
          this.failureCount = 0;
          this.successCount = 0;
          this.nextRetryTime = null;
        }
        break;

      case CircuitState.OPEN:
        // Should not happen (can't execute when OPEN)
        log.warn(
          { workerId: this.workerId, workerName: this.workerName },
          "[CircuitBreaker] Unexpected success while OPEN"
        );
        break;
    }
  }

  /**
   * Registra falha
   */
  recordFailure(error?: string): void {
    this.lastFailureTime = Date.now();
    this.failureCount++;

    switch (this.state) {
      case CircuitState.CLOSED:
        // Check if threshold reached
        if (this.failureCount >= this.config.failureThreshold) {
          this.openCircuit();
        }
        break;

      case CircuitState.HALF_OPEN:
        // Failed during recovery, go back to OPEN
        log.warn(
          { 
            workerId: this.workerId, 
            workerName: this.workerName,
            error,
          },
          "[CircuitBreaker] HALF_OPEN → OPEN - recovery failed"
        );
        this.openCircuit();
        break;

      case CircuitState.OPEN:
        // Already open
        break;
    }
  }

  /**
   * Abre o circuito (OPEN state)
   */
  private openCircuit(): void {
    this.state = CircuitState.OPEN;
    this.nextRetryTime = Date.now() + this.config.recoveryTimeout;
    this.successCount = 0;

    log.error(
      { 
        workerId: this.workerId, 
        workerName: this.workerName,
        failureCount: this.failureCount,
        recoveryTimeoutMs: this.config.recoveryTimeout,
      },
      "[CircuitBreaker] Circuit OPEN - too many failures"
    );
  }

  /**
   * Força circuito fechado (manual reset)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextRetryTime = null;
    
    log.info(
      { workerId: this.workerId, workerName: this.workerName },
      "[CircuitBreaker] Circuit manually reset to CLOSED"
    );
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
 * Manager de Circuit Breakers para todos os workers
 */
export class CircuitBreakerManager {
  private breakers = new Map<number, CircuitBreaker>();
  private globalConfig?: Partial<CircuitBreakerConfig>;

  /**
   * ⚡ FASE 2 - C2: Define configuração global para novos breakers
   */
  setGlobalConfig(config: Partial<CircuitBreakerConfig>): void {
    this.globalConfig = config;
    log.info({ config }, "[CircuitBreakerManager] Global config updated");
  }

  /**
   * Obtém ou cria circuit breaker para worker
   * ⚡ FASE 2 - C2: Suporta configuração customizada por worker
   */
  getBreaker(
    workerId: number, 
    workerName: string,
    customConfig?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    if (!this.breakers.has(workerId)) {
      // ⚡ Deep merge: custom > global > ENV > defaults
      // Combina custom + global antes de passar pro constructor
      const mergedConfig: Partial<CircuitBreakerConfig> = {
        ...this.globalConfig,     // Global defaults primeiro
        ...customConfig,           // Custom overrides depois
      };
      
      this.breakers.set(workerId, new CircuitBreaker(workerId, workerName, mergedConfig));
      log.info(
        { 
          workerId, 
          workerName, 
          hasCustomConfig: !!customConfig,
          hasGlobalConfig: !!this.globalConfig,
        },
        "[CircuitBreakerManager] Created new circuit breaker"
      );
    }
    
    return this.breakers.get(workerId)!;
  }

  /**
   * Remove circuit breaker (worker deletado)
   */
  removeBreaker(workerId: number): void {
    if (this.breakers.has(workerId)) {
      this.breakers.delete(workerId);
      log.info({ workerId }, "[CircuitBreakerManager] Removed circuit breaker");
    }
  }

  /**
   * Reseta todos os circuit breakers
   */
  resetAll(): void {
    for (const breaker of Array.from(this.breakers.values())) {
      breaker.reset();
    }
    log.info("[CircuitBreakerManager] Reset all circuit breakers");
  }

  /**
   * Obtém estatísticas de todos os breakers
   */
  getAllStats(): Map<number, CircuitStats> {
    const stats = new Map<number, CircuitStats>();
    
    for (const [workerId, breaker] of Array.from(this.breakers.entries())) {
      stats.set(workerId, breaker.getStats());
    }
    
    return stats;
  }

  /**
   * Filtra workers saudáveis (circuit CLOSED)
   */
  filterHealthyWorkers<T extends { id: number; provider?: string }>(
    workers: T[]
  ): T[] {
    return workers.filter((worker) => {
      const breaker = this.breakers.get(worker.id);
      if (!breaker) return true; // Sem circuit breaker = saudável
      
      return breaker.canExecute();
    });
  }
}

// Singleton instance
export const circuitBreakerManager = new CircuitBreakerManager();
