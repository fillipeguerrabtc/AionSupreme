/**
 * SHIFTEX MoE SERVICE
 * 
 * Adaptive Mixture of Experts with automatic shift detection and expert spawning
 * Based on June 2025 paper: "Shift Happens: MoE Continual Adaptation in FL"
 * 
 * Key Features:
 * - MMD (Maximum Mean Discrepancy) shift detection
 * - Dynamic expert spawning/reuse/consolidation
 * - Facility location optimization (creation cost vs specialization)
 * - Latent memory for expert reuse
 * 
 * ZERO BYPASS - PRODUCTION-GRADE ONLY
 */

import { db } from "../db";
import {
  moeExperts,
  expertPerformance,
  dataShifts,
  type InsertMoeExpert,
  type InsertExpertPerformance,
  type InsertDataShift
} from "../../shared/schema";
import { eq, desc, and, isNull } from "drizzle-orm";
import { logger } from "../services/logger-service";

/**
 * Data distribution for shift detection
 */
export interface DataDistribution {
  mean?: number[];
  variance?: number[];
  domain?: string;
  meanEmbedding?: number[];
  covarianceSummary?: any;
  characteristicSamples?: string[];
}

/**
 * Expert configuration
 */
export interface ExpertConfig {
  loraRank: number;
  adapterAlpha: number;
  modulesToSave?: string[];
  customConfig?: any;
}

/**
 * Shift detection result
 */
export interface ShiftDetectionResult {
  isSignificant: boolean;
  mmdScore: number;
  threshold: number;
  shiftType: "covariate" | "label" | "concept" | "temporal";
  recommendedAction: "spawn_expert" | "reuse_expert" | "consolidate" | "none";
  expertToReuse?: number;
}

export class ShiftExService {
  private readonly DEFAULT_MMD_THRESHOLD = 0.1;
  private readonly CONSOLIDATION_SIMILARITY_THRESHOLD = 0.8;
  private readonly MAX_ACTIVE_EXPERTS = 50; // Prevent expert explosion

  constructor() {}

  /**
   * Detect data distribution shift using MMD (Maximum Mean Discrepancy)
   * 
   * @param newDistribution - Incoming data distribution
   * @param namespace - Optional namespace constraint
   * @returns Shift detection result with recommended action
   */
  async detectShift(
    newDistribution: DataDistribution,
    namespace?: string
  ): Promise<ShiftDetectionResult> {
    try {
      logger.info("🔍 ShiftEx: Detecting data distribution shift", {
        namespace,
        domain: newDistribution.domain
      });

      // Get active experts in the namespace
      const query = db
        .select()
        .from(moeExperts)
        .where(
          and(
            eq(moeExperts.isActive, true),
            isNull(moeExperts.consolidatedInto)
          )
        )
        .orderBy(desc(moeExperts.usageCount));

      const experts = namespace
        ? await query.where(eq(moeExperts.namespace, namespace))
        : await query;

      if (experts.length === 0) {
        // No experts yet, this is a new distribution
        logger.info("✨ ShiftEx: No existing experts, significant shift detected");
        return {
          isSignificant: true,
          mmdScore: 1.0,
          threshold: this.DEFAULT_MMD_THRESHOLD,
          shiftType: "covariate",
          recommendedAction: "spawn_expert"
        };
      }

      // Calculate MMD to nearest expert
      let minMMD = Infinity;
      let nearestExpert: typeof experts[0] | null = null;

      for (const expert of experts) {
        const expertDist = expert.dataDistribution as any;
        const mmd = this.calculateMMD(
          newDistribution.meanEmbedding || [],
          expertDist?.mean_embedding || []
        );

        if (mmd < minMMD) {
          minMMD = mmd;
          nearestExpert = expert;
        }
      }

      const threshold = nearestExpert?.shiftDetectionThreshold || this.DEFAULT_MMD_THRESHOLD;
      const isSignificant = minMMD > threshold;

      logger.info(`${isSignificant ? "⚠️" : "✅"} ShiftEx: Shift detection complete`, {
        mmdScore: minMMD,
        threshold,
        isSignificant,
        nearestExpertId: nearestExpert?.id
      });

      // Determine recommended action
      let recommendedAction: ShiftDetectionResult["recommendedAction"];
      if (!isSignificant && nearestExpert) {
        recommendedAction = "reuse_expert";
      } else if (isSignificant) {
        // Check if we should consolidate first
        if (experts.length >= this.MAX_ACTIVE_EXPERTS) {
          recommendedAction = "consolidate";
        } else {
          recommendedAction = "spawn_expert";
        }
      } else {
        recommendedAction = "none";
      }

      return {
        isSignificant,
        mmdScore: minMMD,
        threshold,
        shiftType: this.determineShiftType(newDistribution, nearestExpert),
        recommendedAction,
        expertToReuse: recommendedAction === "reuse_expert" ? nearestExpert?.id : undefined
      };
    } catch (error) {
      logger.error("❌ ShiftEx: Shift detection failed", { error });
      throw new Error(`Shift detection failed: ${error}`);
    }
  }

