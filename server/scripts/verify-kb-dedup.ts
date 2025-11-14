#!/usr/bin/env tsx
/**
 * server/scripts/verify-kb-dedup.ts
 * 
 * ENTERPRISE KB DEDUPLICATION VERIFICATION
 * 
 * Verifies semantic deduplication is working correctly in the Knowledge Base.
 * Threshold: 82% (0.82 cosine similarity) - Industry 2025 standard
 * 
 * Checks:
 * 1. Query for high-similarity pairs (>82%)
 * 2. Identify potential duplicates that weren't deduplicated
 * 3. Provide cleanup recommendations
 */

import { db } from "../db";
import { documents } from "@shared/schema";
import { sql } from "drizzle-orm";

interface DuplicatePair {
  id1: number;
  id2: number;
  title1: string;
  title2: string;
  content1: string;
  content2: string;
  similarity: number;
  namespace1: string;
  namespace2: string;
}

/**
 * Find potential duplicate pairs in KB using vector similarity
 */
async function findDuplicatePairs(threshold: number = 0.82): Promise<DuplicatePair[]> {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`🔍 KB SEMANTIC DEDUPLICATION VERIFICATION`);
  console.log(`${"═".repeat(80)}\n`);
  console.log(`Threshold: ${(threshold * 100).toFixed(0)}% (Industry 2025 standard)`);
  console.log(`Querying database...\n`);

  // Query for self-join on documents with high cosine similarity
  // Using pgvector's <=> operator for cosine distance
  // Distance = 1 - similarity, so threshold 0.82 → distance <= 0.18
  const maxDistance = 1 - threshold;

  const query = sql`
    WITH duplicates AS (
      SELECT 
        d1.id as id1,
        d2.id as id2,
        d1.title as title1,
        d2.title as title2,
        LEFT(d1.content, 200) as content1,
        LEFT(d2.content, 200) as content2,
        1 - (d1.embedding <=> d2.embedding) as similarity,
        d1.namespace as namespace1,
        d2.namespace as namespace2
      FROM documents d1
      CROSS JOIN LATERAL (
        SELECT id, title, content, embedding, namespace
        FROM documents d2
        WHERE d2.id > d1.id
          AND d2.embedding IS NOT NULL
          AND d1.embedding IS NOT NULL
          AND (d1.embedding <=> d2.embedding) <= ${maxDistance}
        LIMIT 100
      ) d2
    )
    SELECT * FROM duplicates
    ORDER BY similarity DESC
    LIMIT 50;
  `;

  const results = await db.execute(query);
  
  return results.rows.map((row: any) => ({
    id1: row.id1,
    id2: row.id2,
    title1: row.title1,
    title2: row.title2,
    content1: row.content1,
    content2: row.content2,
    similarity: parseFloat(row.similarity),
    namespace1: row.namespace1,
    namespace2: row.namespace2,
  }));
}

/**
 * Analyze and display duplicate pairs
 */
