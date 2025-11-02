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

class QueryMonitor {
  private metrics: QueryMetric[] = [];
  private readonly maxMetrics = 1000; // Últimas 1000 queries

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
}

// Singleton instance
export const queryMonitor = new QueryMonitor();
