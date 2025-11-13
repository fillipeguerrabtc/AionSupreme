/**
 * TRAINING QUEUE MONITOR
 * =======================
 * 
 * Monitors training queue and triggers Kaggle GPU when workload threshold is reached.
 * 
 * 🎯 ON-DEMAND STRATEGY:
 * - Monitors KB documents pending training
 * - Trigger: ≥25 KBs ready → Start Kaggle GPU
 * - No minimum duration requirement
 * - Respects 28h/week quota limit
 * 
 * FEATURES:
 * ✅ Real-time queue monitoring
 * ✅ Smart trigger detection (≥25 KBs)
 * ✅ Batch workload estimation
 * ✅ GPU availability check before trigger
 * ✅ Quota-aware triggering (respects 28h/week)
 * ✅ Automatic GPU shutdown after batch completion
 */

import { db } from '../db';
import { documents } from '../../shared/schema';
import { sql, and, isNull } from 'drizzle-orm';

interface TrainingQueueStatus {
  totalPending: number;
  readyForTraining: number;
  estimatedDurationMinutes: number;
  shouldTriggerGPU: boolean;
  reason: string;
}

interface BatchJob {
  kbIds: number[];
  estimatedDurationMinutes: number;
  priority: 'high' | 'normal' | 'low';
}

export class TrainingQueueMonitor {
  
  private readonly TRIGGER_THRESHOLD = 25; // ≥25 KBs trigger GPU
  private readonly AVG_TRAINING_TIME_PER_KB_MINUTES = 5; // Estimate: 5min per KB
  private isMonitoring = false;
  private checkInterval: NodeJS.Timeout | null = null;
  
  /**
   * Get current training queue status
   */
  async getQueueStatus(): Promise<TrainingQueueStatus> {
    try {
      // Count KBs that need training (no embeddings or outdated)
      // NOTE: This is a simplified version - actual implementation would check:
      // - Documents without embeddings
      // - Documents with updated content since last training
      // - Failed training attempts
      
      // Count documents approved and ready for training
      // CRITICAL FIX: Must query for status='approved' to get docs ready for training
      const pendingKBs = await db
        .select({ count: sql<number>`count(*)` })
        .from(documents)
        .where(
          sql`${documents.status} = 'approved'`
        );
      
      const readyCount = Number(pendingKBs[0]?.count || 0);
      const estimatedDuration = readyCount * this.AVG_TRAINING_TIME_PER_KB_MINUTES;
      const shouldTrigger = readyCount >= this.TRIGGER_THRESHOLD;
      
      let reason = '';
      if (shouldTrigger) {
        reason = `✅ Trigger threshold met: ${readyCount} KBs ready (≥${this.TRIGGER_THRESHOLD})`;
      } else {
        reason = `⏳ Below threshold: ${readyCount}/${this.TRIGGER_THRESHOLD} KBs ready`;
      }
      
      return {
        totalPending: readyCount,
        readyForTraining: readyCount,
        estimatedDurationMinutes: estimatedDuration,
        shouldTriggerGPU: shouldTrigger,
        reason,
      };
    } catch (error) {
      console.error('[TrainingQueueMonitor] Error in getQueueStatus:', error);
      return {
        totalPending: 0,
        readyForTraining: 0,
        estimatedDurationMinutes: 0,
        shouldTriggerGPU: false,
        reason: '❌ Error fetching queue status',
      };
    }
  }
  
