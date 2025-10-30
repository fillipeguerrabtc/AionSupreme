import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, X, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
}

export default function CurationQueuePage() {
  const [selectedItem, setSelectedItem] = useState<CurationItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  
  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editNamespaces, setEditNamespaces] = useState<string[]>([]);
  const [editNote, setEditNote] = useState("");
  
  const { toast } = useToast();

  // Fetch pending items
  const { data: items, isLoading } = useQuery<CurationItem[]>({
    queryKey: ["/api/curation/pending"],
    queryFn: async () => {
      const res = await fetch("/api/curation/pending", {
        headers: { "x-tenant-id": "1" },
      });
      if (!res.ok) throw new Error("Falha ao carregar fila de curadoria");
      return res.json();
    },
  });

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; tags: string[]; suggestedNamespaces: string[]; note: string }) => {
      const res = await apiRequest("/api/curation/edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": "1" },
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
        headers: { "Content-Type": "application/json", "x-tenant-id": "1" },
        body: JSON.stringify({ id, reviewedBy: "admin" }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
      toast({ title: "Item aprovado e publicado com sucesso!" });
      setApproveDialogOpen(false);
      setSelectedItem(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao aprovar item", description: error.message, variant: "destructive" });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (data: { id: string; note: string }) => {
      const res = await apiRequest("/api/curation/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": "1" },
        body: JSON.stringify({ id: data.id, reviewedBy: "admin", note: data.note }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curation/pending"] });
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

  if (isLoading) {
    return <div className="p-6">Carregando fila de curadoria...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Fila de Curadoria</h1>
        <p className="text-muted-foreground mt-2">
          Revise e aprove conteúdo antes da publicação na Knowledge Base
        </p>
      </div>

      {!items || items.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Nenhum item pendente de curadoria.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {items.map((item) => (
            <Card key={item.id} data-testid={`curation-item-${item.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <CardTitle>{item.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2">
                      Enviado por {item.submittedBy || "Desconhecido"} •{" "}
                      {new Date(item.submittedAt).toLocaleDateString("pt-BR")}
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-edit-curation">
          <DialogHeader>
            <DialogTitle>Editar Item de Curadoria</DialogTitle>
            <DialogDescription>
              Ajuste título, tags e namespaces antes de aprovar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Título</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                data-testid="input-edit-title"
              />
            </div>

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
              <NamespaceSelector value={editNamespaces} onChange={setEditNamespaces} />
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

          <div className="flex justify-end gap-2">
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
    </div>
  );
}
