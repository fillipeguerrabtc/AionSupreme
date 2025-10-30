import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FolderTree, FileText, Upload } from "lucide-react";
import { NamespaceSelector } from "@/components/agents/NamespaceSelector";
import { type Namespace } from "@shared/schema";

export default function NamespacesPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState<Namespace | null>(null);
  
  // Create form state
  const [createName, setCreateName] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createIcon, setCreateIcon] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createRelatedNamespaces, setCreateRelatedNamespaces] = useState<string[]>([]);
  const [createContent, setCreateContent] = useState("");
  
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editRelatedNamespaces, setEditRelatedNamespaces] = useState<string[]>([]);
  const [editContent, setEditContent] = useState("");
  
  // Fetch namespaces
  const { data: namespaces = [], isLoading } = useQuery<Namespace[]>({
    queryKey: ["/api/namespaces"],
  });

  // Create namespace mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Namespace>) => {
      const res = await apiRequest("/api/namespaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/namespaces"] });
      toast({ title: "Namespace criado com sucesso!" });
      setIsCreateOpen(false);
      resetCreateForm();
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar namespace", description: error.message, variant: "destructive" });
    },
  });

  // Update namespace mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Namespace> }) => {
      const res = await apiRequest(`/api/namespaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/namespaces"] });
      toast({ title: "Namespace atualizado com sucesso!" });
      setSelectedNamespace(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar namespace", description: error.message, variant: "destructive" });
    },
  });

  // Delete namespace mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/namespaces/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/namespaces"] });
      toast({ title: "Namespace excluído com sucesso!" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir namespace", description: error.message, variant: "destructive" });
    },
  });

  // Populate edit form when namespace is selected
  useEffect(() => {
    if (selectedNamespace) {
      setEditName(selectedNamespace.name);
      setEditDisplayName(selectedNamespace.displayName || "");
      setEditDescription(selectedNamespace.description || "");
      setEditIcon(selectedNamespace.icon || "");
      setEditCategory(selectedNamespace.category || "");
      setEditRelatedNamespaces(selectedNamespace.relatedNamespaces || []);
      setEditContent("");
    }
  }, [selectedNamespace]);

  const resetCreateForm = () => {
    setCreateName("");
    setCreateDisplayName("");
    setCreateDescription("");
    setCreateIcon("");
    setCreateCategory("");
    setCreateRelatedNamespaces([]);
    setCreateContent("");
  };

  const handleCreate = () => {
    if (!createName.trim()) {
      toast({ 
        title: "Nome obrigatório", 
        description: "Por favor, insira um nome no formato categoria/subcategoria",
        variant: "destructive" 
      });
      return;
    }

    // Validate namespace format
    if (!createName.includes("/")) {
      toast({ 
        title: "Formato inválido", 
        description: "O nome deve estar no formato categoria/subcategoria",
        variant: "destructive" 
      });
      return;
    }

    createMutation.mutate({
      name: createName,
      displayName: createDisplayName || createName,
      description: createDescription,
      icon: createIcon,
      category: createCategory,
      relatedNamespaces: createRelatedNamespaces,
    });
  };

  const handleUpdate = () => {
    if (!selectedNamespace) return;

    updateMutation.mutate({
      id: selectedNamespace.id,
      data: {
        displayName: editDisplayName || editName,
        description: editDescription,
        icon: editIcon,
        category: editCategory,
        relatedNamespaces: editRelatedNamespaces,
      },
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir este namespace?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold" data-testid="text-namespaces-title">
            Gerenciamento de Namespaces
          </h2>
          <p className="text-muted-foreground mt-1">
            Organize e gerencie os namespaces da Knowledge Base
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-namespace">
              <Plus className="h-4 w-4 mr-2" />
              Criar Namespace
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Namespace</DialogTitle>
              <DialogDescription>
                Adicione um novo namespace para organizar o conhecimento
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Nome do Namespace *</Label>
                <Input
                  id="create-name"
                  placeholder="categoria/subcategoria (ex: financas/investimentos)"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  data-testid="input-create-namespace-name"
                />
                <p className="text-xs text-muted-foreground">
                  Formato: categoria/subcategoria
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-display-name">Nome de Exibição</Label>
                <Input
                  id="create-display-name"
                  placeholder="Nome amigável para exibição"
                  value={createDisplayName}
                  onChange={(e) => setCreateDisplayName(e.target.value)}
                  data-testid="input-create-namespace-display-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-description">Descrição</Label>
                <Textarea
                  id="create-description"
                  placeholder="Descreva o tipo de conteúdo deste namespace..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  rows={3}
                  data-testid="textarea-create-namespace-description"
                />
                <p className="text-xs text-muted-foreground">
                  O Agente Curador usará esta descrição para entender e indexar conteúdo relacionado
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-icon">Ícone (lucide-react)</Label>
                  <Input
                    id="create-icon"
                    placeholder="DollarSign, Laptop, etc."
                    value={createIcon}
                    onChange={(e) => setCreateIcon(e.target.value)}
                    data-testid="input-create-namespace-icon"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="create-category">Categoria</Label>
                  <Input
                    id="create-category"
                    placeholder="Categoria principal"
                    value={createCategory}
                    onChange={(e) => setCreateCategory(e.target.value)}
                    data-testid="input-create-namespace-category"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Namespaces Relacionados</Label>
                <NamespaceSelector
                  value={createRelatedNamespaces}
                  onChange={setCreateRelatedNamespaces}
                  placeholder="Selecione namespaces relacionados..."
                  allowCustom={false}
                  allowWildcard={false}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-content">Conteúdo Inicial (Opcional)</Label>
                <Textarea
                  id="create-content"
                  placeholder="Cole textos ou documentos para o Agente Curador indexar..."
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  rows={5}
                  data-testid="textarea-create-namespace-content"
                />
                <p className="text-xs text-muted-foreground">
                  O conteúdo será analisado e indexado pelo Agente Curador na Knowledge Base
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  data-testid="button-cancel-create"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  data-testid="button-submit-create"
                >
                  {createMutation.isPending ? "Criando..." : "Criar Namespace"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Namespaces Existentes
          </CardTitle>
          <CardDescription>
            {namespaces.length} namespace{namespaces.length !== 1 ? "s" : ""} cadastrado{namespaces.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : namespaces.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              Nenhum namespace cadastrado. Crie o primeiro!
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Relacionados</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {namespaces.map((namespace) => (
                  <TableRow key={namespace.id} data-testid={`row-namespace-${namespace.id}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{namespace.displayName || namespace.name}</div>
                        <div className="text-sm text-muted-foreground">{namespace.name}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md truncate">
                        {namespace.description || <span className="text-muted-foreground italic">Sem descrição</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {namespace.category ? (
                        <Badge variant="outline">{namespace.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {namespace.relatedNamespaces && namespace.relatedNamespaces.length > 0 ? (
                        <Badge variant="secondary">
                          {namespace.relatedNamespaces.length}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={namespace.enabled ? "default" : "secondary"}>
                        {namespace.enabled ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedNamespace(namespace)}
                          data-testid={`button-edit-${namespace.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(namespace.id)}
                          data-testid={`button-delete-${namespace.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Edit Dialog */}
      <Dialog open={!!selectedNamespace} onOpenChange={(open) => !open && setSelectedNamespace(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Namespace</DialogTitle>
            <DialogDescription>
              Atualize as informações do namespace {selectedNamespace?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Nome do Namespace</Label>
              <Input
                value={editName}
                disabled
                className="bg-muted"
                data-testid="input-edit-namespace-name"
              />
              <p className="text-xs text-muted-foreground">
                O nome não pode ser alterado
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-display-name">Nome de Exibição</Label>
              <Input
                id="edit-display-name"
                placeholder="Nome amigável para exibição"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                data-testid="input-edit-namespace-display-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                placeholder="Descreva o tipo de conteúdo deste namespace..."
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                data-testid="textarea-edit-namespace-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-icon">Ícone (lucide-react)</Label>
                <Input
                  id="edit-icon"
                  placeholder="DollarSign, Laptop, etc."
                  value={editIcon}
                  onChange={(e) => setEditIcon(e.target.value)}
                  data-testid="input-edit-namespace-icon"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-category">Categoria</Label>
                <Input
                  id="edit-category"
                  placeholder="Categoria principal"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  data-testid="input-edit-namespace-category"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Namespaces Relacionados</Label>
              <NamespaceSelector
                value={editRelatedNamespaces}
                onChange={setEditRelatedNamespaces}
                placeholder="Selecione namespaces relacionados..."
                allowCustom={false}
                allowWildcard={false}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-content">Adicionar Conteúdo (Opcional)</Label>
              <Textarea
                id="edit-content"
                placeholder="Cole textos ou documentos para o Agente Curador indexar..."
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={5}
                data-testid="textarea-edit-namespace-content"
              />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-3 w-3" />
                <span>Novo conteúdo será analisado e indexado pelo Agente Curador</span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setSelectedNamespace(null)}
                data-testid="button-cancel-edit"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={updateMutation.isPending}
                data-testid="button-submit-edit"
              >
                {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
