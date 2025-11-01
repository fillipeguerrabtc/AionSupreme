/**
 * GPU Quota Manager - Intelligent load balancing with safety margins
 * 
 * Prevents hitting Google limits by:
 * - Tracking real-time usage per worker
 * - Using only 70% of available quota (30% safety margin)
 * - Round-robin distribution across all workers
 * - Automatic worker rotation when approaching limits
 * 
 * CRITICAL: Different quota models for different providers:
 * - COLAB: Quota por SESSÃO (12h max, usamos até 11.5h = 95.8%)
 * - KAGGLE: Quota SEMANAL (30h/semana, usamos até 21h = 70%)
 * 
 * SAFETY: We NEVER want to trigger Google's punishment mechanisms!
 */

import { db } from "../db";
import { gpuWorkers } from "../../shared/schema";
import { eq, sql as drizzleSql } from "drizzle-orm";

interface WorkerQuota {
  workerId: number;
  workerType: "colab" | "kaggle" | "local" | "cloud" | "other";
  accountEmail: string;
  quotaHoursPerWeek: number;
  usedHoursThisWeek: number;
  sessionRuntimeHours: number; // Runtime da sessão ATUAL (Colab)
  maxSessionHours: number; // Limite da sessão (11.5h Colab, 8.5h Kaggle)
  availableHours: number;
  utilizationPercentage: number;
  isSafe: boolean; // true if utilization < safe threshold
}

export class QuotaManager {
  private static SAFETY_MARGIN = 0.70; // Use apenas 70% da quota (30% de margem)
  private static COLAB_DEFAULT_QUOTA = 84; // ~12h/dia * 7
  private static KAGGLE_DEFAULT_QUOTA = 30; // 30h/semana garantidas
  
  private lastUsedWorkerIndex = -1; // For round-robin

  /**
   * Get quota status for all workers
   * CRITICAL: Different logic for Colab (session-based) vs Kaggle (weekly)
   */
  async getAllWorkerQuotas(): Promise<WorkerQuota[]> {
    const workers = await db
      .select()
      .from(gpuWorkers);
    
    // Get all workers (single-tenant system)
    const tenantWorkers = workers;

    const quotas: WorkerQuota[] = [];

    for (const worker of tenantWorkers) {
      const capabilities = worker.capabilities as any || {};
      const metadata = capabilities.metadata || {};
      
      // Session runtime info (vem do heartbeat)
      const sessionRuntimeHours = metadata.sessionRuntimeHours || 0;
      const maxSessionHours = metadata.maxSessionHours || 12;
      
      // Weekly quota info
      const quotaHoursPerWeek = metadata.quotaHoursPerWeek || this.getDefaultQuota(worker.provider);
      const usedHoursThisWeek = metadata.usedHoursThisWeek || 0;
      
      // CRITICAL: Lógica diferente para Colab vs Kaggle
      let utilizationPercentage: number;
      let isSafe: boolean;
      let availableHours: number;
      
      if (worker.provider === "colab") {
        // COLAB: Quota por SESSÃO
        // Consideramos unsafe se sessionRuntime >= 95% do maxSessionHours
        // (o auto-shutdown já está configurado para 95.8% = 11.5h/12h)
        utilizationPercentage = maxSessionHours > 0 ? sessionRuntimeHours / maxSessionHours : 0;
        isSafe = sessionRuntimeHours < (maxSessionHours * 0.90); // 90% = seguro
        availableHours = Math.max(0, maxSessionHours - sessionRuntimeHours);
        
        console.log(
          `[QuotaManager] Colab worker ${worker.id}: ` +
          `session ${sessionRuntimeHours.toFixed(2)}h/${maxSessionHours}h ` +
          `(${(utilizationPercentage * 100).toFixed(1)}%) ${isSafe ? "✅" : "⚠️"}`
        );
      } else if (worker.provider === "kaggle") {
        // KAGGLE: Quota SEMANAL
        // Usamos apenas 70% da quota semanal (30h)
        utilizationPercentage = quotaHoursPerWeek > 0 ? usedHoursThisWeek / quotaHoursPerWeek : 0;
        isSafe = utilizationPercentage < QuotaManager.SAFETY_MARGIN; // 70%
        availableHours = quotaHoursPerWeek - usedHoursThisWeek;
        
        console.log(
          `[QuotaManager] Kaggle worker ${worker.id}: ` +
          `week ${usedHoursThisWeek.toFixed(2)}h/${quotaHoursPerWeek}h ` +
          `(${(utilizationPercentage * 100).toFixed(1)}%) ${isSafe ? "✅" : "⚠️"}`
        );
      } else {
        // Outros providers (local, cloud): sempre safe
        utilizationPercentage = 0;
        isSafe = true;
        availableHours = 999;
      }

      quotas.push({
        workerId: worker.id,
        workerType: worker.provider as any,
        accountEmail: worker.accountId || "unknown",
        quotaHoursPerWeek,
        usedHoursThisWeek,
        sessionRuntimeHours,
        maxSessionHours,
        availableHours,
        utilizationPercentage,
        isSafe,
      });
    }

    return quotas;
  }

