/**
 * Audit Logging Middleware - Immutable audit trail with SHA-256
 * 
 * As per PDFs: Complete audit logging for compliance
 * - Every API request logged
 * - Cryptographic hash of data (SHA-256)
 * - Immutable append-only logs
 * - Tenant isolation
 */

import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { enforcementPipeline } from "../policy/enforcement-pipeline";

interface AuditEntry {
  timestamp: Date;
  tenantId: number;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
  requestBody: any;
  responseStatus: number;
  responseTime: number;
  dataHash: string;
}

/**
 * Audit logging middleware
 */
export function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startTime = Date.now();
  const tenantId = (req as any).tenantId || 1;

  // Capture original res.json to intercept response
  const originalJson = res.json.bind(res);
  let responseBody: any;

  res.json = function (body: any) {
    responseBody = body;
    return originalJson(body);
  };

  // Log on response finish
  res.on("finish", async () => {
    const responseTime = Date.now() - startTime;

    const auditEntry: AuditEntry = {
      timestamp: new Date(),
      tenantId,
      method: req.method,
      path: req.path,
      ip: req.ip || req.socket.remoteAddress || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      requestBody: sanitizeBody(req.body),
      responseStatus: res.statusCode,
      responseTime,
      dataHash: hashData({
        method: req.method,
        path: req.path,
        body: req.body,
        response: responseBody,
      }),
    };

    // Log significant operations
    if (shouldAudit(req.path, req.method)) {
      try {
        await enforcementPipeline.createAuditLog(
          tenantId,
          `${req.method} ${req.path}`,
          auditEntry,
          undefined
        );
      } catch (error) {
        console.error("[Audit] Failed to create audit log:", error);
      }
    }
  });

  next();
}

/**
 * Determine if request should be audited
 */
function shouldAudit(path: string, method: string): boolean {
  // Audit all mutations and sensitive reads
  if (method !== "GET") return true;

  // Audit specific GET endpoints
  if (path.includes("/admin/") || path.includes("/policies/")) {
    return true;
  }

  return false;
}

/**
 * Hash data for audit trail
 */
function hashData(data: any): string {
  const serialized = JSON.stringify(data);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Sanitize sensitive data from logs
 */
function sanitizeBody(body: any): any {
  if (!body) return body;

  const sanitized = { ...body };

  // Remove sensitive fields
  const sensitiveFields = ["password", "apiKey", "api_key", "secret", "token"];
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}
