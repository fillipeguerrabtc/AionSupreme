/**
 * ENTERPRISE AUDIT SCRIPT - Analyze 320 rejected curation items
 * 
 * Groups rejections by:
 * 1. Exact duplicates (hash 100%)
 * 2. Semantic duplicates (80-95%)
 * 3. Low score without duplication
 * 4. Greetings incorrectly rejected
 * 5. High-frequency items incorrectly rejected
 * 
 * Outputs restoration recommendations
 */

import { db } from "../db";
import { curationQueue, documents } from "@shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { deduplicationService } from "../services/deduplication-service";
import { queryFrequencyService } from "../services/query-frequency-service";

interface RejectionAnalysis {
  id: string;
  title: string;
  content: string;
  submittedAt: Date;
  category: 'exact_duplicate' | 'semantic_duplicate' | 'low_score_low_freq' | 'greeting_error' | 'high_freq_error' | 'legitimate_reject';
  reason: string;
  recommendation: 'restore_to_pending' | 'keep_rejected';
  metadata?: any;
}

async function auditRejectedItems(): Promise<void> {
  console.log('🔍 ENTERPRISE AUDIT: Analyzing rejected curation items...\n');

  // Fetch all rejected items
  const rejectedItems = await db
    .select()
    .from(curationQueue)
    .where(eq(curationQueue.status, 'rejected'))
    .orderBy(sql`${curationQueue.submittedAt} DESC`);

  console.log(`📊 Total rejected items: ${rejectedItems.length}\n`);

  const analysis: RejectionAnalysis[] = [];
  const greetingPatterns = /^(oi|olá|ola|opa|e aí|e ai|bom dia|boa tarde|boa noite|hi|hello|hey|hola)\b/i;

  for (const item of rejectedItems) {
    let category: RejectionAnalysis['category'] = 'legitimate_reject';
    let reason = '';
    let recommendation: RejectionAnalysis['recommendation'] = 'keep_rejected';

    // 1. Check if greeting (should NEVER be rejected)
    const normalizedContent = item.content.toLowerCase().trim()
      .replace(/^q\s*:\s*/i, '')
      .split(/\s*a\s*:\s*/i)[0]
      .trim();

    if (greetingPatterns.test(normalizedContent)) {
      category = 'greeting_error';
      reason = 'Greeting incorrectly rejected - should always auto-approve';
      recommendation = 'restore_to_pending';
    }
    // 2. Check semantic duplication
    else {
      try {
        const dupCheck = await deduplicationService.checkDuplicate({
          text: item.content,
          enableSemantic: true
        });

        if (dupCheck.isDuplicate && dupCheck.duplicateOf) {
          const similarity = dupCheck.duplicateOf.similarity || 1.0;
          if (similarity >= 0.95) {
            category = 'exact_duplicate';
            reason = `Exact duplicate (${(similarity * 100).toFixed(1)}%) of "${dupCheck.duplicateOf.title}"`;
            recommendation = 'keep_rejected';
          } else if (similarity >= 0.82) {
            category = 'semantic_duplicate';
            reason = `Semantic duplicate (${(similarity * 100).toFixed(1)}%) of "${dupCheck.duplicateOf.title}"`;
            recommendation = 'keep_rejected';
          }
        } else {
          // 3. Check frequency (might be useful despite low score)
          try {
            const frequency = await queryFrequencyService.getFrequency(item.content);
            
            if (frequency && frequency.effectiveCount >= 3) {
              category = 'high_freq_error';
              reason = `High frequency (${frequency.effectiveCount}x) - should auto-approve despite low score`;
              recommendation = 'restore_to_pending';
            } else {
              category = 'low_score_low_freq';
              reason = 'Low score + low frequency - legitimate rejection';
              recommendation = 'keep_rejected';
            }
          } catch (freqError) {
            // Frequency check failed, assume low freq
            category = 'low_score_low_freq';
            reason = 'Low score without duplication';
            recommendation = 'keep_rejected';
          }
        }
      } catch (error: any) {
        console.error(`Error analyzing item ${item.id}:`, error.message);
        category = 'legitimate_reject';
        reason = 'Analysis failed - assume legitimate';
        recommendation = 'keep_rejected';
      }
    }

    analysis.push({
      id: item.id,
      title: item.title,
      content: item.content.substring(0, 100) + '...',
      submittedAt: item.submittedAt,
      category,
      reason,
      recommendation,
      metadata: {
        suggestedNamespaces: item.suggestedNamespaces,
        decisionReasonCode: item.decisionReasonCode
      }
    });
  }

  // Group by category
  const grouped = {
    exact_duplicate: analysis.filter(a => a.category === 'exact_duplicate'),
    semantic_duplicate: analysis.filter(a => a.category === 'semantic_duplicate'),
    low_score_low_freq: analysis.filter(a => a.category === 'low_score_low_freq'),
    greeting_error: analysis.filter(a => a.category === 'greeting_error'),
    high_freq_error: analysis.filter(a => a.category === 'high_freq_error'),
    legitimate_reject: analysis.filter(a => a.category === 'legitimate_reject')
  };

  // Print summary
  console.log('\n📊 AUDIT SUMMARY:\n');
  console.log(`✅ Exact duplicates (keep rejected): ${grouped.exact_duplicate.length}`);
  console.log(`✅ Semantic duplicates (keep rejected): ${grouped.semantic_duplicate.length}`);
  console.log(`✅ Low score + low freq (keep rejected): ${grouped.low_score_low_freq.length}`);
  console.log(`❌ Greetings INCORRECTLY rejected (restore): ${grouped.greeting_error.length}`);
  console.log(`❌ High-frequency INCORRECTLY rejected (restore): ${grouped.high_freq_error.length}`);
  console.log(`✅ Legitimate rejects (other): ${grouped.legitimate_reject.length}`);

  const totalToRestore = grouped.greeting_error.length + grouped.high_freq_error.length;
  console.log(`\n🔧 TOTAL TO RESTORE: ${totalToRestore} items\n`);

  // Print items to restore
  if (totalToRestore > 0) {
    console.log('📋 ITEMS TO RESTORE TO PENDING:\n');
    
    [...grouped.greeting_error, ...grouped.high_freq_error].forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.category}] ${item.title}`);
      console.log(`   Reason: ${item.reason}`);
      console.log(`   ID: ${item.id}\n`);
    });

    console.log('\n💡 RESTORATION COMMAND:\n');
    console.log('Run this SQL to restore items to pending queue:\n');
    const idsToRestore = [...grouped.greeting_error, ...grouped.high_freq_error].map(i => `'${i.id}'`).join(', ');
    console.log(`UPDATE curation_queue SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL WHERE id IN (${idsToRestore});`);
  }

  // Print sample of each category
  console.log('\n\n📄 SAMPLES BY CATEGORY:\n');
  
  Object.entries(grouped).forEach(([cat, items]) => {
    if (items.length > 0) {
      console.log(`\n=== ${cat.toUpperCase()} (${items.length} total) ===`);
      items.slice(0, 3).forEach((item, idx) => {
        console.log(`\n${idx + 1}. ${item.title}`);
        console.log(`   ${item.content}`);
        console.log(`   → ${item.reason}`);
        console.log(`   → Recommendation: ${item.recommendation}`);
      });
      if (items.length > 3) {
        console.log(`\n   ... and ${items.length - 3} more`);
      }
    }
  });

  console.log('\n✅ Audit complete!\n');
}

// Run audit
auditRejectedItems()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  });
