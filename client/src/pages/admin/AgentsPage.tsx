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
import { Plus, Edit, Trash2, Users } from "lucide-react";
import { NamespaceSelector } from "@/components/agents/NamespaceSelector";
import { getNamespaceLabel } from "@shared/namespaces";

type Agent = {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
  systemPrompt?: string;
  enabled: boolean;
  ragNamespaces?: string[];
  policy?: any;
};

export default function AgentsPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  
  // Create form state
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPrompt, setCreatePrompt] = useState("");
  const [createNamespaces, setCreateNamespaces] = useState<string[]>([]);
  
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

  // Create agent mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Agent>) => {
      const res = await apiRequest("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": "1" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agente criado com sucesso!" });
      setIsCreateOpen(false);
      setCreateName("");
      setCreateSlug("");
      setCreateDescription("");
      setCreatePrompt("");
      setCreateNamespaces([]);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar agente", description: error.message, variant: "destructive" });
    },
  });

  // Update agent mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Agent> }) => {
      const res = await apiRequest(`/api/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": "1" },
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
        headers: { "x-tenant-id": "1" },
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

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name: createName,
      slug: createSlug,
      type: "specialist",
      description: createDescription || undefined,
      systemPrompt: createPrompt || undefined,
      ragNamespaces: createNamespaces,
      enabled: true,
    });
  };

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
            Agentes Especialistas
          </h1>
          <p className="text-muted-foreground mt-1 break-words">
            Gerencie agentes com conhecimento especializado em domínios verticais
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-agent" className="shrink-0">
              <Plus className="w-4 h-4 mr-2" />
              Criar Agente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Agente</DialogTitle>
              <DialogDescription>
                Configure um agente especialista com prompts e namespaces dedicados
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome do Agente</Label>
                  <Input 
                    id="name" 
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    required 
                    placeholder="Ex: Especialista em Finanças"
                    data-testid="input-agent-name" 
                  />
                </div>
                <div>
                  <Label htmlFor="slug">
                    Slug (identificador único)
                    <span className="text-muted-foreground text-xs ml-2">Ex: financas-empresa-x</span>
                  </Label>
                  <Input 
                    id="slug" 
                    value={createSlug}
                    onChange={(e) => setCreateSlug(e.target.value)}
                    required 
                    placeholder="identificador-unico"
                    data-testid="input-agent-slug" 
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="description">Descrição</Label>
                <Input 
                  id="description" 
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Breve descrição do agente"
                  data-testid="input-agent-description" 
                />
              </div>
              <div>
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  rows={5}
                  placeholder="Instruções e personalidade do agente..."
                  data-testid="input-agent-prompt"
                />
              </div>
              <div>
                <Label>Namespaces (áreas de conhecimento)</Label>
                <NamespaceSelector 
                  value={createNamespaces} 
                  onChange={setCreateNamespaces}
                  placeholder="Selecione ou crie namespaces customizados"
                  allowCustom={true}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Selecione namespaces existentes ou crie novos no formato: categoria/subcategoria
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-agent">
                  {createMutation.isPending ? "Criando..." : "Criar Agente"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
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
                            {getNamespaceLabel(ns)}
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
    </div>
  );
}
