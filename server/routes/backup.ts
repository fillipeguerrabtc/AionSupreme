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
import * as fsSync from "fs";
import { reqLog, log } from "../utils/logger";

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
  log.info({ context: 'Backup Routes', module: 'routes/backup' }, 'Registering Backup & Recovery API routes...');

  /**
   * POST /api/admin/backup/create
   * Create a new database backup and stream it directly to the client
   * 
   * Security: Super-admin only, rate-limited by BackupService (1/hour), audit logged
   * Returns: Binary stream (.sql.gz file) - file is deleted after download
   */
  app.post(
    "/api/admin/backup/create",
    requireAdmin,
    async (req, res) => {
      const log = reqLog(req);
      let tempFilePath: string | undefined;
      
      try {
        const userId = getUserId(req)!;
        const ipAddress = (req.ip || req.socket.remoteAddress) as string;
        const userAgent = req.get('User-Agent');

        log.info({ userId, ipAddress, userAgent }, 'Backup creation requested');

        const result = await backupService.createBackup(userId, ipAddress, userAgent);

        if (!result.success) {
          log.warn({ userId, ipAddress, error: result.error }, 'Backup creation failed (rate limit or validation)');
          return sendValidationError(res, result.error || 'Backup creation failed');
        }

        tempFilePath = result.filePath;

        log.info({ 
          userId, 
          operationId: result.operationId, 
          fileName: result.fileName, 
          fileSizeBytes: result.fileSizeBytes 
        }, 'Backup created, streaming to client');

        // Stream the file directly to the client
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.setHeader('Content-Length', result.fileSizeBytes!.toString());

        const fileStream = fsSync.createReadStream(tempFilePath!);
        
        fileStream.on('end', async () => {
          // Delete the temporary file after streaming
          try {
            await fs.unlink(tempFilePath!);
            log.info({ fileName: result.fileName, filePath: tempFilePath }, 'Temporary backup file deleted after download');
          } catch (error: any) {
            log.error({ error: error.message, filePath: tempFilePath }, 'Failed to delete temporary backup file');
          }
        });

        fileStream.on('error', (error) => {
          log.error({ error: error.message }, 'Error streaming backup file');
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream backup file' });
          }
        });

        fileStream.pipe(res);

      } catch (error: any) {
        const userId = getUserId(req);
        reqLog(req).error({ userId, error: error.message, stack: error.stack }, 'Backup creation error');
        
        // Cleanup temp file on error
        if (tempFilePath) {
          try {
            await fs.unlink(tempFilePath);
          } catch {}
        }
        
        if (!res.headersSent) {
          return sendServerError(res, error.message);
        }
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
      const log = reqLog(req);
      let uploadedFilePath: string | undefined;
      
      try {
        if (!req.file) {
          const userId = getUserId(req);
          log.warn({ userId }, 'Restore failed: No backup file uploaded');
          return sendValidationError(res, 'No backup file uploaded');
        }

        uploadedFilePath = req.file.path;
        const userId = getUserId(req)!;
        const ipAddress = (req.ip || req.socket.remoteAddress) as string;
        const userAgent = req.get('User-Agent');

        log.info({ 
          userId, 
          ipAddress, 
          userAgent, 
          fileName: req.file.originalname,
          fileSizeBytes: req.file.size 
        }, 'Restore operation requested');

        const result = await backupService.restoreBackup(
          uploadedFilePath,
          userId,
          ipAddress,
          userAgent
        );

        if (!result.success) {
          log.warn({ userId, ipAddress, error: result.error }, 'Restore failed (validation or rate limit)');
          return sendValidationError(res, result.error || 'Restore failed');
        }

        log.info({ 
          userId, 
          operationId: result.operationId, 
          safetySnapshotId: result.safetySnapshotId 
        }, 'Database restored successfully');

        return sendSuccess(res, {
          operationId: result.operationId,
          safetySnapshotId: result.safetySnapshotId,
        });
      } catch (error: any) {
        const userId = getUserId(req);
        log.error({ userId, error: error.message, stack: error.stack }, 'Restore operation error');
        return sendServerError(res, error.message);
      } finally {
        // Always cleanup uploaded file (prevent disk leak)
        if (uploadedFilePath) {
          await fs.unlink(uploadedFilePath).catch((err) => {
            log.warn({ uploadedFilePath, error: err.message }, 'Failed to cleanup uploaded file');
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
      const log = reqLog(req);
      
      try {
        const query = listBackupOperationsSchema.parse(req.query);
        const adminUserId = getUserId(req);
        
        log.info({ adminUserId, filterUserId: query.userId, limit: query.limit }, 'Listing backup operations');
        
        const operations = await backupService.listBackupOperations(
          query.userId,
          query.limit
        );

        return sendSuccess(res, { operations });
      } catch (error: any) {
        if (error.name === 'ZodError') {
          log.warn({ error: error.errors[0].message }, 'Validation error listing operations');
          return sendValidationError(res, error.errors[0].message);
        }
        log.error({ error: error.message }, 'Error listing backup operations');
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
      const log = reqLog(req);
      
      try {
        const { id } = backupIdSchema.parse(req.params);
        const adminUserId = getUserId(req);
        
        log.info({ adminUserId, operationId: id }, 'Fetching backup operation details');
        
        const operation = await backupService.getBackupOperation(id);

        if (!operation) {
          log.warn({ adminUserId, operationId: id }, 'Backup operation not found');
          return sendNotFound(res, 'Backup operation not found');
        }

        return sendSuccess(res, { operation });
      } catch (error: any) {
        if (error.name === 'ZodError') {
          log.warn({ error: error.errors[0].message }, 'Validation error fetching operation');
          return sendValidationError(res, error.errors[0].message);
        }
        log.error({ error: error.message }, 'Error fetching backup operation');
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
      const log = reqLog(req);
      
      try {
        const { id } = backupIdSchema.parse(req.params);
        const adminUserId = getUserId(req);
        
        log.info({ adminUserId, operationId: id }, 'Delete backup operation requested');
        
        const operation = await backupService.getBackupOperation(id);

        if (!operation) {
          log.warn({ adminUserId, operationId: id }, 'Backup operation not found for deletion');
          return sendNotFound(res, 'Backup operation not found');
        }

        // Delete file if exists
        if (operation.storageLocation) {
          try {
            await fs.unlink(operation.storageLocation);
            log.info({ operationId: id, filePath: operation.storageLocation }, 'Backup file deleted');
          } catch (error: any) {
            log.warn({ operationId: id, filePath: operation.storageLocation, error: error.message }, 'File already deleted or not found');
          }
        }

        // Mark operation as cancelled (soft delete)
        await storage.updateBackupOperation(id, {
          status: 'cancelled',
          completedAt: new Date(),
        });

        log.info({ adminUserId, operationId: id }, 'Backup operation deleted successfully');

        return sendSuccess(res, { message: 'Backup operation deleted successfully' });
      } catch (error: any) {
        if (error.name === 'ZodError') {
          log.warn({ error: error.errors[0].message }, 'Validation error deleting operation');
          return sendValidationError(res, error.errors[0].message);
        }
        log.error({ error: error.message }, 'Error deleting backup operation');
        return sendServerError(res, error.message);
      }
    }
  );

  log.info({ context: 'Backup Routes', module: 'routes/backup' }, '✅ 5 Backup & Recovery routes registered successfully');
}
