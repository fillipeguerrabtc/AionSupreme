import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Users, Search } from "lucide-react";
import { NamespaceSelector } from "@/components/agents/NamespaceSelector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentHierarchyManager } from "@/components/agents/AgentHierarchyManager";
import { CreateAgentForm } from "@/components/agents/CreateAgentForm";
import { CreateSubAgentForm } from "@/components/agents/CreateSubAgentForm";
import { ScrollArea } from "@/components/ui/scroll-area";

type Agent = {
  id: string;
  name: string;
  slug: string;
  type: string;
  agentTier?: "agent" | "subagent";
  assignedNamespaces?: string[];
  description?: string;
  systemPrompt?: string;
  enabled: boolean;
  ragNamespaces?: string[];
  policy?: any;
};

export default function AgentsPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("list");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [showOrphanScanDialog, setShowOrphanScanDialog] = useState(false);
  const [orphanScanResult, setOrphanScanResult] = useState<any>(null);
  
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editNamespaces, setEditNamespaces] = useState<string[]>([]);
  
  // Fetch agents
  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // Update agent mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Agent> }) => {
      const res = await apiRequest(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agente atualizado com sucesso!" });
      setSelectedAgent(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar agente", description: error.message, variant: "destructive" });
    },
  });

  // Delete agent mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(`/api/agents/${id}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agente desabilitado com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao desabilitar agente", description: error.message, variant: "destructive" });
    },
  });

  // Platform orphan scan mutation
  const orphanScanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/orphans/platform-scan");
      return res.json();
    },
    onSuccess: (data) => {
      setOrphanScanResult(data);
      setShowOrphanScanDialog(true);
      toast({ 
        title: "Scan completo", 
        description: `${data.report.totalOrphans} orphans detectados` 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao executar scan", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleEdit = (agent: Agent) => {
    setSelectedAgent(agent);
    setEditName(agent.name);
    setEditSlug(agent.slug);
    setEditDescription(agent.description || "");
    setEditPrompt(agent.systemPrompt || "");
    setEditNamespaces(agent.ragNamespaces || []);
  };

  const handleSaveEdit = () => {
    if (!selectedAgent) return;
    updateMutation.mutate({
      id: selectedAgent.id,
      data: {
        name: editName,
        slug: editSlug,
        description: editDescription || undefined,
        systemPrompt: editPrompt || undefined,
        ragNamespaces: editNamespaces,
      },
    });
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-semibold flex items-center gap-2 break-words">
            <Users className="w-8 h-8 shrink-0" />
            Agentes & Hierarquia
          </h1>
          <p className="text-muted-foreground mt-1 break-words">
            Gerencie agentes especializados e delegação hierárquica multi-camada
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="list" data-testid="tab-agents-list">Lista</TabsTrigger>
          <TabsTrigger value="create-agent" data-testid="tab-create-agent">Criar Agent</TabsTrigger>
          <TabsTrigger value="create-subagent" data-testid="tab-create-subagent">Criar SubAgent</TabsTrigger>
          <TabsTrigger value="hierarchy" data-testid="tab-hierarchy">Hierarquia</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4 mt-4">
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <Button 
              data-testid="button-scan-orphans" 
              variant="outline"
              onClick={() => orphanScanMutation.mutate()}
              disabled={orphanScanMutation.isPending}
            >
              <Search className="w-4 h-4 mr-2" />
              {orphanScanMutation.isPending ? "Scanning..." : "Scan Platform Orphans"}
            </Button>
            <Button 
              data-testid="button-create-agent" 
              variant="default"
              onClick={() => setActiveTab("create-agent")}
            >
              <Users className="w-4 h-4 mr-2" />
              Criar Agent
            </Button>
            <Button 
              data-testid="button-create-subagent" 
              variant="outline"
              onClick={() => setActiveTab("create-subagent")}
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar SubAgent
            </Button>
          </div>

          <Card>
        <CardHeader>
          <CardTitle>Agentes Ativos</CardTitle>
          <CardDescription>
            {agents.length} agentes configurados no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum agente configurado. Crie o primeiro agente acima.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Namespaces</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent) => (
                  <TableRow key={agent.id} data-testid={`row-agent-${agent.id}`}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{agent.slug}</code>
                    </TableCell>
                    <TableCell>{agent.type}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap max-w-xs">
                        {agent.ragNamespaces?.slice(0, 2).map((ns, i) => (
                          <Badge key={i} variant="outline" className="text-xs font-mono">
                            {ns}
                          </Badge>
                        ))}
                        {agent.ragNamespaces && agent.ragNamespaces.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{agent.ragNamespaces.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={agent.enabled ? "default" : "secondary"}>
                        {agent.enabled ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEdit(agent)}
                          data-testid={`button-edit-${agent.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteAgentId(agent.id)}
                          data-testid={`button-delete-${agent.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="create-agent" className="mt-4">
          <CreateAgentForm />
        </TabsContent>

        <TabsContent value="create-subagent" className="mt-4">
          <CreateSubAgentForm />
        </TabsContent>

        <TabsContent value="hierarchy" className="mt-4">
          <AgentHierarchyManager />
        </TabsContent>
      </Tabs>

      {/* Edit Agent Dialog */}
      <Dialog open={selectedAgent !== null} onOpenChange={(open) => !open && setSelectedAgent(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Agente</DialogTitle>
            <DialogDescription>
              Atualize a configuração do agente {selectedAgent?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedAgent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-name">Nome do Agente</Label>
                  <Input 
                    id="edit-name" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required 
                    data-testid="input-agent-name" 
                  />
                </div>
                <div>
                  <Label htmlFor="edit-slug">Slug (identificador único)</Label>
                  <Input 
                    id="edit-slug" 
                    value={editSlug}
                    onChange={(e) => setEditSlug(e.target.value)}
                    required 
                    data-testid="input-agent-slug" 
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-description">Descrição</Label>
                <Input 
                  id="edit-description" 
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  data-testid="input-agent-description" 
                />
              </div>
              <div>
                <Label htmlFor="edit-systemPrompt">System Prompt</Label>
                <Textarea
                  id="edit-systemPrompt"
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  rows={5}
                  data-testid="input-agent-prompt"
                />
              </div>
              <div>
                <Label>Namespaces (áreas de conhecimento)</Label>
                <NamespaceSelector 
                  value={editNamespaces} 
                  onChange={setEditNamespaces}
                  placeholder="Selecione ou crie namespaces customizados"
                  allowCustom={true}
                  allowWildcard={editSlug.includes("curador")}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {editSlug.includes("curador") 
                    ? "Curadores podem ter acesso total (*) a todos os namespaces"
                    : "Selecione namespaces existentes ou crie novos no formato: categoria/subcategoria"
                  }
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setSelectedAgent(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} data-testid="button-save-agent">
                  {updateMutation.isPending ? "Atualizando..." : "Salvar Alterações"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteAgentId} onOpenChange={(open) => !open && setDeleteAgentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este agente? Esta ação não pode ser desfeita.
              O agente será removido permanentemente do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteAgentId) {
                  deleteMutation.mutate(deleteAgentId);
                  setDeleteAgentId(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Platform Orphan Scan Results Dialog */}
      <Dialog open={showOrphanScanDialog} onOpenChange={setShowOrphanScanDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Platform Orphan Scan Results</DialogTitle>
            <DialogDescription>
              Detected orphaned resources across all modules
            </DialogDescription>
          </DialogHeader>
          
          {orphanScanResult && (
            <ScrollArea className="h-[60vh]">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-destructive">{orphanScanResult.report.summary.high}</div>
                      <p className="text-xs text-muted-foreground">High Severity</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-yellow-600">{orphanScanResult.report.summary.medium}</div>
                      <p className="text-xs text-muted-foreground">Medium Severity</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-green-600">{orphanScanResult.report.summary.low}</div>
                      <p className="text-xs text-muted-foreground">Low Severity</p>
                    </CardContent>
                  </Card>
                </div>

                {orphanScanResult.report.modules.map((module: any) => (
                  module.totalOrphans > 0 && (
                    <Card key={module.module}>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center justify-between">
                          <span>📦 {module.module}</span>
                          <Badge variant="secondary">{module.totalOrphans} orphans</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {module.orphans.map((orphan: any, idx: number) => (
                            <div key={idx} className="border-l-4 pl-3 py-2" style={{
                              borderColor: orphan.severity === 'high' ? 'rgb(239, 68, 68)' : 
                                          orphan.severity === 'medium' ? 'rgb(234, 179, 8)' : 
                                          'rgb(34, 197, 94)'
                            }}>
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">{orphan.type}</Badge>
                                <span className="text-xs text-muted-foreground">ID: {orphan.id}</span>
                              </div>
                              <p className="text-sm">{orphan.reason}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                <strong>Action:</strong> {orphan.suggestedAction}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                ))}

                {orphanScanResult.report.totalOrphans === 0 && (
                  <Card>
                    <CardContent className="pt-6 text-center">
                      <p className="text-lg text-green-600 font-semibold">✅ No orphans detected</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        All platform modules are healthy!
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
