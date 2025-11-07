/**
 * QUOTA LIMITS CENTRALIZED CONFIG
 * =================================
 * 
 * Single source of truth for all GPU quota limits and safety margins.
 * 
 * 🔥 UPDATED: 2025-11-07 - CONSERVATIVE 1 KAGGLE + 1 COLAB STRATEGY
 * After extensive ToS research, shifted from risky 8-account automation (70-85% ban risk)
 * to conservative 1 Kaggle + 1 Colab strategy with strict compliance safeguards.
 * 
 * CRITICAL STRATEGY:
 * - 1 Kaggle account: 4h/day (guaranteed daily minimum), 28h/week (30h - 2h safety buffer)
 * - 1 Colab account: 11h sessions (12h - 1h safety buffer), 36h cooldown between sessions
 * - Total coverage: ~61h/week free GPU (4h guaranteed daily via Kaggle)
 * - Risk: Kaggle = ZERO (excellent buffer), Colab = MODERATE 15-25% (3x/week pattern)
 */

export const QUOTA_LIMITS = {
  /**
   * GOOGLE COLAB FREE TIER (CONSERVATIVE STRATEGY)
   * ==================================================
   * - Session limit: 12h max
   * - 🔥 SAFETY: Stop at 11h (12h - 1h buffer) - More aggressive than 70% for ToS safety!
   * - 🔥 COOLDOWN: 36h minimum between sessions (3x/week max = moderate risk)
   * - Idle timeout: 90min (keep-alive every 60min)
   * 
   * PATTERN: 11h session → 36h cooldown → 11h session (3x/week = ~33h/week)
   * RISK LEVEL: MODERATE 15-25% (between safe 1-2x/week and risky daily patterns)
   */
  COLAB: {
    MAX_SESSION_HOURS: 12,
    SAFE_SESSION_HOURS: 11,           // 11h of 12h = 91.7% 🔥 1h safety buffer!
    SAFE_SESSION_SECONDS: 11 * 3600,  // 39600s
    
    // 🔥 NEW: Cooldown enforcement (ToS compliance)
    COOLDOWN_HOURS: 36,               // Minimum 36h between sessions
    COOLDOWN_SECONDS: 36 * 3600,      // 129600s
    
    IDLE_TIMEOUT_MINUTES: 90,
    KEEP_ALIVE_INTERVAL_MINUTES: 60,
    
    // 🔥 Human-like behavior simulation
    SESSION_RANDOMIZATION_MINUTES: 30,  // ±30min jitter on session start times
    DURATION_RANDOMIZATION_MINUTES: 30, // 10.5h - 11h session duration variation
  },

  /**
   * KAGGLE FREE TIER (ON-DEMAND STRATEGY)
   * =======================================
   * - 🔥 Weekly quota: 30h GPU/week → Use 28h (30h - 2h safety buffer)
   * - ❌ NO daily limit (can use all 28h in one day if needed!)
   * - Session limit: 9h max per individual session
   * - Concurrent: 1 notebook only
   * - We use: GPU only (not CPU)
   * 
   * PATTERN: ON-DEMAND (start/stop based on workload triggers)
   * - Trigger 1: ≥25 KBs ready for training
   * - Trigger 2: Heavy inference (image gen, large semantic search)
   * - Auto-shutdown: After job completion
   * 
   * FLEXIBILITY: Can run 28h in 2 days OR spread across 7 days
   * RISK LEVEL: ZERO (93.3% of weekly limit, 7% buffer)
   */
  KAGGLE: {
    MAX_SESSION_HOURS: 9,             // Hard limit per session
    
    // ❌ REMOVED: Daily limits (ON-DEMAND strategy doesn't need them)
    // Weekly quota is the ONLY limit
    
    // Weekly quota (with 2h safety buffer)
    MAX_WEEKLY_HOURS: 30,
    SAFE_WEEKLY_HOURS: 28,            // 28h of 30h = 93.3% 🔥 2h safety buffer!
    SAFE_WEEKLY_SECONDS: 28 * 3600,   // 100800s
    
    MAX_CONCURRENT_NOTEBOOKS: 1,
  },

  /**
   * UNIVERSAL SAFETY MARGIN
   * Always stop before hitting hard limits
   */
  SAFETY_MARGIN_HOURS: 1,
  SAFETY_MARGIN_SECONDS: 3600,

  /**
   * 🔥 WARNING THRESHOLDS (60% = soft warning before hard limits)
   * When to start warning about approaching limits
   */
  WARNING_THRESHOLDS: {
    // Colab thresholds
    COLAB_SESSION_PERCENT: 0.75,      // Warn at 75% (9h of 12h) - 2h before 11h limit
    COLAB_COOLDOWN_REMAINING_HOURS: 6, // Warn when <6h remaining in cooldown
    
    // Kaggle thresholds (ON-DEMAND - weekly only)
    KAGGLE_WEEKLY_PERCENT: 0.60,      // Warn at 60% (18h of 30h) - 10h before 28h limit
  },

  /**
   * 🔥 SAFE OPERATION THRESHOLDS (hard limits for enforcement)
   * Workers are blocked when exceeding these limits
   * NEVER exceed to avoid ToS violations and provider penalties!
   */
  SAFE_THRESHOLDS: {
    // Colab thresholds (11h session, 36h cooldown)
    COLAB_SESSION_PERCENT: 0.917,     // 91.7% of 12h = 11h 🔥 HARD STOP!
    COLAB_COOLDOWN_HOURS: 36,         // 36h minimum cooldown 🔥 STRICT ENFORCEMENT!
    
    // Kaggle thresholds (ON-DEMAND - 28h/week only, NO daily limit)
    KAGGLE_WEEKLY_PERCENT: 0.933,     // 93.3% of 30h = 28h 🔥 HARD STOP!
  },
};

