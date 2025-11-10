import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Server,
  Activity,
  Trash2,
  Plus,
  RefreshCw,
  Circle,
  Clock,
  Pencil,
  PlayCircle,
  StopCircle,
  Cpu,
  Zap,
} from "lucide-react";
import { formatDateTimeInTimezone } from "@/lib/datetime";
import { useLanguage } from "@/lib/i18n";

interface QuotaStatus {
  provider: string;
  sessionRuntimeSeconds: number;
  maxSessionSeconds: number;
  remainingSessionSeconds: number;
  weeklyUsedSeconds?: number;
  weeklyRemainingSeconds?: number;
  utilizationPercent: number;
  canStart: boolean;
  shouldStop: boolean;
}

interface GPUWorker {
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
  };
  status: "healthy" | "unhealthy" | "offline" | "pending" | "online";
  lastHealthCheck?: string;
  requestCount: number;
  averageLatencyMs: number;
  createdAt: string;
  autoManaged: boolean;
  source: "auto" | "manual";
  quotaStatus?: QuotaStatus;
}

interface OverviewData {
  workers: GPUWorker[];
  stats: {
    total: number;
    healthy: number;
    unhealthy: number;
    offline: number;
    pending: number;
    totalRequests: number;
    avgLatency: number;
    autoManaged: number;
    manual: number;
  };
  orchestrator: {
    running: boolean;
    activeProviders: string[];
    nextScheduledAction?: string;
  };
}

