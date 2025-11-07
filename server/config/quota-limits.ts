/**
 * QUOTA LIMITS CENTRALIZED CONFIG
 * =================================
 * 
 * Single source of truth for all GPU quota limits and safety margins.
 * 
 * CRITICAL RULE: Stop 1 hour BEFORE hitting Google's limits to avoid penalties.
 * 
 * Updated: 2025-11-06
 * Reason: Consolidate conflicting quota definitions across multiple services
 */

export const QUOTA_LIMITS = {
  /**
   * GOOGLE COLAB FREE TIER
   * - Session limit: 12h max
   * - 🔥 SAFETY: Stop at 8.4h (70% threshold) - NEVER exceed to avoid ToS violations!
   * - Idle timeout: 90min (keep-alive every 60min)
   */
  COLAB: {
    MAX_SESSION_HOURS: 12,
    SAFE_SESSION_HOURS: 8.4,          // 8.4h of 12h = 70% 🔥 ToS-safe threshold!
    SAFE_SESSION_SECONDS: 8.4 * 3600, // 30240s
    IDLE_TIMEOUT_MINUTES: 90,
    KEEP_ALIVE_INTERVAL_MINUTES: 60,
  },

  /**
   * KAGGLE FREE TIER
   * - 🔥 Session limit: ~9h max (GPU notebooks)
   * - 🔥 Weekly quota: 30h GPU/week → Stop at 21h (70% threshold) - ToS-safe!
   * - Concurrent: 1 notebook only
   * - We use: GPU only (not CPU)
   */
  KAGGLE: {
    MAX_SESSION_HOURS: 9,
    SAFE_SESSION_HOURS: 6.3,             // 6.3h of 9h = 70% 🔥 ToS-safe threshold!
    SAFE_SESSION_SECONDS: 6.3 * 3600,    // 22680s
    
    MAX_WEEKLY_HOURS: 30,
    SAFE_WEEKLY_HOURS: 21,               // 21h of 30h = 70% 🔥 ToS-safe threshold!
    SAFE_WEEKLY_SECONDS: 21 * 3600,      // 75600s
    
    MAX_CONCURRENT_NOTEBOOKS: 1,
  },

  /**
   * UNIVERSAL SAFETY MARGIN
   * Always stop 1 hour before hitting hard limits
   */
  SAFETY_MARGIN_HOURS: 1,
  SAFETY_MARGIN_SECONDS: 3600,

  /**
   * 🔥 WARNING THRESHOLDS (60% = soft warning before 70% hard block)
   * When to start warning about approaching 70% limit
   */
  WARNING_THRESHOLDS: {
    COLAB_SESSION_PERCENT: 0.60,    // Warn at 60% (7.2h of 12h) - 1.2h before 70% limit
    KAGGLE_SESSION_PERCENT: 0.60,   // Warn at 60% (7.2h GPU, 5.4h CPU)
    KAGGLE_WEEKLY_PERCENT: 0.60,    // Warn at 60% (18h of 30h) - 3h before 70% limit
  },

  /**
   * 🔥 SAFE OPERATION THRESHOLDS (70% = hard block, ToS-safe)
   * Workers are considered "safe" if below these limits
   * NEVER exceed 70% to avoid ToS violations and provider penalties!
   */
  SAFE_THRESHOLDS: {
    COLAB_SESSION_PERCENT: 0.70,   // 70% of 12h = 8.4h 🔥 NEVER EXCEED!
    KAGGLE_SESSION_PERCENT: 0.70,  // 70% of 12h GPU = 8.4h, 70% of 9h CPU = 6.3h
    KAGGLE_WEEKLY_PERCENT: 0.70,   // 70% of 30h = 21h 🔥 NEVER EXCEED!
  },
};

/**
 * Helper functions for quota calculations
 */
export const QuotaHelpers = {
  /**
   * Get safe session limit for a provider
   */
  getSafeSessionSeconds(provider: 'colab' | 'kaggle'): number {
    if (provider === 'colab') {
      return QUOTA_LIMITS.COLAB.SAFE_SESSION_SECONDS;
    }
    // Kaggle has ~9h session limit
    return QUOTA_LIMITS.KAGGLE.SAFE_SESSION_SECONDS;
  },

  /**
   * Check if session runtime is safe
   */
  isSessionSafe(runtimeSeconds: number, provider: 'colab' | 'kaggle'): boolean {
    const safeLimit = this.getSafeSessionSeconds(provider);
    return runtimeSeconds < safeLimit;
  },

  /**
   * Check if weekly usage is safe (Kaggle only)
   */
  isWeeklySafe(usedSeconds: number): boolean {
    return usedSeconds < QUOTA_LIMITS.KAGGLE.SAFE_WEEKLY_SECONDS;
  },

  /**
   * Get remaining safe time (in seconds)
   */
  getRemainingSessionSeconds(runtimeSeconds: number, provider: 'colab' | 'kaggle'): number {
    const safeLimit = this.getSafeSessionSeconds(provider);
    return Math.max(0, safeLimit - runtimeSeconds);
  },

  /**
   * Get remaining weekly quota (Kaggle only)
   */
  getRemainingWeeklySeconds(usedSeconds: number): number {
    return Math.max(0, QUOTA_LIMITS.KAGGLE.SAFE_WEEKLY_SECONDS - usedSeconds);
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
