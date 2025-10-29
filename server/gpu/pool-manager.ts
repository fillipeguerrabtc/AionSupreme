/**
 * GPU Pool Manager
 * ================
 * 
 * Manages multiple GPU workers for:
 * - Load balancing (distribute requests across GPUs)
 * - High availability (fallback when GPUs offline)
 * - Health monitoring (periodic checks + auto-removal)
 * 
 * Architecture:
 * - Register GPU workers via REST API
 * - Health check every 30s
 * - Round-robin load balancing
 * - Auto-remove offline workers after 3 failed checks
 */

import { db } from "../db";
import { gpuWorkers, type GpuWorker, type InsertGpuWorker } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import axios from "axios";

export class GpuPoolManager {
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly HEALTH_CHECK_INTERVAL_MS = 30000; // 30s
  private readonly MAX_FAILED_CHECKS = 3;
  private failedChecksMap = new Map<number, number>(); // gpuId -> failedCount

  constructor() {
    this.startHealthCheckLoop();
  }

  /**
   * Register new GPU worker
   */
  async registerWorker(data: InsertGpuWorker): Promise<GpuWorker> {
    try {
      // Check if already exists (by ngrokUrl)
      const existing = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.ngrokUrl, data.ngrokUrl))
        .limit(1);

      if (existing.length > 0) {
        // Update existing
        const [updated] = await db
          .update(gpuWorkers)
          .set({
            provider: data.provider,
            accountId: data.accountId,
            capabilities: data.capabilities,
            status: "pending", // Will be verified in health check
            updatedAt: new Date(),
          })
          .where(eq(gpuWorkers.id, existing[0].id))
          .returning();

        console.log(`[GPU Pool] Updated existing worker: ${updated.provider} (${updated.ngrokUrl})`);
        
        // Immediate health check
        await this.checkWorkerHealth(updated.id);
        
        return updated;
      }

      // Create new
      const [worker] = await db
        .insert(gpuWorkers)
        .values({
          ...data,
          status: "pending",
        })
        .returning();

      console.log(`[GPU Pool] Registered new worker: ${worker.provider} (${worker.ngrokUrl})`);

      // Immediate health check
      await this.checkWorkerHealth(worker.id);

