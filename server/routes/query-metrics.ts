/**
 * Rotas de Métricas de Queries
 * 
 * Endpoints administrativos para visualizar métricas de performance:
 * - GET /api/admin/query-metrics - Lista todas as métricas
 * - GET /api/admin/query-metrics/stats - Estatísticas agregadas
 * - GET /api/admin/query-metrics/slow - Queries lentas (>1s)
 * - DELETE /api/admin/query-metrics - Limpa histórico
 */

import { Express, Request, Response } from "express";
import { queryMonitor } from "../services/query-monitor";
import { storage } from "../storage";

export function registerQueryMetricsRoutes(app: Express) {
  /**
   * GET /api/admin/query-metrics
   * Retorna todas as métricas de queries registradas
   */
  app.get("/api/admin/query-metrics", async (req: Request, res: Response) => {
    try {
      const { endpoint, limit, daysAgo } = req.query;
      const days = daysAgo && typeof daysAgo === "string" ? parseInt(daysAgo, 10) : 7;

      // ✅ PRODUCTION-READY: Buscar do PostgreSQL via storage
      let metrics = await storage.getQueryMetrics({ daysAgo: days });

      // Filtrar por queryType se especificado
      if (endpoint && typeof endpoint === "string") {
        metrics = metrics.filter(m => m.queryType === endpoint);
      }

      // Limitar quantidade se especificado
      if (limit && typeof limit === "string") {
        const limitNum = parseInt(limit, 10);
        if (!isNaN(limitNum) && limitNum > 0) {
          metrics = metrics.slice(-limitNum);
        }
      }

      res.json({
        total: metrics.length,
        metrics: metrics.reverse(), // Mais recentes primeiro
      });
    } catch (error) {
      console.error("Error fetching query metrics:", error);
      res.status(500).json({
        error: "Failed to fetch query metrics",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/admin/query-metrics/stats
   * Retorna estatísticas agregadas de performance
   */
  app.get("/api/admin/query-metrics/stats", async (req: Request, res: Response) => {
    try {
      const stats = await queryMonitor.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching query stats:", error);
      res.status(500).json({
        error: "Failed to fetch query stats",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/admin/query-metrics/slow
   * Retorna queries lentas (latência >= threshold)
   * Query param: threshold (default: 1000ms)
   */
  app.get("/api/admin/query-metrics/slow", async (req: Request, res: Response) => {
    try {
      const { threshold } = req.query;
      const thresholdMs = threshold && typeof threshold === "string"
        ? parseInt(threshold, 10)
        : 1000;

      const slowQueries = await queryMonitor.getSlowQueries(thresholdMs);

      res.json({
        threshold: thresholdMs,
        count: slowQueries.length,
        queries: slowQueries.reverse(), // Mais recentes primeiro
      });
    } catch (error) {
      console.error("Error fetching slow queries:", error);
      res.status(500).json({
        error: "Failed to fetch slow queries",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/admin/query-metrics/summary
   * Alias para /stats - retorna estatísticas agregadas
   */
  app.get("/api/admin/query-metrics/summary", async (req: Request, res: Response) => {
    try {
      const stats = await queryMonitor.getStats();
      
      // Calcular success rate e error rate
      const totalQueries = stats.totalQueries || 0;
      const errorCount = Math.round((stats.errorRate / 100) * totalQueries) || 0;
      const successRate = totalQueries > 0 ? (totalQueries - errorCount) / totalQueries : 1;
      const errorRate = totalQueries > 0 ? errorCount / totalQueries : 0;
      
      res.json({
        totalQueries,
        avgLatency: stats.avgLatency || 0,
        p50Latency: stats.p50Latency || 0,
        p95Latency: stats.p95Latency || 0,
        p99Latency: stats.p99Latency || 0,
        successRate,
        errorRate,
      });
    } catch (error) {
      console.error("Error fetching query summary:", error);
      res.status(500).json({
        error: "Failed to fetch query summary",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/admin/query-metrics/trends
   * Retorna tendências de latência ao longo do tempo (últimas 24h)
   */
  app.get("/api/admin/query-metrics/trends", async (req: Request, res: Response) => {
    try {
      const { daysAgo } = req.query;
      const days = daysAgo && typeof daysAgo === "string" ? parseInt(daysAgo, 10) : 7;
      
      // ✅ PRODUCTION-READY: Buscar do PostgreSQL via storage
      const metrics = await storage.getQueryMetrics({ daysAgo: days });
      
      // Agrupar por hora e calcular médias
      const hourlyData: { [key: string]: { latencies: number[]; errors: number } } = {};
      
      metrics.forEach((metric: any) => {
        const hour = new Date(metric.timestamp).toISOString().substring(0, 13); // YYYY-MM-DDTHH
        if (!hourlyData[hour]) {
          hourlyData[hour] = { latencies: [], errors: 0 };
        }
        hourlyData[hour].latencies.push(metric.latencyMs);
        if (!metric.success) {
          hourlyData[hour].errors++;
        }
      });
      
      // Converter para array de trends
      const trends = Object.keys(hourlyData)
        .sort()
        .slice(-24) // últimas 24 horas
        .map((hour) => {
          const data = hourlyData[hour];
          const latencies = data.latencies.sort((a, b) => a - b);
          const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
          const p95Index = Math.floor(latencies.length * 0.95);
          const p95Latency = latencies[p95Index] || avgLatency;
          
          return {
            timestamp: new Date(hour + ":00:00").toISOString(),
            avgLatency: Math.round(avgLatency),
            p95Latency: Math.round(p95Latency),
            count: latencies.length,
            errors: data.errors,
          };
        });
      
      res.json(trends);
    } catch (error) {
      console.error("Error fetching query trends:", error);
      res.status(500).json({
        error: "Failed to fetch query trends",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/admin/query-metrics
   * Limpa todo o histórico de métricas
   */
  app.delete("/api/admin/query-metrics", async (req: Request, res: Response) => {
    try {
      queryMonitor.clear();
      res.json({ message: "Query metrics cleared successfully" });
    } catch (error) {
      console.error("Error clearing query metrics:", error);
      res.status(500).json({
        error: "Failed to clear query metrics",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
