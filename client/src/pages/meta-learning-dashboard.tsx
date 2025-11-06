import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Zap, GitBranch, PlayCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { useLanguage } from "@/lib/i18n";

type LearningAlgorithm = {
  id: string;
  name: string;
  type: string;
  hyperparameters: Record<string, number>;
  performanceScore: number;
  isDefault: boolean;
  createdAt: string;
};

type MoEExpert = {
  id: string;
  domain: string;
  isActive: boolean;
  accuracy: number;
  loss: number;
  samplesProcessed: number;
  createdAt: string;
};

type SelfImprovement = {
  id: string;
  targetPath: string;
  category: string;
  severity: string;
  description: string;
  status: string;
  requiresHumanReview: boolean;
  createdAt: string;
};

type PipelineExecution = {
  stage: string;
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
};

export default function MetaLearningDashboard() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("algorithms");

  const { data: algorithms, isLoading: algorithmsLoading } = useQuery<LearningAlgorithm[]>({
    queryKey: ["/api/meta/algorithms"],
  });

  const { data: experts, isLoading: expertsLoading } = useQuery<MoEExpert[]>({
    queryKey: ["/api/moe/experts"],
  });

  const { data: improvements, isLoading: improvementsLoading } = useQuery<SelfImprovement[]>({
    queryKey: ["/api/autonomous/improvements"],
  });

  const executePipelineMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/meta/pipeline/execute", {
        method: "POST",
      });
      return response.json();
    },
    onSuccess: (data: PipelineExecution[]) => {
      const successCount = data.filter((r: PipelineExecution) => r.success).length;
      toast({
        title: t("meta.pipeline.executed"),
        description: t("meta.pipeline.stages_completed", { success: successCount, total: data.length }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/algorithms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moe/experts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/autonomous/improvements"] });
    },
    onError: () => {
      toast({
        title: t("common.error"),
        description: t("meta.pipeline.execution_failed"),
        variant: "destructive",
      });
    },
  });

  const setDefaultAlgorithmMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/meta/algorithms/${id}/set-default`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: t("common.success"),
        description: t("meta.algorithm.default_updated"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/algorithms"] });
    },
  });

  const spawnExpertMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/moe/spawn-expert", {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: t("meta.expert.created"),
        description: t("meta.expert.spawned_success"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/moe/experts"] });
    },
  });

  const validateImprovementMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/autonomous/improvements/${id}/validate`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: t("meta.improvement.validated"),
        description: t("meta.improvement.validation_success"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/autonomous/improvements"] });
    },
  });

  const applyImprovementMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/autonomous/improvements/${id}/apply`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: t("meta.improvement.applied"),
        description: t("meta.improvement.code_updated"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/autonomous/improvements"] });
    },
  });

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-meta-learning-title">{t("meta.dashboard.title")}</h1>
            <p className="text-muted-foreground">{t("meta.dashboard.subtitle")}</p>
          </div>
          <Button
            onClick={() => executePipelineMutation.mutate()}
            disabled={executePipelineMutation.isPending}
            data-testid="button-execute-pipeline"
          >
            <PlayCircle className="w-4 h-4 mr-2" />
            {executePipelineMutation.isPending ? t("meta.pipeline.executing") : t("meta.pipeline.execute")}
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="algorithms" data-testid="tab-algorithms">
              <Brain className="w-4 h-4 mr-2" />
              {t("meta.tabs.algorithms")} ({algorithms?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="experts" data-testid="tab-experts">
              <Zap className="w-4 h-4 mr-2" />
              t("meta.tabs.experts") + " ({experts?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="improvements" data-testid="tab-improvements">
              <GitBranch className="w-4 h-4 mr-2" />
              t("meta.tabs.improvements") + " ({improvements?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="algorithms" className="space-y-4">
            {algorithmsLoading ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">t("meta.loading.algorithms")</p>
                </CardContent>
              </Card>
            ) : algorithms && algorithms.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {algorithms.map((algo) => (
                  <Card key={algo.id} data-testid={`card-algorithm-${algo.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-algorithm-name-${algo.id}`}>
                            {algo.name}
                          </CardTitle>
                          <CardDescription>{algo.type}</CardDescription>
                        </div>
                        {algo.isDefault && (
                          <Badge variant="default" data-testid={`badge-default-${algo.id}`}>t("meta.algorithm.default")</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">t("meta.algorithm.performance")</span>
                        <Badge variant="outline" data-testid={`badge-performance-${algo.id}`}>
                          {(algo.performanceScore * 100).toFixed(1)}%
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Criado {formatDistanceToNow(new Date(algo.createdAt), { addSuffix: true })}
                      </div>
                      {!algo.isDefault && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => setDefaultAlgorithmMutation.mutate(algo.id)}
                          disabled={setDefaultAlgorithmMutation.isPending}
                          data-testid={`button-set-default-${algo.id}`}
                        >
                          t("meta.algorithm.set_as_default")
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">t("meta.empty.algorithms")</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="experts" className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => spawnExpertMutation.mutate()}
                disabled={spawnExpertMutation.isPending}
                data-testid="button-spawn-expert"
              >
                <Zap className="w-4 h-4 mr-2" />
                {spawnExpertMutation.isPending ? "Criando..." : "Criar Expert"}
              </Button>
            </div>

            {expertsLoading ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">t("meta.loading.experts")</p>
                </CardContent>
              </Card>
            ) : experts && experts.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {experts.map((expert) => (
                  <Card key={expert.id} data-testid={`card-expert-${expert.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg" data-testid={`text-expert-domain-${expert.id}`}>
                          {expert.domain}
                        </CardTitle>
                        <Badge variant={expert.isActive ? "default" : "secondary"} data-testid={`badge-expert-status-${expert.id}`}>
                          {expert.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Acurácia</span>
                          <p className="font-medium" data-testid={`text-expert-accuracy-${expert.id}`}>
                            {(expert.accuracy * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Loss</span>
                          <p className="font-medium" data-testid={`text-expert-loss-${expert.id}`}>
                            {expert.loss.toFixed(3)}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {expert.samplesProcessed.toLocaleString()} amostras processadas
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">t("meta.empty.experts")</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="improvements" className="space-y-4">
            {improvementsLoading ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">t("meta.loading.improvements")</p>
                </CardContent>
              </Card>
            ) : improvements && improvements.length > 0 ? (
              <div className="space-y-3">
                {improvements.map((improvement) => (
                  <Card key={improvement.id} data-testid={`card-improvement-${improvement.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base truncate" data-testid={`text-improvement-path-${improvement.id}`}>
                            {improvement.targetPath}
                          </CardTitle>
                          <CardDescription className="line-clamp-2">{improvement.description}</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" data-testid={`badge-improvement-category-${improvement.id}`}>
                            {improvement.category}
                          </Badge>
                          <Badge
                            variant={
                              improvement.severity === "critical"
                                ? "destructive"
                                : improvement.severity === "high"
                                ? "default"
                                : "secondary"
                            }
                            data-testid={`badge-improvement-severity-${improvement.id}`}
                          >
                            {improvement.severity}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {improvement.status === "applied" && (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          )}
                          {improvement.requiresHumanReview && (
                            <AlertTriangle className="w-4 h-4 text-yellow-600" />
                          )}
                          <span className="text-sm" data-testid={`text-improvement-status-${improvement.id}`}>
                            Status: {improvement.status}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {improvement.status === "proposed" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => validateImprovementMutation.mutate(improvement.id)}
                              disabled={validateImprovementMutation.isPending}
                              data-testid={`button-validate-${improvement.id}`}
                            >
                              Validar
                            </Button>
                          )}
                          {improvement.status === "validated" && (
                            <Button
                              size="sm"
                              onClick={() => applyImprovementMutation.mutate(improvement.id)}
                              disabled={applyImprovementMutation.isPending}
                              data-testid={`button-apply-${improvement.id}`}
                            >
                              Aplicar
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">Nenhuma melhoria proposta</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
