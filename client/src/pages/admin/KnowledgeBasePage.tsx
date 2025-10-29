import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Database, 
  Upload, 
  FileText, 
  Trash2, 
  Edit2, 
  Search, 
  Link as LinkIcon,
  Globe,
  Save,
  X,
  Plus,
  MessageSquare
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Document } from "@shared/schema";

export default function KnowledgeBasePage() {
  const { toast } = useToast();
  const [tenantId] = useState(1);
  const [showAddText, setShowAddText] = useState(false);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [showWebSearch, setShowWebSearch] = useState(false);
  const [newTextTitle, setNewTextTitle] = useState("");
  const [newTextContent, setNewTextContent] = useState("");
  const [urlToLearn, setUrlToLearn] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingDoc, setEditingDoc] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/admin/documents", tenantId],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/documents/${tenantId}`);
      return res.json();
    },
  });

  const addTextMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          title: newTextTitle,
          content: newTextContent,
          source: "manual",
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", tenantId] });
      setShowAddText(false);
      setNewTextTitle("");
      setNewTextContent("");
      toast({ title: "Conhecimento adicionado com sucesso!" });
    },
  });

  const learnFromUrlMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/learn-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          url: urlToLearn,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", tenantId] });
      setShowAddUrl(false);
      setUrlToLearn("");
      toast({ title: "Conteúdo do link aprendido com sucesso!" });
    },
  });

  const webSearchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/web-search-learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          query: searchQuery,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", tenantId] });
      setShowWebSearch(false);
      setSearchQuery("");
      toast({ 
        title: `${data.documentsIndexed || 0} novos conhecimentos adicionados!`,
        description: `Pesquisa: "${searchQuery}"`,
      });
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, title, content }: { id: number; title: string; content: string }) => {
      const res = await apiRequest(`/api/admin/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", tenantId] });
      setEditingDoc(null);
      toast({ title: "Documento atualizado!" });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/admin/documents/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", tenantId] });
      toast({ title: "Documento removido!" });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10">
      <header className="glass sticky top-0 z-50 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => window.location.href = "/admin"}
              className="glass-premium"
              data-testid="button-back-to-admin"
            >
              <MessageSquare className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-full blur-lg opacity-50" />
                <div className="relative glass-premium p-2 rounded-full">
                  <Database className="w-6 h-6 text-primary" />
                </div>
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">Knowledge Base</h1>
                <p className="text-xs text-muted-foreground">Gerenciar conhecimentos do AION</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Action Buttons */}
        <div className="grid gap-4 md:grid-cols-4">
          <Button
            onClick={() => setShowAddText(!showAddText)}
            className="bg-gradient-to-r from-primary to-accent hover:scale-105 active:scale-95 transition-all duration-300"
            data-testid="button-add-text"
          >
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Texto
          </Button>

          <Button
            onClick={() => setShowAddUrl(!showAddUrl)}
            variant="secondary"
            className="hover:scale-105 active:scale-95 transition-all duration-300"
            data-testid="button-learn-url"
          >
            <LinkIcon className="w-4 h-4 mr-2" />
            Aprender de Link
          </Button>

          <Button
            onClick={() => setShowWebSearch(!showWebSearch)}
            variant="secondary"
            className="hover:scale-105 active:scale-95 transition-all duration-300"
            data-testid="button-web-search"
          >
            <Globe className="w-4 h-4 mr-2" />
            Pesquisar Web
          </Button>

          <Button
            onClick={() => document.getElementById('file-upload')?.click()}
            variant="secondary"
            className="hover:scale-105 active:scale-95 transition-all duration-300"
            data-testid="button-upload-file"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Arquivo
          </Button>
          <input
            id="file-upload"
            type="file"
            accept=".pdf,.txt,.doc,.docx,.md"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                toast({ 
                  title: "Em desenvolvimento",
                  description: "Upload de arquivos será implementado em breve!",
                });
              }
            }}
          />
        </div>

        {/* Add Text Form */}
        {showAddText && (
          <Card className="glass-premium border-primary/20 animate-slide-up">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="gradient-text">Adicionar Novo Conhecimento</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowAddText(false)}
                  data-testid="button-close-add-text"
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Título do conhecimento..."
                value={newTextTitle}
                onChange={(e) => setNewTextTitle(e.target.value)}
                data-testid="input-new-doc-title"
              />
              <Textarea
                placeholder="Escreva o conteúdo aqui..."
                value={newTextContent}
                onChange={(e) => setNewTextContent(e.target.value)}
                className="min-h-[200px]"
                data-testid="textarea-new-doc-content"
              />
              <Button
                onClick={() => addTextMutation.mutate()}
                disabled={!newTextTitle || !newTextContent || addTextMutation.isPending}
                className="bg-gradient-to-r from-primary to-accent"
                data-testid="button-save-new-doc"
              >
                <Save className="w-4 h-4 mr-2" />
                {addTextMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Learn from URL Form */}
        {showAddUrl && (
          <Card className="glass-premium border-accent/20 animate-slide-up">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="gradient-text-vibrant">Aprender de um Link</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowAddUrl(false)}
                  data-testid="button-close-learn-url"
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
              <CardDescription>
                AION vai acessar o link e aprender todo o conteúdo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="https://example.com/artigo"
                value={urlToLearn}
                onChange={(e) => setUrlToLearn(e.target.value)}
                data-testid="input-url-to-learn"
              />
              <Button
                onClick={() => learnFromUrlMutation.mutate()}
                disabled={!urlToLearn || learnFromUrlMutation.isPending}
                className="bg-gradient-to-r from-accent to-primary"
                data-testid="button-start-learn-url"
              >
                <LinkIcon className="w-4 h-4 mr-2" />
                {learnFromUrlMutation.isPending ? "Aprendendo..." : "Aprender deste Link"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Web Search Form */}
        {showWebSearch && (
          <Card className="glass-premium border-accent/20 animate-slide-up">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="gradient-text-vibrant">Pesquisar e Aprender da Web</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowWebSearch(false)}
                  data-testid="button-close-web-search"
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
              <CardDescription>
                AION vai pesquisar na internet e indexar todo o conteúdo encontrado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Ex: Machine Learning fundamentals"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-query"
              />
              <Button
                onClick={() => webSearchMutation.mutate()}
                disabled={!searchQuery || webSearchMutation.isPending}
                className="bg-gradient-to-r from-accent to-primary"
                data-testid="button-start-web-search"
              >
                <Search className="w-4 h-4 mr-2" />
                {webSearchMutation.isPending ? "Pesquisando..." : "Pesquisar e Aprender"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Documents List */}
        <Card className="glass-premium border-primary/20">
          <CardHeader>
            <CardTitle className="gradient-text">Conhecimentos Armazenados ({documents.length})</CardTitle>
            <CardDescription>
              Gerenciar todos os conhecimentos da Knowledge Base
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                ) : documents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum conhecimento encontrado. Adicione novos conhecimentos acima!
                  </div>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-4 rounded-lg bg-card/50 border border-border/50 hover-elevate"
                    >
                      {editingDoc === doc.id ? (
                        <div className="space-y-3">
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            data-testid={`input-edit-title-${doc.id}`}
                          />
                          <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="min-h-[100px]"
                            data-testid={`textarea-edit-content-${doc.id}`}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() =>
                                updateDocMutation.mutate({
                                  id: doc.id,
                                  title: editTitle,
                                  content: editContent,
                                })
                              }
                              data-testid={`button-save-edit-${doc.id}`}
                            >
                              <Save className="w-4 h-4 mr-2" />
                              Salvar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingDoc(null)}
                              data-testid={`button-cancel-edit-${doc.id}`}
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-sm mb-1">{doc.title}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {doc.content}
                            </p>
                            <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                              <span>Fonte: {doc.source || "manual"}</span>
                              <span>•</span>
                              <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingDoc(doc.id);
                                setEditTitle(doc.title);
                                setEditContent(doc.content);
                              }}
                              data-testid={`button-edit-${doc.id}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (window.confirm("Remover este conhecimento?")) {
                                  deleteDocMutation.mutate(doc.id);
                                }
                              }}
                              data-testid={`button-delete-${doc.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