      return worker;
    } catch (error) {
      console.error("[GPU Pool] Error registering worker:", error);
      throw error;
    }
  }

  /**
   * Get all healthy GPU workers
   */
  async getHealthyWorkers(): Promise<GpuWorker[]> {
    try {
      const workers = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.status, "healthy"))
        .orderBy(gpuWorkers.averageLatencyMs); // Fastest first

      return workers;
    } catch (error) {
      console.error("[GPU Pool] Error getting healthy workers:", error);
      return [];
    }
  }

  /**
   * Get all workers (any status)
   */
  async getAllWorkers(): Promise<GpuWorker[]> {
    try {
      return await db
        .select()
        .from(gpuWorkers)
        .orderBy(gpuWorkers.createdAt);
    } catch (error) {
      console.error("[GPU Pool] Error getting all workers:", error);
      return [];
    }
  }

  /**
   * Get worker by ID
   */
  async getWorker(id: number): Promise<GpuWorker | null> {
    try {
      const [worker] = await db
        .select()
        .from(gpuWorkers)
        .where(eq(gpuWorkers.id, id))
        .limit(1);

      return worker || null;
    } catch (error) {
      console.error("[GPU Pool] Error getting worker:", error);
      return null;
    }
  }

  /**
   * Remove GPU worker
   */
  async removeWorker(id: number): Promise<boolean> {
    try {
      await db
        .delete(gpuWorkers)
        .where(eq(gpuWorkers.id, id));

      this.failedChecksMap.delete(id);
      console.log(`[GPU Pool] Removed worker ID: ${id}`);
      return true;
    } catch (error) {
      console.error("[GPU Pool] Error removing worker:", error);
      return false;
    }
  }

  /**
   * Update worker metrics after serving a request
   */
  async updateWorkerMetrics(id: number, latencyMs: number): Promise<void> {
    try {
      // Atomic update for accurate averaging
      await db.execute(sql`
        UPDATE gpu_workers
        SET 
          request_count = request_count + 1,
          total_latency_ms = total_latency_ms + ${latencyMs},
          average_latency_ms = (total_latency_ms + ${latencyMs}) / (request_count + 1),
          last_used_at = NOW(),
          updated_at = NOW()
        WHERE id = ${id}
      `);
    } catch (error) {
      console.error("[GPU Pool] Error updating metrics:", error);
    }
  }

  /**
   * Health check for specific worker
   */
  async checkWorkerHealth(id: number): Promise<boolean> {
    try {
      const worker = await this.getWorker(id);
      if (!worker) return false;

      const startTime = Date.now();
      
      // Call /health endpoint
      const response = await axios.get(`${worker.ngrokUrl}/health`, {
        timeout: 10000, // 10s timeout
      });

      const latency = Date.now() - startTime;

      if (response.status === 200 && response.data.status === "healthy") {
        // Health check successful
        await db
          .update(gpuWorkers)
          .set({
            status: "healthy",
            lastHealthCheck: new Date(),
            lastHealthCheckError: null,
            updatedAt: new Date(),
          })
          .where(eq(gpuWorkers.id, id));

        // Reset failed checks
        this.failedChecksMap.delete(id);

        console.log(`[GPU Pool] Health check OK: ${worker.provider} (${latency}ms)`);
        return true;
      } else {
        throw new Error(`Invalid health response: ${JSON.stringify(response.data)}`);
      }
    } catch (error: any) {
      // Health check failed
      const worker = await this.getWorker(id);
      if (!worker) return false;

      const failedCount = (this.failedChecksMap.get(id) || 0) + 1;
      this.failedChecksMap.set(id, failedCount);

      const errorMsg = error.message || "Unknown error";

      console.error(`[GPU Pool] Health check FAILED (${failedCount}/${this.MAX_FAILED_CHECKS}): ${worker.provider} - ${errorMsg}`);

      if (failedCount >= this.MAX_FAILED_CHECKS) {
        // Mark as offline (don't delete automatically, let user decide)
        await db
          .update(gpuWorkers)
          .set({
            status: "offline",
            lastHealthCheck: new Date(),
            lastHealthCheckError: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(gpuWorkers.id, id));

        console.warn(`[GPU Pool] Worker marked OFFLINE: ${worker.provider}`);
      } else {
        // Mark as unhealthy
        await db
          .update(gpuWorkers)
          .set({
            status: "unhealthy",
            lastHealthCheck: new Date(),
            lastHealthCheckError: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(gpuWorkers.id, id));
      }

      return false;
    }
  }

  /**
   * Periodic health check for all workers
   */
  private async checkAllWorkersHealth(): Promise<void> {
    try {
      const workers = await db
        .select()
        .from(gpuWorkers)
        .where(sql`status != 'offline'`); // Don't check offline workers

      if (workers.length === 0) {
        return;
      }

      console.log(`[GPU Pool] Running health checks for ${workers.length} workers...`);

      // Check all in parallel
      await Promise.allSettled(
        workers.map(worker => this.checkWorkerHealth(worker.id))
      );
    } catch (error) {
      console.error("[GPU Pool] Error in health check loop:", error);
    }
  }

  /**
   * Start periodic health check loop
   */
  private startHealthCheckLoop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Initial check after 5s
    setTimeout(() => this.checkAllWorkersHealth(), 5000);

    // Then every 30s
    this.healthCheckInterval = setInterval(
      () => this.checkAllWorkersHealth(),
      this.HEALTH_CHECK_INTERVAL_MS
    );

    console.log("[GPU Pool] Health check loop started (interval: 30s)");
  }

  /**
   * Stop health check loop
   */
  stopHealthCheckLoop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log("[GPU Pool] Health check loop stopped");
    }
  }

  /**
   * Get pool statistics
   */
  async getPoolStats(): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    offline: number;
    totalRequests: number;
    averageLatencyMs: number;
  }> {
    try {
      const workers = await this.getAllWorkers();

      const stats = {
        total: workers.length,
        healthy: workers.filter(w => w.status === "healthy").length,
        unhealthy: workers.filter(w => w.status === "unhealthy").length,
        offline: workers.filter(w => w.status === "offline").length,
        totalRequests: workers.reduce((sum, w) => sum + w.requestCount, 0),
        averageLatencyMs: workers.length > 0
          ? workers.reduce((sum, w) => sum + w.averageLatencyMs, 0) / workers.length
          : 0,
      };

      return stats;
    } catch (error) {
      console.error("[GPU Pool] Error getting stats:", error);
      return {
        total: 0,
        healthy: 0,
        unhealthy: 0,
        offline: 0,
        totalRequests: 0,
        averageLatencyMs: 0,
      };
    }
  }
}

// Singleton instance
export const gpuPoolManager = new GpuPoolManager();
