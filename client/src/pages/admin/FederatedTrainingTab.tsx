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
  const [jobName, setJobName] = useState("");
  const [modelType, setModelType] = useState("mistral-7b");
  const [totalChunks, setTotalChunks] = useState(6);
  const [learningRate, setLearningRate] = useState(2e-5);
  const [epochs, setEpochs] = useState(3);

  const { data: jobsData } = useQuery({
    queryKey: ["/api/training/jobs"],
    queryFn: async () => {
      const res = await fetch("/api/training/jobs?tenantId=1");
      return res.json();
    },
    refetchInterval: 5000,
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

  const handleCreateJob = () => {
    if (!jobName.trim()) {
      toast({
        title: `⚠️ ${t.admin.messages.nameRequired}`,
        description: t.admin.messages.nameRequiredDesc,
        variant: "destructive",
      });
      return;
    }

    createJob.mutate({
      tenantId: 1,
      name: jobName,
      modelType,
      totalChunks,
      totalSteps: 1000,
      currentStep: 0,
      status: "pending",
      hyperparameters: {
        learning_rate: learningRate,
        epochs,
        batch_size: 4,
        gradient_accumulation_steps: 4,
        sync_interval: 100,
      },
    });
  };

  const jobs = jobsData?.jobs || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{t.admin.federatedTraining.title}</h2>
          <p className="text-muted-foreground">
            {t.admin.federatedTraining.subtitle}
          </p>
        </div>
        <Button 
          onClick={() => setCreateDialogOpen(true)}
          data-testid="button-create-job"
        >
          {t.admin.federatedTraining.createJob}
        </Button>
      </div>

      {/* Create Job Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
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
              <Label htmlFor="model-type">{t.admin.federatedTraining.createDialog.modelBase}</Label>
              <Select value={modelType} onValueChange={setModelType}>
                <SelectTrigger data-testid="select-model-type">
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

            <div className="rounded-lg bg-muted p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Upload className="w-4 h-4" />
                {t.admin.federatedTraining.createDialog.datasetComingSoon}
              </div>
              <p className="text-xs text-muted-foreground">
                {t.admin.federatedTraining.createDialog.datasetDesc}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {t.admin.federatedTraining.createDialog.cancel}
            </Button>
            <Button 
              onClick={handleCreateJob}
              disabled={createJob.isPending}
              data-testid="button-confirm-create-job"
            >
              {createJob.isPending ? t.admin.federatedTraining.createDialog.creating : t.admin.federatedTraining.createDialog.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
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
                          {job.activeWorkers} workers
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
                        <span>Progress</span>
                        <span className="font-medium">
                          {job.currentStep} / {job.totalSteps} steps
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
                        <div className="text-muted-foreground">Global Loss</div>
                        <div className="font-medium" data-testid={`text-loss-${job.id}`}>
                          {job.globalLoss?.toFixed(4) || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Best Loss</div>
                        <div className="font-medium">
                          {job.bestLoss?.toFixed(4) || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Completed Chunks</div>
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
                        View Details
                      </Button>
                      {job.status === 'running' ? (
                        <Button size="sm" variant="outline">Pause</Button>
                      ) : job.status === 'paused' ? (
                        <Button size="sm">Resume</Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
