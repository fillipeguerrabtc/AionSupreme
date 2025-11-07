/**
 * REPLAY BUFFER SERVICE - Anti-Catastrophic Forgetting
 * 
 * Mantém buffer de exemplos de ALTA QUALIDADE para mixing durante treino.
 * 
 * FUNCIONALIDADE:
 * - Armazena até N exemplos de maior qualidade
 * - Substitui exemplos de menor qualidade quando buffer cheio
 * - Fornece mix de replay + novos exemplos para treino
 * - Persiste no PostgreSQL (ZERO in-memory, production-ready)
 * 
 * RESEARCH BASIS:
 * - Replay-based continual learning (CSUR 2025)
 * - Prevents catastrophic forgetting in incremental LLM training
 * - 10-20% replay ratio = optimal balance (ACM Computing Surveys)
 */

import { db } from "../db";
import { trainingDataCollection } from "../../shared/schema";
import { desc, sql, and, eq } from "drizzle-orm";
import type { MetaLearningConfig } from "./meta-learning-config";

export interface ReplayExample {
  id: number;
  instruction: string;
  input?: string;
  output: string;
  system?: string;
  qualityScore: number;
  conversationId: number | null;
  metadata: any;
  createdAt: Date;
}

export class ReplayBufferService {
  /**
   * Add example to replay buffer (if quality sufficient)
   */
  async addToBuffer(
    example: {
      instruction: string;
      input?: string;
      output: string;
      system?: string;
      qualityScore: number;
      conversationId?: number;
      metadata?: any;
    },
    config: MetaLearningConfig
  ): Promise<boolean> {
    if (!config.replayBuffer.enabled) {
      return false;
    }
    
    // Verificar se quality score atinge threshold
    if (example.qualityScore < config.replayBuffer.qualityThreshold) {
      console.log(`[ReplayBuffer] ⚠️  Example below quality threshold (${example.qualityScore} < ${config.replayBuffer.qualityThreshold})`);
      return false;
    }
    
    try {
      // Verificar tamanho atual do buffer
      const currentSize = await this.getBufferSize();
      
      if (currentSize < config.replayBuffer.maxSize) {
        // Buffer tem espaço → adicionar diretamente
        await db.insert(trainingDataCollection).values({
          conversationId: example.conversationId || null,
          autoQualityScore: example.qualityScore,
          status: "approved", // Replay buffer = pre-approved
          formattedData: [{
            instruction: example.instruction,
            input: example.input,
            output: example.output,
            system: example.system,
          }],
          metadata: {
            ...example.metadata,
            replayBuffer: true,
            addedToBufferAt: new Date().toISOString(),
          },
        } as any);
        
        console.log(`[ReplayBuffer] ✅ Added to buffer (${currentSize + 1}/${config.replayBuffer.maxSize})`);
        return true;
      } else {
        // Buffer cheio → verificar se novo exemplo é melhor que o pior
        const worstExample = await db.query.trainingDataCollection.findFirst({
          where: and(
            eq(trainingDataCollection.status, "approved"),
            sql`${trainingDataCollection.metadata}->>'replayBuffer' = 'true'`
          ),
          orderBy: [trainingDataCollection.autoQualityScore], // ASC = pior primeiro
        });
        
        if (!worstExample || !worstExample.autoQualityScore) {
          // Nenhum exemplo no buffer (edge case)
          return false;
        }
        
        if (example.qualityScore > worstExample.autoQualityScore) {
          // Novo exemplo é melhor → substituir
          await db.delete(trainingDataCollection).where(
            eq(trainingDataCollection.id, worstExample.id)
          );
          
          await db.insert(trainingDataCollection).values({
            conversationId: example.conversationId || null,
            autoQualityScore: example.qualityScore,
            status: "approved",
            formattedData: [{
              instruction: example.instruction,
              input: example.input,
              output: example.output,
              system: example.system,
            }],
            metadata: {
              ...example.metadata,
              replayBuffer: true,
              addedToBufferAt: new Date().toISOString(),
              replacedExample: worstExample.id,
            },
          } as any);
          
          console.log(`[ReplayBuffer] 🔄 Replaced worst example (${worstExample.autoQualityScore} → ${example.qualityScore})`);
          return true;
        } else {
          console.log(`[ReplayBuffer] ⚠️  Example not better than worst in buffer (${example.qualityScore} ≤ ${worstExample.autoQualityScore})`);
          return false;
        }
      }
    } catch (error: any) {
      console.error(`[ReplayBuffer] ❌ Error adding to buffer:`, error.message);
      return false;
    }
  }
  
  /**
   * Get current buffer size
   */
  async getBufferSize(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(trainingDataCollection)
      .where(
        and(
          eq(trainingDataCollection.status, "approved"),
          sql`${trainingDataCollection.metadata}->>'replayBuffer' = 'true'`
        )
      );
    
    return Number(result[0]?.count || 0);
  }
  
