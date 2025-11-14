#!/usr/bin/env tsx
/**
 * server/scripts/requeue-rejected.ts
 * 
 * ENTERPRISE RE-QUEUE PIPELINE - Industry 2025 Testing
 * 
 * Re-queue all previously rejected items for re-evaluation under NEW rules:
 * - Greeting bypass (oi, olá, hi)
 * - Frequency gate (≥3x + score ≥10)
 * - Semantic deduplication (82% embedding, 95% hash)
 * - Reject protection (score <30 + freq <3)
 * 
 * Strategy (Architect-approved):
 * 1. Clone rejected items → new pending records (preserve original IDs for audit)
 * 2. Reset decision metadata (autoAnalysis, decisionReason, duplicationStatus)
 * 3. Preserve embeddings/hashes (avoid re-computation, enable dedup)
 * 4. Add audit trail (requeuedFromId, requeuedAt)
 * 5. Rate limiting (10 items/sec to avoid overload)
 */

import { db } from "../db";
import { curationQueue } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

interface RequeueOptions {
  dryRun?: boolean;
  batchSize?: number;
  rateLimit?: number; // items per second
  namespace?: string; // filter by namespace (optional)
}

interface RequeueStats {
  totalRejected: number;
  requeued: number;
  skipped: number;
  errors: number;
  startTime: Date;
  endTime?: Date;
}

/**
 * Main re-queue function
 */
