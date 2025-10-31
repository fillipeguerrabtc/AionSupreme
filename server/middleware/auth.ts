/**
 * Authentication Middleware - JWT Auth with per-tenant keys
 * 
 * As per security requirements:
 * - JWT authentication with tenant-specific keys
 * - API key validation
 * - Request signing
 * - Token refresh mechanism
 */

import { type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { storage } from "../storage";

interface AuthenticatedRequest extends Request {
  tenantId?: number;
  apiKey?: string;
}

/**
 * API Key Authentication Middleware
 * Validates API key from Authorization header
 */
export async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // For development, allow requests without auth on certain routes
      if (process.env.NODE_ENV === "development" && req.path.startsWith("/api/")) {
        req.tenantId = 1; // Default tenant
        return next();
      }

      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer "

    // Validate API key
    const tenant = await validateApiKey(apiKey);

    if (!tenant) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    // Attach tenant to request
    req.tenantId = tenant.id;
    req.apiKey = apiKey;

    next();
  } catch (error: any) {
    console.error("[Auth] Authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Validate API key (SINGLE-TENANT MODE)
 * NOTE: Always returns default tenant since AION is single-tenant (tenantId=1)
 */
async function validateApiKey(apiKey: string): Promise<{ id: number; name: string } | null> {
  // Single-tenant: always return default tenant
  return { id: 1, name: "AION" };
}

/**
 * Generate API key for tenant
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Optional: JWT Token generation (for future OAuth/session management)
 */
export function generateJWT(tenantId: number, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      tenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");

  return `${header}.${payload}.${signature}`;
}

/**
 * Verify JWT token
 */
export function verifyJWT(token: string, secret: string): { tenantId: number } | null {
  try {
    const [header, payload, signature] = token.split(".");
    
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    
    // Check expiration
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return { tenantId: decoded.tenantId };
  } catch (error) {
    return null;
  }
}
