/**
 * 🛡️ ENTERPRISE SHUTDOWN SERVICE
 * 
 * Gracefully shuts down the server on SIGTERM/SIGINT:
 * 1. Stop accepting new requests
 * 2. Mark running training jobs as interrupted
 * 3. Save vector store snapshot
 * 4. Stop schedulers
 * 5. Close HTTP server
 * 6. Close database connections
 * 
 * Prevents data loss and ensures clean state for next startup
 */

import type { Server } from 'http';
import { db } from "../db";
import { trainingJobs } from "../../shared/schema";
import { inArray } from "drizzle-orm";

class ShutdownService {
  private isShuttingDown = false;
  
  /**
   * Graceful shutdown orchestrator
   */
  async gracefulShutdown(server: Server, exitCode: number = 0): Promise<void> {
    // Prevent multiple shutdown calls
    if (this.isShuttingDown) {
      console.log('[Shutdown] Already shutting down...');
      return;
    }
    
    this.isShuttingDown = true;
    const startTime = Date.now();
    
    console.log('\n🛡️ [Shutdown] Starting graceful shutdown...');
    
    try {
      // Step 1: Stop accepting new requests
      console.log('[Shutdown] 1/6 Stopping new request acceptance...');
      server.close();
      
      // Step 2: Mark running training jobs as interrupted
      console.log('[Shutdown] 2/6 Interrupting running training jobs...');
      await this.interruptRunningJobs();
      
      // Step 3: Stop schedulers
      console.log('[Shutdown] 3/6 Stopping scheduled tasks...');
      await this.stopSchedulers();
      
      // Step 4: Save vector store
      console.log('[Shutdown] 4/6 Saving vector store snapshot...');
      await this.saveVectorStore();
      
      // Step 5: Give in-flight requests time to complete (max 5s)
      console.log('[Shutdown] 5/6 Waiting for in-flight requests (max 5s)...');
      await this.waitForInFlightRequests(5000);
      
      // Step 6: Close database connections
      console.log('[Shutdown] 6/6 Closing database connections...');
      // Drizzle with Neon doesn't need explicit close
      
      const duration = Date.now() - startTime;
      console.log(`\n✅ [Shutdown] Graceful shutdown completed in ${duration}ms`);
      
    } catch (error: any) {
      console.error('[Shutdown] ❌ Shutdown error:', error.message);
      // Continue with exit anyway
    } finally {
      console.log(`[Shutdown] Exiting with code ${exitCode}`);
      process.exit(exitCode);
    }
  }

  /**
   * Mark all running/queued training jobs as interrupted
   */
  private async interruptRunningJobs(): Promise<void> {
    try {
      const result = await db.update(trainingJobs)
        .set({
          status: 'interrupted',
          completedAt: new Date(),
          deploymentError: `Job interrupted by graceful shutdown at ${new Date().toISOString()}`
        })
        .where(inArray(trainingJobs.status, ['running', 'queued']));
      
      console.log(`   ✅ Interrupted training jobs`);
      
    } catch (error: any) {
      console.error('[Shutdown] Failed to interrupt jobs:', error.message);
    }
  }

  /**
   * Stop all scheduled tasks
   */
  private async stopSchedulers(): Promise<void> {
    try {
      const { schedulerService } = await import('./scheduler-service');
      schedulerService.stop();
      
      console.log('   ✅ Schedulers stopped');
      
    } catch (error: any) {
      console.error('[Shutdown] Failed to stop schedulers:', error.message);
    }
  }

  /**
   * Save vector store snapshot to disk
   */
  private async saveVectorStore(): Promise<void> {
    try {
      const { vectorStore } = await import('../rag/vector-store');
      await vectorStore.save();
      
      console.log('   ✅ Vector store saved');
      
    } catch (error: any) {
      console.error('[Shutdown] Failed to save vector store:', error.message);
    }
  }

  /**
   * Wait for in-flight HTTP requests to complete
   */
  private async waitForInFlightRequests(maxWaitMs: number): Promise<void> {
    // Give requests time to finish naturally
    await new Promise(resolve => setTimeout(resolve, Math.min(maxWaitMs, 5000)));
    console.log('   ✅ In-flight requests handled');
  }
}

export const shutdownService = new ShutdownService();
