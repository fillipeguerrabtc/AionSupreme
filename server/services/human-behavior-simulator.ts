/**
 * HUMAN BEHAVIOR SIMULATOR
 * =========================
 * 
 * Simulates human-like patterns in GPU session usage to avoid detection.
 * 
 * 🔥 ToS COMPLIANCE STRATEGY:
 * Automated patterns (exact 11h sessions, precise start times) are easily detectable.
 * This service adds randomization to mimic real human behavior:
 * 
 * - Session duration: 10.5h - 11h (±30min variation)
 * - Start time jitter: ±90min from scheduled time
 * - Session gaps: Slight variation in cooldown periods
 * 
 * FEATURES:
 * ✅ Randomized session durations (looks human)
 * ✅ Start time jitter (avoids clockwork patterns)
 * ✅ Configurable randomization ranges
 * ✅ Logging for audit trail
 * ✅ Deterministic seed option (for testing)
 */

import { QUOTA_LIMITS, QuotaHelpers } from '../config/quota-limits';

interface SessionRandomization {
  originalDurationSeconds: number;
  randomizedDurationSeconds: number;
  durationVariationSeconds: number;
  startTimeJitterSeconds: number;
  scheduledStartTime: Date;
  actualStartTime: Date;
}

export class HumanBehaviorSimulator {
  
  /**
   * Generate randomized session parameters for a provider
   * 
   * Returns:
   * - Randomized session duration (10.5h-11h for Colab, ~4h for Kaggle)
   * - Start time with jitter (±90min Colab, ±15min Kaggle)
   */
  generateSessionParameters(
    provider: 'colab' | 'kaggle',
    scheduledStartTime: Date = new Date()
  ): SessionRandomization {
    
    // Get base duration with randomization
    const originalDuration = QuotaHelpers.getSafeSessionSeconds(provider);
    const randomizedDuration = QuotaHelpers.randomizeSessionDuration(provider);
    const durationVariation = randomizedDuration - originalDuration;
    
    // Get start time jitter
    const jitterSeconds = QuotaHelpers.randomizeStartTime(provider);
    const actualStartTime = new Date(scheduledStartTime.getTime() + (jitterSeconds * 1000));
    
    const result: SessionRandomization = {
      originalDurationSeconds: originalDuration,
      randomizedDurationSeconds: randomizedDuration,
      durationVariationSeconds: durationVariation,
      startTimeJitterSeconds: jitterSeconds,
      scheduledStartTime,
      actualStartTime,
    };
    
    // Log for audit trail
    this.logRandomization(provider, result);
    
    return result;
  }
  
  /**
   * Calculate when session should end based on randomized duration
   */
  calculateSessionEndTime(startTime: Date, durationSeconds: number): Date {
    return new Date(startTime.getTime() + (durationSeconds * 1000));
  }
  
  /**
   * Apply randomization to cooldown period (Colab only)
   * Adds ±2h variation to 36h cooldown to avoid exact patterns
   */
  randomizeCooldownPeriod(baseCooldownSeconds: number = QUOTA_LIMITS.COLAB.COOLDOWN_SECONDS): number {
    const variationHours = 2; // ±2h variation
    const variationSeconds = variationHours * 3600;
    const randomVariation = Math.floor(Math.random() * variationSeconds * 2) - variationSeconds;
    
    return baseCooldownSeconds + randomVariation;
  }
  
  /**
   * Check if it's a good time to start a session (avoid suspicious patterns)
   * 
   * Avoids:
   * - Exact midnight starts (00:00-00:30) - too suspicious
   * - Too late at night (03:00-06:00) - unusual for real users
   * - Exact hour marks (09:00, 10:00) - too regular
   */
  isGoodStartTime(time: Date): { isGood: boolean; reason: string } {
    const hour = time.getHours();
    const minute = time.getMinutes();
    
    // Avoid midnight window
    if (hour === 0 && minute < 30) {
      return {
        isGood: false,
        reason: 'Too close to midnight (suspicious pattern)',
      };
    }
    
    // Avoid late night (3AM-6AM)
    if (hour >= 3 && hour < 6) {
      return {
        isGood: false,
        reason: 'Late night hours (unusual for real users)',
      };
    }
    
    // Avoid exact hour marks
    if (minute === 0) {
      return {
        isGood: false,
        reason: 'Exact hour mark (too regular)',
      };
    }
    
    return {
      isGood: true,
      reason: 'Good time to start session',
    };
  }
  
