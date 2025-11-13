/**
 * GPU WORKERS CARD - ENTERPRISE 2025
 * ===================================
 * 
 * Compact GPU workers status card for Overview page (Visão Geral)
 * Shows workers at-a-glance with color-coded status
 * 
 * FEATURES:
 * - Worker count by status (healthy/unhealthy/offline)
 * - Performance metrics (requests, latency)
 * - Auto-refresh (30s default)
 * - Quick actions (add worker, view all)
 * - ZERO hardcoded values - 100% PostgreSQL
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Server, 
  Plus, 
  TrendingUp,
  Circle,
  Activity,
  Zap,
  AlertTriangle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useState } from 'react';
import { AddWorkerDialog } from '@/components/admin/AddWorkerDialog';

interface GPUWorkersCardProps {
  className?: string;
}

interface PoolStats {
  total: number;
  healthy: number;
  unhealthy: number;
  offline: number;
  totalRequests: number;
  averageLatencyMs: number;
}

export function GPUWorkersCard({ className }: GPUWorkersCardProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Fetch GPU pool overview
  const { data: gpuData, isLoading } = useQuery({
    queryKey: ['/api/gpu/overview'],
    refetchInterval: showAddDialog ? false : 30000, // Pause when dialog open
  });

  const stats: PoolStats = {
    total: (gpuData as any)?.stats?.total || 0,
    healthy: (gpuData as any)?.stats?.healthy || 0,
    unhealthy: (gpuData as any)?.stats?.unhealthy || 0,
    offline: (gpuData as any)?.stats?.offline || 0,
    totalRequests: (gpuData as any)?.stats?.totalRequests || 0,
    averageLatencyMs: (gpuData as any)?.stats?.avgLatency || 0,
  };

  // Determine overall health
  const getOverallHealth = () => {
    if (stats.total === 0) return 'none';
    if (stats.healthy === stats.total) return 'excellent';
    if (stats.healthy >= stats.total * 0.7) return 'good';
    if (stats.healthy >= stats.total * 0.4) return 'degraded';
    return 'critical';
  };

  const health = getOverallHealth();

  // Color schemes based on health
  const healthColors = {
    none: {
      border: 'border-muted',
      text: 'text-muted-foreground',
      icon: Server,
    },
    excellent: {
      border: 'border-green-500/30',
      text: 'text-green-400',
      icon: Circle,
    },
    good: {
      border: 'border-blue-500/30',
      text: 'text-blue-400',
      icon: Circle,
    },
    degraded: {
      border: 'border-yellow-500/30',
      text: 'text-yellow-400',
      icon: AlertTriangle,
    },
    critical: {
      border: 'border-red-500/30',
      text: 'text-red-400',
      icon: AlertTriangle,
    },
  };

  const healthConfig = healthColors[health];
  const HealthIcon = healthConfig.icon;

  if (isLoading) {
    return (
      <Card className={`glass-premium border-accent/20 ${className}`} data-testid="gpu-workers-card-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="w-5 h-5" />
            GPU Workers
          </CardTitle>
          <CardDescription>
            Monitorando workers de GPU...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stats.total === 0) {
    return (
      <Card className={`glass-premium ${healthConfig.border} ${className}`} data-testid="gpu-workers-card-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="w-5 h-5" />
            GPU Workers
          </CardTitle>
          <CardDescription>
            Gerencie workers de GPU
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Server className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
            <p className="text-sm text-muted-foreground mb-2">
              Nenhum worker GPU registrado
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Adicione um worker para começar
            </p>
            <Button 
              variant="default" 
              size="sm"
              onClick={() => setShowAddDialog(true)}
              data-testid="button-add-first-worker"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Worker
            </Button>
          </div>
        </CardContent>
        
        <AddWorkerDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
        />
      </Card>
    );
  }

  return (
    <Card className={`glass-premium ${healthConfig.border} ${className}`} data-testid="gpu-workers-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="w-5 h-5" />
            GPU Workers
          </CardTitle>
          <Badge variant={health === 'excellent' || health === 'good' ? 'default' : 'destructive'} className="flex items-center gap-1">
            <HealthIcon className="w-3 h-3" />
            {health === 'excellent' ? 'Excelente' :
             health === 'good' ? 'Bom' :
             health === 'degraded' ? 'Degradado' : 'Crítico'}
          </Badge>
        </div>
        <CardDescription>
          Pool de {stats.total} worker{stats.total !== 1 ? 's' : ''} GPU
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* STATUS BREAKDOWN */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2">
            <Circle className="w-3 h-3 fill-green-400 text-green-400" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Healthy</div>
              <div className="text-lg font-semibold text-green-400">{stats.healthy}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Circle className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Unhealthy</div>
              <div className="text-lg font-semibold text-yellow-400">{stats.unhealthy}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Circle className="w-3 h-3 fill-red-400 text-red-400" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground">Offline</div>
              <div className="text-lg font-semibold text-red-400">{stats.offline}</div>
            </div>
          </div>
        </div>

        {/* PERFORMANCE METRICS */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <div>
              <div className="text-xs text-muted-foreground">Total Requests</div>
              <div className="text-sm font-semibold">{stats.totalRequests.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            <div>
              <div className="text-xs text-muted-foreground">Avg Latency</div>
              <div className="text-sm font-semibold">{stats.averageLatencyMs.toFixed(0)}ms</div>
            </div>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Link href="/admin?tab=gpu">
            <Button variant="ghost" size="sm" data-testid="button-view-all-workers">
              Ver Todos ({stats.total})
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddDialog(true)}
            data-testid="button-add-worker-overview"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar
          </Button>
        </div>
      </CardContent>

      <AddWorkerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />
    </Card>
  );
}
