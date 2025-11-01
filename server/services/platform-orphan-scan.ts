/**
 * Platform-Wide Orphan Detection Service
 * ========================================
 * 
 * Scans ALL modules for orphaned/zombie resources:
 * 1. Agents - Already implemented via orphan-detection.ts
 * 2. KB - Already implemented via kb-cascade.ts
 * 3. Datasets - DB entries without files, files without DB entries
 * 4. Training - Orphaned training data collections, expired jobs
 * 5. GPU - Stale workers, completed jobs >30 days
 * 6. Curation - Already implemented via curation/store.ts
 * 7. Physical Files - Files without DB references
 * 
 * DESIGN: Read-only scan + actionable report (NO auto-delete to prevent data loss)
 */

import { db } from "../db";
import { sql, and, lt, eq } from "drizzle-orm";
import { 
  datasets, 
  trainingDataCollection, 
  trainingJobs, 
  gpuWorkers,
  documents,
  conversations
} from "@shared/schema";
import fs from "fs/promises";
import path from "path";

/**
 * Orphan scan result for a single module
 */
export interface ModuleOrphanReport {
  module: string;
  totalOrphans: number;
  orphans: Array<{
    type: string;
    id: string | number;
    reason: string;
    severity: 'low' | 'medium' | 'high';
    suggestedAction: string;
  }>;
}

/**
 * Complete platform scan result
 */
export interface PlatformOrphanReport {
  timestamp: Date;
  totalOrphans: number;
  modules: ModuleOrphanReport[];
  summary: {
    low: number;
    medium: number;
    high: number;
  };
}

/**
 * Platform-wide orphan detection service
 */
export class PlatformOrphanScanner {
  /**
   * Run complete platform scan
   */
  async scanAll(): Promise<PlatformOrphanReport> {
    console.log("[Orphan Scan] Starting platform-wide orphan detection...");

    const modules: ModuleOrphanReport[] = [];

    // Scan each module
    modules.push(await this.scanDatasets());
    modules.push(await this.scanTrainingData());
    modules.push(await this.scanGPUResources());
    modules.push(await this.scanPhysicalFiles());

    // Calculate summary
    const allOrphans = modules.flatMap(m => m.orphans);
    const summary = {
      low: allOrphans.filter(o => o.severity === 'low').length,
      medium: allOrphans.filter(o => o.severity === 'medium').length,
      high: allOrphans.filter(o => o.severity === 'high').length,
    };

    const report: PlatformOrphanReport = {
      timestamp: new Date(),
      totalOrphans: allOrphans.length,
      modules,
      summary,
    };

    console.log(`[Orphan Scan] Scan complete: ${report.totalOrphans} orphans detected`);
    console.log(`[Orphan Scan]   Low: ${summary.low}, Medium: ${summary.medium}, High: ${summary.high}`);

    return report;
  }

  /**
   * Scan datasets module for orphans
   */
  private async scanDatasets(): Promise<ModuleOrphanReport> {
    const orphans: ModuleOrphanReport['orphans'] = [];

    // 1. DB entries without physical files
    const allDatasets = await db.select().from(datasets);
    
    for (const dataset of allDatasets) {
      if (!dataset.storagePath) continue;

      try {
        await fs.access(dataset.storagePath);
      } catch {
        orphans.push({
          type: 'dataset_db_no_file',
          id: dataset.id,
          reason: `Dataset #${dataset.id} (${dataset.name}) references missing file: ${dataset.storagePath}`,
          severity: 'high',
          suggestedAction: 'Delete DB entry OR restore file from backup',
        });
      }
    }

    // 2. Physical files without DB entries
    const DATASET_DIR = 'uploaded_datasets';
    try {
      const files = await fs.readdir(DATASET_DIR);
      
      // Normalize DB paths to absolute for accurate comparison
      const dbPaths = new Set(
        allDatasets
          .map(d => d.storagePath)
          .filter(Boolean)
          .map(p => path.resolve(p!))
      );

      for (const file of files) {
        const relativePath = path.join(DATASET_DIR, file);
        const absolutePath = path.resolve(relativePath);
        
        const stats = await fs.stat(relativePath);
        if (!stats.isFile()) continue;

        // Compare absolute paths
        if (!dbPaths.has(absolutePath)) {
          orphans.push({
            type: 'dataset_file_no_db',
            id: relativePath,
            reason: `File ${relativePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB) has no DB entry`,
            severity: 'medium',
            suggestedAction: 'Delete file OR create DB entry',
          });
        }
      }
    } catch (error) {
      // Directory doesn't exist - OK
    }

    return {
      module: 'Datasets',
      totalOrphans: orphans.length,
      orphans,
    };
  }

  /**
   * Scan training data module for orphans
   */
  private async scanTrainingData(): Promise<ModuleOrphanReport> {
    const orphans: ModuleOrphanReport['orphans'] = [];

    // 1. Training data collections referencing deleted conversations
    const collections = await db.select().from(trainingDataCollection);
    
    for (const collection of collections) {
      if (!collection.conversationId) continue;

      const conversation = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, collection.conversationId))
        .limit(1);

