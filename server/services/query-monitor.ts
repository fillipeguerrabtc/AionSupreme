/**
 * Sistema de Monitoramento de Latência de Queries (PRODUCTION-READY)
 * 
 * ✅ MIGRADO PARA POSTGRESQL - Persistência completa
 * ✅ ZERO dados em memória - tudo salvo no banco
 * 
 * Captura e armazena métricas de performance de todas as queries do sistema:
 * - Latência (ms) - p50, p95, p99
 * - Timestamp
 * - Tipo de query
 * - Provider usado
 * - Status da resposta (success/error)
 * 
 * Mantém histórico permanente no PostgreSQL para análise.
 */

import { storage } from "../storage";

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
  /**
   * Registra uma nova métrica de query - PRODUCTION-READY PostgreSQL
   */
  async recordQuery(
    queryType: string,
    provider: string | null,
    latencyMs: number,
    success: boolean,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await storage.createQueryMetric({
        queryType,
        provider,
        latencyMs,
        success,
        errorMessage: errorMessage || null,
        metadata,
      });
    } catch (error) {
      console.error("[QueryMonitor] Error recording query:", error);
    }
  }

  /**
   * Calcula estatísticas agregadas - PRODUCTION-READY PostgreSQL
   */
  async getStats(daysAgo: number = 7): Promise<QueryStats> {
    try {
      const metrics = await storage.getQueryMetrics({ daysAgo });
      
      if (metrics.length === 0) {
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

      const latencies = metrics.map(m => m.latencyMs).sort((a, b) => a - b);
      const errors = metrics.filter(m => !m.success);
      
      // Queries da última hora
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const lastHourMetrics = metrics.filter(m => 
        new Date(m.timestamp).getTime() >= oneHourAgo
      );
      const lastHourLatencies = lastHourMetrics.map(m => m.latencyMs);

      return {
        totalQueries: metrics.length,
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        minLatency: latencies[0] || 0,
        maxLatency: latencies[latencies.length - 1] || 0,
        p50Latency: this.percentile(latencies, 50),
        p95Latency: this.percentile(latencies, 95),
        p99Latency: this.percentile(latencies, 99),
        errorRate: (errors.length / metrics.length) * 100,
        lastHour: {
          count: lastHourMetrics.length,
          avgLatency: lastHourLatencies.length > 0
            ? lastHourLatencies.reduce((a, b) => a + b, 0) / lastHourLatencies.length
            : 0,
        },
      };
    } catch (error) {
      console.error("[QueryMonitor] Error getting stats:", error);
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
  }

  /**
   * Retorna estatísticas por tipo de query - PRODUCTION-READY PostgreSQL
   */
  async getStatsByQueryType(queryType: string, daysAgo: number = 7): Promise<QueryStats> {
    try {
      const metrics = await storage.getQueryMetrics({ queryType, daysAgo });
      
      if (metrics.length === 0) {
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

      const latencies = metrics.map(m => m.latencyMs).sort((a, b) => a - b);
      const errors = metrics.filter(m => !m.success);
      
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      const lastHourMetrics = metrics.filter(m => 
        new Date(m.timestamp).getTime() >= oneHourAgo
      );
      const lastHourLatencies = lastHourMetrics.map(m => m.latencyMs);

      return {
        totalQueries: metrics.length,
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        minLatency: latencies[0] || 0,
        maxLatency: latencies[latencies.length - 1] || 0,
        p50Latency: this.percentile(latencies, 50),
        p95Latency: this.percentile(latencies, 95),
        p99Latency: this.percentile(latencies, 99),
        errorRate: (errors.length / metrics.length) * 100,
        lastHour: {
          count: lastHourMetrics.length,
          avgLatency: lastHourLatencies.length > 0
            ? lastHourLatencies.reduce((a, b) => a + b, 0) / lastHourLatencies.length
            : 0,
        },
      };
    } catch (error) {
      console.error("[QueryMonitor] Error getting stats by query type:", error);
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
   * Retorna queries lentas (acima do threshold) - PRODUCTION-READY PostgreSQL
   */
  async getSlowQueries(thresholdMs: number = 1000, daysAgo: number = 7): Promise<{
    queryType: string;
    provider: string | null;
    latencyMs: number;
    timestamp: Date;
    errorMessage: string | null;
  }[]> {
    try {
      const metrics = await storage.getQueryMetrics({ daysAgo, limit: 1000 });
      
      return metrics
        .filter(m => m.latencyMs >= thresholdMs)
        .map(m => ({
          queryType: m.queryType,
          provider: m.provider,
          latencyMs: m.latencyMs,
          timestamp: m.timestamp,
          errorMessage: m.errorMessage,
        }))
        .sort((a, b) => b.latencyMs - a.latencyMs);
    } catch (error) {
      console.error("[QueryMonitor] Error getting slow queries:", error);
      return [];
    }
  }

  /**
   * VERSÃO COMPLETA - Registra sucesso de query de agent - PRODUCTION-READY PostgreSQL
   */
  async trackAgentQuerySuccess(
    agentIdOrOptions: string | {
      agentId: string;
      agentName?: string;
      query?: string;
      totalSteps?: number;
      latencyMs: number;
      tokensUsed?: number;
      metadata?: Record<string, any>;
    },
    agentName?: string,
    query?: string,
    totalSteps?: number,
    latencyMs?: number,
    tokensUsed: number = 0,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Suporta chamada simplificada: trackAgentQuerySuccess(agentId, latencyMs)
      // E chamada completa: trackAgentQuerySuccess(agentId, name, query, steps, latency, tokens, meta)
      let params: {
        agentId: string;
        agentName: string;
        query: string;
        totalSteps: number;
        latencyMs: number;
        tokensUsed: number;
        metadata?: Record<string, any>;
      };

      if (typeof agentIdOrOptions === 'object') {
        // Chamada com objeto
        params = {
          agentId: agentIdOrOptions.agentId,
          agentName: agentIdOrOptions.agentName || 'Unknown Agent',
          query: agentIdOrOptions.query || 'N/A',
          totalSteps: agentIdOrOptions.totalSteps || 1,
          latencyMs: agentIdOrOptions.latencyMs,
          tokensUsed: agentIdOrOptions.tokensUsed || 0,
          metadata: agentIdOrOptions.metadata,
        };
      } else if (typeof agentName === 'number' && !query) {
        // Chamada simplificada: trackAgentQuerySuccess(agentId, latencyMs)
        params = {
          agentId: agentIdOrOptions,
          agentName: 'Unknown Agent',
          query: 'N/A',
          totalSteps: 1,
          latencyMs: agentName, // agentName é na verdade latencyMs neste caso
          tokensUsed: 0,
        };
      } else {
        // Chamada completa
        params = {
          agentId: agentIdOrOptions,
          agentName: agentName || 'Unknown Agent',
          query: query || 'N/A',
          totalSteps: totalSteps || 1,
          latencyMs: latencyMs || 0,
          tokensUsed,
          metadata,
        };
      }

      await storage.createAgentQueryResult({
        agentId: params.agentId,
        agentName: params.agentName,
        query: params.query,
        totalSteps: params.totalSteps,
        success: true,
        finalAnswer: null,
        latencyMs: params.latencyMs,
        tokensUsed: params.tokensUsed,
        metadata: params.metadata,
      });
    } catch (error) {
      console.error("[QueryMonitor] Error tracking agent query success:", error);
    }
  }

  /**
   * VERSÃO COMPLETA - Registra erro de query de agent - PRODUCTION-READY PostgreSQL
   */
  async trackAgentQueryError(
    agentIdOrOptions: string | {
      agentId: string;
      agentName?: string;
      query?: string;
      totalSteps?: number;
      errorType: string;
      latencyMs: number;
      metadata?: Record<string, any>;
    },
    errorTypeOrAgentName?: string,
    queryOrLatency?: string | number,
    totalStepsOrMetadata?: number | Record<string, any>,
    latencyMsOrUndefined?: number,
    metadataOrUndefined?: Record<string, any>
  ): Promise<void> {
    try {
      let params: {
        agentId: string;
        agentName: string;
        query: string;
        totalSteps: number;
        errorType: string;
        latencyMs: number;
        metadata?: Record<string, any>;
      };

      if (typeof agentIdOrOptions === 'object') {
        // Chamada com objeto
        params = {
          agentId: agentIdOrOptions.agentId,
          agentName: agentIdOrOptions.agentName || 'Unknown Agent',
          query: agentIdOrOptions.query || 'N/A',
          totalSteps: agentIdOrOptions.totalSteps || 1,
          errorType: agentIdOrOptions.errorType,
          latencyMs: agentIdOrOptions.latencyMs,
          metadata: agentIdOrOptions.metadata,
        };
      } else if (typeof queryOrLatency === 'number' && !totalStepsOrMetadata) {
        // Chamada simplificada: trackAgentQueryError(agentId, errorType, latencyMs)
        params = {
          agentId: agentIdOrOptions,
          agentName: 'Unknown Agent',
          query: 'N/A',
          totalSteps: 1,
          errorType: errorTypeOrAgentName || 'UnknownError',
          latencyMs: queryOrLatency,
        };
      } else {
        // Chamada completa: trackAgentQueryError(agentId, agentName, query, totalSteps, errorType, latencyMs, metadata)
        params = {
          agentId: agentIdOrOptions,
          agentName: errorTypeOrAgentName || 'Unknown Agent',
          query: typeof queryOrLatency === 'string' ? queryOrLatency : 'N/A',
          totalSteps: typeof totalStepsOrMetadata === 'number' ? totalStepsOrMetadata : 1,
          errorType: typeof totalStepsOrMetadata === 'number' && latencyMsOrUndefined !== undefined ? 'UnknownError' : 'UnknownError',
          latencyMs: latencyMsOrUndefined || 0,
          metadata: typeof totalStepsOrMetadata === 'object' ? totalStepsOrMetadata : metadataOrUndefined,
        };
      }

      const metadataWithError: Record<string, any> = params.metadata ? { ...params.metadata } : {};
      metadataWithError.errorType = params.errorType;
      
      await storage.createAgentQueryResult({
        agentId: params.agentId,
        agentName: params.agentName,
        query: params.query,
        totalSteps: params.totalSteps,
        success: false,
        finalAnswer: null,
        latencyMs: params.latencyMs,
        tokensUsed: 0,
        metadata: metadataWithError,
      });
    } catch (error) {
      console.error("[QueryMonitor] Error tracking agent query error:", error);
    }
  }

  /**
   * Retorna estatísticas de agents - PRODUCTION-READY PostgreSQL
   */
  async getAgentStats(daysAgo: number = 7): Promise<AgentStats[]> {
    try {
      const results = await storage.getAgentQueryResults({ daysAgo });
      
      // Agrupar por agentId
      const grouped = new Map<string, typeof results>();
      
      for (const result of results) {
        if (!result.agentId) continue;
        const existing = grouped.get(result.agentId) || [];
        existing.push(result);
        grouped.set(result.agentId, existing);
      }
      
      const stats: AgentStats[] = [];
      
      for (const [agentId, agentResults] of Array.from(grouped.entries())) {
        const successCount = agentResults.filter(r => r.success).length;
        const errorCount = agentResults.filter(r => !r.success).length;
        const latencies = agentResults.map(r => r.latencyMs);
        
        // Agrupar erros por tipo
        const errorsByType: Record<string, number> = {};
        for (const result of agentResults) {
          if (!result.success && result.metadata) {
            const errorType = (result.metadata as any).errorType || "unknown";
            errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
          }
        }
        
        stats.push({
          agentId,
          totalQueries: agentResults.length,
          successCount,
          errorCount,
          successRate: (successCount / agentResults.length) * 100,
          avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          errorsByType,
        });
      }
      
      return stats.sort((a, b) => b.totalQueries - a.totalQueries);
    } catch (error) {
      console.error("[QueryMonitor] Error getting agent stats:", error);
      return [];
    }
  }

  /**
   * Retorna estatísticas de um agent específico - PRODUCTION-READY PostgreSQL
   */
  async getAgentStatsById(agentId: string, daysAgo: number = 7): Promise<AgentStats | null> {
    try {
      const results = await storage.getAgentQueryResults({ agentId, daysAgo });
      
      if (results.length === 0) return null;
      
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const latencies = results.map(r => r.latencyMs);
      
      // Agrupar erros por tipo
      const errorsByType: Record<string, number> = {};
      for (const result of results) {
        if (!result.success && result.metadata) {
          const errorType = (result.metadata as any).errorType || "unknown";
          errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
        }
      }
      
      return {
        agentId,
        totalQueries: results.length,
        successCount,
        errorCount,
        successRate: (successCount / results.length) * 100,
        avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        errorsByType,
      };
    } catch (error) {
      console.error("[QueryMonitor] Error getting agent stats by id:", error);
      return null;
    }
  }

  /**
   * Retorna queries de erro (apenas erros) - PRODUCTION-READY PostgreSQL
   */
  async getErrorQueries(daysAgo: number = 7, limit: number = 100): Promise<{
    queryType: string;
    provider: string | null;
    errorMessage: string | null;
    timestamp: Date;
    latencyMs: number;
  }[]> {
    try {
      const metrics = await storage.getQueryMetrics({ success: false, daysAgo, limit });
      
      return metrics.map(m => ({
        queryType: m.queryType,
        provider: m.provider,
        errorMessage: m.errorMessage,
        timestamp: m.timestamp,
        latencyMs: m.latencyMs,
      }));
    } catch (error) {
      console.error("[QueryMonitor] Error getting error queries:", error);
      return [];
    }
  }

  /**
   * Limpa histórico (apenas para testes/manutenção)
   */
  async clear(): Promise<void> {
    console.warn("[QueryMonitor] clear() deprecated - data is now in PostgreSQL");
  }
}

// Singleton instance
export const metricsCollector = new QueryMonitor();

// Legacy export for compatibility
export const queryMonitor = metricsCollector;
