/**
 * RETENTION POLICY SERVICE
 * 
 * Policy-driven tombstone cleanup service that:
 * 1. Evaluates retention policies per entity type/namespace
 * 2. Identifies expired tombstones (retentionUntil < now)
 * 3. Executes safe tombstone deletion with audit logging
 * 
 * POLICY EVALUATION:
 * - Matches tombstones to policies by (entityType, namespace)
 * - Falls back to wildcard policies (entityType="*")
 * - Respects explicit retentionUntil overrides
 * 
 * SAFETY:
 * - Read-only policy evaluation
 * - Transactional tombstone deletion
 * - Preserves tombstones with NULL retentionUntil (keep forever)
 * - Comprehensive structured logging
 */

import { db } from "../db";
import { retentionPolicies, deletionTombstones } from "@shared/schema";
import { lte, eq, and, isNotNull, or, sql } from "drizzle-orm";
import { logger } from "./logger-service";

export class RetentionPolicyService {
  /**
   * Find all tombstones eligible for deletion based on retention policies
   * 
   * @returns Array of tombstone IDs ready for cleanup
   */
  async findExpiredTombstones(): Promise<number[]> {
    try {
      const now = new Date();

      // Find all tombstones where retentionUntil has passed
      const expiredTombstones = await db
        .select({ id: deletionTombstones.id })
        .from(deletionTombstones)
        .where(
          and(
            isNotNull(deletionTombstones.retentionUntil),
            lte(deletionTombstones.retentionUntil, now)
          )
        );

      logger.info(`[RetentionPolicy] Found ${expiredTombstones.length} expired tombstones`, {
        count: expiredTombstones.length,
        cutoffDate: now.toISOString(),
      });

      return expiredTombstones.map(t => t.id);
    } catch (error: any) {
      logger.error('[RetentionPolicy] Error finding expired tombstones:', error);
      throw error;
    }
  }

  /**
   * Execute tombstone cleanup for expired entries
   * 
   * @param dryRun - If true, only logs what would be deleted (no actual deletion)
   * @returns Stats about cleanup operation
   */
  async cleanupExpiredTombstones(dryRun = false): Promise<{
    success: boolean;
    tombstonesDeleted: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      tombstonesDeleted: 0,
      errors: [] as string[],
    };