  /**
   * Get replay examples for mixing with new data
   */
  async getReplayExamples(count: number): Promise<ReplayExample[]> {
    const examples = await db.query.trainingDataCollection.findMany({
      where: and(
        eq(trainingDataCollection.status, "approved"),
        sql`${trainingDataCollection.metadata}->>'replayBuffer' = 'true'`
      ),
      orderBy: [desc(trainingDataCollection.autoQualityScore)], // Melhores primeiro
      limit: count,
    });
    
    return examples
      .filter(ex => ex.formattedData && ex.formattedData.length > 0)
      .map((ex) => {
        const firstExample = ex.formattedData![0]; // Pegar primeiro exemplo do array
        return {
          id: ex.id,
          instruction: firstExample.instruction,
          input: firstExample.input,
          output: firstExample.output,
          system: firstExample.system,
          qualityScore: ex.autoQualityScore || 0,
          conversationId: ex.conversationId,
          metadata: ex.metadata,
          createdAt: ex.createdAt,
        };
      });
  }
  
  /**
   * Mix replay buffer with new training examples
   * 
   * @param newExamples - Novos exemplos para treino
   * @param config - Meta-learning configuration
   * @returns Mixed dataset (replay + new)
   */
  async mixReplayWithNew(
    newExamples: ReplayExample[],
    config: MetaLearningConfig
  ): Promise<ReplayExample[]> {
    if (!config.replayBuffer.enabled || config.replayBuffer.mixRatio === 0) {
      return newExamples;
    }
    
    // Calcular quantos exemplos de replay adicionar
    const totalSize = newExamples.length;
    const replayCount = Math.floor(totalSize * config.replayBuffer.mixRatio);
    
    if (replayCount === 0) {
      console.log(`[ReplayBuffer] ⚠️  Mix ratio too low (${config.replayBuffer.mixRatio}), no replay added`);
      return newExamples;
    }
    
    // Buscar exemplos de replay
    const replayExamples = await this.getReplayExamples(replayCount);
    
    if (replayExamples.length === 0) {
      console.log(`[ReplayBuffer] ⚠️  Buffer empty, no replay to mix`);
      return newExamples;
    }
    
    // Mix: replay + new (shuffle para evitar bias)
    const mixed = [...replayExamples, ...newExamples];
    
    // Shuffle usando Fisher-Yates
    for (let i = mixed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [mixed[i], mixed[j]] = [mixed[j], mixed[i]];
    }
    
    console.log(`[ReplayBuffer] 🔀 Mixed ${replayExamples.length} replay + ${newExamples.length} new = ${mixed.length} total`);
    console.log(`   • Replay ratio: ${((replayExamples.length / mixed.length) * 100).toFixed(1)}%`);
    console.log(`   • Avg replay quality: ${(replayExamples.reduce((sum, ex) => sum + ex.qualityScore, 0) / replayExamples.length).toFixed(1)}`);
    
    return mixed;
  }
  
  /**
   * Clear replay buffer (for testing/reset)
   */
  async clearBuffer(): Promise<void> {
    await db.delete(trainingDataCollection).where(
      sql`${trainingDataCollection.metadata}->>'replayBuffer' = 'true'`
    );
    
    console.log(`[ReplayBuffer] 🗑️  Buffer cleared`);
  }
  
  /**
   * Get buffer statistics
   */
  async getBufferStats(): Promise<{
    size: number;
    maxSize: number;
    avgQuality: number;
    minQuality: number;
    maxQuality: number;
    oldestExample: Date | null;
    newestExample: Date | null;
  }> {
    const examples = await db.query.trainingDataCollection.findMany({
      where: and(
        eq(trainingDataCollection.status, "approved"),
        sql`${trainingDataCollection.metadata}->>'replayBuffer' = 'true'`
      ),
      orderBy: [trainingDataCollection.createdAt],
    });
    
    if (examples.length === 0) {
      return {
        size: 0,
        maxSize: 100, // Default
        avgQuality: 0,
        minQuality: 0,
        maxQuality: 0,
        oldestExample: null,
        newestExample: null,
      };
    }
    
    const qualities = examples
      .map((ex) => ex.autoQualityScore || 0)
      .filter((q) => q > 0);
    
    const avgQuality = qualities.length > 0 
      ? qualities.reduce((sum, q) => sum + q, 0) / qualities.length 
      : 0;
    const minQuality = qualities.length > 0 ? Math.min(...qualities) : 0;
    const maxQuality = qualities.length > 0 ? Math.max(...qualities) : 0;
    
    return {
      size: examples.length,
      maxSize: 100, // TODO: Get from config
      avgQuality,
      minQuality,
      maxQuality,
      oldestExample: examples[0].createdAt,
      newestExample: examples[examples.length - 1].createdAt,
    };
  }
}

// Singleton export
export const replayBufferService = new ReplayBufferService();