export default function GPUOverviewPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showProvisionDialog, setShowProvisionDialog] = useState(false);

  // Fetch unified GPU data
  const { data: overviewData, isLoading } = useQuery<OverviewData>({
    queryKey: ["/api/gpu/overview"],
    refetchInterval: 30000, // Refresh every 30s
  });

  const workers = overviewData?.workers || [];
  const stats = overviewData?.stats || {
    total: 0,
    healthy: 0,
    unhealthy: 0,
    offline: 0,
    pending: 0,
    totalRequests: 0,
    avgLatency: 0,
    autoManaged: 0,
    manual: 0,
  };

  // Delete worker mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/gpu/workers/notebooks/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/overview"] });
      toast({
        title: t.admin.gpuManagement.toast.workerRemoved,
        description: t.admin.gpuManagement.toast.workerRemovedDesc,
      });
    },
    onError: (error: Error) => {
      toast({
        title: t.admin.gpuManagement.toast.error,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Start GPU orchestration
  const startMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/gpu/orchestrate/start", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/overview"] });
      toast({
        title: "GPU Started",
        description: "GPU orchestration started successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Stop GPU orchestration
  const stopMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/gpu/orchestrate/stop", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/overview"] });
      toast({
        title: "GPU Stopped",
        description: "GPU orchestration stopped successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: GPUWorker["status"]) => {
    switch (status) {
      case "healthy":
      case "online":
        return (
          <Badge className="bg-green-500/20 text-green-300 border-green-500/50" data-testid="status-healthy">
            <Circle className="w-2 h-2 mr-1 fill-current" />
            Online
          </Badge>
        );
      case "unhealthy":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50" data-testid="status-unhealthy">
            <Circle className="w-2 h-2 mr-1 fill-current" />
            Unhealthy
          </Badge>
        );
      case "offline":
        return (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/50" data-testid="status-offline">
            <Circle className="w-2 h-2 mr-1 fill-current" />
            Offline
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/50" data-testid="status-pending">
            <Clock className="w-2 h-2 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const getSourceBadge = (source: "auto" | "manual") => {
    if (source === "auto") {
      return (
        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/50" data-testid="badge-auto">
          <Zap className="w-3 h-3 mr-1" />
          Auto
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-500/20 text-gray-300 border-gray-500/50" data-testid="badge-manual">
        <Cpu className="w-3 h-3 mr-1" />
        Manual
      </Badge>
    );
  };

  const formatQuotaInfo = (quota: QuotaStatus | undefined) => {
    if (!quota) return null;

    const hoursUsed = (quota.sessionRuntimeSeconds / 3600).toFixed(1);
    const hoursMax = (quota.maxSessionSeconds / 3600).toFixed(0);
    const weeklyUsed = quota.weeklyUsedSeconds
      ? (quota.weeklyUsedSeconds / 3600).toFixed(1)
      : null;

    return (
      <div className="text-xs text-muted-foreground" data-testid="quota-info">
        <div>Session: {hoursUsed}h / {hoursMax}h</div>
        {weeklyUsed && <div>Week: {weeklyUsed}h / 30h</div>}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold" data-testid="title-gpu-overview">
            GPU Management
          </h2>
          <p className="text-muted-foreground mt-1">
            Centralized control for all GPU workers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            data-testid="button-start-orchestration"
            className="gap-2"
          >
            <PlayCircle className="w-4 h-4" />
            Start Orchestration
          </Button>
          <Button
            onClick={() => stopMutation.mutate()}
            disabled={stopMutation.isPending}
            variant="destructive"
            data-testid="button-stop-orchestration"
            className="gap-2"
          >
            <StopCircle className="w-4 h-4" />
            Stop All
          </Button>
          <Button
            onClick={() => setShowProvisionDialog(true)}
            data-testid="button-provision-gpu"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Add GPU
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Workers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-total">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.autoManaged} auto / {stats.manual} manual
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Online
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500" data-testid="stat-healthy">
              {stats.healthy}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.offline} offline · {stats.unhealthy} unhealthy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-requests">
              {stats.totalRequests}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-latency">
              {stats.avgLatency.toFixed(0)}ms
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            GPU Workers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No GPU workers configured</p>
              <Button
                onClick={() => setShowProvisionDialog(true)}
                className="mt-4"
                data-testid="button-add-first-gpu"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First GPU
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>GPU</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quota</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow key={worker.id} data-testid={`row-worker-${worker.id}`}>
                    <TableCell className="font-mono text-xs">{worker.id}</TableCell>
                    <TableCell>{getSourceBadge(worker.source)}</TableCell>
                    <TableCell className="capitalize">{worker.provider}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {worker.accountId || "N/A"}
                    </TableCell>
                    <TableCell className="text-xs">{worker.capabilities.gpu}</TableCell>
                    <TableCell>{getStatusBadge(worker.status)}</TableCell>
                    <TableCell>{formatQuotaInfo(worker.quotaStatus)}</TableCell>
                    <TableCell>{worker.requestCount}</TableCell>
                    <TableCell>{worker.averageLatencyMs.toFixed(0)}ms</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(worker.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${worker.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Provision Dialog Placeholder */}
      {showProvisionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add GPU Worker</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Choose provisioning method:
              </p>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    toast({
                      title: "Coming Soon",
                      description: "Kaggle auto-provisioning will be available soon",
                    });
                    setShowProvisionDialog(false);
                  }}
                  data-testid="button-provision-kaggle"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Auto-Provision Kaggle
                </Button>
                <Button
                  className="w-full"
                  onClick={() => {
                    toast({
                      title: "Coming Soon",
                      description: "Colab auto-provisioning will be available soon",
                    });
                    setShowProvisionDialog(false);
                  }}
                  data-testid="button-provision-colab"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Auto-Provision Colab
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    toast({
                      title: "Coming Soon",
                      description: "Manual GPU addition will be available soon",
                    });
                    setShowProvisionDialog(false);
                  }}
                  data-testid="button-add-manual"
                >
                  <Cpu className="w-4 h-4 mr-2" />
                  Add Manual Worker
                </Button>
              </div>
              <Button
                variant="ghost"
                className="w-full mt-4"
                onClick={() => setShowProvisionDialog(false)}
                data-testid="button-cancel-provision"
              >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
