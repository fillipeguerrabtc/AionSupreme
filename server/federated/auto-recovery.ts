/**
 * AUTO-RECOVERY SYSTEM - Federated Learning Resilience
 * 
 * Automatically reassigns chunks when GPUs fail or disconnect
 * Ensures training continues even when workers drop out
 */

import { db } from '../db';
import { trainingJobs, trainingWorkers, gpuWorkers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

export class AutoRecovery {
  private checkInterval = 60000; // Check every 60s
  private intervalId: NodeJS.Timeout | null = null;
  
  /**
   * Start monitoring and auto-recovery
   */
  start() {
    if (this.intervalId) {
      return; // Already running
    }
    
    console.log('[Auto-Recovery] Started monitoring...');
    
    this.intervalId = setInterval(async () => {
      await this.checkAndRecover();
    }, this.checkInterval);
    
    // Run immediately
    this.checkAndRecover().catch(console.error);
  }
  
  /**
   * Stop monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Auto-Recovery] Stopped monitoring');
    }
  }
  
  /**
   * Check for failed workers and reassign their chunks
   */
  private async checkAndRecover() {
    try {
      // Get all running jobs
      const runningJobs = await db.query.trainingJobs.findMany({
        where: eq(trainingJobs.status, 'running'),
      });
      
      for (const job of runningJobs) {
        await this.recoverJob(job.id);
      }
    } catch (error) {
      console.error('[Auto-Recovery] Check failed:', error);
    }
  }
  
  /**
   * Recover a specific job
   */
  private async recoverJob(jobId: number) {
    // Get all workers for this job
    const workers = await db.query.trainingWorkers.findMany({
      where: eq(trainingWorkers.jobId, jobId),
      with: {
        worker: true,
      },
    });
    
    // Find failed workers (status = "failed" or GPU is offline)
    const failedWorkers = workers.filter(w => 
      w.status === 'failed' || 
      w.worker?.status === 'offline' ||
      w.worker?.status === 'unhealthy'
    );
    
    if (failedWorkers.length === 0) {
      return; // No failures
    }
    
    console.log(`[Auto-Recovery] Job ${jobId}: Found ${failedWorkers.length} failed workers`);
    
    // Get available healthy GPUs
    const healthyGpus = await db.query.gpuWorkers.findMany({
      where: eq(gpuWorkers.status, 'healthy'),
    });
    
    // Filter out GPUs already assigned to this job
    const assignedGpuIds = new Set(workers.map(w => w.workerId));
    const availableGpus = healthyGpus.filter(gpu => !assignedGpuIds.has(gpu.id));
    
    if (availableGpus.length === 0) {
      console.log(`[Auto-Recovery] Job ${jobId}: No available GPUs for recovery`);
      return;
    }
    
    // Reassign chunks to available GPUs
    for (let i = 0; i < Math.min(failedWorkers.length, availableGpus.length); i++) {
      const failedWorker = failedWorkers[i];
      const newGpu = availableGpus[i];
      
      console.log(`[Auto-Recovery] Job ${jobId}: Reassigning chunk ${failedWorker.assignedChunk} from worker ${failedWorker.workerId} to GPU ${newGpu.id}`);
      
      // Create new worker assignment
      await db.insert(trainingWorkers).values({
        jobId,
        workerId: newGpu.id,
        assignedChunk: failedWorker.assignedChunk,
        chunkStartIdx: failedWorker.chunkStartIdx,
        chunkEndIdx: failedWorker.chunkEndIdx,
        status: 'assigned',
      });
      
      // Mark old worker as recovered
      await db
        .update(trainingWorkers)
        .set({
          status: 'failed',
          errorMessage: 'Reassigned to another worker due to failure',
        })
        .where(eq(trainingWorkers.id, failedWorker.id));
    }
    
    console.log(`[Auto-Recovery] Job ${jobId}: Recovery complete`);
  }
}

// Singleton instance
export const autoRecovery = new AutoRecovery();

// Auto-start on import
autoRecovery.start();
