/**
 * AUTO-APPROVAL CONFIGURATION ROUTES
 * Admin-only endpoints for managing automatic curation approval settings
 */

import { Router } from "express";
import { autoApprovalService } from "../services/auto-approval-service";
import { sendSuccess, sendServerError, sendValidationError } from "../utils/response";
import { requireAdmin, getUserId } from "../middleware/auth";
import { z } from "zod";

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const updateConfigSchema = z.object({
  enabled: z.boolean().optional(),
  minApprovalScore: z.number().int().min(0).max(100).optional(),
  maxRejectScore: z.number().int().min(0).max(100).optional(),
  sensitiveFlags: z.array(z.string()).optional(),
  enabledNamespaces: z.array(z.string()).optional(),
  autoRejectEnabled: z.boolean().optional(),
  requireAllQualityGates: z.boolean().optional(),
});

// ============================================================================
// GET /api/admin/auto-approval - Get current configuration
// ============================================================================
router.get("/", requireAdmin, async (req, res) => {
  try {
    const config = await autoApprovalService.getConfig();
    
    sendSuccess(res, {
      config,
      message: "Auto-approval configuration retrieved successfully",
    });
  } catch (error: any) {
    console.error("[AutoApproval API] Error fetching config:", error.message);
    sendServerError(res, error);
  }
});

// ============================================================================
// PUT /api/admin/auto-approval - Update configuration
// ============================================================================
router.put("/", requireAdmin, async (req, res) => {
  try {
    // Validate request body
    const validation = updateConfigSchema.safeParse(req.body);
    if (!validation.success) {
      return sendValidationError(res, validation.error.errors[0]?.message || "Validation failed");
    }

    const updates = validation.data;
    const userId = getUserId(req) || "unknown";

    // Validate threshold logic: maxRejectScore must be < minApprovalScore
    if (
      updates.minApprovalScore !== undefined &&
      updates.maxRejectScore !== undefined &&
      updates.maxRejectScore >= updates.minApprovalScore
    ) {
      return sendValidationError(res, "maxRejectScore must be less than minApprovalScore to create review range");
    }

    // Update configuration
    const updatedConfig = await autoApprovalService.updateConfig(updates, userId);

    sendSuccess(res, {
      config: updatedConfig,
      message: "Auto-approval configuration updated successfully",
    });
  } catch (error: any) {
    console.error("[AutoApproval API] Error updating config:", error.message);
    sendServerError(res, error);
  }
});

// ============================================================================
// POST /api/admin/auto-approval/refresh-cache - Force cache refresh
// ============================================================================
router.post("/refresh-cache", requireAdmin, async (req, res) => {
  try {
    autoApprovalService.refreshCache();
    
    sendSuccess(res, {
      message: "Auto-approval cache refreshed successfully",
    });
  } catch (error: any) {
    console.error("[AutoApproval API] Error refreshing cache:", error.message);
    sendServerError(res, error);
  }
});

// ============================================================================
// GET /api/admin/auto-approval/decision-preview - Preview decision for test scores
// ============================================================================
router.get("/decision-preview", requireAdmin, async (req, res) => {
  try {
    const { score, contentFlags, namespaces } = req.query;

    // Validate inputs
    const parsedScore = parseInt(score as string || "0");
    const parsedFlags = contentFlags ? (contentFlags as string).split(",") : [];
    const parsedNamespaces = namespaces ? (namespaces as string).split(",") : ["*"];

    if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      return sendValidationError(res, "Score must be a number between 0 and 100");
    }

    // Get decision preview
    const decision = await autoApprovalService.decide(
      parsedScore,
      parsedFlags,
      parsedNamespaces
    );

    sendSuccess(res, {
      decision,
      testInputs: {
        score: parsedScore,
        contentFlags: parsedFlags,
        namespaces: parsedNamespaces,
      },
      message: "Decision preview generated successfully",
    });
  } catch (error: any) {
    console.error("[AutoApproval API] Error generating preview:", error.message);
    sendServerError(res, error);
  }
});

export default router;
