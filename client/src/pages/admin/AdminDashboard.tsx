import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Database, FileText, Activity, ArrowLeft } from "lucide-react";
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
      const res = await apiRequest(`/admin/policies/${tenantId}`, {
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
      const res = await apiRequest("/admin/index-pdfs", {
        method: "POST",
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.documentIds.length} PDFs indexados com sucesso!` });
    },
  });

  if (!policy) {
    return <div className="p-8">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => window.location.href = "/"}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold">AION - Painel Administrativo</h1>
          </div>
          <Settings className="w-6 h-6 text-muted-foreground" />
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Moral/Ética/Legal Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Políticas Moral/Ética/Legal</CardTitle>
            <CardDescription>Configure restrições de conteúdo (sistema nasce 100% livre)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(policy.rules || {}).map(([rule, enabled]) => (
                <div key={rule} className="flex items-center justify-between space-x-2" data-testid={`rule-${rule}`}>
                  <Label htmlFor={rule} className="text-sm" data-testid={`label-${rule}`}>
                    {rule.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </Label>
                  <Switch
                    id={rule}
                    checked={enabled as boolean}
                    onCheckedChange={(checked) => {
                      updatePolicy.mutate({ rules: { ...policy.rules, [rule]: checked } });
                    }}
                    data-testid={`switch-${rule}`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* LLM Parameters */}
        <Card>
          <CardHeader>
            <CardTitle>Parâmetros do Modelo</CardTitle>
            <CardDescription>Controle temperatura, top_p, top_k</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Temperature: {policy.temperature}</Label>
              <Slider
                value={[policy.temperature * 100]}
                onValueChange={([val]) => updatePolicy.mutate({ temperature: val / 100 })}
                max={100}
                step={1}
                data-testid="slider-temperature"
              />
            </div>
            <div className="space-y-2">
              <Label>Top P: {policy.topP}</Label>
              <Slider
                value={[policy.topP * 100]}
                onValueChange={([val]) => updatePolicy.mutate({ topP: val / 100 })}
                max={100}
                step={1}
                data-testid="slider-topp"
              />
            </div>
            <div className="space-y-2">
              <Label>Top K: {policy.topK}</Label>
              <Slider
                value={[policy.topK]}
                onValueChange={([val]) => updatePolicy.mutate({ topK: val })}
                max={100}
                step={1}
                data-testid="slider-topk"
              />
            </div>
          </CardContent>
        </Card>

        {/* System Prompt */}
        <Card>
          <CardHeader>
            <CardTitle>System Prompt</CardTitle>
            <CardDescription>Defina a personalidade e instruções do sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={policy.systemPrompt || ""}
              onChange={(e) => updatePolicy.mutate({ systemPrompt: e.target.value })}
              rows={5}
              placeholder="You are AION..."
              data-testid="textarea-systemprompt"
            />
          </CardContent>
        </Card>

        {/* Knowledge Base */}
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Base</CardTitle>
            <CardDescription>Indexar os 7 PDFs técnicos do sistema</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => indexPDFs.mutate()}
              disabled={indexPDFs.isPending}
              data-testid="button-index-pdfs"
            >
              <Database className="w-4 h-4 mr-2" />
              {indexPDFs.isPending ? "Indexando..." : "Indexar PDFs Técnicos (7 documentos)"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Indexa todos os whitepapers: Parte I, II, III-A/B/C/D, Apêndices A/B/C/D
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
