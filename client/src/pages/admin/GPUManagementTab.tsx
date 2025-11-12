import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Server, Activity, Trash2, Plus, RefreshCw, Circle, Clock, Pencil } from "lucide-react";
import { formatDateTimeInTimezone } from "@/lib/datetime";
import { AddWorkerDialog } from "@/components/admin/AddWorkerDialog";
import { EditWorkerDialog } from "@/components/admin/EditWorkerDialog";
import { useLanguage } from "@/lib/i18n";

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
    metadata?: {
      sessionStart?: string;
      sessionRuntimeHours?: number;
      maxSessionHours?: number;
      lastHeartbeat?: string;
      usedHoursThisWeek?: number;
    };
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

interface PoolStats {
  total: number;
  healthy: number;
  unhealthy: number;
  offline: number;
  totalRequests: number;
  averageLatencyMs: number;
}

export default function GPUManagementTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showAddWorkerDialog, setShowAddWorkerDialog] = useState(false);
  const [editingWorker, setEditingWorker] = useState<GpuWorker | null>(null);

  // Fetch system timezone for dynamic date formatting
  const { data: systemTimezone } = useQuery<{ timezone: string }>({
    queryKey: ["/api/admin/settings/timezone"],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/settings/timezone`);
      return res.json();
    },
  });
  const timezone = systemTimezone?.timezone || "America/Sao_Paulo";

  // Fetch GPU workers
  const { data: gpuData, isLoading } = useQuery({
    queryKey: ["/api/gpu/status"],
    refetchInterval: showAddWorkerDialog || editingWorker ? false : 30000, // Pause refetch when modal is open, otherwise refresh every 30s
  });

  const workers: GpuWorker[] = (gpuData as any)?.workers || [];
  const stats: PoolStats = {
    total: (gpuData as any)?.total || 0,
    healthy: (gpuData as any)?.healthy || 0,
    unhealthy: (gpuData as any)?.unhealthy || 0,
    offline: (gpuData as any)?.offline || 0,
    totalRequests: (gpuData as any)?.totalRequests || 0,
    averageLatencyMs: (gpuData as any)?.avgLatency || 0,
  };

  // Delete GPU worker mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/gpu/${id}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/status"] });
      toast({
        title: t.admin.gpuManagement.toast.workerRemoved,
        description: t.admin.gpuManagement.toast.workerRemovedDesc,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.admin.gpuManagement.toast.error,
        description: error.message || t.admin.gpuManagement.toast.errorRemovingWorker,
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: GpuWorker["status"]) => {
    switch (status) {
      case "healthy":
      case "online": // Treat "online" as "healthy" for display
        return (
          <Badge className="bg-green-500/20 text-green-300 border-green-500/50" data-testid={`status-healthy`}>
            <Circle className="w-2 h-2 mr-1 fill-current" />
            {status === "online" ? t.admin.gpuManagement.online : t.admin.gpuManagement.healthy}
          </Badge>
        );
      case "unhealthy":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50" data-testid={`status-unhealthy`}>
            <Circle className="w-2 h-2 mr-1 fill-current" />
            {t.admin.gpuManagement.unhealthy}
          </Badge>
        );
      case "offline":
        return (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/50" data-testid={`status-offline`}>
            <Circle className="w-2 h-2 mr-1 fill-current" />
            {t.admin.gpuManagement.offline}
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/50" data-testid={`status-pending`}>
            <Circle className="w-2 h-2 mr-1 fill-current" />
            {t.admin.gpuManagement.pending}
          </Badge>
        );
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return t.admin.gpuManagement.time.never;
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}${t.admin.gpuManagement.time.secondsAgo}`;
    if (minutes < 60) return `${minutes}${t.admin.gpuManagement.time.minutesAgo}`;
    if (hours < 24) return `${hours}${t.admin.gpuManagement.time.hoursAgo}`;
    return formatDateTimeInTimezone(dateStr, timezone, { format: 'short' });
  };

  // Countdown timer component (real-time updates)
  const TimeRemaining = ({ worker }: { worker: GpuWorker }) => {
    const [timeLeft, setTimeLeft] = useState<string>(t.admin.gpuManagement.time.na);

    useEffect(() => {
      const updateTimer = () => {
        if (worker.status === "offline" || worker.status === "pending") {
          setTimeLeft(t.admin.gpuManagement.time.na);
          return;
        }

        const metadata = worker.capabilities.metadata;
        const sessionStart = metadata?.sessionStart;
        const sessionRuntimeHours = metadata?.sessionRuntimeHours || 0;
        const maxSessionHours = metadata?.maxSessionHours || 0;

        if (worker.provider === 'kaggle') {
          // KAGGLE: Mostra quota SEMANAL (dados reais do PostgreSQL)
          const usedHoursThisWeek = metadata?.usedHoursThisWeek || 0;
          const quotaHoursPerWeek = metadata?.quotaHoursPerWeek || 30;
          const safeWeeklyLimit = quotaHoursPerWeek * 0.7; // 70% safety margin
          
          setTimeLeft(`Semana: ${usedHoursThisWeek.toFixed(1)}h / ${safeWeeklyLimit.toFixed(0)}h`);
        } else {
          // COLAB: Mostra quota de SESSÃO com countdown
          if (!sessionStart) {
            setTimeLeft(t.admin.gpuManagement.time.na);
            return;
          }

          const startTime = new Date(sessionStart).getTime();
          const maxRuntimeMs = maxSessionHours * 60 * 60 * 1000;
          const shutdownTime = startTime + maxRuntimeMs;
          const now = Date.now();
          const remaining = shutdownTime - now;

          if (remaining <= 0) {
            setTimeLeft(t.admin.gpuManagement.time.shuttingDown);
            return;
          }

          const hours = Math.floor(remaining / (1000 * 60 * 60));
          const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

          setTimeLeft(`Sessão: ${sessionRuntimeHours.toFixed(1)}h / ${maxSessionHours.toFixed(1)}h`);
        }
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }, [worker.id, worker.provider, worker.status, worker.capabilities.metadata]);

    return <span className="text-sm font-mono">{timeLeft}</span>;
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Stats Overview */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="glass-premium border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.gpuManagement.totalGPUs}</CardTitle>
            <div className="text-2xl font-bold gradient-text">{stats.total}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-green-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.gpuManagement.healthy}</CardTitle>
            <div className="text-2xl font-bold text-green-400">{stats.healthy}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-yellow-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.gpuManagement.unhealthy}</CardTitle>
            <div className="text-2xl font-bold text-yellow-400">{stats.unhealthy}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-red-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.gpuManagement.offline}</CardTitle>
            <div className="text-2xl font-bold text-red-400">{stats.offline}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.gpuManagement.totalRequests}</CardTitle>
            <div className="text-2xl font-bold gradient-text">{stats.totalRequests.toLocaleString()}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.gpuManagement.avgLatencyMs}</CardTitle>
            <div className="text-2xl font-bold gradient-text">{stats.averageLatencyMs.toFixed(0)}ms</div>
          </CardHeader>
        </Card>
      </div>

      {/* GPU Workers Table */}
      <Card className="glass-premium border-accent/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              {t.admin.gpuManagement.registeredWorkers}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowAddWorkerDialog(true)}
                data-testid="button-add-worker"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t.admin.gpuManagement.addWorker}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/gpu/status"] })}
                data-testid="button-refresh-gpus"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {t.admin.gpuManagement.refresh}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t.admin.gpuManagement.loading}</div>
          ) : workers.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <Server className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
              <div>
                <p className="text-muted-foreground font-medium">{t.admin.gpuManagement.noWorkers}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.admin.gpuManagement.noWorkersDesc}
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.admin.gpuManagement.provider}</TableHead>
                    <TableHead>{t.admin.gpuManagement.account}</TableHead>
                    <TableHead>{t.admin.gpuManagement.model}</TableHead>
                    <TableHead>{t.admin.gpuManagement.gpu}</TableHead>
                    <TableHead>{t.admin.gpuManagement.status}</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t.admin.gpuManagement.tempo}
                      </div>
                    </TableHead>
                    <TableHead>{t.admin.gpuManagement.requests}</TableHead>
                    <TableHead>{t.admin.gpuManagement.avgLatency}</TableHead>
                    <TableHead>{t.admin.gpuManagement.lastUsed}</TableHead>
                    <TableHead>{t.admin.gpuManagement.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((worker) => (
                    <TableRow key={worker.id} data-testid={`gpu-row-${worker.id}`}>
                      <TableCell className="font-medium">
                        <Badge variant="outline" className="capitalize">
                          {worker.provider}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {worker.accountId ? worker.accountId.substring(0, 20) + "..." : t.admin.gpuManagement.table.na}
                      </TableCell>
                      <TableCell className="text-sm">{worker.capabilities.model}</TableCell>
                      <TableCell className="text-sm">{worker.capabilities.gpu}</TableCell>
                      <TableCell>{getStatusBadge(worker.status)}</TableCell>
                      <TableCell className="text-sm">
                        <TimeRemaining worker={worker} />
                      </TableCell>
                      <TableCell>{worker.requestCount.toLocaleString()}</TableCell>
                      <TableCell>{worker.averageLatencyMs.toFixed(0)}ms</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(worker.lastUsedAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingWorker(worker)}
                            data-testid={`button-edit-gpu-${worker.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(worker.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-gpu-${worker.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Worker Dialog */}
      <AddWorkerDialog
        open={showAddWorkerDialog}
        onOpenChange={setShowAddWorkerDialog}
      />

      {/* Edit Worker Dialog */}
      {editingWorker && (
        <EditWorkerDialog
          worker={editingWorker}
          open={!!editingWorker}
          onOpenChange={(open: boolean) => !open && setEditingWorker(null)}
        />
      )}
    </div>
  );
}
