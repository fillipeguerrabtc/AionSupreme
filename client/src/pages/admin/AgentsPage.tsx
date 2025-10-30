import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, Users } from "lucide-react";

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
  
  // Fetch agents
  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // Create agent mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Agent>) => {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": "1" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create agent");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agente criado com sucesso!" });
      setIsCreateOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar agente", description: error.message, variant: "destructive" });
    },
  });

  // Delete agent mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/agents/${id}`, {
        method: "DELETE",
        headers: { "x-tenant-id": "1" },
      });
      if (!res.ok) throw new Error("Failed to delete agent");
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

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      name: formData.get("name") as string,
      slug: formData.get("slug") as string,
      type: "specialist",
      description: formData.get("description") as string,
      systemPrompt: formData.get("systemPrompt") as string,
      enabled: true,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Users className="w-8 h-8" />
            Agentes Especialistas
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie agentes com conhecimento especializado em domínios verticais
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-agent">
              <Plus className="w-4 h-4 mr-2" />
              Criar Agente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Novo Agente</DialogTitle>
              <DialogDescription>
                Configure um agente especialista com prompts e namespaces dedicados
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" name="name" required data-testid="input-agent-name" />
                </div>
                <div>
                  <Label htmlFor="slug">Slug</Label>
                  <Input id="slug" name="slug" required data-testid="input-agent-slug" />
                </div>
              </div>
              <div>
                <Label htmlFor="description">Descrição</Label>
                <Input id="description" name="description" data-testid="input-agent-description" />
              </div>
              <div>
                <Label htmlFor="systemPrompt">System Prompt</Label>
                <Textarea
                  id="systemPrompt"
                  name="systemPrompt"
                  rows={5}
                  data-testid="input-agent-prompt"
                />
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
                      <div className="flex gap-1 flex-wrap">
                        {agent.ragNamespaces?.slice(0, 2).map((ns, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
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
                          onClick={() => setSelectedAgent(agent)}
                          data-testid={`button-edit-${agent.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(agent.id)}
                          disabled={deleteMutation.isPending}
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
    </div>
  );
}
