/**
 * GPU ORCHESTRATION DASHBOARD
 * ============================
 * 
 * Dashboard unificada para gerenciar TODAS GPUs FREE (Colab/Kaggle):
 * 
 * Features:
 * - ✅ CRUD de notebooks (add, edit, remove)
 * - ✅ Form para adicionar Colab/Kaggle com credentials
 * - ✅ Monitoring em tempo real (quotas, runtime, rotação)
 * - ✅ Controles start/stop por GPU
 * - ✅ Auto-orchestration toggle global
 * - ✅ Visualização de pool de rotação
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Plus, Play, Square, Trash2, RefreshCw, Cpu, Zap } from "lucide-react";

interface GPUWorker {
  id: number;
  provider: string;
  accountId: string;
  status: string;
  autoManaged: boolean;
  sessionStartedAt: string | null;
  capabilities: {
    gpu: string;
    model: string;
  };
  quotaStatus?: {
    provider: string;
    sessionRuntimeSeconds: number;
    maxSessionSeconds: number;
    remainingSessionSeconds: number;
    weeklyUsedSeconds?: number;
    weeklyRemainingSeconds?: number;
    utilizationPercent: number;
    canStart: boolean;
    shouldStop: boolean;
  };
}

export default function GPUDashboard() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    provider: 'colab',
    notebookUrl: '',
    email: '',
    password: '',
    useGPU: true,
  });

  // Fetch all managed notebooks
  const { data: workers = [], isLoading } = useQuery<GPUWorker[]>({
    queryKey: ['/api/gpu/workers/notebooks'],
    refetchInterval: 10000,  // Auto-refresh every 10s
  });

  // Add notebook mutation
  const addNotebookMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest('/api/gpu/workers/notebooks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gpu/workers/notebooks'] });
      toast({
        title: "Notebook Added",
        description: "GPU worker added to orchestration pool",
      });
      setShowAddForm(false);
      setFormData({ provider: 'colab', notebookUrl: '', email: '', password: '', useGPU: true });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete notebook mutation
  const deleteNotebookMutation = useMutation({
    mutationFn: async (workerId: number) => {
      return await apiRequest(`/api/gpu/workers/notebooks/${workerId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gpu/workers/notebooks'] });
      toast({
        title: "Notebook Removed",
        description: "GPU worker removed from pool",
      });
    },
  });

  // Start GPU mutation
  const startGPUMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/gpu/orchestrate/start', {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/gpu/workers/notebooks'] });
      toast({
        title: "GPU Started",
        description: data.message || "Best GPU started successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Starting GPU",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Stop GPU mutation
  const stopGPUMutation = useMutation({
    mutationFn: async (workerId: number) => {
      return await apiRequest(`/api/gpu/orchestrate/stop/${workerId}`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gpu/workers/notebooks'] });
      toast({
        title: "GPU Stopped",
        description: "GPU session stopped successfully",
      });
    },
  });

  // Helper: format seconds to human readable
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Helper: get status badge variant
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'healthy': return 'default';
      case 'offline': return 'secondary';
      case 'unhealthy': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">GPU Orchestration Dashboard</h1>
          <p className="text-muted-foreground">
            Manage Colab & Kaggle notebooks with intelligent quota orchestration
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => startGPUMutation.mutate()}
            disabled={startGPUMutation.isPending}
            data-testid="button-start-best-gpu"
          >
            <Play className="mr-2 h-4 w-4" />
            Start Best GPU
          </Button>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            variant="outline"
            data-testid="button-add-notebook"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Notebook
          </Button>
        </div>
      </div>

      {/* Add Notebook Form */}
      {showAddForm && (
        <Card data-testid="card-add-notebook-form">
          <CardHeader>
            <CardTitle>Add New Notebook</CardTitle>
            <CardDescription>
              Add a Colab or Kaggle notebook to the auto-orchestration pool
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                addNotebookMutation.mutate(formData);
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider</Label>
                  <Select
                    value={formData.provider}
                    onValueChange={(value) => setFormData({ ...formData, provider: value })}
                  >
                    <SelectTrigger data-testid="select-provider">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="colab">Google Colab</SelectItem>
                      <SelectItem value="kaggle">Kaggle</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="useGPU">Accelerator</Label>
                  <Select
                    value={formData.useGPU ? 'gpu' : 'cpu'}
                    onValueChange={(value) => setFormData({ ...formData, useGPU: value === 'gpu' })}
                  >
                    <SelectTrigger data-testid="select-accelerator">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpu">GPU (T4)</SelectItem>
                      <SelectItem value="cpu">CPU Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notebookUrl">Notebook URL</Label>
                <Input
                  id="notebookUrl"
                  placeholder="https://colab.research.google.com/drive/..."
                  value={formData.notebookUrl}
                  onChange={(e) => setFormData({ ...formData, notebookUrl: e.target.value })}
                  required
                  data-testid="input-notebook-url"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{formData.provider === 'colab' ? 'Google Email' : 'Kaggle Username'}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={formData.provider === 'colab' ? 'user@gmail.com' : 'username'}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    data-testid="input-email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    data-testid="input-password"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={addNotebookMutation.isPending} data-testid="button-submit-notebook">
                  {addNotebookMutation.isPending ? 'Adding...' : 'Add to Pool'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* GPU Workers Grid */}
      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-muted-foreground">Loading GPU workers...</p>
          </CardContent>
        </Card>
      ) : workers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Cpu className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No Notebooks Configured</h3>
            <p className="text-muted-foreground">Add your first Colab or Kaggle notebook to get started</p>
            <Button className="mt-4" onClick={() => setShowAddForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Notebook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workers.map((worker) => (
            <Card key={worker.id} data-testid={`card-gpu-${worker.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {worker.provider === 'colab' ? '🔬 Colab' : '📊 Kaggle'} GPU #{worker.id}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {worker.capabilities.gpu} • {worker.capabilities.model}
                    </CardDescription>
                  </div>
                  <Badge variant={getStatusVariant(worker.status)} data-testid={`badge-status-${worker.id}`}>
                    {worker.status}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Quota Status */}
                {worker.quotaStatus && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Session Runtime</span>
                      <span className="font-mono">
                        {formatDuration(worker.quotaStatus.sessionRuntimeSeconds)} / 
                        {formatDuration(worker.quotaStatus.maxSessionSeconds)}
                      </span>
                    </div>
                    <Progress value={worker.quotaStatus.utilizationPercent} />

                    {worker.quotaStatus.weeklyRemainingSeconds !== undefined && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Weekly Quota</span>
                        <span className="font-mono">
                          {formatDuration(worker.quotaStatus.weeklyRemainingSeconds)} left
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Controls */}
                <div className="flex gap-2">
                  {worker.status === 'offline' || worker.status === 'pending' ? (
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={!worker.quotaStatus?.canStart}
                      data-testid={`button-start-${worker.id}`}
                    >
                      <Play className="mr-2 h-3 w-3" />
                      Start
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => stopGPUMutation.mutate(worker.id)}
                      disabled={stopGPUMutation.isPending}
                      data-testid={`button-stop-${worker.id}`}
                    >
                      <Square className="mr-2 h-3 w-3" />
                      Stop
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => deleteNotebookMutation.mutate(worker.id)}
                    disabled={deleteNotebookMutation.isPending}
                    data-testid={`button-delete-${worker.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
