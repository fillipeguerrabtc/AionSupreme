/**
 * AUTO-CURATOR ANALYSIS WORKER
 * =============================
 * 
 * Production-grade background worker que backfills missing autoAnalysis
 * para items na curation_queue que não têm análise automática.
 * 
 * PROBLEMA RESOLVIDO:
 * - 449 items (82%) sem autoAnalysis field
 * - Criados ANTES da implementação de runAutoAnalysis
 * - Ou análise falhou silenciosamente (timeout/LLM offline)
 * 
 * SOLUÇÃO:
 * - Processa batch de items pending SEM autoAnalysis
 * - Chama curatorAgentDetector.analyzeCurationItem() com timeout
 * - Salva structured analysis no DB atomicamente
 * - Telemetria para detectar failures
 * 
 * EXECUÇÃO:
 * - Rodado via scheduler a cada 10 minutos (antes de auto-curator-processor)
 * - Processa máximo 50 items por run (rate limiting)
 * - Timeout de 30s por análise (prevent stalls)
 */

import { db } from "../db";
import { curationQueue } from "@shared/schema";
import { sql, and, eq, isNull } from "drizzle-orm";
import { curatorAgentDetector } from "../curation/curator-agent";
import { logger } from "./logger-service";

// Timeout para análise individual (30s - match SLA)
const ANALYSIS_TIMEOUT_MS = 30000;

// Custom error para timeouts
export class AnalysisTimeoutError extends Error {
  public readonly duration: number;
  
  constructor(message: string, duration: number) {
    super(message);
    this.name = 'AnalysisTimeoutError';
    this.duration = duration;
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AnalysisTimeoutError);
    }
  }
}

