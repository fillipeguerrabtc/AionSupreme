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
 * Check health of workers with valid Ngrok URLs
 */
async function checkValidWorkers(workers: any[], now: Date) {
  if (workers.length === 0) return;
  
  console.log(`[Ngrok Health Poller] Checking ${workers.length} worker(s) with valid URLs...`);
  
  await Promise.all(
    workers.map(async (worker) => {
      try {
        const healthUrl = `${worker.ngrokUrl}/health`;
        
        const response = await axios.get(healthUrl, {
          timeout: HEALTH_CHECK_TIMEOUT_MS,
          validateStatus: (status) => status >= 200 && status < 300, // Only 2xx = healthy
        });
        
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
        console.warn(
          `[Ngrok Health Poller] Worker ${worker.id} (${worker.provider}) ⚠️ no response: ${error.message}`
        );
      }
    })
  );
}

/**
 * Track provisioning workers - re-query DB until Ngrok URL appears
 */
async function trackProvisioningWorkers(workers: any[], now: Date) {
  if (workers.length === 0) return;
  
  console.log(`[Ngrok Health Poller] Tracking ${workers.length} provisioning worker(s)...`);
  
  await Promise.all(
    workers.map(async (worker) => {
      try {
        // Re-query this worker to see if Ngrok URL was updated
        const [updated] = await db
          .select()
          .from(gpuWorkers)
          .where(eq(gpuWorkers.id, worker.id))
          .limit(1);
        
        if (!updated) {
          console.warn(`[Ngrok Health Poller] Worker ${worker.id} no longer exists`);
          return;
        }
        
        // Check if URL is now valid
        if (updated.ngrokUrl?.startsWith("http") && 
            !updated.ngrokUrl.includes("pending") && 
            !updated.ngrokUrl.includes("placeholder")) {
          
          console.log(
            `[Ngrok Health Poller] Worker ${worker.id} (${worker.provider}) 🔄 Ngrok URL detected: ${updated.ngrokUrl}`
          );
          
          // Try health check immediately
          try {
            const healthUrl = `${updated.ngrokUrl}/health`;
            const response = await axios.get(healthUrl, {
              timeout: HEALTH_CHECK_TIMEOUT_MS,
              validateStatus: (status) => status >= 200 && status < 300, // Only 2xx = healthy
            });
            
            await db
              .update(gpuWorkers)
              .set({
                lastHealthCheck: now,
                status: "healthy",
                updatedAt: now,
              })
              .where(eq(gpuWorkers.id, worker.id));
            
            console.log(
              `[Ngrok Health Poller] Worker ${worker.id} (${worker.provider}) ✅ provisioning → healthy (${response.status})`
            );
            
          } catch (healthError: any) {
            console.warn(
              `[Ngrok Health Poller] Worker ${worker.id} URL ready but not responding yet: ${healthError.message}`
            );
          }
          
        } else {
          // Still provisioning - use freshly fetched record for elapsed time
          const elapsed = Math.round((now.getTime() - new Date(updated.createdAt).getTime()) / 1000);
          console.log(
            `[Ngrok Health Poller] Worker ${worker.id} (${worker.provider}) ⏳ still provisioning (${elapsed}s elapsed, URL: ${updated.ngrokUrl || 'null'})`
          );
        }
        
      } catch (error: any) {
        console.error(`[Ngrok Health Poller] Error tracking worker ${worker.id}:`, error.message);
      }
    })
  );
}

/**
 * Poll all active workers' Ngrok URLs and update lastHealthCheck
 * PRODUCTION-GRADE: Handles both valid URLs and provisioning workers
 */
async function pollWorkerHealth() {
  console.log("[Ngrok Health Poller] 🔄 Executing poll cycle...");
  try {
    const now = new Date();
    
    // Get all workers (including provisioning)
    const allWorkers = await db
      .select()
      .from(gpuWorkers);
    
    // Separate valid workers from provisioning workers
    const validWorkers = allWorkers.filter(w => 
      w.ngrokUrl?.startsWith("http") && 
      !w.ngrokUrl.includes("pending") &&
      !w.ngrokUrl.includes("placeholder")
    );
    
    const provisioningWorkers = allWorkers.filter(w =>
      w.status !== "offline" &&
      w.status !== "terminated" &&
      (!w.ngrokUrl || 
       w.ngrokUrl.includes("pending") || 
       w.ngrokUrl.includes("placeholder"))
    );
    
    if (validWorkers.length === 0 && provisioningWorkers.length === 0) {
      return;
    }
    
    // Check valid workers (normal health check)
    await checkValidWorkers(validWorkers, now);
    
    // Track provisioning workers (wait for URL to appear)
    await trackProvisioningWorkers(provisioningWorkers, now);
    
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
  
  // Run immediately on start - must catch errors from async function
  pollWorkerHealth().catch((error) => {
    console.error("[Ngrok Health Poller] CRITICAL: Failed to run initial poll:", error);
  });
  
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
