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

interface AddWorkerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddWorkerDialog({ open, onOpenChange }: AddWorkerDialogProps) {
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
      const res = await apiRequest("/api/gpu/kaggle/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: kaggleUsername,
          key: kaggleKey,
          notebookName: notebookName || "aion-gpu-worker",
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gpu/status"] });
      toast({
        title: "Kaggle Worker Provisioning",
        description: `Notebook "${data.notebookName}" criado com sucesso! GPU será registrada em ~2-3 minutos.`,
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao provisionar Kaggle",
        description: error.message || "Falha ao criar notebook Kaggle",
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
        title: "Colab Worker Provisioning",
        description: `Notebook provisionado com sucesso! GPU será registrada em ~3-5 minutos.`,
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao provisionar Colab",
        description: error.message || "Falha ao orquestrar notebook Colab",
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
        title: "Campos obrigatórios",
        description: "Username e API Key são obrigatórios",
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
        title: "Campos obrigatórios",
        description: "Email e senha do Google são obrigatórios",
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
            Adicionar GPU Worker
          </DialogTitle>
          <DialogDescription>
            Provisione automaticamente notebooks Kaggle ou Colab como GPU workers
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="kaggle" data-testid="tab-kaggle">
              <Code2 className="w-4 h-4 mr-2" />
              Kaggle (API)
            </TabsTrigger>
            <TabsTrigger value="colab" data-testid="tab-colab">
              <Zap className="w-4 h-4 mr-2" />
              Google Colab
            </TabsTrigger>
          </TabsList>

          {/* Kaggle Tab */}
          <TabsContent value="kaggle" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Kaggle Notebook (100% Automático)</CardTitle>
                <CardDescription>
                  30h/semana gratuito, P100 GPU, API oficial, zero manual
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleKaggleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="kaggle-username">Kaggle Username *</Label>
                    <Input
                      id="kaggle-username"
                      placeholder="seu-username"
                      value={kaggleUsername}
                      onChange={(e) => setKaggleUsername(e.target.value)}
                      disabled={kaggleMutation.isPending}
                      data-testid="input-kaggle-username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="kaggle-key">Kaggle API Key *</Label>
                    <Input
                      id="kaggle-key"
                      type="password"
                      placeholder="Sua API Key (do kaggle.json)"
                      value={kaggleKey}
                      onChange={(e) => setKaggleKey(e.target.value)}
                      disabled={kaggleMutation.isPending}
                      data-testid="input-kaggle-key"
                    />
                    <p className="text-xs text-muted-foreground">
                      Obtenha em: kaggle.com/settings → API → Create New Token
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notebook-name">Nome do Notebook (opcional)</Label>
                    <Input
                      id="notebook-name"
                      placeholder="aion-gpu-worker"
                      value={notebookName}
                      onChange={(e) => setNotebookName(e.target.value)}
                      disabled={kaggleMutation.isPending}
                      data-testid="input-notebook-name"
                    />
                  </div>

                  <Alert>
                    <AlertDescription className="text-sm">
                      <strong>Como funciona:</strong>
                      <ol className="list-decimal list-inside mt-2 space-y-1">
                        <li>API cria notebook automaticamente</li>
                        <li>Notebook executa script AION GPU worker</li>
                        <li>Worker se registra via ngrok (~2min)</li>
                        <li>GPU aparece aqui com status "Healthy"</li>
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
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={kaggleMutation.isPending}
                      data-testid="button-provision-kaggle"
                    >
                      {kaggleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Provisionar Kaggle
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
                <CardTitle className="text-lg">Google Colab (Puppeteer)</CardTitle>
                <CardDescription>
                  GPU gratuita T4, orquestração via Puppeteer (sem API pública)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleColabSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="colab-email">Email do Google *</Label>
                    <Input
                      id="colab-email"
                      type="email"
                      placeholder="seu-email@gmail.com"
                      value={colabEmail}
                      onChange={(e) => setColabEmail(e.target.value)}
                      disabled={colabMutation.isPending}
                      data-testid="input-colab-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="colab-password">Senha do Google *</Label>
                    <Input
                      id="colab-password"
                      type="password"
                      placeholder="Sua senha"
                      value={colabPassword}
                      onChange={(e) => setColabPassword(e.target.value)}
                      disabled={colabMutation.isPending}
                      data-testid="input-colab-password"
                    />
                    <p className="text-xs text-muted-foreground">
                      ⚠️ Credenciais armazenadas com criptografia AES-256
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="colab-notebook-url">Notebook URL (opcional)</Label>
                    <Input
                      id="colab-notebook-url"
                      placeholder="https://colab.research.google.com/drive/..."
                      value={colabNotebookUrl}
                      onChange={(e) => setColabNotebookUrl(e.target.value)}
                      disabled={colabMutation.isPending}
                      data-testid="input-colab-notebook-url"
                    />
                    <p className="text-xs text-muted-foreground">
                      Deixe vazio para criar novo notebook automaticamente
                    </p>
                  </div>

                  <Alert className="bg-yellow-500/10 border-yellow-500/20">
                    <AlertDescription className="text-sm">
                      <strong>⚡ Como funciona (Puppeteer):</strong>
                      <ol className="list-decimal list-inside mt-2 space-y-1">
                        <li>Puppeteer faz login no Google (headless)</li>
                        <li>Cria/abre notebook no Colab</li>
                        <li>Executa script AION GPU worker</li>
                        <li>Worker se registra via ngrok (~3-5min)</li>
                      </ol>
                      <p className="mt-2 text-xs">
                        ⏱️ Tempo estimado: 3-5 minutos (login + provisioning)
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
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={colabMutation.isPending}
                      data-testid="button-provision-colab"
                    >
                      {colabMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Provisionar Colab
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
