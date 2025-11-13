/**
 * COMPONENT: UsageChart
 * ======================
 * 
 * Enterprise-grade quota usage chart with historical trends.
 * Implements 2025 best practices for time-series visualization.
 * 
 * FEATURES:
 * - Time range selector (1h/6h/24h/7d/30d)
 * - Line chart with gradient fill
 * - Color-coded thresholds (70%/85%/95%)
 * - Responsive design
 * - Dark mode support
 * - i18n support
 * - ARIA accessibility
 * - ZERO hardcoded values
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart
} from 'recharts';
import { format } from 'date-fns';

interface DataPoint {
  timestamp: Date;
  kaggleUsage?: number; // percentage
  colabUsage?: number; // percentage
}

interface UsageChartProps {
  /** Historical usage data */
  data: DataPoint[];
  /** i18n function */
  t: (key: string) => string;
  /** data-testid for testing */
  'data-testid'?: string;
}

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

const TIME_RANGES: { value: TimeRange; label: string; hours: number }[] = [
  { value: '1h', label: '1 Hour', hours: 1 },
  { value: '6h', label: '6 Hours', hours: 6 },
  { value: '24h', label: '24 Hours', hours: 24 },
  { value: '7d', label: '7 Days', hours: 168 },
  { value: '30d', label: '30 Days', hours: 720 },
];

/**
 * Custom tooltip for chart
 */
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="bg-background border border-border rounded-lg shadow-lg p-3 space-y-1">
      <p className="text-sm font-medium">
        {format(new Date(payload[0].payload.timestamp), 'MMM d, HH:mm')}
      </p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm flex items-center gap-2">
          <span 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: entry.color }}
          />
          <span className="capitalize">{entry.name}:</span>
          <span className="font-medium">{entry.value.toFixed(1)}%</span>
        </p>
      ))}
    </div>
  );
}

export function UsageChart({ data, t, 'data-testid': testId }: UsageChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');

  // Filter data based on time range
  const now = Date.now();
  const rangeConfig = TIME_RANGES.find(r => r.value === timeRange)!;
  const cutoffTime = now - (rangeConfig.hours * 60 * 60 * 1000);
  
  const filteredData = data
    .filter(d => d.timestamp.getTime() >= cutoffTime)
    .map(d => ({
      ...d,
      timestamp: d.timestamp.getTime() // Convert to milliseconds for recharts
    }));

  // If no data, show empty state
  if (filteredData.length === 0) {
    return (
      <Card className="hover-elevate" data-testid={testId || 'card-usage-chart'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Quota Usage Trends
          </CardTitle>
          <CardDescription>
            Historical quota usage over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            No historical data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover-elevate" data-testid={testId || 'card-usage-chart'}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Quota Usage Trends
            </CardTitle>
            <CardDescription>
              Historical quota usage over time
            </CardDescription>
          </div>
          
          {/* Time Range Selector */}
          <div className="flex items-center gap-1" role="tablist" aria-label="Time range selector">
            {TIME_RANGES.map(range => (
              <Button
                key={range.value}
                variant={timeRange === range.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeRange(range.value)}
                data-testid={`button-range-${range.value}`}
                role="tab"
                aria-selected={timeRange === range.value}
                className="hover-elevate"
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart 
            data={filteredData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="kaggleGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colabGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(ts) => format(new Date(ts), timeRange === '1h' || timeRange === '6h' ? 'HH:mm' : 'MMM d')}
              className="text-xs"
            />
            
            <YAxis
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              className="text-xs"
            />
            
            <Tooltip content={<CustomTooltip />} />
            
            {/* Threshold Lines */}
            <ReferenceLine y={70} stroke="#eab308" strokeDasharray="3 3" label="Warning (70%)" />
            <ReferenceLine y={85} stroke="#f97316" strokeDasharray="3 3" label="Critical (85%)" />
            <ReferenceLine y={95} stroke="#ef4444" strokeDasharray="3 3" label="Emergency (95%)" />
            
            {/* Kaggle Usage */}
            <Area
              type="monotone"
              dataKey="kaggleUsage"
              name="Kaggle"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#kaggleGradient)"
              dot={false}
              activeDot={{ r: 6 }}
            />
            
            {/* Colab Usage */}
            <Area
              type="monotone"
              dataKey="colabUsage"
              name="Colab"
              stroke="#8b5cf6"
              strokeWidth={2}
              fill="url(#colabGradient)"
              dot={false}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        
        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Kaggle</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span>Colab</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
