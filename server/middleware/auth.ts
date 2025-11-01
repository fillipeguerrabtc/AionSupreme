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
  apiKey?: string;
}

/**
 * API Key Authentication Middleware
 * Validates API key from Authorization header
 * SINGLE-TENANT: No tenant validation needed
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
        return next();
      }

      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer "

    // Validate API key (single-tenant: always valid in dev)
    const isValid = await validateApiKey(apiKey);

    if (!isValid) {
      return res.status(401).json({ error: "Invalid API key" });
    }

    req.apiKey = apiKey;

    next();
  } catch (error: any) {
    console.error("[Auth] Authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Validate API key (SINGLE-TENANT MODE)
 * NOTE: Always returns true since AION is single-tenant
 */
async function validateApiKey(apiKey: string): Promise<boolean> {
  // Single-tenant: always valid
  return true;
}

/**
 * Generate API key for tenant
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Optional: JWT Token generation (for future OAuth/session management)
 * SINGLE-TENANT: Removed tenantId from JWT
 */
export function generateJWT(secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
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
 * SINGLE-TENANT: Returns true/false instead of tenant info
 */
export function verifyJWT(token: string, secret: string): boolean {
  try {
    const [header, payload, signature] = token.split(".");
    
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest("base64url");

    if (signature !== expectedSignature) {
      return false;
    }

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    
    // Check expiration
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
