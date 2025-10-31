/**
 * GPU Heartbeat Monitor - Background Task
 * Detects and marks offline workers that stopped sending heartbeats
 * Runs every 60 seconds to avoid coupling with API endpoints
 */

import { db } from "../db";
import { gpuWorkers } from "../../shared/schema";
import { eq } from "drizzle-orm";

const HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes without heartbeat = offline
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

let monitorInterval: NodeJS.Timeout | null = null;

/**
 * Check all workers and mark offline those without recent heartbeat
 */
async function checkHeartbeats() {
  try {
    const now = new Date();
    
    // Get all workers
    const allWorkers = await db
      .select()
      .from(gpuWorkers);

    // Filter workers that are not already offline
    const workers = allWorkers.filter(w => w.status !== "offline");

    for (const worker of workers) {
      const timeSinceLastHeartbeat = now.getTime() - new Date(worker.lastHealthCheck!).getTime();
      
      // Mark as offline if no heartbeat for 3+ minutes
      if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
        console.log(
          `[Heartbeat Monitor] Worker ${worker.id} (${worker.provider}) offline ` +
          `(no heartbeat for ${Math.floor(timeSinceLastHeartbeat / 1000)}s)`
        );
        
        await db
          .update(gpuWorkers)
          .set({ 
            status: "offline", 
            updatedAt: now 
          })
          .where(eq(gpuWorkers.id, worker.id));
      }
    }
  } catch (error: any) {
    console.error("[Heartbeat Monitor] Error checking heartbeats:", error.message);
  }
}

/**
 * Start the heartbeat monitor background task
 */
export function startHeartbeatMonitor() {
  if (monitorInterval) {
    console.log("[Heartbeat Monitor] Already running");
    return;
  }

  console.log(`[Heartbeat Monitor] Starting (checks every ${CHECK_INTERVAL_MS / 1000}s, timeout: ${HEARTBEAT_TIMEOUT_MS / 1000}s)`);
  
  // Run immediately on start
  checkHeartbeats();
  
  // Then run every minute
  monitorInterval = setInterval(checkHeartbeats, CHECK_INTERVAL_MS);
}

/**
 * Stop the heartbeat monitor (for testing/cleanup)
 */
export function stopHeartbeatMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[Heartbeat Monitor] Stopped");
  }
}
