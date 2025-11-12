#!/usr/bin/env tsx
// server/scripts/backfill-query-frequency-fast.ts
// FAST MIGRATION: Calculate query frequency from existing content_hash (no embeddings!)

import { db } from "../db";
import { curationQueue, userQueryFrequency } from "../../shared/schema";
import { sql, inArray } from "drizzle-orm";
import { generateContentHash, normalizeContent } from "../utils/deduplication";

async function backfillQueryFrequencyFast() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║   ⚡ FAST BACKFILL: Query Frequency from Hash Counts          ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  
  // STEP 1: Count occurrences by content_hash
  console.log("\n[Step 1/3] 🔢 Counting query frequencies by hash...");
  
  const hashCounts = await db.execute(sql`
    SELECT 
      content_hash as query_hash,
      normalized_content,
      (array_agg(content ORDER BY created_at))[1] as example_query,
      (array_agg(suggested_namespaces[1] ORDER BY created_at))[1] as namespace,
      COUNT(*) as occurrence_count,
      MIN(created_at) as first_seen,
      MAX(created_at) as last_seen
    FROM curation_queue
    WHERE content_hash IS NOT NULL
    GROUP BY content_hash, normalized_content
    HAVING COUNT(*) >= 1
  `);
  
  const counts = hashCounts.rows as Array<{
    query_hash: string;
    normalized_content: string;
    example_query: string;
    namespace: string;
    occurrence_count: string; // BigInt as string
    first_seen: Date;
    last_seen: Date;
  }>;
  
  console.log(`   Found ${counts.length} unique queries`);
  console.log(`   Total items: ${counts.reduce((sum, c) => sum + parseInt(c.occurrence_count), 0)}`);
  
  // STEP 2: Insert into user_query_frequency
  console.log("\n[Step 2/3] 💾 Populating user_query_frequency table...");
  
  let inserted = 0;
  let skipped = 0;
  
  for (const count of counts) {
    try {
      // Check if already exists (idempotent)
      const existing = await db
        .select()
        .from(userQueryFrequency)
        .where(sql`${userQueryFrequency.queryHash} = ${count.query_hash}`)
        .limit(1);
      
      if (existing.length > 0) {
        skipped++;
        continue;
      }
      
      await db.insert(userQueryFrequency).values({
        queryHash: count.query_hash,
        normalizedQuery: count.normalized_content,
        namespace: count.namespace || 'general',
        hitCount: parseInt(count.occurrence_count),
        firstSeenAt: count.first_seen,
        lastSeenAt: count.last_seen,
        queryEmbedding: null, // Will be lazy-loaded on demand if needed for similarity search
      });
      
      inserted++;
      
      if (inserted % 50 === 0) {
        console.log(`   Progress: ${inserted}/${counts.length} records inserted`);
      }
    } catch (error: any) {
      console.error(`   ⚠️  Error inserting hash ${count.query_hash.substring(0, 8)}:`, error.message);
    }
  }
  
  console.log(`   ✅ Inserted ${inserted} records`);
  if (skipped > 0) {
    console.log(`   ⏭️  Skipped ${skipped} existing records`);
  }

  // STEP 3: Show final statistics
  console.log("\n[Step 3/3] 📈 Final Statistics:");
  
  const stats = await db.execute(sql`
    SELECT 
      (SELECT COUNT(*) FROM curation_queue) as total_queue_items,
      (SELECT COUNT(*) FROM curation_queue WHERE content_hash IS NOT NULL) as items_with_hash,
      (SELECT COUNT(*) FROM user_query_frequency) as frequency_records,
      (SELECT COUNT(DISTINCT query_hash) FROM user_query_frequency) as unique_queries,
      (SELECT COUNT(*) FROM user_query_frequency WHERE hit_count >= 3) as reusable_queries,
      (SELECT MAX(hit_count) FROM user_query_frequency) as max_count
  `);
  
  const row = stats.rows[0] as any;
  console.log(`   Total queue items:     ${row.total_queue_items}`);
  console.log(`   Items with hash:       ${row.items_with_hash}`);
  console.log(`   Frequency records:     ${row.frequency_records}`);
  console.log(`   Unique queries:        ${row.unique_queries}`);
  console.log(`   Reusable (≥3x):        ${row.reusable_queries}`);
  console.log(`   Max repetitions:       ${row.max_count}`);

  // BONUS: Show top repeated queries
  const topRepeated = await db.execute(sql`
    SELECT normalized_query, hit_count, namespace
    FROM user_query_frequency
    ORDER BY hit_count DESC
    LIMIT 10
  `);
  
  if (topRepeated.rows.length > 0) {
    console.log("\n   🔥 Top 10 Most Repeated Queries:");
    for (const row of topRepeated.rows as any[]) {
      const preview = row.normalized_query.substring(0, 60).replace(/\n/g, ' ');
      console.log(`      ${row.hit_count}x - "${preview}..." [${row.namespace}]`);
    }
  }

  console.log("\n╔════════════════════════════════════════════════════════════════╗");
  console.log("║   ✅ FAST BACKFILL COMPLETED SUCCESSFULLY                     ║");
  console.log("║   Note: Embeddings will be lazy-loaded on demand             ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
}

// Run migration
backfillQueryFrequencyFast()
  .then(() => {
    console.log("\n✅ Migration completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  });
