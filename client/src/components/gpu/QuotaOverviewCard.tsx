/**
 * QUOTA OVERVIEW CARD - ENTERPRISE 2025
 * =====================================
 * 
 * Compact GPU quota status card for Overview page (Visão Geral)
 * Shows Kaggle + Colab quota at-a-glance with color-coded alerts
 * 
 * ORCHESTRATION RULES (CRITICAL - BAN RISK):
 * 
 * COLAB - Schedule Fixo:
 * - Liga → 8.4h → Desliga → 36h rest → Repete
 * - ❌ NUNCA on-demand
 * - ✅ Schedule automático
 * - Violar = BAN permanente!
 * 
 * KAGGLE - On-Demand + Idle:
 * - Liga quando tarefa chega (training/inference/KB/internet)
 * - Executa → Aguarda 10min idle
 * - Nova tarefa? → Executa + 10min novamente
 * - Sem tarefa em 10min? → DESLIGA
 * - Quotas: Session 8.4h (70% × 12h), Weekly 21h (70% × 30h)
 * - Violar = BAN permanente!
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  AlertCircle,
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react';
import { useQuotaStatus } from '@/hooks/useQuotaStatus';
import { useQuotaSync } from '@/hooks/useQuotaSync';
import { Link } from 'wouter';

interface QuotaOverviewCardProps {
  className?: string;
}

export function QuotaOverviewCard({ className }: QuotaOverviewCardProps) {
  const quotaQuery = useQuotaStatus({
    refreshInterval: 30000, // 30s auto-refresh
  });
  
  const { sync, isSyncing } = useQuotaSync();
  
  // Extract quota data from query
  const quotaStatus = quotaQuery.data;

  // Calculate overall status
  const hasKaggle = !!quotaStatus?.kaggle;
  const hasColab = !!quotaStatus?.colab;
  const hasAnyQuota = hasKaggle || hasColab;

  // Get highest alert level
  const getHighestAlert = () => {
    if (!quotaStatus) return 'safe';
    
    let maxLevel = 0;
    
    // Check Kaggle alert
    if (quotaStatus.kaggleAlert) {
      const levelMap: Record<string, number> = {
        'normal': 0,
        'warning': 1,
        'critical': 2,
        'emergency': 3,
      };
      maxLevel = Math.max(maxLevel, levelMap[quotaStatus.kaggleAlert.level] || 0);
    }

    // Check Colab alert
    if (quotaStatus.colabAlert) {
      const levelMap: Record<string, number> = {
        'normal': 0,
        'warning': 1,
        'critical': 2,
        'emergency': 3,
      };
      maxLevel = Math.max(maxLevel, levelMap[quotaStatus.colabAlert.level] || 0);
    }

    const levelNames: Record<number, string> = {
      0: 'safe',
      1: 'warning',
      2: 'critical',
      3: 'emergency',
    };

    return levelNames[maxLevel];
  };

  const highestAlert = hasAnyQuota ? getHighestAlert() : 'safe';

  // Color schemes based on alert level
  const alertColors = {
    safe: {
      border: 'border-green-500/30',
      bg: 'bg-green-500/10',
      text: 'text-green-400',
      icon: CheckCircle2,
    },
    warning: {
      border: 'border-yellow-500/30',
      bg: 'bg-yellow-500/10',
      text: 'text-yellow-400',
      icon: AlertTriangle,
    },
    critical: {
      border: 'border-orange-500/30',
      bg: 'bg-orange-500/10',
      text: 'text-orange-400',
      icon: AlertTriangle,
    },
    emergency: {
      border: 'border-red-500/30',
      bg: 'bg-red-500/10',
      text: 'text-red-400',
      icon: AlertTriangle,
    },
  };

  const alertConfig = alertColors[highestAlert as keyof typeof alertColors];
  const AlertIcon = alertConfig.icon;

  if (!hasAnyQuota) {
    return (
      <Card className={`glass-premium border-accent/20 ${className}`} data-testid="quota-overview-card-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5" />
            Status de Quotas GPU
          </CardTitle>
          <CardDescription>
            Monitore o uso de GPU em tempo real
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Shield className="w-12 h-12 text-muted-foreground opacity-50 mb-4" />
            <p className="text-sm text-muted-foreground mb-2">
              Nenhuma conta Google conectada
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Conecte uma conta para monitorar quotas
            </p>
            <Link href="/admin?tab=gpu">
              <Button variant="default" size="sm" data-testid="button-connect-from-overview">
                <Shield className="w-4 h-4 mr-2" />
                Conectar Conta
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`glass-premium ${alertConfig.border} ${className}`} data-testid="quota-overview-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5" />
            Status de Quotas GPU
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={highestAlert === 'safe' ? 'default' : 'destructive'} className="flex items-center gap-1">
              <AlertIcon className="w-3 h-3" />
              {highestAlert === 'safe' ? 'Normal' : 
               highestAlert === 'warning' ? 'Atenção' :
               highestAlert === 'critical' ? 'Crítico' : 'Emergência'}
            </Badge>
            {quotaStatus?.isStale && (
              <Badge variant="outline" className="text-xs">
                <Clock className="w-3 h-3 mr-1" />
                Desatualizado
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Monitore o consumo de GPU Kaggle e Colab em tempo real
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KAGGLE QUOTA */}
        {hasKaggle && quotaStatus.kaggle && (
          quotaStatus.kaggle.scrapingSuccess === false ? (
            // Show error state if scraping failed
            <div className="space-y-2 p-4 border border-red-500/30 rounded-lg bg-red-500/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="font-semibold text-sm text-red-400">Kaggle: Erro ao Obter Quotas</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {quotaStatus.kaggle.scrapingError || 'Falha ao conectar com Kaggle. Tente sincronizar novamente.'}
              </p>
            </div>
          ) : !quotaStatus.kaggle.quotaData ? (
            // Show "no data" state if quotaData is missing
            <div className="space-y-2 p-4 border border-yellow-500/30 rounded-lg bg-yellow-500/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="font-semibold text-sm text-yellow-400">Kaggle: Dados Indisponíveis</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Nenhum dado de quota disponível. Execute uma sincronização manual.
              </p>
            </div>
          ) : quotaStatus.kaggle.quotaData && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-sm">Kaggle</span>
                <Badge variant="outline" className="text-xs">
                  On-Demand + Idle (10min)
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Semanal: {(quotaStatus.kaggle.quotaData.weeklyUsedHours || 0).toFixed(1)}h / {quotaStatus.kaggle.quotaData.weeklyMaxHours?.toFixed(0) || '...'}h
              </span>
            </div>
            <Progress
              value={quotaStatus.kaggle.quotaData.weeklyMaxHours ? ((quotaStatus.kaggle.quotaData.weeklyUsedHours || 0) / quotaStatus.kaggle.quotaData.weeklyMaxHours) * 100 : 0}
              className="h-2"
              data-testid="progress-kaggle-weekly"
            />
            <div className="flex items-center justify-between text-xs">
              <span className={
                quotaStatus.kaggle.quotaData.weeklyMaxHours && ((quotaStatus.kaggle.quotaData.weeklyUsedHours || 0) / quotaStatus.kaggle.quotaData.weeklyMaxHours * 100) >= 95
                  ? 'text-red-400 font-semibold'
                  : quotaStatus.kaggle.quotaData.weeklyMaxHours && ((quotaStatus.kaggle.quotaData.weeklyUsedHours || 0) / quotaStatus.kaggle.quotaData.weeklyMaxHours * 100) >= 85
                  ? 'text-orange-400 font-semibold'
                  : quotaStatus.kaggle.quotaData.weeklyMaxHours && ((quotaStatus.kaggle.quotaData.weeklyUsedHours || 0) / quotaStatus.kaggle.quotaData.weeklyMaxHours * 100) >= 70
                  ? 'text-yellow-400'
                  : 'text-green-400'
              }>
                {quotaStatus.kaggle.quotaData.weeklyMaxHours ? ((quotaStatus.kaggle.quotaData.weeklyUsedHours || 0) / quotaStatus.kaggle.quotaData.weeklyMaxHours * 100).toFixed(1) : '0.0'}% usado
              </span>
              <span className="text-muted-foreground flex items-center gap-1">
                {quotaStatus.kaggle.quotaData.canStart ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                    Pode iniciar
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3 h-3 text-red-400" />
                    Quota esgotada
                  </>
                )}
              </span>
            </div>
          </div>
          )
        )}

        {/* COLAB QUOTA */}
        {hasColab && quotaStatus.colab && (
          quotaStatus.colab.scrapingSuccess === false ? (
            // Show error state if scraping failed
            <div className="space-y-2 p-4 border border-red-500/30 rounded-lg bg-red-500/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="font-semibold text-sm text-red-400">Colab: Erro ao Obter Quotas</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {quotaStatus.colab.scrapingError || 'Falha ao conectar com Google Colab. Tente sincronizar novamente.'}
              </p>
            </div>
          ) : !quotaStatus.colab.quotaData ? (
            // Show "no data" state if quotaData is missing
            <div className="space-y-2 p-4 border border-yellow-500/30 rounded-lg bg-yellow-500/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
                <span className="font-semibold text-sm text-yellow-400">Colab: Dados Indisponíveis</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Nenhum dado de quota disponível. Execute uma sincronização manual.
              </p>
            </div>
          ) : quotaStatus.colab.quotaData && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-purple-400" />
                <span className="font-semibold text-sm">Google Colab</span>
                <Badge variant="outline" className="text-xs">
                  Schedule Fixo (36h cooldown)
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                Unidades: {(quotaStatus.colab.quotaData.computeUnitsUsed || 0).toFixed(1)} / {quotaStatus.colab.quotaData.computeUnitsTotal?.toFixed(0) || '...'}
              </span>
            </div>
            <Progress
              value={quotaStatus.colab.quotaData.computeUnitsTotal ? ((quotaStatus.colab.quotaData.computeUnitsUsed || 0) / quotaStatus.colab.quotaData.computeUnitsTotal) * 100 : 0}
              className="h-2"
              data-testid="progress-colab-session"
            />
            <div className="flex items-center justify-between text-xs">
              <span className={
                quotaStatus.colab.quotaData.computeUnitsTotal && ((quotaStatus.colab.quotaData.computeUnitsUsed || 0) / quotaStatus.colab.quotaData.computeUnitsTotal * 100) >= 95
                  ? 'text-red-400 font-semibold'
                  : quotaStatus.colab.quotaData.computeUnitsTotal && ((quotaStatus.colab.quotaData.computeUnitsUsed || 0) / quotaStatus.colab.quotaData.computeUnitsTotal * 100) >= 85
                  ? 'text-orange-400 font-semibold'
                  : quotaStatus.colab.quotaData.computeUnitsTotal && ((quotaStatus.colab.quotaData.computeUnitsUsed || 0) / quotaStatus.colab.quotaData.computeUnitsTotal * 100) >= 70
                  ? 'text-yellow-400'
                  : 'text-green-400'
              }>
                {quotaStatus.colab.quotaData.computeUnitsTotal ? ((quotaStatus.colab.quotaData.computeUnitsUsed || 0) / quotaStatus.colab.quotaData.computeUnitsTotal * 100).toFixed(1) : '0.0'}% usado
              </span>
              <span className="text-muted-foreground flex items-center gap-1">
                {quotaStatus.colab.quotaData.canStart ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                    Pode iniciar
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3 text-red-400" />
                    Em cooldown
                  </>
                )}
              </span>
            </div>
          </div>
          )
        )}

        {/* ACTIONS */}
        <div className="flex items-center justify-between pt-2 border-t">
          <Link href="/admin?tab=gpu">
            <Button variant="ghost" size="sm" data-testid="button-view-details">
              Ver Detalhes Completos
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sync()}
            disabled={isSyncing}
            data-testid="button-sync-quotas-overview"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
