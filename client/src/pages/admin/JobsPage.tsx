import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PlayCircle, PauseCircle, XCircle, RefreshCw, Filter, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";

interface LinkCaptureJob {
  id: number;
  url: string;
  status: "pending" | "running" | "paused" | {t("admin.jobs.completed")} | "failed" | "cancelled";
  progress: number;
  totalItems: number | null;
  processedItems: number | null;
  currentItem: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  paused: boolean;
  cancelled: boolean;
  metadata: Record<string, any> | null;
}

export default function JobsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | {t("admin.jobs.completed")} | "failed">("all");

  // Fetch jobs with polling every 2 seconds for real-time updates
  const { data: jobs, isLoading, refetch } = useQuery<LinkCaptureJob[]>({
    queryKey: ["/api/admin/jobs"],
    refetchInterval: 2000, // Poll every 2s for real-time progress
  });

  // Control mutations (pause, resume, cancel)
  const controlMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "pause" | "resume" | "cancel" }) => {
      return await apiRequest(`/api/admin/jobs/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/jobs"] });
      toast({
        title: t.common.success,
        description: t.admin.jobs.actionSuccess,
      });
    },
    onError: (error: Error) => {
      toast({
        title: t.common.error,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter jobs by status
  const filterJobs = (jobs: LinkCaptureJob[] | undefined) => {
    if (!jobs) return [];
    
    if (statusFilter === "all") return jobs;
    if (statusFilter === "active") return jobs.filter(j => ["pending", "running", "paused"].includes(j.status));
    if (statusFilter === {t("admin.jobs.completed")}) return jobs.filter(j => j.status === {t("admin.jobs.completed")});
    if (statusFilter === "failed") return jobs.filter(j => ["failed", "cancelled"].includes(j.status));
    
    return jobs;
  };

  const filteredJobs = filterJobs(jobs);

  // Status badge component
  const StatusBadge = ({ status }: { status: LinkCaptureJob["status"] }) => {
    const variants: Record<LinkCaptureJob["status"], { variant: "default" | "secondary" | {t("admin.jobs.destructive")} | "outline"; icon: any }> = {
      pending: { variant: "outline", icon: Clock },
      running: { variant: "default", icon: RefreshCw },
      paused: { variant: "secondary", icon: PauseCircle },
      completed: { variant: "default", icon: CheckCircle2 },
      failed: { variant: "destructive", icon: AlertCircle },
      cancelled: { variant: "secondary", icon: XCircle },
    };

    const { variant, icon: Icon } = variants[status];

    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {t.admin.jobs.status[status]}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className={t("admin.jobs.bgmutedroundedw13")}></div>
          <div className={t("admin.jobs.h32bgmutedrounded")}></div>
          <div className={t("admin.jobs.h32bgmutedrounded")}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-jobs">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-jobs-title">{t.admin.jobs.title}</h1>
          <p className="text-muted-foreground" data-testid="text-jobs-subtitle">{t.admin.jobs.subtitle}</p>
        </div>
        <Button
          onClick={() => refetch()}
          variant="outline"
          className="gap-2"
          data-testid="button-refresh-jobs"
        >
          <RefreshCw className="h-4 w-4" />
          {t.common.refresh}
        </Button>
      </div>

      {/* Filter Tabs */}
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="w-full">
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-all">
            {t.admin.jobs.filters.all} ({jobs?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="active" data-testid="tab-active">
            {t.admin.jobs.filters.active} ({jobs?.filter(j => ["pending", "running", "paused"].includes(j.status)).length || 0})
          </TabsTrigger>
          <TabsTrigger value={t("admin.jobs.completed")} data-testid={t("admin.jobs.tabcompleted")}>
            {t.admin.jobs.filters.completed} ({jobs?.filter(j => j.status === {t("admin.jobs.completed")}).length || 0})
          </TabsTrigger>
          <TabsTrigger value="failed" data-testid="tab-failed">
            {t.admin.jobs.filters.failed} ({jobs?.filter(j => ["failed", "cancelled"].includes(j.status)).length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="space-y-4 mt-6">
          {filteredJobs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground" data-testid="text-no-jobs">{t.admin.jobs.noJobs}</p>
              </CardContent>
            </Card>
          ) : (
            filteredJobs.map((job) => (
              <Card key={job.id} data-testid={`card-job-${job.id}`}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg truncate" data-testid={`text-job-url-${job.id}`}>
                          {job.url}
                        </CardTitle>
                        <StatusBadge status={job.status} />
                      </div>
                      <CardDescription className="space-y-1">
                        <div data-testid={`text-job-id-${job.id}`}>
                          {t.admin.jobs.jobId}: #{job.id}
                        </div>
                        <div data-testid={`text-job-created-${job.id}`}>
                          {t.admin.jobs.created}: {new Date(job.createdAt).toLocaleString()}
                        </div>
                      </CardDescription>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex gap-2">
                      {job.status === "running" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => controlMutation.mutate({ id: job.id, action: "pause" })}
                          disabled={controlMutation.isPending}
                          data-testid={`button-pause-${job.id}`}
                        >
                          <PauseCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {job.status === "paused" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => controlMutation.mutate({ id: job.id, action: "resume" })}
                          disabled={controlMutation.isPending}
                          data-testid={`button-resume-${job.id}`}
                        >
                          <PlayCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {["pending", "running", "paused"].includes(job.status) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => controlMutation.mutate({ id: job.id, action: "cancel" })}
                          disabled={controlMutation.isPending}
                          data-testid={`button-cancel-${job.id}`}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground" data-testid={`text-progress-${job.id}`}>
                        {t.admin.jobs.progress}: {job.progress}%
                      </span>
                      {job.processedItems !== null && job.totalItems !== null && (
                        <span className="text-muted-foreground" data-testid={`text-items-${job.id}`}>
                          {job.processedItems}/{job.totalItems} {t.admin.jobs.items}
                        </span>
                      )}
                    </div>
                    <Progress value={job.progress} className="h-2" data-testid={`progress-bar-${job.id}`} />
                  </div>

                  {/* Current Item */}
                  {job.currentItem && (
                    <div className="text-sm">
                      <span className="font-medium">{t.admin.jobs.currentItem}: </span>
                      <span className="text-muted-foreground" data-testid={`text-current-item-${job.id}`}>
                        {job.currentItem}
                      </span>
                    </div>
                  )}

                  {/* Error Message */}
                  {job.errorMessage && (
                    <div className={t("admin.jobs.bgdestructive10borderborderdestructive20roundedmd")}>
                      <p className="text-sm text-destructive" data-testid={`text-error-${job.id}`}>
                        <strong>{t.common.error}:</strong> {job.errorMessage}
                      </p>
                    </div>
                  )}

                  {/* Metadata */}
                  {job.metadata && (
                    <div className="flex flex-wrap gap-2">
                      {job.metadata.namespace && (
                        <Badge variant="outline" data-testid={`badge-namespace-${job.id}`}>
                          {t.admin.jobs.namespace}: {job.metadata.namespace}
                        </Badge>
                      )}
                      {job.metadata.maxDepth && (
                        <Badge variant="outline" data-testid={`badge-depth-${job.id}`}>
                          {t.admin.jobs.maxDepth}: {job.metadata.maxDepth}
                        </Badge>
                      )}
                      {job.metadata.maxPages && (
                        <Badge variant="outline" data-testid={`badge-pages-${job.id}`}>
                          {t.admin.jobs.maxPages}: {job.metadata.maxPages}
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    {job.startedAt && (
                      <div data-testid={`text-started-${job.id}`}>
                        {t.admin.jobs.started}: {new Date(job.startedAt).toLocaleString()}
                      </div>
                    )}
                    {job.completedAt && (
                      <div data-testid={`text-completed-${job.id}`}>
                        {t.admin.jobs.completed}: {new Date(job.completedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