async function analyzeDuplicates() {
  try {
    const duplicates = await findDuplicatePairs(0.82);

    if (duplicates.length === 0) {
      console.log(`✅ No duplicate pairs found above 82% threshold!`);
      console.log(`   KB deduplication is working correctly.\n`);
      return;
    }

    console.log(`⚠️  Found ${duplicates.length} potential duplicate pairs:\n`);

    // Group by similarity ranges
    const ranges = {
      exact: duplicates.filter(d => d.similarity >= 0.95),
      high: duplicates.filter(d => d.similarity >= 0.88 && d.similarity < 0.95),
      threshold: duplicates.filter(d => d.similarity >= 0.82 && d.similarity < 0.88),
    };

    if (ranges.exact.length > 0) {
      console.log(`📊 EXACT/NEAR-EXACT DUPLICATES (≥95%):`);
      console.log(`   Count: ${ranges.exact.length}\n`);
      ranges.exact.forEach((pair, idx) => {
        console.log(`   ${idx + 1}. Similarity: ${(pair.similarity * 100).toFixed(1)}%`);
        console.log(`      Doc ${pair.id1} (${pair.namespace1}): "${pair.title1}"`);
        console.log(`      Doc ${pair.id2} (${pair.namespace2}): "${pair.title2}"`);
        console.log(``);
      });
    }

    if (ranges.high.length > 0) {
      console.log(`📊 HIGH SIMILARITY (88-95%):`);
      console.log(`   Count: ${ranges.high.length}\n`);
      ranges.high.slice(0, 5).forEach((pair, idx) => {
        console.log(`   ${idx + 1}. Similarity: ${(pair.similarity * 100).toFixed(1)}%`);
        console.log(`      Doc ${pair.id1} (${pair.namespace1}): "${pair.title1}"`);
        console.log(`      Doc ${pair.id2} (${pair.namespace2}): "${pair.title2}"`);
        console.log(``);
      });
      if (ranges.high.length > 5) {
        console.log(`   ... and ${ranges.high.length - 5} more\n`);
      }
    }

    if (ranges.threshold.length > 0) {
      console.log(`📊 AT THRESHOLD (82-88%):`);
      console.log(`   Count: ${ranges.threshold.length}\n`);
      ranges.threshold.slice(0, 3).forEach((pair, idx) => {
        console.log(`   ${idx + 1}. Similarity: ${(pair.similarity * 100).toFixed(1)}%`);
        console.log(`      Doc ${pair.id1} (${pair.namespace1}): "${pair.title1}"`);
        console.log(`      Doc ${pair.id2} (${pair.namespace2}): "${pair.title2}"`);
        console.log(``);
      });
      if (ranges.threshold.length > 3) {
        console.log(`   ... and ${ranges.threshold.length - 3} more\n`);
      }
    }

    // Recommendations
    console.log(`${"═".repeat(80)}`);
    console.log(`📋 RECOMMENDATIONS:`);
    console.log(`${"═".repeat(80)}\n`);

    if (ranges.exact.length > 0) {
      console.log(`⚠️  ${ranges.exact.length} near-exact duplicates (≥95%) found!`);
      console.log(`   These should have been caught by deduplication.`);
      console.log(`   → Action: Review deduplication service configuration\n`);
    }

    if (ranges.high.length > 5) {
      console.log(`⚠️  ${ranges.high.length} high-similarity items (88-95%) found!`);
      console.log(`   → Action: Consider running cleanup script\n`);
    }

    if (ranges.threshold.length > 10) {
      console.log(`ℹ️  ${ranges.threshold.length} items at threshold (82-88%)`);
      console.log(`   This is within normal range for semantic dedup.\n`);
    }

    console.log(`\n🔧 CLEANUP OPTIONS:`);
    console.log(`   1. Manual review via Admin UI`);
    console.log(`   2. Run automated cleanup: tsx server/scripts/cleanup-kb-duplicates.ts`);
    console.log(`   3. Adjust dedup threshold if needed\n`);

  } catch (error: any) {
    console.error(`\n❌ ERROR during verification:`, error.message);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Get KB statistics
 */
async function getKBStats() {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`📊 KB STATISTICS`);
  console.log(`${"═".repeat(80)}\n`);

  const stats = await db.execute(sql`
    SELECT 
      COUNT(*) as total_docs,
      COUNT(embedding) as docs_with_embeddings,
      COUNT(DISTINCT namespace) as total_namespaces,
      AVG(LENGTH(content)) as avg_content_length
    FROM documents
  `);

  const row = stats.rows[0] as any;
  console.log(`Total documents: ${row.total_docs}`);
  console.log(`Documents with embeddings: ${row.docs_with_embeddings}`);
  console.log(`Total namespaces: ${row.total_namespaces}`);
  console.log(`Average content length: ${Math.round(row.avg_content_length)} chars\n`);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    console.log(`
Usage: tsx server/scripts/verify-kb-dedup.ts [options]

Options:
  --stats-only    Show KB statistics only (skip duplicate check)
  --help          Show this help message

Examples:
  # Full verification
  tsx server/scripts/verify-kb-dedup.ts

  # KB stats only
  tsx server/scripts/verify-kb-dedup.ts --stats-only
    `);
    return;
  }

  try {
    await getKBStats();
    
    if (!args.includes("--stats-only")) {
      await analyzeDuplicates();
    }

    process.exit(0);
  } catch (error) {
    console.error(`Fatal error:`, error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { findDuplicatePairs, analyzeDuplicates };
