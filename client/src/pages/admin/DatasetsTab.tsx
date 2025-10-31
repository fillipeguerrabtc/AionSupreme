import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import {
  Database,
  Upload,
  Download,
  Trash2,
  Eye,
  FileText,
  BarChart3,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  FileJson,
  FileSpreadsheet,
  FileCode,
  Sparkles,
  Calendar,
  TrendingUp,
} from "lucide-react";
import type { Dataset } from "@shared/schema";

interface DatasetWithMetrics extends Dataset {
  usageCount?: number;
  lastUsed?: string;
  qualityTier?: "high" | "medium" | "low";
}

export default function DatasetsTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [selectedDatasets, setSelectedDatasets] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size" | "examples">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [previewDataset, setPreviewDataset] = useState<Dataset | null>(null);
  const [deleteDatasetId, setDeleteDatasetId] = useState<number | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  // Fetch all datasets
  const { data: datasetsResponse, isLoading } = useQuery<{
    datasets: DatasetWithMetrics[];
    trainingData: any[];
    stats: {
      compiledDatasets: number;
      totalExamples: number;
      approvedExamples: number;
      totalSize: number;
    };
  }>({
    queryKey: ["/api/training/datasets"],
    queryFn: async () => {
      const res = await apiRequest("/api/training/datasets?tenantId=1");
      return res.json();
    },
  });

  const datasets = datasetsResponse?.datasets || [];
  const trainingData = datasetsResponse?.trainingData || [];
  const apiStats = datasetsResponse?.stats || {
    compiledDatasets: 0,
    totalExamples: 0,
    approvedExamples: 0,
    totalSize: 0,
  };

  // Fetch dataset preview content
  const { data: previewContent, isLoading: isLoadingPreview } = useQuery({
    queryKey: ["/api/training/datasets/preview", previewDataset?.id],
    enabled: !!previewDataset,
    queryFn: async () => {
      const res = await apiRequest(`/api/training/datasets/${previewDataset!.id}/preview`);
      return res.json();
    },
  });

  // Delete dataset mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/training/datasets/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] });
      toast({
        title: "Dataset excluído",
        description: "Dataset removido com sucesso",
      });
      setDeleteDatasetId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir dataset",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest("/api/training/datasets/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] });
      toast({
        title: "Datasets excluídos",
        description: `${selectedDatasets.size} datasets removidos com sucesso`,
      });
      setSelectedDatasets(new Set());
      setShowBulkDelete(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir datasets",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Download dataset
  const downloadDataset = async (dataset: Dataset) => {
    try {
      const res = await apiRequest(`/api/training/datasets/${dataset.id}/download`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = dataset.originalFilename || `dataset-${dataset.id}.jsonl`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Download iniciado",
        description: "Seu dataset está sendo baixado",
      });
    } catch (error) {
      toast({
        title: "Erro ao baixar dataset",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  // Filter and sort datasets
  const filteredDatasets = datasets
    ?.filter((d) => {
      const matchesSearch = d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === "all" || d.datasetType === filterType;
      const matchesStatus = filterStatus === "all" || d.status === filterStatus;
      return matchesSearch && matchesType && matchesStatus;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "date":
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "size":
          comparison = a.fileSize - b.fileSize;
          break;
        case "examples":
          comparison = a.totalExamples - b.totalExamples;
          break;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    }) || [];

  // Calculate statistics
  const stats = {
    total: datasets?.length || 0,
    ready: datasets?.filter((d) => d.status === "ready").length || 0,
    processing: datasets?.filter((d) => d.status === "processing").length || 0,
    failed: datasets?.filter((d) => d.status === "failed").length || 0,
    totalSize: datasets?.reduce((acc, d) => acc + d.fileSize, 0) || 0,
    totalExamples: datasets?.reduce((acc, d) => acc + d.totalExamples, 0) || 0,
    autoGenerated: datasets?.filter((d) => d.datasetType === "kb-auto" || d.datasetType === "kb-high-quality").length || 0,
    uploaded: datasets?.filter((d) => !["kb-auto", "kb-high-quality"].includes(d.datasetType)).length || 0,
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      ready: { icon: CheckCircle2, variant: "default" as const, label: "Pronto" },
      processing: { icon: RefreshCw, variant: "secondary" as const, label: "Processando" },
      failed: { icon: XCircle, variant: "destructive" as const, label: "Erro" },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.ready;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  // Get type icon
  const getTypeIcon = (type: string) => {
    const icons = {
      instruction: FileText,
      chat: FileJson,
      qa: FileSpreadsheet,
      text: FileCode,
      "kb-auto": Sparkles,
      "kb-high-quality": Sparkles,
      custom: Database,
    };
    return icons[type as keyof typeof icons] || Database;
  };

  // Get quality tier
  const getQualityTier = (dataset: Dataset): "high" | "medium" | "low" => {
    if (dataset.datasetType === "kb-high-quality") return "high";
    if (dataset.datasetType === "kb-auto") return "medium";
    const avgLength = dataset.averageLength || 0;
    if (avgLength > 1000) return "high";
    if (avgLength > 500) return "medium";
    return "low";
  };

  const getQualityBadge = (tier: "high" | "medium" | "low") => {
    const config = {
      high: { color: "text-green-500", label: "Alta Qualidade" },
      medium: { color: "text-yellow-500", label: "Média Qualidade" },
      low: { color: "text-gray-500", label: "Baixa Qualidade" },
    };
    return (
      <span className={`text-xs font-medium ${config[tier].color}`}>
        {config[tier].label}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold gradient-text">Datasets</h2>
        <p className="text-muted-foreground">Gerenciamento avançado de datasets de treinamento</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Datasets</p>
                <p className="text-3xl font-bold gradient-text" data-testid="stat-total-datasets">{apiStats.compiledDatasets}</p>
              </div>
              <Database className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Exemplos</p>
                <p className="text-3xl font-bold gradient-text" data-testid="stat-total-examples">{apiStats.totalExamples.toLocaleString()}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tamanho Total</p>
                <p className="text-3xl font-bold gradient-text" data-testid="stat-total-size">{formatFileSize(apiStats.totalSize)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Auto-Gerados (KB)</p>
                <p className="text-3xl font-bold gradient-text" data-testid="stat-kb-generated">{apiStats.approvedExamples}</p>
              </div>
              <Sparkles className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Actions */}
      <Card className="glass-premium border-primary/20">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-[240px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar datasets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 glass border-primary/30"
                  data-testid="input-search-datasets"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px] glass border-primary/30" data-testid="select-filter-type">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="instruction">Instruction</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="qa">Q&A</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="kb-auto">KB Auto</SelectItem>
                  <SelectItem value="kb-high-quality">KB High Quality</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] glass border-primary/30" data-testid="select-filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="ready">Pronto</SelectItem>
                  <SelectItem value="processing">Processando</SelectItem>
                  <SelectItem value="failed">Erro</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[140px] glass border-primary/30" data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="size">Tamanho</SelectItem>
                  <SelectItem value="examples">Exemplos</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="glass border-primary/30"
                data-testid="button-sort-order"
              >
                {sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] })}
                className="glass border-primary/30"
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>

              {selectedDatasets.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setShowBulkDelete(true)}
                  className="gap-2"
                  data-testid="button-bulk-delete"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir ({selectedDatasets.size})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Datasets List */}
      <Card className="glass-premium border-primary/20">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filteredDatasets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Database className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Nenhum dataset encontrado</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterType !== "all" || filterStatus !== "all"
                  ? "Tente ajustar os filtros"
                  : "Faça upload de um dataset para começar"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="divide-y divide-border/50">
                {filteredDatasets.map((dataset) => {
                  const TypeIcon = getTypeIcon(dataset.datasetType);
                  const qualityTier = getQualityTier(dataset);
                  const isSelected = selectedDatasets.has(dataset.id);

                  return (
                    <div
                      key={dataset.id}
                      className="p-4 hover-elevate transition-all duration-200"
                      data-testid={`dataset-row-${dataset.id}`}
                    >
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedDatasets);
                            if (checked) {
                              newSet.add(dataset.id);
                            } else {
                              newSet.delete(dataset.id);
                            }
                            setSelectedDatasets(newSet);
                          }}
                          data-testid={`checkbox-dataset-${dataset.id}`}
                        />

                        <div className="flex-1 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <TypeIcon className="w-4 h-4 text-primary" />
                                <h3 className="font-semibold text-lg" data-testid={`text-dataset-name-${dataset.id}`}>
                                  {dataset.name}
                                </h3>
                                {getStatusBadge(dataset.status)}
                              </div>
                              
                              {dataset.description && (
                                <p className="text-sm text-muted-foreground mb-2">
                                  {dataset.description}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <FileText className="w-4 h-4" />
                                  {dataset.totalExamples.toLocaleString()} exemplos
                                </span>
                                <span className="flex items-center gap-1">
                                  <Database className="w-4 h-4" />
                                  {formatFileSize(dataset.fileSize)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-4 h-4" />
                                  {new Date(dataset.createdAt).toLocaleDateString("pt-BR")}
                                </span>
                                {dataset.averageLength && (
                                  <span className="flex items-center gap-1">
                                    <BarChart3 className="w-4 h-4" />
                                    Avg: {dataset.averageLength} chars
                                  </span>
                                )}
                                {getQualityBadge(qualityTier)}
                              </div>

                              {dataset.validationErrors && dataset.validationErrors.length > 0 && (
                                <div className="mt-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
                                  <div className="flex items-center gap-2 text-sm text-destructive">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>Erros de validação: {dataset.validationErrors.join(", ")}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setPreviewDataset(dataset)}
                                className="glass border-primary/30"
                                data-testid={`button-preview-${dataset.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => downloadDataset(dataset)}
                                className="glass border-primary/30"
                                data-testid={`button-download-${dataset.id}`}
                              >
                                <Download className="w-4 h-4" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setDeleteDatasetId(dataset.id)}
                                className="glass border-destructive/30 text-destructive hover:bg-destructive/10"
                                data-testid={`button-delete-${dataset.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {dataset.schema && (
                            <div className="text-xs text-muted-foreground font-mono bg-card/50 p-2 rounded-md">
                              Schema: {dataset.schema.format} | 
                              Colunas: {dataset.schema.columns?.join(", ")} |
                              Input: {dataset.schema.inputField || "N/A"} |
                              Output: {dataset.schema.outputField || "N/A"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Preview Dialog */}
      <Dialog open={!!previewDataset} onOpenChange={() => setPreviewDataset(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] glass-premium">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Preview: {previewDataset?.name}
            </DialogTitle>
            <DialogDescription>
              Visualização das primeiras linhas do dataset
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[500px] w-full rounded-md border border-border/50 p-4">
            {isLoadingPreview ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(previewContent, null, 2)}
              </pre>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDataset(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Training Data Section (JSONL Format) */}
      <Card className="glass-premium border-accent/20">
        <CardHeader>
          <CardTitle className="gradient-text-vibrant flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Dados de Treinamento (JSONL Instruction-Tuning)
          </CardTitle>
          <CardDescription>
            Formato convertido automaticamente para treinar modelos LoRA nas GPUs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {trainingData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum dado de treinamento aprovado ainda. Aprove conteúdos na Curadoria!
              </p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {trainingData.slice(0, 10).map((data: any, idx: number) => (
                  <AccordionItem key={data.id} value={`item-${idx}`}>
                    <AccordionTrigger className="text-sm hover-elevate px-3 rounded-md">
                      <div className="flex items-center gap-2 flex-1">
                        <Badge variant="outline" className="text-xs">
                          #{data.id}
                        </Badge>
                        <span className="truncate flex-1 text-left">
                          {data.formattedData?.[0]?.instruction || "Sem título"}
                        </span>
                        <Badge variant="secondary" className="text-xs">
                          {data.metadata?.namespaces?.[0] || "geral"}
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pt-2">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            Instruction:
                          </p>
                          <p className="text-sm bg-card/50 p-2 rounded-md border border-border/50">
                            {data.formattedData?.[0]?.instruction}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            Output (primeiros 200 caracteres):
                          </p>
                          <p className="text-sm bg-card/50 p-2 rounded-md border border-border/50 line-clamp-3">
                            {data.formattedData?.[0]?.output?.substring(0, 200)}...
                          </p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {data.metadata?.namespaces?.map((ns: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {ns}
                            </Badge>
                          ))}
                        </div>
                        <pre className="text-xs font-mono bg-card/80 p-3 rounded-md border border-primary/20 overflow-x-auto">
                          {JSON.stringify(data.formattedData?.[0], null, 2)}
                        </pre>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDatasetId} onOpenChange={() => setDeleteDatasetId(null)}>
        <AlertDialogContent className="glass-premium">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este dataset? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDatasetId && deleteMutation.mutate(deleteDatasetId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent className="glass-premium">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão em massa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedDatasets.size} datasets? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedDatasets))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete"
            >
              Excluir Todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
