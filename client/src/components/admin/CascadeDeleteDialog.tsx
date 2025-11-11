import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { AlertTriangle, Database, Cpu, Loader2 } from "lucide-react";
import type {
  CascadeDependencyResponse,
  CascadeDeletePayload,
  CascadeDeleteResponse,
} from "@shared/cascade-types";
import type { Document } from "@shared/schema";

interface CascadeDeleteDialogProps {
  /** Document to delete */
  document: Document | null;
  
  /** Whether dialog is open */
  open: boolean;
  
  /** Callback to close dialog */
  onClose: () => void;
  
  /** Callback after successful deletion */
  onDeleted: () => void;
}

/**
 * CASCADE DELETE DIALOG - Enterprise deletion with impact preview
 * 
 * Features:
 * - Fetches dependency graph before deletion
 * - Shows cascade impact (datasets/models affected)
 * - Collects deletion metadata (reason, GDPR reason, retention)
 * - Validates required fields
 * - Calls cascade deletion endpoint
 * 
 * @example
 * ```tsx
 * <CascadeDeleteDialog
 *   document={selectedDoc}
 *   open={showDeleteDialog}
 *   onClose={() => setShowDeleteDialog(false)}
 *   onDeleted={() => queryClient.invalidateQueries('/api/admin/documents')}
 * />
 * ```
 */
export function CascadeDeleteDialog({
  document,
  open,
  onClose,
  onDeleted,
}: CascadeDeleteDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  // Form state
  const [reason, setReason] = useState<CascadeDeletePayload['reason']>('quality');
  const [gdprReason, setGdprReason] = useState('');
  const [retentionDays, setRetentionDays] = useState<number | undefined>(undefined);

  // Reset form when dialog closes or document changes
  useEffect(() => {
    if (!open) {
      setReason('quality');
      setGdprReason('');
      setRetentionDays(undefined);
    }
  }, [open, document?.id]);

  // Fetch dependency graph when dialog opens
  const {
    data: dependencies,
    isLoading: loadingDeps,
    error: depsError,
  } = useQuery<CascadeDependencyResponse>({
    queryKey: ['/api/admin/cascade/dependencies', document?.id],
    queryFn: async () => {
      if (!document?.id) throw new Error('No document ID');
      const res = await apiRequest(`/api/admin/cascade/dependencies/${document.id}`);
      return res.json();
    },
    enabled: open && !!document?.id,
    retry: 1,
  });

  // Cascade deletion mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!document?.id) throw new Error('No document ID');

      const payload: CascadeDeletePayload = {
        reason,
        gdprReason: gdprReason.trim() || undefined,
        retentionDays: retentionDays !== undefined ? retentionDays : undefined,
      };

      const res = await apiRequest(`/api/admin/cascade/delete/${document.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      return res.json() as Promise<CascadeDeleteResponse>;
    },
    onSuccess: (data) => {
      toast({
        title: t.common.removedSuccess,
        description: `${data.affectedDatasets} datasets and ${data.affectedModels} models affected`,
      });
      onDeleted();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t.common.error,
        description: error.message || 'Failed to delete document',
        variant: 'destructive',
      });
    },
  });

  const handleDelete = () => {
    // Validation
    if (!reason) {
      toast({
        title: 'Validation Error',
        description: 'Please select a deletion reason',
        variant: 'destructive',
      });
      return;
    }

    if (reason === 'gdpr' && !gdprReason.trim()) {
      toast({
        title: 'GDPR Reason Required',
        description: 'Please provide a GDPR-specific reason for deletion',
        variant: 'destructive',
      });
      return;
    }

    deleteMutation.mutate();
  };

  if (!document) return null;

  const hasImpact = dependencies && dependencies.totalAffected > 0;
  const taintedModels = dependencies?.models.filter(m => m.tainted).length || 0;

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Delete Document - Cascade Impact Analysis
          </AlertDialogTitle>
          <AlertDialogDescription>
            You are about to delete: <strong>{document.title}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Loading State */}
          {loadingDeps && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Analyzing cascade impact...
            </div>
          )}

          {/* Error State */}
          {depsError && (
            <Alert variant="destructive">
              <AlertDescription>
                Failed to load dependency graph: {(depsError as Error).message}
              </AlertDescription>
            </Alert>
          )}

          {/* Impact Summary */}
          {dependencies && !loadingDeps && (
            <>
              {hasImpact ? (
                <Alert>
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription className="ml-2">
                    <strong>Cascade Impact:</strong> This deletion will affect{' '}
                    <strong>{dependencies.datasets.length} datasets</strong> and{' '}
                    <strong>{dependencies.models.length} models</strong>
                    {taintedModels > 0 && (
                      <span className="text-destructive">
                        {' '}
                        ({taintedModels} models will be tainted)
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertDescription>
                    No cascade impact detected. This document is not used by any datasets or models.
                  </AlertDescription>
                </Alert>
              )}

              {/* Affected Datasets */}
              {dependencies.datasets.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Affected Datasets ({dependencies.datasets.length})
                  </Label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2">
                    {dependencies.datasets.map((dataset) => (
                      <div
                        key={dataset.id}
                        className="flex items-center justify-between text-sm py-1"
                      >
                        <span>{dataset.name || `Dataset #${dataset.id}`}</span>
                        <Badge variant="outline" className="text-xs">
                          {dataset.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Affected Models */}
              {dependencies.models.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    Affected Models ({dependencies.models.length})
                  </Label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2">
                    {dependencies.models.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center justify-between text-sm py-1"
                      >
                        <span>{model.algorithmName}</span>
                        {model.tainted && (
                          <Badge variant="destructive" className="text-xs">
                            Will be tainted
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Deletion Metadata Form */}
          <div className="space-y-3 pt-4 border-t">
            <div>
              <Label htmlFor="deletion-reason">
                Deletion Reason <span className="text-destructive">*</span>
              </Label>
              <Select value={reason} onValueChange={(v) => setReason(v as CascadeDeletePayload['reason'])}>
                <SelectTrigger id="deletion-reason" data-testid="select-deletion-reason">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quality">Quality Issues</SelectItem>
                  <SelectItem value="duplicate">Duplicate Content</SelectItem>
                  <SelectItem value="expired">Expired/Outdated</SelectItem>
                  <SelectItem value="request">User Request</SelectItem>
                  <SelectItem value="gdpr">GDPR Compliance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reason === 'gdpr' && (
              <div>
                <Label htmlFor="gdpr-reason">
                  GDPR Specific Reason <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="gdpr-reason"
                  data-testid="input-gdpr-reason"
                  placeholder="E.g., Right to erasure, Data minimization"
                  value={gdprReason}
                  onChange={(e) => setGdprReason(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            <div>
              <Label htmlFor="retention-days">
                Tombstone Retention (days)
              </Label>
              <Input
                id="retention-days"
                data-testid="input-retention-days"
                type="number"
                placeholder="Leave empty for permanent retention"
                value={retentionDays ?? ''}
                onChange={(e) => setRetentionDays(e.target.value ? parseInt(e.target.value) : undefined)}
                min={1}
              />
              <p className="text-xs text-muted-foreground mt-1">
                How long to keep the deletion audit trail (empty = forever)
              </p>
            </div>
          </div>
        </div>

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={deleteMutation.isPending}
            data-testid="button-cancel-delete"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loadingDeps || deleteMutation.isPending || !!depsError}
            data-testid="button-confirm-delete"
          >
            {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete Document
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
