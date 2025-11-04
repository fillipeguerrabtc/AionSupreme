/**
 * 📦 FASE 2 - B2: HTTP Response Envelopes
 * 
 * Padroniza TODAS as respostas HTTP para formato consistente:
 * 
 * Sucesso: { ok: true, data: {...} }
 * Erro: { ok: false, error: "message" }
 * 
 * Benefícios:
 * - Frontend pode sempre confiar no formato
 * - TypeScript pode tipar responses genericamente
 * - Debugging mais fácil (sempre mesmo formato)
 */

import { type Response } from "express";

/**
 * Response envelope type
 */
export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Helper: Send success response with envelope
 */
export function sendSuccess<T>(res: Response, data: T, metadata?: Record<string, any>): void {
  const response: ApiResponse<T> = {
    ok: true,
    data,
    ...(metadata && { metadata }),
  };
  
  res.json(response);
}

/**
 * Helper: Send error response with envelope
 */
export function sendError(res: Response, statusCode: number, error: string, metadata?: Record<string, any>): void {
  const response: ApiResponse = {
    ok: false,
    error,
    ...(metadata && { metadata }),
  };
  
  res.status(statusCode).json(response);
}

/**
 * Helper: Send validation error (400)
 */
export function sendValidationError(res: Response, error: string): void {
  sendError(res, 400, error);
}

/**
 * Helper: Send not found error (404)
 */
export function sendNotFound(res: Response, resource: string): void {
  sendError(res, 404, `${resource} not found`);
}

/**
 * Helper: Send forbidden error (403)
 */
export function sendForbidden(res: Response, message: string = "Forbidden"): void {
  sendError(res, 403, message);
}

/**
 * Helper: Send unauthorized error (401)
 */
export function sendUnauthorized(res: Response, message: string = "Unauthorized"): void {
  sendError(res, 401, message);
}

/**
 * Helper: Send internal server error (500)
 */
export function sendServerError(res: Response, error: Error | string): void {
  const message = error instanceof Error ? error.message : error;
  sendError(res, 500, message);
}

/**
 * Helper: Send rate limit error (429)
 */
export function sendRateLimitError(res: Response, retryAfter: number = 60): void {
  const response: ApiResponse = {
    ok: false,
    error: "Rate limit exceeded",
    metadata: {
      retryAfter,
    },
  };
  
  // Set Retry-After header (standard HTTP header)
  res.setHeader("Retry-After", retryAfter);
  res.status(429).json(response);
}

/**
 * ⚡ FASE 2 - B2: Response Envelope Helper Object
 * 
 * Facilita criar response objects sem precisar do objeto `res`
 * Útil para testes e para retornar objetos de resposta
 */
export const responseEnvelope = {
  /**
   * Cria response envelope de sucesso
   */
  success<T>(data: T, message?: string): ApiResponse<T> {
    return {
      ok: true,
      data,
      ...(message && { metadata: { message } }),
    };
  },

  /**
   * Cria response envelope de erro
   */
  error(message: string, code?: string): ApiResponse {
    return {
      ok: false,
      error: message,
      ...(code && { metadata: { code } }),
    };
  },
};