async function requeueRejectedItems(options: RequeueOptions = {}): Promise<RequeueStats> {
  const {
    dryRun = false,
    batchSize = 50,
    rateLimit = 10,
    namespace,
  } = options;

  console.log(`\n${"═".repeat(80)}`);
  console.log(`🔄 RE-QUEUE REJECTED ITEMS - INDUSTRY 2025 TESTING`);
  console.log(`${"═".repeat(80)}\n`);
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE (will modify database)"}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Rate limit: ${rateLimit} items/sec`);
  console.log(`Namespace filter: ${namespace || "ALL"}\n`);

  const stats: RequeueStats = {
    totalRejected: 0,
    requeued: 0,
    skipped: 0,
    errors: 0,
    startTime: new Date(),
  };

  try {
    // STEP 1: Query all rejected items
    console.log(`[1/4] 📊 Querying rejected items...`);
    
    const query = namespace
      ? db.select()
          .from(curationQueue)
          .where(
            and(
              eq(curationQueue.status, "rejected"),
              sql`${curationQueue.suggestedNamespaces}::jsonb ? ${namespace}`
            )
          )
      : db.select()
          .from(curationQueue)
          .where(eq(curationQueue.status, "rejected"));

    const rejectedItems = await query;
    stats.totalRejected = rejectedItems.length;

    console.log(`   ✅ Found ${stats.totalRejected} rejected items\n`);

    if (stats.totalRejected === 0) {
      console.log(`   ℹ️  No rejected items to re-queue. Exiting.`);
      return stats;
    }

    // STEP 2: Process in batches with rate limiting
    console.log(`[2/4] 🔄 Re-queuing items (batches of ${batchSize})...`);
    
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const delayBetweenItems = 1000 / rateLimit; // ms per item

    for (let i = 0; i < rejectedItems.length; i += batchSize) {
      const batch = rejectedItems.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(rejectedItems.length / batchSize);

      console.log(`\n   📦 Batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

      for (const item of batch) {
        try {
          // Clone rejected item → new pending record
          const newId = crypto.randomUUID();
          
          if (dryRun) {
            console.log(`      [DRY RUN] Would re-queue: "${item.title.substring(0, 60)}..."`);
            stats.requeued++;
          } else {
            await db.insert(curationQueue).values({
              // New ID (preserve original for audit)
              id: newId,
              
              // Core content (PRESERVE)
              title: item.title,
              content: item.content,
              suggestedNamespaces: item.suggestedNamespaces,
              tags: item.tags || [],
              attachments: item.attachments,
              
              // Reset status to pending
              status: "pending",
              
              // Preserve embeddings/hashes (enable dedup without re-computation)
              contentHash: item.contentHash,
              normalizedContent: item.normalizedContent,
              embedding: item.embedding,
              
              // RESET decision metadata (allow fresh evaluation)
              autoAnalysis: null,
              decisionReasonCode: null,
              decisionReasonDetail: null,
              duplicationStatus: null, // Allow re-dedup
              similarityScore: null,
              duplicateOfId: null,
              
              // Preserve quality score (for frequency gate evaluation)
              score: item.score,
              
              // Audit trail
              submittedBy: `REQUEUE_SCRIPT`,
              note: `Re-queued from rejected item ${item.id} for Industry 2025 testing`,
              
              // Timestamps
              submittedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            
            console.log(`      ✅ Re-queued: "${item.title.substring(0, 60)}..." (score: ${item.score || "N/A"})`);
            stats.requeued++;
          }
          
          // Rate limiting (avoid overload)
          await delay(delayBetweenItems);
          
        } catch (error: any) {
          console.error(`      ❌ ERROR re-queuing item ${item.id}:`, error.message);
          stats.errors++;
        }
      }
      
      console.log(`   ✅ Batch ${batchNum}/${totalBatches} complete`);
    }

    stats.endTime = new Date();

    // STEP 3: Summary
    console.log(`\n${"═".repeat(80)}`);
    console.log(`📊 RE-QUEUE SUMMARY`);
    console.log(`${"═".repeat(80)}\n`);
    console.log(`Total rejected items: ${stats.totalRejected}`);
    console.log(`Successfully re-queued: ${stats.requeued}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Duration: ${((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(2)}s\n`);

    if (!dryRun) {
      console.log(`✅ Re-queue complete! Items are now pending auto-approval.`);
      console.log(`\n📋 NEXT STEPS:`);
      console.log(`1. Monitor logs: tail -f workflow logs`);
      console.log(`2. Check auto-approval decisions: SELECT * FROM curation_queue WHERE status = 'approved' ORDER BY updated_at DESC LIMIT 20;`);
      console.log(`3. Verify deduplication: Check KB for duplicates`);
      console.log(`4. Review frequency gate: Check greetings ("oi", "olá") auto-approved`);
    }

    return stats;

  } catch (error: any) {
    console.error(`\n❌ CRITICAL ERROR during re-queue:`, error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const namespace = args.find(arg => arg.startsWith("--namespace="))?.split("=")[1];
  const batchSize = parseInt(args.find(arg => arg.startsWith("--batch-size="))?.split("=")[1] || "50");
  const rateLimit = parseInt(args.find(arg => arg.startsWith("--rate-limit="))?.split("=")[1] || "10");

  if (args.includes("--help")) {
    console.log(`
Usage: tsx server/scripts/requeue-rejected.ts [options]

Options:
  --dry-run               Simulate re-queue without making changes
  --namespace=<name>      Filter by namespace (e.g., "raw_intake", "geral")
  --batch-size=<n>        Items per batch (default: 50)
  --rate-limit=<n>        Items per second (default: 10)
  --help                  Show this help message

Examples:
  # Dry run (preview)
  tsx server/scripts/requeue-rejected.ts --dry-run

  # Re-queue all rejected items
  tsx server/scripts/requeue-rejected.ts

  # Re-queue only "raw_intake" namespace
  tsx server/scripts/requeue-rejected.ts --namespace=raw_intake

  # Slow rate (5 items/sec)
  tsx server/scripts/requeue-rejected.ts --rate-limit=5
    `);
    return;
  }

  try {
    const stats = await requeueRejectedItems({
      dryRun,
      namespace,
      batchSize,
      rateLimit,
    });

    process.exit(stats.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error(`Fatal error:`, error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { requeueRejectedItems, RequeueOptions, RequeueStats };
