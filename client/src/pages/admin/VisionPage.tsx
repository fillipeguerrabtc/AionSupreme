import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Eye, CheckCircle2, XCircle, Clock, TrendingUp, Zap, AlertCircle, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/lib/i18n";
import { useScrollToTop } from "@/hooks/useScrollToTop";

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

interface ProviderLimitData {
  limits: {
    rpm: number | null;
    rpd: number | null;
    tpm: number | null;
    tpd: number | null;
  };
  usage: {
    rpmUsed: number | null;
    rpdUsed: number | null;
    tpmUsed: number | null;
    tpdUsed: number | null;
  };
  remaining: {
    rpmRemaining: number | null;
    rpdRemaining: number | null;
    tpmRemaining: number | null;
    tpdRemaining: number | null;
  };
  resetAt: {
    rpmResetAt: string | null;
    rpdResetAt: string | null;
    tpmResetAt: string | null;
    tpdResetAt: string | null;
  };
  creditsBalance: number | null;
  lastUpdated: string;
  source: string;
}

// Real Provider Limits Component (NO hardcoded values!)
function RealProviderLimits() {
  const { data, isLoading } = useQuery<{
    success: boolean;
    limits: Record<string, ProviderLimitData>;
    note: string;
  }>({
    queryKey: ["/api/provider-limits"],
    refetchInterval: 30000, // Atualiza a cada 30s
  });

  if (isLoading) {
    return <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>;
  }

  if (!data || !data.limits) {
    return <div className="text-sm text-muted-foreground">No provider limit data available</div>;
  }

  const formatValue = (val: number | null, unit: string) => {
    if (val === null) return <span className="text-muted-foreground">N/A</span>;
    return <span>{val.toLocaleString()} {unit}</span>;
  };

  const formatCredits = (val: number | null) => {
    if (val === null) return <span className="text-muted-foreground">N/A</span>;
    return <span>${val.toFixed(2)}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
        <strong>Note:</strong> {data.note}
      </div>

      {Object.entries(data.limits).map(([provider, limitData]) => (
        <div
          key={provider}
          className="border rounded-lg p-4 space-y-3"
          data-testid={`provider-limit-${provider}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="uppercase">{provider}</Badge>
              <span className="text-xs text-muted-foreground">
                Source: {limitData.source}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Last updated: {new Date(limitData.lastUpdated).toLocaleString()}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">RPM Limit</div>
              <div className="text-sm font-medium">{formatValue(limitData.limits.rpm, 'req/min')}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">RPD Limit</div>
              <div className="text-sm font-medium">{formatValue(limitData.limits.rpd, 'req/day')}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">TPM Limit</div>
              <div className="text-sm font-medium">{formatValue(limitData.limits.tpm, 'tok/min')}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">TPD Limit</div>
              <div className="text-sm font-medium">{formatValue(limitData.limits.tpd, 'tok/day')}</div>
            </div>
          </div>

          {limitData.creditsBalance !== null && (
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground">Credits Balance</div>
              <div className="text-lg font-bold">{formatCredits(limitData.creditsBalance)}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function VisionPage() {
  useScrollToTop();
  const { t } = useLanguage();
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

  // Fetch provider info from backend API (no more hardcoded data!)
  const { data: providerInfo, isLoading: providerLoading, error: providerError } = useQuery<{
    success: boolean;
    data: ProviderInfo[];
    timestamp: string;
  }>({
    queryKey: ["/api/vision/providers"],
    refetchInterval: 60000, // Atualiza a cada 1 min
    retry: 3, // Retry 3 times on failure
  });

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
            {t.admin.vision.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t.admin.vision.subtitle}
          </p>
        </div>
      </div>

      {/* Error handling for provider fetch failure */}
      {providerError && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              {t.admin.vision.errorLoading}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t.admin.vision.errorLoadingDesc}
            </p>
            <p className="text-xs font-mono bg-muted p-2 rounded">
              {providerError instanceof Error ? providerError.message : String(providerError)}
            </p>
          </CardContent>
        </Card>
      )}

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
                  {quotaStatus?.data.gemini.percentage.toFixed(1)}% {t.admin.vision.used}
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
                  {quotaStatus?.data.gpt4vOpenRouter.percentage.toFixed(1)}% {t.admin.vision.used}
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
                  {quotaStatus?.data.claude3OpenRouter.percentage.toFixed(1)}% {t.admin.vision.used}
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
                  {quotaStatus?.data.huggingface.percentage.toFixed(1)}% {t.admin.vision.used}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Real Provider Limits (from /api/provider-limits) */}
      <Card data-testid="card-real-provider-limits">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Real Provider Limits
          </CardTitle>
          <CardDescription>
            Live data from provider APIs/headers - NO hardcoded values
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RealProviderLimits />
        </CardContent>
      </Card>

      {/* Provider Information */}
      <Card data-testid="card-providers">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {t.admin.vision.providersTitle}
          </CardTitle>
          <CardDescription>
            {t.admin.vision.providersDesc}
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
                          {t.admin.vision.active}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          {t.admin.vision.missingKey}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {t.admin.vision.priority} {provider.priority}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {t.admin.vision.model}: <code className="text-xs">{provider.model}</code>
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
                        <p className="text-xs text-muted-foreground">{t.admin.vision.reqPerDay}</p>
                      </>
                    ) : (
                      <Badge variant="secondary">{t.admin.vision.unlimited}</Badge>
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
            {t.admin.vision.statsTitle}
          </CardTitle>
          <CardDescription>
            {t.admin.vision.statsDesc}
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
              {t.admin.vision.noData}
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
                        <span className="text-muted-foreground">{t.admin.vision.total}:</span>{" "}
                        <span className="font-medium">{stat.totalRequests}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">{t.admin.vision.success}:</span>{" "}
                        <span className="font-medium text-green-600">{stat.successfulRequests}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">{t.admin.vision.failed}:</span>{" "}
                        <span className="font-medium text-red-600">{stat.failedRequests}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">{t.admin.vision.rate}:</span>{" "}
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
