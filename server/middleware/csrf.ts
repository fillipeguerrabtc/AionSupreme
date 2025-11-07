import { Request, Response, NextFunction } from 'express';

/**
 * CSRF protection middleware using Custom Header validation
 * 
 * STRATEGY: Double Defense
 * 1. SameSite=strict cookie (prevents cross-site cookie transmission)
 * 2. Custom header validation (prevents simple form submissions)
 * 
 * Requires X-Requested-With header on all state-changing requests
 * Works in conjunction with SameSite=strict cookie attribute
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Allow safe methods (GET, HEAD, OPTIONS) without CSRF check
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Require custom header for state-changing requests (POST, PUT, DELETE, PATCH)
  const customHeader = req.get('X-Requested-With');
  if (customHeader !== 'XMLHttpRequest') {
    console.warn(`🚨 [CSRF] Attack attempt blocked: ${req.method} ${req.path} from ${req.ip}`);
    
    return res.status(403).json({
      error: 'CSRF validation failed',
      message: 'Missing required security header'
    });
  }

  next();
}
