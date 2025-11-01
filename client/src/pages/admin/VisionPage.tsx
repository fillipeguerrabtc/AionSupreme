import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Eye, CheckCircle2, XCircle, Clock, TrendingUp, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface QuotaStatus {
  used: number;
  limit: number;
  available: boolean;
  percentage: number;
}

interface ProviderInfo {
  id: string;
  name: string;
  model: string;
  tier: string;
  dailyLimit: number | null;
  priority: number;
  features: string[];
  status: "active" | "missing_key";
}

interface UsageStats {
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  models: string[];
  successRate: number;
}

export default function VisionPage() {
  const { data: quotaStatus, isLoading: quotaLoading } = useQuery<{
    success: boolean;
    data: {
      gemini: QuotaStatus;
      gpt4vOpenRouter: QuotaStatus;
      claude3OpenRouter: QuotaStatus;
      huggingface: QuotaStatus;
    };
    timestamp: string;
  }>({
    queryKey: ["/api/vision/status"],
    refetchInterval: 30000, // Atualiza a cada 30s
  });

  // TODO: Move provider info to database instead of hardcoded
  const providerInfo = {
    success: true,
    data: [
      {
        id: "gemini",
        name: "Google Gemini Vision",
        model: "gemini-2.0-flash-exp",
        tier: "FREE",
        dailyLimit: 1500,
        priority: 1,
        features: ["High quality", "Fast", "Detailed descriptions"],
        status: "active" as const
      },
      {
        id: "gpt4v-openrouter",
        name: "GPT-4 Vision (OpenRouter)",
        model: "openai/gpt-4-vision-preview:free",
        tier: "FREE",
        dailyLimit: 50,
        priority: 2,
        features: ["Good quality", "OpenRouter free tier"],
        status: "active" as const
      },
      {
        id: "claude3-openrouter",
        name: "Claude 3 Haiku (OpenRouter)",
        model: "anthropic/claude-3-haiku:free",
        tier: "FREE",
        dailyLimit: 50,
        priority: 3,
        features: ["Good quality", "Fast", "OpenRouter free tier"],
        status: "active" as const
      },
      {
        id: "huggingface",
        name: "HuggingFace BLIP",
        model: "Salesforce/blip-image-captioning-large",
        tier: "FREE",
        dailyLimit: 720,
        priority: 4,
        features: ["Basic captions", "Free"],
        status: "active" as const
      },
      {
        id: "openai",
        name: "OpenAI GPT-4o Vision",
        model: "gpt-4o",
        tier: "PAID",
        dailyLimit: null,
        priority: 5,
        features: ["Highest quality", "Unlimited", "Paid only"],
        status: "active" as const
      }
    ]
  };
  const providerLoading = false;

  const { data: quotaHistory, isLoading: historyLoading } = useQuery<{
    success: boolean;
    data: {
      period: { days: number; startDate: string; endDate: string };
      providers: Record<string, UsageStats>;
      totalRecords: number;
    };
  }>({
    queryKey: ["/api/vision/quota-history", { days: 7 }],
  });

  const getStatusColor = (status: "active" | "missing_key") => {
    return status === "active" ? "default" : "destructive";
  };

  const getTierColor = (tier: string) => {
    return tier === "FREE" ? "default" : "secondary";
  };

  const getQuotaColor = (percentage: number) => {
    if (percentage >= 90) return "destructive";
    if (percentage >= 70) return "warning";
    return "default";
  };

  return (
    <div className="space-y-6 p-6" data-testid="page-vision">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="title-vision">
            <Eye className="h-8 w-8" />
            Vision System
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitoramento e configuração dos modelos de visão multimodal
          </p>
        </div>
      </div>

      {/* Quota Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {quotaLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-2 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            {/* Gemini */}
            <Card data-testid="card-quota-gemini">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  Gemini Vision
                  <Badge variant="outline" className="ml-2">FREE</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="quota-gemini-used">
                  {quotaStatus?.data.gemini.used || 0} / {quotaStatus?.data.gemini.limit || 0}
                </div>
                <Progress
                  value={quotaStatus?.data.gemini.percentage || 0}
                  className="mt-2"
                  data-testid="progress-gemini"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {quotaStatus?.data.gemini.percentage.toFixed(1)}% utilizado
                </p>
              </CardContent>
            </Card>

            {/* GPT-4V OpenRouter */}
            <Card data-testid="card-quota-gpt4v">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  GPT-4V
                  <Badge variant="outline" className="ml-2">FREE</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="quota-gpt4v-used">
                  {quotaStatus?.data.gpt4vOpenRouter.used || 0} / {quotaStatus?.data.gpt4vOpenRouter.limit || 0}
                </div>
                <Progress
                  value={quotaStatus?.data.gpt4vOpenRouter.percentage || 0}
                  className="mt-2"
                  data-testid="progress-gpt4v"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {quotaStatus?.data.gpt4vOpenRouter.percentage.toFixed(1)}% utilizado
                </p>
              </CardContent>
            </Card>

            {/* Claude 3 OpenRouter */}
            <Card data-testid="card-quota-claude3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  Claude 3 Haiku
                  <Badge variant="outline" className="ml-2">FREE</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="quota-claude3-used">
                  {quotaStatus?.data.claude3OpenRouter.used || 0} / {quotaStatus?.data.claude3OpenRouter.limit || 0}
                </div>
                <Progress
                  value={quotaStatus?.data.claude3OpenRouter.percentage || 0}
                  className="mt-2"
                  data-testid="progress-claude3"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {quotaStatus?.data.claude3OpenRouter.percentage.toFixed(1)}% utilizado
                </p>
              </CardContent>
            </Card>

            {/* HuggingFace */}
            <Card data-testid="card-quota-huggingface">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  HuggingFace
                  <Badge variant="outline" className="ml-2">FREE</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="quota-hf-used">
                  {quotaStatus?.data.huggingface.used || 0} / {quotaStatus?.data.huggingface.limit || 0}
                </div>
                <Progress
                  value={quotaStatus?.data.huggingface.percentage || 0}
                  className="mt-2"
                  data-testid="progress-hf"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {quotaStatus?.data.huggingface.percentage.toFixed(1)}% utilizado
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Provider Information */}
      <Card data-testid="card-providers">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Provedores Configurados
          </CardTitle>
          <CardDescription>
            Cascade de modelos de visão multimodal (ordem de prioridade)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providerLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {providerInfo?.data.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-start justify-between p-4 border rounded-lg"
                  data-testid={`provider-${provider.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{provider.name}</span>
                      <Badge variant={getTierColor(provider.tier)}>{provider.tier}</Badge>
                      {provider.status === "active" ? (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          API Key Missing
                        </Badge>
                      )}
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        Prioridade {provider.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Modelo: <code className="text-xs">{provider.model}</code>
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {provider.features.map((feature) => (
                        <Badge key={feature} variant="outline" className="text-xs">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    {provider.dailyLimit ? (
                      <>
                        <div className="text-2xl font-bold">{provider.dailyLimit}</div>
                        <p className="text-xs text-muted-foreground">req/dia</p>
                      </>
                    ) : (
                      <Badge variant="secondary">Ilimitado</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Statistics (Last 7 Days) */}
      <Card data-testid="card-usage-stats">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Estatísticas de Uso (Últimos 7 Dias)
          </CardTitle>
          <CardDescription>
            Histórico de requisições e performance dos provedores
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : Object.keys(quotaHistory?.data.providers || {}).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum dado de uso nos últimos 7 dias
            </div>
          ) : (
            <div className="space-y-4">
              {Object.values(quotaHistory?.data.providers || {}).map((stat: UsageStats) => (
                <div
                  key={stat.provider}
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`stats-${stat.provider}`}
                >
                  <div className="flex-1">
                    <div className="font-medium mb-1 capitalize">{stat.provider}</div>
                    <div className="flex gap-4 text-sm">
                      <span>
                        <span className="text-muted-foreground">Total:</span>{" "}
                        <span className="font-medium">{stat.totalRequests}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Sucesso:</span>{" "}
                        <span className="font-medium text-green-600">{stat.successfulRequests}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Falha:</span>{" "}
                        <span className="font-medium text-red-600">{stat.failedRequests}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Taxa:</span>{" "}
                        <span className="font-medium">{stat.successRate.toFixed(1)}%</span>
                      </span>
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <div className="text-sm text-muted-foreground">Tokens</div>
                    <div className="text-lg font-bold">{stat.totalTokens.toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