  /**
   * Select next available worker using round-robin + quota safety
   * Returns null if no safe workers available
   */
  async selectNextWorker(): Promise<number | null> {
    const quotas = await this.getAllWorkerQuotas();
    
    // Filter only safe workers (< 70% utilization)
    const safeWorkers = quotas
      .filter(q => q.isSafe)
      .sort((a, b) => a.utilizationPercentage - b.utilizationPercentage); // Least used first

    if (safeWorkers.length === 0) {
      console.warn("[QuotaManager] ⚠️  No safe workers available! All workers near quota limit.");
      return null;
    }

    // Round-robin among safe workers
    this.lastUsedWorkerIndex = (this.lastUsedWorkerIndex + 1) % safeWorkers.length;
    const selectedWorker = safeWorkers[this.lastUsedWorkerIndex];

    console.log(
      `[QuotaManager] ✅ Selected worker ${selectedWorker.workerId} ` +
      `(${selectedWorker.workerType}, ${(selectedWorker.utilizationPercentage * 100).toFixed(1)}% used)`
    );

    return selectedWorker.workerId;
  }

  /**
   * Record worker usage (call after job completion)
   * CRITICAL: This MUST be called after every inference/training job!
   */
  async recordUsage(workerId: number, durationMinutes: number): Promise<void> {
    const [worker] = await db
      .select()
      .from(gpuWorkers)
      .where(eq(gpuWorkers.id, workerId))
      .limit(1);

    if (!worker) {
      console.error(`[QuotaManager] Worker ${workerId} not found`);
      return;
    }

    const capabilities = (worker.capabilities as any) || {};
    const metadata = capabilities.metadata || {};
    const usedHoursThisWeek = (metadata.usedHoursThisWeek || 0) + durationMinutes / 60;

    // Update capabilities with new usage
    const updatedCapabilities = {
      ...capabilities,
      metadata: {
        ...metadata,
        usedHoursThisWeek,
        lastUsageRecorded: new Date().toISOString(),
      },
    };

    await db
      .update(gpuWorkers)
      .set({
        capabilities: updatedCapabilities,
        updatedAt: new Date(),
      })
      .where(eq(gpuWorkers.id, workerId));

    const quotaHoursPerWeek = metadata.quotaHoursPerWeek || this.getDefaultQuota(worker.provider);
    const utilization = (usedHoursThisWeek / quotaHoursPerWeek) * 100;

    console.log(
      `[QuotaManager] 📊 Worker ${workerId} usage recorded: +${durationMinutes}min ` +
      `(total: ${usedHoursThisWeek.toFixed(2)}h / ${quotaHoursPerWeek}h = ${utilization.toFixed(1)}%)`
    );

    if (utilization > 70) {
      console.warn(
        `[QuotaManager] ⚠️  Worker ${workerId} (${worker.provider}) at ${utilization.toFixed(1)}% quota! ` +
        `Approaching safety limit.`
      );
    }
  }

