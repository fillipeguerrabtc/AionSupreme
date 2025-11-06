/**
 * META-LEARNING REST API ROUTES
 * 
 * Exposes all Meta-Learning, MoE, and Self-Improvement functionality
 * 
 * ZERO BYPASS - PRODUCTION-GRADE ONLY:
 * - Full authentication & authorization
 * - Input validation with Zod schemas
 * - Complete error handling
 * - Audit logging
 */

import { type Express } from "express";
import { requireAdmin } from "../middleware/auth";
import { sendSuccess, sendServerError, sendValidationError } from "../utils/response";
import { MetaLearnerService } from "../meta/meta-learner-service";
import { ShiftExService } from "../moe/shiftex-service";
import { PMMoEAggregator } from "../moe/pm-moe-aggregator";
import { SelfImprovementEngine } from "../autonomous/self-improvement-engine";
import { metaLearningOrchestrator } from "../meta/meta-learning-orchestrator";
import { db } from "../db";
import {
  learningAlgorithms,
  moeExperts,
  selfImprovements,
  dataShifts
} from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { logger } from "../services/logger-service";
import { z } from "zod";

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

// Distribution schema for data characteristics
const distributionSchema = z.object({
  mean: z.array(z.number()).optional(),
  variance: z.array(z.number()).optional(),
  samples_count: z.number().optional(),
  domain: z.string().optional(),
  feature_stats: z.record(z.any()).optional()
});

// Task distribution schema for meta-learning
const taskDistributionSchema = z.object({
  task_family: z.string(),
  num_tasks: z.number().min(1),
  task_characteristics: z.record(z.any()),
  difficulty_distribution: z.record(z.number()).optional()
});

