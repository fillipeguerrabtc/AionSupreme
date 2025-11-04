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
    this.checkAndRecover().catch((err) => console.error({ err }, "[Auto-Recovery] Initial check failed"));
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
      console.error({ err: error }, '[Auto-Recovery] Check failed');
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
    const failedWorkers = workers.filter(w => {
      if (w.status === 'failed') return true;
      if (w.worker && 'status' in w.worker) {
        return w.worker.status === 'offline' || w.worker.status === 'unhealthy';
      }
      return false;
    });
    
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
      
      // Mark old worker as failed
      await db
        .update(trainingWorkers)
        .set({
          status: 'failed',
          errorMessage: 'GPU failed, chunk reassigned to another worker',
        })
        .where(eq(trainingWorkers.id, failedWorker.id));
      
      // Create new worker assignment
      await db.insert(trainingWorkers).values({
        jobId,
        workerId: newGpu.id,
        assignedChunk: failedWorker.assignedChunk,
        chunkStartIdx: failedWorker.chunkStartIdx,
        chunkEndIdx: failedWorker.chunkEndIdx,
        status: 'assigned',
        currentStep: 0,
        localLoss: null,
        stepsPerSecond: null,
        errorMessage: null,
      });
      
      console.log(`[Auto-Recovery] ✅ Chunk ${failedWorker.assignedChunk} reassigned to GPU ${newGpu.id}`);
    }
    
    // Update job active workers count
    const activeCount = workers.filter(w => 
      w.status === 'running' || w.status === 'assigned'
    ).length;
    
    await db
      .update(trainingJobs)
      .set({
        activeWorkers: activeCount,
      })
      .where(eq(trainingJobs.id, jobId));
    
    console.log(`[Auto-Recovery] Job ${jobId}: Recovery complete (${activeCount} active workers)`);
  }
}

// Singleton instance
export const autoRecovery = new AutoRecovery();

// Auto-start on import
autoRecovery.start();
