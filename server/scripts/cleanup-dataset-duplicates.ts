#!/usr/bin/env tsx
/**
 * CLEANUP DATASET DUPLICATES
 * Remove ALL duplicate training data from datasets
 * Keep only the OLDEST entry for each conversation_id
 */

import { db } from "../db";
import { sql } from "drizzle-orm";

async function cleanupDatasetDuplicates() {
  console.log("\n🧹 CLEANING UP DATASET DUPLICATES...\n");
  
  try {
    // Delete duplicate training_data_collection entries (keep oldest per conversation_id)
    const result = await db.execute(sql`
      DELETE FROM training_data_collection
      WHERE id IN (
        SELECT t1.id
        FROM training_data_collection t1
        INNER JOIN training_data_collection t2 
          ON t1.conversation_id = t2.conversation_id 
          AND t1.created_at > t2.created_at
      )
    `);
    
    console.log(`✅ Deleted ${result.rowCount} duplicate training data entries\n`);
    
    // Verify no duplicates remain
    const counts = await db.execute(sql`
      SELECT conversation_id, COUNT(*) as count
      FROM training_data_collection
      GROUP BY conversation_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `);
    
    if (counts.rows.length === 0) {
      console.log("✅ No duplicates remain in datasets!\n");
    } else {
      console.log("⚠️ Remaining duplicates:");
      console.log(counts.rows);
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error("❌ ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

cleanupDatasetDuplicates();
