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
import { Plus, Edit, Trash2, FolderTree, FileText, Upload } from "lucide-react";
import { IconPicker } from "@/components/IconPicker";
import { type Namespace } from "@shared/schema";
import { useMemo } from "react";
import { useLanguage } from "@/lib/i18n";

export default function NamespacesPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedNamespace, setSelectedNamespace] = useState<Namespace | null>(null);
  const [deleteNamespaceId, setDeleteNamespaceId] = useState<string | null>(null);
  
  // Create mode: "root" ou "sub"
  const [createMode, setCreateMode] = useState<"root" | "sub">("sub");
  const [parentNamespace, setParentNamespace] = useState("");
  
  // Create form state
  const [createName, setCreateName] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createIcon, setCreateIcon] = useState("");
  const [createCategory, setCreateCategory] = useState("");
  const [createContent, setCreateContent] = useState("");
  
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editContent, setEditContent] = useState("");
  
  // Fetch ALL namespaces from database (unified approach)
  const { data: allNamespaces = [], isLoading } = useQuery<Namespace[]>({
    queryKey: ["/api/namespaces"],
  });

  // Sort namespaces alphabetically
  const sortedNamespaces = useMemo(() => {
    return [...allNamespaces].sort((a, b) => a.name.localeCompare(b.name));
  }, [allNamespaces]);


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
      toast({ title: t.admin.namespaces.toast.created });
      setIsCreateOpen(false);
      resetCreateForm();
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
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
      toast({ title: t.admin.namespaces.toast.updated });
      setSelectedNamespace(null);
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
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
      toast({ title: t.admin.namespaces.toast.deleted });
    },
    onError: (error: Error) => {
      toast({ title: t.common.error, description: error.message, variant: "destructive" });
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
      setEditContent("");
    }
  }, [selectedNamespace]);

  const resetCreateForm = () => {
    setCreateMode("sub");
    setParentNamespace("");
    setCreateName("");
    setCreateDisplayName("");
    setCreateDescription("");
    setCreateIcon("");
    setCreateCategory("");
    setCreateContent("");
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      toast({ 
        title: "Nome obrigatório", 
        description: "Por favor, insira um nome para o namespace",
        variant: "destructive" 
      });
      return;
    }

    // Validate based on mode
    if (createMode === "root") {
      if (createName.includes("/")) {
        toast({ 
          title: "Formato inválido para namespace raiz", 
          description: "Namespace raiz não pode conter '/'",
          variant: "destructive" 
        });
        return;
      }
    } else {
      // Sub-namespace must have parent
      if (!parentNamespace) {
        toast({ 
          title: "Namespace pai obrigatório", 
          description: "Selecione o namespace pai para criar um sub-namespace",
          variant: "destructive" 
        });
        return;
      }
      
      if (!createName.includes("/")) {
        toast({ 
          title: "Formato inválido", 
          description: "Sub-namespace deve estar no formato pai/filho",
          variant: "destructive" 
        });
        return;
      }

      if (!createName.startsWith(parentNamespace + "/")) {
        toast({ 
          title: "Formato inválido", 
          description: `Sub-namespace deve começar com "${parentNamespace}/"`,
          variant: "destructive" 
        });
        return;
      }
    }

    createMutation.mutate({
      name: createName,
      displayName: createDisplayName || createName,
      description: createDescription,
      icon: createIcon,
      category: createCategory,
    }, {
      onSuccess: async (newNamespace) => {
        // If content was provided, ingest it into the namespace
        if (createContent.trim()) {
          try {
            await apiRequest(`/api/namespaces/${newNamespace.id}/ingest`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: createContent,
                title: `Conteúdo inicial - ${createName}`,
              }),
            });
            toast({ 
              title: "Conteúdo adicionado à fila de curadoria!", 
              description: "O conteúdo aguarda aprovação humana antes de ser indexado na Knowledge Base" 
            });
          } catch (error) {
            toast({ 
              title: "Erro ao indexar conteúdo", 
              description: error instanceof Error ? error.message : "Erro desconhecido",
              variant: "destructive" 
            });
          }
        }
      }
    });
  };

  const handleUpdate = async () => {
    if (!selectedNamespace) return;

    // Check if this is a predefined namespace being "customized"
    const isPredefined = selectedNamespace.id.toString().startsWith("predefined-");
    
    if (isPredefined) {
      // Create a new custom namespace based on the predefined one
      createMutation.mutate({
        name: editName,
        displayName: editDisplayName || editName,
        description: editDescription,
        icon: editIcon,
        category: editCategory,
      }, {
        onSuccess: async (newNamespace) => {
          toast({ 
            title: "Versão customizada criada!", 
            description: `Namespace "${editDisplayName}" foi criado baseado no namespace de sistema.` 
          });
          
          // If content was provided, ingest it into the new namespace
          if (editContent.trim()) {
            try {
              await apiRequest(`/api/namespaces/${newNamespace.id}/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: editContent,
                  title: `Conteúdo inicial - ${editName}`,
                }),
              });
              toast({ 
                title: "Conteúdo adicionado à fila de curadoria!", 
                description: "O conteúdo aguarda aprovação humana antes de ser indexado na Knowledge Base" 
              });
            } catch (error) {
              toast({ 
                title: "Erro ao indexar conteúdo", 
                description: error instanceof Error ? error.message : "Erro desconhecido",
                variant: "destructive" 
              });
            }
          }
          
          setSelectedNamespace(null);
        }
      });
    } else {
      // Update existing custom namespace
      updateMutation.mutate({
        id: selectedNamespace.id,
        data: {
          displayName: editDisplayName || editName,
          description: editDescription,
          icon: editIcon,
          category: editCategory,
        },
      }, {
        onSuccess: async () => {
          // If content was provided, ingest it into the namespace
          if (editContent.trim()) {
            try {
              await apiRequest(`/api/namespaces/${selectedNamespace.id}/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: editContent,
                  title: `Atualização de conteúdo - ${editName}`,
                }),
              });
              toast({ 
                title: "Conteúdo adicionado à fila de curadoria!", 
                description: "O conteúdo adicional aguarda aprovação humana antes de ser indexado na Knowledge Base" 
              });
            } catch (error) {
              toast({ 
                title: "Erro ao indexar conteúdo", 
                description: error instanceof Error ? error.message : "Erro desconhecido",
                variant: "destructive" 
              });
            }
          }
        }
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (deleteNamespaceId) {
      deleteMutation.mutate(deleteNamespaceId);
      setDeleteNamespaceId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-3xl font-bold break-words" data-testid="text-namespaces-title">
            {t.admin.namespaces.title}
          </h2>
          <p className="text-muted-foreground mt-1 break-words">
            {t.admin.namespaces.subtitle}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button 
            data-testid="button-create-namespace-root" 
            variant="default"
            onClick={() => {
              setCreateMode("root");
              setIsCreateOpen(true);
            }}
          >
            <FolderTree className="h-4 w-4 mr-2" />
            {t.admin.namespaces.createRoot}
          </Button>
          <Button 
            data-testid="button-create-namespace-sub" 
            variant="outline"
            onClick={() => {
              setCreateMode("sub");
              setIsCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            {t.admin.namespaces.createSub}
          </Button>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => {
        setIsCreateOpen(open);
        if (!open) resetCreateForm();
      }}>
            <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{createMode === "root" ? t.admin.namespaces.createRoot : t.admin.namespaces.createSub}</DialogTitle>
              <DialogDescription>
                {createMode === "root" 
                  ? "Crie um novo namespace raiz para organizar conhecimento por área" 
                  : "Crie um sub-namespace dentro de uma área existente"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Modo de criação */}
              <div className="space-y-2">
                <Label>Tipo de Namespace</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={createMode === "root" ? "default" : "outline"}
                    onClick={() => {
                      setCreateMode("root");
                      setParentNamespace("");
                      setCreateName("");
                    }}
                    className="h-auto py-3 flex-col items-start gap-1"
                  >
                    <span className="font-semibold">Namespace Raiz</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      Ex: "projetos" ou "vendas"
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={createMode === "sub" ? "default" : "outline"}
                    onClick={() => setCreateMode("sub")}
                    className="h-auto py-3 flex-col items-start gap-1"
                  >
                    <span className="font-semibold">Sub-namespace</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      Ex: "financas/impostos"
                    </span>
                  </Button>
                </div>
              </div>

              {/* Parent namespace selector (only for sub mode) */}
              {createMode === "sub" && (
                <div className="space-y-2">
                  <Label htmlFor="parent-namespace">Namespace Pai *</Label>
                  <Input
                    id="parent-namespace"
                    placeholder="Ex: atendimento, financas"
                    value={parentNamespace}
                    onChange={(e) => {
                      const parent = e.target.value.trim();
                      setParentNamespace(parent);
                      // Auto-fill name with parent prefix
                      if (parent && !createName.startsWith(parent + "/")) {
                        setCreateName(parent + "/");
                      }
                    }}
                    data-testid="input-parent-namespace"
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite o nome do namespace raiz (sem o "/" no final)
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="create-name">
                  {createMode === "root" ? "Nome do Namespace *" : "Nome Completo *"}
                </Label>
                <Input
                  id="create-name"
                  placeholder={
                    createMode === "root"
                      ? "Ex: projetos, vendas, documentacao"
                      : parentNamespace
                      ? `${parentNamespace}/...`
                      : "Ex: financas/impostos, tech/apis"
                  }
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  data-testid="input-create-namespace-name"
                />
                <p className="text-xs text-muted-foreground">
                  {createMode === "root" 
                    ? "Nome único sem '/' para namespace raiz"
                    : "Formato: namespace-pai/sub-namespace"
                  }
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

              <div className="space-y-2">
                <Label htmlFor="create-icon">Ícone</Label>
                <IconPicker
                  value={createIcon}
                  onChange={setCreateIcon}
                />
                <p className="text-xs text-muted-foreground">
                  Opcional. Escolha um ícone visual para identificar este namespace
                </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Todos os Namespaces
          </CardTitle>
          <CardDescription>
            {sortedNamespaces.length} namespaces totais
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">Carregando...</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Nome</TableHead>
                    <TableHead className="whitespace-nowrap">Descrição</TableHead>
                    <TableHead className="whitespace-nowrap">Categoria</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedNamespaces.map((namespace, index) => (
                    <TableRow key={namespace.id || namespace.name} data-testid={`row-namespace-${namespace.name}`}>
                      <TableCell className="min-w-0">
                        <div className="max-w-[250px]">
                          <div className="font-medium truncate">{namespace.displayName}</div>
                          <div className="text-sm text-muted-foreground truncate font-mono">{namespace.name}</div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-0">
                        <div className="max-w-[300px] truncate">
                          {namespace.description || <span className="text-muted-foreground italic">Sem descrição</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="whitespace-nowrap">{namespace.category || namespace.name.split("/")[0]}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 shrink-0">
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
                            onClick={() => setDeleteNamespaceId(namespace.id)}
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!selectedNamespace} onOpenChange={(open) => !open && setSelectedNamespace(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              {selectedNamespace?.id?.toString().startsWith("predefined-") 
                ? "Criar Versão Customizada" 
                : "Editar Namespace"}
            </DialogTitle>
            <DialogDescription>
              {selectedNamespace?.id?.toString().startsWith("predefined-")
                ? `Crie uma versão personalizada de "${selectedNamespace?.name}". O namespace original permanecerá inalterado.`
                : `Atualize as informações do namespace ${selectedNamespace?.name}`}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteNamespaceId} onOpenChange={(open) => !open && setDeleteNamespaceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este namespace? Esta ação não pode ser desfeita.
              Todo o conteúdo associado a este namespace permanecerá na Knowledge Base, mas não será mais filtrado por este namespace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
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
