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
  const { t } = useLanguage();
  const { toast } = useToast();

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
        title: t.admin.knowledgeBase.cascade.toasts.deleteSuccessTitle,
        description: t.admin.knowledgeBase.cascade.toasts.deleteSuccessDescTemplate
          .replace('{{datasets}}', data.affectedDatasets.toString())
          .replace('{{models}}', data.affectedModels.toString()),
      });
      onDeleted();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t.common.error,
        description: error.message || t.common.deleteError,
        variant: 'destructive',
      });
    },
  });

  const handleDelete = () => {
    // Validation
    if (!reason) {
      toast({
        title: t.admin.knowledgeBase.cascade.toasts.validationErrorTitle,
        description: t.admin.knowledgeBase.cascade.toasts.selectReasonError,
        variant: 'destructive',
      });
      return;
    }

    if (reason === 'gdpr' && !gdprReason.trim()) {
      toast({
        title: t.admin.knowledgeBase.cascade.toasts.gdprReasonRequiredTitle,
        description: t.admin.knowledgeBase.cascade.toasts.gdprReasonRequiredDesc,
        variant: 'destructive',
      });
      return;
    }

    deleteMutation.mutate();
  };

  if (!document) return null;

  const hasImpact = dependencies && (dependencies.impact.totalDatasets > 0 || dependencies.impact.totalModels > 0);
  const taintedModels = dependencies?.impact.taintedModels || 0;

  // Helper to translate status enums
  const getStatusLabel = (status: string): string => {
    const statusMap: Record<string, string> = {
      active: t.admin.knowledgeBase.cascade.status.active,
      tainted: t.admin.knowledgeBase.cascade.status.tainted,
      deleted: t.admin.knowledgeBase.cascade.status.deleted,
      pending: t.admin.knowledgeBase.cascade.status.pending,
    };
    return statusMap[status] || status;
  };

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            {t.admin.knowledgeBase.cascade.dialog.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t.admin.knowledgeBase.cascade.dialog.aboutToDelete.replace('{{title}}', document.title)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {/* Loading State */}
          {loadingDeps && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              {t.admin.knowledgeBase.cascade.dialog.analyzingImpact}
            </div>
          )}

          {/* Error State */}
          {depsError && (
            <Alert variant="destructive">
              <AlertDescription>
                {t.admin.knowledgeBase.cascade.dialog.loadError.replace('{{error}}', (depsError as Error).message)}
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
                    <strong>{t.admin.knowledgeBase.cascade.dialog.cascadeImpactLabel}</strong>{' '}
                    {t.admin.knowledgeBase.cascade.dialog.willAffectTemplate
                      .replace('{{datasets}}', dependencies.impact.totalDatasets.toString())
                      .replace('{{models}}', dependencies.impact.totalModels.toString())}
                    {taintedModels > 0 && (
                      <span className="text-destructive">
                        {' '}
                        {t.admin.knowledgeBase.cascade.dialog.modelsTaintedSuffix.replace('{{count}}', taintedModels.toString())}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <AlertDescription>
                    {t.admin.knowledgeBase.cascade.dialog.noImpact}
                  </AlertDescription>
                </Alert>
              )}

              {/* Affected Datasets */}
              {dependencies.dependencies.datasets.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    {t.admin.knowledgeBase.cascade.dialog.affectedDatasetsTitle.replace('{{count}}', dependencies.dependencies.datasets.length.toString())}
                  </Label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2">
                    {dependencies.dependencies.datasets.map((dataset) => (
                      <div
                        key={dataset.id}
                        className="flex items-center justify-between text-sm py-1"
                      >
                        <span>
                          {t.admin.knowledgeBase.cascade.dialog.datasetVersion
                            .replace('{{id}}', dataset.datasetId.toString())
                            .replace('{{version}}', dataset.versionNumber.toString())}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {getStatusLabel(dataset.status)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Affected Models */}
              {dependencies.dependencies.models.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    {t.admin.knowledgeBase.cascade.dialog.affectedModelsTitle.replace('{{count}}', dependencies.dependencies.models.length.toString())}
                  </Label>
                  <div className="space-y-1 max-h-32 overflow-y-auto border rounded-md p-2">
                    {dependencies.dependencies.models.map((model) => (
                      <div
                        key={model.id}
                        className="flex items-center justify-between text-sm py-1"
                      >
                        <span>{model.modelName}</span>
                        <Badge 
                          variant={model.status === 'tainted' ? 'destructive' : 'outline'} 
                          className="text-xs"
                        >
                          {getStatusLabel(model.status)}
                        </Badge>
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
                {t.admin.knowledgeBase.cascade.dialog.deletionReasonLabel} <span className="text-destructive">{t.admin.knowledgeBase.cascade.dialog.deletionReasonRequired}</span>
              </Label>
              <Select value={reason} onValueChange={(v) => setReason(v as CascadeDeletePayload['reason'])}>
                <SelectTrigger id="deletion-reason" data-testid="select-deletion-reason">
                  <SelectValue placeholder={t.admin.knowledgeBase.cascade.dialog.selectReasonPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quality">{t.admin.knowledgeBase.cascade.dialog.reasonQuality}</SelectItem>
                  <SelectItem value="duplicate">{t.admin.knowledgeBase.cascade.dialog.reasonDuplicate}</SelectItem>
                  <SelectItem value="expired">{t.admin.knowledgeBase.cascade.dialog.reasonExpired}</SelectItem>
                  <SelectItem value="request">{t.admin.knowledgeBase.cascade.dialog.reasonRequest}</SelectItem>
                  <SelectItem value="gdpr">{t.admin.knowledgeBase.cascade.dialog.reasonGdpr}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reason === 'gdpr' && (
              <div>
                <Label htmlFor="gdpr-reason">
                  {t.admin.knowledgeBase.cascade.dialog.gdprReasonLabel} <span className="text-destructive">{t.admin.knowledgeBase.cascade.dialog.gdprReasonRequired}</span>
                </Label>
                <Textarea
                  id="gdpr-reason"
                  data-testid="input-gdpr-reason"
                  placeholder={t.admin.knowledgeBase.cascade.dialog.gdprReasonPlaceholder}
                  value={gdprReason}
                  onChange={(e) => setGdprReason(e.target.value)}
                  rows={2}
                />
              </div>
            )}

            <div>
              <Label htmlFor="retention-days">
                {t.admin.knowledgeBase.cascade.dialog.retentionDaysLabel}
              </Label>
              <Input
                id="retention-days"
                data-testid="input-retention-days"
                type="number"
                placeholder={t.admin.knowledgeBase.cascade.dialog.retentionPlaceholder}
                value={retentionDays ?? ''}
                onChange={(e) => setRetentionDays(e.target.value ? parseInt(e.target.value) : undefined)}
                min={1}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t.admin.knowledgeBase.cascade.dialog.retentionHint}
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
            {t.common.cancel}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loadingDeps || deleteMutation.isPending || !!depsError}
            data-testid="button-confirm-delete"
          >
            {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t.admin.knowledgeBase.cascade.dialog.deleteButtonLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
