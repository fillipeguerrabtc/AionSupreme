/**
 * 🎯 FASE 1 - Tipagem de Erros Correta
 * 
 * Helper para error handling production-grade.
 * Converte erros desconhecidos em mensagens tipadas.
 */

import type { Response } from "express";
import type { Request } from "express";
import { reqLog } from "./logger";

/**
 * Extrai mensagem de erro de forma type-safe
 * @param error Erro desconhecido
 * @returns Mensagem de erro tipada
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Erro desconhecido";
}

/**
 * Extrai stack trace de erro de forma type-safe
 * @param error Erro desconhecido
 * @returns Stack trace ou undefined
 */
export function extractErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * Handler de erro padronizado para rotas
 * Loga erro estruturado e retorna resposta HTTP apropriada
 */
export function handleRouteError(
  req: Request,
  res: Response,
  error: unknown,
  context?: string
): void {
  const message = extractErrorMessage(error);
  const stack = extractErrorStack(error);

  // Log estruturado com requestId
  reqLog(req).error({
    context,
    error: message,
    stack,
  });

  // Resposta HTTP
  res.status(500).json({
    ok: false,
    error: message,
  });
}

/**
 * Exemplo de uso correto em rotas:
 * 
 * app.post('/api/chat', async (req, res) => {
 *   try {
 *     // ... código da rota
 *   } catch (error: unknown) {
 *     handleRouteError(req, res, error, 'POST /api/chat');
 *   }
 * });
 */
