#!/usr/bin/env tsx
/**
 * server/scripts/batch-analyze-requeued.ts
 * 
 * Analisa items re-queued em batches paralelos
 * Mais eficiente que worker serial (processar 301 items restantes)
 */

import { db } from "../db";
import { curationQueue } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { curatorAgentDetector } from "../curation/curator-agent";

// Configuração
const BATCH_SIZE = 20; // Processar 20 items em paralelo
const BATCH_DELAY_MS = 5000; // 5s entre batches (rate limiting)
const ANALYSIS_TIMEOUT_MS = 45000; // 45s por análise

// Helper: timeout wrapper
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  itemId: string
): Promise<T | null> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } catch (error) {
    console.error(`   ❌ Error analyzing ${itemId}:`, error);
    return null;
  }
}

async function main() {
  console.log("\n" + "═".repeat(80));
  console.log("🤖 BATCH ANALYSIS - RE-QUEUED ITEMS");
  console.log("═".repeat(80) + "\n");
  
  let totalAnalyzed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let batchNum = 0;
  
  const startTime = Date.now();
  
  try {
    while (true) {
      // Buscar próximo batch de items SEM análise
      const items = await db
        .select()
        .from(curationQueue)
        .where(
          and(
            eq(curationQueue.status, 'pending'),
            isNull(curationQueue.autoAnalysis)
          )
        )
        .limit(BATCH_SIZE);
      
      if (items.length === 0) {
        console.log("\n✅ Todos os items já foram analisados!");
        break;
      }
      
      batchNum++;
      console.log(`\n📦 Batch ${batchNum} (${items.length} items)...`);
      
      // Processar batch em paralelo
      const promises = items.map(async (item) => {
        try {
          console.log(`   🤖 Analyzing: "${item.title.substring(0, 60)}..."`);
          
          // Chamar curator agent com timeout
          const analysis = await withTimeout(
            curatorAgentDetector.analyzeCurationItem(
              item.title,
              item.content,
              item.suggestedNamespaces || [],
              (item.tags as string[]) || [],
              item.submittedBy || undefined
            ),
            ANALYSIS_TIMEOUT_MS,
            item.id
          );
          
          if (!analysis) {
            console.error(`   ⏱️ Timeout: ${item.id}`);
            totalFailed++;
            return;
          }
          
          // Salvar autoAnalysis no DB
          await db
            .update(curationQueue)
            .set({
              autoAnalysis: {
                score: analysis.score,
                flags: analysis.flags || [],
                suggestedNamespaces: analysis.suggestedNamespaces || [],
                reasoning: analysis.reasoning,
                recommended: analysis.recommended,
                concerns: analysis.concerns || [],
              },
              updatedAt: new Date(),
            })
            .where(eq(curationQueue.id, item.id));
          
          console.log(`   ✅ Analyzed: ${item.id} (score: ${analysis.score}, recommended: ${analysis.recommended})`);
          totalAnalyzed++;
          
        } catch (error: any) {
          console.error(`   ❌ Error: ${item.id}:`, error.message);
          totalFailed++;
        }
      });
      
      // Aguardar batch completar
      await Promise.all(promises);
      
      console.log(`   ✅ Batch ${batchNum} complete (analyzed: ${totalAnalyzed}, failed: ${totalFailed})`);
      
      // Rate limiting entre batches
      if (items.length === BATCH_SIZE) {
        console.log(`   ⏳ Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log("\n" + "═".repeat(80));
    console.log("📊 FINAL RESULTS");
    console.log("═".repeat(80));
    console.log(`Batches processed: ${batchNum}`);
    console.log(`Analyzed: ${totalAnalyzed}`);
    console.log(`Failed: ${totalFailed}`);
    console.log(`Skipped: ${totalSkipped}`);
    console.log(`Duration: ${duration}s\n`);
    
    if (totalAnalyzed > 0) {
      console.log("✅ Analysis complete! Auto-curator-processor will handle auto-approval.");
      console.log("\n📋 NEXT STEPS:");
      console.log("1. Monitor logs: grep -E '(auto-curator-processor|AutoApproval)' /tmp/logs/Start_application_*.log");
      console.log("2. Check greetings approved: SELECT id, title, status FROM curation_queue WHERE title ~* '^(oi|olá|hi|hello)' LIMIT 10;");
      console.log("3. Check frequency gate: SELECT id, title, score, status FROM curation_queue WHERE score >= 10 LIMIT 10;");
    }
    
    process.exit(0);
    
  } catch (error: any) {
    console.error("\n❌ FATAL ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
