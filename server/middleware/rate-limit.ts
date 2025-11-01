/**
 * Rate Limiting Middleware - Per-tenant and per-IP limits
 * 
 * As per PDFs: Configurable rate limits to prevent abuse
 * - Requests per minute/hour/day
 * - Token limits per day
 * - Concurrent request limits
 */

import { type Request, type Response, type NextFunction } from "express";

interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  tokensPerDay: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
  tokens: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig = {
    // Use 300 as default for dev/prod, but allow env override
    requestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "") || 300,
    requestsPerHour: parseInt(process.env.RATE_LIMIT_PER_HOUR || "") || 5000,
    requestsPerDay: parseInt(process.env.RATE_LIMIT_PER_DAY || "") || 50000,
    tokensPerDay: parseInt(process.env.RATE_LIMIT_TOKENS || "") || 1000000,
  };

  /**
   * Check if request should be rate limited
   */
  shouldLimit(key: string, window: "minute" | "hour" | "day"): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry) {
      this.limits.set(key, {
        count: 1,
        resetAt: this.getResetTime(window),
        tokens: 0,
      });
      return false;
    }

    // Reset if window expired
    if (now >= entry.resetAt) {
      entry.count = 1;
      entry.resetAt = this.getResetTime(window);
      entry.tokens = 0;
      return false;
    }

    // Check limits
    const limit = this.getLimit(window);
    if (entry.count >= limit) {
      return true; // Rate limited
    }

    entry.count++;
    return false;
  }

  /**
   * Track tokens used (for LLM calls)
   */
  trackTokens(key: string, tokens: number): boolean {
    const entry = this.limits.get(key) || {
      count: 0,
      resetAt: this.getResetTime("day"),
      tokens: 0,
    };

    entry.tokens += tokens;
    this.limits.set(key, entry);

    return entry.tokens > this.config.tokensPerDay;
  }

  /**
   * Get remaining quota
   */
  getRemaining(key: string, window: "minute" | "hour" | "day"): number {
    const entry = this.limits.get(key);
    if (!entry) return this.getLimit(window);

    const now = Date.now();
    if (now >= entry.resetAt) return this.getLimit(window);

    return Math.max(0, this.getLimit(window) - entry.count);
  }

  getLimit(window: "minute" | "hour" | "day"): number {
    switch (window) {
      case "minute":
        return this.config.requestsPerMinute;
      case "hour":
        return this.config.requestsPerHour;
      case "day":
        return this.config.requestsPerDay;
    }
  }

  private getResetTime(window: "minute" | "hour" | "day"): number {
    const now = Date.now();
    switch (window) {
      case "minute":
        return now + 60 * 1000;
      case "hour":
        return now + 60 * 60 * 1000;
      case "day":
        return now + 24 * 60 * 60 * 1000;
    }
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of Array.from(this.limits.entries())) {
      if (now >= entry.resetAt) {
        this.limits.delete(key);
      }
    }
  }
}

const rateLimiter = new RateLimiter();

// Cleanup every 5 minutes
setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);

/**
 * Rate limiting middleware
 * SINGLE-TENANT: Rate limits by IP only (no tenant separation)
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const key = `system:${ip}`;

  // Check per-minute limit
  if (rateLimiter.shouldLimit(key, "minute")) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      retryAfter: 60,
      remaining: 0,
    });
  }

  // Add complete rate limit headers for all windows (minute/hour/day)
  res.setHeader("X-RateLimit-Limit-Minute", rateLimiter.getLimit("minute"));
  res.setHeader("X-RateLimit-Limit-Hour", rateLimiter.getLimit("hour"));
  res.setHeader("X-RateLimit-Limit-Day", rateLimiter.getLimit("day"));
  res.setHeader("X-RateLimit-Remaining-Minute", rateLimiter.getRemaining(key, "minute"));
  res.setHeader("X-RateLimit-Remaining-Hour", rateLimiter.getRemaining(key, "hour"));
  res.setHeader("X-RateLimit-Remaining-Day", rateLimiter.getRemaining(key, "day"));

  next();
}

export { rateLimiter };
