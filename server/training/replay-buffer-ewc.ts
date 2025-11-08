/**
 * REPLAY BUFFER + ELASTIC WEIGHT CONSOLIDATION (EWC)
 * 
 * Implementa anti-catastrophic forgetting de nível enterprise:
 * 
 * 1. Replay Buffer com freshness decay
 * 2. Categorical sampling (diversidade de tópicos)
 * 3. Importance weighting
 * 4. EWC para preservar conhecimento crítico
 * 
 * RESEARCH BASIS:
 * - EWC: Kirkpatrick et al., 2017 (DeepMind)
 * - Experience Replay: Lin, 1992
 * - Prioritized Experience Replay: Schaul et al., 2016
 */

import { db } from "../db";
import { trainingDataCollection } from "../../shared/schema";
import { desc, sql, and, eq } from "drizzle-orm";
import type { MetaLearningConfig } from "./meta-learning-config";

export interface EWCExample {
  id: number;
  instruction: string;
  input?: string;
  output: string;
  system?: string;
  qualityScore: number;
  importance: number; // Fisher Information (EWC weight)
  freshness: number; // Time decay factor (0-1)
  category?: string; // Topic category for diversity
  conversationId: number | null;
  metadata: any;
  createdAt: Date;
}

export class ReplayBufferEWC {
  /**
   * Add example with importance weighting and freshness
   */
  async addToBuffer(
    example: {
      instruction: string;
      input?: string;
      output: string;
      system?: string;
      qualityScore: number;
      importance?: number; // Fisher Information (EWC)
      category?: string; // For categorical sampling
      conversationId?: number | null;
      metadata?: any;
    },
    config: MetaLearningConfig
  ): Promise<boolean> {
    if (!config.replayBuffer.enabled) {
      return false;
    }
    
    // Quality gate
    if (example.qualityScore < config.replayBuffer.qualityThreshold) {
      return false;
    }
    
    try {
      // Compute importance (default to quality if not provided)
      const importance = example.importance || example.qualityScore / 100;
      
      // Infer category if not provided (simple heuristic)
      const category = example.category || this.inferCategory(example.instruction);
      
      const currentSize = await this.getBufferSize();
      
      if (currentSize < config.replayBuffer.maxSize) {
        // Add directly
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
            ...(example.metadata || {}),
            replayBuffer: true,
            importance, // EWC weight
            category, // For diversity
            freshness: 1.0, // New = max freshness
            addedToBufferAt: new Date().toISOString(),
          },
        } as any);
        