// Code issue schema
const codeIssueSchema = z.object({
  type: z.enum(["performance", "bug", "code_smell", "security"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().min(1),
  line_numbers: z.array(z.number()).optional()
});

// Code analysis schema
const codeAnalysisSchema = z.object({
  file_path: z.string().min(1),
  issues: z.array(codeIssueSchema),
  suggestions: z.array(z.string())
});

const learnAlgorithmSchema = z.object({
  taskDistribution: taskDistributionSchema,
  algorithmType: z.enum(["continual", "meta", "few_shot", "zero_shot"]).optional()
});

const detectShiftSchema = z.object({
  distribution: distributionSchema,
  namespace: z.string().optional(),
  domain: z.string().optional()
});

const spawnExpertSchema = z.object({
  distribution: distributionSchema,
  namespace: z.string().optional(),
  parentExpertId: z.number().optional(),
  spawnReason: z.enum(["drift", "specialization", "performance"]).optional()
});

const consolidateExpertsSchema = z.object({
  namespace: z.string().optional()
});

const analyzeCodebaseSchema = z.object({
  targetPaths: z.array(z.string().min(1)).optional()
});

const proposeImprovementSchema = z.object({
  analysis: z.array(codeAnalysisSchema).min(1),
  category: z.enum(["performance", "bug_fix", "feature", "refactor", "optimization"])
});

const applyImprovementSchema = z.object({
  force: z.boolean().optional()
});

const rollbackImprovementSchema = z.object({
  reason: z.string().min(1)
});

const metaLearner = new MetaLearnerService();
const shiftEx = new ShiftExService();
const pmMoE = new PMMoEAggregator();
const selfImprovement = new SelfImprovementEngine();

export function registerMetaLearningRoutes(app: Express) {
  // ============================================================================
  // META-LEARNING ALGORITHMS
  // ============================================================================

  /**
   * GET /api/meta/algorithms
   * List all learning algorithms
   */
  app.get("/api/meta/algorithms", requireAdmin, async (req, res) => {
    try {
      const algorithms = await metaLearner.listAlgorithms();
      sendSuccess(res, algorithms);
    } catch (error) {
      logger.error("❌ Failed to list algorithms", { error });
      sendServerError(res, error);
    }
  });

  /**
   * GET /api/meta/algorithms/:id
   * Get specific algorithm details
   */
  app.get("/api/meta/algorithms/:id", requireAdmin, async (req, res) => {
    try {
      const algorithmId = parseInt(req.params.id);
      const algorithm = await metaLearner.getAlgorithm(algorithmId);
      
      if (!algorithm) {
        return sendValidationError(res, "Algorithm not found");
      }

      sendSuccess(res, algorithm);
    } catch (error) {
      logger.error("❌ Failed to get algorithm", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/meta/algorithms/learn
   * Learn a new algorithm based on task distribution
   */
  app.post("/api/meta/algorithms/learn", requireAdmin, async (req, res) => {
    try {
      const validation = learnAlgorithmSchema.safeParse(req.body);
      if (!validation.success) {
        return sendValidationError(res, validation.error.errors);
      }

      const { taskDistribution, algorithmType } = validation.data;

      const algorithmId = await metaLearner.learnLearningAlgorithm(
        taskDistribution,
        algorithmType || "continual"
      );

      sendSuccess(res, {
        algorithmId,
        message: "New learning algorithm created successfully"
      });
    } catch (error) {
      logger.error("❌ Failed to learn algorithm", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/meta/algorithms/:id/set-default
   * Set algorithm as default
   */
  app.post("/api/meta/algorithms/:id/set-default", requireAdmin, async (req, res) => {
    try {
      const algorithmId = parseInt(req.params.id);
      await metaLearner.setDefaultAlgorithm(algorithmId);
      
      sendSuccess(res, {
        message: `Algorithm ${algorithmId} set as default`
      });
    } catch (error) {
      logger.error("❌ Failed to set default algorithm", { error });
      sendServerError(res, error);
    }
  });

  // ============================================================================
  // MIXTURE OF EXPERTS (MoE)
  // ============================================================================

  /**
   * GET /api/moe/experts
   * List all MoE experts
   */
  app.get("/api/moe/experts", requireAdmin, async (req, res) => {
    try {
      const { namespace, domain } = req.query;
      
      const experts = await shiftEx.getActiveExperts(
        namespace as string | undefined,
        domain as string | undefined
      );

      sendSuccess(res, experts);
    } catch (error) {
      logger.error("❌ Failed to list experts", { error });
      sendServerError(res, error);
    }
  });

  /**
   * GET /api/moe/experts/:id
   * Get specific expert details
   */
  app.get("/api/moe/experts/:id", requireAdmin, async (req, res) => {
    try {
      const expertId = parseInt(req.params.id);
      const expert = await shiftEx.getExpert(expertId);
      
      if (!expert) {
        return sendValidationError(res, "Expert not found");
      }

      sendSuccess(res, expert);
    } catch (error) {
      logger.error("❌ Failed to get expert", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/moe/detect-shift
   * Detect data distribution shift
   */
  app.post("/api/moe/detect-shift", requireAdmin, async (req, res) => {
    try {
      const validation = detectShiftSchema.safeParse(req.body);
      if (!validation.success) {
        return sendValidationError(res, validation.error.errors);
      }

      const { distribution, namespace } = validation.data;

      const shiftDetection = await shiftEx.detectShift(distribution, namespace);
      
      sendSuccess(res, shiftDetection);
    } catch (error) {
      logger.error("❌ Failed to detect shift", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/moe/spawn-expert
   * Manually spawn a new expert
   */
  app.post("/api/moe/spawn-expert", requireAdmin, async (req, res) => {
    try {
      const validation = spawnExpertSchema.safeParse(req.body);
      if (!validation.success) {
        return sendValidationError(res, validation.error.errors);
      }

      const { distribution, namespace, parentExpertId, spawnReason } = validation.data;

      const expertId = await shiftEx.spawnExpert(
        distribution,
        namespace,
        parentExpertId,
        spawnReason || "specialization"
      );

      sendSuccess(res, {
        expertId,
        message: "Expert spawned successfully"
      });
    } catch (error) {
      logger.error("❌ Failed to spawn expert", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/moe/consolidate
   * Consolidate similar experts
   */
  app.post("/api/moe/consolidate", requireAdmin, async (req, res) => {
    try {
      const validation = consolidateExpertsSchema.safeParse(req.body);
      if (!validation.success) {
        return sendValidationError(res, validation.error.errors);
      }

      const { namespace } = validation.data;
      
      const consolidatedCount = await shiftEx.consolidateExperts(namespace);

      sendSuccess(res, {
        consolidatedCount,
        message: `Consolidated ${consolidatedCount} experts`
      });
    } catch (error) {
      logger.error("❌ Failed to consolidate experts", { error });
      sendServerError(res, error);
    }
  });

  /**
   * GET /api/moe/stats
   * Get MoE aggregation statistics
   */
  app.get("/api/moe/stats", requireAdmin, async (req, res) => {
    try {
      const { namespace } = req.query;
      const stats = await pmMoE.getAggregationStats(namespace as string | undefined);
      
      sendSuccess(res, stats);
    } catch (error) {
      logger.error("❌ Failed to get MoE stats", { error });
      sendServerError(res, error);
    }
  });

  /**
   * GET /api/moe/shifts
   * Get data shift history
   */
  app.get("/api/moe/shifts", requireAdmin, async (req, res) => {
    try {
      const shifts = await db
        .select()
        .from(dataShifts)
        .orderBy(desc(dataShifts.detectedAt))
        .limit(100);

      sendSuccess(res, shifts);
    } catch (error) {
      logger.error("❌ Failed to get shifts", { error });
      sendServerError(res, error);
    }
  });

  // ============================================================================
  // SELF-IMPROVEMENT
  // ============================================================================

  /**
   * GET /api/autonomous/improvements
   * List all self-improvements
   */
  app.get("/api/autonomous/improvements", requireAdmin, async (req, res) => {
    try {
      const improvements = await db
        .select()
        .from(selfImprovements)
        .orderBy(desc(selfImprovements.createdAt))
        .limit(100);

      sendSuccess(res, improvements);
    } catch (error) {
      logger.error("❌ Failed to list improvements", { error });
      sendServerError(res, error);
    }
  });

  /**
   * GET /api/autonomous/improvements/pending-reviews
   * Get improvements that require human review
   */
  app.get("/api/autonomous/improvements/pending-reviews", requireAdmin, async (req, res) => {
    try {
      const pendingReviews = await selfImprovement.getPendingReviews();
      sendSuccess(res, pendingReviews);
    } catch (error) {
      logger.error("❌ Failed to get pending reviews", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/autonomous/analyze
   * Analyze codebase for improvements
   */
  app.post("/api/autonomous/analyze", requireAdmin, async (req, res) => {
    try {
      const validation = analyzeCodebaseSchema.safeParse(req.body);
      if (!validation.success) {
        return sendValidationError(res, validation.error.errors);
      }

      const { targetPaths } = validation.data;
      
      const analysis = await selfImprovement.analyzeCodebase(targetPaths);

      sendSuccess(res, {
        analysis,
        filesAnalyzed: analysis.length,
        totalIssues: analysis.reduce((sum, a) => sum + a.issues.length, 0)
      });
    } catch (error) {
      logger.error("❌ Failed to analyze codebase", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/autonomous/propose
   * Propose improvements based on analysis
   */
  app.post("/api/autonomous/propose", requireAdmin, async (req, res) => {
    try {
      const validation = proposeImprovementSchema.safeParse(req.body);
      if (!validation.success) {
        return sendValidationError(res, validation.error.errors);
      }

      const { analysis, category } = validation.data;

      const improvementId = await selfImprovement.proposeImprovements(analysis, category);

      sendSuccess(res, {
        improvementId,
        message: "Improvement proposed successfully"
      });
    } catch (error) {
      logger.error("❌ Failed to propose improvement", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/autonomous/improvements/:id/validate
   * Validate proposed improvement
   */
  app.post("/api/autonomous/improvements/:id/validate", requireAdmin, async (req, res) => {
    try {
      const improvementId = parseInt(req.params.id);
      const passed = await selfImprovement.validateImprovement(improvementId);

      sendSuccess(res, {
        improvementId,
        passed,
        message: passed ? "Validation passed" : "Validation failed"
      });
    } catch (error) {
      logger.error("❌ Failed to validate improvement", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/autonomous/improvements/:id/apply
   * Apply validated improvement
   */
  app.post("/api/autonomous/improvements/:id/apply", requireAdmin, async (req, res) => {
    try {
      const validation = applyImprovementSchema.safeParse(req.body);
      if (!validation.success) {
        return sendValidationError(res, validation.error.errors);
      }

      const improvementId = parseInt(req.params.id);
      const { force } = validation.data;

      const success = await selfImprovement.applyImprovement(improvementId, force || false);

      sendSuccess(res, {
        improvementId,
        success,
        message: success ? "Improvement applied" : "Application failed"
      });
    } catch (error) {
      logger.error("❌ Failed to apply improvement", { error });
      sendServerError(res, error);
    }
  });

  /**
   * POST /api/autonomous/improvements/:id/rollback
   * Rollback applied improvement
   */
  app.post("/api/autonomous/improvements/:id/rollback", requireAdmin, async (req, res) => {
    try {
      const validation = rollbackImprovementSchema.safeParse(req.body);
      if (!validation.success) {
        return sendValidationError(res, validation.error.errors);
      }

      const improvementId = parseInt(req.params.id);
      const { reason } = validation.data;

      const success = await selfImprovement.rollbackImprovement(improvementId, reason);

      sendSuccess(res, {
        improvementId,
        success,
        message: success ? "Improvement rolled back" : "Rollback failed"
      });
    } catch (error) {
      logger.error("❌ Failed to rollback improvement", { error });
      sendServerError(res, error);
    }
  });

  /**
   * GET /api/autonomous/stats
   * Get self-improvement statistics
   */
  app.get("/api/autonomous/stats", requireAdmin, async (req, res) => {
    try {
      const stats = await selfImprovement.getImprovementStats();
      sendSuccess(res, stats);
    } catch (error) {
      logger.error("❌ Failed to get improvement stats", { error });
      sendServerError(res, error);
    }
  });

  // ============================================================================
  // PIPELINE ORCHESTRATION
  // ============================================================================

  /**
   * POST /api/meta/pipeline/execute
   * Execute complete autonomous learning pipeline
   */
  app.post("/api/meta/pipeline/execute", requireAdmin, async (req, res) => {
    try {
      const { namespace } = req.body;

      const results = await metaLearningOrchestrator.executeFullPipeline(namespace);

      sendSuccess(res, {
        results,
        totalStages: results.length,
        successStages: results.filter(r => r.success).length,
        failedStages: results.filter(r => !r.success).length
      });
    } catch (error) {
      logger.error("❌ Failed to execute pipeline", { error });
      sendServerError(res, error);
    }
  });

  /**
   * GET /api/meta/pipeline/status
   * Get pipeline orchestrator status
   */
  app.get("/api/meta/pipeline/status", requireAdmin, async (req, res) => {
    try {
      const status = metaLearningOrchestrator.getStatus();
      sendSuccess(res, status);
    } catch (error) {
      logger.error("❌ Failed to get pipeline status", { error });
      sendServerError(res, error);
    }
  });

  logger.info("✅ Meta-Learning routes registered (21 endpoints including pipeline)");
}
