import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { Settings, Save, CheckCircle2, XCircle, Plus, X, Play, AlertTriangle } from "lucide-react";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AutoApprovalConfig {
  id: number;
  enabled: boolean;
  minApprovalScore: number;
  maxRejectScore: number;
  sensitiveFlags: string[];
  enabledNamespaces: string[];
  autoRejectEnabled: boolean;
  requireAllQualityGates: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DecisionPreview {
  decision: {
    action: "approve" | "reject" | "review";
    reason: string;
    configUsed: {
      enabled: boolean;
      minApprovalScore: number;
      maxRejectScore: number;
      sensitiveFlags: string[];
      enabledNamespaces: string[];
    };
  };
  testInputs: {
    score: number;
    contentFlags: string[];
    namespaces: string[];
  };
}

export default function AutoApprovalPage() {
  useScrollToTop();
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{
    success: boolean;
    data: { config: AutoApprovalConfig; message: string };
  }>({
    queryKey: ["/api/admin/auto-approval"],
  });

  const config = data?.data.config;

  // Local state for form
  const [enabled, setEnabled] = useState(false);
  const [minApprovalScore, setMinApprovalScore] = useState(80);
  const [maxRejectScore, setMaxRejectScore] = useState(50);
  const [autoRejectEnabled, setAutoRejectEnabled] = useState(true);
  const [requireAllQualityGates, setRequireAllQualityGates] = useState(false);
  const [sensitiveFlags, setSensitiveFlags] = useState<string[]>([]);
  const [enabledNamespaces, setEnabledNamespaces] = useState<string[]>([]);

  // New flag/namespace inputs
  const [newFlag, setNewFlag] = useState("");
  const [newNamespace, setNewNamespace] = useState("");

  // Decision preview testing
  const [testScore, setTestScore] = useState(75);
  const [testFlags, setTestFlags] = useState("");
  const [testNamespaces, setTestNamespaces] = useState("*");
  const [previewResult, setPreviewResult] = useState<DecisionPreview | null>(null);

  // Sync local state with fetched config
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setMinApprovalScore(config.minApprovalScore);
      setMaxRejectScore(config.maxRejectScore);
      setAutoRejectEnabled(config.autoRejectEnabled);
      setRequireAllQualityGates(config.requireAllQualityGates);
      setSensitiveFlags(config.sensitiveFlags);
      setEnabledNamespaces(config.enabledNamespaces);
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<AutoApprovalConfig>) => {
      const res = await apiRequest("/api/admin/auto-approval", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/auto-approval"] });
      
      // Refresh cache
      apiRequest("/api/admin/auto-approval/refresh-cache", {
        method: "POST",
      }).catch(() => {});
      
      toast({ title: t.admin.autoApproval.configUpdated });
    },
    onError: (error: any) => {
      toast({
        title: t.admin.autoApproval.configError,
        description: error.message || "Erro desconhecido",
        variant: "destructive",
      });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (params: { score: number; contentFlags: string; namespaces: string }) => {
      const url = `/api/admin/auto-approval/decision-preview?score=${params.score}&contentFlags=${params.contentFlags}&namespaces=${params.namespaces}`;
      const res = await apiRequest(url);
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewResult(data.data);
    },
    onError: (error: any) => {
      toast({
        title: t.admin.autoApproval.configError,
        description: error.message || "Falha ao visualizar decisão",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (maxRejectScore >= minApprovalScore) {
      toast({
        title: t.admin.autoApproval.thresholdWarning,
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      enabled,
      minApprovalScore,
      maxRejectScore,
      autoRejectEnabled,
      requireAllQualityGates,
      sensitiveFlags,
      enabledNamespaces,
    });
  };

  const handleAddFlag = () => {
    if (newFlag && !sensitiveFlags.includes(newFlag.toLowerCase())) {
      setSensitiveFlags([...sensitiveFlags, newFlag.toLowerCase()]);
      setNewFlag("");
    }
  };

  const handleRemoveFlag = (flag: string) => {
    setSensitiveFlags(sensitiveFlags.filter(f => f !== flag));
  };

  const handleAddNamespace = () => {
    if (newNamespace && !enabledNamespaces.includes(newNamespace)) {
      setEnabledNamespaces([...enabledNamespaces, newNamespace]);
      setNewNamespace("");
    }
  };

  const handleRemoveNamespace = (ns: string) => {
    setEnabledNamespaces(enabledNamespaces.filter(n => n !== ns));
  };

  const handleRunTest = () => {
    previewMutation.mutate({
      score: testScore,
      contentFlags: testFlags,
      namespaces: testNamespaces,
    });
  };

  const getDecisionBadgeVariant = (action: string) => {
    if (action === "approve") return "default";
    if (action === "reject") return "destructive";
    return "secondary";
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6" data-testid="page-auto-approval">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="title-auto-approval">
            <Settings className="h-8 w-8" />
            {t.admin.autoApproval.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t.admin.autoApproval.subtitle}
          </p>
        </div>
        <Badge variant={enabled ? "default" : "secondary"} data-testid="status-auto-approval">
          {enabled ? t.admin.autoApproval.enabled : t.admin.autoApproval.disabled}
        </Badge>
      </div>

      {maxRejectScore >= minApprovalScore && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t.admin.autoApproval.thresholdWarning}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        {/* Global Settings */}
        <Card data-testid="card-global-settings">
          <CardHeader>
            <CardTitle>{t.admin.autoApproval.globalSettings}</CardTitle>
            <CardDescription>
              {t.admin.autoApproval.tooltips.enabled}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-2">
              <Label htmlFor="enabled" className="text-base">
                {t.admin.autoApproval.enableAutoApproval}
              </Label>
              <Switch
                id="enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
                data-testid="switch-enabled"
              />
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Label htmlFor="auto-reject" className="text-base">
                {t.admin.autoApproval.enableAutoReject}
              </Label>
              <Switch
                id="auto-reject"
                checked={autoRejectEnabled}
                onCheckedChange={setAutoRejectEnabled}
                data-testid="switch-auto-reject"
              />
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <Label htmlFor="quality-gates" className="text-base">
                {t.admin.autoApproval.requireAllQualityGates}
              </Label>
              <Switch
                id="quality-gates"
                checked={requireAllQualityGates}
                onCheckedChange={setRequireAllQualityGates}
                data-testid="switch-quality-gates"
              />
            </div>
          </CardContent>
        </Card>

        {/* Score Thresholds */}
        <Card data-testid="card-thresholds">
          <CardHeader>
            <CardTitle>{t.admin.autoApproval.scoreThresholds}</CardTitle>
            <CardDescription>
              {t.admin.autoApproval.scoreRange} (0-100)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="min-approval" className="text-sm">
                  {t.admin.autoApproval.minApprovalScore}
                </Label>
                <Badge variant="outline" data-testid="badge-min-approval">
                  {minApprovalScore}
                </Badge>
              </div>
              <Slider
                id="min-approval"
                min={0}
                max={100}
                step={1}
                value={[minApprovalScore]}
                onValueChange={([value]) => setMinApprovalScore(value)}
                data-testid="test-id"
              />
              <p className="text-xs text-muted-foreground">
                {t.admin.autoApproval.tooltips.minApprovalScore}
              </p>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="max-reject" className="text-sm">
                  {t.admin.autoApproval.maxRejectScore}
                </Label>
                <Badge variant="outline" data-testid="badge-max-reject">
                  {maxRejectScore}
                </Badge>
              </div>
              <Slider
                id="max-reject"
                min={0}
                max={100}
                step={1}
                value={[maxRejectScore]}
                onValueChange={([value]) => setMaxRejectScore(value)}
                data-testid="test-id"
              />
              <p className="text-xs text-muted-foreground">
                {t.admin.autoApproval.tooltips.maxRejectScore}
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {t.admin.autoApproval.reviewRange}
              </Label>
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="flex items-center gap-2">
                  <XCircle className="w-3 h-3" />
                  {"<"} {maxRejectScore}
                </Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant="secondary" className="flex items-center gap-2">
                  {maxRejectScore} - {minApprovalScore}
                </Badge>
                <span className="text-muted-foreground">→</span>
                <Badge variant="default" className="flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" />
                  {">="} {minApprovalScore}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Filtering (Editable) */}
      <Card data-testid="card-content-filtering">
        <CardHeader>
          <CardTitle>{t.admin.autoApproval.contentFiltering}</CardTitle>
          <CardDescription>
            {t.admin.autoApproval.flagsDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {sensitiveFlags.map((flag) => (
              <Badge key={flag} variant="secondary" className="flex items-center gap-2" data-testid={`badge-flag-${flag}`}>
                {flag}
                <button
                  onClick={() => handleRemoveFlag(flag)}
                  className="flex items-center gap-2"
                  data-testid={`button-remove-flag-${flag}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="adult, violence, medical..."
              value={newFlag}
              onChange={(e) => setNewFlag(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddFlag()}
              data-testid="input-new-flag"
            />
            <Button onClick={handleAddFlag} size="sm" data-testid="button-add-flag">
              <Plus className="w-4 h-4 mr-1" />
              {t.admin.autoApproval.addNamespace}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t.admin.autoApproval.tooltips.sensitiveFlags}
          </p>
        </CardContent>
      </Card>

      {/* Namespace Control (Editable) */}
      <Card data-testid="card-namespace-control">
        <CardHeader>
          <CardTitle>{t.admin.autoApproval.namespaceControl}</CardTitle>
          <CardDescription>
            {t.admin.autoApproval.namespaceWildcardDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {enabledNamespaces.map((ns) => (
              <Badge key={ns} variant="outline" className="flex items-center gap-2" data-testid={`badge-namespace-${ns}`}>
                {ns}
                {ns !== "*" && (
                  <button
                    onClick={() => handleRemoveNamespace(ns)}
                    className="flex items-center gap-2"
                    data-testid={`button-remove-namespace-${ns}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="tech, science, general..."
              value={newNamespace}
              onChange={(e) => setNewNamespace(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddNamespace()}
              data-testid="input-new-namespace"
            />
            <Button onClick={handleAddNamespace} size="sm" data-testid="button-add-namespace">
              <Plus className="w-4 h-4 mr-1" />
              {t.admin.autoApproval.addNamespace}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {t.admin.autoApproval.tooltips.enabledNamespaces}
          </p>
        </CardContent>
      </Card>

      {/* Decision Preview Tester */}
      <Card data-testid="card-element">
        <CardHeader>
          <CardTitle>{t.admin.autoApproval.testDecision}</CardTitle>
          <CardDescription>
            Test how auto-approval logic would handle specific content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="test-score">{t.admin.autoApproval.testScore}</Label>
              <Input
                id="test-score"
                type="number"
                min="0"
                max="100"
                value={testScore}
                onChange={(e) => setTestScore(parseInt(e.target.value) || 0)}
                data-testid="input-test-score"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-flags">{t.admin.autoApproval.testFlags}</Label>
              <Input
                id="test-flags"
                placeholder="adult,violence"
                value={testFlags}
                onChange={(e) => setTestFlags(e.target.value)}
                data-testid="input-test-flags"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-namespaces">{t.admin.autoApproval.testNamespaces}</Label>
              <Input
                id="test-namespaces"
                placeholder="*"
                value={testNamespaces}
                onChange={(e) => setTestNamespaces(e.target.value)}
                data-testid="input-test-namespaces"
              />
            </div>
          </div>

          <Button onClick={handleRunTest} disabled={previewMutation.isPending} data-testid="button-run-test">
            <Play className="w-4 h-4 mr-2" />
            {t.admin.autoApproval.runTest}
          </Button>

          {previewResult && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t.admin.autoApproval.decisionResult}:</span>
                <Badge variant={getDecisionBadgeVariant(previewResult.decision.action)} data-testid="test-id">
                  {previewResult.decision.action.toUpperCase()}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{previewResult.decision.reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending || maxRejectScore >= minApprovalScore}
          size="lg"
          data-testid="button-save"
        >
          {updateMutation.isPending ? (
            <>
              <span className="mr-2">{t.common.saving}</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              {t.admin.autoApproval.saveChanges}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