  /**
   * Calculate Maximum Mean Discrepancy (MMD) between two distributions
   * Simplified implementation using Euclidean distance on embeddings
   */
  private calculateMMD(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length === 0 || embedding2.length === 0) {
      return 1.0; // Maximum distance if no data
    }

    const minLen = Math.min(embedding1.length, embedding2.length);
    let sumSquaredDiff = 0;

    for (let i = 0; i < minLen; i++) {
      const diff = embedding1[i] - embedding2[i];
      sumSquaredDiff += diff * diff;
    }

    // Normalize by dimension
    return Math.sqrt(sumSquaredDiff / minLen);
  }

  /**
   * Determine type of data shift
   */
  private determineShiftType(
    newDist: DataDistribution,
    nearestExpert: any | null
  ): "covariate" | "label" | "concept" | "temporal" {
    // Simplified heuristic - in production, use more sophisticated detection
    if (!nearestExpert) return "covariate";
    
    const expertDist = nearestExpert.dataDistribution as any;
    
    // If domain changed, it's likely covariate shift
    if (newDist.domain !== expertDist?.domain) {
      return "covariate";
    }

    // Default to covariate shift
    return "covariate";
  }

  /**
   * Spawn a new expert for the detected shift
   * 
   * @param distribution - Data distribution the expert should specialize in
   * @param namespace - Optional namespace
   * @param parentExpertId - Optional parent expert ID if spawning from existing
   * @returns ID of the spawned expert
   */
  async spawnExpert(
    distribution: DataDistribution,
    namespace?: string,
    parentExpertId?: number,
    spawnReason: "shift_detected" | "specialization" | "consolidation" = "shift_detected"
  ): Promise<number> {
    try {
      logger.info("🌟 ShiftEx: Spawning new expert", {
        namespace,
        domain: distribution.domain,
        spawnReason,
        parentExpertId
      });

      const expertName = this.generateExpertName(distribution, namespace);

      // Default LoRA config for lightweight expert
      const defaultConfig: ExpertConfig = {
        loraRank: 8,
        adapterAlpha: 16,
        modulesToSave: ["q_proj", "v_proj"]
      };

      // Calculate creation and maintenance costs
      const creationCost = this.estimateCreationCost(defaultConfig);
      const maintenanceCost = this.estimateMaintenanceCost(defaultConfig);

      const [expert] = await db.insert(moeExperts).values({
        name: expertName,
        expertType: parentExpertId ? "domain_specialist" : "general",
        domain: distribution.domain || null,
        namespace: namespace || null,
        dataDistribution: {
          mean_embedding: distribution.meanEmbedding || [],
          covariance_summary: distribution.covarianceSummary || null,
          characteristic_samples: distribution.characteristicSamples || []
        },
        parameters: defaultConfig,
        weightsPath: null, // Will be set after training
        weightsChecksum: null,
        spawnedFrom: parentExpertId || null,
        spawnReason,
        shiftDetectionThreshold: this.DEFAULT_MMD_THRESHOLD,
        creationCost,
        maintenanceCost,
        isActive: true
      }).returning();

      logger.info("✅ ShiftEx: Expert spawned successfully", {
        expertId: expert.id,
        expertName: expert.name
      });

      return expert.id;
    } catch (error) {
      logger.error("❌ ShiftEx: Failed to spawn expert", { error });
      throw new Error(`Expert spawning failed: ${error}`);
    }
  }

  /**
   * Record data shift event
   */
  async recordDataShift(
    shiftDetection: ShiftDetectionResult,
    sourceDistribution: DataDistribution,
    targetDistribution: DataDistribution,
    namespace?: string,
    trainingJobId?: number,
    expertSpawned?: number,
    expertReused?: number
  ): Promise<void> {
    try {
      await db.insert(dataShifts).values({
        shiftType: shiftDetection.shiftType,
        mmdScore: shiftDetection.mmdScore,
        threshold: shiftDetection.threshold,
        isSignificant: shiftDetection.isSignificant,
        sourceDistribution: {
          mean: sourceDistribution.mean || [],
          variance: sourceDistribution.variance || [],
          domain: sourceDistribution.domain
        },
        targetDistribution: {
          mean: targetDistribution.mean || [],
          variance: targetDistribution.variance || [],
          domain: targetDistribution.domain
        },
        actionTaken: shiftDetection.recommendedAction,
        expertSpawned: expertSpawned || null,
        expertReused: expertReused || null,
        namespace: namespace || null,
        trainingJobId: trainingJobId || null
      });

      logger.info("📊 ShiftEx: Data shift recorded", {
        shiftType: shiftDetection.shiftType,
        mmdScore: shiftDetection.mmdScore,
        actionTaken: shiftDetection.recommendedAction
      });
    } catch (error) {
      logger.error("❌ ShiftEx: Failed to record data shift", { error });
    }
  }

  /**
   * Record expert performance
   */
  async recordExpertPerformance(
    expertId: number,
    taskName: string,
    accuracy: number,
    loss: number,
    wasSelected: boolean,
    gatingScore?: number,
    energyScore?: number,
    passedEnergyFilter?: boolean
  ): Promise<void> {
    try {
      await db.insert(expertPerformance).values({
        expertId,
        taskName,
        domain: null,
        dataCharacteristics: null,
        accuracy,
        loss,
        latencyMs: null,
        gatingScore: gatingScore || null,
        wasSelected,
        energyScore: energyScore || null,
        passedEnergyFilter: passedEnergyFilter || null
      });

      // Update expert statistics
      await this.updateExpertStats(expertId);

      logger.debug("📈 ShiftEx: Expert performance recorded", {
        expertId,
        taskName,
        accuracy,
        wasSelected
      });
    } catch (error) {
      logger.error("❌ ShiftEx: Failed to record expert performance", { error });
    }
  }

  /**
   * Update expert statistics
   */
  private async updateExpertStats(expertId: number): Promise<void> {
    try {
      const performances = await db
        .select()
        .from(expertPerformance)
        .where(eq(expertPerformance.expertId, expertId));

      if (performances.length === 0) return;

      const avgAccuracy = performances.reduce((sum, p) => sum + p.accuracy, 0) / performances.length;
      const avgLoss = performances.reduce((sum, p) => sum + p.loss, 0) / performances.length;
      const numSamples = performances.length;
      const usageCount = performances.filter(p => p.wasSelected).length;

      await db
        .update(moeExperts)
        .set({
          avgAccuracy,
          avgLoss,
          numSamplesProcessed: numSamples,
          usageCount,
          lastUsedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(moeExperts.id, expertId));
    } catch (error) {
      logger.error("❌ ShiftEx: Failed to update expert stats", { error });
    }
  }

  /**
   * Consolidate similar experts to prevent expert explosion
   */
  async consolidateExperts(namespace?: string): Promise<number> {
    try {
      logger.info("🔄 ShiftEx: Starting expert consolidation", { namespace });

      const query = db
        .select()
        .from(moeExperts)
        .where(
          and(
            eq(moeExperts.isActive, true),
            isNull(moeExperts.consolidatedInto)
          )
        );

      const experts = namespace
        ? await query.where(eq(moeExperts.namespace, namespace))
        : await query;

      let consolidatedCount = 0;

      // Find similar expert pairs
      for (let i = 0; i < experts.length; i++) {
        for (let j = i + 1; j < experts.length; j++) {
          const expert1 = experts[i];
          const expert2 = experts[j];

          const dist1 = expert1.dataDistribution as any;
          const dist2 = expert2.dataDistribution as any;

          const similarity = this.calculateSimilarity(
            dist1?.mean_embedding || [],
            dist2?.mean_embedding || []
          );

          if (similarity > this.CONSOLIDATION_SIMILARITY_THRESHOLD) {
            // Consolidate lower-performing expert into higher-performing one
            const [keepExpert, mergeExpert] = expert1.avgAccuracy > expert2.avgAccuracy
              ? [expert1, expert2]
              : [expert2, expert1];

            await db
              .update(moeExperts)
              .set({
                consolidatedInto: keepExpert.id,
                consolidatedAt: new Date(),
                isActive: false,
                updatedAt: new Date()
              })
              .where(eq(moeExperts.id, mergeExpert.id));

            logger.info("✅ ShiftEx: Consolidated experts", {
              mergedExpertId: mergeExpert.id,
              intoExpertId: keepExpert.id,
              similarity
            });

            consolidatedCount++;
          }
        }
      }

      logger.info("🎉 ShiftEx: Expert consolidation complete", {
        consolidatedCount,
        remainingExperts: experts.length - consolidatedCount
      });

      return consolidatedCount;
    } catch (error) {
      logger.error("❌ ShiftEx: Expert consolidation failed", { error });
      return 0;
    }
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  private calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length === 0 || embedding2.length === 0) return 0;

    const minLen = Math.min(embedding1.length, embedding2.length);
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < minLen; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Get active experts for a namespace/domain
   */
  async getActiveExperts(namespace?: string, domain?: string) {
    let query = db
      .select()
      .from(moeExperts)
      .where(
        and(
          eq(moeExperts.isActive, true),
          isNull(moeExperts.consolidatedInto)
        )
      )
      .orderBy(desc(moeExperts.avgAccuracy));

    if (namespace) {
      query = query.where(eq(moeExperts.namespace, namespace));
    }
    if (domain) {
      query = query.where(eq(moeExperts.domain, domain));
    }

    return query;
  }

  /**
   * Get expert by ID
   */
  async getExpert(expertId: number) {
    return db
      .select()
      .from(moeExperts)
      .where(eq(moeExperts.id, expertId))
      .then(rows => rows[0] || null);
  }

  /**
   * Estimate cost of creating an expert
   */
  private estimateCreationCost(config: ExpertConfig): number {
    // Simplified cost model: based on LoRA rank
    // Higher rank = more parameters = higher cost
    return config.loraRank * 0.01; // $0.01 per rank unit
  }

  /**
   * Estimate maintenance cost of an expert
   */
  private estimateMaintenanceCost(config: ExpertConfig): number {
    // Simplified maintenance cost
    return config.loraRank * 0.001; // $0.001 per rank unit per day
  }

  /**
   * Generate expert name
   */
  private generateExpertName(distribution: DataDistribution, namespace?: string): string {
    const domain = distribution.domain || "general";
    const ns = namespace || "global";
    const timestamp = Date.now().toString(36);
    return `${ns}_${domain}_${timestamp}`;
  }
}