    try {
      const expiredIds = await this.findExpiredTombstones();

      if (expiredIds.length === 0) {
        logger.info('[RetentionPolicy] No expired tombstones to cleanup');
        result.success = true;
        return result;
      }

      if (dryRun) {
        logger.info(`[RetentionPolicy] DRY RUN: Would delete ${expiredIds.length} tombstones`, {
          tombstoneIds: expiredIds,
        });
        result.success = true;
        return result;
      }

      // Execute deletion in transaction
      await db.transaction(async (tx) => {
        // Fetch tombstone details before deletion (for audit logging)
        const tombstonesToDelete = await tx
          .select()
          .from(deletionTombstones)
          .where(
            and(
              sql`${deletionTombstones.id} = ANY(${expiredIds})`,
              isNotNull(deletionTombstones.retentionUntil),
              lte(deletionTombstones.retentionUntil, new Date())
            )
          );

        // Log each tombstone being deleted
        for (const tombstone of tombstonesToDelete) {
          logger.info('[RetentionPolicy] Deleting expired tombstone', {
            tombstoneId: tombstone.id,
            entityType: tombstone.entityType,
            entityId: tombstone.entityId,
            deletedAt: tombstone.deletedAt,
            retentionUntil: tombstone.retentionUntil,
            daysRetained: tombstone.deletedAt && tombstone.retentionUntil
              ? Math.floor((new Date(tombstone.retentionUntil).getTime() - new Date(tombstone.deletedAt).getTime()) / (1000 * 60 * 60 * 24))
              : null,
          });
        }

        // Hard delete expired tombstones
        const deleted = await tx
          .delete(deletionTombstones)
          .where(
            and(
              sql`${deletionTombstones.id} = ANY(${expiredIds})`,
              isNotNull(deletionTombstones.retentionUntil),
              lte(deletionTombstones.retentionUntil, new Date())
            )
          )
          .returning();

        result.tombstonesDeleted = deleted.length;
      });

      logger.info(`[RetentionPolicy] Cleanup completed: ${result.tombstonesDeleted} tombstones deleted`, {
        count: result.tombstonesDeleted,
      });

      result.success = true;
      return result;
    } catch (error: any) {
      logger.error('[RetentionPolicy] Error during cleanup:', error);
      result.errors.push(error.message || 'Unknown error');
      return result;
    }
  }

  /**
   * Apply retention policy to tombstones that don't have explicit retentionUntil
   * 
   * @param dryRun - If true, only logs what would be updated (no actual update)
   * @returns Stats about policy application
   */
  async applyRetentionPolicies(dryRun = false): Promise<{
    success: boolean;
    tombstonesUpdated: number;
    errors: string[];
  }> {
    const result = {
      success: false,
      tombstonesUpdated: 0,
      errors: [] as string[],
    };

    try {
      // Fetch all enabled retention policies
      const policies = await db
        .select()
        .from(retentionPolicies)
        .where(eq(retentionPolicies.enabled, true));

      if (policies.length === 0) {
        logger.info('[RetentionPolicy] No enabled policies found');
        result.success = true;
        return result;
      }

      // Find tombstones without explicit retentionUntil
      const tombstonesWithoutRetention = await db
        .select()
        .from(deletionTombstones)
        .where(sql`${deletionTombstones.retentionUntil} IS NULL`);

      if (tombstonesWithoutRetention.length === 0) {
        logger.info('[RetentionPolicy] No tombstones without retention to apply policies');
        result.success = true;
        return result;
      }

      logger.info(`[RetentionPolicy] Applying policies to ${tombstonesWithoutRetention.length} tombstones`, {
        tombstoneCount: tombstonesWithoutRetention.length,
        policyCount: policies.length,
      });

      if (dryRun) {
        logger.info('[RetentionPolicy] DRY RUN: Would apply policies (not updating DB)');
        result.success = true;
        return result;
      }

      // Apply policies to tombstones
      for (const tombstone of tombstonesWithoutRetention) {
        const tombstoneNamespace = (tombstone.entityMetadata as any)?.namespace || '*';
        
        // Find matching policy with correct precedence:
        // 1. Exact match (entityType + namespace)
        // 2. Entity-specific wildcard (entityType + namespace="*")
        // 3. Global wildcard (entityType="*" + namespace="*")
        // 4. Namespace-specific wildcard (entityType="*" + specific namespace)
        
        const exactMatch = policies.find(
          p => p.entityType === tombstone.entityType && p.namespace === tombstoneNamespace
        );

        const entityWildcard = policies.find(
          p => p.entityType === tombstone.entityType && p.namespace === '*'
        );

        const globalWildcard = policies.find(
          p => p.entityType === '*' && p.namespace === '*'
        );

        const namespaceWildcard = policies.find(
          p => p.entityType === '*' && p.namespace === tombstoneNamespace
        );

        const policy = exactMatch || entityWildcard || namespaceWildcard || globalWildcard;

        if (policy) {
          const retentionUntil = new Date(
            tombstone.deletedAt.getTime() + policy.retentionDays * 24 * 60 * 60 * 1000
          );

          await db
            .update(deletionTombstones)
            .set({ retentionUntil })
            .where(eq(deletionTombstones.id, tombstone.id));

          result.tombstonesUpdated++;

          logger.info('[RetentionPolicy] Applied policy to tombstone', {
            tombstoneId: tombstone.id,
            entityType: tombstone.entityType,
            policyId: policy.id,
            retentionDays: policy.retentionDays,
            retentionUntil: retentionUntil.toISOString(),
          });
        }
      }

      logger.info(`[RetentionPolicy] Policy application completed: ${result.tombstonesUpdated} tombstones updated`, {
        count: result.tombstonesUpdated,
      });

      result.success = true;
      return result;
    } catch (error: any) {
      logger.error('[RetentionPolicy] Error applying policies:', error);
      result.errors.push(error.message || 'Unknown error');
      return result;
    }
  }

  /**
   * Get retention policy stats for monitoring
   */
  async getStats(): Promise<{
    totalPolicies: number;
    enabledPolicies: number;
    tombstonesWithRetention: number;
    tombstonesWithoutRetention: number;
    expiredTombstones: number;
  }> {
    try {
      const [policiesCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(retentionPolicies);

      const [enabledPoliciesCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(retentionPolicies)
        .where(eq(retentionPolicies.enabled, true));

      const [tombstonesWithRetentionCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(deletionTombstones)
        .where(isNotNull(deletionTombstones.retentionUntil));

      const [tombstonesWithoutRetentionCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(deletionTombstones)
        .where(sql`${deletionTombstones.retentionUntil} IS NULL`);

      const expiredIds = await this.findExpiredTombstones();

      return {
        totalPolicies: policiesCount?.count || 0,
        enabledPolicies: enabledPoliciesCount?.count || 0,
        tombstonesWithRetention: tombstonesWithRetentionCount?.count || 0,
        tombstonesWithoutRetention: tombstonesWithoutRetentionCount?.count || 0,
        expiredTombstones: expiredIds.length,
      };
    } catch (error: any) {
      logger.error('[RetentionPolicy] Error getting stats:', error);
      throw error;
    }
  }
}

export const retentionPolicyService = new RetentionPolicyService();
