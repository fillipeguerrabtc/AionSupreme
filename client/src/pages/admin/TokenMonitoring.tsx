import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Activity, 
  TrendingUp, 
  DollarSign, 
  Zap, 
  Globe, 
  Search,
  Bell,
  Settings,
  Database,
  BarChart3,
  Clock,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Save
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import html2canvas from 'html2canvas';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart,
  Pie,
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Area,
  AreaChart
} from "recharts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

// TypeScript interfaces for API responses - Matching backend implementations

interface UsageMetrics {
  tokens: number;
  requests: number;
  cost: number;
  errors?: number;
}

interface UsageSummary {
  provider: string;
  today: UsageMetrics;
  month: UsageMetrics;
  limits?: {
    dailyTokenLimit?: number | null;
    monthlyTokenLimit?: number | null;
    dailyCostLimit?: number | null;
    monthlyCostLimit?: number | null;
  };
  status: 'ok' | 'warning' | 'critical';
  percentage: number;
}

interface ProviderQuota {
  provider: string;
  dailyLimit: number;
  used: number;
  remaining: number;
  percentage: number;
  resetTime: Date | string;
}

interface TrendDataPoint {
  date: string;
  [provider: string]: number | string; // Dynamic provider names
}

interface TokenTrends {
  daily: TrendDataPoint[];
  period_days?: number;
}

