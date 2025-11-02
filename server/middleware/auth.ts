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
 * 
 * SECURITY FIX: Removed automatic bypass - now requires valid API key or explicit disable
 * 
 * SINGLE-TENANT: Uses single API key from environment variable
 * Set SYSTEM_API_KEY in environment to enable API key authentication
 * Set DISABLE_API_KEY_AUTH=true to completely disable (NOT recommended for production)
 */
export async function authenticateApiKey(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // SECURITY: Allow disabling API key auth ONLY if explicitly set
    // This should NEVER be used in production
    if (process.env.DISABLE_API_KEY_AUTH === "true") {
      console.warn("[Auth] ⚠️  API Key authentication is DISABLED - this is insecure!");
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer "

    // Validate API key against environment variable or database
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
 * 
 * SECURITY FIX: Now validates against SYSTEM_API_KEY environment variable
 * Or falls back to database validation for multi-tenant future compatibility
 */
async function validateApiKey(apiKey: string): Promise<boolean> {
  // Validate against environment variable (single-tenant mode)
  const systemApiKey = process.env.SYSTEM_API_KEY;
  
  if (systemApiKey) {
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(apiKey),
      Buffer.from(systemApiKey)
    );
  }
  
  // Future: validate against database for multi-tenant support
  // const tenant = await storage.getTenantByApiKey(apiKey);
  // return !!tenant;
  
  // If no SYSTEM_API_KEY is set and database validation is not implemented,
  // reject all API key attempts
  console.warn("[Auth] No SYSTEM_API_KEY configured and database validation not implemented");
  return false;
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
