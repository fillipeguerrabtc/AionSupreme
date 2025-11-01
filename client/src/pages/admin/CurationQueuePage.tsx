import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, X, Edit, Trash2, CheckSquare, History as HistoryIcon, Calendar, Clock, Image as ImageIcon, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { NamespaceSelector } from "@/components/agents/NamespaceSelector";
import { getNamespaceLabel } from "@shared/namespaces";

interface CurationItem {
  id: string;
  title: string;
  content: string;
  suggestedNamespaces: string[];
  tags: string[];
  status: "pending" | "approved" | "rejected";
  submittedBy?: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  note?: string;
  attachments?: Array<{
    type: "image" | "video" | "audio" | "document";
    url: string;
    filename: string;
    mimeType: string;
    size: number;
    description?: string;
  }>;
}

export default function CurationQueuePage() {
  const [selectedItem, setSelectedItem] = useState<CurationItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproveDialogOpen, setBulkApproveDialogOpen] = useState(false);
  const [approveAllDialogOpen, setApproveAllDialogOpen] = useState(false);
  const [bulkRejectDialogOpen, setBulkRejectDialogOpen] = useState(false);
  const [rejectAllDialogOpen, setRejectAllDialogOpen] = useState(false);
  const [bulkRejectNote, setBulkRejectNote] = useState("");
  
  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editNamespaces, setEditNamespaces] = useState<string[]>([]);
  const [editNote, setEditNote] = useState("");
  
  const { toast } = useToast();

  // Fetch pending items
  const { data: items, isLoading } = useQuery<CurationItem[]>({
    queryKey: ["/api/curation/pending"],
    queryFn: async () => {
      const res = await fetch("/api/curation/pending");
      if (!res.ok) throw new Error("Falha ao carregar fila de curadoria");
      return res.json();
    },
  });

  // Fetch history items (approved + rejected, 5-year retention)
  const { data: historyItems, isLoading: historyLoading } = useQuery<CurationItem[]>({
    queryKey: ["/api/curation/history"],
    queryFn: async () => {
      const res = await fetch("/api/curation/history");
      if (!res.ok) throw new Error("Falha ao carregar histórico");
      return res.json();
    },
  });

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; content: string; tags: string[]; suggestedNamespaces: string[]; note: string }) => {
      const res = await apiRequest("/api/curation/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
      toast({ title: "Item atualizado com sucesso!" });
      setEditDialogOpen(false);
      setSelectedItem(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar item", description: error.message, variant: "destructive" });
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("/api/curation/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reviewedBy: "admin" }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curation/history"] });
      toast({ title: "Item aprovado e publicado com sucesso!" });
      setApproveDialogOpen(false);
      setSelectedItem(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao aprovar item", description: error.message, variant: "destructive" });
    },
  });

  // Bulk approve mutation
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("/api/curation/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reviewedBy: "admin" }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curation/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", 1] });
      toast({ 
        title: `${data.approved} itens aprovados com sucesso!`,
        description: data.failed > 0 ? `${data.failed} itens falharam` : undefined
      });
      setBulkApproveDialogOpen(false);
      setSelectedIds(new Set());
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao aprovar itens", description: error.message, variant: "destructive" });
    },
  });

  // Generate AI descriptions for images mutation
  const generateDescriptionsMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(`/api/curation/${id}/generate-descriptions`, {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Atualiza selectedItem com item fresh retornado do backend
      if (data.item && selectedItem?.id === data.item.id) {
        setSelectedItem(data.item);
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
      toast({
        title: "Descrições geradas com sucesso!",
        description: `${data.processedImages} imagens processadas`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao gerar descrições",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Approve all mutation
  const approveAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/curation/approve-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedBy: "admin" }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curation/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", 1] });
      toast({ 
        title: `${data.approved} itens aprovados com sucesso!`,
        description: `Todos os itens pendentes foram aprovados e publicados na KB`
      });
      setApproveAllDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao aprovar todos os itens", description: error.message, variant: "destructive" });
    },
  });

  // Bulk reject mutation
  const bulkRejectMutation = useMutation({
    mutationFn: async (data: { ids: string[]; note: string }) => {
      const res = await apiRequest("/api/curation/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: data.ids, reviewedBy: "admin", note: data.note }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curation/history"] });
      toast({ 
        title: `${data.rejected} itens rejeitados com sucesso!`,
        description: data.failed > 0 ? `${data.failed} itens falharam` : undefined
      });
      setBulkRejectDialogOpen(false);
      setSelectedIds(new Set());
      setBulkRejectNote("");
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao rejeitar itens", description: error.message, variant: "destructive" });
    },
  });

  // Reject all mutation
  const rejectAllMutation = useMutation({
    mutationFn: async (note: string) => {
      const res = await apiRequest("/api/curation/reject-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedBy: "admin", note }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curation/history"] });
      toast({ 
        title: `${data.rejected} itens rejeitados com sucesso!`,
        description: `Todos os itens pendentes foram removidos da fila`
      });
      setRejectAllDialogOpen(false);
      setBulkRejectNote("");
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao rejeitar todos os itens", description: error.message, variant: "destructive" });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (data: { id: string; note: string }) => {
      const res = await apiRequest("/api/curation/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: data.id, reviewedBy: "admin", note: data.note }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curation/history"] });
      toast({ title: "Item rejeitado" });
      setRejectDialogOpen(false);
      setSelectedItem(null);
      setRejectNote("");
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao rejeitar item", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (item: CurationItem) => {
    setSelectedItem(item);
    setEditTitle(item.title);
    setEditContent(item.content);
    setEditTags(item.tags.join(", "));
    setEditNamespaces(item.suggestedNamespaces);
    setEditNote(item.note || "");
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedItem) return;
    
    editMutation.mutate({
      id: selectedItem.id,
      title: editTitle,
      content: editContent,
      tags: editTags.split(",").map(t => t.trim()).filter(Boolean),
      suggestedNamespaces: editNamespaces,
      note: editNote,
    });
  };

  const handleApprove = (item: CurationItem) => {
    setSelectedItem(item);
    setApproveDialogOpen(true);
  };

  const handleReject = (item: CurationItem) => {
    setSelectedItem(item);
    setRejectDialogOpen(true);
  };

  // Bulk selection handlers
  const toggleSelectItem = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items?.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items?.map(item => item.id) || []));
    }
  };

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) {
      toast({ title: "Selecione pelo menos um item", variant: "destructive" });
      return;
    }
    setBulkApproveDialogOpen(true);
  };

  const handleApproveAll = () => {
    setApproveAllDialogOpen(true);
  };

  const handleBulkReject = () => {
    if (selectedIds.size === 0) {
      toast({ title: "Selecione pelo menos um item", variant: "destructive" });
      return;
    }
    setBulkRejectDialogOpen(true);
  };

  const handleRejectAll = () => {
    setRejectAllDialogOpen(true);
  };

  if (isLoading) {
    return <div className="p-6">Carregando fila de curadoria...</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-full overflow-x-hidden">
      <div>
        <h1 className="text-3xl font-bold break-words">Fila de Curadoria</h1>
        <p className="text-muted-foreground mt-2 break-words">
          Revise e aprove conteúdo antes da publicação na Knowledge Base
        </p>
      </div>

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pendentes ({items?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <HistoryIcon className="h-4 w-4 mr-2" />
            Histórico ({historyItems?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4 mt-6">
          {!items || items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum item pendente de curadoria.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Bulk Actions */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedIds.size === items.length && items.length > 0}
                      onCheckedChange={toggleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                    <span className="text-sm font-medium">
                      {selectedIds.size === 0 ? 'Selecionar todos' : `${selectedIds.size} selecionados`}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="default"
                    onClick={handleBulkApprove}
                    disabled={selectedIds.size === 0}
                    data-testid="button-approve-selected"
                  >
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Aprovar Selecionadas ({selectedIds.size})
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleApproveAll}
                    data-testid="button-approve-all"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Aprovar Todas ({items.length})
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleBulkReject}
                    disabled={selectedIds.size === 0}
                    data-testid="button-reject-selected"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Rejeitar Selecionadas ({selectedIds.size})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRejectAll}
                    className="text-red-600 hover:text-red-700"
                    data-testid="button-reject-all"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Rejeitar Todas ({items.length})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items List */}
          <div className="grid gap-4">
            {items.map((item) => (
              <Card key={item.id} data-testid={`curation-item-${item.id}`}>
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedIds.has(item.id)}
                      onCheckedChange={() => toggleSelectItem(item.id)}
                      data-testid={`checkbox-item-${item.id}`}
                      className="mt-1"
                    />
                    <div className="flex items-start justify-between flex-1">
                      <div className="space-y-1 flex-1">
                        <CardTitle>{item.title}</CardTitle>
                        <CardDescription className="space-y-1">
                          <div className="flex items-center gap-2">
                            Enviado por {item.submittedBy || "Desconhecido"}
                          </div>
                          <div className="flex items-center gap-1 text-xs">
                            <Calendar className="h-3 w-3" />
                            {new Date(item.submittedAt).toLocaleDateString("pt-BR", { 
                              dateStyle: "long" 
                            })}
                            <Clock className="h-3 w-3 ml-2" />
                            {new Date(item.submittedAt).toLocaleTimeString("pt-BR", { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(item)}
                          data-testid={`button-edit-${item.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleApprove(item)}
                          className="text-green-600 hover:text-green-700"
                          data-testid={`button-approve-${item.id}`}
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Aprovar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReject(item)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-reject-${item.id}`}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Rejeitar
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground line-clamp-3">{item.content}</p>
                </div>

                {/* Image Preview Gallery */}
                {item.attachments && item.attachments.filter(a => a.type === "image").length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Imagens ({item.attachments.filter(a => a.type === "image").length})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {item.attachments.filter(a => a.type === "image").map((img, idx) => (
                        <div key={idx} className="relative group rounded-md overflow-hidden border border-border hover-elevate" data-testid={`image-preview-${idx}`}>
                          <img 
                            src={img.url} 
                            alt={img.description || img.filename}
                            className="w-full h-32 object-cover"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <a 
                              href={img.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-white text-xs flex items-center gap-1 hover:underline"
                              data-testid={`link-image-${idx}`}
                            >
                              <ExternalLink className="h-3 w-3" />
                              Ver original
                            </a>
                          </div>
                          {img.description && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 line-clamp-2">
                              {img.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium">Namespaces:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.suggestedNamespaces.map((ns) => (
                        <Badge key={ns} variant="secondary" className="font-mono text-xs">
                          {getNamespaceLabel(ns)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {item.tags.length > 0 && (
                    <div>
                      <span className="text-sm font-medium">Tags:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        </>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="dialog-edit-curation">
          <DialogHeader>
            <DialogTitle>Editar Item de Curadoria</DialogTitle>
            <DialogDescription>
              Ajuste título, tags e namespaces antes de aprovar
            </DialogDescription>
          </DialogHeader>

          {/* Área scrollável com altura máxima */}
          <div className="space-y-4 py-4 overflow-y-auto max-h-[60vh]">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Título</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                data-testid="input-edit-title"
              />
            </div>

            {/* Editar Conteúdo */}
            <div className="space-y-2">
              <Label htmlFor="edit-content">Conteúdo</Label>
              <div className="relative">
                <Textarea
                  id="edit-content"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[200px] max-h-[400px] font-mono text-xs"
                  data-testid="textarea-edit-content"
                />
                <Badge 
                  variant="secondary" 
                  className="absolute top-2 right-2 text-xs"
                >
                  {editContent.length.toLocaleString()} caracteres
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Edite o conteúdo extraído se necessário antes de aprovar
              </p>
            </div>

            {/* Image Preview in Edit Dialog */}
            {selectedItem?.attachments && selectedItem.attachments.filter(a => a.type === "image").length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Imagens Anexadas ({selectedItem.attachments.filter(a => a.type === "image").length})</Label>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => selectedItem && generateDescriptionsMutation.mutate(selectedItem.id)}
                    disabled={generateDescriptionsMutation.isPending}
                    data-testid="button-generate-descriptions"
                  >
                    {generateDescriptionsMutation.isPending ? "Gerando..." : "🤖 Gerar Descrições AI"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {selectedItem.attachments.filter(a => a.type === "image").map((img, idx) => (
                    <div key={idx} className="relative group rounded-md overflow-hidden border border-border">
                      <img 
                        src={img.url} 
                        alt={img.description || img.filename}
                        className="w-full h-24 object-cover"
                        loading="lazy"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1">
                        <p className="truncate">{img.filename}</p>
                        {img.description && img.description !== "Sem descrição" && (
                          <p className="text-[10px] text-green-400">✓ Descrição AI</p>
                        )}
                        <p className="text-[10px] opacity-70">{(img.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Todas as imagens serão indexadas junto com o conteúdo após aprovação
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-tags">Tags (separadas por vírgula)</Label>
              <Input
                id="edit-tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
                data-testid="input-edit-tags"
              />
            </div>

            <div className="space-y-2">
              <Label>Namespaces</Label>
              <NamespaceSelector 
                value={editNamespaces} 
                onChange={setEditNamespaces}
                allowWildcard={true}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-note">Nota (opcional)</Label>
              <Textarea
                id="edit-note"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Observações sobre este conteúdo"
                data-testid="input-edit-note"
              />
            </div>
          </div>

          {/* Botões fixos no rodapé - sempre visíveis */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={editMutation.isPending} data-testid="button-save-edit">
              {editMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent data-testid="dialog-approve-curation">
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar e Publicar</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja aprovar e publicar este conteúdo na Knowledge Base?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-approve">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && approveMutation.mutate(selectedItem.id)}
              disabled={approveMutation.isPending}
              data-testid="button-confirm-approve"
            >
              {approveMutation.isPending ? "Publicando..." : "Aprovar e Publicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent data-testid="dialog-reject-curation">
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar Item</AlertDialogTitle>
            <AlertDialogDescription>
              Por que este conteúdo está sendo rejeitado? (opcional)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Motivo da rejeição"
            className="my-4"
            data-testid="input-reject-note"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reject">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && rejectMutation.mutate({ id: selectedItem.id, note: rejectNote })}
              disabled={rejectMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? "Rejeitando..." : "Rejeitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Approve Dialog */}
      <AlertDialog open={bulkApproveDialogOpen} onOpenChange={setBulkApproveDialogOpen}>
        <AlertDialogContent data-testid="dialog-bulk-approve">
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar {selectedIds.size} Itens Selecionados</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja aprovar e publicar {selectedIds.size} itens na Knowledge Base?
              Todos serão indexados e disponibilizados para treinamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-approve">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkApproveMutation.mutate(Array.from(selectedIds))}
              disabled={bulkApproveMutation.isPending}
              data-testid="button-confirm-bulk-approve"
            >
              {bulkApproveMutation.isPending ? "Aprovando..." : `Aprovar ${selectedIds.size} Itens`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approve All Dialog */}
      <AlertDialog open={approveAllDialogOpen} onOpenChange={setApproveAllDialogOpen}>
        <AlertDialogContent data-testid="dialog-approve-all">
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar Todos os {items?.length} Itens</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>ATENÇÃO:</strong> Esta ação irá aprovar e publicar TODOS os {items?.length} itens pendentes na Knowledge Base.
              Todos serão indexados imediatamente e disponibilizados para treinamento quando atingir 100 exemplos.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-approve-all">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => approveAllMutation.mutate()}
              disabled={approveAllMutation.isPending}
              data-testid="button-confirm-approve-all"
              className="bg-primary"
            >
              {approveAllMutation.isPending ? "Aprovando..." : `Aprovar Todos (${items?.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Reject Dialog */}
      <AlertDialog open={bulkRejectDialogOpen} onOpenChange={setBulkRejectDialogOpen}>
        <AlertDialogContent data-testid="dialog-bulk-reject">
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar {selectedIds.size} Itens Selecionados</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja rejeitar {selectedIds.size} itens?
              Todos serão removidos da fila de curadoria permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={bulkRejectNote}
            onChange={(e) => setBulkRejectNote(e.target.value)}
            placeholder="Motivo da rejeição (opcional)"
            className="my-4"
            data-testid="input-bulk-reject-note"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-reject">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkRejectMutation.mutate({ ids: Array.from(selectedIds), note: bulkRejectNote })}
              disabled={bulkRejectMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-bulk-reject"
            >
              {bulkRejectMutation.isPending ? "Rejeitando..." : `Rejeitar ${selectedIds.size} Itens`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject All Dialog */}
      <AlertDialog open={rejectAllDialogOpen} onOpenChange={setRejectAllDialogOpen}>
        <AlertDialogContent data-testid="dialog-reject-all">
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar Todos os {items?.length} Itens</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>ATENÇÃO:</strong> Esta ação irá rejeitar e remover TODOS os {items?.length} itens pendentes da fila de curadoria.
              Nenhum conteúdo será publicado na Knowledge Base ou usado para treinamento.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={bulkRejectNote}
            onChange={(e) => setBulkRejectNote(e.target.value)}
            placeholder="Motivo da rejeição em massa (opcional)"
            className="my-4"
            data-testid="input-reject-all-note"
          />
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reject-all">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rejectAllMutation.mutate(bulkRejectNote)}
              disabled={rejectAllMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-reject-all"
            >
              {rejectAllMutation.isPending ? "Rejeitando..." : `Rejeitar Todos (${items?.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>

        <TabsContent value="history" className="space-y-4 mt-6">
          {historyLoading ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">Carregando histórico...</p>
              </CardContent>
            </Card>
          ) : !historyItems || historyItems.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">Nenhum item no histórico (retenção: 5 anos)</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {historyItems.map((item) => (
                <Card key={item.id} data-testid={`history-item-${item.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle>{item.title}</CardTitle>
                          <Badge 
                            variant={item.status === 'approved' ? 'default' : 'destructive'}
                            data-testid={`badge-status-${item.id}`}
                          >
                            {item.status === 'approved' ? 'Aprovado' : 'Rejeitado'}
                          </Badge>
                        </div>
                        <CardDescription className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-3 w-3" />
                            Enviado em {new Date(item.submittedAt).toLocaleDateString("pt-BR", { dateStyle: "long" })}
                            <Clock className="h-3 w-3" />
                            {new Date(item.submittedAt).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="text-sm">
                            Por {item.submittedBy || "Desconhecido"}
                          </div>
                          {item.reviewedBy && item.reviewedAt && (
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Clock className="h-3 w-3" />
                              {item.status === 'approved' ? 'Aprovado' : 'Rejeitado'} por {item.reviewedBy} em {new Date(item.reviewedAt).toLocaleDateString("pt-BR", { dateStyle: "medium" })} às {new Date(item.reviewedAt).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground line-clamp-3">{item.content}</p>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium">Namespaces:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.suggestedNamespaces.map((ns) => (
                            <Badge key={ns} variant="secondary" className="font-mono text-xs">
                              {getNamespaceLabel(ns)}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {item.tags.length > 0 && (
                        <div>
                          <span className="text-sm font-medium">Tags:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {item.note && (
                        <div>
                          <span className="text-sm font-medium">Nota:</span>
                          <p className="text-sm text-muted-foreground mt-1">{item.note}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
