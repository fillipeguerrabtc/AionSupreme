/**
 * Authentication Middleware - JWT Auth
 * 
 * As per security requirements:
 * - JWT authentication
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
 * Uses single API key from environment variable
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
 * Validate API key
 * 
 * SECURITY FIX: Now validates against SYSTEM_API_KEY environment variable
 */
async function validateApiKey(apiKey: string): Promise<boolean> {
  // Validate against environment variable
  const systemApiKey = process.env.SYSTEM_API_KEY;
  
  if (systemApiKey) {
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(apiKey),
      Buffer.from(systemApiKey)
    );
  }
  
  // If no SYSTEM_API_KEY is set, reject all API key attempts
  console.warn("[Auth] No SYSTEM_API_KEY configured");
  return false;
}

/**
 * Generate API key
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Optional: JWT Token generation (for future OAuth/session management)
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

/**
 * SECURITY FIX: Require Replit Authentication Middleware
 * 
 * Prevents unauthorized access to protected routes.
 * All admin/management routes MUST use this middleware.
 * 
 * Usage:
 * app.get("/api/admin/users", requireAuth, async (req, res) => { ... });
 * 
 * Returns 401 Unauthorized if user is not authenticated via Replit Auth
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ 
      error: "Unauthorized",
      message: "Authentication required to access this resource"
    });
  }
  
  next();
}

/**
 * Optional authentication middleware
 * 
 * Allows access but sets req.user if authenticated
 * Useful for routes that show different content based on auth status
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // Just pass through, req.user will be set if authenticated
  next();
}

/**
 * PRODUCTION HELPER: Extract userId from session (supports both OAuth and Local auth)
 * 
 * Returns userId string or null if not authenticated
 * Works with both Replit OAuth (user.claims.sub) and Local auth (user.id)
 */
export function getUserId(req: Request): string | null {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return null;
  }
  
  const user = req.user as any;
  
  // Local authentication - user.id is directly available
  if (user.isLocal && user.id) {
    return user.id;
  }
  
  // OAuth authentication - user.claims.sub
  if (user.claims && user.claims.sub) {
    return user.claims.sub;
  }
  
  return null;
}

/**
 * CRITICAL SECURITY: Require Admin Role Middleware
 * 
 * Prevents unauthorized access to admin-only routes.
 * Returns 403 Forbidden if user is authenticated but not an admin.
 * Returns 401 Unauthorized if user is not authenticated.
 * 
 * Usage:
 * app.get("/api/admin/users", requireAdmin, async (req, res) => { ... });
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // First check if authenticated
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ 
      error: "Unauthorized",
      message: "Authentication required to access this resource"
    });
  }
  
  const user = req.user as any;
  
  // Get user roles from database
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Unable to identify user"
      });
    }
    
    // Check if user has admin role in database
    // PRODUCTION: Accepts "Super Admin" or "Admin" roles
    const userRoles = await storage.getUserRoles(userId);
    const isAdmin = userRoles.some((role: any) => 
      role.name === 'Super Admin' || role.name === 'Admin'
    );
    
    if (!isAdmin) {
      return res.status(403).json({ 
        error: "Forbidden",
        message: "Admin role required to access this resource"
      });
    }
    
    next();
  } catch (error) {
    console.error('[Auth] Error checking admin role:', error);
    return res.status(500).json({ 
      error: "Internal Server Error",
      message: "Failed to verify admin role"
    });
  }
}

/**
 * GRANULAR PERMISSION MIDDLEWARE FACTORY
 * 
 * Creates a middleware that checks if the authenticated user has a specific permission.
 * This allows fine-grained access control beyond simple admin/non-admin roles.
 * 
 * @param requiredPermission - Permission code in format "module:submodule:action"
 *                            (e.g., "kb:documents:create", "agents:list:read")
 * 
 * Usage:
 * app.post("/api/kb/documents", requirePermission("kb:documents:create"), async (req, res) => { ... });
 * app.get("/api/agents", requirePermission("agents:list:read"), async (req, res) => { ... });
 * 
 * @returns Express middleware function
 */
export function requirePermission(requiredPermission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // First check if authenticated
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ 
        error: "Unauthorized",
        message: "Authentication required to access this resource"
      });
    }
    
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.status(401).json({ 
          error: "Unauthorized",
          message: "Unable to identify user"
        });
      }
      
      // Get all permissions for this user (combines permissions from all their roles)
      const userPermissions = await storage.getUserPermissions(userId);
      
      // Check if user has the required permission
      const hasPermission = userPermissions.some(
        permission => permission.code === requiredPermission
      );
      
      if (!hasPermission) {
        return res.status(403).json({ 
          error: "Forbidden",
          message: `Permission required: ${requiredPermission}`
        });
      }
      
      next();
    } catch (error) {
      console.error('[Auth] Error checking user permission:', error);
      return res.status(500).json({ 
        error: "Internal Server Error",
        message: "Failed to verify user permissions"
      });
    }
  };
}

/**
 * HELPER: Get all permissions for a user
 * 
 * Useful for frontend to determine what UI elements to show/hide
 * This is exported so it can be used in routes that need to check permissions programmatically
 * 
 * @param userId - User ID
 * @returns Array of permission codes (e.g., ["kb:documents:read", "kb:documents:create"])
 */
export async function getUserPermissionCodes(userId: string): Promise<string[]> {
  try {
    const permissions = await storage.getUserPermissions(userId);
    return permissions.map(p => p.code);
  } catch (error) {
    console.error('[Auth] Error fetching user permissions:', error);
    return [];
  }
}
