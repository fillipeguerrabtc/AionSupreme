#!/usr/bin/env tsx
/**
 * CLEANUP KB DUPLICATES
 * Remove ALL duplicate documents from knowledge base
 * Keep only the OLDEST document for each unique title
 */

import { db } from "../db";
import { documents, embeddings } from "@shared/schema";
import { sql } from "drizzle-orm";

async function cleanupDuplicates() {
  console.log("\n🧹 CLEANING UP KB DUPLICATES...\n");
  
  try {
    // Step 1: Find duplicate document IDs (newer ones to delete)
    const duplicateIds = await db.execute(sql`
      SELECT d1.id
      FROM documents d1
      INNER JOIN documents d2 
        ON d1.title = d2.title 
        AND d1.created_at > d2.created_at
    `);
    
    const idsToDelete = duplicateIds.rows.map((r: any) => r.id);
    
    console.log(`Found ${idsToDelete.length} duplicate documents to delete\n`);
    
    if (idsToDelete.length === 0) {
      console.log("✅ No duplicates found!\n");
      process.exit(0);
    }
    
    // Step 2: Delete associated embeddings first
    const embeddingsDeleted = await db.execute(sql`
      DELETE FROM embeddings
      WHERE document_id IN (
        SELECT d1.id
        FROM documents d1
        INNER JOIN documents d2 
          ON d1.title = d2.title 
          AND d1.created_at > d2.created_at
      )
    `);
    
    console.log(`✅ Deleted ${embeddingsDeleted.rowCount} associated embeddings\n`);
    
    // Step 3: Delete duplicate documents
    const docsDeleted = await db.execute(sql`
      DELETE FROM documents
      WHERE id IN (
        SELECT d1.id
        FROM documents d1
        INNER JOIN documents d2 
          ON d1.title = d2.title 
          AND d1.created_at > d2.created_at
      )
    `);
    
    console.log(`✅ Deleted ${docsDeleted.rowCount} duplicate documents\n`);
    
    // Step 4: Verify no duplicates remain
    const counts = await db.execute(sql`
      SELECT title, COUNT(*) as count
      FROM documents
      GROUP BY title
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 10
    `);
    
    if (counts.rows.length === 0) {
      console.log("✅ No duplicates remain!\n");
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

cleanupDuplicates();
