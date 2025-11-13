/**
 * COMPONENT: SessionTimeline
 * ===========================
 * 
 * Enterprise-grade timeline component for GPU session visualization.
 * Shows active sessions, cooldowns, and next available slots.
 * 
 * FEATURES:
 * - Visual timeline with color-coded states
 * - Countdown timers for cooldowns
 * - Responsive design
 * - Dark mode support
 * - i18n support
 * - ARIA accessibility
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Play, Pause, AlertTriangle } from 'lucide-react';
import { CountdownTimer } from '../gpu/CountdownTimer';

interface SessionState {
  provider: 'kaggle' | 'colab';
  status: 'idle' | 'active' | 'cooldown' | 'available';
  sessionRemaining?: number; // hours
  cooldownRemaining?: number; // hours
  canStart?: boolean;
  shouldStop?: boolean;
}

interface SessionTimelineProps {
  sessions: SessionState[];
  t: (key: string) => string;
}

function getStatusIcon(status: SessionState['status']) {
  switch (status) {
    case 'active':
      return <Play className="h-4 w-4 text-green-500" />;
    case 'cooldown':
      return <Pause className="h-4 w-4 text-orange-500" />;
    case 'available':
      return <Clock className="h-4 w-4 text-blue-500" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusColor(status: SessionState['status']) {
  switch (status) {
    case 'active':
      return 'bg-green-500 dark:bg-green-600';
    case 'cooldown':
      return 'bg-orange-500 dark:bg-orange-600';
    case 'available':
      return 'bg-blue-500 dark:bg-blue-600';
    default:
      return 'bg-gray-400 dark:bg-gray-600';
  }
}

export function SessionTimeline({ sessions, t }: SessionTimelineProps) {
  if (sessions.length === 0) {
    return (
      <Card className="hover-elevate" data-testid="card-session-timeline">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Session Timeline
          </CardTitle>
          <CardDescription>
            No active sessions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            {t('gpu.auth.not_authenticated')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover-elevate" data-testid="card-session-timeline">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Session Timeline
        </CardTitle>
        <CardDescription>
          Active sessions and cooldowns
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions.map((session, idx) => (
          <div key={idx} className="flex items-center gap-4" data-testid={`timeline-item-${session.provider}`}>
            {/* Provider Icon & Name */}
            <div className="flex items-center gap-2 min-w-[100px]">
              {getStatusIcon(session.status)}
              <span className="font-medium capitalize">{session.provider}</span>
            </div>

            {/* Status Badge */}
            <Badge 
              variant={session.status === 'active' ? 'default' : 'secondary'}
              data-testid={`badge-status-${session.provider}`}
            >
              {session.status}
            </Badge>

            {/* Timeline Bar */}
            <div className="flex-1 flex items-center gap-2">
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all ${getStatusColor(session.status)}`}
                  style={{ 
                    width: session.status === 'active' && session.sessionRemaining
                      ? `${(session.sessionRemaining / 8.4) * 100}%`
                      : session.status === 'cooldown' && session.cooldownRemaining
                      ? `${(session.cooldownRemaining / 36) * 100}%`
                      : '100%'
                  }}
                />
              </div>
            </div>

            {/* Countdown Timer */}
            <div className="min-w-[120px] text-right">
              {session.status === 'active' && session.sessionRemaining ? (
                <CountdownTimer 
                  targetDate={new Date(Date.now() + session.sessionRemaining * 60 * 60 * 1000)}
                  label="Remaining"
                  data-testid={`timer-session-${session.provider}`}
                />
              ) : session.status === 'cooldown' && session.cooldownRemaining ? (
                <CountdownTimer 
                  targetDate={new Date(Date.now() + session.cooldownRemaining * 60 * 60 * 1000)}
                  label="Cooldown"
                  variant="warning"
                  data-testid={`timer-cooldown-${session.provider}`}
                />
              ) : session.status === 'available' ? (
                <span className="text-sm text-green-600 dark:text-green-400" data-testid={`text-available-${session.provider}`}>
                  Ready to start
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">-</span>
              )}
            </div>

            {/* Action Indicators */}
            {session.canStart !== undefined && (
              <div className="flex items-center gap-1">
                <div 
                  className={`h-2 w-2 rounded-full ${session.canStart ? 'bg-green-500' : 'bg-red-500'}`}
                  title={session.canStart ? 'Can start' : 'Cannot start'}
                  data-testid={`indicator-can-start-${session.provider}`}
                />
              </div>
            )}
            {session.shouldStop !== undefined && (
              <div className="flex items-center gap-1">
                <div 
                  className={`h-2 w-2 rounded-full ${session.shouldStop ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}
                  title={session.shouldStop ? 'Should stop' : 'OK to continue'}
                  data-testid={`indicator-should-stop-${session.provider}`}
                />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