/**
 * Wrapper com timeout para prevenir LLM stalls
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const startTime = Date.now();
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      const duration = Date.now() - startTime;
      reject(new AnalysisTimeoutError(
        `${operationName} exceeded timeout of ${timeoutMs}ms`,
        duration
      ));
    }, timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

export class AutoCuratorAnalysisWorker {
  private isRunning = false;
  
  /**
   * Processa batch de items sem autoAnalysis
   * 
   * @param maxItems - Máximo de items a processar por run (default: 50)
   * @returns Estatísticas do processamento
   */
  async processMissingAnalysis(maxItems: number = 50): Promise<{
    processed: number;
    analyzed: number;
    failed: number;
    skipped: number;
  }> {
    // Re-entrancy guard
    if (this.isRunning) {
      logger.info('[AutoCuratorAnalysis] ⚠️ Already running - skipping this cycle');
      return { processed: 0, analyzed: 0, failed: 0, skipped: 0 };
    }
    
    this.isRunning = true;
    
    try {
      logger.info('[AutoCuratorAnalysis] 🔍 Searching for items without autoAnalysis...');
      
      // Buscar items pending SEM autoAnalysis
      const itemsWithoutAnalysis = await db
        .select()
        .from(curationQueue)
        .where(
          and(
            eq(curationQueue.status, 'pending'),
            isNull(curationQueue.autoAnalysis)
          )
        )
        .limit(maxItems);
      
      if (itemsWithoutAnalysis.length === 0) {
        logger.info('[AutoCuratorAnalysis] ✅ All pending items have autoAnalysis - nothing to backfill');
        return { processed: 0, analyzed: 0, failed: 0, skipped: 0 };
      }
      
      logger.info(`[AutoCuratorAnalysis] 📊 Found ${itemsWithoutAnalysis.length} items without analysis - processing...`);
      
      let analyzed = 0;
      let failed = 0;
      let skipped = 0;
      
      // Processar cada item
      for (const item of itemsWithoutAnalysis) {
        try {
          logger.info(`[AutoCuratorAnalysis] 🤖 Analyzing item ${item.id} (${item.title})...`);
          
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
            `Analysis for item ${item.id}`
          );
          
          // Validar análise
          if (!analysis || typeof analysis !== 'object') {
            throw new Error('Curator returned invalid analysis');
          }
          
          // Formatar nota human-readable
          const autoNote = `🤖 ANÁLISE AUTOMÁTICA (Backfill):

📊 **Recomendação:** ${analysis.recommended === 'approve' ? '✅ APROVAR' : analysis.recommended === 'reject' ? '❌ REJEITAR' : '⚠️ REVISAR MANUALMENTE'}
🎯 **Score de Qualidade:** ${analysis.score}/100

📝 **Raciocínio:**
${analysis.reasoning}

${analysis.concerns && analysis.concerns.length > 0 ? `⚠️ **Preocupações:**
${analysis.concerns.map((c: string) => `- ${c}`).join('\n')}
` : ''}
---
*Análise gerada retroativamente pelo worker de backfill.*`;
          
          // Salvar autoAnalysis no DB atomicamente
          await db
            .update(curationQueue)
            .set({
              autoAnalysis: {
                score: analysis.score,
                flags: analysis.flags || [],
                suggestedNamespaces: analysis.suggestedNamespaces || [],
                reasoning: analysis.reasoning,
                recommended: analysis.recommended,
                concerns: analysis.concerns
              } as any,
              score: analysis.score, // Update legacy score field
              note: item.note ? `${item.note}\n\n---\n\n${autoNote}` : autoNote, // Append to existing note
              updatedAt: new Date(),
            })
            .where(eq(curationQueue.id, item.id));
          
          logger.info(`[AutoCuratorAnalysis] ✅ Item ${item.id}: ${analysis.recommended} (score: ${analysis.score})`);
          analyzed++;
          
        } catch (error: any) {
          if (error instanceof AnalysisTimeoutError) {
            logger.warn(`[AutoCuratorAnalysis] ⏱️ Item ${item.id}: Timeout após ${error.duration}ms - will retry later`);
          } else {
            logger.error(`[AutoCuratorAnalysis] ❌ Item ${item.id}: Analysis failed: ${error.message}`);
          }
          failed++;
          
          // Continue processando outros items (don't stop batch on single failure)
          continue;
        }
      }
      
      const results = {
        processed: itemsWithoutAnalysis.length,
        analyzed,
        failed,
        skipped
      };
      
      if (analyzed > 0) {
        logger.info(`[AutoCuratorAnalysis] 🎉 Backfill complete: ${analyzed}/${itemsWithoutAnalysis.length} items analyzed (failed: ${failed})`);
      }
      
      return results;
      
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Obtém estatísticas de coverage de análise
   */
  async getAnalysisCoverage(): Promise<{
    totalPending: number;
    withAnalysis: number;
    withoutAnalysis: number;
    coveragePercent: number;
  }> {
    try {
      // Total pending
      const [totalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(curationQueue)
        .where(eq(curationQueue.status, 'pending'));
      
      // With analysis
      const [withAnalysisCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(curationQueue)
        .where(
          and(
            eq(curationQueue.status, 'pending'),
            sql`${curationQueue.autoAnalysis} IS NOT NULL`
          )
        );
      
      const total = Number(totalCount?.count || 0);
      const withAnalysis = Number(withAnalysisCount?.count || 0);
      const withoutAnalysis = total - withAnalysis;
      const coveragePercent = total > 0 ? (withAnalysis / total) * 100 : 100;
      
      return {
        totalPending: total,
        withAnalysis,
        withoutAnalysis,
        coveragePercent
      };
      
    } catch (error: any) {
      logger.error(`[AutoCuratorAnalysis] Error getting coverage stats: ${error.message}`);
      return {
        totalPending: 0,
        withAnalysis: 0,
        withoutAnalysis: 0,
        coveragePercent: 0
      };
    }
  }
}

// Export singleton
export const autoCuratorAnalysisWorker = new AutoCuratorAnalysisWorker();
