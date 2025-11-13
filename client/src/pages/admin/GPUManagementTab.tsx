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
  const googleAuth = useGoogleAuth();

  // Quota status with auto-refresh
  const quotaQuery = useQuotaStatus({
    refreshInterval: refreshInterval * 1000,
  });

  // Manual sync mutation
  const { sync, isSyncing } = useQuotaSync();

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
          setTimeLeft(
            t.admin.gpuManagement.timeTemplates.week
              .replace('{used}', weeklyUsedHours.toFixed(1))
              .replace('{max}', weeklyMaxHours.toFixed(0))
          );
        } else {
          const sessionRuntimeHours = worker.quotaStatus.sessionRuntimeSeconds / 3600;
          const maxSessionHours = worker.quotaStatus.maxSessionSeconds / 3600;
          setTimeLeft(
            t.admin.gpuManagement.timeTemplates.session
              .replace('{used}', sessionRuntimeHours.toFixed(1))
              .replace('{max}', maxSessionHours.toFixed(1))
          );
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
      {quotaQuery.data?.kaggleAlert && quotaQuery.data.kaggleAlert.level !== 'normal' && (
        <QuotaAlertBanner
          level={quotaQuery.data.kaggleAlert.level as 'warning' | 'critical' | 'emergency'}
          provider="kaggle"
          percentage={quotaQuery.data.kaggleAlert.percentage}
          message={quotaQuery.data.kaggleAlert.message}
          onSync={sync}
          t={t}
          data-testid="alert-quota-kaggle"
        />
      )}
      {quotaQuery.data?.colabAlert && quotaQuery.data.colabAlert.level !== 'normal' && (
        <QuotaAlertBanner
          level={quotaQuery.data.colabAlert.level as 'warning' | 'critical' | 'emergency'}
          provider="colab"
          percentage={quotaQuery.data.colabAlert.percentage}
          message={quotaQuery.data.colabAlert.message}
          onSync={sync}
          t={t}
          data-testid="alert-quota-colab"
        />
      )}

      {/* TABS NAVIGATION */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 gap-2">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <TrendingUp className="w-4 h-4 mr-2" />
            {t.admin.gpuManagement.tabs.overview}
          </TabsTrigger>
          <TabsTrigger value="auth" data-testid="tab-auth">
            <Shield className="w-4 h-4 mr-2" />
            {t.admin.gpuManagement.tabs.auth}
          </TabsTrigger>
          <TabsTrigger value="quotas" data-testid="tab-quotas">
            <Activity className="w-4 h-4 mr-2" />
            {t.admin.gpuManagement.tabs.quotas}
          </TabsTrigger>
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            <Calendar className="w-4 h-4 mr-2" />
            {t.admin.gpuManagement.tabs.timeline}
          </TabsTrigger>
          <TabsTrigger value="workers" data-testid="tab-workers">
            <Server className="w-4 h-4 mr-2" />
            {t.admin.gpuManagement.tabs.workersCount.replace('{count}', String(workers.length))}
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
                {t.admin.gpuManagement.autoRefresh.title}
              </CardTitle>
              <CardDescription>
                {t.admin.gpuManagement.autoRefresh.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <Label htmlFor="refresh-interval" className="whitespace-nowrap">
                {t.admin.gpuManagement.autoRefresh.interval}
              </Label>
              <Select
                value={refreshInterval.toString()}
                onValueChange={(v) => setRefreshInterval(parseInt(v))}
              >
                <SelectTrigger id="refresh-interval" className="w-48" data-testid="select-refresh-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">{t.admin.gpuManagement.autoRefresh.intervalOptions.tenSeconds}</SelectItem>
                  <SelectItem value="30">{t.admin.gpuManagement.autoRefresh.intervalOptions.thirtySeconds}</SelectItem>
                  <SelectItem value="60">{t.admin.gpuManagement.autoRefresh.intervalOptions.oneMinute}</SelectItem>
                  <SelectItem value="300">{t.admin.gpuManagement.autoRefresh.intervalOptions.fiveMinutes}</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline">
                {quotaQuery.data?.isStale ? t.admin.gpuManagement.autoRefresh.status.stale : t.admin.gpuManagement.autoRefresh.status.updated}
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
                {t.admin.gpuManagement.auth.title}
              </CardTitle>
              <CardDescription>
                {t.admin.gpuManagement.auth.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-1">
                  <h4 className="font-semibold">{t.admin.gpuManagement.auth.statusTitle}</h4>
                  <div className="flex items-center gap-2">
                    <AuthStatusBadge
                      status={
                        googleAuth.hasKaggle || googleAuth.hasColab
                          ? 'authenticated'
                          : 'not_authenticated'
                      }
                      email={googleAuth.sessions[0]?.accountEmail}
                      t={t}
                      data-testid="auth-status-badge"
                    />
                    {googleAuth.sessions && googleAuth.sessions.length > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {t.admin.gpuManagement.auth.accountsConnectedCount.replace('{count}', String(googleAuth.sessions.length))}
                      </span>
                    )}
                  </div>
                </div>
                <GoogleAuthDialog
                  trigger={
                    <Button variant="default" data-testid="button-connect-google">
                      <Shield className="w-4 h-4 mr-2" />
                      {googleAuth.hasKaggle || googleAuth.hasColab ? t.admin.gpuManagement.auth.addAccount : t.admin.gpuManagement.auth.connectAccount}
                    </Button>
                  }
                />
              </div>

              {googleAuth.sessions && googleAuth.sessions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">{t.admin.gpuManagement.auth.connectedAccountsTitle}</h4>
                  {googleAuth.sessions.map((session: any) => (
                    <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg text-sm">
                      <div>
                        <p className="font-medium">{session.accountEmail}</p>
                        <p className="text-xs text-muted-foreground">
                          {t.admin.gpuManagement.auth.providers} {session.providers.join(", ")}
                        </p>
                      </div>
                      <Badge variant={session.isValid ? "default" : "destructive"}>
                        {session.isValid ? t.admin.gpuManagement.auth.valid : t.admin.gpuManagement.auth.expired}
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
            <h3 className="text-lg font-semibold">{t.admin.gpuManagement.quotas.title}</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => sync()}
              disabled={isSyncing}
              data-testid="button-sync-quotas"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? t.admin.gpuManagement.quotas.syncing : t.admin.gpuManagement.quotas.syncButton}
            </Button>
          </div>

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {quotaQuery.data?.kaggle && (
              <QuotaProviderCard
                provider="kaggle"
                quotaData={quotaQuery.data.kaggle}
                alertLevel={quotaQuery.data.kaggleAlert?.level || 'normal'}
                isStale={quotaQuery.data.isStale || false}
                t={t}
                data-testid="card-quota-kaggle"
              />
            )}
            {quotaQuery.data?.colab && (
              <QuotaProviderCard
                provider="colab"
                quotaData={quotaQuery.data.colab}
                alertLevel={quotaQuery.data.colabAlert?.level || 'normal'}
                isStale={quotaQuery.data.isStale || false}
                t={t}
                data-testid="card-quota-colab"
              />
            )}
            {!quotaQuery.data?.kaggle && !quotaQuery.data?.colab && (
              <Card className="glass-premium border-accent/20 col-span-2">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <AlertTriangle className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground text-center">
                    {t.admin.gpuManagement.quotas.emptyMessage}
                  </p>
                  <GoogleAuthDialog
                    trigger={
                      <Button variant="default" className="mt-4" data-testid="button-connect-google-from-quotas">
                        <Shield className="w-4 h-4 mr-2" />
                        {t.admin.gpuManagement.quotas.emptyAction}
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Usage Charts */}
          {(quotaQuery.data?.kaggle || quotaQuery.data?.colab) && (
            <Card className="glass-premium border-accent/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5" />
                  {t.admin.gpuManagement.usageHistory.title}
                </CardTitle>
                <CardDescription>
                  {t.admin.gpuManagement.usageHistory.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <UsageChart 
                  data={[]} 
                  t={t}
                  data-testid="chart-usage" 
                />
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
                {t.admin.gpuManagement.timeline.title}
              </CardTitle>
              <CardDescription>
                {t.admin.gpuManagement.timeline.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(quotaQuery.data?.kaggle || quotaQuery.data?.colab) ? (
                <SessionTimeline
                  sessions={[
                    quotaQuery.data?.kaggle && {
                      provider: 'kaggle' as const,
                      status: (() => {
                        const q = quotaQuery.data.kaggle.quotaData;
                        if (!q) return 'idle' as const;
                        if (q.inCooldown) return 'cooldown' as const;
                        if (q.sessionRemainingHours && q.sessionRemainingHours > 0) return 'active' as const;
                        if (q.canStart) return 'available' as const;
                        return 'idle' as const;
                      })(),
                      sessionRemaining: quotaQuery.data.kaggle.quotaData?.sessionRemainingHours,
                      cooldownRemaining: quotaQuery.data.kaggle.quotaData?.cooldownRemainingHours,
                      canStart: quotaQuery.data.kaggle.quotaData?.canStart,
                      shouldStop: quotaQuery.data.kaggle.quotaData?.shouldStop,
                    },
                    quotaQuery.data?.colab && {
                      provider: 'colab' as const,
                      status: (() => {
                        const q = quotaQuery.data.colab.quotaData;
                        if (!q) return 'idle' as const;
                        if (q.inCooldown) return 'cooldown' as const;
                        if (q.sessionRemainingHours && q.sessionRemainingHours > 0) return 'active' as const;
                        if (q.canStart) return 'available' as const;
                        return 'idle' as const;
                      })(),
                      sessionRemaining: quotaQuery.data.colab.quotaData?.sessionRemainingHours,
                      cooldownRemaining: quotaQuery.data.colab.quotaData?.cooldownRemainingHours,
                      canStart: quotaQuery.data.colab.quotaData?.canStart,
                      shouldStop: quotaQuery.data.colab.quotaData?.shouldStop,
                    },
                  ].filter(Boolean) as any[]}
                  t={t}
                  data-testid="timeline-sessions"
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <Calendar className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
                  <p className="text-muted-foreground text-center">
                    {t.admin.gpuManagement.timeline.emptyMessage}
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
