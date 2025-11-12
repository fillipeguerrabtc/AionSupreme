/**
 * PRODUCTION SCRIPT: Backfill embeddings for existing curation queue items
 * 
 * Purpose: Generate embeddings for items that were created before embedding
 * persistence was implemented, enabling semantic deduplication.
 * 
 * Run: tsx server/scripts/backfill-curation-embeddings.ts
 */

import { db } from "../db";
import { curationQueue } from "@shared/schema";
import { sql, isNull } from "drizzle-orm";
import { embedText } from "../ai/embedder";

async function backfillCurationEmbeddings() {
  console.log('\n🔄 [Embedding Backfill] Starting curation queue embedding generation...\n');
  
  try {
    // Count items missing embeddings
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(curationQueue)
      .where(isNull(curationQueue.embedding));
    
    console.log(`📊 Found ${count} items without embeddings\n`);
    
    if (count === 0) {
      console.log('✅ All items already have embeddings - nothing to do!\n');
      return;
    }
    
    // Fetch items in batches
    const batchSize = 10; // Process 10 at a time to avoid rate limits
    let processed = 0;
    let errors = 0;
    
    while (processed < count) {
      // Fetch batch
      const items = await db
        .select()
        .from(curationQueue)
        .where(isNull(curationQueue.embedding))
        .limit(batchSize);
      
      if (items.length === 0) break;
      
      console.log(`\n📦 Processing batch of ${items.length} items...`);
      
      // Process each item
      for (const item of items) {
        let retries = 0;
        const maxRetries = 3;
        let success = false;
        
        while (retries < maxRetries && !success) {
          try {
            console.log(`  → Generating embedding for item ${item.id.substring(0, 8)}... (attempt ${retries + 1}/${maxRetries})`);
            
            // Generate embedding using embedText (returns number[] directly)
            const embeddingVector = await embedText(item.content);
            
            if (!Array.isArray(embeddingVector) || embeddingVector.length !== 1536) {
              throw new Error(`Invalid embedding dimension: ${embeddingVector.length}, expected 1536`);
            }
            
            // Update item with embedding vector
            await db
              .update(curationQueue)
              .set({ embedding: embeddingVector })
              .where(sql`${curationQueue.id} = ${item.id}`);
            
            processed++;
            success = true;
            console.log(`  ✅ Item ${item.id.substring(0, 8)} updated (${processed}/${count})`);
            
            // Rate limit: exponential backoff between requests
            // 100ms, 200ms, 400ms, etc based on batch progress
            const delay = Math.min(100 * Math.pow(2, Math.floor(processed / 10)), 2000);
            await new Promise(resolve => setTimeout(resolve, delay));
          } catch (error: any) {
            retries++;
            errors++;
            
            if (retries < maxRetries) {
              // Exponential backoff for retries: 1s, 2s, 4s
              const backoff = 1000 * Math.pow(2, retries - 1);
              console.error(`  ⚠️  Error processing item ${item.id}: ${error.message} - retrying in ${backoff}ms...`);
              await new Promise(resolve => setTimeout(resolve, backoff));
            } else {
              console.error(`  ❌ Failed to process item ${item.id} after ${maxRetries} attempts: ${error.message}`);
            }
          }
        }
      }
    }
    
    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║  ✅ EMBEDDING BACKFILL COMPLETE               ║`);
    console.log(`╚════════════════════════════════════════════════╝`);
    console.log(`\n📊 Summary:`);
    console.log(`   • Total items: ${count}`);
    console.log(`   • Successfully processed: ${processed}`);
    console.log(`   • Errors: ${errors}`);
    console.log(`   • Success rate: ${((processed / count) * 100).toFixed(1)}%\n`);
    
  } catch (error: any) {
    console.error(`\n❌ Fatal error during backfill:`, error.message);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillCurationEmbeddings()
    .then(() => {
      console.log('🎉 Backfill completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Backfill failed:', error);
      process.exit(1);
    });
}

export { backfillCurationEmbeddings };
