/**
 * 🔄 ENTERPRISE RECOVERY SERVICE
 * 
 * Detects and recovers from orphaned processes on server restart:
 * 1. Training jobs stuck in "running" state
 * 2. GPU workers marked "online" but unreachable
 * 3. Chat sessions with incomplete responses
 * 
 * ZERO TOLERANCE: No zombie processes allowed in production!
 */

import { db } from "../db";
import { trainingJobs, gpuWorkers, messages } from "../../shared/schema";
import { eq, and, inArray } from "drizzle-orm";

class RecoveryService {
  /**
   * Main recovery orchestrator - runs on server startup
   */
  async recoverOrphanedJobs(): Promise<void> {
    console.log('\n🔄 [Recovery] Starting orphaned job detection...');
    
    const startTime = Date.now();
    
    try {
      // Run all recovery tasks in parallel
      const [trainingCount, gpuCount, chatCount] = await Promise.all([
        this.recoverOrphanedTraining(),
        this.recoverOrphanedGPUWorkers(),
        this.recoverOrphanedChatSessions()
      ]);
      
      const duration = Date.now() - startTime;
      
      console.log(`\n✅ [Recovery] Completed in ${duration}ms:`);
      console.log(`   📊 Training jobs interrupted: ${trainingCount}`);
      console.log(`   🖥️  GPU workers cleaned up: ${gpuCount}`);
      console.log(`   💬 Chat sessions recovered: ${chatCount}`);
      
      if (trainingCount + gpuCount + chatCount === 0) {
        console.log('   🎉 No orphaned processes detected - system clean!');
      }
      
    } catch (error: any) {
      console.error('[Recovery] ❌ Recovery failed:', error.message);
      // Don't block server startup - log and continue
    }
  }

  /**
   * Recover training jobs stuck in "running" or "queued" state
   * 
   * These jobs were interrupted mid-execution due to:
   * - Server crash
   * - Deployment
   * - Manual restart
   */
  private async recoverOrphanedTraining(): Promise<number> {
    try {
      // Find jobs in non-terminal states
      const orphanedJobs = await db.query.trainingJobs.findMany({
        where: inArray(trainingJobs.status, ['running', 'queued'])
      });
      
      if (orphanedJobs.length === 0) {
        console.log('   ✅ No orphaned training jobs found');
        return 0;
      }
      
      console.log(`   🔍 Found ${orphanedJobs.length} orphaned training jobs`);
      
      // Mark all as "interrupted" with recovery timestamp
      for (const job of orphanedJobs) {
        await db.update(trainingJobs)
          .set({
            status: 'interrupted',
            completedAt: new Date(),
            deploymentError: `Job interrupted by server restart at ${new Date().toISOString()}`
          })
          .where(eq(trainingJobs.id, job.id));
        
        console.log(`   🔄 Job #${job.id} (${job.status}) → interrupted`);
      }
      
      return orphanedJobs.length;
      
    } catch (error: any) {
      console.error('[Recovery] Training recovery failed:', error.message);
      return 0;
    }
  }

  /**
   * Recover GPU workers marked "online" but unreachable
   * 
   * Workers may be:
   * - Kaggle kernels that expired (8.4h limit)
   * - Colab sessions that timed out
   * - Network issues
   */
  private async recoverOrphanedGPUWorkers(): Promise<number> {
    try {
      // Find workers claiming to be "online"
      const suspectedWorkers = await db.query.gpuWorkers.findMany({
        where: eq(gpuWorkers.status, 'online')
      });
      
      if (suspectedWorkers.length === 0) {
        console.log('   ✅ No orphaned GPU workers found');
        return 0;
      }
      
      console.log(`   🔍 Checking ${suspectedWorkers.length} GPU workers...`);
      
      // 🚀 PRODUCTION FIX: Parallel health checks (avoid sequential 3s timeouts)
      const healthChecks = await Promise.all(
        suspectedWorkers.map(async (worker) => ({
          worker,
          isHealthy: await this.checkWorkerHealth(worker.ngrokUrl)
        }))
      );
      
      let cleanedCount = 0;
      
      // Mark unhealthy workers as offline
      for (const { worker, isHealthy } of healthChecks) {
        if (!isHealthy) {
          await db.update(gpuWorkers)
            .set({
              status: 'offline',
              lastUsedAt: new Date()
            })
            .where(eq(gpuWorkers.id, worker.id));
          
          console.log(`   🔄 Worker #${worker.id} (${worker.provider}) → offline (unreachable)`);
          cleanedCount++;
        }
      }
      
      if (cleanedCount === 0) {
        console.log('   ✅ All GPU workers are healthy');
      }
      
      return cleanedCount;
      
    } catch (error: any) {
      console.error('[Recovery] GPU worker recovery failed:', error.message);
      return 0;
    }
  }

  /**
   * Check if GPU worker is reachable and healthy
   */
  private async checkWorkerHealth(ngrokUrl: string): Promise<boolean> {
    try {
      const axios = (await import('axios')).default;
      
      const response = await axios.get(`${ngrokUrl}/health`, {
        timeout: 3000, // 3s timeout
        validateStatus: () => true // Accept any status code
      });
      
      return response.status === 200;
      
    } catch (error) {
      // Worker is unreachable
      return false;
    }
  }

  /**
   * Recover chat sessions with incomplete responses
   * 
   * Not critical - but provides better UX by marking incomplete messages
   */
  private async recoverOrphanedChatSessions(): Promise<number> {
    try {
      // For now, this is informational only
      // In production, you might want to:
      // 1. Mark incomplete assistant messages
      // 2. Notify users about interrupted sessions
      // 3. Allow session resume
      
      console.log('   ℹ️  Chat session recovery not implemented (non-critical)');
      return 0;
      
    } catch (error: any) {
      console.error('[Recovery] Chat session recovery failed:', error.message);
      return 0;
    }
  }
}

export const recoveryService = new RecoveryService();
