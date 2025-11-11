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
import { ICON_MAP } from "@/lib/icon-map";
import { type Namespace } from "@shared/schema";
import { useMemo } from "react";
import { useLanguage } from "@/lib/i18n";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const [createDescription, setCreateDescription] = useState("");
  const [createIcon, setCreateIcon] = useState("");
  const [createContent, setCreateContent] = useState("");
  
  // Edit form state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editContent, setEditContent] = useState("");
  
  // Fetch ALL namespaces from database (unified approach)
  const { data: allNamespaces = [], isLoading } = useQuery<Namespace[]>({
    queryKey: ["/api/admin/namespaces"],
  });

  // Sort namespaces alphabetically
  const sortedNamespaces = useMemo(() => {
    return [...allNamespaces].sort((a, b) => a.name.localeCompare(b.name));
  }, [allNamespaces]);


  // Create namespace mutation
  const createMutation = useMutation({
    mutationFn: async (data: Partial<Namespace>) => {
      const res = await apiRequest("/api/admin/namespaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/namespaces"] });
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
      const res = await apiRequest(`/api/admin/namespaces/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/namespaces"] });
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
      await apiRequest(`/api/admin/namespaces/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/namespaces"] });
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
      setEditDescription(selectedNamespace.description || "");
      setEditIcon(selectedNamespace.icon || "");
      setEditContent("");
    }
  }, [selectedNamespace]);

  const resetCreateForm = () => {
    setCreateMode("sub");
    setParentNamespace("");
    setCreateName("");
    setCreateDescription("");
    setCreateIcon("");
    setCreateContent("");
  };

  const handleCreate = async () => {
    if (!createName.trim()) {
      toast({ 
        title: t.admin.namespaces.validation.nameRequired, 
        description: t.admin.namespaces.validation.nameRequiredDesc,
        variant: "destructive" 
      });
      return;
    }

    // Validate based on mode
    if (createMode === "root") {
      if (createName.includes("/")) {
        toast({ 
          title: t.admin.namespaces.validation.invalidRootFormat, 
          description: t.admin.namespaces.validation.rootNoSlash,
          variant: "destructive" 
        });
        return;
      }
    } else {
      // Sub-namespace must have parent
      if (!parentNamespace) {
        toast({ 
          title: t.admin.namespaces.validation.parentRequired, 
          description: t.admin.namespaces.validation.selectParentDesc,
          variant: "destructive" 
        });
        return;
      }
      
      if (!createName.includes("/")) {
        toast({ 
          title: t.admin.namespaces.validation.invalidFormat, 
          description: t.admin.namespaces.validation.subFormatError,
          variant: "destructive" 
        });
        return;
      }

      if (!createName.startsWith(parentNamespace + "/")) {
        toast({ 
          title: t.admin.namespaces.validation.invalidFormat, 
          description: `Sub-namespace deve começar com "${parentNamespace}/"`,
          variant: "destructive" 
        });
        return;
      }
    }

    createMutation.mutate({
      name: createName,
      description: createDescription,
      icon: createIcon,
    }, {
      onSuccess: async (newNamespace) => {
        // If content was provided, ingest it into the namespace
        if (createContent.trim()) {
          try {
            await apiRequest(`/api/admin/namespaces/${newNamespace.id}/ingest`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: createContent,
                title: `Conteúdo inicial - ${createName}`,
              }),
            });
            toast({ 
              title: t.admin.namespaces.toast.contentQueued, 
              description: "[PT]" 
            });
          } catch (error) {
            toast({ 
              title: t.admin.namespaces.toast.indexError, 
              description: error instanceof Error ? error.message : t.admin.namespaces.toast.unknownError,
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
    const isPredefined = selectedNamespace.id.toString().startsWith("predefined");
    
    if (isPredefined) {
      // Create a new custom namespace based on the predefined one
      createMutation.mutate({
        name: editName,
        description: editDescription,
        icon: editIcon,
      }, {
        onSuccess: async (newNamespace) => {
          toast({ 
            title: t.admin.namespaces.toast.customVersionCreated, 
            description: `Namespace "${editName}" foi criado baseado no namespace de sistema.` 
          });
          
          // If content was provided, ingest it into the new namespace
          if (editContent.trim()) {
            try {
              await apiRequest(`/api/admin/namespaces/${newNamespace.id}/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: editContent,
                  title: `Conteúdo inicial - ${editName}`,
                }),
              });
              toast({ 
                title: t.admin.namespaces.toast.contentQueued, 
                description: "[PT]" 
              });
            } catch (error) {
              toast({ 
                title: t.admin.namespaces.toast.indexError, 
                description: error instanceof Error ? error.message : t.admin.namespaces.toast.unknownError,
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
          name: editName,
          description: editDescription,
          icon: editIcon,
        },
      }, {
        onSuccess: async () => {
          // If content was provided, ingest it into the namespace
          if (editContent.trim()) {
            try {
              await apiRequest(`/api/admin/namespaces/${selectedNamespace.id}/ingest`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  content: editContent,
                  title: `Atualização de conteúdo - ${editName}`,
                }),
              });
              toast({ 
                title: t.admin.namespaces.toast.contentQueued, 
                description: "[PT]" 
              });
            } catch (error) {
              toast({ 
                title: t.admin.namespaces.toast.indexError, 
                description: error instanceof Error ? error.message : t.admin.namespaces.toast.unknownError,
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
      <div className="flex items-center gap-2">
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
                  ? t.admin.namespaces.createRootDesc 
                  : t.admin.namespaces.createSubDesc}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {/* Modo de criação */}
              <div className="space-y-2">
                <Label>"[TEXTO]"</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={createMode === "root" ? "default" : "outline"}
                    onClick={() => {
                      setCreateMode("root");
                      setParentNamespace("");
                      setCreateName("");
                    }}
                    className="flex"
                  >
                    <span className="flex items-center gap-2">Namespace Raiz</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      Ex: "projetos" ou "vendas"
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant={createMode === "sub" ? "default" : "outline"}
                    onClick={() => setCreateMode("sub")}
                    className="flex"
                  >
                    <span className="flex items-center gap-2">Sub-namespace</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      Ex: "financas/impostos"
                    </span>
                  </Button>
                </div>
              </div>

              {/* Parent namespace selector (only for sub mode) */}
              {createMode === "sub" && (
                <div className="space-y-2">
                  <Label htmlFor="parent-namespace">{t.admin.namespaces.parent} *</Label>
                  <Input
                    id="parent-namespace"
                    placeholder={t.admin.namespaces.rootPlaceholder}
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
                  <p className="text-xs text-muted-foreground">"[TEXTO]"</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="create-name">
                  {createMode === "root" ? t.admin.namespaces.rootNameLabel : t.admin.namespaces.fullNameLabel}
                </Label>
                <Input
                  id="create-name"
                  placeholder={
                    createMode === "root"
                      ? t.admin.namespaces.rootNameExample
                      : parentNamespace
                      ? `${parentNamespace}/...`
                      : t.admin.namespaces.subNameExample
                  }
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  data-testid="input-create-namespace-name"
                />
                <p className="text-xs text-muted-foreground">
                  {createMode === "root" 
                    ? t.admin.namespaces.rootNameHint
                    : t.admin.namespaces.subNameHint
                  }
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="[PT]">{t.admin.namespaces.description}</Label>
                <Textarea
                  id="[PT]"
                  placeholder={t.admin.namespaces.descriptionPlaceholder}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  rows={3}
                  data-testid="text-element"
                />
                <p className="text-xs text-muted-foreground">"[TEXTO]"</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-icon">"[TEXTO]"</Label>
                <IconPicker
                  value={createIcon}
                  onChange={setCreateIcon}
                />
                <p className="text-xs text-muted-foreground">"[TEXTO]"</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-content">"[TEXTO]"</Label>
                <Textarea
                  id="create-content"
                  placeholder={t.admin.namespaces.contentPlaceholder}
                  value={createContent}
                  onChange={(e) => setCreateContent(e.target.value)}
                  rows={5}
                  data-testid="textarea-create-namespace-content"
                />
                <p className="text-xs text-muted-foreground">"[TEXTO]"</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsCreateOpen(false)}
                  data-testid="button-cancel-create"
                >
                  {t.admin.namespaces.cancel}
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  data-testid="button-submit-create"
                >
                  {createMutation.isPending ? t.admin.namespaces.creating : t.admin.namespaces.create}
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
            <p className="text-center py-8 text-muted-foreground">{t.common.loading}</p>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead className="whitespace-nowrap">{t.admin.namespaces.name}</TableHead>
                    <TableHead className="whitespace-nowrap">{t.admin.namespaces.description}</TableHead>
                    <TableHead className="text-right whitespace-nowrap">{t.admin.namespaces.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedNamespaces.map((namespace, index) => {
                    const Icon = namespace.icon && ICON_MAP[namespace.icon] ? ICON_MAP[namespace.icon] : FolderTree;
                    return (
                    <TableRow key={namespace.id || namespace.name} data-testid={`row-namespace-${namespace.name}`}>
                      <TableCell>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div 
                                className="flex items-center gap-2"
                                data-testid={`icon-namespace-${namespace.name}`}
                              >
                                {namespace.icon && namespace.icon.startsWith('/') ? (
                                  <img 
                                    src={namespace.icon} 
                                    alt={namespace.name} 
                                    className="h-5 w-5 object-contain"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent && !parent.querySelector('svg')) {
                                        const fallback = document.createElement('div');
                                        fallback.innerHTML = `<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M2 10h20"/></svg>`;
                                        parent.appendChild(fallback.firstChild!);
                                      }
                                    }}
                                  />
                                ) : (
                                  <Icon className="h-5 w-5" />
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-sm">
                                <div className="flex items-center gap-2">{namespace.name}</div>
                                {namespace.description && (
                                  <div className="text-xs text-muted-foreground mt-1 max-w-xs">
                                    {namespace.description}
                                  </div>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="min-w-0">
                        <div className="max-w-[300px]">
                          <div className="font-medium truncate">{namespace.name}</div>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-0">
                        <div className="max-w-[400px] truncate">
                          {namespace.description || <span className="text-muted-foreground italic">"[TEXTO]"</span>}
                        </div>
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
                  );
                  })}
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
              {selectedNamespace?.id?.toString().startsWith("predefined") 
                ? t.admin.namespaces.editCustomVersion 
                : t.admin.namespaces.editNamespace}
            </DialogTitle>
            <DialogDescription>
              {selectedNamespace?.id?.toString().startsWith("predefined")
                ? `Crie uma versão personalizada de "${selectedNamespace?.name}". O namespace original permanecerá inalterado.`
                : `Atualize as informações do namespace ${selectedNamespace?.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome do Namespace *</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t.admin.namespaces.rootPlaceholder}
                data-testid="input-edit-namespace-name"
              />
              <p className="text-xs text-muted-foreground">"[TEXTO]"</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="[PT]">"[TEXTO]"</Label>
              <Textarea
                id="[PT]"
                placeholder={t.admin.namespaces.descriptionPlaceholder}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                data-testid="text-element"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-icon">"[TEXTO]"</Label>
              <IconPicker
                value={editIcon}
                onChange={setEditIcon}
              />
              <p className="text-xs text-muted-foreground">"[TEXTO]"</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-content">"[TEXTO]"</Label>
              <Textarea
                id="edit-content"
                placeholder={t.admin.namespaces.contentPlaceholder}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={5}
                data-testid="textarea-edit-namespace-content"
              />
              <div className="flex items-center gap-2">
                <FileText className="h-3 w-3" />
                <span>"[TEXTO]"</span>
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
                {updateMutation.isPending ? t.admin.namespaces.saving : t.admin.namespaces.save}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteNamespaceId} onOpenChange={(open) => !open && setDeleteNamespaceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>"[TEXTO]"</AlertDialogTitle>
            <AlertDialogDescription>"[TEXTO]"</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-element">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-element"
            >"[TEXTO]"</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
