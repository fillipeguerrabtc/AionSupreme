/**
 * KB DEDUPLICATION SCANNER
 * 
 * Scans existing KB documents for duplicates
 * - Detects exact duplicates (>98% similar)
 * - Detects near duplicates (85-98% similar)
 * - Suggests merging or removal actions
 * 
 * Usage:
 * - Manual: Admin triggers via API endpoint
 * - Automatic: Scheduled periodic scans (daily/weekly)
 */

import { db } from '../db';
import { documents, embeddings } from '@shared/schema';
import { eq, sql, and, ne } from 'drizzle-orm';
import { cosineSimilarity, getDuplicationStatus } from '../utils/deduplication';

export interface KBDuplicateResult {
  documentId: number;
  title: string;
  duplicateOfId: number;
  duplicateOfTitle: string;
  similarityScore: number;
  duplicationStatus: 'exact' | 'near';
  suggestedAction: 'merge' | 'review' | 'delete';
  reason: string;
}

export interface KBDuplicationScanReport {
  timestamp: Date;
  totalDocuments: number;
  duplicatesFound: number;
  exact: number;
  near: number;
  duplicates: KBDuplicateResult[];
}

export class KBDeduplicationScanner {
  /**
   * Scan entire KB for duplicates
   * Compares all documents against each other using embeddings
   */
  async scanKB(tenantId: number = 1): Promise<KBDuplicationScanReport> {
    console.log('[KB Dedup] Starting KB-wide duplicate scan...');
    const startTime = Date.now();

    // Get all indexed documents with embeddings
    const docsWithEmbeddings = await db
      .select({
        docId: documents.id,
        title: documents.title,
        content: documents.content,
        embedding: sql<number[]>`${embeddings.embedding}::jsonb`,
      })
      .from(documents)
      .innerJoin(embeddings, eq(embeddings.documentId, documents.id))
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.status, 'indexed'),
          sql`${embeddings.embedding} IS NOT NULL`
        )
      );

    console.log(`[KB Dedup] Found ${docsWithEmbeddings.length} documents with embeddings`);

    const duplicates: KBDuplicateResult[] = [];
    const processedPairs = new Set<string>(); // Track pairs to avoid duplicates

    // Compare each document with every other document
    for (let i = 0; i < docsWithEmbeddings.length; i++) {
      const doc1 = docsWithEmbeddings[i];

      for (let j = i + 1; j < docsWithEmbeddings.length; j++) {
        const doc2 = docsWithEmbeddings[j];

        // Create unique pair ID (sorted to avoid A-B vs B-A duplicates)
        const pairId = [doc1.docId, doc2.docId].sort().join('-');
        if (processedPairs.has(pairId)) continue;
        processedPairs.add(pairId);

        // Calculate similarity
        try {
          if (!doc1.embedding || !doc2.embedding) continue;
          const similarity = cosineSimilarity(doc1.embedding, doc2.embedding);
          const status = getDuplicationStatus(similarity);

          // Only report exact and near duplicates
          if (status === 'exact' || status === 'near') {
            // Determine which doc is the duplicate (newer one)
            const isDup1Newer = doc1.docId > doc2.docId;
            const duplicateDoc = isDup1Newer ? doc1 : doc2;
            const originalDoc = isDup1Newer ? doc2 : doc1;

            duplicates.push({
              documentId: duplicateDoc.docId,
              title: duplicateDoc.title,
              duplicateOfId: originalDoc.docId,
              duplicateOfTitle: originalDoc.title,
              similarityScore: similarity,
              duplicationStatus: status,
              suggestedAction: status === 'exact' ? 'delete' : 'review',
              reason: status === 'exact' 
                ? `Exact duplicate (${(similarity * 100).toFixed(1)}%) - safe to delete`
                : `Near duplicate (${(similarity * 100).toFixed(1)}%) - review for merging`,
            });
          }
        } catch (error) {
          console.warn(`[KB Dedup] Error comparing docs ${doc1.docId} and ${doc2.docId}:`, error);
          continue;
        }
      }
    }

    const scanTime = Date.now() - startTime;
    console.log(`[KB Dedup] Scan complete in ${scanTime}ms: ${duplicates.length} duplicates found`);

    return {
      timestamp: new Date(),
      totalDocuments: docsWithEmbeddings.length,
      duplicatesFound: duplicates.length,
      exact: duplicates.filter(d => d.duplicationStatus === 'exact').length,
      near: duplicates.filter(d => d.duplicationStatus === 'near').length,
      duplicates,
    };
  }

  /**
   * Format scan report for console output
   */
  formatReport(report: KBDuplicationScanReport): string {
    const lines: string[] = [];
    
    lines.push('╔═══════════════════════════════════════════════════════════════╗');
    lines.push('║       KB DEDUPLICATION SCAN REPORT                           ║');
    lines.push('╠═══════════════════════════════════════════════════════════════╣');
    lines.push(`║ Timestamp: ${report.timestamp.toISOString().padEnd(48)} ║`);
    lines.push(`║ Total Documents: ${String(report.totalDocuments).padEnd(44)} ║`);
    lines.push(`║ Duplicates Found: ${String(report.duplicatesFound).padEnd(43)} ║`);
    lines.push(`║   - Exact (>98%): ${String(report.exact).padEnd(43)} ║`);
    lines.push(`║   - Near (85-98%): ${String(report.near).padEnd(42)} ║`);
    lines.push('╠═══════════════════════════════════════════════════════════════╣');

    if (report.duplicatesFound > 0) {
      lines.push('║ DUPLICATES DETECTED:                                          ║');
      lines.push('╠═══════════════════════════════════════════════════════════════╣');

      for (const dup of report.duplicates.slice(0, 10)) { // Show first 10
        lines.push(`║ Doc ${dup.documentId}: "${dup.title.substring(0, 30)}"`.padEnd(65) + '║');
        lines.push(`║   Duplicate of ${dup.duplicateOfId}: "${dup.duplicateOfTitle.substring(0, 25)}"`.padEnd(65) + '║');
        lines.push(`║   Similarity: ${(dup.similarityScore * 100).toFixed(1)}% (${dup.duplicationStatus})`.padEnd(65) + '║');
        lines.push(`║   Action: ${dup.suggestedAction}`.padEnd(65) + '║');
        lines.push('╟───────────────────────────────────────────────────────────────╢');
      }

      if (report.duplicates.length > 10) {
        lines.push(`║ ... and ${report.duplicates.length - 10} more duplicates`.padEnd(65) + '║');
      }
    } else {
      lines.push('║ ✅ NO DUPLICATES FOUND - KB is clean!                         ║');
    }

    lines.push('╚═══════════════════════════════════════════════════════════════╝');

    return lines.join('\n');
  }
}

// Singleton instance
export const kbDeduplicationScanner = new KBDeduplicationScanner();
