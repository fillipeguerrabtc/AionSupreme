/**
 * Adapter Aggregator (FedAvg for PEFT Adapters)
 * 
 * Production-grade aggregation service using Python helper script for weighted averaging.
 * Supports Hot Reload with zero downtime.
 */

import { db } from "../db";
import { eq, and } from "drizzle-orm";
import { uploadedAdapters, trainingJobs, modelCheckpoints } from "../../shared/schema";
import fs from "fs/promises";
import * as fsSync from "fs";
import path from "path";
import { spawn } from "child_process";
import log from "../utils/logger";

interface AggregationResult {
  success: boolean;
  checkpointPath?: string;
  error?: string;
}

class AdapterAggregator {
  private pythonScriptPath = path.join(process.cwd(), "server/federated/aggregate-adapters.py");
  private checkpointsDir = "/tmp/checkpoints/adapters";
  private aggregationLocks: Map<string, Promise<AggregationResult>> = new Map();

  constructor() {
    // Ensure checkpoints directory exists
    if (!fsSync.existsSync(this.checkpointsDir)) {
      fsSync.mkdirSync(this.checkpointsDir, { recursive: true });
    }
  }

  /**
   * Check if enough adapters are available for aggregation
   */
  async shouldAggregate(jobId: number, step: number, minWorkers: number = 2): Promise<boolean> {
    const adapters = await db
      .select()
      .from(uploadedAdapters)
      .where(
        and(
          eq(uploadedAdapters.jobId, jobId),
          eq(uploadedAdapters.step, step),
          eq(uploadedAdapters.aggregated, false)
        )
      );

    return adapters.length >= minWorkers;
  }

  /**
   * Aggregate adapters for a specific job and step using Python script
   * Uses mutex to prevent concurrent aggregations for same (jobId, step)
   */
  async aggregate(jobId: number, step: number): Promise<AggregationResult> {
    const lockKey = `${jobId}-${step}`;
    
    // Check if aggregation already in progress
    const existingLock = this.aggregationLocks.get(lockKey);
    if (existingLock) {
      log.info(`[AdapterAggregator] Aggregation already in progress for job ${jobId}, step ${step}, waiting...`);
      return existingLock;
    }
    
    // Create new aggregation promise
    const aggregationPromise = this._performAggregation(jobId, step);
    
    // Store lock
    this.aggregationLocks.set(lockKey, aggregationPromise);
    
    // Cleanup lock when done
    aggregationPromise.finally(() => {
      this.aggregationLocks.delete(lockKey);
    });
    
    return aggregationPromise;
  }

  /**
   * Internal aggregation implementation (called by aggregate() with lock)
   */
  private async _performAggregation(jobId: number, step: number): Promise<AggregationResult> {
    try {
      log.info(`[AdapterAggregator] Starting aggregation for job ${jobId}, step ${step}`);

      // Get all non-aggregated adapters for this step
      const adapters = await db
        .select()
        .from(uploadedAdapters)
        .where(
          and(
            eq(uploadedAdapters.jobId, jobId),
            eq(uploadedAdapters.step, step),
            eq(uploadedAdapters.aggregated, false)
          )
        );

      if (adapters.length === 0) {
        return { success: false, error: "No adapters to aggregate" };
      }

      log.info(`[AdapterAggregator] Found ${adapters.length} adapters to aggregate`);

      // Extract .tar.gz files to temporary directories
      const extractedPaths: string[] = [];
      
      for (const adapter of adapters) {
        const extractDir = path.join("/tmp/adapters-extracted", String(jobId), String(adapter.workerId), String(step));
        await fs.mkdir(extractDir, { recursive: true });

        // Extract .tar.gz using tar command
        await this.extractTarGz(adapter.filePath, extractDir);
        extractedPaths.push(extractDir);
      }

      // Prepare Python script arguments
      const adapterSpecs = adapters.map((adapter, index) => 
        `${extractedPaths[index]}:${adapter.numExamples}`
      );

      const outputDir = path.join(this.checkpointsDir, String(jobId), `step_${step}`);
      await fs.mkdir(outputDir, { recursive: true });

      // Call Python aggregation script
      log.info(`[AdapterAggregator] Calling Python script: ${this.pythonScriptPath}`);
      log.info(`[AdapterAggregator] Adapters: ${adapterSpecs.join(', ')}`);
      log.info(`[AdapterAggregator] Output: ${outputDir}`);

      const aggregationSuccess = await this.callPythonScript(adapterSpecs, outputDir);

      if (!aggregationSuccess) {
        return { success: false, error: "Python aggregation script failed" };
      }

      // Compress aggregated adapter back to .tar.gz
      const checkpointPath = path.join(this.checkpointsDir, String(jobId), `step_${step}.tar.gz`);
      await this.createTarGz(outputDir, checkpointPath);

      // Save checkpoint to database
      const [checkpoint] = await db
        .insert(modelCheckpoints)
        .values({
          jobId,
          step,
          globalLoss: 0.0, // PEFT adapters don't have loss at aggregation time
          checkpointType: "peft_adapter",
          storagePath: checkpointPath,
          modelSize: (await fs.stat(checkpointPath)).size,
          contributingWorkers: adapters.length,
          aggregationMethod: "fedavg",
        })
        .returning();

      // Mark adapters as aggregated
      await db
        .update(uploadedAdapters)
        .set({ 
          aggregated: true,
          aggregationId: checkpoint.id,
        })
        .where(
          and(
            eq(uploadedAdapters.jobId, jobId),
            eq(uploadedAdapters.step, step)
          )
        );

      // Update training job with latest checkpoint
      await db
        .update(trainingJobs)
        .set({
          latestCheckpoint: checkpointPath,
          updatedAt: new Date(),
        })
        .where(eq(trainingJobs.id, jobId));

      // Cleanup extracted directories
      for (const extractedPath of extractedPaths) {
        await fs.rm(path.dirname(extractedPath), { recursive: true, force: true }).catch(() => {});
      }
      await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});

