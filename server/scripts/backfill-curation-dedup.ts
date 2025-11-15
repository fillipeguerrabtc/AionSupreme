import { db } from "../db";
import { curationQueue } from "../../shared/schema";
import { eq, isNull, and } from "drizzle-orm";
import { deduplicationService } from "../services/deduplication-service";
import { curationStore } from "../curation/store";
import { generateContentHash, normalizeContent } from "../utils/deduplication";

const logger = {
  info: (...args: any[]) => console.log('[Backfill Dedup]', ...args),
  warn: (...args: any[]) => console.warn('[Backfill Dedup]', ...args),
  error: (...args: any[]) => console.error('[Backfill Dedup]', ...args),
};

async function backfillCurationDedup() {
  logger.info('🔄 Starting deduplication backfill for legacy curation items...');
  
  // Get all pending items with NULL duplication_status (legacy items)
  const pendingItems = await db
    .select()
    .from(curationQueue)
    .where(
      and(
        eq(curationQueue.status, 'pending'),
        isNull(curationQueue.duplicationStatus)
      )
    );
  
  logger.info(`📋 Found ${pendingItems.length} pending items without dedup metadata`);
  
  if (pendingItems.length === 0) {
    logger.info('✅ No items to backfill - all pending items have dedup metadata');
    return { processed: 0, unique: 0, duplicates: 0, errors: 0 };
  }
  
  let unique = 0;
  let duplicates = 0;
  let errors = 0;
  
  for (const item of pendingItems) {
    try {
      logger.info(`🔍 Checking item ${item.id}: "${item.title}"`);
      
      // Generate hash and normalized content if not already stored
      const contentHash = item.contentHash || generateContentHash(item.content);
      const normalizedContent = item.normalizedContent || normalizeContent(item.content);
      
      // Run duplicate check (generates embedding if needed)
      const duplicateCheck = await deduplicationService.checkCurationRealtimeDuplicate(
        item.content,
        contentHash,
        normalizedContent,
        {
          queryTitle: item.title,
          enableSemantic: true,
        }
      );
      
      if (duplicateCheck && duplicateCheck.isDuplicate) {
        // Duplicate detected → auto-reject
        const location = duplicateCheck.isPending ? 'curation queue' : 'Knowledge Base';
        logger.warn(`❌ Duplicate of "${duplicateCheck.documentTitle}" in ${location} - auto-rejecting`);
        
        await curationStore.reject(
          item.id,
          'BACKFILL-DEDUP-SCRIPT',
          `Duplicate content: ${duplicateCheck.method} duplicate (${(duplicateCheck.similarity! * 100).toFixed(1)}% similarity) of "${duplicateCheck.documentTitle}" (ID: ${duplicateCheck.documentId || 'pending'})`
        );
        
        duplicates++;
      } else if (duplicateCheck) {
        // Unique content → update with dedup metadata
        logger.info(`✅ Unique content - updating dedup metadata`);
        
        await db
          .update(curationQueue)
          .set({
            duplicationStatus: 'unique',
            similarityScore: duplicateCheck.similarity || 0,
            embedding: duplicateCheck.embedding,
            contentHash,
            normalizedContent,
            updatedAt: new Date(),
          })
          .where(eq(curationQueue.id, item.id));
        
        unique++;
      } else {
        logger.warn(`⚠️ No duplicate check result for item ${item.id} - skipping`);
        errors++;
      }
    } catch (error: any) {
      logger.error(`❌ Error processing item ${item.id}: ${error.message}`);
      errors++;
    }
  }
  
  logger.info('');
  logger.info('═══════════════════════════════════════');
  logger.info('  BACKFILL DEDUPLICATION COMPLETE');
  logger.info('═══════════════════════════════════════');
  logger.info(`  Total processed: ${pendingItems.length}`);
  logger.info(`  ✅ Unique items: ${unique}`);
  logger.info(`  ❌ Duplicates rejected: ${duplicates}`);
  logger.info(`  ⚠️  Errors: ${errors}`);
  logger.info('═══════════════════════════════════════');
  logger.info('');
  logger.info('💡 Next steps:');
  logger.info('   1. Auto-curator-processor will approve unique items (score ≥55) on next run');
  logger.info('   2. Items in gray zone (30-54) require manual review');
  logger.info('   3. Monitor /api/curation/pending for queue health');
  
  return { processed: pendingItems.length, unique, duplicates, errors };
}

backfillCurationDedup()
  .then((result) => {
    logger.info('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('❌ Script failed:', error);
    process.exit(1);
  });
