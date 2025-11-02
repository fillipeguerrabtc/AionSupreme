/**
 * Middleware de Monitoramento de Latência
 * 
 * Intercepta automaticamente todas as requests HTTP e registra:
 * - Tempo de resposta (latência)
 * - Endpoint acessado
 * - Método HTTP
 * - Status code
 * - Query parameters
 * 
 * Os dados são armazenados no QueryMonitor para análise posterior.
 */

import { Request, Response, NextFunction } from "express";
import { queryMonitor } from "../services/query-monitor";

export function queryMonitoringMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Hook no evento de finish da resposta para capturar a latência
  res.on("finish", () => {
    const latencyMs = Date.now() - startTime;

    // Ignora assets estáticos e arquivos de build
    if (
      req.path.startsWith("/assets/") ||
      req.path.startsWith("/src/") ||
      req.path.endsWith(".js") ||
      req.path.endsWith(".css") ||
      req.path.endsWith(".map")
    ) {
      return;
    }

    // Registra a métrica
    queryMonitor.recordQuery({
      method: req.method,
      endpoint: req.path,
      latencyMs,
      statusCode: res.statusCode,
      queryParams: Object.keys(req.query).length > 0
        ? JSON.stringify(req.query)
        : undefined,
    });
  });

  next();
}
