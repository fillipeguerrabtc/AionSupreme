/**
 * TranscriptionTempFileManager - Enterprise-grade temp file lifecycle management
 * 
 * Centralizes tracking and cleanup of ALL temporary files in audio transcription workflow.
 * Guarantees zero leaks across all exit paths (success, validation failure, conversion failure, errors).
 * 
 * FEATURES:
 * - Set-based path tracking (no duplicates)
 * - Idempotent cleanup (safe to call multiple times)
 * - Structured telemetry (deletion counts, errors)
 * - Error-tolerant cleanup for finally blocks
 * - Thread-safe (Node.js single-threaded guarantee)
 * 
 * USAGE:
 * ```typescript
 * const manager = new TranscriptionTempFileManager();
 * try {
 *   manager.track(req.file?.path);
 *   const conversion = await convert();
 *   conversion.cleanupPaths.forEach(p => manager.track(p));
 *   // ... business logic
 * } finally {
 *   await manager.cleanupAndIgnoreErrors();
 * }
 * ```
 */

import fs from "fs/promises";
import path from "path";

export class TranscriptionTempFileManager {
  private paths: Set<string> = new Set();
  private cleaned = false;
  private readonly logContext: string;
  
  constructor(traceId?: string) {
    this.logContext = traceId ? `[TempFileManager:${traceId}]` : "[TempFileManager]";
  }
  
  /**
   * Track a file path for cleanup
   * 
   * - Accepts undefined/null (no-op for safety)
   * - Deduplicates automatically via Set
   * - Can be called before or after cleanup (idempotent)
   */
  track(filePath: string | undefined | null): void {
    if (!filePath) return;
    
    // Safety: Prevent tracking after cleanup (log warning)
    if (this.cleaned) {
      console.warn(`${this.logContext} Attempted to track file after cleanup: ${path.basename(filePath)}`);
      return;
    }
    
    this.paths.add(filePath);
    console.log(`${this.logContext} Tracking temp file: ${path.basename(filePath)} (total: ${this.paths.size})`);
  }
  
  /**
   * Cleanup all tracked files
   * 
   * - Deletes all tracked paths
   * - Idempotent (safe to call multiple times)
   * - Throws on errors (use in try/catch)
   * - Emits telemetry
   */
  async cleanup(): Promise<{ deleted: number; errors: number }> {
    if (this.cleaned) {
      console.log(`${this.logContext} Cleanup already executed (idempotent), skipping`);
      return { deleted: 0, errors: 0 };
    }
    
    this.cleaned = true;
    
    if (this.paths.size === 0) {
      console.log(`${this.logContext} No temp files to cleanup`);
      return { deleted: 0, errors: 0 };
    }
    
    console.log(`${this.logContext} Starting cleanup of ${this.paths.size} temp files...`);
    
    let deleted = 0;
    let errors = 0;
    const errorDetails: { path: string; error: string }[] = [];
    
    for (const filePath of this.paths) {
      try {
        await fs.unlink(filePath);
        deleted++;
        console.log(`${this.logContext} Deleted: ${path.basename(filePath)}`);
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        
        // ✅ Ignore ENOENT (file already deleted / never existed) - NOT an error
        if (error.code === 'ENOENT') {
          deleted++; // Count as "successfully handled" (file doesn't exist = goal achieved)
          console.log(`${this.logContext} Skipped (not found): ${path.basename(filePath)}`);
        } else {
          // Real error (permission denied, disk full, etc.)
          errors++;
          errorDetails.push({ path: path.basename(filePath), error: errorMsg });
          console.warn(`${this.logContext} Failed to delete ${path.basename(filePath)}: ${errorMsg}`);
        }
      }
    }
    
    console.log(`${this.logContext} Cleanup complete: ${deleted} deleted, ${errors} errors`);
    
    if (errorDetails.length > 0) {
      throw new Error(`Failed to cleanup ${errorDetails.length} temp files: ${JSON.stringify(errorDetails)}`);
    }
    
    return { deleted, errors };
  }
  
  /**
   * Cleanup all tracked files, ignoring errors
   * 
   * - Best for finally blocks (never throws)
   * - Logs errors but continues
   * - Returns telemetry for observability
   */
  async cleanupAndIgnoreErrors(): Promise<{ deleted: number; errors: number }> {
    try {
      return await this.cleanup();
    } catch (error: any) {
      // Log cleanup errors but don't throw (finally block safety)
      console.error(`${this.logContext} Cleanup encountered errors (ignored):`, error.message);
      
      // Count how many were actually deleted vs errors
      let deleted = 0;
      let errors = 0;
      
      for (const filePath of this.paths) {
        try {
          await fs.access(filePath);
          errors++; // File still exists = deletion failed
        } catch {
          deleted++; // File doesn't exist = deletion succeeded (or never existed)
        }
      }
      
      return { deleted, errors };
    }
  }
  
  /**
   * Get current tracking state (for debugging/testing)
   */
  getState(): { tracked: number; cleaned: boolean; paths: string[] } {
    return {
      tracked: this.paths.size,
      cleaned: this.cleaned,
      paths: Array.from(this.paths).map(p => path.basename(p)),
    };
  }
}
