import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Server, Activity, Trash2, Plus, RefreshCw, Circle, Clock } from "lucide-react";
import { formatDateTimeInTimezone } from "@/lib/datetime";

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
  status: "healthy" | "unhealthy" | "offline" | "pending";
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
  const { toast } = useToast();
  const [tenantId] = useState(1);

  // Fetch tenant timezone for dynamic date formatting
  const { data: tenantTimezone } = useQuery<{ timezone: string }>({
    queryKey: ["/api/admin/settings/timezone", tenantId],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/settings/timezone/${tenantId}`);
      return res.json();
    },
  });
  const timezone = tenantTimezone?.timezone || "America/Sao_Paulo";

  // Fetch GPU workers
  const { data: gpuData, isLoading } = useQuery({
    queryKey: ["/api/gpu/status"],
    refetchInterval: 10000, // Refresh every 10s
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
        title: "GPU Worker Removed",
        description: "The GPU worker has been successfully removed from the pool.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove GPU worker",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: GpuWorker["status"]) => {
    switch (status) {
      case "healthy":
        return (
          <Badge className="bg-green-500/20 text-green-300 border-green-500/50" data-testid={`status-healthy`}>
            <Circle className="w-2 h-2 mr-1 fill-current" />
            Healthy
          </Badge>
        );
      case "unhealthy":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50" data-testid={`status-unhealthy`}>
            <Circle className="w-2 h-2 mr-1 fill-current" />
            Unhealthy
          </Badge>
        );
      case "offline":
        return (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/50" data-testid={`status-offline`}>
            <Circle className="w-2 h-2 mr-1 fill-current" />
            Offline
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/50" data-testid={`status-pending`}>
            <Circle className="w-2 h-2 mr-1 fill-current" />
            Pending
          </Badge>
        );
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return formatDateTimeInTimezone(dateStr, timezone, { format: 'short' });
  };

  // Countdown timer component (real-time updates)
  const TimeRemaining = ({ worker }: { worker: GpuWorker }) => {
    const [timeLeft, setTimeLeft] = useState<string>("N/A");

    useEffect(() => {
      const updateTimer = () => {
        if (worker.status === "offline" || worker.status === "pending") {
          setTimeLeft("N/A");
          return;
        }

        const metadata = worker.capabilities.metadata;
        const maxSessionHours = metadata?.maxSessionHours;
        const sessionStart = metadata?.sessionStart;

        if (!maxSessionHours) {
          setTimeLeft("N/A");
          return;
        }

        const startTime = sessionStart ? new Date(sessionStart).getTime() : new Date(worker.createdAt).getTime();
        const maxRuntimeMs = maxSessionHours * 60 * 60 * 1000;
        const shutdownTime = startTime + maxRuntimeMs;
        const now = Date.now();
        const remaining = shutdownTime - now;

        if (remaining <= 0) {
          setTimeLeft("Shutting down...");
          return;
        }

        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

        if (hours > 0) {
          setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        } else if (minutes > 0) {
          setTimeLeft(`${minutes}m ${seconds}s`);
        } else {
          setTimeLeft(`${seconds}s`);
        }
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }, [worker.id, worker.status, worker.createdAt, worker.capabilities.metadata?.maxSessionHours, worker.capabilities.metadata?.sessionStart]);

    return <span className="text-sm font-mono">{timeLeft}</span>;
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Stats Overview */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card className="glass-premium border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total GPUs</CardTitle>
            <div className="text-2xl font-bold gradient-text">{stats.total}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-green-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Healthy</CardTitle>
            <div className="text-2xl font-bold text-green-400">{stats.healthy}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-yellow-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unhealthy</CardTitle>
            <div className="text-2xl font-bold text-yellow-400">{stats.unhealthy}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-red-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Offline</CardTitle>
            <div className="text-2xl font-bold text-red-400">{stats.offline}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Requests</CardTitle>
            <div className="text-2xl font-bold gradient-text">{stats.totalRequests.toLocaleString()}</div>
          </CardHeader>
        </Card>

        <Card className="glass-premium border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Latency</CardTitle>
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
              GPU Workers
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/gpu/status"] })}
              data-testid="button-refresh-gpus"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading GPU workers...</div>
          ) : workers.length === 0 ? (
            <div className="text-center py-8 space-y-4">
              <Server className="w-12 h-12 mx-auto text-muted-foreground opacity-50" />
              <div>
                <p className="text-muted-foreground font-medium">No GPU Workers Registered</p>
                <p className="text-sm text-muted-foreground mt-1">
                  GPU workers will appear here once they register via the Colab/Kaggle script.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>GPU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Tempo
                      </div>
                    </TableHead>
                    <TableHead>Requests</TableHead>
                    <TableHead>Avg Latency</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Actions</TableHead>
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
                        {worker.accountId ? worker.accountId.substring(0, 20) + "..." : "N/A"}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(worker.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-gpu-${worker.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions Card */}
      <Card className="glass-premium border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            How to Add GPU Workers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p className="font-medium">To add a new GPU worker from Google Colab or Kaggle:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Open Google Colab or Kaggle notebook</li>
              <li>Copy and paste the AION GPU worker script</li>
              <li>Set your NGROK_AUTH_TOKEN secret</li>
              <li>Run the script and wait for auto-registration</li>
              <li>The GPU will appear here automatically with "Healthy" status</li>
            </ol>
            <p className="mt-4 text-xs bg-primary/10 p-3 rounded-md border border-primary/20">
              <span className="font-semibold">💡 Pro Tip:</span> You can run multiple GPU instances across different
              Google accounts for load balancing and 100% uptime. Each GPU will automatically register and receive
              traffic via round-robin distribution.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
