/**
 * File Cleanup Service
 * 
 * Runs every hour to delete expired generated files
 * Prevents storage from filling up
 */

import { storage } from "../storage";
import fs from "fs/promises";

export class FileCleanup {
  private intervalId: NodeJS.Timeout | null = null;

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
   * Stop the cleanup service
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[Cleanup] Stopped file cleanup service");
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
