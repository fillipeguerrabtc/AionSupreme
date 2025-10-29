import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Database, FileText, Activity, MessageSquare, Shield, Sparkles, Languages, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage, type Language } from "@/lib/i18n";
import { AionLogo } from "@/components/AionLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AdminDashboard() {
  const { toast } = useToast();
  const { t, language, setLanguage } = useLanguage();
  const [tenantId] = useState(1);
  const [systemPromptValue, setSystemPromptValue] = useState("");
  
  // Local state for pending changes (not yet saved)
  const [pendingRules, setPendingRules] = useState<any>(null);
  const [pendingBehavior, setPendingBehavior] = useState<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: policy, error, isLoading } = useQuery({
    queryKey: ["/api/admin/policies", tenantId],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/policies/${tenantId}`);
      const data = await res.json();
      return data;
    },
  });

  const updatePolicy = useMutation({
    mutationFn: async (updates: any) => {
      // Merge policy with updates, but exclude timestamp fields (backend manages these)
      const { createdAt, updatedAt, id, tenantId: _tenantId, ...policyFields } = policy || {};
      const payload = { ...policyFields, ...updates };
      
      const res = await apiRequest(`/api/admin/policies/${tenantId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies", tenantId] });
      setPendingRules(null);
      setPendingBehavior(null);
      setHasUnsavedChanges(false);
      toast({ title: t.admin.policyUpdated });
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
      toast({ title: `${data.documentIds.length} ${t.admin.pdfsIndexed}` });
    },
  });

  // Initialize local state when policy loads
  useEffect(() => {
    if (policy) {
      setSystemPromptValue(policy.systemPrompt || "");
      setPendingRules(policy.rules);
      setPendingBehavior(policy.behavior);
      setHasUnsavedChanges(false);
    }
  }, [policy]);

  // Handler to save all pending changes
  const handleSaveChanges = () => {
    const updates: any = {};
    if (pendingRules) updates.rules = pendingRules;
    if (pendingBehavior) updates.behavior = pendingBehavior;
    updatePolicy.mutate(updates);
  };

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
          <p className="text-muted-foreground">{t.admin.loading}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-6">
        <Card className="glass-premium max-w-md border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-destructive">{t.admin.error}: {(error as Error).message}</p>
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
            <AionLogo size="md" showText={false} />
            <div>
              <h1 className="text-xl font-bold gradient-text">{t.admin.title}</h1>
              <p className="text-xs text-muted-foreground">{t.admin.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="glass-premium" data-testid="button-language">
                  <Languages className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-premium border-primary/20">
                <DropdownMenuItem
                  onClick={() => setLanguage("pt-BR")}
                  className={language === "pt-BR" ? "bg-primary/20" : ""}
                  data-testid="lang-pt-BR"
                >
                  🇧🇷 Português
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLanguage("en-US")}
                  className={language === "en-US" ? "bg-primary/20" : ""}
                  data-testid="lang-en-US"
                >
                  🇺🇸 English
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLanguage("es-ES")}
                  className={language === "es-ES" ? "bg-primary/20" : ""}
                  data-testid="lang-es-ES"
                >
                  🇪🇸 Español
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Settings className="w-6 h-6 text-muted-foreground glow-primary" />
          </div>
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
                <span className="gradient-text">{t.admin.policies}</span>
              </CardTitle>
              <CardDescription>
                {t.admin.policiesDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(pendingRules || policy?.rules || {}).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-card/50 border border-border/50">
                  <Label htmlFor={key} className="text-sm font-medium cursor-pointer flex-1">
                    {t.admin.rules[key as keyof typeof t.admin.rules] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Label>
                  <div className="flex-shrink-0 w-11">
                    <Switch
                      id={key}
                      checked={value as boolean}
                      onCheckedChange={(checked) => {
                        setPendingRules({ ...pendingRules, [key]: checked });
                        setHasUnsavedChanges(true);
                      }}
                      data-testid={`switch-${key}`}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Comportamento da IA */}
          <Card className="glass-premium border-accent/20 hover-elevate animate-slide-up" style={{ animationDelay: "100ms" }}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                <span className="gradient-text-vibrant">{t.admin.behavior}</span>
              </CardTitle>
              <CardDescription>
                {t.admin.behaviorDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {t.admin.formality}: {(((pendingBehavior || policy?.behavior)?.formality || 0.5) * 100).toFixed(0)}%
                </Label>
                <Slider
                  value={[((pendingBehavior || policy?.behavior)?.formality || 0.5) * 100]}
                  onValueChange={([value]) => {
                    setPendingBehavior({ ...pendingBehavior, formality: value / 100 });
                    setHasUnsavedChanges(true);
                  }}
                  className="glass p-2 rounded-xl"
                  data-testid="slider-formality"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">
                  {t.admin.creativity}: {(((pendingBehavior || policy?.behavior)?.creativity || 0.8) * 100).toFixed(0)}%
                </Label>
                <Slider
                  value={[((pendingBehavior || policy?.behavior)?.creativity || 0.8) * 100]}
                  onValueChange={([value]) => {
                    setPendingBehavior({ ...pendingBehavior, creativity: value / 100 });
                    setHasUnsavedChanges(true);
                  }}
                  className="glass p-2 rounded-xl"
                  data-testid="slider-creativity"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Save Button */}
        {hasUnsavedChanges && (
          <Card className="glass-premium border-accent/30 bg-accent/5 hover-elevate animate-slide-up">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4 text-accent animate-pulse" />
                  Você tem alterações não salvas
                </p>
                <Button
                  onClick={handleSaveChanges}
                  disabled={updatePolicy.isPending}
                  className="bg-gradient-to-r from-accent to-primary hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-accent/25"
                  data-testid="button-save-changes"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {updatePolicy.isPending ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* System Prompt */}
        <Card className="glass-premium border-primary/20 hover-elevate animate-slide-up" style={{ animationDelay: "200ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span className="gradient-text">{t.admin.systemPrompt}</span>
            </CardTitle>
            <CardDescription>
              {t.admin.systemPromptDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={systemPromptValue}
              onChange={(e) => setSystemPromptValue(e.target.value)}
              className="glass border-primary/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 min-h-[200px] max-h-[600px] font-mono text-sm resize-y"
              placeholder={t.admin.systemPromptPlaceholder}
              data-testid="textarea-system-prompt"
            />
            <Button
              onClick={() => updatePolicy.mutate({ systemPrompt: systemPromptValue })}
              disabled={updatePolicy.isPending}
              className="bg-gradient-to-r from-primary to-accent hover:scale-105 active:scale-95 transition-all duration-300"
              data-testid="button-save-system-prompt"
            >
              <Save className="w-4 h-4 mr-2" />
              {updatePolicy.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </CardContent>
        </Card>

        {/* Knowledge Base */}
        <Card className="glass-premium border-accent/20 hover-elevate animate-slide-up" style={{ animationDelay: "300ms" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-accent" />
              <span className="gradient-text-vibrant">{t.admin.knowledgeBase}</span>
            </CardTitle>
            <CardDescription>
              {t.admin.knowledgeBaseDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              onClick={() => window.location.href = "/admin/knowledge-base"}
              className="w-full bg-gradient-to-r from-accent to-primary hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-accent/25"
              data-testid="button-manage-kb"
            >
              <FileText className="w-4 h-4 mr-2" />
              Gerenciar Knowledge Base
            </Button>
            <Button
              onClick={() => indexPDFs.mutate()}
              disabled={indexPDFs.isPending}
              variant="secondary"
              className="w-full hover:scale-105 active:scale-95 transition-all duration-300"
              data-testid="button-index-pdfs"
            >
              {indexPDFs.isPending ? (
                <>
                  <Activity className="w-4 h-4 mr-2 animate-spin" />
                  {t.admin.indexing}
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  {t.admin.indexPDFs} (7 PDFs Técnicos)
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
