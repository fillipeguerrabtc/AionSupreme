import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { apiRequest, queryClient, ValidationError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import {
  Database,
  Upload,
  Download,
  Trash2,
  Edit,
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
  Clock,
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
  const [editDataset, setEditDataset] = useState<Dataset | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteDatasetId, setDeleteDatasetId] = useState<number | null>(null);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  
  // Training Data Edit/Delete states
  const [editTrainingData, setEditTrainingData] = useState<any | null>(null);
  const [editTrainingInstruction, setEditTrainingInstruction] = useState("");
  const [editTrainingOutput, setEditTrainingOutput] = useState("");
  const [deleteTrainingDataId, setDeleteTrainingDataId] = useState<number | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

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
      const res = await apiRequest("/api/training/datasets");
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

  // Update dataset mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; description?: string } }) => {
      const res = await apiRequest(`/api/training/datasets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] });
      toast({
        title: "Sucesso",
        description: "Operação concluída com sucesso",
      });
      setEditDataset(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
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
        title: "Sucesso",
        description: "Operação concluída com sucesso",
      });
      setDeleteDatasetId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
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
        title: "Sucesso",
        description: `${selectedDatasets.size} datasets removidos com sucesso`,
      });
      setSelectedDatasets(new Set());
      setShowBulkDelete(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Training Data Edit mutation
  const updateTrainingDataMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { instruction?: string; output?: string } }) => {
      const formattedData = [{
        instruction: data.instruction || editTrainingData?.formattedData?.[0]?.instruction || "",
        output: data.output || editTrainingData?.formattedData?.[0]?.output || ""
      }];
      
      const res = await apiRequest(`/api/training-data/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formattedData }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] });
      
      // Build toast message with validation results
      let description = "Dados de treinamento atualizados com sucesso!";
      
      if (data.validation?.corrections?.length > 0) {
        description += `\n\n✅ Correções automáticas:\n${data.validation.corrections.join("\n")}`;
      }
      
      if (data.validation?.warnings?.length > 0) {
        description += `\n\n⚠️ Avisos:\n${data.validation.warnings.join("\n")}`;
      }
      
      toast({
        title: "Sucesso",
        description,
      });
      setEditTrainingData(null);
      setEditTrainingInstruction("");
      setEditTrainingOutput("");
    },
    onError: (error: any) => {
      // Check if error has validation details
      const errorMessage = error.message || "Erro desconhecido";
      let description = errorMessage;
      
      if (error.details && Array.isArray(error.details)) {
        description += `\n\nProblemas encontrados:\n${error.details.join("\n")}`;
      }
      
      if (error.warnings && Array.isArray(error.warnings)) {
        description += `\n\n⚠️ Avisos:\n${error.warnings.join("\n")}`;
      }
      
      toast({
        title: "Sucesso",
        description,
        variant: "destructive",
      });
    },
  });

  // Training Data Delete mutation
  const deleteTrainingDataMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/training-data/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] });
      toast({
        title: "Sucesso",
        description: "Operação concluída com sucesso",
      });
      setDeleteTrainingDataId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Inline validation for Training Data edit
  useEffect(() => {
    if (!editTrainingData) {
      setValidationWarnings([]);
      return;
    }

    const warnings: string[] = [];
    const instruction = editTrainingInstruction.trim();
    const output = editTrainingOutput.trim();

    if (instruction.length > 0 && instruction.length < 5) {
      warnings.push(`Instruction muito curta (${instruction.length} chars, recomendado: 5+)`);
    }

    if (output.length > 0 && output.length < 10) {
      warnings.push(`Output muito curto (${output.length} chars, recomendado: 10+)`);
    }

    if (instruction === output && instruction.length > 0) {
      warnings.push("Output não pode ser idêntico à Instruction");
    }

    const hasQuestionMark = instruction.includes("?");
    const questionWords = ["what", "why", "how", "when", "where", "who", "which", "is", "are", "can", "should"];
    const startsWithQuestion = questionWords.some((word) =>
      instruction.toLowerCase().startsWith(word + " ")
    );

    if (!hasQuestionMark && !startsWithQuestion && instruction.length > 0 && instruction.length < 100) {
      warnings.push("Instruction não parece ser uma pergunta ou comando");
    }

    setValidationWarnings(warnings);
  }, [editTrainingInstruction, editTrainingOutput, editTrainingData]);

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
        description: "Operação concluída com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao processar operação",
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
      ready: { icon: CheckCircle2, variant: "default" as const, label: t.common.status.ready },
      processing: { icon: RefreshCw, variant: "secondary" as const, label: t.common.status.processing },
      failed: { icon: XCircle, variant: "destructive" as const, label: t.common.status.failed },
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
      high: { color: "text-green-500", label: "Alta" },
      medium: { color: "text-yellow-500", label: "Média" },
      low: { color: "text-gray-500", label: "Baixa" },
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
        <h2 className="text-3xl font-bold gradient-text">{t.admin.datasets.title}</h2>
        <p className="text-muted-foreground">{t.admin.datasets.subtitle}</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm text-muted-foreground">"Total de Datasets"</p>
                <p className="text-3xl font-bold gradient-text" data-testid="stat-total-datasets">{apiStats.compiledDatasets}</p>
              </div>
              <Database className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="flex items-center gap-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm text-muted-foreground">{t.common.loading}</p>
                <p className="text-3xl font-bold gradient-text" data-testid="stat-total-examples">{apiStats.totalExamples.toLocaleString()}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="flex items-center gap-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Tamanho Total</p>
                <p className="text-3xl font-bold gradient-text" data-testid="stat-total-size">{formatFileSize(apiStats.totalSize)}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className="flex items-center gap-2">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-sm text-muted-foreground">Auto-Gerados (KB)</p>
                <p className="text-3xl font-bold gradient-text" data-testid="stat-kb-generated">{apiStats.approvedExamples}</p>
              </div>
              <Sparkles className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Training Data Section (JSONL Format) */}
      <Card className="flex items-center gap-2">
        <CardHeader>
          <CardTitle className="flex">
            <Sparkles className="w-5 h-5" />{t.common.loading}</CardTitle>
          <CardDescription>{t.common.loading}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {trainingData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.common.loading}</p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {trainingData.slice(0, 10).map((data: any, idx: number) => (
                  <AccordionItem key={data.id} value={`item-${idx}`}>
                    <div className="flex items-center gap-2">
                      <AccordionTrigger className="text-sm hover-elevate px-3 rounded-md flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs shrink-0">
                            #{data.id}
                          </Badge>
                          <span className="truncate flex-1 text-left">
                            {data.formattedData?.[0]?.instruction || "Sem título"}
                          </span>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {data.metadata?.namespaces?.[0] || "geral"}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="flex items-center gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTrainingData(data);
                            setEditTrainingInstruction(data.formattedData?.[0]?.instruction || "");
                            setEditTrainingOutput(data.formattedData?.[0]?.output || "");
                          }}
                          data-testid={`button-edit-training-${data.id}`}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        
                        <Button
                          variant="outline"
                          size="icon"
                          className="bg-destructive/10 border border-destructive/20 rounded-md p-4"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTrainingDataId(data.id);
                          }}
                          data-testid={`button-delete-training-${data.id}`}
                        >
                          <Trash2 className="flex items-center gap-2" />
                        </Button>
                      </div>
                    </div>
                    <AccordionContent className="flex items-center gap-2">
                      <div className="space-y-3 pt-2">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            Instruction:
                          </p>
                          <p className="text-sm bg-card/50 p-2 rounded-md border border-border/50 break-words">
                            {data.formattedData?.[0]?.instruction}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">
                            Output (primeiros 200 caracteres):
                          </p>
                          <p className="text-sm bg-card/50 p-2 rounded-md border border-border/50 line-clamp-3 break-words">
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
                        <div className="max-w-full overflow-x-auto">
                          <pre className="text-xs font-mono bg-card/80 p-3 rounded-md border border-primary/20 whitespace-pre-wrap break-words min-w-0">
                            {JSON.stringify(data.formattedData?.[0], null, 2)}
                          </pre>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters and Actions */}
      <Card className="flex items-center gap-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-[240px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Digite aqui..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex items-center gap-2"
                  data-testid="input-search-datasets"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="flex items-center gap-2" data-testid="select-filter-type">
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
                <SelectTrigger className="flex items-center gap-2" data-testid="select-filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="ready">Pronto</SelectItem>
                  <SelectItem value="processing">Processando</SelectItem>
                  <SelectItem value="failed">Falhou</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="flex items-center gap-2" data-testid="select-sort-by">
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
                className="flex items-center gap-2"
                data-testid="button-element"
              >
                {sortOrder === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] })}
                className="flex items-center gap-2"
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>

              {selectedDatasets.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setShowBulkDelete(true)}
                  className="gap-2"
                  data-testid="button-element"
                >
                  <Trash2 className="w-4 h-4" />{t.common.loading}{selectedDatasets.size})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Datasets List */}
      <Card className="flex items-center gap-2">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filteredDatasets.length === 0 ? (
            <div className="flex items-center gap-2">
              <Database className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Nenhum dataset encontrado</p>
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterType !== "all" || filterStatus !== "all"
                  ? "Tente ajustar os filtros"
                  : "Nenhum dado disponível"}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="flex items-center gap-2">
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
                      <div className="flex items-center gap-2">
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
                          className="shrink-0 mt-1"
                        />

                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <TypeIcon className="w-4 h-4 text-primary shrink-0" />
                                <h3 className="flex items-center gap-2" data-testid={`text-dataset-name-${dataset.id}`}>
                                  {dataset.name}
                                </h3>
                                {getStatusBadge(dataset.status)}
                              </div>
                              
                              {dataset.description && (
                                <p className="text-sm text-muted-foreground mb-2 break-words">
                                  {dataset.description}
                                </p>
                              )}

                              <div className="flex items-center gap-2">
                                <span className="flex items-center gap-2">
                                  <FileText className="w-4 h-4" />
                                  {dataset.totalExamples.toLocaleString()} exemplos
                                </span>
                                <span className="flex items-center gap-2">
                                  <Database className="w-4 h-4" />
                                  {formatFileSize(dataset.fileSize)}
                                </span>
                                <span className="flex items-center gap-2">
                                  <Calendar className="w-4 h-4" />
                                  {new Date(dataset.createdAt).toLocaleDateString("pt-BR", { dateStyle: "medium" })}
                                  <Clock className="w-3 h-3 ml-1" />
                                  {new Date(dataset.createdAt).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {dataset.averageLength && (
                                  <span className="flex items-center gap-2">
                                    <BarChart3 className="w-4 h-4" />
                                    Avg: {dataset.averageLength} chars
                                  </span>
                                )}
                                {getQualityBadge(qualityTier)}
                              </div>

                              {dataset.validationErrors && dataset.validationErrors.length > 0 && (
                                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>{t.common.loading} {dataset.validationErrors.join(", ")}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setPreviewDataset(dataset)}
                                className="flex items-center gap-2"
                                data-testid={`button-preview-${dataset.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  setEditDataset(dataset);
                                  setEditName(dataset.name);
                                  setEditDescription(dataset.description || "");
                                }}
                                className="flex items-center gap-2"
                                data-testid={`button-edit-${dataset.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => downloadDataset(dataset)}
                                className="flex items-center gap-2"
                                data-testid={`button-download-${dataset.id}`}
                              >
                                <Download className="w-4 h-4" />
                              </Button>

                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setDeleteDatasetId(dataset.id)}
                                className="bg-destructive/10 border border-destructive/20 rounded-md p-4"
                                data-testid={`button-delete-${dataset.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {dataset.schema && (
                            <div className="text-xs text-muted-foreground font-mono bg-card/50 p-2 rounded-md break-words overflow-x-auto">
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
        <DialogContent className="flex items-center gap-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Preview: {previewDataset?.name}
            </DialogTitle>
            <DialogDescription>{t.common.loading}</DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex items-center gap-2">
            {isLoadingPreview ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words min-w-0">
                  {JSON.stringify(previewContent, null, 2)}
                </pre>
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDataset(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dataset Dialog */}
      <Dialog open={!!editDataset} onOpenChange={(open) => !open && setEditDataset(null)}>
        <DialogContent className="flex items-center gap-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-primary" />{t.common.loading}</DialogTitle>
            <DialogDescription>{t.common.loading}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t.common.loading}</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nome do dataset"
                data-testid="input-edit-dataset-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="instruction">{t.common.loading}</Label>
              <Textarea
                id="instruction"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Digite aqui..."
                rows={3}
                data-testid="text-element"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDataset(null)}
              data-testid="button-cancel-edit"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editDataset) {
                  updateMutation.mutate({
                    id: editDataset.id,
                    data: {
                      name: editName,
                      description: editDescription || undefined,
                    },
                  });
                }
              }}
              disabled={updateMutation.isPending || !editName.trim()}
              data-testid="button-element"
            >
              {updateMutation.isPending ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDatasetId} onOpenChange={() => setDeleteDatasetId(null)}>
        <AlertDialogContent className="flex items-center gap-2">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.common.loading}</AlertDialogTitle>
            <AlertDialogDescription>{t.common.loading}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDatasetId && deleteMutation.mutate(deleteDatasetId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-element"
            >{t.common.loading}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDelete} onOpenChange={setShowBulkDelete}>
        <AlertDialogContent className="flex items-center gap-2">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.common.loading}</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedDatasets.size} datasets?
                                      </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedDatasets))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-element"
            >{t.common.loading}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Training Data Dialog */}
      <Dialog open={!!editTrainingData} onOpenChange={(open) => !open && setEditTrainingData(null)}>
        <DialogContent className="flex items-center gap-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-primary" />
              Editar Training Data
            </DialogTitle>
            <DialogDescription>{t.common.loading}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-training-instruction">Instruction (Pergunta/Prompt)</Label>
              <Textarea
                id="edit-training-instruction"
                value={editTrainingInstruction}
                onChange={(e) => setEditTrainingInstruction(e.target.value)}
                placeholder="Digite aqui..."
                rows={4}
                className="font-mono text-sm"
                data-testid="textarea-edit-training-instruction"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-training-output">Output (Resposta Esperada)</Label>
              <Textarea
                id="edit-training-output"
                value={editTrainingOutput}
                onChange={(e) => setEditTrainingOutput(e.target.value)}
                placeholder="Digite aqui..."
                rows={8}
                className="font-mono text-sm"
                data-testid="textarea-edit-training-output"
              />
              <div className="flex items-center gap-2">
                <span>{editTrainingOutput.length} caracteres</span>
                {editTrainingOutput.length < 10 && editTrainingOutput.length > 0 && (
                  <span className="text-yellow-500">{t.common.loading}</span>
                )}
              </div>
            </div>

            {/* Validation Warnings Inline */}
            {validationWarnings.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">{t.common.loading}</p>
                    <ul className="text-xs text-yellow-600 dark:text-yellow-300 space-y-1">
                      {validationWarnings.map((warning, idx) => (
                        <li key={idx}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                <Sparkles className="w-3 h-3 inline mr-1" />{t.common.loading}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditTrainingData(null);
                setEditTrainingInstruction("");
                setEditTrainingOutput("");
              }}
              data-testid="button-cancel-edit-training"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (editTrainingData) {
                  updateTrainingDataMutation.mutate({
                    id: editTrainingData.id,
                    data: {
                      instruction: editTrainingInstruction,
                      output: editTrainingOutput,
                    },
                  });
                }
              }}
              disabled={updateTrainingDataMutation.isPending || !editTrainingInstruction.trim() || !editTrainingOutput.trim()}
              data-testid="button-element"
            >
              {updateTrainingDataMutation.isPending ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Training Data Confirmation Dialog */}
      <AlertDialog open={!!deleteTrainingDataId} onOpenChange={() => setDeleteTrainingDataId(null)}>
        <AlertDialogContent className="flex items-center gap-2">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.common.loading}</AlertDialogTitle>
            <AlertDialogDescription>{t.common.loading}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTrainingDataId && deleteTrainingDataMutation.mutate(deleteTrainingDataId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-element"
            >{t.common.loading}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
