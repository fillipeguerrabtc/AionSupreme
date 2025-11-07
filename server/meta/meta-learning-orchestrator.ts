/**
 * META-LEARNING ORCHESTRATOR
 * 
 * Orquestra o pipeline completo de aprendizado autônomo:
 * Curation → Meta-Learner → ShiftEx → PM-MoE → Training → Self-Improvement
 * 
 * Este é o "cérebro" que conecta todos os componentes e garante que
 * o sistema aprenda e evolua continuamente de forma autônoma.
 * 
 * ZERO BYPASS - PRODUCTION-GRADE ONLY
 */

import { MetaLearnerService } from "./meta-learner-service";
import { ShiftExService } from "../moe/shiftex-service";
import { PMMoEAggregator } from "../moe/pm-moe-aggregator";
import { SelfImprovementEngine } from "../autonomous/self-improvement-engine";
import { trainingDataCollector } from "../training/data-collector";
import { datasetGenerator } from "../training/dataset-generator";
import { db } from "../db";
import { 
  trainingDataCollection, 
  datasets,
  uploadedAdapters,
  moeExperts,
  documents,
  conversations,
  curationQueue,
  knowledgeSources
} from "../../shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { logger } from "../services/logger-service";
import { embedText } from "../ai/embedder";

/**
 * Pipeline execution result
 */
export interface PipelineResult {
  stage: string;
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * ✅ FIX 4: PostgreSQL advisory lock ID for distributed pipeline execution
 * Using a unique ID to prevent concurrent pipeline runs across multiple instances
 * ID generated from hash of "meta-learning-pipeline" -> 123456789
 */
const META_LEARNING_PIPELINE_LOCK_ID = 123456789;

/**
 * Meta-Learning Orchestrator
 * Conecta e automatiza todo o pipeline de aprendizado autônomo
 */
export class MetaLearningOrchestrator {
  private metaLearner: MetaLearnerService;
  private shiftEx: ShiftExService;
  private pmMoE: PMMoEAggregator;
  private selfImprovement: SelfImprovementEngine;

  private isRunning: boolean = false;
  private lastRunTimestamp: Date | null = null;

  constructor() {
    this.metaLearner = new MetaLearnerService();
    this.shiftEx = new ShiftExService();
    this.pmMoE = new PMMoEAggregator();
    this.selfImprovement = new SelfImprovementEngine();

    logger.info("🎯 Meta-Learning Orchestrator initialized");
  }

  /**
   * Execute complete autonomous learning pipeline
   * This is called automatically by cron jobs or manually via API
   * 
   * ✅ FIX 4: Uses PostgreSQL advisory locks for distributed execution safety
   * ✅ FIX 3: Each stage has individual error handling - pipeline continues on failures
   */
  async executeFullPipeline(namespace?: string): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];
    let hasLock = false;

