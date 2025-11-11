import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Cpu, TrendingDown, Users, CheckCircle2, AlertCircle, Upload } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";

export default function FederatedTrainingTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [jobName, setJobName] = useState("");
  const [modelType, setModelType] = useState("mistral-7b");
  const [totalChunks, setTotalChunks] = useState(6);
  const [learningRate, setLearningRate] = useState(2e-5);
  const [epochs, setEpochs] = useState(3);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  
  // Dataset upload state
  const [datasetName, setDatasetName] = useState("");
  const [datasetDescription, setDatasetDescription] = useState("");
  const [datasetType, setDatasetType] = useState("instruction");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: jobsData } = useQuery({
    queryKey: ["/api/training/jobs"],
    queryFn: async () => {
      const res = await fetch("/api/training/jobs");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: datasetsData } = useQuery({
    queryKey: ["/api/training/datasets"],
    queryFn: async () => {
      const res = await fetch("/api/training/datasets");
      return res.json();
    },
  });

  const createJob = useMutation({
    mutationFn: async (jobData: any) => {
      const res = await apiRequest("/api/training/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jobData),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/jobs"] });
      setCreateDialogOpen(false);
      toast({
        title: `✅ ${t.admin.messages.jobCreated}`,
        description: t.admin.messages.jobCreatedDesc,
      });
      setJobName("");
    },
    onError: (error: any) => {
      toast({
        title: `❌ ${t.admin.messages.jobCreateError}`,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const uploadDataset = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/training/datasets", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] });
      setUploadDialogOpen(false);
      setDatasetName("");
      setDatasetDescription("");
      setSelectedFile(null);
      toast({
        title: t.admin.federatedTraining.toast.datasetUploaded,
        description: t.admin.federatedTraining.toast.datasetUploadedDesc,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.admin.federatedTraining.toast.uploadFailed,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteDataset = useMutation({
    mutationFn: async (datasetId: number) => {
      const res = await apiRequest(`/api/training/datasets/${datasetId}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] });
      toast({
        title: t.admin.federatedTraining.toast.datasetDeleted,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.admin.federatedTraining.toast.deleteFailed,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateJob = async () => {
    if (!jobName.trim()) {
      toast({
        title: `⚠️ ${t.admin.messages.nameRequired}`,
        description: t.admin.messages.nameRequiredDesc,
        variant: "destructive",
      });
      return;
    }

    if (!selectedDatasetId) {
      toast({
        title: t.admin.federatedTraining.toast.datasetRequired,
        description: t.admin.federatedTraining.toast.datasetRequiredDesc,
        variant: "destructive",
      });
      return;
    }

    let finalDatasetId = selectedDatasetId;

    // Auto-generate dataset from KB if user selected KB option
    if (selectedDatasetId === 'kb-auto' || selectedDatasetId === 'kb-high-quality') {
      try {
        toast({
          title: t.admin.federatedTraining.toast.generatingDataset,
          description: t.admin.federatedTraining.toast.generatingDatasetDesc,
        });

        const response = await apiRequest("/api/training/datasets/generate-from-kb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: selectedDatasetId,
            minScore: selectedDatasetId === 'kb-high-quality' ? 80 : 60
          })
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Failed to generate dataset');
        }

        finalDatasetId = result.dataset.id.toString();
        
        toast({
          title: t.admin.federatedTraining.toast.datasetGenerated,
          description: `${result.stats.totalConversations} ${t.admin.federatedTraining.toast.datasetGeneratedDesc} ${result.stats.avgScore.toFixed(1)})`,
        });

        queryClient.invalidateQueries({ queryKey: ["/api/training/datasets"] });
      } catch (error: any) {
        toast({
          title: t.admin.federatedTraining.toast.datasetGenerationFailed,
          description: error.message,
          variant: "destructive",
        });
        return;
      }
    }

    createJob.mutate({
      name: jobName,
      modelType,
      totalChunks,
      totalSteps: 1000,
      currentStep: 0,
      status: "pending",
      datasetId: Number(finalDatasetId), // Convert to number for schema validation
      hyperparameters: {
        learning_rate: learningRate,
        epochs,
        batch_size: 4,
        gradient_accumulation_steps: 4,
        sync_interval: 100,
      },
    });
    setJobName("");
    setSelectedDatasetId("");
  };

  const handleUploadDataset = () => {
    if (!datasetName.trim()) {
      toast({
        title: t.admin.federatedTraining.toast.nameRequired,
        description: t.admin.federatedTraining.toast.nameRequiredDesc,
        variant: "destructive",
      });
      return;
    }

    if (!selectedFile) {
      toast({
        title: t.admin.federatedTraining.toast.fileRequired,
        description: t.admin.federatedTraining.toast.fileRequiredDesc,
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("name", datasetName);
    formData.append("description", datasetDescription);
    formData.append("datasetType", datasetType);

    uploadDataset.mutate(formData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const jobs = jobsData?.jobs || [];
  const datasets = datasetsData?.datasets || [];

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold break-words">{t.admin.federatedTraining.title}</h2>
          <p className="text-muted-foreground break-words">
            {t.admin.federatedTraining.subtitle}
          </p>
        </div>
        <Button 
          onClick={() => setCreateDialogOpen(true)}
          data-testid="button-create-job"
          className="shrink-0"
        >
          {t.admin.federatedTraining.createJob}
        </Button>
      </div>

      {/* Create Job Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.admin.federatedTraining.createDialog.title}</DialogTitle>
            <DialogDescription>
              {t.admin.federatedTraining.createDialog.description}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="job-name">{t.admin.federatedTraining.createDialog.jobName}</Label>
              <Input
                id="job-name"
                placeholder={t.admin.federatedTraining.createDialog.jobNamePlaceholder}
                value={jobName}
                onChange={(e) => setJobName(e.target.value)}
                data-testid="input-job-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="field">{t.admin.federatedTraining.createDialog.modelBase}</Label>
              <Select value={modelType} onValueChange={setModelType}>
                <SelectTrigger data-testid="select-element">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mistral-7b">Mistral 7B</SelectItem>
                  <SelectItem value="llama-3-8b">Llama 3 8B</SelectItem>
                  <SelectItem value="phi-3">Phi-3 Mini</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="total-chunks">{t.admin.federatedTraining.createDialog.numGpus}</Label>
                <Input
                  id="total-chunks"
                  type="number"
                  min={1}
                  max={12}
                  value={totalChunks}
                  onChange={(e) => setTotalChunks(parseInt(e.target.value))}
                  data-testid="input-total-chunks"
                />
                <p className="text-xs text-muted-foreground">
                  {t.admin.federatedTraining.createDialog.gpuRecommendation}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="learning-rate">{t.admin.federatedTraining.createDialog.learningRate}</Label>
                <Input
                  id="learning-rate"
                  type="number"
                  step="0.00001"
                  value={learningRate}
                  onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                  data-testid="input-learning-rate"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="epochs">{t.admin.federatedTraining.createDialog.epochs}</Label>
              <Input
                id="epochs"
                type="number"
                min={1}
                max={10}
                value={epochs}
                onChange={(e) => setEpochs(parseInt(e.target.value))}
                data-testid="input-epochs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataset-select">{t.admin.federatedTraining.datasetSelector.label}</Label>
              <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                <SelectTrigger data-testid="select-dataset">
                  <SelectValue placeholder={t.admin.federatedTraining.datasetSelector.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kb-auto">{t.admin.federatedTraining.datasetSelector.autoGenerated}</SelectItem>
                  <SelectItem value="kb-high-quality">{t.admin.federatedTraining.datasetSelector.highQuality}</SelectItem>
                  {datasets && datasets.map((dataset: any) => (
                    <SelectItem key={dataset.id} value={dataset.id.toString()}>
                      📁 {dataset.name} ({dataset.totalExamples} {t.admin.federatedTraining.datasetManagement.examples.toLowerCase()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t.admin.federatedTraining.datasetSelector.autoDesc}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {t.admin.federatedTraining.createDialog.cancel}
            </Button>
            <Button 
              onClick={handleCreateJob}
              disabled={createJob.isPending || !selectedDatasetId}
              data-testid="button-element"
            >
              {createJob.isPending ? t.admin.federatedTraining.createDialog.creating : t.admin.federatedTraining.createDialog.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">{t.admin.federatedTraining.activeJobs}</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobs.filter((j: any) => j.status === 'running').length}
            </div>
            <p className="text-xs text-muted-foreground">{t.admin.federatedTraining.jobsRunning}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">{t.admin.federatedTraining.totalWorkers}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobs.reduce((sum: number, j: any) => sum + (j.activeWorkers || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">{t.admin.federatedTraining.gpusActive}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">{t.admin.federatedTraining.completedJobs}</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobs.filter((j: any) => j.status === 'completed').length}
            </div>
            <p className="text-xs text-muted-foreground">{t.admin.federatedTraining.jobsFinished}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">{t.admin.federatedTraining.avgSpeed}</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3.6x</div>
            <p className="text-xs text-muted-foreground">{t.admin.federatedTraining.speedupVsSingleGpu}</p>
          </CardContent>
        </Card>
      </div>

      {/* Training Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>{t.admin.federatedTraining.trainingJobs}</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="mx-auto h-8 w-8 mb-2" />
              <p>{t.admin.federatedTraining.noJobsYet}</p>
              <p className="text-sm">{t.admin.federatedTraining.createFirstJob}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job: any) => (
                <Card key={job.id} className="hover-elevate" data-testid={`card-job-${job.id}`}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{job.name}</CardTitle>
                        <Badge 
                          variant={job.status === 'running' ? 'default' : 'secondary'}
                          data-testid={`badge-status-${job.id}`}
                        >
                          {job.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" data-testid={`badge-workers-${job.id}`}>
                          <Users className="w-3 h-3 mr-1" />
                          {job.activeWorkers} {t.admin.federatedTraining.jobDetails.workers}
                        </Badge>
                        <Badge variant="outline">
                          {job.modelType}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Progress Bar */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>{t.admin.federatedTraining.jobDetails.progress}</span>
                        <span className="font-medium">
                          {job.currentStep} / {job.totalSteps} {t.admin.federatedTraining.jobDetails.steps}
                          ({((job.currentStep / job.totalSteps) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <Progress 
                        value={(job.currentStep / job.totalSteps) * 100} 
                        data-testid={`progress-${job.id}`}
                      />
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">{t.admin.federatedTraining.jobDetails.globalLoss}</div>
                        <div className="font-medium" data-testid={`text-loss-${job.id}`}>
                          {job.globalLoss?.toFixed(4) || t.admin.federatedTraining.jobDetails.na}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t.admin.federatedTraining.jobDetails.bestLoss}</div>
                        <div className="font-medium">
                          {job.bestLoss?.toFixed(4) || t.admin.federatedTraining.jobDetails.na}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t.admin.federatedTraining.jobDetails.completedChunks}</div>
                        <div className="font-medium">
                          {job.completedChunks} / {job.totalChunks}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        data-testid={`button-view-${job.id}`}
                      >
                        {t.admin.federatedTraining.jobDetails.viewDetails}
                      </Button>
                      {job.status === 'running' ? (
                        <Button size="sm" variant="outline">{t.admin.federatedTraining.jobDetails.pause}</Button>
                      ) : job.status === 'paused' ? (
                        <Button size="sm">{t.admin.federatedTraining.jobDetails.resume}</Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dataset Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                {t.admin.federatedTraining.datasetManagement.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t.admin.federatedTraining.datasetManagement.subtitle}
              </p>
            </div>
            <Button 
              onClick={() => setUploadDialogOpen(true)}
              variant="outline"
              data-testid="button-upload-dataset"
            >
              <Upload className="w-4 h-4 mr-2" />
              {t.admin.federatedTraining.datasetManagement.uploadButton}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {datasets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Upload className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t.admin.federatedTraining.datasetManagement.noDatasets}</p>
              <p className="text-sm">{t.admin.federatedTraining.datasetManagement.noDatasetsDesc}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {datasets.map((dataset: any) => (
                <div 
                  key={dataset.id} 
                  className="flex items-center gap-2"
                  data-testid={`dataset-${dataset.id}`}
                >
                  <div className="flex items-center gap-2">
                    <div>
                      <h4 className="font-medium">{dataset.name}</h4>
                      {dataset.description && (
                        <p className="text-sm text-muted-foreground">{dataset.description}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteDataset.mutate(dataset.id)}
                      data-testid={`button-delete-dataset-${dataset.id}`}
                    >
                      {t.admin.federatedTraining.datasetManagement.delete}
                    </Button>
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>{t.admin.federatedTraining.datasetManagement.type}: {dataset.datasetType}</span>
                    <span>{t.admin.federatedTraining.datasetManagement.examples}: {dataset.totalExamples}</span>
                    <span>{t.admin.federatedTraining.datasetManagement.size}: {(dataset.fileSize / 1024 / 1024).toFixed(2)} {t.admin.federatedTraining.datasetManagement.mbUnit}</span>
                    <Badge variant={dataset.isValid ? "default" : "destructive"}>
                      {dataset.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Dataset Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.common.loading}</DialogTitle>
            <DialogDescription>
              Upload a dataset file for federated training. Supported formats: JSONL, JSON, CSV, TXT
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="dataset-name">{t.common.loading}</Label>
              <Input
                id="dataset-name"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                placeholder="Digite aqui..."
                data-testid="input-dataset-name"
              />
            </div>
            <div>
              <Label htmlFor="field">Description (Optional)</Label>
              <Textarea
                id="field"
                value={datasetDescription}
                onChange={(e) => setDatasetDescription(e.target.value)}
                placeholder="Digite aqui..."
                data-testid="text-element"
              />
            </div>
            <div>
              <Label htmlFor="dataset-type">{t.common.loading}</Label>
              <Select value={datasetType} onValueChange={setDatasetType}>
                <SelectTrigger data-testid="select-dataset-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instruction">Instruction</SelectItem>
                  <SelectItem value="chat">Chat</SelectItem>
                  <SelectItem value="qa">Q&A</SelectItem>
                  <SelectItem value="text">Plain Text</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dataset-file">{t.common.loading}</Label>
              <Input
                id="dataset-file"
                type="file"
                accept=".jsonl,.json,.csv,.txt,.tsv"
                onChange={handleFileChange}
                data-testid="input-dataset-file"
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-2">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUploadDataset}
              disabled={uploadDataset.isPending}
              data-testid="button-element"
            >
              {uploadDataset.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use Federated Training</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-3">
            <div className="bg-primary/10 rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-primary font-medium">1</div>
            <div>
              <p className="font-medium">Create Training Job</p>
              <p className="text-muted-foreground">Upload dataset and configure hyperparameters</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="bg-primary/10 rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-primary font-medium">2</div>
            <div>
              <p className="font-medium">Open 3-6 Colab/Kaggle Notebooks</p>
              <p className="text-muted-foreground">Run FEDERATED_TRAINING.py in each GPU</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="bg-primary/10 rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-primary font-medium">3</div>
            <div>
              <p className="font-medium">Watch Real-Time Progress</p>
              <p className="text-muted-foreground">Monitor workers, loss, and gradients aggregation</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="bg-primary/10 rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-primary font-medium">4</div>
            <div>
              <p className="font-medium">Deploy Trained Model</p>
              <p className="text-muted-foreground">Download LoRA adapter and use in GPU Pool</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
