/**
 * COMPONENT: AuthStatusBadge
 * ===========================
 * 
 * Enterprise-grade badge for displaying Google OAuth authentication status.
 * 
 * FEATURES:
 * - Color-coded status (authenticated/expired/not_authenticated)
 * - Icon indicators
 * - Expiration warnings (<7 days)
 * - Dark mode support
 * - Type-safe i18n with compile-time coverage
 * - ARIA accessibility
 */

import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, XCircle, Clock } from 'lucide-react';
import type { Translations } from '@/lib/i18n';
import { requireTranslation } from './gpu-utils';

interface AuthStatusBadgeProps {
  /** Authentication status */
  status: 'authenticated' | 'expired' | 'not_authenticated' | 'expiring_soon';
  /** Account email (optional) */
  email?: string;
  /** Days until expiration (optional) */
  daysUntilExpiration?: number;
  /** i18n translations subtree */
  translations: Translations['admin']['gpuManagement'];
  /** data-testid for testing */
  'data-testid'?: string;
}

function getStatusConfig(status: AuthStatusBadgeProps['status']) {
  switch (status) {
    case 'authenticated':
      return {
        variant: 'default' as const,
        icon: CheckCircle2,
        className: 'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700',
        label: 'Authenticated'
      };
    case 'expired':
      return {
        variant: 'destructive' as const,
        icon: XCircle,
        className: 'bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700',
        label: 'Expired'
      };
    case 'expiring_soon':
      return {
        variant: 'secondary' as const,
        icon: Clock,
        className: 'bg-yellow-500 hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700',
        label: 'Expiring Soon'
      };
    default:
      return {
        variant: 'outline' as const,
        icon: AlertCircle,
        className: '',
        label: 'Not Authenticated'
      };
  }
}

export function AuthStatusBadge({ 
  status, 
  email, 
  daysUntilExpiration, 
  translations,
  'data-testid': testId 
}: AuthStatusBadgeProps) {
  const config = getStatusConfig(status);
  const Icon = config.icon;

  // Map status to translation keys (snake_case → camelCase)
  const statusKeyMap: Record<AuthStatusBadgeProps['status'], keyof Translations['admin']['gpuManagement']['auth']> = {
    'authenticated': 'authenticated',
    'not_authenticated': 'notAuthenticated',
    'expiring_soon': 'expiringSoon',
    'expired': 'expired',
  };

  const translationKey = statusKeyMap[status];
  const label = requireTranslation(
    translations.auth[translationKey] as string,
    `auth.${translationKey}`
  );

  return (
    <Badge 
      variant={config.variant}
      className={`flex items-center gap-1.5 ${config.className}`}
      data-testid={testId || 'badge-auth-status'}
      title={email || undefined}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      {daysUntilExpiration !== undefined && (
        <span className="ml-1 text-xs opacity-90">
          ({daysUntilExpiration}d)
        </span>
      )}
    </Badge>
  );
}