  /**
   * Check if should trigger Kaggle GPU based on queue
   */
  async shouldTriggerKaggleGPU(): Promise<{ shouldTrigger: boolean; reason: string; batchSize: number }> {
    try {
      const status = await this.getQueueStatus();
      
      if (!status.shouldTriggerGPU) {
        return {
          shouldTrigger: false,
          reason: status.reason,
          batchSize: 0,
        };
      }
      
      // Additional checks before triggering
      // 1. Check if Kaggle GPU is already running
      const kaggleWorkers = await db.query.gpuWorkers.findMany({
        where: sql`provider = 'kaggle' AND status IN ('online', 'healthy')`,
      });
      
      if (kaggleWorkers.length > 0) {
        return {
          shouldTrigger: false,
          reason: '⚠️ Kaggle GPU already running - wait for completion',
          batchSize: status.readyForTraining,
        };
      }
      
      // 2. Check weekly quota (21h/week limit = 70% of 30h)
      const kaggleQuotaCheck = await this.checkKaggleQuota();
      if (!kaggleQuotaCheck.hasQuota) {
        return {
          shouldTrigger: false,
          reason: `⚠️ Weekly quota exhausted: ${kaggleQuotaCheck.usedHours.toFixed(2)}h / 21h (70% safety limit)`,
          batchSize: status.readyForTraining,
        };
      }
      
      // 3. CRITICAL: Verify estimated training time fits within remaining quota
      const estimatedHours = status.estimatedDurationMinutes / 60;
      const remainingHours = kaggleQuotaCheck.remainingHours;
      
      if (estimatedHours > remainingHours) {
        return {
          shouldTrigger: false,
          reason: `⚠️ Estimated time (${estimatedHours.toFixed(2)}h) exceeds remaining quota (${remainingHours.toFixed(2)}h) - would exceed 70% safety limit`,
          batchSize: status.readyForTraining,
        };
      }
      
      // All checks passed - trigger GPU!
      return {
        shouldTrigger: true,
        reason: `🚀 Starting Kaggle GPU: ${status.readyForTraining} KBs ready (~${status.estimatedDurationMinutes}min estimated)`,
        batchSize: status.readyForTraining,
      };
    } catch (error) {
      console.error('[TrainingQueueMonitor] Error in shouldTriggerKaggleGPU:', error);
      return {
        shouldTrigger: false,
        reason: '❌ Error checking GPU trigger conditions',
        batchSize: 0,
      };
    }
  }
  
  /**
   * Check Kaggle weekly quota availability
   */
  private async checkKaggleQuota(): Promise<{ hasQuota: boolean; usedHours: number; remainingHours: number }> {
    try {
      const kaggleWorkers = await db.query.gpuWorkers.findMany({
        where: sql`provider = 'kaggle'`,
      });
      
      if (kaggleWorkers.length === 0) {
        return { hasQuota: true, usedHours: 0, remainingHours: 28 };
      }
      
      // Sum weekly usage across all Kaggle workers
      const totalWeeklyUsage = kaggleWorkers.reduce((sum, worker) => {
        return sum + (worker.weeklyUsageHours || 0);
      }, 0);
      
      const WEEKLY_LIMIT = 21; // 21h/week (70% of 30h Kaggle quota to avoid ban)
      const hasQuota = totalWeeklyUsage < WEEKLY_LIMIT;
      const remainingHours = Math.max(0, WEEKLY_LIMIT - totalWeeklyUsage);
      
      return {
        hasQuota,
        usedHours: totalWeeklyUsage,
        remainingHours,
      };
    } catch (error) {
      console.error('[TrainingQueueMonitor] Error in checkKaggleQuota:', error);
      return { hasQuota: false, usedHours: 0, remainingHours: 0 };
    }
  }
  
  /**
   * Prepare batch job for GPU processing
   */
  async prepareBatchJob(): Promise<BatchJob | null> {
    try {
      // Get documents ready for training
      const readyKBs = await db
        .select()
        .from(documents)
        .where(
          sql`${documents.status} != 'indexed' OR ${documents.updatedAt} > ${documents.createdAt}`
        )
        .limit(100); // Process in batches of max 100
      
      if (readyKBs.length === 0) {
        return null;
      }
      
      const kbIds = readyKBs.map(kb => kb.id);
      const estimatedDuration = readyKBs.length * this.AVG_TRAINING_TIME_PER_KB_MINUTES;
      
      // Determine priority based on KB types
      const priority = this.determineBatchPriority(readyKBs);
      
      return {
        kbIds,
        estimatedDurationMinutes: estimatedDuration,
        priority,
      };
    } catch (error) {
      console.error('[TrainingQueueMonitor] Error in prepareBatchJob:', error);
      return null;
    }
  }
  
