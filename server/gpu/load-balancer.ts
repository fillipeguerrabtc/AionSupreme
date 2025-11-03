/**
 * GPU Load Balancer
 * ==================
 * 
 * Distributes LLM requests across multiple GPU workers using:
 * - Round-robin: Simple rotation
 * - Least-busy: Worker with fewest active requests
 * - Fastest: Worker with lowest average latency
 * 
 * Falls back to free APIs if no GPUs available.
 */

import { gpuPoolManager } from "./pool-manager";
import type { GpuWorker } from "../../shared/schema";
import axios from "axios";

export type LoadBalancingStrategy = "round-robin" | "least-busy" | "fastest";

export class GpuLoadBalancer {
  private currentIndex = 0; // For round-robin
  private activeRequests = new Map<number, number>(); // gpuId -> activeCount

  constructor(private strategy: LoadBalancingStrategy = "round-robin") {}

  /**
   * Get next available GPU worker based on strategy
   */
  async getNextWorker(): Promise<GpuWorker | null> {
    const healthyWorkers = await gpuPoolManager.getHealthyWorkers();

    if (healthyWorkers.length === 0) {
      console.log("[Load Balancer] No healthy GPU workers available");
      return null;
    }

    let selectedWorker: GpuWorker;

    switch (this.strategy) {
      case "round-robin":
        selectedWorker = this.selectRoundRobin(healthyWorkers);
        break;

      case "least-busy":
        selectedWorker = this.selectLeastBusy(healthyWorkers);
        break;

      case "fastest":
        selectedWorker = this.selectFastest(healthyWorkers);
        break;

      default:
        selectedWorker = healthyWorkers[0];
    }

    console.log(`[Load Balancer] Selected worker: ${selectedWorker.provider} (ID: ${selectedWorker.id}, Strategy: ${this.strategy})`);
    return selectedWorker;
  }

  /**
   * Round-robin selection
   */
  private selectRoundRobin(workers: GpuWorker[]): GpuWorker {
    const worker = workers[this.currentIndex % workers.length];
    this.currentIndex = (this.currentIndex + 1) % workers.length;
    return worker;
  }

  /**
   * Select worker with fewest active requests
   */
  private selectLeastBusy(workers: GpuWorker[]): GpuWorker {
    let leastBusy = workers[0];
    let minRequests = this.activeRequests.get(leastBusy.id) || 0;

    for (const worker of workers) {
      const activeCount = this.activeRequests.get(worker.id) || 0;
      if (activeCount < minRequests) {
        leastBusy = worker;
        minRequests = activeCount;
      }
    }

    return leastBusy;
  }

  /**
   * Select worker with lowest average latency
   */
  private selectFastest(workers: GpuWorker[]): GpuWorker {
    // Already sorted by latency in getHealthyWorkers()
    return workers[0];
  }

  /**
   * Execute LLM request on selected GPU worker
   */
  async executeLLMRequest(
    messages: Array<{ role: string; content: string }>,
    options: {
      max_tokens?: number;
      temperature?: number;
      top_p?: number;
      stream?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    response?: string;
    latencyMs?: number;
    workerId?: number;
    error?: string;
  }> {
    const worker = await this.getNextWorker();

    if (!worker) {
      return {
        success: false,
        error: "No GPU workers available",
      };
    }

    // Track active request
    this.incrementActiveRequests(worker.id);

    try {
      const startTime = Date.now();

      const response = await axios.post(
        `${worker.ngrokUrl}/v1/chat/completions`,
        {
          messages,
          max_tokens: options.max_tokens || 512,
          temperature: options.temperature || 0.7,
          top_p: options.top_p || 0.9,
          stream: options.stream || false,
        },
        {
          timeout: 60000, // 60s timeout
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const latencyMs = Date.now() - startTime;

      // Update worker metrics
      await gpuPoolManager.updateWorkerMetrics(worker.id, latencyMs);

      // Extract response text
      const responseText = response.data.choices?.[0]?.message?.content || "";

      console.log(`[Load Balancer] Request completed in ${latencyMs}ms via ${worker.provider}`);

      return {
        success: true,
        response: responseText,
        latencyMs,
        workerId: worker.id,
      };
    } catch (error: any) {
      console.error(`[Load Balancer] Error executing request on ${worker.provider}:`, error.message);

      return {
        success: false,
        error: error.message || "Unknown error",
        workerId: worker.id,
      };
    } finally {
      // Decrement active requests
      this.decrementActiveRequests(worker.id);
    }
  }


  /**
   * Increment active request count
   */
  private incrementActiveRequests(workerId: number): void {
    const current = this.activeRequests.get(workerId) || 0;
    this.activeRequests.set(workerId, current + 1);
  }

  /**
   * Decrement active request count
   */
  private decrementActiveRequests(workerId: number): void {
    const current = this.activeRequests.get(workerId) || 0;
    this.activeRequests.set(workerId, Math.max(0, current - 1));
  }

  /**
   * Get current active requests per worker
   */
  getActiveRequestsMap(): Map<number, number> {
    return new Map(this.activeRequests);
  }

  /**
   * Change load balancing strategy
   */
  setStrategy(strategy: LoadBalancingStrategy): void {
    this.strategy = strategy;
    console.log(`[Load Balancer] Strategy changed to: ${strategy}`);
  }
}

// Singleton instance (default: round-robin)
export const gpuLoadBalancer = new GpuLoadBalancer("round-robin");
