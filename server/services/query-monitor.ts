/**
 * Sistema de Monitoramento de Latência de Queries
 * 
 * Captura e armazena métricas de performance de todas as queries do sistema:
 * - Latência (ms)
 * - Timestamp
 * - Tipo de operação (GET, POST, etc.)
 * - Endpoint
 * - Status da resposta
 * 
 * Mantém histórico das últimas 1000 queries em memória para análise.
 */

interface QueryMetric {
  id: string;
  timestamp: number;
  method: string;
  endpoint: string;
  latencyMs: number;
  statusCode: number;
  queryParams?: string;
}

interface QueryStats {
  totalQueries: number;
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
  lastHour: {
    count: number;
    avgLatency: number;
  };
}

interface AgentQueryResult {
  agentId: string;
  timestamp: number;
  success: boolean;
  errorType?: string;
  latencyMs: number;
}

interface AgentStats {
  agentId: string;
  totalQueries: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  avgLatency: number;
  errorsByType: Record<string, number>;
}

class QueryMonitor {
  private metrics: QueryMetric[] = [];
  private agentResults: AgentQueryResult[] = [];
  private readonly maxMetrics = 1000; // Últimas 1000 queries
  private readonly maxAgentResults = 5000; // Últimas 5000 agent queries

  /**
   * Registra uma nova métrica de query
   */
  recordQuery(metric: Omit<QueryMetric, "id" | "timestamp">): void {
    const newMetric: QueryMetric = {
      id: `qm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...metric,
    };

    this.metrics.push(newMetric);

    // Remove queries antigas se exceder o limite
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Retorna todas as métricas registradas
   */
  getMetrics(): QueryMetric[] {
    return [...this.metrics];
  }

  /**
   * Calcula estatísticas agregadas
   */
  getStats(): QueryStats {
    if (this.metrics.length === 0) {
      return {
        totalQueries: 0,
        avgLatency: 0,
        minLatency: 0,
        maxLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        errorRate: 0,
        lastHour: { count: 0, avgLatency: 0 },
      };
    }

    const latencies = this.metrics.map((m) => m.latencyMs).sort((a, b) => a - b);
    const errors = this.metrics.filter((m) => m.statusCode >= 400);
    
    // Queries da última hora
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const lastHourMetrics = this.metrics.filter((m) => m.timestamp >= oneHourAgo);
    const lastHourLatencies = lastHourMetrics.map((m) => m.latencyMs);

    return {
      totalQueries: this.metrics.length,
      avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      minLatency: latencies[0] || 0,
      maxLatency: latencies[latencies.length - 1] || 0,
      p50Latency: this.percentile(latencies, 50),
      p95Latency: this.percentile(latencies, 95),
      p99Latency: this.percentile(latencies, 99),
      errorRate: (errors.length / this.metrics.length) * 100,
      lastHour: {
        count: lastHourMetrics.length,
        avgLatency: lastHourLatencies.length > 0
          ? lastHourLatencies.reduce((a, b) => a + b, 0) / lastHourLatencies.length
          : 0,
      },
    };
  }

  /**
   * Calcula percentil de uma array ordenada
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((p / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)] || 0;
  }

  /**
   * Limpa todas as métricas
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Retorna métricas filtradas por endpoint
   */
  getMetricsByEndpoint(endpoint: string): QueryMetric[] {
    return this.metrics.filter((m) => m.endpoint.includes(endpoint));
  }

  /**
   * Retorna métricas com latência acima do threshold (queries lentas)
   */
  getSlowQueries(thresholdMs: number = 1000): QueryMetric[] {
    return this.metrics.filter((m) => m.latencyMs >= thresholdMs);
  }

  /**
   * Registra sucesso de query de agent
   */
  trackAgentQuerySuccess(agentId: string, latencyMs: number): void {
    const result: AgentQueryResult = {
      agentId,
      timestamp: Date.now(),
      success: true,
      latencyMs,
    };

    this.agentResults.push(result);

    // Remove resultados antigos se exceder o limite
    if (this.agentResults.length > this.maxAgentResults) {
      this.agentResults = this.agentResults.slice(-this.maxAgentResults);
    }
  }

  /**
   * Registra erro de query de agent
   */
  trackAgentQueryError(agentId: string, errorType: string, latencyMs: number = 0): void {
    const result: AgentQueryResult = {
      agentId,
      timestamp: Date.now(),
      success: false,
      errorType,
      latencyMs,
    };

    this.agentResults.push(result);

    // Remove resultados antigos se exceder o limite
    if (this.agentResults.length > this.maxAgentResults) {
      this.agentResults = this.agentResults.slice(-this.maxAgentResults);
    }
  }

  /**
   * Retorna estatísticas de um agent específico
   */
  getAgentStats(agentId: string): AgentStats {
    const agentQueries = this.agentResults.filter((r) => r.agentId === agentId);

    if (agentQueries.length === 0) {
      return {
        agentId,
        totalQueries: 0,
        successCount: 0,
        errorCount: 0,
        successRate: 0,
        avgLatency: 0,
        errorsByType: {},
      };
    }

    const successQueries = agentQueries.filter((r) => r.success);
    const errorQueries = agentQueries.filter((r) => !r.success);

    const avgLatency =
      agentQueries.reduce((sum, r) => sum + r.latencyMs, 0) / agentQueries.length;

    const errorsByType: Record<string, number> = {};
    errorQueries.forEach((r) => {
      if (r.errorType) {
        errorsByType[r.errorType] = (errorsByType[r.errorType] || 0) + 1;
      }
    });

    return {
      agentId,
      totalQueries: agentQueries.length,
      successCount: successQueries.length,
      errorCount: errorQueries.length,
      successRate: (successQueries.length / agentQueries.length) * 100,
      avgLatency: Math.round(avgLatency),
      errorsByType,
    };
  }

  /**
   * Retorna estatísticas de todos os agents
   */
  getAllAgentStats(): AgentStats[] {
    const agentIds = [...new Set(this.agentResults.map((r) => r.agentId))];
    return agentIds.map((agentId) => this.getAgentStats(agentId));
  }
}

// Singleton instance
export const queryMonitor = new QueryMonitor();
