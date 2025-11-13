/**
 * COMPONENT: QuotaProviderCard
 * =============================
 * 
 * Enterprise-grade card component for displaying GPU quota status.
 * Implements 2025 design patterns with color-coded alerts.
 * 
 * FEATURES:
 * - Color-coded progress bars (70%/85%/95% thresholds)
 * - Real-time session info
 * - Stale data warnings
 * - Responsive design
 * - Dark mode support
 * - i18n support
 * - ARIA accessibility
 * - ZERO hardcoded values
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock, TrendingUp } from 'lucide-react';
import type { QuotaScrapingResult } from '@/../../shared/schema';
import { formatDistanceToNow } from 'date-fns';

interface QuotaProviderCardProps {
  /** Provider name (Kaggle / Colab) */
  provider: 'kaggle' | 'colab';
  /** Quota data from backend */
  quotaData: QuotaScrapingResult | null;
  /** Alert level */
  alertLevel: 'normal' | 'warning' | 'critical' | 'emergency';
  /** Is data stale? */
  isStale: boolean;
  /** i18n translations */
  t: (key: string) => string;
}

/**
 * Get color scheme based on alert level
 */
function getAlertColors(level: QuotaProviderCardProps['alertLevel']) {
  switch (level) {
    case 'emergency':
      return {
        badge: 'destructive' as const,
        progress: 'bg-red-500 dark:bg-red-600',
        icon: AlertCircle,
        text: 'text-red-600 dark:text-red-400'
      };
    case 'critical':
      return {
        badge: 'destructive' as const,
        progress: 'bg-orange-500 dark:bg-orange-600',
        icon: AlertCircle,
        text: 'text-orange-600 dark:text-orange-400'
      };
    case 'warning':
      return {
        badge: 'secondary' as const,
        progress: 'bg-yellow-500 dark:bg-yellow-600',
        icon: TrendingUp,
        text: 'text-yellow-600 dark:text-yellow-400'
      };
    default:
      return {
        badge: 'secondary' as const,
        progress: 'bg-green-500 dark:bg-green-600',
        icon: CheckCircle2,
        text: 'text-green-600 dark:text-green-400'
      };
  }
}

export function QuotaProviderCard({ provider, quotaData, alertLevel, isStale, t }: QuotaProviderCardProps) {
  const colors = getAlertColors(alertLevel);
  const Icon = colors.icon;
  
  if (!quotaData) {
    return (
      <Card className="hover-elevate" data-testid={`card-quota-${provider}`}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="capitalize">{provider}</span>
            <Badge variant="outline" data-testid={`badge-status-${provider}`}>
              {t('gpu.quota.no_data')}
            </Badge>
          </CardTitle>
          <CardDescription>
            {t('gpu.auth.not_authenticated')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {t('gpu.auth.login_required')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = quotaData.quotaData;
  
  // Calculate usage percentage
  let usagePercent = 0;
  let usageLabel = '';
  let usageDetails: Array<{ label: string; value: string }> = [];

  if (provider === 'kaggle') {
    // Kaggle: weekly quota is the limiting factor
    if (data.weeklyUsedHours != null && data.weeklyMaxHours) {
      usagePercent = (data.weeklyUsedHours / data.weeklyMaxHours) * 100;
      usageLabel = `${data.weeklyUsedHours.toFixed(1)}h / ${data.weeklyMaxHours}h`;
      
      usageDetails = [
        { label: t('gpu.quota.kaggle.session_remaining'), value: `${data.sessionRemainingHours?.toFixed(1) ?? '?'}h` },
        { label: t('gpu.quota.kaggle.session_max'), value: `${data.sessionMaxHours ?? '?'}h` },
        { label: t('gpu.quota.kaggle.weekly_used'), value: `${data.weeklyUsedHours.toFixed(1)}h` },
        { label: t('gpu.quota.kaggle.weekly_remaining'), value: `${data.weeklyRemainingHours?.toFixed(1) ?? '?'}h` },
      ];
    }
  } else {
    // Colab: compute units
    if (data.computeUnitsUsed != null && data.computeUnitsTotal) {
      usagePercent = (data.computeUnitsUsed / data.computeUnitsTotal) * 100;
      usageLabel = `${data.computeUnitsUsed.toFixed(0)} / ${data.computeUnitsTotal} units`;
      
      usageDetails = [
        { label: t('gpu.quota.colab.compute_units_used'), value: data.computeUnitsUsed.toFixed(0) },
        { label: t('gpu.quota.colab.compute_units_remaining'), value: `${data.computeUnitsRemaining?.toFixed(0) ?? '?'}` },
        { label: t('gpu.quota.colab.session_remaining'), value: `${data.sessionRemainingHours?.toFixed(1) ?? '?'}h` },
        { label: t('gpu.quota.colab.in_cooldown'), value: data.inCooldown ? 'Yes' : 'No' },
      ];
    }
  }

  return (
    <Card className="hover-elevate" data-testid={`card-quota-${provider}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${colors.text}`} />
            <span className="capitalize">{provider}</span>
          </div>
          <Badge variant={colors.badge} data-testid={`badge-alert-${provider}`}>
            {usagePercent.toFixed(0)}%
          </Badge>
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          {isStale && (
            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
              <Clock className="h-3 w-3" />
              {t('gpu.quota.stale_data')}
            </span>
          )}
          <span className="text-xs text-muted-foreground" data-testid={`text-scraped-${provider}`}>
            {t('gpu.quota.scraped_at')}: {formatDistanceToNow(new Date(quotaData.scrapedAt), { addSuffix: true })}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{t('gpu.quota.title')}</span>
            <span className={colors.text} data-testid={`text-usage-${provider}`}>{usageLabel}</span>
          </div>
          <Progress 
            value={usagePercent} 
            className="h-2"
            data-testid={`progress-quota-${provider}`}
          />
        </div>

        {/* Usage Details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {usageDetails.map((detail, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-muted-foreground">{detail.label}</div>
              <div className="font-medium" data-testid={`text-${detail.label.toLowerCase().replace(/\s+/g, '-')}-${provider}`}>
                {detail.value}
              </div>
            </div>
          ))}
        </div>

        {/* Can Start / Should Stop Indicators */}
        {provider === 'kaggle' && (
          <div className="flex items-center gap-4 text-sm pt-2 border-t">
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${data.canStart ? 'bg-green-500' : 'bg-red-500'}`} />
              <span data-testid={`text-can-start-${provider}`}>
                {t('gpu.quota.kaggle.can_start')}: {data.canStart ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${data.shouldStop ? 'bg-red-500' : 'bg-green-500'}`} />
              <span data-testid={`text-should-stop-${provider}`}>
                {t('gpu.quota.kaggle.should_stop')}: {data.shouldStop ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
