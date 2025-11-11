import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

// Helper function for template interpolation
function interpolate(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template
  );
}

export default function GPUOverviewPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showProvisionDialog, setShowProvisionDialog] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'kaggle' | 'colab' | 'manual' | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    kaggleUsername: '',
    kaggleKey: '',
    workerUrl: '',
  });

  // Fetch unified GPU data with adaptive polling
  const { data: overviewData, isLoading } = useQuery<OverviewData>({
    queryKey: ["/api/gpu/overview"],
    refetchInterval: 30000, // Standard 30s polling
  });

  // Detect active provisioning by checking for pending workers
  const hasPendingWorkers = (overviewData?.workers || []).some(w => w.status === 'pending');

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

  // Add Manual Worker mutation
  const addManualWorkerMutation = useMutation({
    mutationFn: async (url: string) => {
      return await apiRequest('/api/admin/gpu/workers/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: 'manual',
          accountId: 'manual',
          ngrokUrl: url,
          capabilities: {
            tor_enabled: false,
            gpu_available: true,
          },
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/overview"] });
      toast({
        title: "Worker Manual Adicionado",
        description: "Worker conectado com sucesso",
      });
      setShowProvisionDialog(false);
      setSelectedProvider(null);
      setFormData({ email: '', password: '', kaggleUsername: '', kaggleKey: '', workerUrl: '' });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao conectar worker",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add GPU mutation (Kaggle/Colab auto-provision)
  const addGPUMutation = useMutation({
    mutationFn: async (data: typeof formData & { provider: string }) => {
      console.log('[GPU Add] Sending request:', {
        provider: data.provider,
        email: data.email,
        hasPassword: !!data.password,
        kaggleUsername: data.kaggleUsername,
        hasKaggleKey: !!data.kaggleKey,
      });
      return await apiRequest('/api/gpu/workers/notebooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: data.provider,
          email: data.email,
          password: data.password,
          kaggleUsername: data.kaggleUsername,
          kaggleKey: data.kaggleKey,
          useGPU: true,
          title: `AION ${data.provider === 'kaggle' ? 'Kaggle' : 'Colab'} Worker`,
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/overview"] });
      toast({
        title: "Provisionamento Iniciado",
        description: "GPU sendo criada automaticamente. Acompanhe o status na tabela abaixo.",
      });
      setShowProvisionDialog(false);
      setSelectedProvider(null);
      setFormData({ email: '', password: '', kaggleUsername: '', kaggleKey: '', workerUrl: '' });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao adicionar GPU",
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
            {t.admin.gpuManagement.badges.online}
          </Badge>
        );
      case "unhealthy":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/50" data-testid="status-unhealthy">
            <Circle className="w-2 h-2 mr-1 fill-current" />
            {t.admin.gpuManagement.badges.unhealthy}
          </Badge>
        );
      case "offline":
        return (
          <Badge className="bg-red-500/20 text-red-300 border-red-500/50" data-testid="status-offline">
            <Circle className="w-2 h-2 mr-1 fill-current" />
            {t.admin.gpuManagement.badges.offline}
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/50" data-testid="status-pending">
            <Clock className="w-2 h-2 mr-1" />
            {t.admin.gpuManagement.badges.pending}
          </Badge>
        );
    }
  };

  const getSourceBadge = (source: "auto" | "manual") => {
    if (source === "auto") {
      return (
        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/50" data-testid="badge-auto">
          <Zap className="w-3 h-3 mr-1" />
          {t.admin.gpuManagement.badges.auto}
        </Badge>
      );
    }
    return (
      <Badge className="bg-gray-500/20 text-gray-300 border-gray-500/50" data-testid="badge-manual">
        <Cpu className="w-3 h-3 mr-1" />
        {t.admin.gpuManagement.badges.manual}
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
        <div>{interpolate(t.admin.gpuManagement.quota.sessionTemplate, { used: hoursUsed, max: hoursMax })}</div>
        {weeklyUsed && <div>{interpolate(t.admin.gpuManagement.quota.weekTemplate, { used: weeklyUsed })}</div>}
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
            {t.admin.gpuManagement.header.title}
          </h2>
          <p className="text-muted-foreground mt-1">
            {t.admin.gpuManagement.header.subtitle}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowProvisionDialog(true)}
            data-testid="button-provision-gpu"
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            {t.admin.gpuManagement.header.addGpu}
          </Button>
        </div>
      </div>

      {/* Provisioning Status Banner */}
      {hasPendingWorkers && (
        <Card className="border-blue-500/50 bg-blue-500/10" data-testid="banner-provisioning">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
              <div className="flex-1">
                <p className="font-medium text-blue-300 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Criando GPU automaticamente...
                </p>
                <p className="text-sm text-muted-foreground">
                  Provisionamento em andamento. Acompanhe o status na tabela abaixo.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.admin.gpuManagement.stats.totalWorkers}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-total">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {interpolate(t.admin.gpuManagement.stats.autoManualTemplate, { auto: stats.autoManaged, manual: stats.manual })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.admin.gpuManagement.stats.online}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500" data-testid="stat-healthy">
              {stats.healthy}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {interpolate(t.admin.gpuManagement.stats.offlineUnhealthyTemplate, { offline: stats.offline, unhealthy: stats.unhealthy })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t.admin.gpuManagement.stats.totalRequests}
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
              {t.admin.gpuManagement.stats.avgLatency}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="stat-latency">
              {stats.avgLatency.toFixed(0)}{t.admin.gpuManagement.stats.msUnit}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workers Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            {t.admin.gpuManagement.table.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {workers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t.admin.gpuManagement.emptyState.message}</p>
              <Button
                onClick={() => setShowProvisionDialog(true)}
                className="mt-4"
                data-testid="button-add-first-gpu"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t.admin.gpuManagement.emptyState.addFirstGpu}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.admin.gpuManagement.table.headers.id}</TableHead>
                  <TableHead>{t.admin.gpuManagement.table.headers.type}</TableHead>
                  <TableHead>{t.admin.gpuManagement.table.headers.provider}</TableHead>
                  <TableHead>{t.admin.gpuManagement.table.headers.account}</TableHead>
                  <TableHead>{t.admin.gpuManagement.table.headers.gpu}</TableHead>
                  <TableHead>{t.admin.gpuManagement.table.headers.status}</TableHead>
                  <TableHead>{t.admin.gpuManagement.table.headers.quota}</TableHead>
                  <TableHead>{t.admin.gpuManagement.table.headers.requests}</TableHead>
                  <TableHead>{t.admin.gpuManagement.table.headers.latency}</TableHead>
                  <TableHead className="text-right">{t.admin.gpuManagement.table.headers.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workers.map((worker) => (
                  <TableRow key={worker.id} data-testid={`row-worker-${worker.id}`}>
                    <TableCell className="font-mono text-xs">{worker.id}</TableCell>
                    <TableCell>{getSourceBadge(worker.source)}</TableCell>
                    <TableCell className="capitalize">{worker.provider}</TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">
                      {worker.accountId || t.admin.gpuManagement.table.na}
                    </TableCell>
                    <TableCell className="text-xs">{worker.capabilities.gpu}</TableCell>
                    <TableCell>{getStatusBadge(worker.status)}</TableCell>
                    <TableCell>{formatQuotaInfo(worker.quotaStatus)}</TableCell>
                    <TableCell>{worker.requestCount}</TableCell>
                    <TableCell>{worker.averageLatencyMs.toFixed(0)}{t.admin.gpuManagement.stats.msUnit}</TableCell>
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

      {/* Provision Dialog - 2 Step Process */}
      {showProvisionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => {
          setShowProvisionDialog(false);
          setSelectedProvider(null);
        }}>
          <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>
                {selectedProvider ? 
                  `${selectedProvider === 'kaggle' ? 'Kaggle GPU' : 'Google Colab GPU'}` :
                  t.admin.gpuManagement.dialogs.addWorkerTitle
                }
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedProvider ? (
                // Step 1: Provider Selection
                <>
                  <p className="text-muted-foreground mb-4">
                    {t.admin.gpuManagement.dialogs.chooseMethod}
                  </p>
                  <div className="space-y-2">
                    <Button
                      className="w-full justify-start"
                      onClick={() => setSelectedProvider('kaggle')}
                      data-testid="button-provision-kaggle"
                    >
                      <div className="flex items-center w-full">
                        <Zap className="w-4 h-4 mr-3" />
                        <div className="flex-1 text-left">
                          <div className="font-medium">Kaggle GPU</div>
                          <div className="text-xs text-muted-foreground font-normal">
                            Sistema cria notebook automaticamente
                          </div>
                        </div>
                      </div>
                    </Button>
                    <Button
                      className="w-full justify-start"
                      onClick={() => setSelectedProvider('colab')}
                      data-testid="button-provision-colab"
                    >
                      <div className="flex items-center w-full">
                        <Zap className="w-4 h-4 mr-3" />
                        <div className="flex-1 text-left">
                          <div className="font-medium">Google Colab GPU</div>
                          <div className="text-xs text-muted-foreground font-normal">
                            Sistema cria notebook automaticamente via Puppeteer
                          </div>
                        </div>
                      </div>
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => setSelectedProvider('manual')}
                      data-testid="button-add-manual"
                    >
                      <div className="flex items-center w-full">
                        <Cpu className="w-4 h-4 mr-3" />
                        <div className="flex-1 text-left">
                          <div className="font-medium">Worker Manual</div>
                          <div className="text-xs text-muted-foreground font-normal">
                            Conectar worker existente via URL
                          </div>
                        </div>
                      </div>
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full mt-4"
                    onClick={() => setShowProvisionDialog(false)}
                    data-testid="button-cancel-provision"
                  >
                    {t.common.cancel}
                  </Button>
                </>
              ) : (
                // Step 2: Credentials Form
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (selectedProvider === 'manual') {
                      addManualWorkerMutation.mutate(formData.workerUrl);
                    } else {
                      addGPUMutation.mutate({ ...formData, provider: selectedProvider });
                    }
                  }}
                  className="space-y-4"
                >
                  <p className="text-sm text-muted-foreground">
                    {selectedProvider === 'kaggle' 
                      ? 'Forneça suas credenciais. O sistema criará o notebook automaticamente.'
                      : selectedProvider === 'colab'
                      ? 'Forneça suas credenciais. O sistema criará o notebook automaticamente via Puppeteer.'
                      : 'Forneça a URL do worker existente (ex: https://abc123.ngrok.io)'
                    }
                  </p>

                  {selectedProvider === 'manual' ? (
                    // Manual Worker Form
                    <div className="space-y-2">
                      <Label htmlFor="workerUrl">URL do Worker</Label>
                      <Input
                        id="workerUrl"
                        type="url"
                        placeholder="https://abc123.ngrok.io"
                        value={formData.workerUrl}
                        onChange={(e) => setFormData({ ...formData, workerUrl: e.target.value })}
                        required
                        autoComplete="off"
                        data-testid="input-worker-url"
                      />
                      <p className="text-xs text-muted-foreground">
                        URL do worker GPU já em execução (Kaggle, Colab, ou outro)
                      </p>
                    </div>
                  ) : selectedProvider === 'colab' ? (
                    // Colab Form Fields
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Google</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="user@gmail.com"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                          autoComplete="off"
                          data-testid="input-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password">Senha (opcional se sessão existir)</Label>
                        <Input
                          id="password"
                          type="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          autoComplete="new-password"
                          data-testid="input-password"
                        />
                      </div>
                    </>
                  ) : (
                    // Kaggle Form Fields
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="kaggleUsername">Username Kaggle</Label>
                        <Input
                          id="kaggleUsername"
                          placeholder="seu-username"
                          value={formData.kaggleUsername}
                          onChange={(e) => setFormData({ ...formData, kaggleUsername: e.target.value })}
                          required
                          autoComplete="off"
                          data-testid="input-kaggle-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="kaggleKey">API Key Kaggle</Label>
                        <Input
                          id="kaggleKey"
                          type="password"
                          placeholder="Obtenha em kaggle.com/account"
                          value={formData.kaggleKey}
                          onChange={(e) => setFormData({ ...formData, kaggleKey: e.target.value })}
                          required
                          autoComplete="new-password"
                          data-testid="input-kaggle-key"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedProvider(null)}
                      data-testid="button-back"
                    >
                      Voltar
                    </Button>
                    <Button
                      type="submit"
                      disabled={selectedProvider === 'manual' ? addManualWorkerMutation.isPending : addGPUMutation.isPending}
                      className="flex-1"
                      data-testid="button-submit-gpu"
                    >
                      {(selectedProvider === 'manual' ? addManualWorkerMutation.isPending : addGPUMutation.isPending) ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          {selectedProvider === 'manual' ? 'Conectando...' : 'Criando GPU...'}
                        </>
                      ) : (
                        <>
                          {selectedProvider === 'manual' ? <Cpu className="w-4 h-4 mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                          {selectedProvider === 'manual' ? 'Conectar Worker' : 'Criar GPU Worker'}
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
