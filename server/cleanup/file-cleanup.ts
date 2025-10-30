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
   */
  startTokenRetentionCleanup(): void {
    if (this.tokenCleanupIntervalId) {
      console.log("[Token Retention] Service already running");
      return;
    }

    console.log("[Token Retention] Starting 5-year retention cleanup service (runs monthly)");

    // Run on first day of month at 3 AM (to avoid peak hours)
    const scheduleNextCleanup = () => {
      const now = new Date();
      const nextRun = new Date(now.getFullYear(), now.getMonth() + 1, 1, 3, 0, 0); // 1st day of next month, 3 AM
      const timeUntilNextRun = nextRun.getTime() - now.getTime();

      console.log(`[Token Retention] Next cleanup scheduled for: ${nextRun.toISOString()}`);

      this.tokenCleanupIntervalId = setTimeout(async () => {
        await this.cleanupOldTokens();
        scheduleNextCleanup(); // Schedule next month's cleanup
      }, timeUntilNextRun);
    };

    // Run immediately on first start (useful for testing)
    this.cleanupOldTokens().then(() => {
      scheduleNextCleanup();
    });
  }

  /**
   * Clean up token data older than 5 years
   * This maintains the 5-year retention policy
   */
  private async cleanupOldTokens(): Promise<void> {
    try {
      console.log("[Token Retention] Running 5-year retention cleanup...");
      
      // Clean for all tenants (pass undefined to clean globally)
      const result = await cleanupOldTokenData();
      
      console.log(`[Token Retention] ✓ Cleanup complete - deleted ${result.tokenUsageDeleted} token records, ${result.alertsDeleted} alerts`);
    } catch (error: any) {
      console.error("[Token Retention] Error during cleanup:", error.message);
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
