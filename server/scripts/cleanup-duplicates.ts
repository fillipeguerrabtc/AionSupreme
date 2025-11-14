/**
 * EMERGENCY CLEANUP SCRIPT - Delete ALL duplicates from KB, Datasets, and Curation
 * 
 * Usage: npx tsx server/scripts/cleanup-duplicates.ts --dry-run
 *        npx tsx server/scripts/cleanup-duplicates.ts --execute
 * 
 * CRITICAL: This script deletes data. Use --dry-run first!
 */

import { db } from '../db';
import { documents, datasets, curationQueue, embeddings } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import { generateContentHash } from '../utils/deduplication';

interface DuplicateGroup {
  hash: string;
  count: number;
  ids: number[];
  titles: string[];
  sources: string[];
}

async function findDuplicatesInKB(): Promise<DuplicateGroup[]> {
  console.log('\n🔍 Scanning Knowledge Base for duplicates...');
  
  // Find duplicates by HASH
  const hashDuplicates = await db
    .select({
      hash: documents.contentHash,
      count: sql<number>`count(*)::int`,
      ids: sql<number[]>`array_agg(${documents.id} ORDER BY ${documents.createdAt} DESC)`,
      titles: sql<string[]>`array_agg(${documents.title} ORDER BY ${documents.createdAt} DESC)`,
      sources: sql<string[]>`array_agg(${documents.source} ORDER BY ${documents.createdAt} DESC)`,
    })
    .from(documents)
    .groupBy(documents.contentHash)
    .having(sql`count(*) > 1`)
    .orderBy(sql`count(*) DESC`);
  
  // Find duplicates by TITLE (for greetings with same Q but different A)
  const titleDuplicates = await db
    .select({
      hash: sql<string>`''`,
      count: sql<number>`count(*)::int`,
      ids: sql<number[]>`array_agg(${documents.id} ORDER BY ${documents.createdAt} DESC)`,
      titles: sql<string[]>`array_agg(${documents.title} ORDER BY ${documents.createdAt} DESC)`,
      sources: sql<string[]>`array_agg(${documents.source} ORDER BY ${documents.createdAt} DESC)`,
    })
    .from(documents)
    .where(sql`LENGTH(${documents.title}) <= 30`) // Only short titles (greetings)
    .groupBy(documents.title)
    .having(sql`count(*) > 1`)
    .orderBy(sql`count(*) DESC`);
  
  const total = hashDuplicates.length + titleDuplicates.length;
  const redundant = hashDuplicates.reduce((sum, d) => sum + d.count - 1, 0) + 
                    titleDuplicates.reduce((sum, d) => sum + d.count - 1, 0);
  
  console.log(`   Found ${hashDuplicates.length} hash-based duplicate groups`);
  console.log(`   Found ${titleDuplicates.length} title-based duplicate groups (greetings)`);
  console.log(`   Total: ${total} groups with ${redundant} redundant documents`);
  
  return [...hashDuplicates, ...titleDuplicates];
}

async function findDuplicatesInDatasets(): Promise<DuplicateGroup[]> {
  console.log('\n🔍 Scanning Training Data Collection for duplicates...');
  
  // Training data duplicates need manual review - skip for now
  console.log('   Skipping (no content_hash column - needs conversation-based dedup)');
  return [];
}

async function findDuplicatesInCuration(): Promise<DuplicateGroup[]> {
  console.log('\n🔍 Scanning Curation Queue for duplicates...');
  
  const duplicates = await db
    .select({
      hash: sql<string>`content_hash`,
      count: sql<number>`count(*)::int`,
      ids: sql<string[]>`array_agg(id ORDER BY submitted_at DESC)`,
      titles: sql<string[]>`array_agg(title ORDER BY submitted_at DESC)`,
      sources: sql<string[]>`array_agg(status ORDER BY submitted_at DESC)`,
    })
    .from(curationQueue)
    .where(
      and(
        sql`content_hash IS NOT NULL`,
        eq(curationQueue.status, 'pending')
      )
    )
    .groupBy(sql`content_hash`)
    .having(sql`count(*) > 1`)
    .orderBy(sql`count(*) DESC`);
  
  console.log(`   Found ${duplicates.length} duplicate groups with ${duplicates.reduce((sum, d) => sum + d.count - 1, 0)} redundant curation items`);
  return duplicates;
}