  /**
   * Reset weekly quotas (run every Monday at 00:00 UTC)
   */
  async resetWeeklyQuotas(): Promise<void> {
    const workers = await db
      .select()
      .from(gpuWorkers);

    // Get all workers (single-tenant system)
    const tenantWorkers = workers;

    for (const worker of tenantWorkers) {
      const capabilities = (worker.capabilities as any) || {};
      const metadata = capabilities.metadata || {};
      
      const updatedCapabilities = {
        ...capabilities,
        metadata: {
          ...metadata,
          usedHoursThisWeek: 0,
          lastQuotaReset: new Date().toISOString(),
        },
      };
      
      await db
        .update(gpuWorkers)
        .set({
          capabilities: updatedCapabilities,
          updatedAt: new Date(),
        })
        .where(eq(gpuWorkers.id, worker.id));
    }

    console.log(`[QuotaManager] 🔄 Weekly quotas reset for ${tenantWorkers.length} workers`);
  }

  /**
   * Get health status of entire GPU pool
   */
  async getPoolHealth(): Promise<{
    totalWorkers: number;
    safeWorkers: number;
    warningWorkers: number; // 70-90%
    criticalWorkers: number; // >90%
    totalAvailableHours: number;
    poolUtilization: number;
  }> {
    const quotas = await this.getAllWorkerQuotas();

    const safeWorkers = quotas.filter(q => q.utilizationPercentage < 0.70).length;
    const warningWorkers = quotas.filter(q => q.utilizationPercentage >= 0.70 && q.utilizationPercentage < 0.90).length;
    const criticalWorkers = quotas.filter(q => q.utilizationPercentage >= 0.90).length;
    const totalAvailableHours = quotas.reduce((sum, q) => sum + q.availableHours, 0);
    const totalQuota = quotas.reduce((sum, q) => sum + q.quotaHoursPerWeek, 0);
    const totalUsed = quotas.reduce((sum, q) => sum + q.usedHoursThisWeek, 0);
    const poolUtilization = totalQuota > 0 ? totalUsed / totalQuota : 0;

    return {
      totalWorkers: quotas.length,
      safeWorkers,
      warningWorkers,
      criticalWorkers,
      totalAvailableHours,
      poolUtilization,
    };
  }

  private getDefaultQuota(workerType: string): number {
    switch (workerType) {
      case "colab":
        return QuotaManager.COLAB_DEFAULT_QUOTA;
      case "kaggle":
        return QuotaManager.KAGGLE_DEFAULT_QUOTA;
      default:
        return 168; // 24h/dia * 7 para local/cloud
    }
  }
}

// Singleton instance
export const quotaManager = new QuotaManager();

/**
 * Cron job to reset quotas every Monday at 00:00 UTC
 * Run this in your server startup
 */
export function startQuotaResetCron() {
  const checkInterval = 60 * 60 * 1000; // Check every hour

  setInterval(async () => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday
    const hour = now.getUTCHours();

    // Reset on Monday at 00:00 UTC
    if (dayOfWeek === 1 && hour === 0) {
      console.log("[QuotaManager] 🔄 Monday 00:00 UTC - Resetting weekly quotas...");
      
      try {
        await quotaManager.resetWeeklyQuotas();
        console.log("[QuotaManager] ✅ Weekly quotas reset successfully");
      } catch (error) {
        console.error("[QuotaManager] ❌ Error resetting quotas:", error);
      }
    }
  }, checkInterval);

  console.log("[QuotaManager] 📅 Weekly quota reset cron started (runs Monday 00:00 UTC)");
}