        console.log(`[ReplayBufferEWC] ✅ Added to buffer (${currentSize + 1}/${config.replayBuffer.maxSize})`);
        console.log(`   • Importance: ${importance.toFixed(3)}`);
        console.log(`   • Category: ${category}`);
        return true;
      } else {
        // Buffer full → replace lowest importance example
        const worstExample = await db.query.trainingDataCollection.findFirst({
          where: and(
            eq(trainingDataCollection.status, "approved"),
            sql`${trainingDataCollection.metadata}->>'replayBuffer' = 'true'`
          ),
          orderBy: [
            // Sort by importance (ascending = worst first)
            sql`CAST(${trainingDataCollection.metadata}->>'importance' AS FLOAT)`
          ],
        });
        
        if (!worstExample || !worstExample.metadata) {
          return false;
        }
        
        const worstImportance = (worstExample.metadata as any).importance || 0;
        
        if (importance > worstImportance) {
          // Replace
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
              ...(example.metadata || {}),
              replayBuffer: true,
              importance,
              category,
              freshness: 1.0,
              addedToBufferAt: new Date().toISOString(),
            },
          } as any);
          
          console.log(`[ReplayBufferEWC] 🔄 Replaced worst example`);
          console.log(`   • Old importance: ${worstImportance.toFixed(3)}`);
          console.log(`   • New importance: ${importance.toFixed(3)}`);
          return true;
        }
      }
      
      return false;
    } catch (error: any) {
      console.error(`[ReplayBufferEWC] Error adding to buffer:`, error.message);
      return false;
    }
  }
  
  /**
   * Infer category from instruction (simple keyword matching)
   */
  private inferCategory(instruction: string): string {
    const lower = instruction.toLowerCase();
    
    if (lower.includes('code') || lower.includes('program') || lower.includes('function')) {
      return 'coding';
    } else if (lower.includes('explain') || lower.includes('what is') || lower.includes('define')) {
      return 'explanation';
    } else if (lower.includes('how to') || lower.includes('tutorial') || lower.includes('guide')) {
      return 'tutorial';
    } else if (lower.includes('help') || lower.includes('problem') || lower.includes('issue')) {
      return 'troubleshooting';
    } else if (lower.includes('create') || lower.includes('generate') || lower.includes('design')) {
      return 'creative';
    } else {
      return 'general';
    }
  }
  
  /**
   * Update freshness scores (time decay)
   * 
   * Freshness = e^(-λt) where λ is decay rate, t is age in days
   */
  async updateFreshness(decayRate: number = 0.1): Promise<void> {
    const examples = await db.query.trainingDataCollection.findMany({
      where: and(
        eq(trainingDataCollection.status, "approved"),
        sql`${trainingDataCollection.metadata}->>'replayBuffer' = 'true'`
      ),
    });
    
    const now = new Date();
    let updated = 0;
    
    for (const ex of examples) {
      if (!ex.metadata || !ex.createdAt) continue;
      
      const ageInDays = (now.getTime() - ex.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const freshness = Math.exp(-decayRate * ageInDays);
      
      const metadata = ex.metadata as any;
      metadata.freshness = freshness;
      
      await db.update(trainingDataCollection)
        .set({ metadata })
        .where(eq(trainingDataCollection.id, ex.id));
      
      updated++;
    }
    
    console.log(`[ReplayBufferEWC] 🔄 Updated freshness for ${updated} examples`);
  }
  
  /**
   * Sample examples with categorical diversity
   * 
   * Ensures replay batch has diverse topics/categories
   */
  async sampleWithDiversity(
    count: number,
    minPerCategory: number = 2
  ): Promise<EWCExample[]> {
    // Get all examples grouped by category
    const allExamples = await db.query.trainingDataCollection.findMany({
      where: and(
        eq(trainingDataCollection.status, "approved"),
        sql`${trainingDataCollection.metadata}->>'replayBuffer' = 'true'`
      ),
      orderBy: [
        // Sort by importance * freshness (composite score)
        sql`(CAST(${trainingDataCollection.metadata}->>'importance' AS FLOAT) * CAST(COALESCE(${trainingDataCollection.metadata}->>'freshness', '1.0') AS FLOAT)) DESC`
      ],
    });
    
    // Group by category
    const byCategory = new Map<string, any[]>();
    
    for (const ex of allExamples) {
      const category = (ex.metadata as any)?.category || 'general';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(ex);
    }
    
    // Sample with diversity
    const selected: any[] = [];
    const categories = Array.from(byCategory.keys());
    
    // Round-robin sampling from each category
    let categoryIdx = 0;
    while (selected.length < count && selected.length < allExamples.length) {
      const category = categories[categoryIdx % categories.length];
      const examples = byCategory.get(category)!;
      
      if (examples.length > 0) {
        // Take highest importance*freshness from this category
        const ex = examples.shift()!;
        selected.push(ex);
      }
      
      categoryIdx++;
    }
    
    console.log(`[ReplayBufferEWC] 🎯 Sampled ${selected.length} examples with diversity`);
    console.log(`   • Categories: ${Array.from(byCategory.keys()).join(', ')}`);
    
    return this.convertToEWCExamples(selected);
  }
  
  /**
   * Convert DB examples to EWC format
   */
  private convertToEWCExamples(dbExamples: any[]): EWCExample[] {
    return dbExamples.map(ex => {
      const formattedData = ex.formattedData?.[0] || {};
      const metadata = ex.metadata || {};
      
      return {
        id: ex.id,
        instruction: formattedData.instruction || '',
        input: formattedData.input,
        output: formattedData.output || '',
        system: formattedData.system,
        qualityScore: ex.autoQualityScore || 0,
        importance: metadata.importance || 0.5,
        freshness: metadata.freshness || 1.0,
        category: metadata.category,
        conversationId: ex.conversationId,
        metadata: ex.metadata,
        createdAt: ex.createdAt,
      };
    });
  }
  
  /**
   * Get buffer size
   */
  private async getBufferSize(): Promise<number> {
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM ${trainingDataCollection}
      WHERE status = 'approved'
      AND metadata->>'replayBuffer' = 'true'
    `);
    
    return (result.rows[0] as any).count || 0;
  }
  
  /**
   * Get buffer statistics
   */
  async getStats(): Promise<{
    size: number;
    avgImportance: number;
    avgFreshness: number;
    categories: Map<string, number>;
  }> {
    const examples = await db.query.trainingDataCollection.findMany({
      where: and(
        eq(trainingDataCollection.status, "approved"),
        sql`${trainingDataCollection.metadata}->>'replayBuffer' = 'true'`
      ),
    });
    
    const categories = new Map<string, number>();
    let totalImportance = 0;
    let totalFreshness = 0;
    
    for (const ex of examples) {
      const metadata = ex.metadata as any;
      if (!metadata) continue;
      
      totalImportance += metadata.importance || 0;
      totalFreshness += metadata.freshness || 1.0;
      
      const category = metadata.category || 'general';
      categories.set(category, (categories.get(category) || 0) + 1);
    }
    
    return {
      size: examples.length,
      avgImportance: examples.length > 0 ? totalImportance / examples.length : 0,
      avgFreshness: examples.length > 0 ? totalFreshness / examples.length : 0,
      categories,
    };
  }
}

// Singleton export
export const replayBufferEWC = new ReplayBufferEWC();
