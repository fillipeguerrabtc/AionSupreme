import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DollarSign, TrendingUp, Activity } from "lucide-react";
import { format } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useLanguage } from "@/lib/i18n";

interface CostRecord {
  id: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: Date | string;
}

interface ProviderTotal {
  provider: string;
  totalCost: number;
  totalRequests: number;
}

interface CostHistoryData {
  records: CostRecord[];
  totals: ProviderTotal[];
  overallTotal: number;
}

const providerColors: Record<string, string> = {
  openai: "#10b981",
  groq: "#f97316",
  gemini: "#3b82f6",
  huggingface: "#eab308",
  openrouter: "#a855f7"
};

const CHART_COLORS = ["#10b981", "#3b82f6", "#f97316", "#eab308", "#a855f7", "#06b6d4"];

export default function CostHistoryTab() {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery<CostHistoryData>({
    queryKey: ["/api/tokens/cost-history"],
    queryFn: async () => {
      const res = await fetch("/api/tokens/cost-history?limit=500");
      if (!res.ok) throw new Error("Failed to fetch cost history");
      return res.json();
    },
    refetchInterval: 30000
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Activity className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const pieChartData = data?.totals.map(t => ({
    name: t.provider.toUpperCase(),
    value: Number(t.totalCost),
    count: t.totalRequests
  })) || [];

  const barChartData = data?.totals.map(t => ({
    provider: t.provider.toUpperCase(),
    cost: Number(t.totalCost),
    requests: t.totalRequests
  })) || [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex items-center gap-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.costHistory.overview.totalCost}</CardTitle>
            <div className="text-3xl font-bold gradient-text-vibrant">
              ${(data?.overallTotal || 0).toFixed(4)}
            </div>
          </CardHeader>
        </Card>
        
        <Card className="flex items-center gap-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.costHistory.overview.paidRequests}</CardTitle>
            <div className="text-3xl font-bold gradient-text-vibrant">
              {data?.records.length || 0}
            </div>
          </CardHeader>
        </Card>
        
        <Card className="flex items-center gap-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.costHistory.overview.providers}</CardTitle>
            <div className="text-3xl font-bold gradient-text-vibrant">
              {data?.totals.length || 0}
            </div>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="flex items-center gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-accent" />
              {t.admin.costHistory.charts.costDistribution}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(entry) => `$${entry.value.toFixed(4)}`}
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => `$${value.toFixed(4)}`}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="flex items-center gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-accent" />
              {t.admin.costHistory.charts.costByProvider}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="provider" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip 
                  formatter={(value: number) => `$${value.toFixed(4)}`}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                <Bar dataKey="cost" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="flex items-center gap-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-accent" />
            {t.admin.costHistory.history.title}
          </CardTitle>
          <CardDescription>
            {t.admin.costHistory.history.subtitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {data?.records.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge style={{ 
                      backgroundColor: `${providerColors[record.provider]}20`,
                      color: providerColors[record.provider],
                      borderColor: `${providerColors[record.provider]}40`
                    }}>
                      {record.provider.toUpperCase()}
                    </Badge>
                    
                    <div className="flex-1">
                      <div className="font-medium text-sm">{record.model}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(record.timestamp), "MMM d, yyyy HH:mm:ss")}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-mono text-sm text-muted-foreground">
                        {record.totalTokens.toLocaleString()} {t.admin.costHistory.history.tokens}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {record.promptTokens} → {record.completionTokens}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-mono text-lg font-bold text-green-500">
                        ${record.cost.toFixed(4)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {(!data?.records || data.records.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  {t.admin.costHistory.history.noCostHistory}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
