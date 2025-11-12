import { useState, useEffect, lazy, Suspense } from "react";
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
import { Settings, Database, FileText, Activity, MessageSquare, Shield, Sparkles, Languages, Save, BarChart3, DollarSign, Search, Globe, Zap, Server, Cpu, Clock, Eye, Upload, Download, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage, type Language } from "@/lib/i18n";
import { AionLogo } from "@/components/AionLogo";
import { COMMON_TIMEZONES, getCurrentDateTimeInTimezone } from "@/lib/datetime";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { DEFAULT_BEHAVIOR, normalizeBehavior, type BehaviorConfig } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";

const TokenMonitoring = lazy(() => import("./TokenMonitoring"));
const KnowledgeBaseTab = lazy(() => import("./KnowledgeBaseTab"));
const TokenHistoryTab = lazy(() => import("./TokenHistoryTab"));
const CostHistoryTab = lazy(() => import("./CostHistoryTab"));
const GPUOverviewPage = lazy(() => import("./GPUOverviewPage"));
const FederatedTrainingTab = lazy(() => import("./FederatedTrainingTab"));
const AutoEvolutionTab = lazy(() => import("./AutoEvolutionTab"));
const DatasetsTab = lazy(() => import("./DatasetsTab"));
const MetaLearningDashboard = lazy(() => import("../meta-learning-dashboard"));
const AgentsPage = lazy(() => import("./AgentsPage"));
const CurationQueuePage = lazy(() => import("./CurationQueuePage"));
const JobsPage = lazy(() => import("./JobsPage"));
const UsersPage = lazy(() => import("./UsersPage"));
const PermissionsPage = lazy(() => import("./PermissionsPage"));
const NamespacesPage = lazy(() => import("./NamespacesPage"));
const ImagesGalleryPage = lazy(() => import("./ImagesGalleryPage"));
const ImageSearchPage = lazy(() => import("./ImageSearchPage"));
const LifecyclePoliciesTab = lazy(() => import("./LifecyclePoliciesTab"));
const VisionPage = lazy(() => import("./VisionPage"));
const TelemetriaPage = lazy(() => import("./TelemetriaPage"));
const AutoApprovalPage = lazy(() => import("./AutoApprovalPage"));

