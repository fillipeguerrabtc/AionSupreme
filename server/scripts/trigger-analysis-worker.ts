#!/usr/bin/env tsx
/**
 * server/scripts/trigger-analysis-worker.ts
 * 
 * Força execução manual do auto-curator-analysis-worker
 * Útil após re-queue de items para acelerar processamento
 */

import { autoCuratorAnalysisWorker } from "../services/auto-curator-analysis-worker";

async function main() {
  console.log("\n🤖 Triggering auto-curator-analysis-worker manually...\n");
  
  try {
    const stats = await autoCuratorAnalysisWorker.processMissingAnalysis(100);
    
    console.log("\n📊 RESULTS:");
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Analyzed: ${stats.analyzed}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Skipped: ${stats.skipped}\n`);
    
    if (stats.analyzed > 0) {
      console.log("✅ Analysis complete! Items ready for auto-approval.");
    } else {
      console.log("ℹ️  No items needed analysis.");
    }
    
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
