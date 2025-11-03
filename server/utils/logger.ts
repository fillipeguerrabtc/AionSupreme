import pino from "pino";
import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

// Declarar extensão do Request para incluir requestId
declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

// Logger estruturado production-grade
export const log = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV === "development" ? {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname"
    }
  } : undefined
});

// Middleware para adicionar requestId em todas as requisições
export function withRequestId(req: Request, _res: Response, next: NextFunction) {
  req.requestId = req.headers["x-request-id"] as string || randomUUID();
  next();
}

// Helper para criar logger de requisição com contexto
export function reqLog(req: Request) {
  return log.child({ 
    rid: req.requestId, 
    path: req.path, 
    method: req.method 
  });
}

// Exporta logger base também
export default log;