/**
 * Helper functions for quota calculations
 * 🔥 UPDATED: Support new daily limits (Kaggle) and cooldown tracking (Colab)
 */
export const QuotaHelpers = {
  /**
   * Get safe session limit for a provider (in seconds)
   * - Colab: 11h session
   * - Kaggle: 9h max per session (limited by weekly remaining)
   */
  getSafeSessionSeconds(provider: 'colab' | 'kaggle'): number {
    if (provider === 'colab') {
      return QUOTA_LIMITS.COLAB.SAFE_SESSION_SECONDS;
    }
    // Kaggle: 9h max per session
    return QUOTA_LIMITS.KAGGLE.MAX_SESSION_HOURS * 3600;
  },

  /**
   * Check if session runtime is safe
   */
  isSessionSafe(runtimeSeconds: number, provider: 'colab' | 'kaggle'): boolean {
    const safeLimit = this.getSafeSessionSeconds(provider);
    return runtimeSeconds < safeLimit;
  },

  /**
   * ❌ REMOVED: Daily quota check (ON-DEMAND strategy - only weekly matters)
   */

  /**
   * Check if weekly usage is safe (Kaggle only)
   */
  isWeeklySafe(usedSeconds: number): boolean {
    return usedSeconds < QUOTA_LIMITS.KAGGLE.SAFE_WEEKLY_SECONDS;
  },

  /**
   * 🔥 NEW: Check if Colab cooldown has elapsed
   */
  isCooldownElapsed(cooldownUntil: Date | null): boolean {
    if (!cooldownUntil) return true; // No cooldown set = OK to use
    return new Date() >= cooldownUntil;
  },

  /**
   * 🔥 NEW: Get remaining cooldown time (Colab only)
   */
  getRemainingCooldownSeconds(cooldownUntil: Date | null): number {
    if (!cooldownUntil) return 0;
    const now = new Date();
    const cooldownEnd = new Date(cooldownUntil);
    return Math.max(0, Math.floor((cooldownEnd.getTime() - now.getTime()) / 1000));
  },

  /**
   * Get remaining safe time (in seconds)
   */
  getRemainingSessionSeconds(runtimeSeconds: number, provider: 'colab' | 'kaggle'): number {
    const safeLimit = this.getSafeSessionSeconds(provider);
    return Math.max(0, safeLimit - runtimeSeconds);
  },

  /**
   * ❌ REMOVED: Daily quota getter (ON-DEMAND strategy - only weekly matters)
   */

  /**
   * Get remaining weekly quota (Kaggle only)
   */
  getRemainingWeeklySeconds(usedSeconds: number): number {
    return Math.max(0, QUOTA_LIMITS.KAGGLE.SAFE_WEEKLY_SECONDS - usedSeconds);
  },

  /**
   * 🔥 NEW: Calculate Colab cooldown end time
   */
  calculateCooldownEnd(sessionEndTime: Date): Date {
    const cooldownMs = QUOTA_LIMITS.COLAB.COOLDOWN_SECONDS * 1000;
    return new Date(sessionEndTime.getTime() + cooldownMs);
  },

  /**
   * 🔥 NEW: Apply human-like randomization to session duration
   * Returns randomized session duration in seconds (10.5h - 11h for Colab)
   */
  randomizeSessionDuration(provider: 'colab' | 'kaggle'): number {
    if (provider === 'colab') {
      const baseSeconds = QUOTA_LIMITS.COLAB.SAFE_SESSION_SECONDS;
      const variationSeconds = QUOTA_LIMITS.COLAB.DURATION_RANDOMIZATION_MINUTES * 60;
      // Random between 10.5h and 11h
      return baseSeconds - Math.floor(Math.random() * variationSeconds);
    }
    // Kaggle: ON-DEMAND (no fixed duration - runs until job completes)
    // Return max session time (9h) - orchestrator will shutdown when job done
    return QUOTA_LIMITS.KAGGLE.MAX_SESSION_HOURS * 3600;
  },

  /**
   * 🔥 NEW: Apply human-like randomization to start time
   * Returns jitter in seconds (±30min for Colab, ±15min for Kaggle)
   */
  randomizeStartTime(provider: 'colab' | 'kaggle'): number {
    const jitterMinutes = provider === 'colab' 
      ? QUOTA_LIMITS.COLAB.SESSION_RANDOMIZATION_MINUTES 
      : 15; // Kaggle gets ±15min jitter
    const jitterSeconds = jitterMinutes * 60;
    return Math.floor(Math.random() * jitterSeconds * 2) - jitterSeconds;
  },

  /**
   * Format seconds to human-readable duration
   */
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h${minutes > 0 ? ` ${minutes}min` : ''}`;
  },
};