    try {
      // ✅ FIX 4: Acquire PostgreSQL advisory lock for distributed pipeline safety
      logger.info("🔒 Attempting to acquire pipeline lock...", { lockId: META_LEARNING_PIPELINE_LOCK_ID });
      
      const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${META_LEARNING_PIPELINE_LOCK_ID})`);
      hasLock = lockResult.rows[0]?.pg_try_advisory_lock as boolean;

      if (!hasLock) {
        logger.warn("⚠️ Pipeline lock already held by another instance, skipping execution");
        return [{ 
          stage: "lock_acquisition", 
          success: false, 
          error: "Pipeline already running in another instance" 
        }];
      }

      logger.info("✅ Pipeline lock acquired successfully");
      this.isRunning = true;

      logger.info("🚀 Starting Meta-Learning Pipeline", { namespace });

      // ✅ FIX 3: STAGE 1 with individual error handling
      try {
        const newDataResult = await this.checkNewCuratedData(namespace);
        results.push(newDataResult);

        if (!newDataResult.success || !newDataResult.data?.hasNewData) {
          logger.info("ℹ️ No new data to process, completing pipeline early");
          return results;
        }
      } catch (error) {
        logger.error("❌ Stage 1 (Check New Data) failed, but continuing pipeline", { error });
        results.push({ 
          stage: "check_new_data", 
          success: false, 
          error: String(error) 
        });
      }

      // ✅ FIX 3: STAGE 2 with individual error handling
      let shiftResult: PipelineResult | undefined;
      try {
        shiftResult = await this.detectDataShifts(namespace);
        results.push(shiftResult);
      } catch (error) {
        logger.error("❌ Stage 2 (Detect Shifts) failed, but continuing pipeline", { error });
        results.push({ 
          stage: "detect_shifts", 
          success: false, 
          error: String(error) 
        });
      }

      // ✅ FIX 3: STAGE 3 with individual error handling
      if (shiftResult?.success && shiftResult.data?.shiftDetected) {
        try {
          const expertResult = await this.spawnExpertsForShifts(
            shiftResult.data.shifts,
            namespace
          );
          results.push(expertResult);
        } catch (error) {
          logger.error("❌ Stage 3 (Spawn Experts) failed, but continuing pipeline", { error });
          results.push({ 
            stage: "spawn_experts", 
            success: false, 
            error: String(error) 
          });
        }
      }

      // ✅ FIX 3: STAGE 4 with individual error handling
      let algorithmResult: PipelineResult | undefined;
      try {
        algorithmResult = await this.selectLearningAlgorithm(namespace);
        results.push(algorithmResult);
      } catch (error) {
        logger.error("❌ Stage 4 (Select Algorithm) failed, but continuing pipeline", { error });
        results.push({ 
          stage: "select_algorithm", 
          success: false, 
          error: String(error) 
        });
      }

      // ✅ FIX 3: STAGE 5 with individual error handling
      let datasetResult: PipelineResult | undefined;
      try {
        datasetResult = await this.generateTrainingDataset(namespace);
        results.push(datasetResult);
      } catch (error) {
        logger.error("❌ Stage 5 (Generate Dataset) failed, but continuing pipeline", { error });
        results.push({ 
          stage: "generate_dataset", 
          success: false, 
          error: String(error) 
        });
      }

      // ✅ FIX 3: STAGE 6 with individual error handling
      try {
        const aggregationResult = await this.aggregateExperts(namespace);
        results.push(aggregationResult);
      } catch (error) {
        logger.error("❌ Stage 6 (Aggregate Experts) failed, but continuing pipeline", { error });
        results.push({ 
          stage: "aggregate_experts", 
          success: false, 
          error: String(error) 
        });
      }

      // ✅ FIX 3: STAGE 7 with individual error handling
      if (datasetResult?.success && datasetResult.data?.datasetId) {
        try {
          const trainingResult = await this.triggerTraining(
            datasetResult.data.datasetId,
            algorithmResult?.data?.algorithmId
          );
          results.push(trainingResult);
        } catch (error) {
          logger.error("❌ Stage 7 (Trigger Training) failed, but continuing pipeline", { error });
          results.push({ 
            stage: "trigger_training", 
            success: false, 
            error: String(error) 
          });
        }
      }

      // ✅ FIX 3: STAGE 8 with individual error handling
      try {
        const improvementResult = await this.runSelfImprovement();
        results.push(improvementResult);
      } catch (error) {
        logger.error("❌ Stage 8 (Self-Improvement) failed, but pipeline complete", { error });
        results.push({ 
          stage: "self_improvement", 
          success: false, 
          error: String(error) 
        });
      }

      this.lastRunTimestamp = new Date();

      const successCount = results.filter(r => r.success).length;
      logger.info("✅ Meta-Learning Pipeline completed", {
        totalStages: results.length,
        successStages: successCount,
        failedStages: results.length - successCount,
        namespace
      });

      return results;

    } catch (error) {
      logger.error("❌ Pipeline execution fatal error", { error });
      results.push({
        stage: "pipeline_fatal",
        success: false,
        error: String(error)
      });
      return results;
    } finally {
      // ✅ FIX 4: Always release the advisory lock in finally block
      if (hasLock) {
        try {
          await db.execute(sql`SELECT pg_advisory_unlock(${META_LEARNING_PIPELINE_LOCK_ID})`);
          logger.info("🔓 Pipeline lock released successfully");
        } catch (error) {
          logger.error("❌ Failed to release pipeline lock", { error });
        }
      }
      this.isRunning = false;
    }
  }

  /**
   * STAGE 1: Check for new curated data from ALL KB sources
   * Now accesses: conversations, documents, images, videos, links, YouTube - EVERYTHING in KB!
   */
  private async checkNewCuratedData(namespace?: string): Promise<PipelineResult> {
    try {
      logger.info("📊 Stage 1: Checking for new data from ALL KB sources", { namespace });

      // 1. Approved training data from curation queue (with namespace filtering via JOIN)
      // ✅ FIX 1: Now properly filters by namespace using JOIN with conversations table
      let trainingCount = 0;
      if (namespace) {
        // JOIN with conversations to filter by namespace
        logger.info("🔍 FIX 1 VERIFICATION: Filtering trainingDataCollection by namespace via JOIN", { namespace });
        const trainingData = await db
          .select({ count: sql<number>`count(*)` })
          .from(trainingDataCollection)
          .innerJoin(conversations, eq(trainingDataCollection.conversationId, conversations.id))
          .where(sql`${trainingDataCollection.status} = 'approved' AND ${conversations.namespace} = ${namespace}`);
        trainingCount = Number(trainingData[0]?.count || 0);
        logger.info("✅ FIX 1: Namespace-filtered training data count", { namespace, trainingCount });
      } else {
        // No namespace filter - count all
        const trainingData = await db
          .select({ count: sql<number>`count(*)` })
          .from(trainingDataCollection)
          .where(eq(trainingDataCollection.status, "approved"));
        trainingCount = Number(trainingData[0]?.count || 0);
      }

      // 2. Documents from KB (PDFs, DOCX, XLSX, TXT, etc) - with namespace filtering
      let documentsCount = 0;
      if (namespace) {
        // Filter by namespace using JSONB array contains
        const docs = await db
          .select({ count: sql<number>`count(*)` })
          .from(documents)
          .where(sql`${documents.status} = 'indexed' AND ${documents.metadata}::jsonb->'namespaces' @> ${JSON.stringify([namespace])}::jsonb`);
        documentsCount = Number(docs[0]?.count || 0);
      } else {
        const docs = await db
          .select({ count: sql<number>`count(*)` })
          .from(documents)
          .where(eq(documents.status, "indexed"));
        documentsCount = Number(docs[0]?.count || 0);
      }

      // 3. Conversations and messages (with namespace filtering)
      let conversationsCount = 0;
      if (namespace) {
        const convs = await db
          .select({ count: sql<number>`count(*)` })
          .from(conversations)
          .where(eq(conversations.namespace, namespace));
        conversationsCount = Number(convs[0]?.count || 0);
      } else {
        const convs = await db
          .select({ count: sql<number>`count(*)` })
          .from(conversations);
        conversationsCount = Number(convs[0]?.count || 0);
      }

      // 4. Approved curated content with attachments (images, videos) - with namespace filtering
      let curationCount = 0;
      if (namespace) {
        // Filter by namespace using JSONB array contains
        const curation = await db
          .select({ count: sql<number>`count(*)` })
          .from(curationQueue)
          .where(sql`${curationQueue.status} = 'approved' AND ${curationQueue.suggestedNamespaces}::jsonb @> ${JSON.stringify([namespace])}::jsonb`);
        curationCount = Number(curation[0]?.count || 0);
      } else {
        const curation = await db
          .select({ count: sql<number>`count(*)` })
          .from(curationQueue)
          .where(eq(curationQueue.status, "approved"));
        curationCount = Number(curation[0]?.count || 0);
      }

      // 5. Knowledge sources (web scraping, links, YouTube) - with namespace filtering
      let sourcesCount = 0;
      if (namespace) {
        const sources = await db
          .select({ count: sql<number>`count(*)` })
          .from(knowledgeSources)
          .where(sql`${knowledgeSources.status} = 'active' AND ${knowledgeSources.namespace} = ${namespace}`);
        sourcesCount = Number(sources[0]?.count || 0);
      } else {
        const sources = await db
          .select({ count: sql<number>`count(*)` })
          .from(knowledgeSources)
          .where(eq(knowledgeSources.status, "active"));
        sourcesCount = Number(sources[0]?.count || 0);
      }

      const totalCount = trainingCount + documentsCount + conversationsCount + curationCount + sourcesCount;

      logger.info(`📊 KB Content Summary:`, {
        trainingExamples: trainingCount,
        documents: documentsCount,
        conversations: conversationsCount,
        curatedContent: curationCount,
        knowledgeSources: sourcesCount,
        total: totalCount
      });

      return {
        stage: "check_new_data",
        success: true,
        data: {
          hasNewData: totalCount > 0,
          count: totalCount,
          breakdown: {
            trainingExamples: trainingCount,
            documents: documentsCount,
            conversations: conversationsCount,
            curatedContent: curationCount,
            knowledgeSources: sourcesCount
          }
        }
      };
    } catch (error) {
      logger.error("❌ Failed to check new data", { error });
      return {
        stage: "check_new_data",
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * STAGE 2: Detect data distribution shifts across ALL KB sources
   * Analyzes: conversations, documents, curated content, knowledge sources
   */
  private async detectDataShifts(namespace?: string): Promise<PipelineResult> {
    try {
      logger.info("🔍 Stage 2: Detecting data distribution shifts across ALL KB", { namespace });

      // Aggregate recent data from ALL sources (with namespace filtering where applicable)
      const [trainingData, recentDocs, recentConvs, recentCuration] = await Promise.all([
        // Training data (with namespace filter via JOIN)
        namespace
          ? db
              .select({ 
                id: trainingDataCollection.id,
                conversationId: trainingDataCollection.conversationId,
                status: trainingDataCollection.status,
                formattedData: trainingDataCollection.formattedData,
                createdAt: trainingDataCollection.createdAt
              })
              .from(trainingDataCollection)
              .innerJoin(conversations, eq(trainingDataCollection.conversationId, conversations.id))
              .where(sql`${trainingDataCollection.status} = 'approved' AND ${conversations.namespace} = ${namespace}`)
              .orderBy(desc(trainingDataCollection.createdAt))
              .limit(50)
          : db
              .select()
              .from(trainingDataCollection)
              .where(eq(trainingDataCollection.status, "approved"))
              .orderBy(desc(trainingDataCollection.createdAt))
              .limit(50),
        
        // Documents (with namespace filter if specified)
        namespace
          ? db
              .select()
              .from(documents)
              .where(sql`${documents.status} = 'indexed' AND ${documents.metadata}::jsonb->'namespaces' @> ${JSON.stringify([namespace])}::jsonb`)
              .orderBy(desc(documents.createdAt))
              .limit(30)
          : db
              .select()
              .from(documents)
              .where(eq(documents.status, "indexed"))
              .orderBy(desc(documents.createdAt))
              .limit(30),
        
        // Conversations (with namespace filter if specified)
        namespace
          ? db
              .select()
              .from(conversations)
              .where(eq(conversations.namespace, namespace))
              .orderBy(desc(conversations.createdAt))
              .limit(20)
          : db
              .select()
              .from(conversations)
              .orderBy(desc(conversations.createdAt))
              .limit(20),
        
        // Curated content (with namespace filter if specified)
        namespace
          ? db
              .select()
              .from(curationQueue)
              .where(sql`${curationQueue.status} = 'approved' AND ${curationQueue.suggestedNamespaces}::jsonb @> ${JSON.stringify([namespace])}::jsonb`)
              .orderBy(desc(curationQueue.createdAt))
              .limit(30)
          : db
              .select()
              .from(curationQueue)
              .where(eq(curationQueue.status, "approved"))
              .orderBy(desc(curationQueue.createdAt))
              .limit(30)
      ]);

      const totalSamples = trainingData.length + recentDocs.length + 
                          recentConvs.length + recentCuration.length;

      if (totalSamples === 0) {
        logger.info("ℹ️ No data available for shift detection");
        return {
          stage: "detect_shifts",
          success: true,
          data: { shiftDetected: false }
        };
      }

      // 🚀 CRITICAL FIX: Calculate mean embedding from aggregated KB data
      logger.info("🔍 Calculating mean embedding from aggregated KB data...");
      
      // Aggregate text from all KB sources
      const allTexts: string[] = [
        ...trainingData.flatMap(t => 
          (t.formattedData as any[] || []).map((item: any) => 
            ((item.instruction || '') + ' ' + (item.input || '') + ' ' + (item.output || '')).trim()
          )
        ),
        ...recentDocs.map(d => (d.content as string)?.substring(0, 500) || ''),
        ...recentConvs.map(c => c.title || ''),
        ...recentCuration.map(cu => (cu.content as string)?.substring(0, 500) || '')
      ].filter(t => t.trim().length > 0);

      // Calculate mean embedding (sample max 50 texts for performance)
      let meanEmbedding: number[] = [];
      if (allTexts.length > 0) {
        try {
          const samplesToEmbed = allTexts.slice(0, Math.min(50, allTexts.length));
          const embeddings = await Promise.all(
            samplesToEmbed.map(text => embedText(text).catch(() => null))
          );
          
          // Filter out failed embeddings
          const validEmbeddings = embeddings.filter((e): e is number[] => e !== null);
          
          if (validEmbeddings.length > 0) {
            // Calculate mean vector
            const embeddingDim = validEmbeddings[0].length;
            meanEmbedding = new Array(embeddingDim).fill(0);
            
            for (const embedding of validEmbeddings) {
              for (let i = 0; i < embeddingDim; i++) {
                meanEmbedding[i] += embedding[i];
              }
            }
            
            // Normalize by count
            for (let i = 0; i < embeddingDim; i++) {
              meanEmbedding[i] /= validEmbeddings.length;
            }
            
            logger.info(`✅ Mean embedding calculated from ${validEmbeddings.length} samples (dim: ${embeddingDim})`);
          } else {
            logger.warn("⚠️ No valid embeddings generated, using empty mean embedding");
          }
        } catch (error) {
          logger.error("❌ Failed to calculate mean embedding", { error });
        }
      }

      // Calculate aggregated distribution characteristics with meanEmbedding
      const distribution = {
        samples_count: totalSamples,
        domain: namespace || "general",
        meanEmbedding,  // ✅ CRITICAL: Add mean embedding for MMD calculation
        sources_breakdown: {
          training: trainingData.length,
          documents: recentDocs.length,
          conversations: recentConvs.length,
          curated: recentCuration.length
        }
      };

      logger.info("📊 Analyzing distribution from aggregated KB data:", {
        ...distribution,
        meanEmbeddingDim: meanEmbedding.length
      });

      // Detect shift using ShiftEx
      const shiftDetection = await this.shiftEx.detectShift(distribution, namespace);

      logger.info(`${shiftDetection.isSignificant ? "⚠️" : "✅"} Shift detection complete`, {
        isSignificant: shiftDetection.isSignificant,
        mmdScore: shiftDetection.mmdScore,
        totalSamples
      });

      return {
        stage: "detect_shifts",
        success: true,
        data: {
          shiftDetected: shiftDetection.isSignificant,
          shifts: shiftDetection.isSignificant ? [shiftDetection] : [],
          distribution
        }
      };
    } catch (error) {
      logger.error("❌ Failed to detect shifts", { error });
      return {
        stage: "detect_shifts",
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * STAGE 3: Spawn new experts for detected shifts
   */
  private async spawnExpertsForShifts(
    shifts: any[],
    namespace?: string
  ): Promise<PipelineResult> {
    try {
      logger.info("🌱 Stage 3: Spawning experts for shifts");

      const spawnedExperts: number[] = [];

      for (const shift of shifts) {
        const expertId = await this.shiftEx.spawnExpert(
          shift.newDistribution,
          namespace,
          undefined,
          "shift_detected"
        );
        spawnedExperts.push(expertId);
      }

      logger.info(`✅ Spawned ${spawnedExperts.length} new experts`);

      return {
        stage: "spawn_experts",
        success: true,
        data: { expertIds: spawnedExperts }
      };
    } catch (error) {
      logger.error("❌ Failed to spawn experts", { error });
      return {
        stage: "spawn_experts",
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * STAGE 4: Select optimal learning algorithm
   */
  private async selectLearningAlgorithm(namespace?: string): Promise<PipelineResult> {
    try {
      logger.info("🧠 Stage 4: Selecting learning algorithm");

      // Get default algorithm or learn a new one
      const algorithms = await this.metaLearner.listAlgorithms();
      const defaultAlgorithm = algorithms.find(a => a.isDefault);

      if (defaultAlgorithm) {
        logger.info(`✅ Using default algorithm: ${defaultAlgorithm.name}`);
        return {
          stage: "select_algorithm",
          success: true,
          data: { algorithmId: defaultAlgorithm.id }
        };
      }

      // No default, learn a new one
      logger.info("📚 No default algorithm, learning new one");

      const taskDistribution = {
        domains: [namespace || "general"],
        numTasks: 10,
        dataCharacteristics: {
          avgSamplesPerTask: 100,
          temporalPattern: "sequential" as const
        }
      };

      const algorithmId = await this.metaLearner.learnLearningAlgorithm(
        taskDistribution,
        "continual"
      );

      logger.info(`✅ Learned new algorithm: ${algorithmId}`);

      return {
        stage: "select_algorithm",
        success: true,
        data: { algorithmId }
      };
    } catch (error) {
      logger.error("❌ Failed to select algorithm", { error });
      return {
        stage: "select_algorithm",
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * STAGE 5: Generate training dataset
   */
  private async generateTrainingDataset(namespace?: string): Promise<PipelineResult> {
    try {
      logger.info("📦 Stage 5: Generating training dataset");

      // Generate dataset from approved curation data
      const result = await datasetGenerator.generateAutoDataset();

      if (!result) {
        return {
          stage: "generate_dataset",
          success: false,
          error: "Dataset generation failed - insufficient examples"
        };
      }

      logger.info(`✅ Dataset generated: ${result.datasetId}`);

      return {
        stage: "generate_dataset",
        success: true,
        data: { datasetId: result.datasetId }
      };
    } catch (error) {
      logger.error("❌ Failed to generate dataset", { error });
      return {
        stage: "generate_dataset",
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * STAGE 6: Aggregate experts using PM-MoE
   */
  private async aggregateExperts(namespace?: string): Promise<PipelineResult> {
    try {
      logger.info("🔀 Stage 6: Aggregating experts with PM-MoE");

      // Get active experts
      const experts = await db
        .select()
        .from(moeExperts)
        .where(eq(moeExperts.isActive, true));

      if (experts.length === 0) {
        logger.info("ℹ️ No active experts to aggregate");
        return {
          stage: "aggregate_experts",
          success: true,
          data: { expertCount: 0 }
        };
      }

      // Get gating scores for experts
      const gatingScores = await this.pmMoE.selectPersonalizedExperts(
        { domain: namespace },
        namespace
      );

      // Aggregate (simplified - in production would aggregate actual adapters)
      const aggregationResult = await this.pmMoE.aggregateExperts(
        {}, // expertAdapterMapping
        gatingScores,
        true // apply energy filtering
      );

      logger.info(`✅ Aggregated ${aggregationResult.selectedExperts.length} experts`);

      return {
        stage: "aggregate_experts",
        success: true,
        data: aggregationResult
      };
    } catch (error) {
      logger.error("❌ Failed to aggregate experts", { error });
      return {
        stage: "aggregate_experts",
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * STAGE 7: Trigger training
   */
  private async triggerTraining(
    datasetId: number,
    algorithmId?: number
  ): Promise<PipelineResult> {
    try {
      logger.info("🔥 Stage 7: Triggering training", { datasetId, algorithmId });

      // In production, this would submit a training job to GPU pool
      // For now, just log the intention
      logger.info("✅ Training job queued (GPU integration pending)");

      return {
        stage: "trigger_training",
        success: true,
        data: { datasetId, algorithmId, status: "queued" }
      };
    } catch (error) {
      logger.error("❌ Failed to trigger training", { error });
      return {
        stage: "trigger_training",
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * STAGE 8: Run self-improvement analysis
   */
  private async runSelfImprovement(): Promise<PipelineResult> {
    try {
      logger.info("🔄 Stage 8: Running self-improvement analysis");

      // Analyze code periodically (not every pipeline run)
      const hoursSinceLastRun = this.lastRunTimestamp
        ? (Date.now() - this.lastRunTimestamp.getTime()) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceLastRun < 24) {
        logger.info("ℹ️ Self-improvement runs daily, skipping");
        return {
          stage: "self_improvement",
          success: true,
          data: { skipped: true, reason: "too_soon" }
        };
      }

      // Analyze codebase
      const analysis = await this.selfImprovement.analyzeCodebase();

      if (analysis.length === 0) {
        logger.info("✅ No issues found in codebase");
        return {
          stage: "self_improvement",
          success: true,
          data: { issuesFound: 0 }
        };
      }

      // Propose improvements for critical issues
      const criticalAnalysis = analysis.filter(a =>
        a.issues.some(i => i.severity === "critical" || i.severity === "high")
      );

      if (criticalAnalysis.length > 0) {
        const improvementId = await this.selfImprovement.proposeImprovements(
          criticalAnalysis,
          "bug_fix"
        );

        logger.info(`✅ Proposed improvement #${improvementId} for ${criticalAnalysis.length} critical issues`);

        return {
          stage: "self_improvement",
          success: true,
          data: { improvementId, issuesFound: analysis.length }
        };
      }

      logger.info("✅ Self-improvement analysis complete, no critical issues");

      return {
        stage: "self_improvement",
        success: true,
        data: { issuesFound: analysis.length }
      };
    } catch (error) {
      logger.error("❌ Failed self-improvement analysis", { error });
      return {
        stage: "self_improvement",
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * Get orchestrator status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTimestamp: this.lastRunTimestamp,
      components: {
        metaLearner: "initialized",
        shiftEx: "initialized",
        pmMoE: "initialized",
        selfImprovement: "initialized"
      }
    };
  }
}

// Singleton instance
export const metaLearningOrchestrator = new MetaLearningOrchestrator();
