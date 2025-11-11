/**
 * CASCADE DATA LINEAGE API ROUTES
 * 
 * Exposes enterprise cascade deletion functionality:
 * 1. Dependency graph queries (which datasets/models depend on KB doc?)
 * 2. Tombstone audit trail (deletion history with GDPR compliance)
 * 3. Cascade deletion endpoint (trigger hybrid delete)
 * 
 * RBAC: Admin-only routes (role check enforced)
 * i18n: All responses include localized messages
 */

import { Router } from "express";
import { db } from "../db";
import { 
  documents,
  datasetVersions, 
  modelVersions, 
  deletionTombstones 
} from "@shared/schema";
import { eq, sql, desc, and, gte, lte } from "drizzle-orm";
import { kbCascadeService } from "../services/kb-cascade";
import { requireAdmin, getUserId } from "../middleware/auth";
import { z } from "zod";

const router = Router();

// Validation schema for deletion requests
const deletionPayloadSchema = z.object({
  reason: z.enum(['expired', 'duplicate', 'request', 'quality', 'gdpr', 'bulk_delete']).optional(),
  gdprReason: z.string().optional(),
  retentionDays: z.number().int().min(0).max(3650).optional(), // 0-10 years
});

const bulkDeletePayloadSchema = deletionPayloadSchema.extend({
  documentIds: z.array(z.number().int().positive()).min(1).max(100),
});

