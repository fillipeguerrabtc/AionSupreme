import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, Database, FileText, Activity, MessageSquare, Shield, Sparkles, Languages, Save, BarChart3, DollarSign, Search, Globe, Zap, Server, Cpu, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage, type Language } from "@/lib/i18n";
import { AionLogo } from "@/components/AionLogo";
import { COMMON_TIMEZONES, getCurrentDateTimeInTimezone } from "@/lib/datetime";
import TokenMonitoring from "./TokenMonitoring";
import KnowledgeBaseTab from "./KnowledgeBaseTab";
import TokenHistoryTab from "./TokenHistoryTab";
import CostHistoryTab from "./CostHistoryTab";
import GPUManagementTab from "./GPUManagementTab";
import FederatedTrainingTab from "./FederatedTrainingTab";
import AutoEvolutionTab from "./AutoEvolutionTab";
import DatasetsTab from "./DatasetsTab";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";
import AgentsPage from "./AgentsPage";
import CurationQueuePage from "./CurationQueuePage";
import NamespacesPage from "./NamespacesPage";
import ImagesGalleryPage from "./ImagesGalleryPage";

export default function AdminDashboard() {
  const { toast } = useToast();
  const { t, language, setLanguage } = useLanguage();
  const [, navigate] = useLocation();
  const [systemPromptValue, setSystemPromptValue] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [tokenSubtab, setTokenSubtab] = useState<'overview' | 'kb' | 'free-apis' | 'openai' | 'web' | 'deepweb' | 'limits'>('overview');
  const [selectedTimezone, setSelectedTimezone] = useState("America/Sao_Paulo");
  const [currentTime, setCurrentTime] = useState(getCurrentDateTimeInTimezone(selectedTimezone));
  
  // Local state for pending changes (not yet saved)
  const [pendingRules, setPendingRules] = useState<any>(null);
  const [pendingBehavior, setPendingBehavior] = useState<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: policy, error, isLoading } = useQuery({
    queryKey: ["/api/admin/policies"],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/policies`);
      const data = await res.json();
      return data;
    },
  });

  // Fetch documents count for Knowledge Base stats
  const { data: documentsData } = useQuery({
    queryKey: ["/api/admin/documents"],
  });

  // Fetch token statistics for Dashboard cards
  const { data: tokenSummary } = useQuery({
    queryKey: ["/api/tokens/summary"],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/summary`);
      return res.json();
    },
  });

  // Fetch cost history for total cost card
  const { data: costHistory } = useQuery({
    queryKey: ["/api/tokens/cost-history"],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/cost-history?limit=1000`);
      return res.json();
    },
  });

  // Fetch free APIs stats
  const { data: freeAPIsHistory } = useQuery({
    queryKey: ["/api/tokens/free-apis-history"],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/free-apis-history?limit=1000`);
      return res.json();
    },
  });

  // Fetch KB search history
  const { data: kbHistory } = useQuery({
    queryKey: ["/api/tokens/kb-history"],
    queryFn: async () => {
      const res = await fetch('/api/tokens/kb-history?limit=100');
      return res.json();
    },
  });

  // Fetch web search stats
  const { data: webStats } = useQuery({
    queryKey: ["/api/tokens/web-search-stats"],
    queryFn: async () => {
      const res = await fetch('/api/tokens/web-search-stats');
      return res.json();
    },
  });

  // Fetch system timezone
  const { data: systemTimezone } = useQuery({
    queryKey: ["/api/admin/settings/timezone"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/settings/timezone`);
      return res.json();
    },
  });

  // Fetch GPU workers stats
  const { data: gpuData } = useQuery({
    queryKey: ["/api/gpu/status"],
    queryFn: async () => {
      const res = await fetch('/api/gpu/status');
      return res.json();
    },
  });

  // Fetch Federated Training jobs
  const { data: trainingJobs } = useQuery({
    queryKey: ["/api/training/jobs"],
    queryFn: async () => {
      const res = await fetch(`/api/training/jobs`);
      return res.json();
    },
  });

  // Fetch Auto-Evolution stats
  const { data: autoEvolutionStats } = useQuery({
    queryKey: ["/api/training/auto-evolution/stats"],
    queryFn: async () => {
      const res = await fetch('/api/training/auto-evolution/stats');
      return res.json();
    },
  });

  // Calculate total tokens from all providers
  // 🔍 IMPORTANT: This calculates TODAY's tokens, not all-time tokens
  // It sums provider.today.tokens from all providers (OpenAI, Groq, Gemini, HuggingFace, etc.)
  // The backend /api/tokens/summary returns today/month breakdown using America/Sao_Paulo timezone
  // "Today" means from 00:00:00 to 23:59:59 in Brazilian timezone
  const totalTokensToday = tokenSummary?.reduce((sum: number, provider: any) => {
    return sum + (provider.today?.tokens || 0);
  }, 0) || 0;
  
  const totalTokensMonth = tokenSummary?.reduce((sum: number, provider: any) => {
    return sum + (provider.month?.tokens || 0);
  }, 0) || 0;

  const totalTokensAllTime = tokenSummary?.reduce((sum: number, provider: any) => {
    return sum + (provider.allTime?.tokens || 0);
  }, 0) || 0;

  // Fetch OpenAI specific stats from tokenSummary
  const openaiStats = tokenSummary?.find((p: any) => p.provider === 'openai');

  const updatePolicy = useMutation({
    mutationFn: async (updates: any) => {
      // Merge policy with updates, but exclude timestamp fields (backend manages these)
      const { createdAt, updatedAt, id, tenantId: _tenantId, ...policyFields } = policy || {};
      const payload = { ...policyFields, ...updates };
      
      const res = await apiRequest(`/api/admin/policies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/policies"] });
      setPendingRules(null);
      setPendingBehavior(null);
      setHasUnsavedChanges(false);
      toast({ title: t.admin.messages.policyUpdated });
    },
  });

  const indexPDFs = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/index-pdfs", {
        method: "POST",
        body: JSON.stringify({}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${data.documentIds.length} ${t.admin.messages.pdfsIndexed}` });
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

  // Initialize timezone from backend
  useEffect(() => {
    if (systemTimezone?.timezone) {
      setSelectedTimezone(systemTimezone.timezone);
    }
  }, [systemTimezone]);

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(getCurrentDateTimeInTimezone(selectedTimezone));
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedTimezone]);

  // Mutation to save timezone
  const saveTimezoneMutation = useMutation({
    mutationFn: async (timezone: string) => {
      const res = await apiRequest(`/api/admin/settings/timezone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ timezone }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Update local state immediately to ensure UI responsiveness
      if (data.timezone) {
        setSelectedTimezone(data.timezone);
        setCurrentTime(getCurrentDateTimeInTimezone(data.timezone));
      }
      toast({ title: t.admin.settings.timezone.saved });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/timezone"] });
    },
    onError: () => {
      toast({ 
        title: t.admin.settings.timezone.saveError,
        variant: "destructive" 
      });
    },
  });

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
          <p className="text-muted-foreground">{t.admin.messages.loading}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 flex items-center justify-center p-6">
        <Card className="glass-premium max-w-md border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-destructive">{t.admin.messages.error}: {(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
          
          <SidebarInset className="flex flex-col flex-1">
            {/* Global Header - Fixed at top */}
            <header className="glass sticky top-0 z-50 border-b border-white/10 shrink-0">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  {/* Logo + AION + Painel de Controle */}
                  <button 
                    onClick={() => setActiveTab("overview")} 
                    className="hover-elevate rounded-lg px-2 py-1 transition-all bg-transparent border-0 cursor-pointer flex items-center gap-3" 
                    data-testid="link-logo-home"
                  >
                    <AionLogo showText={false} size="md" />
                    <div>
                      <h1 className="font-bold text-xl gradient-text">AION</h1>
                      <p className="text-xs text-muted-foreground">Painel de Controle</p>
                    </div>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => navigate("/")}
                    className="glass-premium"
                    data-testid="button-back-to-chat"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </Button>
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
                        Português (BR)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setLanguage("en-US")}
                        className={language === "en-US" ? "bg-primary/20" : ""}
                        data-testid="lang-en-US"
                      >
                        English (US)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setLanguage("es-ES")}
                        className={language === "es-ES" ? "bg-primary/20" : ""}
                        data-testid="lang-es-ES"
                      >
                        Español (ES)
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto bg-gradient-to-br from-background via-background to-primary/10">
            <div className="p-6">
              {/* Overview Tab */}
              {activeTab === "overview" && (
                <div className="space-y-6">
        {/* Metrics Cards - Clickable - ONE CARD PER TAB/SUBTAB */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Card 1: Total Tokens → Token Monitoring (Overview) */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => {
              setTokenSubtab('overview');
              setActiveTab("tokens");
            }}
            data-testid="card-total-tokens"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" />
                {t.admin.overview.totalTokens}
              </CardTitle>
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">24h (Hoje):</span>
                  <span className="font-bold text-lg">{tokenSummary ? totalTokensToday.toLocaleString() : '...'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Histórico:</span>
                  <span className="font-bold text-primary">{tokenSummary ? totalTokensAllTime.toLocaleString() : '...'}</span>
                </div>
              </div>
              <CardDescription className="text-xs mt-2">
                {t.admin.overview.allProviders}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 2: Total Cost → Cost History Tab */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => setActiveTab("cost")}
            data-testid="card-total-cost"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                {t.admin.overview.totalCost}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold gradient-text-vibrant">
                {costHistory ? (
                  `$${(costHistory.totalCost || 0).toFixed(4)}`
                ) : (
                  <span className="animate-pulse">...</span>
                )}
              </div>
              <CardDescription className="text-xs">
                {t.admin.overview.openaiOnly}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 3: KB Searches → Token Monitoring (KB subtab) */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => {
              setTokenSubtab('kb');
              setActiveTab("tokens");
            }}
            data-testid="card-kb-searches"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Search className="w-4 h-4" />
                {t.admin.overview.kbSearches}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold gradient-text-vibrant">
                {kbHistory ? (
                  Array.isArray(kbHistory) ? kbHistory.length : 0
                ) : (
                  <span className="animate-pulse">...</span>
                )}
              </div>
              <CardDescription className="text-xs">
                {t.admin.overview.knowledgeBaseQueries}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 4: Free APIs → Token Monitoring (Free APIs subtab) */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => {
              setTokenSubtab('free-apis');
              setActiveTab("tokens");
            }}
            data-testid="card-free-apis"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="w-4 h-4" />
                {t.admin.overview.freeApis}
              </CardTitle>
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Groq:</span>
                  <span className="font-bold">{tokenSummary?.find((p: any) => p.provider === 'groq')?.allTime?.requests || 0} req</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Gemini:</span>
                  <span className="font-bold">{tokenSummary?.find((p: any) => p.provider === 'gemini')?.allTime?.requests || 0} req</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">HuggingFace:</span>
                  <span className="font-bold">{tokenSummary?.find((p: any) => p.provider === 'huggingface')?.allTime?.requests || 0} req</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">OpenRouter:</span>
                  <span className="font-bold">{tokenSummary?.find((p: any) => p.provider === 'openrouter')?.allTime?.requests || 0} req</span>
                </div>
              </div>
              <CardDescription className="text-xs mt-2">
                Últimas 24h
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 5: OpenAI → Token Monitoring (OpenAI subtab) */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => {
              setTokenSubtab('openai');
              setActiveTab("tokens");
            }}
            data-testid="card-openai"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                {t.admin.overview.openai}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold gradient-text-vibrant">
                {openaiStats ? (
                  (openaiStats.today?.requests || 0).toLocaleString()
                ) : (
                  <span className="animate-pulse">...</span>
                )}
              </div>
              <CardDescription className="text-xs">
                {t.admin.overview.paidApiRequests}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 6: Web Searches → Token Monitoring (Web subtab) */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => {
              setTokenSubtab('web');
              setActiveTab("tokens");
            }}
            data-testid="card-web-searches"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Globe className="w-4 h-4" />
                {t.admin.overview.webSearches}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold gradient-text-vibrant">
                {webStats?.web ? (
                  (webStats.web.totalSearches || 0).toLocaleString()
                ) : (
                  <span className="animate-pulse">...</span>
                )}
              </div>
              <CardDescription className="text-xs">
                {webStats?.web ? `${webStats.web.uniqueDomains || 0} ${t.admin.overview.domainsSearched}` : t.admin.overview.duckduckgoProvider}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 7: DeepWeb Searches → Token Monitoring (DeepWeb subtab) */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => {
              setTokenSubtab('deepweb');
              setActiveTab("tokens");
            }}
            data-testid="card-deepweb-searches"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="w-4 h-4" />
                {t.admin.overview.deepWeb}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold gradient-text-vibrant">
                {webStats?.deepweb ? (
                  (webStats.deepweb.totalSearches || 0).toLocaleString()
                ) : (
                  <span className="animate-pulse">...</span>
                )}
              </div>
              <CardDescription className="text-xs">
                {t.admin.overview.torNetworkQueries}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 8: KB Documents → Knowledge Base Tab */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => setActiveTab("knowledge")}
            data-testid="card-kb-documents"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Database className="w-4 h-4" />
                {t.admin.overview.kbDocuments}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold gradient-text-vibrant">
                {Array.isArray(documentsData) ? documentsData.length : 0}
              </div>
              <CardDescription className="text-xs">
                {t.admin.overview.indexedKnowledge}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 9: GPU Workers → GPU Management Tab */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => setActiveTab("gpu")}
            data-testid="card-gpu-workers"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Server className="w-4 h-4" />
                GPU Workers
              </CardTitle>
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold">{gpuData?.total || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-400">Healthy:</span>
                  <span className="font-bold text-green-400">{gpuData?.healthy || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-yellow-400">Unhealthy:</span>
                  <span className="font-bold text-yellow-400">{gpuData?.unhealthy || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-400">Offline:</span>
                  <span className="font-bold text-red-400">{gpuData?.offline || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Requests:</span>
                  <span className="font-bold">{gpuData?.totalRequests || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Avg Latency:</span>
                  <span className="font-bold">{(gpuData?.avgLatency || 0).toFixed(0)}ms</span>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Card 10: Federated Training Jobs → Federated Training Tab */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => setActiveTab("federated")}
            data-testid="card-federated-jobs"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                {t.admin.overview.federatedJobs}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold gradient-text-vibrant">
                {trainingJobs?.jobs ? (
                  Array.isArray(trainingJobs.jobs) ? trainingJobs.jobs.filter((job: any) => job.status === 'completed').length : 0
                ) : (
                  <span className="animate-pulse">...</span>
                )}
              </div>
              <CardDescription className="text-xs">
                {t.admin.overview.completedTrainingJobs}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 11: Auto-Evolution → Auto-Evolution Tab */}
          <Card 
            className="glass-premium border-accent/20 hover-elevate cursor-pointer transition-all" 
            onClick={() => setActiveTab("evolution")}
            data-testid="card-auto-evolution"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Auto-Evolução
              </CardTitle>
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Conversas:</span>
                  <span className="font-bold">{autoEvolutionStats?.overview?.totalConversations || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-400">Alta Qualidade:</span>
                  <span className="font-bold text-green-400">{autoEvolutionStats?.overview?.highQualityConversations || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Datasets KB:</span>
                  <span className="font-bold">{autoEvolutionStats?.overview?.kbGeneratedDatasets || 0}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Jobs:</span>
                  <span className="font-bold">{autoEvolutionStats?.overview?.completedJobs || 0}/{autoEvolutionStats?.overview?.totalJobs || 0}</span>
                </div>
              </div>
              <CardDescription className="text-xs mt-2">
                Sistema de auto-aprendizado
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
              </div>
              )}

              {/* Token Monitoring Tab */}
              {activeTab === "tokens" && (
                <div className="space-y-6">
                  <TokenMonitoring initialTab={tokenSubtab} />
                </div>
              )}

              {/* Token History Tab */}
              {activeTab === "history" && (
                <div className="space-y-6">
                  <TokenHistoryTab />
                </div>
              )}

              {/* Cost History Tab */}
              {activeTab === "cost" && (
                <div className="space-y-6">
                  <CostHistoryTab />
                </div>
              )}

              {/* Knowledge Base Tab */}
              {activeTab === "knowledge" && (
                <div className="space-y-6">
                  <KnowledgeBaseTab />
                </div>
              )}

              {/* GPU Management Tab */}
              {activeTab === "gpu" && (
                <div className="space-y-6">
                  <GPUManagementTab />
                </div>
              )}

              {/* Federated Training Tab */}
              {activeTab === "federated" && (
                <div className="space-y-6">
                  <FederatedTrainingTab />
                </div>
              )}

              {/* Auto-Evolution Tab */}
              {activeTab === "evolution" && (
                <div className="space-y-6">
                  <AutoEvolutionTab />
                </div>
              )}

              {/* Datasets Tab */}
              {activeTab === "datasets" && (
                <DatasetsTab />
              )}

              {/* Agents Tab */}
              {activeTab === "agents" && (
                <div className="space-y-6">
                  <AgentsPage />
                </div>
              )}

              {activeTab === "curation" && (
                <div className="space-y-6">
                  <CurationQueuePage />
                </div>
              )}

              {activeTab === "images" && (
                <div className="space-y-6">
                  <ImagesGalleryPage />
                </div>
              )}

              {activeTab === "namespaces" && (
                <div className="space-y-6">
                  <NamespacesPage />
                </div>
              )}

              {/* Settings Tab */}
              {activeTab === "settings" && (
                <div className="space-y-6">
            {/* Settings Header */}
            <div className="space-y-2">
              <h2 className="text-3xl font-bold gradient-text">{t.admin.settings.title}</h2>
              <p className="text-muted-foreground">{t.admin.settings.subtitle}</p>
            </div>

            {/* Policy Controls Grid */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Moral/Ética/Legal */}
              <Card className="glass-premium border-primary/20 animate-slide-up overflow-visible">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    <span className="gradient-text">{t.admin.policies.title}</span>
                  </CardTitle>
                  <CardDescription>
                    {t.admin.policies.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 overflow-visible">
                  {Object.entries(pendingRules || policy?.rules || {}).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-4 p-3 rounded-xl bg-card/50 border border-border/50">
                      <Label htmlFor={key} className="text-sm font-medium cursor-pointer flex-1">
                        {t.admin.policies.rules[key as keyof typeof t.admin.policies.rules] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Label>
                      <div className="flex-shrink-0 w-11 relative z-10">
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
                    <span className="gradient-text-vibrant">{t.admin.behavior.title}</span>
                  </CardTitle>
                  <CardDescription>
                    {t.admin.behavior.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      {t.admin.behavior.formality}: {(((pendingBehavior || policy?.behavior)?.formality || 0.5) * 100).toFixed(0)}%
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
                      {t.admin.behavior.creativity}: {(((pendingBehavior || policy?.behavior)?.creativity || 0.8) * 100).toFixed(0)}%
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
                  <span className="gradient-text">{t.admin.behavior.systemPrompt}</span>
                </CardTitle>
                <CardDescription>
                  {t.admin.behavior.systemPromptDesc}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={systemPromptValue}
                  onChange={(e) => setSystemPromptValue(e.target.value)}
                  className="glass border-primary/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 min-h-[200px] max-h-[600px] font-mono text-sm resize-y"
                  placeholder={t.admin.behavior.systemPromptPlaceholder}
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

            {/* Timezone Selector */}
            <Card className="glass-premium border-primary/20 hover-elevate animate-slide-up" style={{ animationDelay: "300ms" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-primary" />
                  <span className="gradient-text">{t.admin.settings.timezone.title}</span>
                </CardTitle>
                <CardDescription>
                  {t.admin.settings.timezone.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    {t.admin.settings.timezone.select}
                  </Label>
                  <Select 
                    value={selectedTimezone} 
                    onValueChange={setSelectedTimezone}
                  >
                    <SelectTrigger 
                      className="glass border-primary/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                      data-testid="select-timezone"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-premium border-primary/20">
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem 
                          key={tz.value} 
                          value={tz.value}
                          data-testid={`timezone-${tz.value}`}
                        >
                          {tz.label} - {tz.country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 rounded-xl bg-card/50 border border-border/50 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {t.admin.settings.timezone.currentTime}
                  </p>
                  <p className="text-2xl font-bold gradient-text-vibrant font-mono" data-testid="text-current-time">
                    {currentTime}
                  </p>
                </div>

                <Button
                  onClick={() => saveTimezoneMutation.mutate(selectedTimezone)}
                  disabled={saveTimezoneMutation.isPending}
                  className="bg-gradient-to-r from-primary to-accent hover:scale-105 active:scale-95 transition-all duration-300"
                  data-testid="button-save-timezone"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveTimezoneMutation.isPending ? t.admin.settings.timezone.saving : t.admin.settings.timezone.save}
                </Button>
              </CardContent>
            </Card>
                </div>
              )}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
