import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Database, FileText, Activity, MessageSquare, Shield, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const { toast } = useToast();
  const [tenantId] = useState(1);

  const { data: policy, error, isLoading } = useQuery({
    queryKey: ["/api/admin/policies", tenantId],
    queryFn: async () => {
      console.log("[AdminDashboard] Fetching policy for tenant:", tenantId);
      const res = await apiRequest(`/api/admin/policies/${tenantId}`);
      const data = await res.json();
      console.log("[AdminDashboard] Policy data:", data);
      return data;
    },
  });

  console.log("[AdminDashboard] Query state:", { policy, error, isLoading });

  const updatePolicy = useMutation({
    mutationFn: async (updates: any) => {
      const res = await apiRequest(`/api/admin/policies/${tenantId}`, {
        method: "POST",
        body: JSON.stringify({ ...policy, ...updates }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies", tenantId] });
      toast({ title: "Política atualizada com sucesso!" });
    },
  });

  const indexPDFs = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/index-pdfs", {
        method: "POST",
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.documentIds.length} PDFs indexados com sucesso!` });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center">
        <div className="glass-premium p-8 rounded-3xl space-y-4 text-center">
          <div className="relative inline-block">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-full blur-xl opacity-50 animate-pulse" />
            <div className="relative glass p-6 rounded-full">
              <Settings className="w-12 h-12 text-primary animate-spin" />
            </div>
          </div>
          <p className="text-muted-foreground">Carregando painel administrativo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-6">
        <Card className="glass-premium max-w-md border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-destructive">Erro ao carregar políticas: {(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10">
      {/* Modern Header with Glassmorphism */}
      <header className="glass sticky top-0 z-50 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => window.location.href = "/chat"}
              className="glass-premium"
              data-testid="button-back-to-chat"
            >
              <MessageSquare className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-full blur-lg opacity-50" />
                <div className="relative glass-premium p-2 rounded-full">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">AION Admin</h1>
                <p className="text-xs text-muted-foreground">Painel de Controle & Políticas</p>
              </div>
            </div>
          </div>
          <Settings className="w-6 h-6 text-muted-foreground glow-primary" />
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Policy Controls Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Moral/Ética/Legal */}
          <Card className="glass-premium border-primary/20 hover-elevate animate-slide-up">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="gradient-text">Políticas Moral/Ética/Legal</span>
              </CardTitle>
              <CardDescription>
                Configure restrições de conteúdo (sistema nasce 100% livre)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(policy?.rules || {}).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between glass p-3 rounded-xl hover-elevate">
                  <Label htmlFor={key} className="text-sm font-medium">
                    {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Label>
                  <Switch
                    id={key}
                    checked={value as boolean}
                    onCheckedChange={(checked) => {
                      updatePolicy.mutate({
                        rules: { ...policy.rules, [key]: checked }
                      });
                    }}
                    data-testid={`switch-${key}`}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Comportamento da IA */}
          <Card className="glass-premium border-accent/20 hover-elevate animate-slide-up" style={{ animationDelay: "100ms" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                <span className="gradient-text-vibrant">Comportamento da IA</span>
              </CardTitle>
              <CardDescription>
                Ajuste a personalidade e estilo de resposta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Formalidade: {((policy?.behavior?.formality || 0.5) * 100).toFixed(0)}%
                </Label>
                <Slider
                  value={[(policy?.behavior?.formality || 0.5) * 100]}
                  onValueChange={([value]) => {
                    updatePolicy.mutate({
                      behavior: { ...policy.behavior, formality: value / 100 }
                    });
                  }}
                  className="glass p-2 rounded-xl"
                  data-testid="slider-formality"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  Criatividade: {((policy?.behavior?.creativity || 0.8) * 100).toFixed(0)}%
                </Label>
                <Slider
                  value={[(policy?.behavior?.creativity || 0.8) * 100]}
                  onValueChange={([value]) => {
                    updatePolicy.mutate({
                      behavior: { ...policy.behavior, creativity: value / 100 }
                    });
                  }}
                  className="glass p-2 rounded-xl"
                  data-testid="slider-creativity"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System Prompt */}
        <Card className="glass-premium border-primary/20 hover-elevate animate-slide-up" style={{ animationDelay: "200ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span className="gradient-text">System Prompt</span>
            </CardTitle>
            <CardDescription>
              Instruções base para o comportamento da IA
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={policy?.systemPrompt || ""}
              onChange={(e) => {
                updatePolicy.mutate({ systemPrompt: e.target.value });
              }}
              className="glass border-primary/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 min-h-[200px] font-mono text-sm"
              placeholder="Digite o system prompt..."
              data-testid="textarea-system-prompt"
            />
          </CardContent>
        </Card>

        {/* Knowledge Base */}
        <Card className="glass-premium border-accent/20 hover-elevate animate-slide-up" style={{ animationDelay: "300ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-accent" />
              <span className="gradient-text-vibrant">Knowledge Base</span>
            </CardTitle>
            <CardDescription>
              Indexe os 7 PDFs técnicos para RAG
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => indexPDFs.mutate()}
              disabled={indexPDFs.isPending}
              className="bg-gradient-to-r from-accent to-primary hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-accent/25"
              data-testid="button-index-pdfs"
            >
              {indexPDFs.isPending ? (
                <>
                  <Activity className="w-4 h-4 mr-2 animate-spin" />
                  Indexando...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  Indexar PDFs Técnicos
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