      if (conversation.length === 0) {
        orphans.push({
          type: 'training_data_orphaned',
          id: collection.id,
          reason: `Training data #${collection.id} references deleted conversation #${collection.conversationId}`,
          severity: 'low',
          suggestedAction: 'Delete training data entry (conversation no longer exists)',
        });
      }
    }

    // 2. Training jobs older than 30 days with final status (completed/failed)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const oldJobs = await db
      .select()
      .from(trainingJobs)
      .where(
        and(
          sql`${trainingJobs.status} IN ('completed', 'failed')`,
          lt(trainingJobs.updatedAt, thirtyDaysAgo)
        )
      );

    for (const job of oldJobs) {
      orphans.push({
        type: 'training_job_stale',
        id: job.id,
        reason: `Training job #${job.id} (${job.status}) is >30 days old`,
        severity: 'low',
        suggestedAction: 'Archive job metadata, cleanup associated files',
      });
    }

    return {
      module: 'Training',
      totalOrphans: orphans.length,
      orphans,
    };
  }

  /**
   * Scan GPU resources for orphans
   */
  private async scanGPUResources(): Promise<ModuleOrphanReport> {
    const orphans: ModuleOrphanReport['orphans'] = [];

    // 1. Stale workers (offline >7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const staleWorkers = await db
      .select()
      .from(gpuWorkers)
      .where(
        and(
          eq(gpuWorkers.status, 'offline'),
          lt(gpuWorkers.updatedAt, sevenDaysAgo)
        )
      );

    for (const worker of staleWorkers) {
      orphans.push({
        type: 'gpu_worker_stale',
        id: worker.id,
        reason: `GPU worker #${worker.id} (${worker.provider}) offline for >7 days`,
        severity: 'low',
        suggestedAction: 'Remove worker entry (unrecoverable)',
      });
    }

    // 2. Training jobs referencing missing dataset files
    const jobs = await db
      .select()
      .from(trainingJobs)
      .where(sql`${trainingJobs.status} NOT IN ('completed', 'failed')`);

    for (const job of jobs) {
      if (!job.datasetPath) continue;

      try {
        await fs.access(job.datasetPath);
      } catch {
        orphans.push({
          type: 'training_job_orphaned',
          id: job.id,
          reason: `Training job #${job.id} references missing dataset file: ${job.datasetPath}`,
          severity: 'high',
          suggestedAction: 'Cancel job immediately (no source data)',
        });
      }
    }

    return {
      module: 'GPU',
      totalOrphans: orphans.length,
      orphans,
    };
  }

  /**
   * Scan physical files for orphans
   * 
   * Cross-references files against DB tables to detect true orphans
   * NOTE: Normalizes both DB paths and filesystem paths to absolute for accurate comparison
   */
  private async scanPhysicalFiles(): Promise<ModuleOrphanReport> {
    const orphans: ModuleOrphanReport['orphans'] = [];

    // Get all dataset paths from DB and normalize to absolute paths
    const allDatasets = await db.select().from(datasets);
    const datasetPaths = new Set(
      allDatasets
        .map(d => d.storagePath)
        .filter(Boolean)
        .map(p => path.resolve(p!)) // Normalize to absolute paths
    );

    // Scan uploaded_datasets directory
    const UPLOADED_DATASETS_DIR = 'uploaded_datasets';
    try {
      const files = await fs.readdir(UPLOADED_DATASETS_DIR);
      
      for (const file of files) {
        const relativePath = path.join(UPLOADED_DATASETS_DIR, file);
        const absolutePath = path.resolve(relativePath); // Normalize to absolute
        
        // Check if this is a file (not directory)
        const stats = await fs.stat(relativePath);
        if (!stats.isFile()) continue;

        // Check if file has DB reference (compare absolute paths)
        if (!datasetPaths.has(absolutePath)) {
          orphans.push({
            type: 'dataset_file_orphaned',
            id: relativePath, // Display relative path for readability
            reason: `Dataset file ${relativePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB) has no DB entry`,
            severity: 'medium',
            suggestedAction: 'Delete file OR create dataset DB entry',
          });
        }
      }
    } catch (error) {
      // Directory doesn't exist - OK (no uploaded datasets yet)
    }

    return {
      module: 'Files',
      totalOrphans: orphans.length,
      orphans,
    };
  }

  /**
   * Generate human-readable report
   */
  formatReport(report: PlatformOrphanReport): string {
    const lines: string[] = [];

    lines.push('╔═══════════════════════════════════════════════════════════════╗');
    lines.push('║          PLATFORM ORPHAN DETECTION REPORT                    ║');
    lines.push('╠═══════════════════════════════════════════════════════════════╣');
    lines.push(`║ Timestamp: ${report.timestamp.toISOString()}`);
    lines.push(`║ Total Orphans: ${report.totalOrphans}`);
    lines.push(`║   High Severity: ${report.summary.high}`);
    lines.push(`║   Medium Severity: ${report.summary.medium}`);
    lines.push(`║   Low Severity: ${report.summary.low}`);
    lines.push('╠═══════════════════════════════════════════════════════════════╣');

    for (const module of report.modules) {
      if (module.totalOrphans === 0) continue;

      lines.push(`║`);
      lines.push(`║ 📦 ${module.module}: ${module.totalOrphans} orphans`);
      lines.push(`║ ${'─'.repeat(61)}`);

      for (const orphan of module.orphans.slice(0, 5)) {
        const icon = orphan.severity === 'high' ? '🔴' : orphan.severity === 'medium' ? '🟡' : '🟢';
        lines.push(`║ ${icon} [${orphan.type}] ${orphan.reason.slice(0, 55)}`);
        lines.push(`║    Action: ${orphan.suggestedAction.slice(0, 53)}`);
      }

      if (module.orphans.length > 5) {
        lines.push(`║    ... and ${module.orphans.length - 5} more`);
      }
    }

    lines.push('╚═══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }
}

// Singleton instance
export const platformOrphanScanner = new PlatformOrphanScanner();
