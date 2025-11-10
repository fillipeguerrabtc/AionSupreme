import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { Loader2, Server } from "lucide-react";

interface GpuWorker {
  id: number;
  provider: string;
  accountId?: string;
  ngrokUrl: string;
  capabilities: {
    tor_enabled: boolean;
    model: string;
    gpu: string;
    vram_gb?: number;
    max_concurrent?: number;
    metadata?: any;
  };
  status: "healthy" | "unhealthy" | "offline" | "pending" | "online";
  lastHealthCheck?: string;
  lastHealthCheckError?: string;
  requestCount: number;
  averageLatencyMs: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

interface EditWorkerDialogProps {
  worker: GpuWorker;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditWorkerDialog({ worker, open, onOpenChange }: EditWorkerDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  
  // Form state
  const [accountId, setAccountId] = useState(worker.accountId || "");
  const [model, setModel] = useState(worker.capabilities.model || "");
  const [gpu, setGpu] = useState(worker.capabilities.gpu || "");
  const [status, setStatus] = useState(worker.status);

  // Reset form when worker changes
  useEffect(() => {
    setAccountId(worker.accountId || "");
    setModel(worker.capabilities.model || "");
    setGpu(worker.capabilities.gpu || "");
    setStatus(worker.status);
  }, [worker]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/gpu/${worker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          capabilities: {
            ...worker.capabilities,
            model,
            gpu,
          },
          status,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/status"] });
      toast({
        title: t.admin.editWorkerDialog.toasts.updateSuccess,
        description: t.admin.editWorkerDialog.toasts.updateSuccessDesc,
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: t.admin.editWorkerDialog.toasts.updateError,
        description: error.message || t.admin.editWorkerDialog.toasts.updateErrorDesc,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            {t.admin.editWorkerDialog.titleTemplate.replace('{id}', String(worker.id))}
          </DialogTitle>
          <DialogDescription>
            {t.admin.editWorkerDialog.description}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider (read-only) */}
          <div className="space-y-2">
            <Label htmlFor="provider">{t.admin.editWorkerDialog.fields.provider}</Label>
            <Input
              id="provider"
              value={worker.provider}
              disabled
              className="bg-muted"
            />
          </div>

          {/* Account ID */}
          <div className="space-y-2">
            <Label htmlFor="account-id">{t.admin.editWorkerDialog.fields.accountId}</Label>
            <Input
              id="account-id"
              placeholder={t.admin.editWorkerDialog.placeholders.accountId}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={updateMutation.isPending}
              data-testid="input-edit-account-id"
            />
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model">{t.admin.editWorkerDialog.fields.model}</Label>
            <Input
              id="model"
              placeholder={t.admin.editWorkerDialog.placeholders.model}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={updateMutation.isPending}
              data-testid="input-edit-model"
            />
          </div>

          {/* GPU Type */}
          <div className="space-y-2">
            <Label htmlFor="gpu">{t.admin.editWorkerDialog.fields.gpu}</Label>
            <Input
              id="gpu"
              placeholder={t.admin.editWorkerDialog.placeholders.gpu}
              value={gpu}
              onChange={(e) => setGpu(e.target.value)}
              disabled={updateMutation.isPending}
              data-testid="input-edit-gpu"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">{t.admin.editWorkerDialog.fields.status}</Label>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as any)}
              disabled={updateMutation.isPending}
            >
              <SelectTrigger data-testid="select-edit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="healthy">{t.admin.editWorkerDialog.statusOptions.healthy}</SelectItem>
                <SelectItem value="unhealthy">{t.admin.editWorkerDialog.statusOptions.unhealthy}</SelectItem>
                <SelectItem value="offline">{t.admin.editWorkerDialog.statusOptions.offline}</SelectItem>
                <SelectItem value="pending">{t.admin.editWorkerDialog.statusOptions.pending}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Worker Info (read-only) */}
          <div className="p-3 bg-muted rounded-md text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.admin.editWorkerDialog.infoLabels.requests}</span>
              <span className="font-medium">{worker.requestCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.admin.editWorkerDialog.infoLabels.avgLatency}</span>
              <span className="font-medium">{worker.averageLatencyMs.toFixed(0)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.admin.editWorkerDialog.infoLabels.ngrokUrl}</span>
              <span className="font-mono text-xs truncate max-w-[200px]">
                {worker.ngrokUrl}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateMutation.isPending}
            >
              {t.admin.editWorkerDialog.buttons.cancel}
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="button-save-worker"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t.admin.editWorkerDialog.buttons.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
