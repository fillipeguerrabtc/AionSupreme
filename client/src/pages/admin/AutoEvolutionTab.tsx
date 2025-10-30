import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, TrendingUp, Zap, CheckCircle, Database, Target } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface AutoEvolutionStats {
  overview: {
    totalConversations: number;
    highQualityConversations: number;
    avgQualityScore: number;
    kbGeneratedDatasets: number;
    totalDatasets: number;
    completedJobs: number;
    totalJobs: number;
  };
  efficiency: {
    collectionToDatasetRatio: number;
    jobCompletionRate: number;
    highQualityPercentage: number;
  };
  timeline: Array<{
    date: string;
    count: number;
    avgScore: number;
  }>;
}

export default function AutoEvolutionTab() {
  const { data, isLoading } = useQuery<AutoEvolutionStats>({
    queryKey: ["/api/training/auto-evolution/stats"],
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading auto-evolution stats...</div>
      </div>
    );
  }

  const { overview, efficiency, timeline } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Auto-Evolution Dashboard</h2>
        <p className="text-muted-foreground">
          Monitor continuous learning and self-improvement metrics
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversations Collected</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-conversations">
              {overview.totalConversations.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview.highQualityConversations} high-quality (score ≥ 60)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Quality Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-quality-score">
              {overview.avgQualityScore.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">
              {efficiency.highQualityPercentage.toFixed(1)}% above threshold
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">KB-Generated Datasets</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-kb-datasets">
              {overview.kbGeneratedDatasets}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview.totalDatasets} total datasets
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Training Jobs</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-jobs">
              {overview.completedJobs} / {overview.totalJobs}
            </div>
            <p className="text-xs text-muted-foreground">
              {efficiency.jobCompletionRate.toFixed(1)}% completion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Efficiency Metrics */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Collection Efficiency
            </CardTitle>
            <CardDescription>
              Conversations successfully converted to datasets
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-collection-efficiency">
              {efficiency.collectionToDatasetRatio.toFixed(1)}%
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {overview.kbGeneratedDatasets} datasets from {overview.totalConversations} conversations
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              High-Quality Rate
            </CardTitle>
            <CardDescription>
              Percentage of conversations above quality threshold
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-high-quality-rate">
              {efficiency.highQualityPercentage.toFixed(1)}%
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {overview.highQualityConversations} / {overview.totalConversations} conversations
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Job Success Rate
            </CardTitle>
            <CardDescription>
              Training jobs completed successfully
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-job-success-rate">
              {efficiency.jobCompletionRate.toFixed(1)}%
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {overview.completedJobs} / {overview.totalJobs} jobs completed
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Collection Timeline (Last 30 Days)</CardTitle>
          <CardDescription>
            Daily conversation collection and quality trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                  labelFormatter={(value) => {
                    const date = new Date(value as string);
                    return date.toLocaleDateString();
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'count') return [value, 'Conversations'];
                    if (name === 'avgScore') return [value.toFixed(1), 'Avg Score'];
                    return [value, name];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#colorCount)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground">
              No data available for the last 30 days
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Evolution System Status</CardTitle>
          <CardDescription>
            Continuous learning pipeline health
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="font-medium">Conversation Collection</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {overview.totalConversations > 0 ? (
                <span className="text-primary font-medium">Active</span>
              ) : (
                <span>Waiting for conversations</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="font-medium">KB Integration</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {overview.kbGeneratedDatasets > 0 ? (
                <span className="text-primary font-medium">Active</span>
              ) : (
                <span>No datasets generated yet</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="font-medium">Federated Training</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {overview.completedJobs > 0 ? (
                <span className="text-primary font-medium">
                  {overview.completedJobs} jobs completed
                </span>
              ) : (
                <span>No jobs completed yet</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