  /**
   * Suggest next good start time (adds jitter to avoid patterns)
   */
  suggestNextStartTime(provider: 'colab' | 'kaggle', baseTime: Date = new Date()): Date {
    let attempts = 0;
    let candidateTime = new Date(baseTime);
    
    // Add initial jitter
    const jitterSeconds = QuotaHelpers.randomizeStartTime(provider);
    candidateTime = new Date(candidateTime.getTime() + (jitterSeconds * 1000));
    
    // Keep trying until we find a good time (max 10 attempts)
    while (attempts < 10) {
      const check = this.isGoodStartTime(candidateTime);
      
      if (check.isGood) {
        console.log(
          `[HumanBehaviorSimulator] ✅ Good start time found: ${candidateTime.toISOString()} ` +
          `(${check.reason})`
        );
        return candidateTime;
      }
      
      // Add 15-45min and try again
      const additionalMinutes = 15 + Math.floor(Math.random() * 30);
      candidateTime = new Date(candidateTime.getTime() + (additionalMinutes * 60 * 1000));
      attempts++;
    }
    
    // Fallback: just return with jitter (better than nothing)
    console.warn(
      `[HumanBehaviorSimulator] ⚠️ Could not find ideal start time after ${attempts} attempts, ` +
      `using: ${candidateTime.toISOString()}`
    );
    return candidateTime;
  }
  
  /**
   * Simulate realistic "keep-alive" intervals (Colab idle prevention)
   * Instead of exactly 60min, vary between 55-65min
   */
  randomizeKeepAliveInterval(): number {
    const baseMinutes = QUOTA_LIMITS.COLAB.KEEP_ALIVE_INTERVAL_MINUTES;
    const variationMinutes = 5; // ±5min variation
    const randomVariation = Math.floor(Math.random() * variationMinutes * 2) - variationMinutes;
    
    return (baseMinutes + randomVariation) * 60 * 1000; // Convert to milliseconds
  }
  
  /**
   * Generate human-like session metadata for logging
   */
  generateSessionMetadata(provider: 'colab' | 'kaggle'): {
    userAgent: string;
    timezone: string;
    locale: string;
  } {
    // Randomize user agents (common Chrome versions)
    const chromeVersions = [
      'Chrome/120.0.0.0',
      'Chrome/121.0.0.0',
      'Chrome/122.0.0.0',
    ];
    const randomChrome = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];
    
    // Common timezones (weighted towards Americas/Europe)
    const timezones = [
      'America/New_York',
      'America/Chicago',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'America/Sao_Paulo',
    ];
    const randomTimezone = timezones[Math.floor(Math.random() * timezones.length)];
    
    // Common locales
    const locales = ['en-US', 'en-GB', 'pt-BR', 'es-ES', 'fr-FR'];
    const randomLocale = locales[Math.floor(Math.random() * locales.length)];
    
    return {
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ${randomChrome} Safari/537.36`,
      timezone: randomTimezone,
      locale: randomLocale,
    };
  }
  
  /**
   * Log randomization for audit trail
   */
  private logRandomization(provider: 'colab' | 'kaggle', params: SessionRandomization): void {
    const durationHours = params.randomizedDurationSeconds / 3600;
    const variationMinutes = params.durationVariationSeconds / 60;
    const jitterMinutes = params.startTimeJitterSeconds / 60;
    
    console.log(
      `[HumanBehaviorSimulator] 🎲 ${provider.toUpperCase()} session randomized:\n` +
      `  Duration: ${durationHours.toFixed(2)}h (${variationMinutes >= 0 ? '+' : ''}${variationMinutes.toFixed(1)}min variation)\n` +
      `  Start time: ${params.actualStartTime.toISOString()} (${jitterMinutes >= 0 ? '+' : ''}${jitterMinutes.toFixed(1)}min jitter)\n` +
      `  Scheduled: ${params.scheduledStartTime.toISOString()}`
    );
  }
  
  /**
   * Get randomization statistics for monitoring
   */
  getRandomizationStats(): {
    colabDurationRange: string;
    colabStartJitterRange: string;
    kaggleDurationRange: string;
    kaggleStartJitterRange: string;
  } {
    return {
      colabDurationRange: '10.5h - 11h',
      colabStartJitterRange: '±90min',
      kaggleDurationRange: '~4h (±5min)',
      kaggleStartJitterRange: '±15min',
    };
  }
}

// Singleton instance
export const humanBehaviorSimulator = new HumanBehaviorSimulator();
