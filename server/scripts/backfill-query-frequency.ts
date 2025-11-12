#!/usr/bin/env tsx
// server/scripts/backfill-query-frequency.ts
// ONE-TIME MIGRATION: Backfill content_hash and query frequency tracking for legacy items

import { db } from "../db";
import { curationQueue } from "../../shared/schema";
import { isNull, sql } from "drizzle-orm";
import { generateContentHash, normalizeContent } from "../utils/deduplication";
import { queryFrequencyService } from "../services/query-frequency-service";

async function backfillQueryFrequency() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║   🔄 BACKFILL: Content Hash + Query Frequency Tracking       ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  
  // STEP 1: Find all items without content_hash
  console.log("\n[Step 1/4] 🔍 Finding items without content_hash...");
  const itemsWithoutHash = await db
    .select({
      id: curationQueue.id,
      content: curationQueue.content,
      suggestedNamespaces: curationQueue.suggestedNamespaces,
      conversationId: curationQueue.conversationId,
    })
    .from(curationQueue)
    .where(isNull(curationQueue.contentHash));

  console.log(`   Found ${itemsWithoutHash.length} items without hash`);
  
  if (itemsWithoutHash.length === 0) {
    console.log("\n✅ No items need backfill - all items already have content_hash");
    return;
  }

  // STEP 2: Generate and store content_hash for each item
  console.log("\n[Step 2/4] 🔢 Generating content hashes...");
  let hashesGenerated = 0;
  
  for (const item of itemsWithoutHash) {
    const contentHash = generateContentHash(item.content);
    const normalizedContent = normalizeContent(item.content);
    
    await db
      .update(curationQueue)
      .set({ 
        contentHash, 
        normalizedContent 
      })
      .where(sql`${curationQueue.id} = ${item.id}`);
    
    hashesGenerated++;
    
    if (hashesGenerated % 50 === 0) {
      console.log(`   Progress: ${hashesGenerated}/${itemsWithoutHash.length} hashes generated`);
    }
  }
  
  console.log(`   ✅ Generated ${hashesGenerated} content hashes`);

  // STEP 3: Track query frequency for all items (batched for performance)
  console.log("\n[Step 3/4] 📊 Tracking query frequencies...");
  console.log(`   ⚠️  Note: This will take ~10-20 minutes due to embedding generation`);
  console.log(`   Processing in batches of 10 items...`);
  
  let tracked = 0;
  let skipped = 0;
  let errors = 0;
  
  const BATCH_SIZE = 10;
  const totalBatches = Math.ceil(itemsWithoutHash.length / BATCH_SIZE);
  
  for (let i = 0; i < itemsWithoutHash.length; i += BATCH_SIZE) {
    const batch = itemsWithoutHash.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    
    console.log(`\n   📦 Batch ${batchNum}/${totalBatches} (items ${i + 1}-${Math.min(i + BATCH_SIZE, itemsWithoutHash.length)})`);
    
    // Process batch items in parallel (up to BATCH_SIZE concurrent)
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const primaryNamespace = item.suggestedNamespaces && item.suggestedNamespaces.length > 0 
          ? item.suggestedNamespaces[0] 
          : undefined;
        
        return queryFrequencyService.track(
          item.content,
          primaryNamespace,
          item.conversationId?.toString()
        );
      })
    );
    
    // Count results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        tracked++;
      } else {
        const error = result.reason;
        if (error?.message?.includes('similarity')) {
          skipped++;
        } else {
          errors++;
          console.error(`      ⚠️  Error:`, error?.message || error);
        }
      }
    }
    
    console.log(`      ✅ Tracked: ${tracked}, Skipped: ${skipped}, Errors: ${errors}`);
  }
  
  console.log(`   ✅ Tracked ${tracked} items`);
  if (skipped > 0) {
    console.log(`   ⚠️  Skipped ${skipped} similar items (semantic deduplication)`);
  }
  if (errors > 0) {
    console.log(`   ❌ ${errors} errors encountered`);
  }

  // STEP 4: Show final statistics
  console.log("\n[Step 4/4] 📈 Final Statistics:");
  
  const stats = await db.execute(sql`
    SELECT 
      (SELECT COUNT(*) FROM curation_queue) as total_queue_items,
      (SELECT COUNT(*) FROM curation_queue WHERE content_hash IS NOT NULL) as items_with_hash,
      (SELECT COUNT(*) FROM user_query_frequency) as frequency_records,
      (SELECT COUNT(DISTINCT query_hash) FROM user_query_frequency) as unique_queries,
      (SELECT COUNT(*) FROM user_query_frequency WHERE occurrence_count >= 3) as reusable_queries
  `);
  
  const row = stats.rows[0] as any;
  console.log(`   Total queue items:     ${row.total_queue_items}`);
  console.log(`   Items with hash:       ${row.items_with_hash}`);
  console.log(`   Frequency records:     ${row.frequency_records}`);
  console.log(`   Unique queries:        ${row.unique_queries}`);
  console.log(`   Reusable (≥3x):        ${row.reusable_queries}`);

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║   ✅ BACKFILL COMPLETED SUCCESSFULLY                          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
}

// Run migration
backfillQueryFrequency()
  .then(() => {
    console.log("\n✅ Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  });
