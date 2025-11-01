import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, CheckCircle2, XCircle, Activity } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { formatDateTimeInTimezone } from "@/lib/datetime";
import { apiRequest } from "@/lib/queryClient";

interface TokenHistoryRecord {
  id: number;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  requestType: string;
  success: boolean;
  timestamp: Date | string;
  metadata?: any;
}

const providerColors: Record<string, string> = {
  groq: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  gemini: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  huggingface: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  openrouter: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  openai: "bg-green-500/10 text-green-500 border-green-500/20",
  kb: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  web: "bg-red-500/10 text-red-500 border-red-500/20",
  deepweb: "bg-gray-500/10 text-gray-500 border-gray-500/20"
};

export default function TokenHistoryTab() {
  const { t } = useLanguage();

  // Fetch tenant timezone for dynamic date formatting
  const { data: tenantTimezone } = useQuery<{ timezone: string }>({
    queryKey: ["/api/admin/settings/timezone"],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/settings/timezone`);
      return res.json();
    },
  });
  const timezone = tenantTimezone?.timezone || "America/Sao_Paulo";

  const { data: history, isLoading } = useQuery<TokenHistoryRecord[]>({
    queryKey: ["/api/tokens/complete-history"],
    queryFn: async () => {
      const res = await fetch("/api/tokens/complete-history?limit=500");
      if (!res.ok) throw new Error("Failed to fetch token history");
      return res.json();
    },
    refetchInterval: 30000
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Activity className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalTokens = history?.reduce((sum, r) => sum + r.totalTokens, 0) || 0;
  const totalCost = history?.reduce((sum, r) => sum + r.cost, 0) || 0;
  const successRate = history?.length ? 
    ((history.filter(r => r.success).length / history.length) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-premium border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.tokenHistory.overview.totalRecords}</CardTitle>
            <div className="text-3xl font-bold gradient-text-vibrant">{history?.length || 0}</div>
          </CardHeader>
        </Card>
        
        <Card className="glass-premium border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.tokenHistory.overview.totalTokens}</CardTitle>
            <div className="text-3xl font-bold gradient-text-vibrant">{totalTokens.toLocaleString()}</div>
          </CardHeader>
        </Card>
        
        <Card className="glass-premium border-accent/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.admin.tokenHistory.overview.totalCost}</CardTitle>
            <div className="text-3xl font-bold gradient-text-vibrant">${totalCost.toFixed(4)}</div>
          </CardHeader>
        </Card>
      </div>

      <Card className="glass-premium border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" />
            {t.admin.tokenHistory.history.title}
          </CardTitle>
          <CardDescription>
            {t.admin.tokenHistory.history.subtitle}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            <div className="space-y-2">
              {history?.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border/50 hover-elevate"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Badge className={providerColors[record.provider] || "bg-gray-500/10"}>
                      {record.provider.toUpperCase()}
                    </Badge>
                    
                    <div className="flex-1">
                      <div className="font-medium text-sm">{record.model}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTimeInTimezone(record.timestamp, timezone, { includeSeconds: true })}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="font-mono text-sm font-medium">
                        {record.totalTokens.toLocaleString()} {t.admin.tokenHistory.history.tokens}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {record.promptTokens} → {record.completionTokens}
                      </div>
                    </div>
                    
                    {record.cost > 0 && (
                      <div className="text-right">
                        <div className="font-mono text-sm text-green-500">
                          ${record.cost.toFixed(4)}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      {record.success ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              {(!history || history.length === 0) && (
                <div className="text-center py-12 text-muted-foreground">
                  {t.admin.tokenHistory.history.noHistory}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