      log.info(`[AdapterAggregator] Aggregation complete: ${checkpointPath}`);

      return { success: true, checkpointPath };

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`[AdapterAggregator] Aggregation failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Extract .tar.gz file using system tar command
   */
  private async extractTarGz(tarPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tar = spawn("tar", ["-xzf", tarPath, "-C", outputDir]);
      
      tar.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar extraction failed with code ${code}`));
        }
      });

      tar.on("error", reject);
    });
  }

  /**
   * Create .tar.gz file using system tar command
   */
  private async createTarGz(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fsSync.existsSync(outputDir)) {
        fsSync.mkdirSync(outputDir, { recursive: true });
      }

      // tar -czf output.tar.gz -C sourceDir .
      const tar = spawn("tar", ["-czf", outputPath, "-C", sourceDir, "."]);
      
      tar.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar compression failed with code ${code}`));
        }
      });

      tar.on("error", reject);
    });
  }

  /**
   * Call Python aggregation script
   */
  private async callPythonScript(adapterSpecs: string[], outputDir: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const args = [
        this.pythonScriptPath,
        "--adapters",
        ...adapterSpecs,
        "--output",
        outputDir,
      ];

      log.info(`[AdapterAggregator] Running: python3 ${args.join(' ')}`);

      const python = spawn("python3", args);
      
      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
        console.log(`[Python] ${data.toString().trim()}`);
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
        console.error(`[Python Error] ${data.toString().trim()}`);
      });

      python.on("close", (code) => {
        if (code === 0) {
          log.info("[AdapterAggregator] Python script completed successfully");
          resolve(true);
        } else {
          log.error(`[AdapterAggregator] Python script failed with code ${code}`);
          log.error(`[AdapterAggregator] STDERR: ${stderr}`);
          reject(new Error(`Python script failed: ${stderr}`));
        }
      });

      python.on("error", (error) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`[AdapterAggregator] Failed to spawn Python process: ${errorMsg}`);
        reject(error);
      });
    });
  }

  /**
   * Get latest checkpoint path for a job
   */
  async getLatestCheckpoint(jobId: number): Promise<string | null> {
    const [job] = await db
      .select({ latestCheckpoint: trainingJobs.latestCheckpoint })
      .from(trainingJobs)
      .where(eq(trainingJobs.id, jobId));

    return job?.latestCheckpoint || null;
  }

  /**
   * Get download URL for latest checkpoint
   */
  getCheckpointDownloadUrl(jobId: number, baseUrl: string): string {
    return `${baseUrl}/api/training/checkpoints/${jobId}/download`;
  }
}

export const adapterAggregator = new AdapterAggregator();
