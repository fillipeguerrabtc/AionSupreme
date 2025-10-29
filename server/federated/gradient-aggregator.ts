/**
 * GRADIENT AGGREGATOR - FedAvg Algorithm
 * 
 * Implements Federated Averaging (FedAvg) for distributed training:
 * 1. Collects gradients from N workers
 * 2. Aggregates using weighted average (by num_examples)
 * 3. Updates global model
 * 4. Returns checkpoint to workers
 * 
 * Reference: McMahan et al. (2017) - Communication-Efficient Learning of Deep Networks
 */

import { db } from '../db';
import { gradientUpdates, modelCheckpoints, trainingJobs, trainingWorkers } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

interface GradientData {
  workerId: number;
  step: number;
  localStep: number;
  localLoss: number;
  gradients: Record<string, number[]>; // Layer name -> gradient values
  numExamples: number; // How many examples were used
}

interface AggregationResult {
  globalStep: number;
  globalLoss: number;
  checkpointPath: string;
  contributingWorkers: number;
}

/**
 * FedAvg Gradient Aggregation
 * Aggregates gradients using weighted average by number of examples
 */
export class GradientAggregator {
  private checkpointDir: string;
  
  constructor() {
    this.checkpointDir = join(process.cwd(), 'checkpoints');
    this.ensureCheckpointDir();
  }
  
  private async ensureCheckpointDir() {
    if (!existsSync(this.checkpointDir)) {
      await mkdir(this.checkpointDir, { recursive: true });
    }
  }
  
  /**
   * Submit gradient update from a worker
   */
  async submitGradient(jobId: number, gradientData: GradientData): Promise<void> {
    console.log(`[FedAvg] Received gradient from worker ${gradientData.workerId} at step ${gradientData.step}`);
    
    // Save gradients to disk
    const gradientPath = join(
      this.checkpointDir,
      `job-${jobId}`,
      `gradients`,
      `worker-${gradientData.workerId}-step-${gradientData.step}.json`
    );
    
    await mkdir(join(this.checkpointDir, `job-${jobId}`, `gradients`), { recursive: true });
    await writeFile(gradientPath, JSON.stringify(gradientData.gradients));
    
    // Calculate gradient norm (L2)
    const gradientNorm = this.calculateGradientNorm(gradientData.gradients);
    
    // Insert gradient update record
    await db.insert(gradientUpdates).values({
      jobId,
      workerId: gradientData.workerId,
      step: gradientData.step,
      localStep: gradientData.localStep,
      localLoss: gradientData.localLoss,
      gradientStoragePath: gradientPath,
      gradientNorm,
      numExamples: gradientData.numExamples,
      status: 'pending',
    });
    
    console.log(`[FedAvg] Gradient stored: norm=${gradientNorm.toFixed(4)}, examples=${gradientData.numExamples}`);
  }
  
  /**
   * Check if aggregation should happen
   * Returns true if enough workers have submitted gradients for this step
   */
  async shouldAggregate(jobId: number, step: number): Promise<boolean> {
    // Get job configuration
    const job = await db.query.trainingJobs.findFirst({
      where: eq(trainingJobs.id, jobId),
    });
    
    if (!job) {
      throw new Error(`Training job ${jobId} not found`);
    }
    
    // Count pending gradients for this step
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(gradientUpdates)
      .where(
        and(
          eq(gradientUpdates.jobId, jobId),
          eq(gradientUpdates.step, step),
          eq(gradientUpdates.status, 'pending')
        )
      );
    
    const pendingCount = Number(result.count);
    const minWorkers = job.fedConfig.min_workers;
    
    console.log(`[FedAvg] Step ${step}: ${pendingCount}/${minWorkers} workers ready`);
    
    return pendingCount >= minWorkers;
  }
  