async function deleteDuplicatesInKB(duplicates: DuplicateGroup[], dryRun: boolean): Promise<number> {
  let deleted = 0;
  
  for (const group of duplicates) {
    // Keep first (most recent), delete rest
    const idsToDelete = group.ids.slice(1);
    
    if (dryRun) {
      console.log(`\n[DRY RUN] Would delete ${idsToDelete.length} duplicates of "${group.titles[0]}":`);
      for (let i = 0; i < idsToDelete.length && i < 3; i++) {
        console.log(`   - ID ${idsToDelete[i]}: "${group.titles[i + 1]}"`);
      }
      if (idsToDelete.length > 3) {
        console.log(`   ... and ${idsToDelete.length - 3} more`);
      }
    } else {
      console.log(`\n🗑️  Deleting ${idsToDelete.length} duplicates of "${group.titles[0]}"...`);
      
      for (const id of idsToDelete) {
        // Delete embeddings FIRST (foreign key constraint)
        await db.delete(embeddings).where(eq(embeddings.documentId, id));
        
        // Then delete document
        await db.delete(documents).where(eq(documents.id, id));
        deleted++;
      }
    }
  }
  
  return deleted;
}

async function deleteDuplicatesInDatasets(duplicates: DuplicateGroup[], dryRun: boolean): Promise<number> {
  let deleted = 0;
  
  for (const group of duplicates) {
    const idsToDelete = group.ids.slice(1);
    
    if (dryRun) {
      console.log(`\n[DRY RUN] Would delete ${idsToDelete.length} dataset duplicates of "${group.titles[0]}"`);
    } else {
      console.log(`\n🗑️  Deleting ${idsToDelete.length} dataset duplicates...`);
      
      for (const id of idsToDelete) {
        await db.delete(datasets).where(eq(datasets.id, id));
        deleted++;
      }
    }
  }
  
  return deleted;
}

async function deleteDuplicatesInCuration(duplicates: DuplicateGroup[], dryRun: boolean): Promise<number> {
  let deleted = 0;
  
  for (const group of duplicates) {
    const idsToDelete = group.ids.slice(1);
    
    if (dryRun) {
      console.log(`\n[DRY RUN] Would delete ${idsToDelete.length} curation duplicates of "${group.titles[0]}"`);
    } else {
      console.log(`\n🗑️  Deleting ${idsToDelete.length} curation duplicates...`);
      
      for (const id of idsToDelete) {
        await db.delete(curationQueue).where(eq(curationQueue.id, id));
        deleted++;
      }
    }
  }
  
  return deleted;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  
  if (dryRun) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('║           DRY RUN MODE - No changes will be made        ║');
    console.log('║   Use --execute to actually delete duplicates           ║');
    console.log('═══════════════════════════════════════════════════════════\n');
  } else {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('║     ⚠️  EXECUTE MODE - DELETING DUPLICATES NOW!         ║');
    console.log('═══════════════════════════════════════════════════════════\n');
  }
  
  // Find duplicates in all systems
  const kbDuplicates = await findDuplicatesInKB();
  const datasetDuplicates = await findDuplicatesInDatasets();
  const curationDuplicates = await findDuplicatesInCuration();
  
  // Delete duplicates
  const kbDeleted = await deleteDuplicatesInKB(kbDuplicates, dryRun);
  const datasetDeleted = await deleteDuplicatesInDatasets(datasetDuplicates, dryRun);
  const curationDeleted = await deleteDuplicatesInCuration(curationDuplicates, dryRun);
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('║                   CLEANUP SUMMARY                        ║');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Knowledge Base:       ${kbDeleted} duplicates ${dryRun ? 'would be' : ''} deleted`);
  console.log(`Training Datasets:    ${datasetDeleted} duplicates ${dryRun ? 'would be' : ''} deleted`);
  console.log(`Curation Queue:       ${curationDeleted} duplicates ${dryRun ? 'would be' : ''} deleted`);
  console.log(`TOTAL:                ${kbDeleted + datasetDeleted + curationDeleted} duplicates ${dryRun ? 'would be' : ''} deleted`);
  console.log('═══════════════════════════════════════════════════════════\n');
  
  if (dryRun) {
    console.log('✅ Dry run complete. Re-run with --execute to delete duplicates.\n');
  } else {
    console.log('✅ Cleanup complete!\n');
  }
  
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
