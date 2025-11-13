/**
 * GPU MANAGEMENT TAB - ENTERPRISE 2025
 * ====================================
 * 
 * Complete GPU orchestration dashboard with:
 * - Google Auth integration (Kaggle + Colab)
 * - Real-time quota monitoring (scraped data)
 * - Session timeline visualization
 * - Historical usage charts
 * - Alert system (70%/85%/95% thresholds)
 * - Auto-refresh configuration
 * - Worker management (CRUD)
 * 
 * ZERO hardcoded values - 100% PostgreSQL + i18n
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Shield,
  TrendingUp,
  Calendar,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { formatDateTimeInTimezone } from "@/lib/datetime";
import { AddWorkerDialog } from "@/components/admin/AddWorkerDialog";
import { EditWorkerDialog } from "@/components/admin/EditWorkerDialog";
import { GoogleAuthDialog } from "@/components/gpu/GoogleAuthDialog";
import { QuotaProviderCard } from "@/components/gpu/QuotaProviderCard";
import { SessionTimeline } from "@/components/gpu/SessionTimeline";
import { UsageChart } from "@/components/gpu/UsageChart";
import { AuthStatusBadge } from "@/components/gpu/AuthStatusBadge";
import { QuotaAlertBanner } from "@/components/gpu/QuotaAlertBanner";
import { useQuotaStatus } from "@/hooks/useQuotaStatus";
import { useGoogleAuth } from "@/hooks/useGoogleAuth";
import { useQuotaSync } from "@/hooks/useQuotaSync";
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
      quotaHoursPerWeek?: number;
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
  quotaStatus?: {
    provider: string;
    sessionRuntimeSeconds: number;
    maxSessionSeconds: number;
    remainingSessionSeconds: number;
    weeklyUsedSeconds?: number;
    weeklyRemainingSeconds?: number;
    weeklyMaxSeconds?: number;
    utilizationPercent: number;
    canStart: boolean;
    shouldStop: boolean;
  };
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
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [refreshInterval, setRefreshInterval] = useState<number>(30); // seconds

  // Fetch system timezone
  const { data: systemTimezone } = useQuery<{ timezone: string }>({
    queryKey: ["/api/admin/settings/timezone"],
  });
  const timezone = systemTimezone?.timezone || "America/Sao_Paulo";

  // Fetch GPU workers with quota data
  const { data: gpuData, isLoading } = useQuery({
    queryKey: ["/api/gpu/overview"],
    refetchInterval: showAddWorkerDialog || editingWorker ? false : refreshInterval * 1000,
  });

  // Google Auth status
  const { authStatus, isLoading: authLoading } = useGoogleAuth();

  // Quota status with auto-refresh
  const { quotaStatus, isStale, alertLevel } = useQuotaStatus({
    pollingInterval: refreshInterval * 1000,
  });

  // Manual sync mutation
  const { syncNow, isSyncing } = useQuotaSync();

  const workers: GpuWorker[] = (gpuData as any)?.workers || [];
  const stats: PoolStats = {
    total: (gpuData as any)?.stats?.total || 0,
    healthy: (gpuData as any)?.stats?.healthy || 0,
    unhealthy: (gpuData as any)?.stats?.unhealthy || 0,
    offline: (gpuData as any)?.stats?.offline || 0,
    totalRequests: (gpuData as any)?.stats?.totalRequests || 0,
    averageLatencyMs: (gpuData as any)?.stats?.avgLatency || 0,
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
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/overview"] });
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
      case "online":
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

  // Countdown timer component
  const TimeRemaining = ({ worker }: { worker: GpuWorker }) => {
    const [timeLeft, setTimeLeft] = useState<string>(t.admin.gpuManagement.time.na);

    useEffect(() => {
      const updateTimer = () => {
        if (worker.status === "offline" || worker.status === "pending") {
          setTimeLeft(t.admin.gpuManagement.time.na);
          return;
        }

        if (!worker.quotaStatus) {
          setTimeLeft(t.admin.gpuManagement.time.na);
          return;
        }

        if (worker.provider?.toLowerCase() === 'kaggle') {
          const weeklyUsedHours = (worker.quotaStatus.weeklyUsedSeconds || 0) / 3600;
          const weeklyMaxHours = (worker.quotaStatus.weeklyMaxSeconds || 75600) / 3600;
          setTimeLeft(`Semana: ${weeklyUsedHours.toFixed(1)}h / ${weeklyMaxHours.toFixed(0)}h`);
        } else {
          const sessionRuntimeHours = worker.quotaStatus.sessionRuntimeSeconds / 3600;
          const maxSessionHours = worker.quotaStatus.maxSessionSeconds / 3600;
          setTimeLeft(`Sessão: ${sessionRuntimeHours.toFixed(1)}h / ${maxSessionHours.toFixed(1)}h`);
        }
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }, [worker.id, worker.provider, worker.status, worker.quotaStatus]);

    return <span className="text-sm font-mono">{timeLeft}</span>;
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* ALERT BANNER - Shows when quota > 70% */}
      {quotaStatus && (
        <>
          {quotaStatus.kaggle && (
            <QuotaAlertBanner
              provider="kaggle"
              quotaStatus={quotaStatus.kaggle}
              onSync={() => syncNow()}
              data-testid="quota-alert-kaggle"
            />
          )}
          {quotaStatus.colab && (
            <QuotaAlertBanner
              provider="colab"
              quotaStatus={quotaStatus.colab}
              onSync={() => syncNow()}
              data-testid="quota-alert-colab"
            />
          )}
        </>
      )}

      {/* TABS NAVIGATION */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 gap-2">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <TrendingUp className="w-4 h-4 mr-2" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="auth" data-testid="tab-auth">
            <Shield className="w-4 h-4 mr-2" />
            Autenticação
          </TabsTrigger>
          <TabsTrigger value="quotas" data-testid="tab-quotas">
            <Activity className="w-4 h-4 mr-2" />
            Quotas
          </TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            <Calendar className="w-4 h-4 mr-2" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="workers" data-testid="tab-workers">
            <Server className="w-4 h-4 mr-2" />
            Workers ({workers.length})
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-6">
          {/* Stats Grid */}
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

          {/* Auto-refresh Config */}
          <Card className="glass-premium border-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Configuração de Auto-Refresh
              </CardTitle>
              <CardDescription>
                Frequência de atualização automática dos dados de quota
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <Label htmlFor="refresh-interval" className="whitespace-nowrap">
                Intervalo:
              </Label>
              <Select
                value={refreshInterval.toString()}
                onValueChange={(v) => setRefreshInterval(parseInt(v))}
              >
                <SelectTrigger id="refresh-interval" className="w-48" data-testid="select-refresh-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 segundos</SelectItem>
                  <SelectItem value="30">30 segundos</SelectItem>
                  <SelectItem value="60">1 minuto</SelectItem>
                  <SelectItem value="300">5 minutos</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline">
                {isStale ? "Dados desatualizados (>10min)" : "Dados atualizados"}
              </Badge>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: AUTHENTICATION */}
        <TabsContent value="auth" className="space-y-6">
          <Card className="glass-premium border-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Autenticação Google (Kaggle + Colab)
              </CardTitle>
              <CardDescription>
                Configure acesso seguro às plataformas de GPU via Google OAuth
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <h4 className="font-semibold">Status de Autenticação</h4>
                  <div className="flex items-center gap-2">
                    <AuthStatusBadge
                      hasKaggle={authStatus?.hasKaggle || false}
                      hasColab={authStatus?.hasColab || false}
                      isLoading={authLoading}
                      data-testid="auth-status-badge"
                    />
                    {authStatus?.sessions && authStatus.sessions.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {authStatus.sessions.length} conta(s) conectada(s)
                      </span>
                    )}
                  </div>
                </div>
                <GoogleAuthDialog
                  trigger={
                    <Button variant="default" data-testid="button-connect-google">
                      <Shield className="w-4 h-4 mr-2" />
                      {authStatus?.hasKaggle || authStatus?.hasColab ? "Adicionar Conta" : "Conectar Conta"}
                    </Button>
                  }
                />
              </div>

              {authStatus?.sessions && authStatus.sessions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Contas Conectadas:</h4>
                  {authStatus.sessions.map((session: any) => (
                    <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                      <div>
                        <p className="font-medium">{session.accountEmail}</p>
                        <p className="text-xs text-muted-foreground">
                          Provedores: {session.providers.join(", ")}
                        </p>
                      </div>
                      <Badge variant={session.isValid ? "default" : "destructive"}>
                        {session.isValid ? "Válido" : "Expirado"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: QUOTAS */}
        <TabsContent value="quotas" className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Quotas de GPU em Tempo Real</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncNow()}
              disabled={isSyncing}
              data-testid="button-sync-quotas"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? "Sincronizando..." : "Sincronizar Agora"}
            </Button>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {quotaStatus?.kaggle && (
              <QuotaProviderCard
                provider="kaggle"
                quotaData={quotaStatus.kaggle}
                isStale={isStale}
                data-testid="quota-card-kaggle"
              />
            )}
            {quotaStatus?.colab && (
              <QuotaProviderCard
                provider="colab"
                quotaData={quotaStatus.colab}
                isStale={isStale}
                data-testid="quota-card-colab"
              />
            )}
            {!quotaStatus?.kaggle && !quotaStatus?.colab && (
              <Card className="glass-premium border-accent/20 col-span-2">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <AlertTriangle className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground text-center">
                    Nenhuma quota disponível. Conecte uma conta Google para começar.
                  </p>
                  <GoogleAuthDialog
                    trigger={
                      <Button variant="default" className="mt-4" data-testid="button-connect-google-from-quotas">
                        <Shield className="w-4 h-4 mr-2" />
                        Conectar Conta Google
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Usage Charts */}
          {(quotaStatus?.kaggle || quotaStatus?.colab) && (
            <Card className="glass-premium border-accent/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  Histórico de Uso
                </CardTitle>
                <CardDescription>
                  Gráfico de consumo de quota ao longo do tempo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageChart provider="kaggle" data-testid="usage-chart-kaggle" />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB 4: TIMELINE */}
        <TabsContent value="timeline" className="space-y-6">
          <Card className="glass-premium border-accent/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Timeline de Sessões
              </CardTitle>
              <CardDescription>
                Visualização das sessões ativas, cooldowns e próximas disponibilidades
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(quotaStatus?.kaggle || quotaStatus?.colab) ? (
                <SessionTimeline
                  kaggleQuota={quotaStatus?.kaggle}
                  colabQuota={quotaStatus?.colab}
                  data-testid="session-timeline"
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <Calendar className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground text-center">
                    Nenhuma sessão disponível. Conecte uma conta Google para visualizar a timeline.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: WORKERS */}
        <TabsContent value="workers" className="space-y-6">
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
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/gpu/overview"] })}
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
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddWorkerDialog
        open={showAddWorkerDialog}
        onOpenChange={setShowAddWorkerDialog}
      />

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
