/**
 * CASCADE DATA LINEAGE - API Contract Types
 * 
 * Frontend <-> Backend communication contracts for enterprise cascade deletion system.
 * These types define the shape of requests/responses for cascade operations,
 * separate from database models in schema.ts.
 * 
 * @module shared/cascade-types
 * @see server/routes/cascade.ts - Backend API implementation
 * @see server/services/kb-cascade.ts - Business logic
 */

// ============================================================================
// DEPENDENCY GRAPH QUERY
// ============================================================================

/**
 * Response from GET /api/admin/cascade/dependencies/:documentId
 * Shows cascade impact analysis before deletion
 */
export type CascadeDependencyResponse = {
  success: boolean;
  document: {
    id: number;
    title: string;
    namespace: string;
    createdAt: Date;
  };
  dependencies: {
    datasets: Array<{
      id: number;
      datasetId: number;
      versionNumber: number;
      status: string;
      taintReason: string | null;
      totalExamples: number;
      createdAt: Date;
    }>;
    models: Array<{
      id: number;
      modelName: string;
      versionId: string;
      status: string;
      taintReason: string | null;
      deployedAt: Date | null;
      createdAt: Date;
    }>;
  };
  impact: {
    totalDatasets: number;
    totalModels: number;
    taintedDatasets: number;
    taintedModels: number;
    canDelete: boolean;
    warning: string | null;
  };
};

// ============================================================================
// CASCADE DELETION
// ============================================================================

/**
 * Request body for POST /api/admin/cascade/delete/:documentId
 * Metadata for deletion audit trail
 */
export type CascadeDeletePayload = {
  /** Deletion reason category */
  reason: 'expired' | 'duplicate' | 'request' | 'quality' | 'gdpr';
  
  /** Optional GDPR-specific reason (e.g., "right_to_erasure") */
  gdprReason?: string;
  
  /** Optional retention days before tombstone purge (null = keep forever) */
  retentionDays?: number;
};

/**
 * Response from POST /api/admin/cascade/delete/:documentId
 * Deletion result with cascade impact summary
 */
export type CascadeDeleteResponse = {
  success: boolean;
  deletedDocumentId: number;
  tombstoneId: number;
  affectedDatasets: number;
  affectedModels: number;
  message: string;
};

// ============================================================================
// TOMBSTONE AUDIT TRAIL
// ============================================================================

/**
 * Single tombstone record (GDPR-compliant metadata only)
 * PII fields (title, tags) are redacted
 */
export type TombstoneRecord = {
  id: number;
  documentId: number;
  namespace: string;
  deletedAt: Date;
  deletedBy: string | null;
  reason: string;
  gdprReason: string | null;
  retentionUntil: Date | null;
  fileSizeBytes: number | null;
  attachmentCount: number | null;
};

/**
 * Response from GET /api/admin/cascade/tombstones
 * Paginated deletion audit trail with filters
 */
export type TombstonesResponse = {
  success: boolean;
  tombstones: TombstoneRecord[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
};

/**
 * Response from GET /api/admin/cascade/tombstone/:id
 * Single tombstone details
 */
export type TombstoneDetailResponse = {
  success: boolean;
  tombstone: TombstoneRecord;
};
