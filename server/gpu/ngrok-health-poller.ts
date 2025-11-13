/**
 * Ngrok Health Poller - Background Task
 * Polls Ngrok URLs to check worker health and update lastHealthCheck
 * Production-grade health monitoring for Kaggle/Colab workers
 */

import { db } from "../db";
import { gpuWorkers } from "../../shared/schema";
import { eq } from "drizzle-orm";
import axios from "axios";

const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const HEALTH_CHECK_TIMEOUT_MS = 10 * 1000; // 10s timeout per request

let pollerInterval: NodeJS.Timeout | null = null;

/**
 * Poll all active workers' Ngrok URLs and update lastHealthCheck
 */
async function pollWorkerHealth() {
  try {
    const now = new Date();
    
    // Get all non-offline workers with Ngrok URLs (provisioning, healthy, degraded, offline-but-has-url)
    const workers = await db
      .select()
      .from(gpuWorkers);
    
    const activeWorkers = workers.filter(w => 
      w.ngrokUrl && 
      !w.ngrokUrl.includes("placeholder") && 
      !w.ngrokUrl.includes("pending") &&
      w.ngrokUrl.startsWith("http")
    );
    
    if (activeWorkers.length === 0) {
      // No active workers to check
      return;
    }
    
    console.log(`[Ngrok Health Poller] Checking ${activeWorkers.length} active worker(s)...`);
    
    // Poll all workers in parallel
    await Promise.all(
      activeWorkers.map(async (worker) => {
        try {
          // Try to hit Ngrok URL root endpoint (or /health if exists)
          const healthUrl = `${worker.ngrokUrl}/health`;
          
          const response = await axios.get(healthUrl, {
            timeout: HEALTH_CHECK_TIMEOUT_MS,
            validateStatus: (status) => status < 500, // Accept 2xx, 3xx, 4xx as "online"
          });
          
          // Worker responded = online
          await db
            .update(gpuWorkers)
            .set({
              lastHealthCheck: now,
              status: "healthy",
              updatedAt: now,
            })
            .where(eq(gpuWorkers.id, worker.id));
          
          console.log(`[Ngrok Health Poller] Worker ${worker.id} (${worker.provider}) ✅ healthy (${response.status})`);
          
        } catch (error: any) {
          // Worker did not respond = might be offline (but don't mark yet, let heartbeat monitor decide)
          console.warn(
            `[Ngrok Health Poller] Worker ${worker.id} (${worker.provider}) ⚠️ no response: ${error.message}`
          );
          
          // Note: We do NOT mark as offline here - heartbeat monitor will do that after 3min timeout
          // This is just a "best effort" health check to update lastHealthCheck when worker is responsive
        }
      })
    );
    
  } catch (error: any) {
    console.error("[Ngrok Health Poller] Error polling health:", error.message);
  }
}

/**
 * Start the Ngrok health poller background task
 */
export function startNgrokHealthPoller() {
  if (pollerInterval) {
    console.log("[Ngrok Health Poller] Already running");
    return;
  }
  
  console.log(`[Ngrok Health Poller] Starting (checks every ${HEALTH_CHECK_INTERVAL_MS / 1000}s)`);
  
  // Run immediately on start
  pollWorkerHealth();
  
  // Then run every minute
  pollerInterval = setInterval(pollWorkerHealth, HEALTH_CHECK_INTERVAL_MS);
}

/**
 * Stop the Ngrok health poller (for testing/cleanup)
 */
export function stopNgrokHealthPoller() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    console.log("[Ngrok Health Poller] Stopped");
  }
}
