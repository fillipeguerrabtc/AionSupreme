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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GitBranch } from "lucide-react";

type Agent = {
  id: string;
  name: string;
  slug: string;
};

type Relationship = {
  relationship: {
    id: number;
    parentAgentId: string;
    childAgentId: string;
    budgetSharePercent: number;
    delegationMode: string;
    maxDepth: number;
    enabled: boolean;
  };
  childAgent?: Agent;
  parentAgent?: Agent;
};

export function AgentHierarchyManager() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [parentAgent, setParentAgent] = useState<string>("");
  const [childAgent, setChildAgent] = useState<string>("");
  const [budgetShare, setBudgetShare] = useState([40]); // 40% default
  const [delegationMode, setDelegationMode] = useState("dynamic");
  const [maxDepth, setMaxDepth] = useState(3);

  // Fetch all agents
  const { data: agents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // Fetch all relationships
  const { data: relationships = [], isLoading } = useQuery<Relationship[]>({
    queryKey: ["/api/agent-relationships"],
  });

  // Create relationship mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      parentAgentId: string;
      childAgentId: string;
      budgetSharePercent: number;
      delegationMode: string;
      maxDepth: number;
    }) => {
      const res = await apiRequest("/api/agent-relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-relationships"] });
      toast({ title: "Relacionamento criado com sucesso!" });
      setIsCreateOpen(false);
      setParentAgent("");
      setChildAgent("");
      setBudgetShare([40]);
      setDelegationMode("dynamic");
      setMaxDepth(3);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao criar relacionamento", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Delete relationship mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/agent-relationships/${id}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-relationships"] });
      toast({ title: "Relacionamento removido!" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao remover relacionamento", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!parentAgent || !childAgent) {
      toast({ 
        title: "Erro", 
        description: "Selecione pai e filho", 
        variant: "destructive" 
      });
      return;
    }

    // Validation: prevent same agent
    if (parentAgent === childAgent) {
      toast({ 
        title: "Erro", 
        description: "Agente não pode ser pai de si mesmo", 
        variant: "destructive" 
      });
      return;
    }

    createMutation.mutate({
      parentAgentId: parentAgent,
      childAgentId: childAgent,
      budgetSharePercent: budgetShare[0] / 100, // Convert 40 → 0.4 before sending
      delegationMode,
      maxDepth,
    });
  };

  const getAgentName = (id: string) => {
    return agents.find((a) => a.id === id)?.name || id;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="w-5 h-5" />
                Hierarquia de Agentes
              </CardTitle>
              <CardDescription>
                Configure delegação hierárquica: agentes pais podem coordenar sub-agentes especializados
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-relationship" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Relacionamento
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Relacionamento Hierárquico</DialogTitle>
                  <DialogDescription>
                    Defina um agente pai que pode delegar tarefas para um agente filho especializado
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <Label htmlFor="parent">Agente Pai (Coordenador)</Label>
                    <Select value={parentAgent} onValueChange={setParentAgent}>
                      <SelectTrigger id="parent" data-testid="select-parent-agent">
                        <SelectValue placeholder="Selecione agente pai" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.filter((a) => a.id !== childAgent).map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="child">Agente Filho (Especialista)</Label>
                    <Select value={childAgent} onValueChange={setChildAgent}>
                      <SelectTrigger id="child" data-testid="select-child-agent">
                        <SelectValue placeholder="Selecione agente filho" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.filter((a) => a.id !== parentAgent).map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="budget">
                      Budget Share: {budgetShare[0]}%
                    </Label>
                    <Slider
                      id="budget"
                      min={10}
                      max={100}
                      step={5}
                      value={budgetShare}
                      onValueChange={setBudgetShare}
                      className="mt-2"
                      data-testid="slider-budget-share"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Porcentagem do budget do pai alocada para este filho
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="delegation">Modo de Delegação</Label>
                    <Select value={delegationMode} onValueChange={setDelegationMode}>
                      <SelectTrigger id="delegation" data-testid="select-delegation-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="always">Sempre (always)</SelectItem>
                        <SelectItem value="dynamic">Dinâmico (dynamic)</SelectItem>
                        <SelectItem value="fallback">Fallback</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {delegationMode === "always" && "Sempre delega para filho"}
                      {delegationMode === "dynamic" && "Decide baseado em complexidade"}
                      {delegationMode === "fallback" && "Só delega se pai falhar"}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="maxDepth">Profundidade Máxima</Label>
                    <Input
                      id="maxDepth"
                      type="number"
                      min={1}
                      max={5}
                      value={maxDepth}
                      onChange={(e) => setMaxDepth(Number(e.target.value))}
                      data-testid="input-max-depth"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Níveis de hierarquia permitidos (1-5)
                    </p>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateOpen(false)}
                      data-testid="button-cancel-relationship"
                    >
                      Cancelar
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createMutation.isPending}
                      data-testid="button-save-relationship"
                    >
                      {createMutation.isPending ? "Criando..." : "Criar Relacionamento"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando relacionamentos...
            </div>
          ) : relationships.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <GitBranch className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>Nenhum relacionamento hierárquico configurado</p>
              <p className="text-sm">Crie relacionamentos para habilitar delegação de sub-agentes</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente Pai</TableHead>
                  <TableHead>Agente Filho</TableHead>
                  <TableHead>Budget Share</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead>Max Depth</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {relationships.map(({ relationship, childAgent, parentAgent: parent }) => (
                  <TableRow key={relationship.id} data-testid={`row-relationship-${relationship.id}`}>
                    <TableCell className="font-medium">
                      {parent ? parent.name : getAgentName(relationship.parentAgentId)}
                    </TableCell>
                    <TableCell>
                      {childAgent ? childAgent.name : getAgentName(relationship.childAgentId)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {/* budgetSharePercent is stored as 0-1, display as % */}
                        {relationship.budgetSharePercent > 1 
                          ? relationship.budgetSharePercent.toFixed(0) 
                          : (relationship.budgetSharePercent * 100).toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{relationship.delegationMode}</Badge>
                    </TableCell>
                    <TableCell>{relationship.maxDepth}</TableCell>
                    <TableCell>
                      <Badge variant={relationship.enabled ? "default" : "secondary"}>
                        {relationship.enabled ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMutation.mutate(relationship.id)}
                        data-testid={`button-delete-relationship-${relationship.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