  /**
   * Aggregate gradients using FedAvg
   */
  async aggregate(jobId: number, step: number): Promise<AggregationResult> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[FedAvg] 🔄 Starting aggregation for job ${jobId}, step ${step}`);
    console.log('='.repeat(80));
    
    // Get all pending gradients for this step
    const pendingGradients = await db.query.gradientUpdates.findMany({
      where: and(
        eq(gradientUpdates.jobId, jobId),
        eq(gradientUpdates.step, step),
        eq(gradientUpdates.status, 'pending')
      ),
    });
    
    if (pendingGradients.length === 0) {
      throw new Error(`No pending gradients found for job ${jobId}, step ${step}`);
    }
    
    console.log(`[FedAvg] Found ${pendingGradients.length} workers to aggregate`);
    
    // Load gradient data from disk
    const gradientsData: Array<{ gradients: Record<string, number[]>, numExamples: number, loss: number }> = [];
    
    for (const update of pendingGradients) {
      if (!update.gradientStoragePath) continue;
      
      const gradientJson = await readFile(update.gradientStoragePath, 'utf-8');
      const gradients = JSON.parse(gradientJson);
      
      gradientsData.push({
        gradients,
        numExamples: update.numExamples,
        loss: update.localLoss,
      });
    }
    
    // FedAvg: Weighted average by number of examples
    const totalExamples = gradientsData.reduce((sum, data) => sum + data.numExamples, 0);
    const aggregatedGradients: Record<string, number[]> = {};
    
    // Get layer names from first gradient
    const layerNames = Object.keys(gradientsData[0].gradients);
    
    for (const layerName of layerNames) {
      const layerSize = gradientsData[0].gradients[layerName].length;
      aggregatedGradients[layerName] = new Array(layerSize).fill(0);
      
      // Weighted sum
      for (const data of gradientsData) {
        const weight = data.numExamples / totalExamples;
        const layerGradients = data.gradients[layerName];
        
        for (let i = 0; i < layerSize; i++) {
          aggregatedGradients[layerName][i] += layerGradients[i] * weight;
        }
      }
    }
    
    // Calculate global loss (weighted average)
    const globalLoss = gradientsData.reduce(
      (sum, data) => sum + data.loss * (data.numExamples / totalExamples),
      0
    );
    
    console.log(`[FedAvg] Aggregated ${layerNames.length} layers from ${pendingGradients.length} workers`);
    console.log(`[FedAvg] Global loss: ${globalLoss.toFixed(6)}`);
    
    // Save aggregated checkpoint
    const checkpointPath = await this.saveCheckpoint(jobId, step, aggregatedGradients);
    
    // Create checkpoint record
    const job = await db.query.trainingJobs.findFirst({
      where: eq(trainingJobs.id, jobId),
    });
    
    const isBest = !job?.bestLoss || globalLoss < job.bestLoss;
    const checkpointType = isBest ? 'best' : 'scheduled';
    
    await db.insert(modelCheckpoints).values({
      jobId,
      step,
      globalLoss,
      checkpointType,
      storagePath: checkpointPath,
      contributingWorkers: pendingGradients.length,
      aggregationMethod: 'fedavg',
    });
    
    // Mark gradients as aggregated
    for (const update of pendingGradients) {
      await db
        .update(gradientUpdates)
        .set({
          status: 'aggregated',
          aggregatedInStep: step,
          aggregatedAt: new Date(),
        })
        .where(eq(gradientUpdates.id, update.id));
    }
    
    // Update job progress
    await db
      .update(trainingJobs)
      .set({
        currentStep: step,
        globalLoss,
        bestLoss: isBest ? globalLoss : job?.bestLoss,
        latestCheckpoint: checkpointPath,
        updatedAt: new Date(),
      })
      .where(eq(trainingJobs.id, jobId));
    
    console.log(`[FedAvg] ✅ Aggregation complete! Checkpoint: ${checkpointPath}`);
    console.log('='.repeat(80) + '\n');
    
    return {
      globalStep: step,
      globalLoss,
      checkpointPath,
      contributingWorkers: pendingGradients.length,
    };
  }
  
  /**
   * Save checkpoint to disk
   */
  private async saveCheckpoint(
    jobId: number,
    step: number,
    gradients: Record<string, number[]>
  ): Promise<string> {
    const checkpointPath = join(
      this.checkpointDir,
      `job-${jobId}`,
      `checkpoints`,
      `checkpoint-step-${step}.json`
    );
    
    await mkdir(join(this.checkpointDir, `job-${jobId}`, `checkpoints`), { recursive: true });
    
    const checkpoint = {
      step,
      timestamp: new Date().toISOString(),
      gradients,
    };
    
    await writeFile(checkpointPath, JSON.stringify(checkpoint));
    
    return checkpointPath;
  }
  
  /**
   * Calculate L2 norm of gradients
   */
  private calculateGradientNorm(gradients: Record<string, number[]>): number {
    let sumSquared = 0;
    
    for (const layerGradients of Object.values(gradients)) {
      for (const value of layerGradients) {
        sumSquared += value * value;
      }
    }
    
    return Math.sqrt(sumSquared);
  }
  
  /**
   * Get latest checkpoint for a job
   */
  async getLatestCheckpoint(jobId: number): Promise<string | null> {
    const job = await db.query.trainingJobs.findFirst({
      where: eq(trainingJobs.id, jobId),
    });
    
    return job?.latestCheckpoint || null;
  }
}

// Singleton instance
export const gradientAggregator = new GradientAggregator();
