/**
 * Rotas de Telemetria do Sistema
 * 
 * Endpoints para dashboard de telemetria com métricas de:
 * - Uso de agentes (rankings, histórico, estatísticas)
 * - Uso de namespaces (rankings, histórico, estatísticas)
 * - Integração com query-metrics para métricas de sistema
 */

import { Express, Request, Response } from "express";
import { usageTracker } from "../services/usage-tracker";

export function registerTelemetryRoutes(app: Express) {
  /**
   * GET /api/telemetry/agents/stats
   * Retorna estatísticas de uso de todos os agentes
   */
  app.get("/api/admin/telemetry/agents/stats", async (req: Request, res: Response) => {
    try {
      const stats = usageTracker.getAgentStats();
      
      // Converter schema para match com frontend (usageCount, lastUsed como ISO string)
      const formattedStats = stats.map(stat => ({
        agentId: stat.agentId,
        agentName: stat.agentName,
        usageCount: stat.totalUses,
        lastUsed: new Date(stat.lastUsed).toISOString(),
      }));
      
      res.json(formattedStats);
    } catch (error) {
      console.error("Error fetching agent stats:", error);
      res.status(500).json({
        error: "Failed to fetch agent stats",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/agents/top?limit=10
   * Retorna top N agentes mais usados
   */
  app.get("/api/admin/telemetry/agents/top", async (req: Request, res: Response) => {
    try {
      const { limit } = req.query;
      const limitNum = limit && typeof limit === "string" ? parseInt(limit, 10) : 10;
      
      const topAgents = usageTracker.getTopAgents(limitNum);
      res.json(topAgents);
    } catch (error) {
      console.error("Error fetching top agents:", error);
      res.status(500).json({
        error: "Failed to fetch top agents",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/agents/least-used?limit=10
   * Retorna agentes menos usados
   */
  app.get("/api/admin/telemetry/agents/least-used", async (req: Request, res: Response) => {
    try {
      const { limit } = req.query;
      const limitNum = limit && typeof limit === "string" ? parseInt(limit, 10) : 10;
      
      const leastUsed = usageTracker.getLeastUsedAgents(limitNum);
      res.json(leastUsed);
    } catch (error) {
      console.error("Error fetching least used agents:", error);
      res.status(500).json({
        error: "Failed to fetch least used agents",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/agents/:id/timeseries?days=30
   * Retorna série temporal de uso de um agente específico
   */
  app.get("/api/admin/telemetry/agents/:id/timeseries", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { days } = req.query;
      const daysNum = days && typeof days === "string" ? parseInt(days, 10) : 30;
      
      const timeseries = usageTracker.getAgentTimeSeries(id, daysNum);
      res.json(timeseries);
    } catch (error) {
      console.error("Error fetching agent timeseries:", error);
      res.status(500).json({
        error: "Failed to fetch agent timeseries",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/agents/all/timeseries?days=30
   * Retorna série temporal agregada de todos os agentes
   */
  app.get("/api/admin/telemetry/agents/all/timeseries", async (req: Request, res: Response) => {
    try {
      const { days } = req.query;
      const daysNum = days && typeof days === "string" ? parseInt(days, 10) : 30;
      
      const timeseries = usageTracker.getAllAgentsTimeSeries(daysNum);
      res.json(timeseries);
    } catch (error) {
      console.error("Error fetching all agents timeseries:", error);
      res.status(500).json({
        error: "Failed to fetch all agents timeseries",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/namespaces/stats
   * Retorna estatísticas de uso de todos os namespaces
   */
  app.get("/api/admin/telemetry/namespaces/stats", async (req: Request, res: Response) => {
    try {
      const stats = usageTracker.getNamespaceStats();
      
      // Converter schema para match com frontend (usageCount, lastUsed como ISO string)
      const formattedStats = stats.map(stat => ({
        namespaceId: stat.namespaceId,
        namespaceName: stat.namespaceName,
        usageCount: stat.totalUses,
        lastUsed: new Date(stat.lastUsed).toISOString(),
      }));
      
      res.json(formattedStats);
    } catch (error) {
      console.error("Error fetching namespace stats:", error);
      res.status(500).json({
        error: "Failed to fetch namespace stats",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/namespaces/top?limit=10
   * Retorna top N namespaces mais usados
   */
  app.get("/api/admin/telemetry/namespaces/top", async (req: Request, res: Response) => {
    try {
      const { limit } = req.query;
      const limitNum = limit && typeof limit === "string" ? parseInt(limit, 10) : 10;
      
      const topNamespaces = usageTracker.getTopNamespaces(limitNum);
      res.json(topNamespaces);
    } catch (error) {
      console.error("Error fetching top namespaces:", error);
      res.status(500).json({
        error: "Failed to fetch top namespaces",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/namespaces/least-used?limit=10
   * Retorna namespaces menos usados
   */
  app.get("/api/admin/telemetry/namespaces/least-used", async (req: Request, res: Response) => {
    try {
      const { limit } = req.query;
      const limitNum = limit && typeof limit === "string" ? parseInt(limit, 10) : 10;
      
      const leastUsed = usageTracker.getLeastUsedNamespaces(limitNum);
      res.json(leastUsed);
    } catch (error) {
      console.error("Error fetching least used namespaces:", error);
      res.status(500).json({
        error: "Failed to fetch least used namespaces",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/namespaces/:id/timeseries?days=30
   * Retorna série temporal de uso de um namespace específico
   */
  app.get("/api/admin/telemetry/namespaces/:id/timeseries", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { days } = req.query;
      const daysNum = days && typeof days === "string" ? parseInt(days, 10) : 30;
      
      const timeseries = usageTracker.getNamespaceTimeSeries(id, daysNum);
      res.json(timeseries);
    } catch (error) {
      console.error("Error fetching namespace timeseries:", error);
      res.status(500).json({
        error: "Failed to fetch namespace timeseries",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/namespaces/all/timeseries?days=30
   * Retorna série temporal agregada de todos os namespaces
   */
  app.get("/api/admin/telemetry/namespaces/all/timeseries", async (req: Request, res: Response) => {
    try {
      const { days } = req.query;
      const daysNum = days && typeof days === "string" ? parseInt(days, 10) : 30;
      
      const timeseries = usageTracker.getAllNamespacesTimeSeries(daysNum);
      res.json(timeseries);
    } catch (error) {
      console.error("Error fetching all namespaces timeseries:", error);
      res.status(500).json({
        error: "Failed to fetch all namespaces timeseries",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/admin/telemetry/agents/history?days=30
   * Alias para agents/all/timeseries - histórico de uso de agentes
   */
  app.get("/api/admin/telemetry/agents/history", async (req: Request, res: Response) => {
    try {
      const { days } = req.query;
      const daysNum = days && typeof days === "string" ? parseInt(days, 10) : 30;
      
      const timeseries = usageTracker.getAllAgentsTimeSeries(daysNum);
      res.json(timeseries);
    } catch (error) {
      console.error("Error fetching agents history:", error);
      res.status(500).json({
        error: "Failed to fetch agents history",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/admin/telemetry/namespaces/history?days=30
   * Alias para namespaces/all/timeseries - histórico de uso de namespaces
   */
  app.get("/api/admin/telemetry/namespaces/history", async (req: Request, res: Response) => {
    try {
      const { days } = req.query;
      const daysNum = days && typeof days === "string" ? parseInt(days, 10) : 30;
      
      const timeseries = usageTracker.getAllNamespacesTimeSeries(daysNum);
      res.json(timeseries);
    } catch (error) {
      console.error("Error fetching namespaces history:", error);
      res.status(500).json({
        error: "Failed to fetch namespaces history",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * GET /api/telemetry/overview
   * Retorna visão geral consolidada de telemetria
   */
  app.get("/api/admin/telemetry/overview", async (req: Request, res: Response) => {
    try {
      const agentStats = usageTracker.getAgentStats();
      const namespaceStats = usageTracker.getNamespaceStats();
      const totalRecords = usageTracker.getTotalRecords();
      
      // Calcular totais
      const totalAgentUses = agentStats.reduce((sum, s) => sum + s.totalUses, 0);
      const totalNamespaceSearches = namespaceStats.reduce((sum, s) => sum + s.totalUses, 0);
      
      // Calcular usos nas últimas 24h
      const agentUses24h = agentStats.reduce((sum, s) => sum + s.uses24h, 0);
      const namespaceSearches24h = namespaceStats.reduce((sum, s) => sum + s.uses24h, 0);
      
      res.json({
        totalRecords,
        agents: {
          totalAgents: agentStats.length,
          totalUses: totalAgentUses,
          uses24h: agentUses24h,
          topAgent: agentStats[0] || null,
        },
        namespaces: {
          totalNamespaces: namespaceStats.length,
          totalSearches: totalNamespaceSearches,
          searches24h: namespaceSearches24h,
          topNamespace: namespaceStats[0] || null,
        },
      });
    } catch (error) {
      console.error("Error fetching telemetry overview:", error);
      res.status(500).json({
        error: "Failed to fetch telemetry overview",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  /**
   * DELETE /api/telemetry/clear
   * Limpa todo histórico de telemetria
   */
  app.delete("/api/admin/telemetry/clear", async (req: Request, res: Response) => {
    try {
      usageTracker.clear();
      res.json({ message: "Telemetry data cleared successfully" });
    } catch (error) {
      console.error("Error clearing telemetry:", error);
      res.status(500).json({
        error: "Failed to clear telemetry",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