interface TokenAlert {
  id: number;
  type: 'daily_tokens' | 'daily_cost' | 'monthly_tokens' | 'monthly_cost';
  threshold: number;
  current_value: number;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

interface WebSearchSource {
  url: string;
  title: string;
  snippet: string;
  domain: string;
}

interface WebSearchRecord {
  id: number;
  query: string;
  provider: 'web' | 'deepweb';
  timestamp: string;
  metadata?: {
    query?: string;
    results_count?: number;
    indexed_count?: number;
    sources?: WebSearchSource[];
  };
}

interface WebSearchProviderStats {
  totalSearches: number;
  successfulSearches: number;
  totalSources: number;
  uniqueDomains: number;
}

interface WebSearchStats {
  web: WebSearchProviderStats;
  deepweb: WebSearchProviderStats;
}

interface KBSearchHistoryEntry {
  id: number;
  query: string;
  resultsCount: number;
  confidence?: number;
  success: boolean;
  timestamp: string;
}

interface FreeAPIHistoryEntry {
  id: number;
  provider: 'groq' | 'gemini' | 'huggingface' | 'openrouter';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  success: boolean;
  timestamp: string;
}

// Color palette for charts
const COLORS = {
  groq: '#f55036',
  gemini: '#4285f4',
  huggingface: '#ffb000',
  openrouter: '#8b5cf6',
  openai: '#10a37f',
  web: '#06b6d4',
  deepweb: '#6366f1',
  kb: '#f59e0b'
};

export default function TokenMonitoring() {
  const { toast } = useToast();
  const [selectedPeriod, setSelectedPeriod] = useState(30);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Fetch token summary - returns array of UsageSummary
  const { data: summary, isLoading: summaryLoading} = useQuery<UsageSummary[]>({
    queryKey: ['/api/tokens/summary'],
    refetchInterval: 30000 // Refresh every 30s
  });

  // Fetch quotas - returns array of ProviderQuota
  const { data: quotas, isLoading: quotasLoading } = useQuery<ProviderQuota[]>({
    queryKey: ['/api/tokens/quotas'],
    refetchInterval: 60000 // Refresh every minute
  });

  // Fetch trends with breakdown support and custom date range
  const { data: trends, isLoading: trendsLoading } = useQuery<TokenTrends>({
    queryKey: ['/api/tokens/trends', selectedPeriod, showBreakdown, customMode, startDate, endDate],
    queryFn: async () => {
      let url = `/api/tokens/trends?days=${selectedPeriod}&breakdown=${showBreakdown}`;
      if (customMode && startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
      }
      const res = await apiRequest(url);
      return res.json();
    }
  });

  // Fetch alerts
  const { data: alerts, isLoading: alertsLoading } = useQuery<TokenAlert[]>({
    queryKey: ['/api/tokens/alerts']
  });

  // Fetch web search history
  const { data: webHistory, isLoading: webHistoryLoading } = useQuery<WebSearchRecord[]>({
    queryKey: ['/api/tokens/web-search-history', selectedPeriod],
    queryFn: async () => {
      const res = await apiRequest(`/api/tokens/web-search-history?days=${selectedPeriod}`);
      return res.json();
    }
  });

  // Fetch web search stats
  const { data: webStats, isLoading: webStatsLoading } = useQuery<WebSearchStats>({
    queryKey: ['/api/tokens/web-search-stats']
  });

  // Fetch KB search history
  const { data: kbHistory } = useQuery<KBSearchHistoryEntry[]>({
    queryKey: ['/api/tokens/kb-history'],
    queryFn: async () => {
      const res = await apiRequest('/api/tokens/kb-history?limit=100');
      return res.json();
    }
  });

  // Fetch Free APIs history
  const { data: freeAPIsHistory } = useQuery<FreeAPIHistoryEntry[]>({
    queryKey: ['/api/tokens/free-apis-history'],
    queryFn: async () => {
      const res = await apiRequest('/api/tokens/free-apis-history?limit=100');
      return res.json();
    }
  });

  // Professional date formatting (timezone-aware for Brasília)
  const formatDate = (dateStr: string, period: number) => {
    // Parse as local date (not UTC) by adding time component
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    
    if (period === 1) {
      // For 1 day, show hour (but we only have daily data)
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (period <= 30) {
      // For up to 30 days, show MMM DD
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } else if (period <= 365) {
      // For up to 1 year, show MMM DD, YYYY
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    } else {
      // For long periods, show MMM YYYY
      return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  };

  // Custom tooltip formatter (timezone-aware for Brasília)
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    // Parse as local date (not UTC) to match Brasília timezone
    const [year, month, day] = label.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const formattedDate = date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-semibold text-foreground mb-2">{formattedDate}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-sm" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
            </div>
            <span className="font-semibold text-foreground">
              {entry.value.toLocaleString()} tokens
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Handle custom date range application
  const applyCustomRange = () => {
    if (!startDate || !endDate) {
      toast({ title: "Please select both start and end dates", variant: "destructive" });
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      toast({ title: "Start date must be before end date", variant: "destructive" });
      return;
    }
    setCustomMode(true);
    toast({ title: "Custom date range applied" });
  };

  const resetToPreset = () => {
    setCustomMode(false);
    setStartDate('');
    setEndDate('');
  };

  // Export functions
  const exportToCSV = () => {
    if (!trends?.daily || trends.daily.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    const headers = showBreakdown 
      ? ['Date', 'Total Tokens', 'Groq', 'Gemini', 'HuggingFace', 'OpenRouter', 'OpenAI', 'KB', 'Web', 'DeepWeb']
      : ['Date', 'Tokens', 'Requests', 'Cost'];
    
    const rows = trends.daily.map((d: any) => {
      if (showBreakdown) {
        return [
          d.date,
          d.totalTokens || 0,
          d.groq || 0,
          d.gemini || 0,
          d.huggingface || 0,
          d.openrouter || 0,
          d.openai || 0,
          d.kb || 0,
          d.web || 0,
          d.deepweb || 0
        ].join(',');
      } else {
        return [d.date, d.tokens || 0, d.requests || 0, d.cost || 0].join(',');
      }
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `token-usage-${selectedPeriod}d-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported successfully" });
  };

  const exportToPNG = async () => {
    const chartElement = document.querySelector('[data-chart="usage-trends"]') as HTMLElement;
    if (!chartElement) {
      toast({ title: "Chart not found", variant: "destructive" });
      return;
    }

    try {
      toast({ title: "Generating PNG...", description: "Please wait" });
      
      const canvas = await html2canvas(chartElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false
      });
      
      canvas.toBlob((blob) => {
        if (!blob) {
          toast({ title: "Failed to generate PNG", variant: "destructive" });
          return;
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `token-usage-${selectedPeriod}d-${new Date().toISOString().split('T')[0]}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "PNG exported successfully" });
      });
    } catch (error) {
      console.error('PNG export error:', error);
      toast({ 
        title: "Export failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    }
  };

  // Type-safe helper functions
  const getTotalTokens = () => summary?.reduce((acc, s) => acc + s.today.tokens, 0) ?? 0;
  const getTotalCost = () => summary?.reduce((acc, s) => acc + s.today.cost, 0) ?? 0;
  const getTotalRequests = () => summary?.reduce((acc, s) => acc + s.today.requests, 0) ?? 0;
  
  const getProviderSummary = (provider: string) => summary?.find(s => s.provider === provider);
  const getProviderQuota = (provider: string) => quotas?.find(q => q.provider === provider);
  
  const getWebSearchCount = () => webStats?.web?.totalSearches ?? 0;
  const getWebResultsCount = () => webStats?.web?.totalSources ?? 0;
  const getDeepWebSearchCount = () => webStats?.deepweb?.totalSearches ?? 0;
  
  const getWebSearchHistory = () => webHistory?.filter(w => w.provider === 'web') ?? [];
  const getDeepWebSearchHistory = () => webHistory?.filter(w => w.provider === 'deepweb') ?? [];
  
  // Prepare chart data - convert summary array to chart-friendly format
  const getProviderChartData = () => {
    if (!summary) return [];
    return summary
      .filter(s => s.today.tokens > 0) // Only show providers with usage
      .map(s => ({
        provider: s.provider,
        totalTokens: s.today.tokens,
        name: s.provider.charAt(0).toUpperCase() + s.provider.slice(1)
      }));
  };

  // Acknowledge alert mutation
  const acknowledgeAlert = useMutation({
    mutationFn: async (alertId: number) => {
      const res = await apiRequest(`/api/tokens/alerts/${alertId}/acknowledge`, {
        method: 'POST'
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tokens/alerts'] });
      toast({ title: "Alert dismissed" });
    }
  });

  // Configure limits mutation
  const [dailyTokenLimit, setDailyTokenLimit] = useState("");
  const [dailyCostLimit, setDailyCostLimit] = useState("");
  const [monthlyTokenLimit, setMonthlyTokenLimit] = useState("");
  const [monthlyCostLimit, setMonthlyCostLimit] = useState("");

  const configureLimits = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('/api/tokens/limits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 1,
          dailyTokenLimit: dailyTokenLimit ? parseInt(dailyTokenLimit) : null,
          dailyCostLimit: dailyCostLimit ? parseFloat(dailyCostLimit) : null,
          monthlyTokenLimit: monthlyTokenLimit ? parseInt(monthlyTokenLimit) : null,
          monthlyCostLimit: monthlyCostLimit ? parseFloat(monthlyCostLimit) : null,
          alertThreshold: 0.8
        })
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tokens'] });
      toast({ title: "Limits configured successfully" });
    }
  });

  if (summaryLoading || quotasLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center space-y-4">
          <Activity className="w-12 h-12 mx-auto animate-pulse text-primary" />
          <p className="text-muted-foreground">Loading token monitoring...</p>
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="glass-premium border-primary/20">
        <TabsTrigger value="overview" data-testid="tab-overview">
          <BarChart3 className="w-4 h-4 mr-2" />
          Overview
        </TabsTrigger>
        <TabsTrigger value="kb" data-testid="tab-kb">
          <Database className="w-4 h-4 mr-2" />
          KB Searches
        </TabsTrigger>
        <TabsTrigger value="free-apis" data-testid="tab-free-apis">
          <Zap className="w-4 h-4 mr-2" />
          Free APIs
        </TabsTrigger>
        <TabsTrigger value="openai" data-testid="tab-openai">
          <DollarSign className="w-4 h-4 mr-2" />
          OpenAI
        </TabsTrigger>
        <TabsTrigger value="web" data-testid="tab-web">
          <Globe className="w-4 h-4 mr-2" />
          Web Searches
        </TabsTrigger>
        <TabsTrigger value="deepweb" data-testid="tab-deepweb">
          <Search className="w-4 h-4 mr-2" />
          DeepWeb
        </TabsTrigger>
        <TabsTrigger value="limits" data-testid="tab-limits">
          <Settings className="w-4 h-4 mr-2" />
          Limits & Alerts
        </TabsTrigger>
      </TabsList>

      {/* OVERVIEW TAB */}
      <TabsContent value="overview" className="space-y-6">
        {/* Active Alerts */}
        {alerts && alerts.length > 0 && (
          <Alert className="border-yellow-500/50 bg-yellow-500/10">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span className="font-medium">{alerts.length} active alert(s)</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => alerts.forEach((a) => acknowledgeAlert.mutate(a.id))}
                >
                  Dismiss All
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Total Tokens */}
          <Card className="glass-premium border-accent/20 hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold gradient-text">
                {getTotalTokens().toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">All providers</p>
            </CardContent>
          </Card>

          {/* Total Cost */}
          <Card className="glass-premium border-accent/20 hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold gradient-text">
                ${getTotalCost().toFixed(4)}
              </div>
              <p className="text-xs text-muted-foreground">OpenAI only</p>
            </CardContent>
          </Card>

          {/* Web Searches */}
          <Card className="glass-premium border-accent/20 hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Web Searches</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold gradient-text">
                {getWebSearchCount()}
              </div>
              <p className="text-xs text-muted-foreground">
                {getWebResultsCount()} results indexed
              </p>
            </CardContent>
          </Card>

          {/* DeepWeb Searches */}
          <Card className="glass-premium border-accent/20 hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">DeepWeb Searches</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold gradient-text">
                {getDeepWebSearchCount()}
              </div>
              <p className="text-xs text-muted-foreground">Tor network queries</p>
            </CardContent>
          </Card>
        </div>

        {/* Usage by Provider - Pie Chart */}
        <Card className="glass-premium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-accent" />
              Usage Distribution by Provider
            </CardTitle>
            <CardDescription>Token consumption across all providers</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={getProviderChartData()}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="totalTokens"
                >
                  {getProviderChartData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.provider as keyof typeof COLORS] || '#888888'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Trends Chart - Enterprise Grade */}
        <Card className="glass-premium border-accent/20" data-chart="usage-trends">
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-accent" />
                    Token Usage Analytics
                  </CardTitle>
                  <CardDescription>
                    {customMode 
                      ? `Custom: ${startDate} to ${endDate}`
                      : `${selectedPeriod === 1 ? 'Today' : `Last ${selectedPeriod} days`}`}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={showBreakdown ? "outline" : "default"}
                    size="sm"
                    onClick={() => setShowBreakdown(false)}
                    data-testid="view-total"
                  >
                    Total
                  </Button>
                  <Button
                    variant={showBreakdown ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowBreakdown(true)}
                    data-testid="view-breakdown"
                  >
                    By Provider
                  </Button>
                </div>
              </div>

              {/* Period Selection & Custom Range */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex gap-2">
                    <Button
                      variant={!customMode && selectedPeriod === 1 ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSelectedPeriod(1); resetToPreset(); }}
                      data-testid="period-1d"
                    >
                      1D
                    </Button>
                    <Button
                      variant={!customMode && selectedPeriod === 7 ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSelectedPeriod(7); resetToPreset(); }}
                      data-testid="period-7d"
                    >
                      7D
                    </Button>
                    <Button
                      variant={!customMode && selectedPeriod === 30 ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSelectedPeriod(30); resetToPreset(); }}
                      data-testid="period-30d"
                    >
                      30D
                    </Button>
                    <Button
                      variant={!customMode && selectedPeriod === 90 ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSelectedPeriod(90); resetToPreset(); }}
                      data-testid="period-90d"
                    >
                      90D
                    </Button>
                    <Button
                      variant={!customMode && selectedPeriod === 365 ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSelectedPeriod(365); resetToPreset(); }}
                      data-testid="period-1y"
                    >
                      1Y
                    </Button>
                    <Button
                      variant={!customMode && selectedPeriod === 1825 ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSelectedPeriod(1825); resetToPreset(); }}
                      data-testid="period-5y"
                    >
                      5Y
                    </Button>
                  </div>
                  <Separator orientation="vertical" className="h-6" />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportToCSV}
                      data-testid="export-csv"
                    >
                      CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportToPNG}
                      data-testid="export-png"
                    >
                      PNG
                    </Button>
                  </div>
                </div>

                {/* Custom Date Range */}
                <div className="flex items-center gap-2 flex-wrap bg-muted/30 p-3 rounded-lg">
                  <Label className="text-xs font-semibold">Custom Range:</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 w-36"
                    data-testid="input-start-date"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 w-36"
                    data-testid="input-end-date"
                  />
                  <Button
                    size="sm"
                    onClick={applyCustomRange}
                    disabled={!startDate || !endDate}
                    data-testid="button-apply-custom"
                  >
                    Apply
                  </Button>
                  {customMode && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={resetToPreset}
                      data-testid="button-reset-preset"
                    >
                      Reset
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {trendsLoading ? (
              <div className="flex items-center justify-center h-[400px]">
                <div className="flex flex-col items-center gap-3">
                  <Activity className="w-8 h-8 animate-pulse text-primary" />
                  <p className="text-sm text-muted-foreground">Loading analytics...</p>
                </div>
              </div>
            ) : trends?.daily && trends.daily.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart 
                  data={trends.daily}
                  margin={{ top: 10, right: 10, left: 0, bottom: customMode || selectedPeriod > 90 ? 40 : 0 }}
                >
                  <defs>
                    {showBreakdown ? (
                      <>
                        <linearGradient id="groq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.groq} stopOpacity={0.8}/>
                          <stop offset="95%" stopColor={COLORS.groq} stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="gemini" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.gemini} stopOpacity={0.8}/>
                          <stop offset="95%" stopColor={COLORS.gemini} stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="openai" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.openai} stopOpacity={0.8}/>
                          <stop offset="95%" stopColor={COLORS.openai} stopOpacity={0.1}/>
                        </linearGradient>
                      </>
                    ) : (
                      <linearGradient id="total" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.openai} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={COLORS.openai} stopOpacity={0.1}/>
                      </linearGradient>
                    )}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} stroke="currentColor" className="text-border" />
                  <XAxis 
                    dataKey="date"
                    tickFormatter={(date) => formatDate(date, customMode ? 365 : selectedPeriod)}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-muted-foreground"
                    angle={customMode || selectedPeriod > 90 ? -35 : 0}
                    textAnchor={customMode || selectedPeriod > 90 ? "end" : "middle"}
                    height={customMode || selectedPeriod > 90 ? 60 : 30}
                    interval={selectedPeriod <= 7 ? 0 : selectedPeriod <= 30 ? 2 : selectedPeriod <= 90 ? 5 : selectedPeriod <= 365 ? 30 : 60}
                  />
                  <YAxis 
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    className="text-muted-foreground"
                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend 
                    wrapperStyle={{ paddingTop: '20px' }}
                    iconType="square"
                  />
                  {showBreakdown ? (
                    <>
                      <Area type="monotone" dataKey="groq" stackId="1" stroke={COLORS.groq} fill="url(#groq)" name="Groq" />
                      <Area type="monotone" dataKey="gemini" stackId="1" stroke={COLORS.gemini} fill="url(#gemini)" name="Gemini" />
                      <Area type="monotone" dataKey="huggingface" stackId="1" stroke={COLORS.huggingface} fill={COLORS.huggingface} fillOpacity={0.6} name="HuggingFace" />
                      <Area type="monotone" dataKey="openrouter" stackId="1" stroke={COLORS.openrouter} fill={COLORS.openrouter} fillOpacity={0.6} name="OpenRouter" />
                      <Area type="monotone" dataKey="openai" stackId="1" stroke={COLORS.openai} fill="url(#openai)" name="OpenAI" />
                      <Area type="monotone" dataKey="kb" stackId="1" stroke={COLORS.kb} fill={COLORS.kb} fillOpacity={0.6} name="KB" />
                      <Area type="monotone" dataKey="web" stackId="1" stroke={COLORS.web} fill={COLORS.web} fillOpacity={0.6} name="Web" />
                      <Area type="monotone" dataKey="deepweb" stackId="1" stroke={COLORS.deepweb} fill={COLORS.deepweb} fillOpacity={0.6} name="DeepWeb" />
                    </>
                  ) : (
                    <Area type="monotone" dataKey="tokens" stackId="1" stroke={COLORS.openai} fill="url(#total)" name="Total Tokens" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                <BarChart3 className="w-16 h-16 mb-3 opacity-30" />
                <p className="text-base font-medium">No usage data available</p>
                <p className="text-sm mt-1">Select a different period or start using AION to see analytics</p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* FREE APIS TAB */}
      <TabsContent value="free-apis" className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Groq */}
          {getProviderQuota('groq') && (
            <Card className="glass-premium border-accent/20">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Zap className="w-5 h-5" style={{ color: COLORS.groq }} />
                    Groq
                  </span>
                  <Badge variant="outline">{getProviderQuota('groq')?.remaining.toLocaleString()} remaining</Badge>
                </CardTitle>
                <CardDescription>Ultra-fast inference (14,400 req/day)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Daily Usage</span>
                    <span className="text-sm font-medium">
                      {getProviderQuota('groq')?.used.toLocaleString()} / {getProviderQuota('groq')?.dailyLimit.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={getProviderQuota('groq')?.percentage ?? 0} 
                    className="h-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Requests</p>
                    <p className="text-lg font-bold">{getProviderSummary('groq')?.today.requests ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Tokens</p>
                    <p className="text-lg font-bold">{(getProviderSummary('groq')?.today.tokens ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gemini */}
          {getProviderQuota('gemini') && (
            <Card className="glass-premium border-accent/20">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Database className="w-5 h-5" style={{ color: COLORS.gemini }} />
                    Gemini
                  </span>
                  <Badge variant="outline">{getProviderQuota('gemini')?.remaining.toLocaleString()} remaining</Badge>
                </CardTitle>
                <CardDescription>Google's AI (1,500 req/day)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Daily Usage</span>
                    <span className="text-sm font-medium">
                      {getProviderQuota('gemini')?.used.toLocaleString()} / {getProviderQuota('gemini')?.dailyLimit.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={getProviderQuota('gemini')?.percentage ?? 0} 
                    className="h-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Requests</p>
                    <p className="text-lg font-bold">{getProviderSummary('gemini')?.today.requests ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Tokens</p>
                    <p className="text-lg font-bold">{(getProviderSummary('gemini')?.today.tokens ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* HuggingFace */}
          {getProviderQuota('huggingface') && (
            <Card className="glass-premium border-accent/20">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Activity className="w-5 h-5" style={{ color: COLORS.huggingface }} />
                    HuggingFace
                  </span>
                  <Badge variant="outline">{getProviderQuota('huggingface')?.remaining.toLocaleString()} remaining</Badge>
                </CardTitle>
                <CardDescription>Open-source models (720 req/day)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Daily Usage</span>
                    <span className="text-sm font-medium">
                      {getProviderQuota('huggingface')?.used.toLocaleString()} / {getProviderQuota('huggingface')?.dailyLimit.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={getProviderQuota('huggingface')?.percentage ?? 0} 
                    className="h-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Requests</p>
                    <p className="text-lg font-bold">{getProviderSummary('huggingface')?.today.requests ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Tokens</p>
                    <p className="text-lg font-bold">{(getProviderSummary('huggingface')?.today.tokens ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* OpenRouter */}
          {getProviderQuota('openrouter') && (
            <Card className="glass-premium border-accent/20">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Zap className="w-5 h-5" style={{ color: COLORS.openrouter }} />
                    OpenRouter
                  </span>
                  <Badge variant="outline">{getProviderQuota('openrouter')?.remaining.toLocaleString()} remaining</Badge>
                </CardTitle>
                <CardDescription>400+ models (50 req/day free)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Daily Usage</span>
                    <span className="text-sm font-medium">
                      {getProviderQuota('openrouter')?.used.toLocaleString()} / {getProviderQuota('openrouter')?.dailyLimit.toLocaleString()}
                    </span>
                  </div>
                  <Progress 
                    value={getProviderQuota('openrouter')?.percentage ?? 0} 
                    className="h-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Requests</p>
                    <p className="text-lg font-bold">{getProviderSummary('openrouter')?.today.requests ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Tokens</p>
                    <p className="text-lg font-bold">{(getProviderSummary('openrouter')?.today.tokens ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Free APIs Historical Chart */}
        <Card className="glass-premium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              Free APIs Usage Trends
            </CardTitle>
            <CardDescription>Daily consumption per provider</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={trends?.daily ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="groq" stroke={COLORS.groq} name="Groq" />
                <Line type="monotone" dataKey="gemini" stroke={COLORS.gemini} name="Gemini" />
                <Line type="monotone" dataKey="huggingface" stroke={COLORS.huggingface} name="HuggingFace" />
                <Line type="monotone" dataKey="openrouter" stroke={COLORS.openrouter} name="OpenRouter" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Free APIs Detailed History */}
        <Card className="glass-premium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-accent" />
              Detailed Usage History
            </CardTitle>
            <CardDescription>
              Recent Free API requests with token consumption
            </CardDescription>
          </CardHeader>
          <CardContent>
            {freeAPIsHistory && freeAPIsHistory.length > 0 ? (
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {freeAPIsHistory.map((entry) => (
                    <Card key={entry.id} className="glass border-primary/10 hover-elevate">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm font-medium">
                              {entry.provider.charAt(0).toUpperCase() + entry.provider.slice(1)}
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {new Date(entry.timestamp).toLocaleString()} • {entry.model}
                            </CardDescription>
                          </div>
                          <Badge 
                            variant={entry.success ? "default" : "destructive"} 
                            className="shrink-0"
                            style={entry.success ? { backgroundColor: COLORS[entry.provider as keyof typeof COLORS] } : undefined}
                          >
                            {entry.success ? 'Success' : 'Failed'}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Prompt:</span>
                            <span className="ml-2 font-medium">{entry.promptTokens}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Completion:</span>
                            <span className="ml-2 font-medium">{entry.completionTokens}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Total:</span>
                            <span className="ml-2 font-medium">{entry.totalTokens}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No Free API usage recorded yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* KB SEARCHES TAB */}
      <TabsContent value="kb" className="space-y-6">
        <Card className="glass-premium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" style={{ color: COLORS.kb }} />
              Knowledge Base Search History
            </CardTitle>
            <CardDescription>
              All KB search attempts (successes and failures)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {kbHistory && kbHistory.length > 0 ? (
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-4">
                  {kbHistory.map((entry) => (
                    <Card key={entry.id} className="glass border-primary/10 hover-elevate">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm font-medium truncate">
                              {entry.query || 'No query text'}
                            </CardTitle>
                            <CardDescription className="text-xs mt-1">
                              {new Date(entry.timestamp).toLocaleString()}
                            </CardDescription>
                          </div>
                          <Badge variant={entry.success ? "default" : "secondary"} className="shrink-0">
                            {entry.success ? (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Hit
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Miss
                              </span>
                            )}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Results Found:</span>
                            <span className="ml-2 font-medium">{entry.resultsCount}</span>
                          </div>
                          {entry.confidence !== undefined && (
                            <div>
                              <span className="text-muted-foreground">Confidence:</span>
                              <span className="ml-2 font-medium">
                                {(entry.confidence * 100).toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No KB searches recorded yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* OPENAI TAB */}
      <TabsContent value="openai" className="space-y-6">
        <Card className="glass-premium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              OpenAI Usage & Costs
            </CardTitle>
            <CardDescription>Paid API consumption details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-3xl font-bold gradient-text">
                  {getProviderSummary('openai')?.today.requests ?? 0}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Tokens</p>
                <p className="text-3xl font-bold gradient-text">
                  {(getProviderSummary('openai')?.today.tokens ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-3xl font-bold text-green-500">
                  ${(getProviderSummary('openai')?.today.cost ?? 0).toFixed(4)}
                </p>
              </div>
            </div>

            <Separator />

            {/* Cost Breakdown */}
            <div>
              <h3 className="font-semibold mb-4">Cost Breakdown by Model</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={[]}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="model" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cost" fill={COLORS.openai} name="Cost ($)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <Separator />

            {/* Historical Cost Chart */}
            <div>
              <h3 className="font-semibold mb-4">Daily Cost History</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={trends?.daily ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="cost" stroke={COLORS.openai} fill={COLORS.openai} fillOpacity={0.6} name="Cost ($)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* WEB SEARCHES TAB */}
      <TabsContent value="web" className="space-y-6">
        <Card className="glass-premium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-500" />
              Web Search History
            </CardTitle>
            <CardDescription>Complete history of web searches with sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Searches</p>
                <p className="text-3xl font-bold gradient-text">
                  {webStats?.web?.totalSearches || 0}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Results</p>
                <p className="text-3xl font-bold gradient-text">
                  {webStats?.web?.totalSources || 0}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Unique Domains</p>
                <p className="text-3xl font-bold gradient-text">
                  {webStats?.web?.uniqueDomains || 0}
                </p>
              </div>
            </div>

            <Separator className="my-6" />

            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {getWebSearchHistory().map((search, idx) => (
                  <Card key={idx} className="glass border-cyan-500/20 hover-elevate">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{search.query}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <Clock className="w-3 h-3" />
                            {new Date(search.timestamp).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-cyan-500/10">
                          {search.metadata?.results_count || 0} results
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">Sources Found:</p>
                        {(search.metadata?.sources || []).slice(0, 5).map((source: any, sidx: number) => (
                          <div key={sidx} className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
                            <ExternalLink className="w-4 h-4 mt-0.5 text-cyan-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{source.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{source.domain}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{source.snippet}</p>
                              <a 
                                href={source.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-cyan-500 hover:underline mt-1 inline-block"
                              >
                                {source.url}
                              </a>
                            </div>
                          </div>
                        ))}
                        {((search.metadata?.sources || []).length > 5) && (
                          <p className="text-xs text-muted-foreground text-center">
                            +{(search.metadata?.sources || []).length - 5} more sources
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {getWebSearchHistory().length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Globe className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No web searches recorded yet</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </TabsContent>

      {/* DEEPWEB TAB */}
      <TabsContent value="deepweb" className="space-y-6">
        <Card className="glass-premium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-500" />
              DeepWeb Search History
            </CardTitle>
            <CardDescription>Tor network searches and sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Searches</p>
                <p className="text-3xl font-bold gradient-text">
                  {webStats?.deepweb?.totalSearches || 0}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Total Results</p>
                <p className="text-3xl font-bold gradient-text">
                  {webStats?.deepweb?.totalSources || 0}
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Unique Domains</p>
                <p className="text-3xl font-bold gradient-text">
                  {webStats?.deepweb?.uniqueDomains || 0}
                </p>
              </div>
            </div>

            <Separator className="my-6" />

            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-4">
                {getDeepWebSearchHistory().map((search, idx) => (
                  <Card key={idx} className="glass border-indigo-500/20 hover-elevate">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{search.query}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <Clock className="w-3 h-3" />
                            {new Date(search.timestamp).toLocaleString()}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-indigo-500/10">
                          {search.metadata?.results_count || 0} results
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">Sources Found:</p>
                        {(search.metadata?.sources || []).slice(0, 5).map((source: any, sidx: number) => (
                          <div key={sidx} className="flex items-start gap-2 p-3 rounded-lg bg-background/50 border border-border/50">
                            <Search className="w-4 h-4 mt-0.5 text-indigo-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{source.title}</p>
                              <p className="text-xs text-muted-foreground truncate">{source.domain}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{source.snippet}</p>
                              <p className="text-xs text-indigo-500 font-mono mt-1 truncate">{source.url}</p>
                            </div>
                          </div>
                        ))}
                        {((search.metadata?.sources || []).length > 5) && (
                          <p className="text-xs text-muted-foreground text-center">
                            +{(search.metadata?.sources || []).length - 5} more sources
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {getDeepWebSearchHistory().length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No DeepWeb searches recorded yet</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </TabsContent>

      {/* LIMITS & ALERTS TAB */}
      <TabsContent value="limits" className="space-y-6">
        <Card className="glass-premium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-accent" />
              Configure Usage Limits
            </CardTitle>
            <CardDescription>Set token and cost limits to prevent overuse</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Daily Limits */}
              <div className="space-y-4">
                <h3 className="font-semibold">Daily Limits</h3>
                <div className="space-y-2">
                  <Label htmlFor="daily-tokens">Daily Token Limit</Label>
                  <Input
                    id="daily-tokens"
                    type="number"
                    placeholder="e.g., 100000"
                    value={dailyTokenLimit}
                    onChange={(e) => setDailyTokenLimit(e.target.value)}
                    data-testid="input-daily-tokens"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daily-cost">Daily Cost Limit ($)</Label>
                  <Input
                    id="daily-cost"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 5.00"
                    value={dailyCostLimit}
                    onChange={(e) => setDailyCostLimit(e.target.value)}
                    data-testid="input-daily-cost"
                  />
                </div>
              </div>

              {/* Monthly Limits */}
              <div className="space-y-4">
                <h3 className="font-semibold">Monthly Limits</h3>
                <div className="space-y-2">
                  <Label htmlFor="monthly-tokens">Monthly Token Limit</Label>
                  <Input
                    id="monthly-tokens"
                    type="number"
                    placeholder="e.g., 3000000"
                    value={monthlyTokenLimit}
                    onChange={(e) => setMonthlyTokenLimit(e.target.value)}
                    data-testid="input-monthly-tokens"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthly-cost">Monthly Cost Limit ($)</Label>
                  <Input
                    id="monthly-cost"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 150.00"
                    value={monthlyCostLimit}
                    onChange={(e) => setMonthlyCostLimit(e.target.value)}
                    data-testid="input-monthly-cost"
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={() => configureLimits.mutate()}
              disabled={configureLimits.isPending}
              className="w-full bg-gradient-to-r from-accent to-primary"
              data-testid="button-save-limits"
            >
              <Save className="w-4 h-4 mr-2" />
              {configureLimits.isPending ? "Saving..." : "Save Limits"}
            </Button>
          </CardContent>
        </Card>

        {/* Active Alerts */}
        <Card className="glass-premium border-accent/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-yellow-500" />
              Active Alerts
            </CardTitle>
            <CardDescription>Manage usage alerts and notifications</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {alerts?.map((alert) => (
                  <Alert key={alert.id} className="border-yellow-500/50 bg-yellow-500/10">
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                    <AlertDescription>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{alert.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(alert.created_at).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => acknowledgeAlert.mutate(alert.id)}
                          data-testid={`dismiss-alert-${alert.id}`}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                ))}
                {(!alerts || alerts.length === 0) && (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
                    <p>No active alerts</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
