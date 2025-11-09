/**
 * BACKUP & RECOVERY ROUTES
 * Enterprise-grade backup/restore API endpoints
 * 
 * Security: Super-admin only, rate-limited, audit logged
 */

import type { Router } from "express";
import { requireAdmin, getUserId } from "../middleware/auth";
import { backupService } from "../services/backup-service";
import { storage } from "../storage";
import { sendSuccess, sendValidationError, sendServerError, sendNotFound } from "../utils/response";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs/promises";

const upload = multer({
  dest: "/tmp/restore-uploads/",
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max backup file
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.sql.gz')) {
      cb(null, true);
    } else {
      cb(new Error('Only .sql.gz backup files are allowed'));
    }
  }
});

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const createBackupSchema = z.object({});

// Removed restoreBackupSchema - safetySnapshot always enabled for safety

const backupIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listBackupOperationsSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional().default(50),
  userId: z.string().uuid().optional(),
});

// ============================================================================
// ROUTES REGISTRATION
// ============================================================================

export function registerBackupRoutes(app: Router): void {
  console.log('[Backup Routes] Registering Backup & Recovery API routes...');

  /**
   * POST /api/admin/backup/create
   * Create a new database backup
   * 
   * Security: Super-admin only, rate-limited by BackupService (1/hour), audit logged
   * Returns: Operation ID, filename, file size
   */
  app.post(
    "/api/admin/backup/create",
    requireAdmin,
    async (req, res) => {
      try {
        const userId = getUserId(req)!;
        const ipAddress = (req.ip || req.socket.remoteAddress) as string;
        const userAgent = req.get('User-Agent');

        const result = await backupService.createBackup(userId, ipAddress, userAgent);

        if (!result.success) {
          return sendValidationError(res, result.error || 'Backup creation failed');
        }

        return sendSuccess(res, {
          operationId: result.operationId,
          fileName: result.fileName,
          fileSizeBytes: result.fileSizeBytes,
          checksum: result.checksum,
        });
      } catch (error: any) {
        console.error('[Backup Routes] Create backup error:', error);
        return sendServerError(res, error.message);
      }
    }
  );

  /**
   * POST /api/admin/backup/restore
   * Restore database from uploaded backup file
   * 
   * Security: Super-admin only, rate-limited by BackupService (1/hour), audit logged
   * Body: multipart/form-data with 'backup' file
   * Returns: Operation ID, safety snapshot ID
   */
  app.post(
    "/api/admin/backup/restore",
    requireAdmin,
    upload.single('backup'),
    async (req, res) => {
      let uploadedFilePath: string | undefined;
      
      try {
        if (!req.file) {
          return sendValidationError(res, 'No backup file uploaded');
        }

        uploadedFilePath = req.file.path;
        const userId = getUserId(req)!;
        const ipAddress = (req.ip || req.socket.remoteAddress) as string;
        const userAgent = req.get('User-Agent');

        const result = await backupService.restoreBackup(
          uploadedFilePath,
          userId,
          ipAddress,
          userAgent
        );

        if (!result.success) {
          return sendValidationError(res, result.error || 'Restore failed');
        }

        return sendSuccess(res, {
          operationId: result.operationId,
          safetySnapshotId: result.safetySnapshotId,
        });
      } catch (error: any) {
        console.error('[Backup Routes] Restore error:', error);
        return sendServerError(res, error.message);
      } finally {
        // Always cleanup uploaded file (prevent disk leak)
        if (uploadedFilePath) {
          await fs.unlink(uploadedFilePath).catch((err) => {
            console.warn('[Backup Routes] Failed to cleanup uploaded file:', err.message);
          });
        }
      }
    }
  );

  /**
   * GET /api/admin/backup/operations
   * List all backup operations (audit trail)
   * 
   * Security: Super-admin only
   * Query: limit (max 100), userId (optional filter)
   * Returns: Array of backup operations
   */
  app.get(
    "/api/admin/backup/operations",
    requireAdmin,
    async (req, res) => {
      try {
        const query = listBackupOperationsSchema.parse(req.query);
        
        const operations = await backupService.listBackupOperations(
          query.userId,
          query.limit
        );

        return sendSuccess(res, { operations });
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return sendValidationError(res, error.errors[0].message);
        }
        console.error('[Backup Routes] List operations error:', error);
        return sendServerError(res, error.message);
      }
    }
  );

  /**
   * GET /api/admin/backup/operations/:id
   * Get backup operation details by ID
   * 
   * Security: Super-admin only
   * Returns: Backup operation details
   */
  app.get(
    "/api/admin/backup/operations/:id",
    requireAdmin,
    async (req, res) => {
      try {
        const { id } = backupIdSchema.parse(req.params);
        
        const operation = await backupService.getBackupOperation(id);

        if (!operation) {
          return sendNotFound(res, 'Backup operation not found');
        }

        return sendSuccess(res, { operation });
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return sendValidationError(res, error.errors[0].message);
        }
        console.error('[Backup Routes] Get operation error:', error);
        return sendServerError(res, error.message);
      }
    }
  );

  /**
   * DELETE /api/admin/backup/operations/:id
   * Delete backup operation and its file
   * 
   * Security: Super-admin only, audit logged
   * Returns: Success message
   */
  app.delete(
    "/api/admin/backup/operations/:id",
    requireAdmin,
    async (req, res) => {
      try {
        const { id } = backupIdSchema.parse(req.params);
        
        const operation = await backupService.getBackupOperation(id);

        if (!operation) {
          return sendNotFound(res, 'Backup operation not found');
        }

        // Delete file if exists
        if (operation.storageLocation) {
          try {
            await fs.unlink(operation.storageLocation);
          } catch (error) {
            console.warn(`[Backup Routes] File already deleted or not found: ${operation.storageLocation}`);
          }
        }

        // Mark operation as cancelled (soft delete)
        await storage.updateBackupOperation(id, {
          status: 'cancelled',
          completedAt: new Date(),
        });

        return sendSuccess(res, { message: 'Backup operation deleted successfully' });
      } catch (error: any) {
        if (error.name === 'ZodError') {
          return sendValidationError(res, error.errors[0].message);
        }
        console.error('[Backup Routes] Delete operation error:', error);
        return sendServerError(res, error.message);
      }
    }
  );

  console.log('[Backup Routes] ✅ 5 Backup & Recovery routes registered successfully');
}