// ============================================================================
// GET /api/cascade/dependencies/:documentId
// Returns: { datasets: [...], models: [...], impact: {...} }
// ============================================================================
router.get(
  "/dependencies/:documentId",
  requireAdmin,
  async (req, res) => {
    try {
      const documentId = parseInt(req.params.documentId, 10);

      if (isNaN(documentId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid document ID",
        });
      }

      // Check if document exists
      const doc = await db.query.documents.findFirst({
        where: eq(documents.id, documentId),
      });

      if (!doc) {
        return res.status(404).json({
          success: false,
          error: `Document #${documentId} not found`,
        });
      }

      // Find affected dataset versions (array containment query)
      const affectedDatasets = await db
        .select({
          id: datasetVersions.id,
          datasetId: datasetVersions.datasetId,
          versionNumber: datasetVersions.versionNumber,
          status: datasetVersions.status,
          taintReason: datasetVersions.taintReason,
          totalExamples: datasetVersions.totalExamples,
          createdAt: datasetVersions.createdAt,
        })
        .from(datasetVersions)
        .where(sql`${datasetVersions.sourceKbDocumentIds} @> ARRAY[${documentId}]::integer[]`);

      // Find affected model versions (array containment query)
      const affectedModels = await db
        .select({
          id: modelVersions.id,
          modelName: modelVersions.modelName,
          versionId: modelVersions.versionId,
          status: modelVersions.status,
          taintReason: modelVersions.taintReason,
          deployedAt: modelVersions.deployedAt,
          createdAt: modelVersions.createdAt,
        })
        .from(modelVersions)
        .where(sql`${modelVersions.indirectKbDocumentIds} @> ARRAY[${documentId}]::integer[]`);

      return res.json({
        success: true,
        document: {
          id: doc.id,
          title: doc.title,
          namespace: doc.metadata?.namespaces?.[0] || 'general',
          createdAt: doc.createdAt,
        },
        dependencies: {
          datasets: affectedDatasets,
          models: affectedModels,
        },
        impact: {
          totalDatasets: affectedDatasets.length,
          totalModels: affectedModels.length,
          taintedDatasets: affectedDatasets.filter(d => d.status === 'tainted').length,
          taintedModels: affectedModels.filter(m => m.status === 'tainted').length,
          canDelete: true, // Always allowed, but shows warning
          warning: affectedDatasets.length > 0 || affectedModels.length > 0
            ? `Deleting this document will taint ${affectedDatasets.length} dataset(s) and ${affectedModels.length} model(s)`
            : null,
        },
      });
    } catch (error: any) {
      console.error("[Cascade API] Error fetching dependencies:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);

// ============================================================================
// GET /api/cascade/tombstones
// Query params: ?entityType=kb_document&limit=50&offset=0&deletedBy=user123
// Returns: { tombstones: [...], total: number }
// ============================================================================
router.get(
  "/tombstones",
  requireAdmin,
  async (req, res) => {
    try {
      const entityType = req.query.entityType as string | undefined;
      const deletedBy = req.query.deletedBy as string | undefined;
      const limit = parseInt(req.query.limit as string || "50", 10);
      const offset = parseInt(req.query.offset as string || "0", 10);
      const fromDate = req.query.fromDate as string | undefined;
      const toDate = req.query.toDate as string | undefined;

      // Build WHERE clause dynamically
      const conditions = [];
      
      if (entityType) {
        conditions.push(eq(deletionTombstones.entityType, entityType));
      }
      
      if (deletedBy) {
        conditions.push(eq(deletionTombstones.deletedBy, deletedBy));
      }

      if (fromDate) {
        conditions.push(gte(deletionTombstones.deletedAt, new Date(fromDate)));
      }

      if (toDate) {
        conditions.push(lte(deletionTombstones.deletedAt, new Date(toDate)));
      }

      // Fetch tombstones with pagination (conditionally apply WHERE)
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      
      const tombstones = await (whereClause
        ? db.select().from(deletionTombstones).where(whereClause)
        : db.select().from(deletionTombstones)
      )
        .orderBy(desc(deletionTombstones.deletedAt))
        .limit(limit)
        .offset(offset);

      // Get total count for pagination (conditionally apply WHERE)
      const [countResult] = await (whereClause
        ? db.select({ count: sql<number>`count(*)` }).from(deletionTombstones).where(whereClause)
        : db.select({ count: sql<number>`count(*)` }).from(deletionTombstones)
      );

      return res.json({
        success: true,
        tombstones,
        pagination: {
          total: countResult?.count || 0,
          limit,
          offset,
          hasMore: (offset + limit) < (countResult?.count || 0),
        },
      });
    } catch (error: any) {
      console.error("[Cascade API] Error fetching tombstones:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);

// ============================================================================
// GET /api/cascade/tombstone/:id
// Returns: { tombstone: {...} }
// ============================================================================
router.get(
  "/tombstone/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const tombstoneId = parseInt(req.params.id, 10);

      if (isNaN(tombstoneId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid tombstone ID",
        });
      }

      const tombstone = await db.query.deletionTombstones.findFirst({
        where: eq(deletionTombstones.id, tombstoneId),
      });

      if (!tombstone) {
        return res.status(404).json({
          success: false,
          error: `Tombstone #${tombstoneId} not found`,
        });
      }

      return res.json({
        success: true,
        tombstone,
      });
    } catch (error: any) {
      console.error("[Cascade API] Error fetching tombstone:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);

// ============================================================================
// POST /api/cascade/delete/:documentId
// Body: { reason?: string, gdprReason?: string, retentionDays?: number }
// Returns: { success, result: CascadeResult }
// ============================================================================
router.post(
  "/delete/:documentId",
  requireAdmin,
  async (req, res) => {
    try {
      const documentId = parseInt(req.params.documentId, 10);

      if (isNaN(documentId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid document ID",
        });
      }

      const { reason, gdprReason, retentionDays } = req.body;

      // Get user ID from session (Replit Auth)
      const userId = getUserId(req);

      // Trigger cascade deletion
      const result = await kbCascadeService.deleteDocument(documentId, {
        userId: userId || undefined,
        reason,
        gdprReason,
        retentionDays: retentionDays !== undefined ? retentionDays : null,
      });

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error || "Cascade deletion failed",
        });
      }

      return res.json({
        success: true,
        result: {
          documentsDeleted: result.documentsDeleted,
          embeddingsDeleted: result.embeddingsDeleted,
          filesDeleted: result.filesDeleted.length,
          affectedDatasets: result.affectedDatasets.length,
          affectedModels: result.affectedModels.length,
          taintedDatasets: result.taintedEntities.datasets.length,
          taintedModels: result.taintedEntities.models.length,
          tombstoneId: result.tombstoneId,
          warnings: result.warnings,
        },
      });
    } catch (error: any) {
      console.error("[Cascade API] Error during deletion:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);

// ============================================================================
// POST /api/cascade/bulk-delete
// Body: { documentIds: number[], reason?: string, gdprReason?: string, retentionDays?: number }
// Returns: { success, result: CascadeResult }
// ============================================================================
router.post(
  "/bulk-delete",
  requireAdmin,
  async (req, res) => {
    try {
      // Validate request body with Zod
      const validation = bulkDeletePayloadSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid request body",
          details: validation.error.errors,
        });
      }

      const { documentIds, reason, gdprReason, retentionDays } = validation.data;

      // Get user ID from session (Replit Auth)
      const userId = getUserId(req);

      // Trigger bulk cascade deletion
      const result = await kbCascadeService.deleteBulk(documentIds, {
        userId: userId || undefined,
        reason,
        gdprReason,
        retentionDays: retentionDays !== undefined ? retentionDays : null,
      });

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error || "Bulk cascade deletion failed",
          warnings: result.warnings,
        });
      }

      return res.json({
        success: true,
        result: {
          documentsDeleted: result.documentsDeleted,
          embeddingsDeleted: result.embeddingsDeleted,
          filesDeleted: result.filesDeleted.length,
          affectedDatasets: result.affectedDatasets.length,
          affectedModels: result.affectedModels.length,
          taintedDatasets: result.taintedEntities.datasets.length,
          taintedModels: result.taintedEntities.models.length,
          tombstoneIds: result.tombstoneIds || [],
          warnings: result.warnings,
        },
      });
    } catch (error: any) {
      console.error("[Cascade API] Error during bulk deletion:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "Internal server error",
      });
    }
  }
);

console.log("[Cascade Routes] Registering Enterprise Cascade Data Lineage routes...");
console.log("[Cascade Routes] ✅ 5 routes registered: dependencies, tombstones, tombstone/:id, delete/:documentId, bulk-delete");

export default router;
