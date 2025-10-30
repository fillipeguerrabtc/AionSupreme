/**
 * File Cleanup Service
 * 
 * Runs every hour to delete expired generated files
 * Prevents storage from filling up
 */

import { storage } from "../storage";
import fs from "fs/promises";
import { cleanupOldTokenData } from "../monitoring/token-tracker";

export class FileCleanup {
  private intervalId: NodeJS.Timeout | null = null;
  private tokenCleanupIntervalId: NodeJS.Timeout | null = null;

  /**
   * Start the cleanup service (runs every hour)
   */
  start(): void {
    if (this.intervalId) {
      console.log("[Cleanup] Service already running");
      return;
    }

    console.log("[Cleanup] Starting file cleanup service (runs every hour)");

    // Run immediately on start
    this.cleanupExpiredFiles();

    // Then run every hour
    this.intervalId = setInterval(() => {
      this.cleanupExpiredFiles();
    }, 60 * 60 * 1000); // 1 hour
  }

  /**
   * Start token data retention cleanup (runs monthly)
   * Enforces 5-year data retention policy
   * 
   * Runs on 1st day of each month at 06:00 UTC (03:00 Brasília time)
   * Uses hourly aligned check to avoid Node.js setTimeout 24.8-day limit
   */
  startTokenRetentionCleanup(): void {
    if (this.tokenCleanupIntervalId) {
      console.log("[Token Retention] Service already running");
      return;
    }

    console.log("[Token Retention] Starting 5-year retention cleanup service (runs 1st of each month at 06:00 UTC / 03:00 Brasília)");

    // Helper to check and execute cleanup if conditions are met
    let lastExecutionDate: string | null = null; // Track "YYYY-MM" to prevent duplicate runs in same month
    
    const checkAndRunCleanup = () => {
      const now = new Date();
      const isDayOne = now.getUTCDate() === 1;
      const isCorrectHour = now.getUTCHours() === 6; // 06:00 UTC = 03:00 Brasília
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      
      // Only run if it's the 1st, correct hour, and we haven't run this month yet
      if (isDayOne && isCorrectHour && lastExecutionDate !== currentMonth) {
        console.log(`[Token Retention] Monthly cleanup triggered on ${now.toISOString()}`);
        
        // Only mark month as executed if cleanup actually ran
        this.cleanupOldTokens().then(executed => {
          if (executed) {
            lastExecutionDate = currentMonth;
            console.log(`[Token Retention] Month ${currentMonth} marked as cleaned`);
          }
        });
      }
    };

    // Startup behavior: Only run cleanup if we're on the 1st and already past 06:00 UTC
    // This ensures we don't miss the monthly cleanup if service is offline during 06:00
    // But prevents duplicate runs on every restart
    const now = new Date();
    const isDayOne = now.getUTCDate() === 1;
    const isPast06 = now.getUTCHours() >= 6;
    
    if (isDayOne && isPast06) {
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      console.log(`[Token Retention] Startup on 1st after 06:00 UTC - running catch-up cleanup`);
      
      // Only mark month as executed if cleanup actually ran (not skipped due to no old data)
      this.cleanupOldTokens().then(executed => {
        if (executed) {
          lastExecutionDate = currentMonth;
          console.log(`[Token Retention] Month ${currentMonth} marked as cleaned`);
        }
      });
    }

    // Calculate delay to next exact hour boundary
    // Always move to the NEXT full hour, never use current hour
    const nextHour = new Date(now);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);
    nextHour.setUTCMinutes(0, 0, 0);
    const msUntilNextHour = nextHour.getTime() - now.getTime();
    
    console.log(`[Token Retention] Next hourly check at ${nextHour.toISOString()} (in ${Math.round(msUntilNextHour / 1000)}s)`);
    
    // Schedule first check at next hour boundary
    setTimeout(() => {
      checkAndRunCleanup();
      
      // Then check every hour on the hour
      // This runs at exactly hh:00:00 every hour
      this.tokenCleanupIntervalId = setInterval(() => {
        checkAndRunCleanup();
      }, 60 * 60 * 1000);
    }, msUntilNextHour);
  }

  /**
   * Clean up token data older than 5 years
   * This maintains the 5-year retention policy
   * Returns true if cleanup was performed, false if skipped
   */
  private async cleanupOldTokens(): Promise<boolean> {
    try {
      console.log("[Token Retention] Running 5-year retention cleanup...");
      
      // Clean for all tenants (pass undefined to clean globally)
      const result = await cleanupOldTokenData();
      
      if (result === null) {
        console.log(`[Token Retention] ✓ No old data to clean - skipped`);
        return false;
      }
      
      console.log(`[Token Retention] ✓ Cleanup complete - deleted ${result.tokenUsageDeleted} token records, ${result.alertsDeleted} alerts`);
      return true;
    } catch (error: any) {
      console.error("[Token Retention] Error during cleanup:", error.message);
      return false;
    }
  }

  /**
   * Stop the cleanup service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[Cleanup] Stopped file cleanup service");
    }
    if (this.tokenCleanupIntervalId) {
      clearTimeout(this.tokenCleanupIntervalId);
      this.tokenCleanupIntervalId = null;
      console.log("[Token Retention] Stopped token retention cleanup service");
    }
  }

  /**
   * Clean up expired files
   */
  private async cleanupExpiredFiles(): Promise<void> {
    try {
      console.log("[Cleanup] Running cleanup for expired files...");

      const expiredFiles = await storage.getExpiredFiles();

      if (expiredFiles.length === 0) {
        console.log("[Cleanup] No expired files found");
        return;
      }

      console.log(`[Cleanup] Found ${expiredFiles.length} expired files`);

      for (const file of expiredFiles) {
        try {
          // Delete physical file
          await fs.unlink(file.storageUrl);
          console.log(`[Cleanup] ✓ Deleted physical file: ${file.filename}`);
        } catch (error: any) {
          console.error(`[Cleanup] ✗ Error deleting physical file ${file.filename}:`, error.message);
        }

        // Mark as deleted in database
        await storage.markFileAsDeleted(file.id);
        console.log(`[Cleanup] ✓ Marked as deleted in DB: ${file.filename} (ID: ${file.id})`);
      }

      console.log(`[Cleanup] ✓ Cleanup complete - deleted ${expiredFiles.length} files`);
    } catch (error: any) {
      console.error("[Cleanup] Error during cleanup:", error.message);
    }
  }
}

export const fileCleanup = new FileCleanup();
