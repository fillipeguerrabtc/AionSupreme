import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Server, Code2, Zap } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLanguage } from "@/lib/i18n";

interface AddWorkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddWorkerDialog({ open, onOpenChange }: AddWorkerDialogProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"kaggle" | "colab">("kaggle");

  // Kaggle form state
  const [kaggleUsername, setKaggleUsername] = useState("");
  const [kaggleKey, setKaggleKey] = useState("");
  const [notebookName, setNotebookName] = useState("");

  // Colab form state
  const [colabEmail, setColabEmail] = useState("");
  const [colabPassword, setColabPassword] = useState("");
  const [colabNotebookUrl, setColabNotebookUrl] = useState("");

  // Kaggle mutation
  const kaggleMutation = useMutation({
    mutationFn: async () => {
      console.log('[Kaggle Provision] Frontend: Sending request...');
      const res = await apiRequest("/api/gpu/kaggle/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: kaggleUsername,
          key: kaggleKey,
          notebookName: notebookName || "aion-gpu-worker",
        }),
      });
      console.log('[Kaggle Provision] Frontend: Response received, parsing JSON...');
      const data = await res.json();
      console.log('[Kaggle Provision] Frontend: Success!', data);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/status"] });
      toast({
        title: "✅ Kaggle Worker Provisioned",
        description: data.message || `Notebook "${data.notebookName}" is being created with GPU enabled. Check GPU Dashboard for status.`,
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      console.error('[Kaggle Provision] Frontend: Error!', error);
      toast({
        title: "❌ Kaggle Provisioning Failed",
        description: error.message || "Failed to provision Kaggle worker. Please verify your credentials and try again.",
        variant: "destructive",
      });
    },
  });

  // Colab mutation
  const colabMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/gpu/colab/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: colabEmail,
          password: colabPassword,
          notebookUrl: colabNotebookUrl,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/status"] });
      toast({
        title: t.admin.addGpuWorker.colab.success,
        description: t.admin.addGpuWorker.colab.successDesc,
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: t.admin.addGpuWorker.colab.error,
        description: error.message || t.admin.addGpuWorker.colab.errorDesc,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setKaggleUsername("");
    setKaggleKey("");
    setNotebookName("");
    setColabEmail("");
    setColabPassword("");
    setColabNotebookUrl("");
  };

  const handleKaggleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kaggleUsername || !kaggleKey) {
      toast({
        title: t.admin.addGpuWorker.kaggle.requiredFields,
        description: t.admin.addGpuWorker.kaggle.requiredFieldsDesc,
        variant: "destructive",
      });
      return;
    }
    kaggleMutation.mutate();
  };

  const handleColabSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!colabEmail || !colabPassword) {
      toast({
        title: t.admin.addGpuWorker.colab.requiredFields,
        description: t.admin.addGpuWorker.colab.requiredFieldsDesc,
        variant: "destructive",
      });
      return;
    }
    colabMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            {t.admin.addGpuWorker.title}
          </DialogTitle>
          <DialogDescription>
            {t.admin.addGpuWorker.description}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="kaggle" data-testid="tab-kaggle">
              <Code2 className="w-4 h-4 mr-2" />
              {t.admin.addGpuWorker.kaggleTab}
            </TabsTrigger>
            <TabsTrigger value="colab" data-testid="tab-colab">
              <Zap className="w-4 h-4 mr-2" />
              {t.admin.addGpuWorker.colabTab}
            </TabsTrigger>
          </TabsList>

          {/* Kaggle Tab */}
          <TabsContent value="kaggle" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t.admin.addGpuWorker.kaggle.title}</CardTitle>
                <CardDescription>
                  {t.admin.addGpuWorker.kaggle.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleKaggleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="kaggle-username">{t.admin.addGpuWorker.kaggle.username}</Label>
                    <Input
                      id="kaggle-username"
                      placeholder={t.admin.addGpuWorker.kaggle.usernamePlaceholder}
                      value={kaggleUsername}
                      onChange={(e) => setKaggleUsername(e.target.value)}
                      disabled={kaggleMutation.isPending}
                      data-testid="input-kaggle-username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="kaggle-key">{t.admin.addGpuWorker.kaggle.apiKey}</Label>
                    <Input
                      id="kaggle-key"
                      type="password"
                      placeholder={t.admin.addGpuWorker.kaggle.apiKeyPlaceholder}
                      value={kaggleKey}
                      onChange={(e) => setKaggleKey(e.target.value)}
                      disabled={kaggleMutation.isPending}
                      data-testid="input-kaggle-key"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t.admin.addGpuWorker.kaggle.apiKeyHelp}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notebook-name">{t.admin.addGpuWorker.kaggle.notebookName}</Label>
                    <Input
                      id="notebook-name"
                      placeholder={t.admin.addGpuWorker.kaggle.notebookNamePlaceholder}
                      value={notebookName}
                      onChange={(e) => setNotebookName(e.target.value)}
                      disabled={kaggleMutation.isPending}
                      data-testid="input-notebook-name"
                    />
                  </div>

                  <Alert>
                    <AlertDescription className="text-sm">
                      <strong>{t.admin.addGpuWorker.kaggle.howItWorks}</strong>
                      <ol className="list-decimal list-inside mt-2 space-y-1">
                        <li>{t.admin.addGpuWorker.kaggle.step1}</li>
                        <li>{t.admin.addGpuWorker.kaggle.step2}</li>
                        <li>{t.admin.addGpuWorker.kaggle.step3}</li>
                        <li>{t.admin.addGpuWorker.kaggle.step4}</li>
                      </ol>
                    </AlertDescription>
                  </Alert>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      disabled={kaggleMutation.isPending}
                    >
                      {t.admin.addGpuWorker.kaggle.cancel}
                    </Button>
                    <Button
                      type="submit"
                      disabled={kaggleMutation.isPending}
                      data-testid="button-provision-kaggle"
                    >
                      {kaggleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {kaggleMutation.isPending ? t.admin.addGpuWorker.kaggle.provisioning : t.admin.addGpuWorker.kaggle.provision}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Colab Tab */}
          <TabsContent value="colab" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t.admin.addGpuWorker.colab.title}</CardTitle>
                <CardDescription>
                  {t.admin.addGpuWorker.colab.subtitle}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleColabSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="colab-email">{t.admin.addGpuWorker.colab.email}</Label>
                    <Input
                      id="colab-email"
                      type="email"
                      placeholder={t.admin.addGpuWorker.colab.emailPlaceholder}
                      value={colabEmail}
                      onChange={(e) => setColabEmail(e.target.value)}
                      disabled={colabMutation.isPending}
                      data-testid="input-colab-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="colab-password">{t.admin.addGpuWorker.colab.password}</Label>
                    <Input
                      id="colab-password"
                      type="password"
                      placeholder={t.admin.addGpuWorker.colab.passwordPlaceholder}
                      value={colabPassword}
                      onChange={(e) => setColabPassword(e.target.value)}
                      disabled={colabMutation.isPending}
                      data-testid="input-colab-password"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t.admin.addGpuWorker.colab.passwordHelp}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="colab-notebook-url">{t.admin.addGpuWorker.colab.notebookUrl}</Label>
                    <Input
                      id="colab-notebook-url"
                      placeholder={t.admin.addGpuWorker.colab.notebookUrlPlaceholder}
                      value={colabNotebookUrl}
                      onChange={(e) => setColabNotebookUrl(e.target.value)}
                      disabled={colabMutation.isPending}
                      data-testid="input-colab-notebook-url"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t.admin.addGpuWorker.colab.notebookUrlHelp}
                    </p>
                  </div>

                  <Alert className="bg-yellow-500/10 border-yellow-500/20">
                    <AlertDescription className="text-sm">
                      <strong>{t.admin.addGpuWorker.colab.howItWorks}</strong>
                      <ol className="list-decimal list-inside mt-2 space-y-1">
                        <li>{t.admin.addGpuWorker.colab.step1}</li>
                        <li>{t.admin.addGpuWorker.colab.step2}</li>
                        <li>{t.admin.addGpuWorker.colab.step3}</li>
                        <li>{t.admin.addGpuWorker.colab.step4}</li>
                      </ol>
                      <p className="mt-2 text-xs">
                        {t.admin.addGpuWorker.colab.estimatedTime}
                      </p>
                    </AlertDescription>
                  </Alert>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      disabled={colabMutation.isPending}
                    >
                      {t.admin.addGpuWorker.colab.cancel}
                    </Button>
                    <Button
                      type="submit"
                      disabled={colabMutation.isPending}
                      data-testid="button-provision-colab"
                    >
                      {colabMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {colabMutation.isPending ? t.admin.addGpuWorker.colab.provisioning : t.admin.addGpuWorker.colab.provision}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