export default function AdminDashboard() {
  const { toast } = useToast();
  const { t, language, setLanguage } = useLanguage();
  const [, navigate] = useLocation();
  const [systemPromptValue, setSystemPromptValue] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [tokenSubtab, setTokenSubtab] = useState<'overview' | 'kb' | 'free-apis' | 'openai' | 'web' | 'limits'>('overview');
  const [selectedTimezone, setSelectedTimezone] = useState("America/Sao_Paulo");
  const [currentTime, setCurrentTime] = useState(getCurrentDateTimeInTimezone(selectedTimezone));
  
  // Local state for pending changes (not yet saved)
  const [pendingRules, setPendingRules] = useState<any>(null);
  const [pendingBehavior, setPendingBehavior] = useState<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // State for full prompt preview
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [fullPrompt, setFullPrompt] = useState("");
  
  // State for database restore
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  const { data: policy, error, isLoading } = useQuery({
    queryKey: ["/api/admin/policies"],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/policies`);
      const data = await res.json();
      return data;
    },
  });

  // Fetch the FULL system prompt preview with current (unsaved) values
  const { data: fullPromptData, refetch: refetchPrompt } = useQuery({
    queryKey: ["/api/admin/policies/preview-prompt", pendingBehavior, systemPromptValue],
    queryFn: async () => {
      const res = await apiRequest("/api/admin/policies/preview-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          behavior: pendingBehavior || policy?.behavior,
          systemPrompt: systemPromptValue
        })
      });
      return res.json();
    },
    enabled: !!policy, // Só executa quando policy estiver carregada
  });

  // Fetch documents count for Knowledge Base stats
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos
  const { data: documentsData } = useQuery({
    queryKey: ["/api/admin/documents"],
    queryFn: async () => {
      const res = await fetch('/api/admin/documents');
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Fetch token statistics for Dashboard cards
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos para manter dados em tempo real
  const { data: tokenSummary } = useQuery({
    queryKey: ["/api/tokens/summary"],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/summary`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Fetch cost history for total cost card
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos
  const { data: costHistory } = useQuery({
    queryKey: ["/api/tokens/cost-history"],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/cost-history?limit=1000`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Fetch free APIs stats
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos
  const { data: freeAPIsHistory } = useQuery({
    queryKey: ["/api/tokens/free-apis-history"],
    queryFn: async () => {
      const res = await fetch(`/api/tokens/free-apis-history?limit=1000`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Fetch KB search history
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos
  const { data: kbHistory } = useQuery({
    queryKey: ["/api/tokens/kb-history"],
    queryFn: async () => {
      const res = await fetch('/api/tokens/kb-history?limit=100');
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Fetch web search stats
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos
  const { data: webStats } = useQuery({
    queryKey: ["/api/tokens/web-search-stats"],
    queryFn: async () => {
      const res = await fetch('/api/tokens/web-search-stats');
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Fetch provider quotas (fonte de verdade para uso diário)
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos
  const { data: quotas } = useQuery({
    queryKey: ["/api/tokens/quotas"],
    queryFn: async () => {
      const res = await fetch('/api/tokens/quotas');
      return res.json();
    },
    refetchInterval: 10000,
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
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos
  const { data: gpuData } = useQuery({
    queryKey: ["/api/gpu/overview"],
    queryFn: async () => {
      const res = await fetch('/api/gpu/overview');
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Fetch Federated Training jobs
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos
  const { data: trainingJobs } = useQuery({
    queryKey: ["/api/training/jobs"],
    queryFn: async () => {
      const res = await fetch(`/api/training/jobs`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Fetch Auto-Evolution stats
  // 🔥 AUTO-REFRESH: Atualiza a cada 10 segundos
  const { data: autoEvolutionStats } = useQuery({
    queryKey: ["/api/training/auto-evolution/stats"],
    queryFn: async () => {
      const res = await fetch('/api/training/auto-evolution/stats');
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Calculate total tokens from all providers
  // 🔍 IMPORTANT: This calculates TODAY's tokens, not all-time tokens
  // It sums provider.today.tokens from all providers (OpenAI, Groq, Gemini, HuggingFace, etc.)
  // The backend /api/tokens/summary returns today/month breakdown using America/Sao_Paulo timezone
  // "Today" means from 00:00:00 to 23:59:59 in Brazilian timezone
  // PRODUCTION-FIX: Ensure tokenSummary is an array before calling reduce
  const totalTokensToday = (Array.isArray(tokenSummary) ? tokenSummary.reduce((sum: number, provider: any) => {
    return sum + (provider.today?.tokens || 0);
  }, 0) : 0);
  
  const totalTokensMonth = (Array.isArray(tokenSummary) ? tokenSummary.reduce((sum: number, provider: any) => {
    return sum + (provider.month?.tokens || 0);
  }, 0) : 0);

  const totalTokensAllTime = (Array.isArray(tokenSummary) ? tokenSummary.reduce((sum: number, provider: any) => {
    return sum + (provider.allTime?.tokens || 0);
  }, 0) : 0);

  // Fetch OpenAI specific stats from tokenSummary
  const openaiStats = Array.isArray(tokenSummary) ? tokenSummary.find((p: any) => p.provider === 'openai') : null;

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

  // Mutation to create database backup
  // NOTE: Backend now streams the file directly (not saved on server)
  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/admin/backup/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || t.admin.settings.databaseManagement.toasts.restoreError);
      }
      
      // Backend now returns the file directly as a stream
      const blob = await res.blob();
      
      // Extract filename from Content-Disposition header
      const contentDisposition = res.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+?)"/);
      const filename = filenameMatch?.[1] || `aion_backup_${new Date().toISOString()}.sql.gz`;
      
      return { blob, filename };
    },
    onSuccess: async (data) => {
      // Download the backup file received from backend
      const url = window.URL.createObjectURL(data.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({ title: t.admin.settings.databaseManagement.toasts.backupCreated });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/list"] });
    },
    onError: (error: any) => {
      toast({ 
        title: t.admin.settings.databaseManagement.toasts.restoreError,
        description: error.message || t.admin.settings.databaseManagement.toasts.restoreError,
        variant: "destructive" 
      });
    },
  });

  // Mutation to restore database from backup
  const restoreBackupMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('backup', file); // FIXED: Changed from 'file' to 'backup' to match backend multer config
      
      const res = await apiRequest(`/api/admin/backup/restore`, {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(errorData.message || t.admin.settings.databaseManagement.toasts.restoreError);
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t.admin.settings.databaseManagement.toasts.restoreSuccess });
      setSelectedBackupFile(null);
      setShowRestoreConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/backup/list"] });
    },
    onError: (error: any) => {
      toast({ 
        title: t.admin.settings.databaseManagement.toasts.restoreError,
        description: error.message || t.admin.settings.databaseManagement.toasts.restoreError,
        variant: "destructive" 
      });
      setShowRestoreConfirm(false);
    },
  });

  // Handler to save all pending changes
  const handleSaveChanges = () => {
    const updates: any = {};
    if (pendingRules) updates.rules = pendingRules;
    
    if (pendingBehavior) {
      const currentBehavior = policy?.behavior || DEFAULT_BEHAVIOR;
      updates.behavior = normalizeBehavior({ ...currentBehavior, ...pendingBehavior });
    }
    
    updatePolicy.mutate(updates);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="bg-card border p-8 rounded-xl space-y-4 text-center">
          <div className="relative inline-block">
            <div className="bg-muted p-6 rounded-full">
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
        <Card className="bg-card max-w-md border border-destructive/50">
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
      <div className="flex h-screen w-full overflow-x-hidden">
        <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />
          
          <SidebarInset className="flex flex-col flex-1 max-w-full">
            {/* Global Header - Fixed at top */}
            <header className="bg-background/95 backdrop-glass sticky top-0 z-50 border-b shrink-0">
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
                      <h1 className="font-bold text-xl text-foreground">AION</h1>
                      <p className="text-xs text-muted-foreground">Painel de Controle</p>
                    </div>
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => navigate("/")}
                    className="bg-muted border"
                    data-testid="button-back-to-chat"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="bg-muted border" data-testid="button-language">
                        <Languages className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border">
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
            <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background">
            <div className="p-6 w-full max-w-full">
              {/* Overview Tab */}
              {activeTab === "overview" && (
                <div className="space-y-6">
        {/* Metrics Cards - Clickable - ONE CARD PER TAB/SUBTAB */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Card 1: Total Tokens → Token Monitoring (Overview) */}
          <Card 
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
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
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
            onClick={() => setActiveTab("cost")}
            data-testid="card-total-cost"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                {t.admin.overview.totalCost}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">
                {costHistory ? (
                  `$${(costHistory?.overallTotal || 0).toFixed(4)}`
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
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
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
              <div className="text-2xl sm:text-3xl font-bold text-foreground">
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
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
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
                  <span className="font-bold">{quotas?.find((q: any) => q.provider === 'groq')?.used || 0} req</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Gemini:</span>
                  <span className="font-bold">{quotas?.find((q: any) => q.provider === 'gemini')?.used || 0} req</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">HuggingFace:</span>
                  <span className="font-bold">{quotas?.find((q: any) => q.provider === 'huggingface')?.used || 0} req</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">OpenRouter:</span>
                  <span className="font-bold">{quotas?.find((q: any) => q.provider === 'openrouter')?.used || 0} req</span>
                </div>
              </div>
              <CardDescription className="text-xs mt-2">
                Uso Hoje (UTC reset)
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 5: OpenAI → Token Monitoring (OpenAI subtab) */}
          <Card 
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
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
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Histórico Total:</span>
                  <span className="font-bold text-lg">{openaiStats ? (openaiStats.allTime?.requests || 0).toLocaleString() : '...'} req</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Tokens:</span>
                  <span className="font-bold text-primary">{openaiStats ? (openaiStats.allTime?.tokens || 0).toLocaleString() : '...'}</span>
                </div>
              </div>
              <CardDescription className="text-xs mt-2">
                {t.admin.overview.paidApiRequests}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 6: Web Searches → Token Monitoring (Web subtab) */}
          <Card 
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
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
              <div className="text-2xl sm:text-3xl font-bold text-foreground">
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

          {/* Card 7: KB Documents → Knowledge Base Tab */}
          <Card 
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
            onClick={() => setActiveTab("knowledge")}
            data-testid="card-kb-documents"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Database className="w-4 h-4" />
                {t.admin.overview.kbDocuments}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">
                {Array.isArray(documentsData) ? documentsData.length : 0}
              </div>
              <CardDescription className="text-xs">
                {t.admin.overview.indexedKnowledge}
              </CardDescription>
            </CardHeader>
          </Card>

          {/* Card 9: GPU Workers → GPU Management Tab */}
          <Card 
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
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
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
            onClick={() => setActiveTab("federated")}
            data-testid="card-federated-jobs"
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                {t.admin.overview.federatedJobs}
              </CardTitle>
              <div className="text-2xl sm:text-3xl font-bold text-foreground">
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

          {/* Card 11: Auto-Evolution → Meta-Learning Tab (consolidated) */}
          <Card 
            className="glass-modern hover-elevate cursor-pointer transition-all duration-200" 
            onClick={() => setActiveTab("meta-learning")}
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

              {/* Telemetria Tab */}
              {activeTab === "telemetry" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <TelemetriaPage />
                  </div>
                </Suspense>
              )}

              {/* Token Monitoring Tab - TEMPORARILY DISABLED */}
              {activeTab === "tokens" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <TokenMonitoring initialTab={tokenSubtab} />
                  </div>
                </Suspense>
              )}

              {/* Token History Tab */}
              {activeTab === "history" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <TokenHistoryTab />
                  </div>
                </Suspense>
              )}

              {/* Cost History Tab */}
              {activeTab === "cost" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <CostHistoryTab />
                  </div>
                </Suspense>
              )}

              {/* Knowledge Base Tab */}
              {activeTab === "knowledge" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <KnowledgeBaseTab />
                  </div>
                </Suspense>
              )}

              {/* GPU Overview Tab - Unified Management */}
              {activeTab === "gpu" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="overflow-x-hidden w-full max-w-full min-w-0">
                    <GPUOverviewPage />
                  </div>
                </Suspense>
              )}

              {/* Federated Training Tab */}
              {activeTab === "federated" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <FederatedTrainingTab />
                  </div>
                </Suspense>
              )}

              {/* Meta-Learning Tab (includes Auto-Evolution metrics) */}
              {activeTab === "meta-learning" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="overflow-x-hidden w-full max-w-full min-w-0">
                    <MetaLearningDashboard />
                  </div>
                </Suspense>
              )}

              {/* Datasets Tab */}
              {activeTab === "datasets" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="overflow-x-hidden w-full max-w-full min-w-0">
                    <DatasetsTab />
                  </div>
                </Suspense>
              )}

              {/* Agents Tab */}
              {activeTab === "agents" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <AgentsPage />
                  </div>
                </Suspense>
              )}

              {/* Users Tab */}
              {activeTab === "users" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <UsersPage />
                  </div>
                </Suspense>
              )}

              {/* Permissions Tab */}
              {activeTab === "permissions" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <PermissionsPage />
                  </div>
                </Suspense>
              )}

              {activeTab === "auto-approval" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <AutoApprovalPage />
                  </div>
                </Suspense>
              )}

              {activeTab === "curation" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <CurationQueuePage />
                  </div>
                </Suspense>
              )}

              {activeTab === "jobs" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <JobsPage />
                  </div>
                </Suspense>
              )}

              {activeTab === "images" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <ImagesGalleryPage />
                  </div>
                </Suspense>
              )}

              {activeTab === "image-search" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <ImageSearchPage />
                  </div>
                </Suspense>
              )}

              {activeTab === "vision" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <VisionPage />
                  </div>
                </Suspense>
              )}

              {activeTab === "namespaces" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <NamespacesPage />
                  </div>
                </Suspense>
              )}

              {activeTab === "lifecycle" && (
                <Suspense fallback={<LoadingSpinner />}>
                  <div className="space-y-6 overflow-x-hidden w-full max-w-full min-w-0">
                    <LifecyclePoliciesTab />
                  </div>
                </Suspense>
              )}

              {/* Settings Tab */}
              {activeTab === "settings" && (
                <div className="space-y-6">
            {/* Settings Header */}
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-foreground">{t.admin.settings.title}</h2>
              <p className="text-muted-foreground">{t.admin.settings.subtitle}</p>
            </div>

            {/* Comportamento da IA */}
            <Card className="glass-modern hover-elevate animate-slide-up max-w-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-accent" />
                  <span className="text-foreground font-semibold">{t.admin.behavior.title}</span>
                </CardTitle>
                <CardDescription>
                  {t.admin.behavior.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 1. Verbosity */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t.admin.behavior.verbosity}: {(((pendingBehavior || policy?.behavior)?.verbosity || 0.7) * 100).toFixed(0)}%
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.admin.behavior.verbosityDesc}</p>
                  <Slider
                    value={[((pendingBehavior || policy?.behavior)?.verbosity || 0.7) * 100]}
                    onValueChange={([value]) => {
                      setPendingBehavior({ ...(pendingBehavior || policy?.behavior), verbosity: value / 100 });
                      setHasUnsavedChanges(true);
                    }}
                    className="bg-muted p-2 rounded-xl"
                    data-testid="slider-verbosity"
                  />
                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-border">
                    📊 {t.admin.behavior.verbosityLevels}
                  </p>
                </div>

                {/* 2. Formality */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t.admin.behavior.formality}: {(((pendingBehavior || policy?.behavior)?.formality || 0.5) * 100).toFixed(0)}%
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.admin.behavior.formalityDesc}</p>
                  <Slider
                    value={[((pendingBehavior || policy?.behavior)?.formality || 0.5) * 100]}
                    onValueChange={([value]) => {
                      setPendingBehavior({ ...(pendingBehavior || policy?.behavior), formality: value / 100 });
                      setHasUnsavedChanges(true);
                    }}
                    className="bg-muted p-2 rounded-xl"
                    data-testid="slider-formality"
                  />
                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-border">
                    📊 {t.admin.behavior.formalityLevels}
                  </p>
                </div>

                {/* 3. Creativity */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t.admin.behavior.creativity}: {(((pendingBehavior || policy?.behavior)?.creativity || 0.8) * 100).toFixed(0)}%
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.admin.behavior.creativityDesc}</p>
                  <Slider
                    value={[((pendingBehavior || policy?.behavior)?.creativity || 0.8) * 100]}
                    onValueChange={([value]) => {
                      setPendingBehavior({ ...(pendingBehavior || policy?.behavior), creativity: value / 100 });
                      setHasUnsavedChanges(true);
                    }}
                    className="bg-muted p-2 rounded-xl"
                    data-testid="slider-creativity"
                  />
                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-border">
                    📊 {t.admin.behavior.creativityLevels}
                  </p>
                </div>

                {/* 4. Precision */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t.admin.behavior.precision}: {(((pendingBehavior || policy?.behavior)?.precision || 0.8) * 100).toFixed(0)}%
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.admin.behavior.precisionDesc}</p>
                  <Slider
                    value={[((pendingBehavior || policy?.behavior)?.precision || 0.8) * 100]}
                    onValueChange={([value]) => {
                      setPendingBehavior({ ...(pendingBehavior || policy?.behavior), precision: value / 100 });
                      setHasUnsavedChanges(true);
                    }}
                    className="bg-muted p-2 rounded-xl"
                    data-testid="slider-precision"
                  />
                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-border">
                    📊 {t.admin.behavior.precisionLevels}
                  </p>
                </div>

                {/* 5. Persuasiveness */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t.admin.behavior.persuasiveness}: {(((pendingBehavior || policy?.behavior)?.persuasiveness || 0.5) * 100).toFixed(0)}%
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.admin.behavior.persuasivenessDesc}</p>
                  <Slider
                    value={[((pendingBehavior || policy?.behavior)?.persuasiveness || 0.5) * 100]}
                    onValueChange={([value]) => {
                      setPendingBehavior({ ...(pendingBehavior || policy?.behavior), persuasiveness: value / 100 });
                      setHasUnsavedChanges(true);
                    }}
                    className="bg-muted p-2 rounded-xl"
                    data-testid="slider-persuasiveness"
                  />
                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-border">
                    📊 {t.admin.behavior.persuasivenessLevels}
                  </p>
                </div>

                {/* 6. Empathy */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t.admin.behavior.empathy}: {(((pendingBehavior || policy?.behavior)?.empathy || 0.7) * 100).toFixed(0)}%
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.admin.behavior.empathyDesc}</p>
                  <Slider
                    value={[((pendingBehavior || policy?.behavior)?.empathy || 0.7) * 100]}
                    onValueChange={([value]) => {
                      setPendingBehavior({ ...(pendingBehavior || policy?.behavior), empathy: value / 100 });
                      setHasUnsavedChanges(true);
                    }}
                    className="bg-muted p-2 rounded-xl"
                    data-testid="slider-empathy"
                  />
                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-border">
                    📊 {t.admin.behavior.empathyLevels}
                  </p>
                </div>

                {/* 7. Enthusiasm */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">
                    {t.admin.behavior.enthusiasm}: {(((pendingBehavior || policy?.behavior)?.enthusiasm || 0.6) * 100).toFixed(0)}%
                  </Label>
                  <p className="text-xs text-muted-foreground">{t.admin.behavior.enthusiasmDesc}</p>
                  <Slider
                    value={[((pendingBehavior || policy?.behavior)?.enthusiasm || 0.6) * 100]}
                    onValueChange={([value]) => {
                      setPendingBehavior({ ...(pendingBehavior || policy?.behavior), enthusiasm: value / 100 });
                      setHasUnsavedChanges(true);
                    }}
                    className="bg-muted p-2 rounded-xl"
                    data-testid="slider-enthusiasm"
                  />
                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-border">
                    📊 {t.admin.behavior.enthusiasmLevels}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            {hasUnsavedChanges && (
              <Card className="glass-modern hover-elevate animate-slide-up">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Activity className="w-4 h-4 text-accent animate-pulse" />
                      Você tem alterações não salvas
                    </p>
                    <Button
                      onClick={handleSaveChanges}
                      disabled={updatePolicy.isPending}
                      className="bg-primary hover-elevate active-elevate-2"
                      data-testid="button-save-changes"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updatePolicy.isPending ? t.common.saving : t.common.save}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* System Prompt */}
            <Card className="glass-modern hover-elevate animate-slide-up" style={{ animationDelay: "200ms" }}>
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
                  className="bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 min-h-[200px] max-h-[600px] font-mono text-sm resize-y transition-all duration-200"
                  placeholder={t.admin.behavior.systemPromptPlaceholder}
                  data-testid="textarea-system-prompt"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => updatePolicy.mutate({ systemPrompt: systemPromptValue })}
                    disabled={updatePolicy.isPending}
                    className="bg-primary hover-elevate active-elevate-2"
                    data-testid="button-save-system-prompt"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {updatePolicy.isPending ? t.common.saving : t.common.save}
                  </Button>
                  <Button
                    onClick={() => {
                      refetchPrompt(); // Atualiza preview antes de abrir
                      setShowFullPrompt(true);
                    }}
                    variant="outline"
                    className="hover-elevate active-elevate-2"
                    data-testid="button-view-full-prompt"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    {t.admin.behavior.viewFullPrompt}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Timezone Selector */}
            <Card className="glass-modern hover-elevate animate-slide-up" style={{ animationDelay: "300ms" }}>
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
                      className="bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                      data-testid="select-timezone"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border">
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
                  <p className="text-2xl font-bold text-foreground font-mono" data-testid="text-current-time">
                    {currentTime}
                  </p>
                </div>

                <Button
                  onClick={() => saveTimezoneMutation.mutate(selectedTimezone)}
                  disabled={saveTimezoneMutation.isPending}
                  className="bg-primary hover-elevate active-elevate-2"
                  data-testid="button-save-timezone"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveTimezoneMutation.isPending ? t.admin.settings.timezone.saving : t.admin.settings.timezone.save}
                </Button>
              </CardContent>
            </Card>

            {/* Database Management */}
            <Card className="glass-modern hover-elevate animate-slide-up" style={{ animationDelay: "400ms" }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary" />
                  <span className="gradient-text">{t.admin.settings.databaseManagement.header}</span>
                </CardTitle>
                <CardDescription>
                  {t.admin.settings.databaseManagement.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Backup Actions */}
                <div className="grid grid-cols-1 gap-4">
                  <Button
                    onClick={() => createBackupMutation.mutate()}
                    disabled={createBackupMutation.isPending}
                    className="bg-primary hover-elevate active-elevate-2 w-full"
                    data-testid="button-create-backup"
                  >
                    <Database className="w-4 h-4 mr-2" />
                    {createBackupMutation.isPending ? t.admin.settings.databaseManagement.actions.creating : t.admin.settings.databaseManagement.actions.createBackup}
                  </Button>
                </div>

                {/* Restore Section */}
                <div className="space-y-3 p-4 rounded-xl bg-card/50 border border-border/50">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    {t.admin.settings.databaseManagement.actions.restoreBackup}
                  </Label>
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept=".sql.gz"
                      onChange={(e) => setSelectedBackupFile(e.target.files?.[0] || null)}
                      className="text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer flex-1"
                      data-testid="input-upload-backup"
                    />
                    <Button
                      onClick={() => {
                        if (!selectedBackupFile) {
                          toast({ 
                            title: t.admin.settings.databaseManagement.toasts.uploadError,
                            variant: "destructive" 
                          });
                          return;
                        }
                        setShowRestoreConfirm(true);
                      }}
                      disabled={!selectedBackupFile || restoreBackupMutation.isPending}
                      variant="outline"
                      className="hover-elevate active-elevate-2"
                      data-testid="button-restore-backup"
                    >
                      {restoreBackupMutation.isPending ? t.admin.settings.databaseManagement.actions.restoring : t.admin.settings.databaseManagement.actions.restoreBackup}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="w-3 h-3" />
                    {t.admin.settings.databaseManagement.restore.warningMessage}
                  </p>
                </div>

                {/* Backup History - Placeholder for future tasks */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">{t.admin.settings.databaseManagement.history.title}</h4>
                  <p className="text-sm text-muted-foreground">{t.admin.settings.databaseManagement.history.empty}</p>
                </div>
              </CardContent>
            </Card>
                </div>
              )}
            </div>
          </main>
        </SidebarInset>
      </div>

      {/* Modal: Ver Prompt Completo */}
      <Dialog open={showFullPrompt} onOpenChange={setShowFullPrompt}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              {t.admin.behavior.previewModal.title}
            </DialogTitle>
            <DialogDescription>
              {t.admin.behavior.previewModal.description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <Textarea
              value={fullPromptData?.fullPrompt || t.admin.behavior.previewModal.loading}
              readOnly
              className="bg-muted border-border font-mono text-xs min-h-[500px] w-full resize-none"
              data-testid="textarea-full-prompt-preview"
            />
          </div>
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {fullPromptData?.fullPrompt ? `${fullPromptData.fullPrompt.length} ${t.admin.behavior.previewModal.characters}` : ''}
            </div>
            <Button
              onClick={() => setShowFullPrompt(false)}
              variant="outline"
              data-testid="button-close-full-prompt"
            >
              {t.admin.behavior.previewModal.close}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirmar Restore de Backup */}
      <Dialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              {t.admin.settings.databaseManagement.restore.confirmTitle}
            </DialogTitle>
            <DialogDescription>
              {t.admin.settings.databaseManagement.restore.confirmMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {t.admin.settings.databaseManagement.restore.warningMessage}
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              onClick={() => setShowRestoreConfirm(false)}
              variant="outline"
              disabled={restoreBackupMutation.isPending}
              data-testid="button-cancel-restore"
            >
              {t.admin.settings.databaseManagement.restore.cancel}
            </Button>
            <Button
              onClick={() => {
                if (selectedBackupFile) {
                  restoreBackupMutation.mutate(selectedBackupFile);
                }
              }}
              disabled={restoreBackupMutation.isPending}
              className="bg-destructive hover-elevate active-elevate-2"
              data-testid="button-confirm-restore"
            >
              {restoreBackupMutation.isPending ? t.admin.settings.databaseManagement.actions.restoring : t.admin.settings.databaseManagement.restore.confirm}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
