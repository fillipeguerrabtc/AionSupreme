/**
 * COMPONENT: QuotaAlertBanner
 * ============================
 * 
 * Enterprise-grade alert banner for quota warnings.
 * Displays critical alerts when quota usage exceeds thresholds.
 * 
 * FEATURES:
 * - Color-coded alerts (70%/85%/95% thresholds)
 * - Dismissible banners
 * - Action buttons (sync, reduce workload)
 * - Dark mode support
 * - i18n support
 * - ARIA accessibility
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, AlertCircle, XCircle, X } from 'lucide-react';
import { useState } from 'react';
import type { Translations } from '@/lib/i18n';

interface QuotaAlertBannerProps {
  /** Alert level */
  level: 'warning' | 'critical' | 'emergency';
  /** Provider name */
  provider: 'kaggle' | 'colab';
  /** Usage percentage */
  percentage: number;
  /** Alert message */
  message: string;
  /** Callback for sync action */
  onSync?: () => void;
  /** Typed translations for quota alerts */
  translations: Translations['admin']['gpuManagement']['quotaAlerts'];
  /** data-testid for testing */
  'data-testid'?: string;
}

function getAlertConfig(level: QuotaAlertBannerProps['level']) {
  switch (level) {
    case 'emergency':
      return {
        icon: XCircle,
        className: 'border-red-500 bg-red-50 dark:bg-red-950/20 text-red-900 dark:text-red-100',
        titleClassName: 'text-red-800 dark:text-red-200',
        iconClassName: 'text-red-600 dark:text-red-400'
      };
    case 'critical':
      return {
        icon: AlertCircle,
        className: 'border-orange-500 bg-orange-50 dark:bg-orange-950/20 text-orange-900 dark:text-orange-100',
        titleClassName: 'text-orange-800 dark:text-orange-200',
        iconClassName: 'text-orange-600 dark:text-orange-400'
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        className: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-900 dark:text-yellow-100',
        titleClassName: 'text-yellow-800 dark:text-yellow-200',
        iconClassName: 'text-yellow-600 dark:text-yellow-400'
      };
  }
}

export function QuotaAlertBanner({ 
  level, 
  provider, 
  percentage, 
  message, 
  onSync,
  translations,
  'data-testid': testId 
}: QuotaAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  
  if (dismissed) return null;

  const config = getAlertConfig(level);
  const Icon = config.icon;

  // Title with provider capitalization
  const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
  const title = translations.titleTemplate
    .replace('{provider}', providerName)
    .replace('{percentage}', percentage.toFixed(0));

  return (
    <Alert 
      className={`relative ${config.className}`}
      data-testid={testId || `alert-quota-${level}`}
      role="alert"
    >
      <Icon className={`h-4 w-4 ${config.iconClassName}`} />
      
      {/* Dismiss button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 hover:bg-transparent"
        onClick={() => setDismissed(true)}
        aria-label={translations.dismiss}
        data-testid={`button-dismiss-${level}`}
      >
        <X className="h-4 w-4" />
      </Button>

      <AlertTitle className={config.titleClassName}>
        {title}
      </AlertTitle>
      
      <AlertDescription className="mt-2 space-y-3">
        <p>{message}</p>
        
        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {onSync && (
            <Button 
              size="sm" 
              variant="outline"
              onClick={onSync}
              data-testid={`button-sync-${level}`}
              className="hover-elevate"
            >
              {translations.syncButton}
            </Button>
          )}
          
          {level === 'emergency' && (
            <span className="text-sm font-medium">
              {translations.emergencyAction}
            </span>
          )}
          
          {level === 'critical' && (
            <span className="text-sm font-medium">
              {translations.criticalWarning}
            </span>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
