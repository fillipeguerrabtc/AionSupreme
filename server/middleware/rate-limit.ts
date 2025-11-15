/**
 * SECURITY FIX: Rate Limiting Middleware - Persistent PostgreSQL storage
 * 
 * Hybrid approach:
 * - In-memory cache for performance (fast reads)
 * - PostgreSQL for persistence (survives restarts)
 * - Periodic sync to DB every 10 seconds
 * 
 * Prevents rate limit bypass via server restart.
 */

import { type Request, type Response, type NextFunction } from "express";
import { db } from "../db";
import { rateLimits } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { sendRateLimitError } from "../utils/response";

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
  dirty: boolean; // Needs sync to DB
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
  private syncInProgress = false;

  /**
   * SECURITY FIX: Load rate limits from PostgreSQL on startup
   */
  async loadFromDB(): Promise<void> {
    try {
      const now = new Date();
      const records = await db
        .select()
        .from(rateLimits)
        .where(sql`${rateLimits.resetAt} > ${now}`);

      for (const record of records) {
        const mapKey = `${record.key}:${record.window}`;
        this.limits.set(mapKey, {
          count: record.count,
          resetAt: record.resetAt.getTime(),
          tokens: record.tokens,
          dirty: false,
        });
      }
      
      console.log({ count: records.length }, '[RateLimiter] Loaded active rate limits from DB');
    } catch (error) {
      console.error({ error }, '[RateLimiter] Failed to load from DB');
    }
  }

  /**
   * SECURITY FIX: Sync dirty entries to PostgreSQL
   */
  async syncToDB(): Promise<void> {
    if (this.syncInProgress) return;
    this.syncInProgress = true;

    try {
      const dirtyEntries = Array.from(this.limits.entries())
        .filter(([_, entry]) => entry.dirty);

      if (dirtyEntries.length === 0) {
        this.syncInProgress = false;
        return;
      }

      for (const [mapKey, entry] of dirtyEntries) {
        // SECURITY FIX: Use lastIndexOf to handle IPv6 addresses with colons
        // mapKey format: "system:192.168.1.1:minute" or "system:::ffff:172.31.0.2:hour"
        const lastColonIndex = mapKey.lastIndexOf(':');
        const key = mapKey.substring(0, lastColonIndex);
        const window = mapKey.substring(lastColonIndex + 1);
        
        if (window.length > 10) {
          console.warn({ window, windowLength: window.length, mapKey, key, keyLength: key.length }, '[RateLimiter] Invalid window length detected, skipping entry');
          continue; // Skip invalid entries
        }
        
        // Manual upsert: Check if exists, then UPDATE or INSERT
        const existing = await db
          .select()
          .from(rateLimits)
          .where(and(eq(rateLimits.key, key), eq(rateLimits.window, window)))
          .limit(1);

        if (existing.length > 0) {
          // UPDATE existing record
          await db
            .update(rateLimits)
            .set({
              count: entry.count,
              tokens: entry.tokens,
              resetAt: new Date(entry.resetAt),
              updatedAt: new Date(),
            })
            .where(and(eq(rateLimits.key, key), eq(rateLimits.window, window)));
        } else {
          // INSERT new record
          await db.insert(rateLimits).values({
            key,
            window,
            count: entry.count,
            tokens: entry.tokens,
            resetAt: new Date(entry.resetAt),
          });
        }

        entry.dirty = false;
      }

      console.log({ count: dirtyEntries.length }, '[RateLimiter] Synced entries to DB');
    } catch (error) {
      console.error({ error }, '[RateLimiter] Failed to sync to DB');
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Check if request should be rate limited
   */
  shouldLimit(key: string, window: "minute" | "hour" | "day"): boolean {
    const now = Date.now();
    const mapKey = `${key}:${window}`;
    const entry = this.limits.get(mapKey);

    if (!entry) {
      this.limits.set(mapKey, {
        count: 1,
        resetAt: this.getResetTime(window),
        tokens: 0,
        dirty: true, // Mark for DB sync
      });
      return false;
    }

    // Reset if window expired
    if (now >= entry.resetAt) {
      entry.count = 1;
      entry.resetAt = this.getResetTime(window);
      entry.tokens = 0;
      entry.dirty = true;
      return false;
    }

    // Check limits
    const limit = this.getLimit(window);
    if (entry.count >= limit) {
      return true; // Rate limited
    }

    entry.count++;
    entry.dirty = true; // Mark for DB sync
    return false;
  }

  /**
   * Track tokens used (for LLM calls)
   */
  trackTokens(key: string, tokens: number): boolean {
    const mapKey = `${key}:day`;
    const entry = this.limits.get(mapKey) || {
      count: 0,
      resetAt: this.getResetTime("day"),
      tokens: 0,
      dirty: false,
    };

    entry.tokens += tokens;
    entry.dirty = true; // Mark for DB sync
    this.limits.set(mapKey, entry);

    return entry.tokens > this.config.tokensPerDay;
  }

  /**
   * Get remaining quota
   */
  getRemaining(key: string, window: "minute" | "hour" | "day"): number {
    const mapKey = `${key}:${window}`;
    const entry = this.limits.get(mapKey);
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
   * SECURITY FIX: Clean up expired entries in memory AND PostgreSQL
   */
  async cleanup() {
    const now = Date.now();
    
    // Clean memory cache
    for (const [key, entry] of Array.from(this.limits.entries())) {
      if (now >= entry.resetAt) {
        this.limits.delete(key);
      }
    }
    
    // Clean PostgreSQL
    try {
      await db
        .delete(rateLimits)
        .where(lt(rateLimits.resetAt, new Date()));
      
      console.log('[RateLimiter] Cleaned up expired entries from DB');
    } catch (error) {
      console.error({ error }, '[RateLimiter] Failed to cleanup DB');
    }
  }
}

const rateLimiter = new RateLimiter();

// SECURITY FIX: Load from PostgreSQL on startup
rateLimiter.loadFromDB().catch((err) => {
  console.error({ error: err }, '[RateLimiter] Failed to load from DB on startup');
});

// SECURITY FIX: Sync to PostgreSQL every 10 seconds
setInterval(() => {
  rateLimiter.syncToDB().catch((err) => {
    console.error({ error: err }, '[RateLimiter] Failed to sync to DB');
  });
}, 10 * 1000);

// SECURITY FIX: Cleanup expired entries every 5 minutes
setInterval(() => {
  rateLimiter.cleanup().catch((err) => {
    console.error({ error: err }, '[RateLimiter] Failed to cleanup');
  });
}, 5 * 60 * 1000);

/**
 * Rate limiting middleware
 * Rate limits by IP
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const key = `system:${ip}`;

  // ✅ FIX P0-10: Check per-minute limit
  if (rateLimiter.shouldLimit(key, "minute")) {
    return sendRateLimitError(res, 60);
  }

  // ✅ FIX P0-10: Check per-hour limit
  if (rateLimiter.shouldLimit(key, "hour")) {
    return sendRateLimitError(res, 3600);
  }

  // ✅ FIX P0-10: Check per-day limit  
  if (rateLimiter.shouldLimit(key, "day")) {
    return sendRateLimitError(res, 86400);
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
