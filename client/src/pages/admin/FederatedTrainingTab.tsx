import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Cpu, TrendingDown, Users, CheckCircle2, AlertCircle, Clock } from "lucide-react";

export default function FederatedTrainingTab() {
  const { data: jobsData } = useQuery({
    queryKey: ["/api/training/jobs"],
    queryFn: async () => {
      const res = await fetch("/api/training/jobs?tenantId=1");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const jobs = jobsData?.jobs || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Federated Training</h2>
          <p className="text-muted-foreground">
            Train LLMs 3-4x faster using distributed multi-GPU training
          </p>
        </div>
        <Button data-testid="button-create-job">
          Create Training Job
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Jobs</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobs.filter((j: any) => j.status === 'running').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Workers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobs.reduce((sum: number, j: any) => sum + (j.activeWorkers || 0), 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Jobs</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {jobs.filter((j: any) => j.status === 'completed').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Speed</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3.6x</div>
            <p className="text-xs text-muted-foreground">vs single GPU</p>
          </CardContent>
        </Card>
      </div>

      {/* Training Jobs List */}
      <Card>
        <CardHeader>
          <CardTitle>Training Jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="mx-auto h-8 w-8 mb-2" />
              <p>No training jobs yet</p>
              <p className="text-sm">Create your first federated training job to get started</p>
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
