import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { 
  BarChart3, 
  Activity, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  Users,
  Database,
  Zap
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

// TypeScript interfaces
interface QueryMetrics {
  totalQueries: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  successRate: number;
  errorRate: number;
}

interface SlowQuery {
  endpoint: string;
  method: string;
  avgLatency: number;
  count: number;
}

interface AgentStats {
  agentId: number;
  agentName: string;
  usageCount: number;
  lastUsed: string;
}

interface NamespaceStats {
  namespaceId: number;
  namespaceName: string;
  usageCount: number;
  lastUsed: string;
}

export default function TelemetriaPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<"system" | "analytics">("system");

  // Fetch query metrics
  const { data: queryMetrics } = useQuery<QueryMetrics>({
    queryKey: ["/api/admin/query-metrics/summary"],
    refetchInterval: 10000, // Auto-refresh every 10s
  });

  // Fetch slow queries
  const { data: slowQueries } = useQuery<SlowQuery[]>({
    queryKey: ["/api/admin/query-metrics/slow"],
    refetchInterval: 10000,
  });

  // Fetch latency trends
  const { data: latencyTrends } = useQuery<any[]>({
    queryKey: ["/api/admin/query-metrics/trends"],
    refetchInterval: 30000, // Auto-refresh every 30s
  });

  // Fetch agent stats
  const { data: agentStats } = useQuery<AgentStats[]>({
    queryKey: ["/api/admin/telemetry/agents/stats"],
    refetchInterval: 10000,
  });

  // Fetch namespace stats
  const { data: namespaceStats } = useQuery<NamespaceStats[]>({
    queryKey: ["/api/admin/telemetry/namespaces/stats"],
    refetchInterval: 10000,
  });

  // Fetch historical data
  const { data: agentHistory } = useQuery<any[]>({
    queryKey: ["/api/admin/telemetry/agents/history"],
    refetchInterval: 30000,
  });

  const { data: namespaceHistory } = useQuery<any[]>({
    queryKey: ["/api/admin/telemetry/namespaces/history"],
    refetchInterval: 30000,
  });

  // Chart colors
  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#8884d8', '#82ca9d', '#ffc658'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Telemetria</h2>
        <p className="text-muted-foreground">
          Monitoramento em tempo real de performance do sistema e analytics de uso
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "system" | "analytics")}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="system" data-testid="tab-system-metrics">
            <Activity className="w-4 h-4 mr-2" />
            Métricas de Sistema
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics KB/Chat
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: System Metrics */}
        <TabsContent value="system" className="space-y-6">
          {/* Overview Cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Queries */}
            <Card className="glass-modern" data-testid="card-total-queries">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Total de Queries
                </CardTitle>
                <div className="text-2xl sm:text-3xl font-bold text-foreground">
                  {queryMetrics ? queryMetrics.totalQueries.toLocaleString() : "..."}
                </div>
                <CardDescription className="text-xs">
                  Últimas 24 horas
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Average Latency */}
            <Card className="glass-modern" data-testid="card-avg-latency">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Latência Média
                </CardTitle>
                <div className="text-2xl sm:text-3xl font-bold text-foreground">
                  {queryMetrics ? `${queryMetrics.avgLatency.toFixed(0)}ms` : "..."}
                </div>
                <CardDescription className="text-xs">
                  P50: {queryMetrics ? `${queryMetrics.p50Latency.toFixed(0)}ms` : "..."}
                </CardDescription>
              </CardHeader>
            </Card>

            {/* P95 Latency */}
            <Card className="glass-modern" data-testid="card-p95-latency">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Latência P95
                </CardTitle>
                <div className="text-2xl sm:text-3xl font-bold text-foreground">
                  {queryMetrics ? `${queryMetrics.p95Latency.toFixed(0)}ms` : "..."}
                </div>
                <CardDescription className="text-xs">
                  P99: {queryMetrics ? `${queryMetrics.p99Latency.toFixed(0)}ms` : "..."}
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Success Rate */}
            <Card className="glass-modern" data-testid="card-success-rate">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Taxa de Sucesso
                </CardTitle>
                <div className="text-2xl sm:text-3xl font-bold text-foreground">
                  {queryMetrics ? `${(queryMetrics.successRate * 100).toFixed(1)}%` : "..."}
                </div>
                <CardDescription className="text-xs">
                  Erros: {queryMetrics ? `${(queryMetrics.errorRate * 100).toFixed(1)}%` : "..."}
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Latency Trends Chart */}
          <Card className="glass-modern">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Tendências de Latência
              </CardTitle>
              <CardDescription>
                Evolução da latência nas últimas 24 horas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {latencyTrends && latencyTrends.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={latencyTrends}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis 
                      dataKey="timestamp" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      labelFormatter={(value) => new Date(value).toLocaleString('pt-BR')}
                      formatter={(value: number) => [`${value.toFixed(2)}ms`, 'Latência']}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="avgLatency" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      name="Média"
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="p95Latency" 
                      stroke="hsl(var(--accent))" 
                      strokeWidth={2}
                      name="P95"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  Carregando dados de tendência...
                </div>
              )}
            </CardContent>
          </Card>

          {/* Slow Queries Table */}
          <Card className="glass-modern">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Queries Mais Lentas
              </CardTitle>
              <CardDescription>
                Endpoints com maior latência média
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                {slowQueries && slowQueries.length > 0 ? (
                  <div className="space-y-3">
                    {slowQueries.map((query, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-3 rounded-md bg-card/50 hover-elevate"
                        data-testid={`slow-query-${idx}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {query.method}
                            </Badge>
                            <span className="font-mono text-sm">{query.endpoint}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {query.count} requisições
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{query.avgLatency.toFixed(0)}ms</div>
                          <p className="text-xs text-muted-foreground">média</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Nenhuma query lenta detectada
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: Analytics KB/Chat */}
        <TabsContent value="analytics" className="space-y-6">
          {/* Overview Cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {/* Total Agent Uses */}
            <Card className="glass-modern" data-testid="card-agent-uses">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Execuções de Agentes
                </CardTitle>
                <div className="text-2xl sm:text-3xl font-bold text-foreground">
                  {agentStats ? agentStats.reduce((sum, a) => sum + a.usageCount, 0).toLocaleString() : "..."}
                </div>
                <CardDescription className="text-xs">
                  {agentStats ? `${agentStats.length} agentes ativos` : "..."}
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Total Namespace Searches */}
            <Card className="glass-modern" data-testid="card-namespace-searches">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Buscas em Namespaces
                </CardTitle>
                <div className="text-2xl sm:text-3xl font-bold text-foreground">
                  {namespaceStats ? namespaceStats.reduce((sum, n) => sum + n.usageCount, 0).toLocaleString() : "..."}
                </div>
                <CardDescription className="text-xs">
                  {namespaceStats ? `${namespaceStats.length} namespaces ativos` : "..."}
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Most Active Agent */}
            <Card className="glass-modern" data-testid="card-most-active-agent">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Agente Mais Ativo
                </CardTitle>
                <div className="text-lg font-bold text-foreground truncate">
                  {agentStats && agentStats.length > 0 
                    ? agentStats[0].agentName 
                    : "..."}
                </div>
                <CardDescription className="text-xs">
                  {agentStats && agentStats.length > 0 
                    ? `${agentStats[0].usageCount} execuções` 
                    : "..."}
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Agent Usage Chart */}
          <Card className="glass-modern">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Uso de Agentes Especialistas
              </CardTitle>
              <CardDescription>
                Top 10 agentes mais executados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {agentStats && agentStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agentStats.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis 
                      dataKey="agentName" 
                      type="category" 
                      width={150}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar 
                      dataKey="usageCount" 
                      fill="hsl(var(--primary))"
                      name="Execuções"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  Nenhum dado de agentes disponível
                </div>
              )}
            </CardContent>
          </Card>

          {/* Namespace Usage Chart */}
          <Card className="glass-modern">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Uso de Namespaces
              </CardTitle>
              <CardDescription>
                Top 10 namespaces mais consultados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {namespaceStats && namespaceStats.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={namespaceStats.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis 
                      dataKey="namespaceName" 
                      type="category" 
                      width={150}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar 
                      dataKey="usageCount" 
                      fill="hsl(var(--accent))"
                      name="Buscas"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  Nenhum dado de namespaces disponível
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historical Usage Trends */}
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {/* Agent History */}
            <Card className="glass-modern">
              <CardHeader>
                <CardTitle className="text-base">Histórico de Agentes</CardTitle>
                <CardDescription className="text-xs">
                  Execuções ao longo do tempo
                </CardDescription>
              </CardHeader>
              <CardContent>
                {agentHistory && agentHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={agentHistory}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        name="Execuções"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                    Nenhum histórico disponível
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Namespace History */}
            <Card className="glass-modern">
              <CardHeader>
                <CardTitle className="text-base">Histórico de Namespaces</CardTitle>
                <CardDescription className="text-xs">
                  Buscas ao longo do tempo
                </CardDescription>
              </CardHeader>
              <CardContent>
                {namespaceHistory && namespaceHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={namespaceHistory}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString('pt-BR')}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="hsl(var(--accent))" 
                        strokeWidth={2}
                        name="Buscas"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
                    Nenhum histórico disponível
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
