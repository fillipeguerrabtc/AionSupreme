import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, TrendingUp, Zap, CheckCircle, Database, Target } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useLanguage } from "@/lib/i18n";
import { formatDateTimeInTimezone } from "@/lib/datetime";
import { apiRequest } from "@/lib/queryClient";

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
  const { t } = useLanguage();

  // Fetch system timezone for dynamic date formatting
  const { data: systemTimezone } = useQuery<{ timezone: string }>({
    queryKey: ["/api/admin/settings/timezone"],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/settings/timezone`);
      return res.json();
    },
  });
  const timezone = systemTimezone?.timezone || "America/Sao_Paulo";

  const { data, isLoading } = useQuery<AutoEvolutionStats>({
    queryKey: ["/api/training/auto-evolution/stats"],
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t.admin.autoEvolution.loading}</div>
      </div>
    );
  }

  const { overview, efficiency, timeline } = data;

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold break-words">{t.admin.autoEvolution.title}</h2>
        <p className="text-muted-foreground break-words">
          {t.admin.autoEvolution.subtitle}
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.admin.autoEvolution.overview.conversationsCollected}</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-conversations">
              {overview.totalConversations.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview.highQualityConversations} {t.admin.autoEvolution.overview.highQualityNote}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.admin.autoEvolution.overview.avgQualityScore}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-quality-score">
              {overview.avgQualityScore.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground">
              {efficiency.highQualityPercentage.toFixed(1)}% {t.admin.autoEvolution.overview.aboveThreshold}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.admin.autoEvolution.overview.kbGeneratedDatasets}</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-kb-datasets">
              {overview.kbGeneratedDatasets}
            </div>
            <p className="text-xs text-muted-foreground">
              {overview.totalDatasets} {t.admin.autoEvolution.overview.totalDatasets}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t.admin.autoEvolution.overview.trainingJobs}</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-completed-jobs">
              {overview.completedJobs} / {overview.totalJobs}
            </div>
            <p className="text-xs text-muted-foreground">
              {efficiency.jobCompletionRate.toFixed(1)}% {t.admin.autoEvolution.overview.completionRate}
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
              {t.admin.autoEvolution.efficiency.collectionEfficiency}
            </CardTitle>
            <CardDescription>
              {t.admin.autoEvolution.efficiency.collectionEfficiencyDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-collection-efficiency">
              {efficiency.collectionToDatasetRatio.toFixed(1)}%
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {overview.kbGeneratedDatasets} {t.admin.autoEvolution.efficiency.datasetsFrom} {overview.totalConversations} {t.admin.autoEvolution.efficiency.conversations}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {t.admin.autoEvolution.efficiency.highQualityRate}
            </CardTitle>
            <CardDescription>
              {t.admin.autoEvolution.efficiency.highQualityRateDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-high-quality-rate">
              {efficiency.highQualityPercentage.toFixed(1)}%
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {overview.highQualityConversations} / {overview.totalConversations} {t.admin.autoEvolution.efficiency.conversations}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {t.admin.autoEvolution.efficiency.jobSuccessRate}
            </CardTitle>
            <CardDescription>
              {t.admin.autoEvolution.efficiency.jobSuccessRateDesc}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold" data-testid="text-job-success-rate">
              {efficiency.jobCompletionRate.toFixed(1)}%
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {overview.completedJobs} / {overview.totalJobs} {t.admin.autoEvolution.efficiency.jobsCompleted}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t.admin.autoEvolution.timeline.title}</CardTitle>
          <CardDescription>
            {t.admin.autoEvolution.timeline.subtitle}
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
                    // Format using system timezone
                    const formatted = formatDateTimeInTimezone(value, timezone, { format: 'short' });
                    // Extract just the date portion (MM/DD)
                    const parts = formatted.split(',')[0].split('/');
                    return `${parts[0]}/${parts[1]}`;
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
                    return formatDateTimeInTimezone(value as string, timezone, { format: 'short' });
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'count') return [value, t.admin.autoEvolution.timeline.conversationsLabel];
                    if (name === 'avgScore') return [value.toFixed(1), t.admin.autoEvolution.timeline.avgScoreLabel];
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
              {t.admin.autoEvolution.timeline.noData}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>{t.admin.autoEvolution.systemStatus.title}</CardTitle>
          <CardDescription>
            {t.admin.autoEvolution.systemStatus.subtitle}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="font-medium">{t.admin.autoEvolution.systemStatus.conversationCollection}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {overview.totalConversations > 0 ? (
                <span className="text-primary font-medium">{t.admin.autoEvolution.systemStatus.active}</span>
              ) : (
                <span>{t.admin.autoEvolution.systemStatus.waitingForConversations}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="font-medium">{t.admin.autoEvolution.systemStatus.kbIntegration}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {overview.kbGeneratedDatasets > 0 ? (
                <span className="text-primary font-medium">{t.admin.autoEvolution.systemStatus.active}</span>
              ) : (
                <span>{t.admin.autoEvolution.systemStatus.noDatasetsYet}</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="font-medium">{t.admin.autoEvolution.systemStatus.federatedTraining}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {overview.completedJobs > 0 ? (
                <span className="text-primary font-medium">
                  {overview.completedJobs} {t.admin.autoEvolution.systemStatus.jobsCompleted}
                </span>
              ) : (
                <span>{t.admin.autoEvolution.systemStatus.noJobsYet}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
