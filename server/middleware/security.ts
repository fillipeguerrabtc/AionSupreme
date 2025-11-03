import helmet from "helmet";
import cors from "cors";
import type { Express } from "express";

export function applySecurity(app: Express) {
  // Helmet - Proteção contra vulnerabilidades HTTP comuns
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // Desabilitado para permitir inline scripts do Vite
    crossOriginEmbedderPolicy: false // Desabilitado para permitir recursos externos
  }));

  // CORS - Controle de acesso cross-origin
  const corsOrigin = process.env.CORS_ORIGIN?.split(",") || "*";
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    exposedHeaders: ["X-Request-ID"]
  }));
}