  /**
   * Determine batch priority based on KB content types
   */
  private determineBatchPriority(kbs: any[]): 'high' | 'normal' | 'low' {
    // High priority: Many new KBs or critical updates
    if (kbs.length >= 50) return 'high';
    
    // Check if any KB is marked as priority
    const hasPriorityKB = kbs.some(kb => {
      const metadata = kb.metadata as any;
      return metadata?.priority === 'high';
    });
    
    if (hasPriorityKB) return 'high';
    
    // Normal priority by default
    return 'normal';
  }
  
  /**
   * Start monitoring training queue (background task)
   * Checks every 5 minutes for queue threshold
   */
  async startMonitoring(checkIntervalMinutes: number = 5): Promise<void> {
    try {
      if (this.isMonitoring) {
        console.log('[TrainingQueueMonitor] Already monitoring');
        return;
      }
      
      this.isMonitoring = true;
      const intervalMs = checkIntervalMinutes * 60 * 1000;
      
      console.log(`[TrainingQueueMonitor] 🔍 Started monitoring (checks every ${checkIntervalMinutes}min)`);
      
      // Initial check
      await this.checkAndTrigger();
      
      // Periodic checks
      this.checkInterval = setInterval(async () => {
        await this.checkAndTrigger();
      }, intervalMs);
    } catch (error) {
      console.error('[TrainingQueueMonitor] Error in startMonitoring:', error);
    }
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isMonitoring = false;
    console.log('[TrainingQueueMonitor] Monitoring stopped');
  }
  
  /**
   * Check queue and trigger GPU if needed
   */
  private async checkAndTrigger(): Promise<void> {
    try {
      const trigger = await this.shouldTriggerKaggleGPU();
      
      if (trigger.shouldTrigger) {
        console.log(`[TrainingQueueMonitor] 🚀 ${trigger.reason}`);
        
        // Import orchestrator dynamically to avoid circular dependencies
        const { demandBasedKaggleOrchestrator } = await import('./demand-based-kaggle-orchestrator');
        
        // Trigger Kaggle GPU start
        await demandBasedKaggleOrchestrator.startForTraining(trigger.batchSize);
      } else {
        // Silent unless there's an issue
        if (trigger.batchSize >= this.TRIGGER_THRESHOLD - 5) {
          console.log(`[TrainingQueueMonitor] ${trigger.reason}`);
        }
      }
    } catch (error: any) {
      console.error('[TrainingQueueMonitor] Error in check cycle:', error);
    }
  }
  
  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    isMonitoring: boolean;
    triggerThreshold: number;
    avgTrainingTimePerKB: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      triggerThreshold: this.TRIGGER_THRESHOLD,
      avgTrainingTimePerKB: this.AVG_TRAINING_TIME_PER_KB_MINUTES,
    };
  }
  
  /**
   * Manual trigger check (for testing/admin panel)
   */
  async manualCheck(): Promise<TrainingQueueStatus> {
    try {
      const status = await this.getQueueStatus();
      console.log(`[TrainingQueueMonitor] 📊 Manual check: ${status.reason}`);
      return status;
    } catch (error) {
      console.error('[TrainingQueueMonitor] Error in manualCheck:', error);
      return {
        totalPending: 0,
        readyForTraining: 0,
        estimatedDurationMinutes: 0,
        shouldTriggerGPU: false,
        reason: '❌ Error performing manual check',
      };
    }
  }
}

// Singleton instance
export const trainingQueueMonitor = new TrainingQueueMonitor();
