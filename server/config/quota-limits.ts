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
   * - Safety: Stop at 11h (1h margin)
   * - Idle timeout: 90min (keep-alive every 60min)
   */
  COLAB: {
    MAX_SESSION_HOURS: 12,
    SAFE_SESSION_HOURS: 11,          // 11h of 12h = 91.6%
    SAFE_SESSION_SECONDS: 11 * 3600, // 39600s
    IDLE_TIMEOUT_MINUTES: 90,
    KEEP_ALIVE_INTERVAL_MINUTES: 60,
  },

  /**
   * KAGGLE FREE TIER
   * - GPU Session: 12h max → Stop at 11h
   * - CPU Session: 9h max → Stop at 8h
   * - Weekly quota: 30h GPU/week → Stop at 29h
   * - Concurrent: 1 notebook only
   */
  KAGGLE: {
    GPU_MAX_SESSION_HOURS: 12,
    GPU_SAFE_SESSION_HOURS: 11,          // 11h of 12h = 91.6%
    GPU_SAFE_SESSION_SECONDS: 11 * 3600, // 39600s
    
    CPU_MAX_SESSION_HOURS: 9,
    CPU_SAFE_SESSION_HOURS: 8,           // 8h of 9h = 88.8%
    CPU_SAFE_SESSION_SECONDS: 8 * 3600,  // 28800s
    
    MAX_WEEKLY_HOURS: 30,
    SAFE_WEEKLY_HOURS: 29,               // 29h of 30h = 96.6%
    SAFE_WEEKLY_SECONDS: 29 * 3600,      // 104400s
    
    MAX_CONCURRENT_NOTEBOOKS: 1,
  },

  /**
   * UNIVERSAL SAFETY MARGIN
   * Always stop 1 hour before hitting hard limits
   */
  SAFETY_MARGIN_HOURS: 1,
  SAFETY_MARGIN_SECONDS: 3600,

  /**
   * WARNING THRESHOLDS
   * When to start warning about approaching limits
   */
  WARNING_THRESHOLDS: {
    COLAB_SESSION_PERCENT: 0.90,    // Warn at 90% (10.8h of 12h)
    KAGGLE_SESSION_PERCENT: 0.90,   // Warn at 90% (10.8h GPU, 8.1h CPU)
    KAGGLE_WEEKLY_PERCENT: 0.93,    // Warn at 93% (28h of 30h)
  },

  /**
   * SAFE OPERATION THRESHOLDS
   * Workers are considered "safe" if below these limits
   */
  SAFE_THRESHOLDS: {
    COLAB_SESSION_PERCENT: 0.916,   // 11h of 12h
    KAGGLE_SESSION_PERCENT: 0.916,  // 11h of 12h (GPU) or 8h of 9h (CPU)
    KAGGLE_WEEKLY_PERCENT: 0.966,   // 29h of 30h
  },
};

/**
 * Helper functions for quota calculations
 */
export const QuotaHelpers = {
  /**
   * Get safe session limit for a provider/accelerator combo
   */
  getSafeSessionSeconds(provider: 'colab' | 'kaggle', accelerator: 'GPU' | 'CPU' = 'GPU'): number {
    if (provider === 'colab') {
      return QUOTA_LIMITS.COLAB.SAFE_SESSION_SECONDS;
    }
    if (provider === 'kaggle') {
      return accelerator === 'GPU' 
        ? QUOTA_LIMITS.KAGGLE.GPU_SAFE_SESSION_SECONDS
        : QUOTA_LIMITS.KAGGLE.CPU_SAFE_SESSION_SECONDS;
    }
    return 11 * 3600; // Default fallback
  },

  /**
   * Check if session runtime is safe
   */
  isSessionSafe(runtimeSeconds: number, provider: 'colab' | 'kaggle', accelerator: 'GPU' | 'CPU' = 'GPU'): boolean {
    const safeLimit = this.getSafeSessionSeconds(provider, accelerator);
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
  getRemainingSessionSeconds(runtimeSeconds: number, provider: 'colab' | 'kaggle', accelerator: 'GPU' | 'CPU' = 'GPU'): number {
    const safeLimit = this.getSafeSessionSeconds(provider, accelerator);
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
