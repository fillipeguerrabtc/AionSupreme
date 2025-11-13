/**
 * COMPONENT: CountdownTimer
 * ==========================
 * 
 * Enterprise-grade countdown timer component.
 * Shows time remaining until target date with auto-refresh.
 * 
 * FEATURES:
 * - Auto-updating countdown (every second)
 * - Multiple display formats (HH:MM:SS, readable)
 * - Color variants (default/warning/critical)
 * - Dark mode support
 * - ARIA accessibility
 */

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface CountdownTimerProps {
  /** Target date/time to count down to */
  targetDate: Date;
  /** Optional label */
  label?: string;
  /** Visual variant */
  variant?: 'default' | 'warning' | 'critical';
  /** Display format */
  format?: 'compact' | 'readable';
  /** data-testid for testing */
  'data-testid'?: string;
}

function getVariantClass(variant: CountdownTimerProps['variant']) {
  switch (variant) {
    case 'critical':
      return 'text-red-600 dark:text-red-400';
    case 'warning':
      return 'text-yellow-600 dark:text-yellow-400';
    default:
      return 'text-foreground';
  }
}

function formatDuration(ms: number, format: CountdownTimerProps['format'] = 'compact'): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (format === 'readable') {
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  }

  // Compact format: HH:MM:SS or D:HH:MM:SS
  if (days > 0) {
    return `${days}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function CountdownTimer({ 
  targetDate, 
  label, 
  variant = 'default', 
  format = 'compact',
  'data-testid': testId 
}: CountdownTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(
    Math.max(0, targetDate.getTime() - Date.now())
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, targetDate.getTime() - Date.now());
      setTimeRemaining(remaining);
      
      // Stop updating when countdown reaches 0
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  const variantClass = getVariantClass(variant);
  const formattedTime = formatDuration(timeRemaining, format);
  const isExpired = timeRemaining === 0;

  return (
    <div 
      className={`flex items-center gap-1.5 text-sm font-mono ${variantClass}`}
      data-testid={testId}
      aria-label={label ? `${label}: ${formattedTime}` : formattedTime}
    >
      {label && (
        <span className="font-sans text-xs opacity-80">{label}:</span>
      )}
      <Clock className="h-3.5 w-3.5 opacity-80" aria-hidden="true" />
      <span className="font-medium">
        {isExpired ? 'Expired' : formattedTime}
      </span>
    </div>
  );
}
