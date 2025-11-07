import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
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
  MessageSquare,
  Calendar,
  Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Document } from "@shared/schema";
import { AionLogo } from "@/components/AionLogo";
import { NamespaceSelector } from "@/components/agents/NamespaceSelector";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { useLanguage } from "@/lib/i18n";

export default function KnowledgeBasePage() {
  useScrollToTop();
  const { toast } = useToast();
  const { t } = useLanguage();
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
  const [editNamespaces, setEditNamespaces] = useState<string[]>([]);
  const [newNamespaces, setNewNamespaces] = useState<string[]>([]);

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/admin/documents"],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/documents`);
      return res.json();
    },
  });

  const addTextMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTextTitle,
          content: newTextContent,
          source: "manual",
          metadata: { namespaces: newNamespaces },
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      setShowAddText(false);
      setNewTextTitle("");
      setNewTextContent("");
      setNewNamespaces([]);
      toast({ title: t.common.addedSuccess });
    },
  });

  const learnFromUrlMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/learn-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlToLearn,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      setShowAddUrl(false);
      setUrlToLearn("");
      toast({ title: t.common.addedSuccess });
    },
  });

  const webSearchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/web-search-learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      setShowWebSearch(false);
      setSearchQuery("");
      toast({ 
        title: `${data.documentsIndexed || 0} ${t.common.addedSuccess}`,
        description: `${t.common.search}: "${searchQuery}"`,
      });
    },
  });

  const updateDocMutation = useMutation({
    mutationFn: async ({ id, title, content, namespaces }: { id: number; title: string; content: string; namespaces?: string[] }) => {
      const res = await apiRequest(`/api/admin/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title, 
          content,
          metadata: { namespaces: namespaces || [] }
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      setEditingDoc(null);
      setEditNamespaces([]);
      toast({ title: t.common.updateSuccess });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/admin/documents/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      toast({ title: t.common.removedSuccess });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/10 max-w-full overflow-x-hidden">
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
            <AionLogo size="md" showText={false} />
            <div>
              <h1 className="text-xl font-bold gradient-text">Knowledge Base</h1>
              <p className="text-xs text-muted-foreground">Gerenciar conhecimentos do AION</p>
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
            Upload Arquivo(s)
          </Button>
          <input
            id="file-upload"
            type="file"
            accept=".pdf,.txt,.doc,.docx,.md,.xlsx,.xls,.png,.jpg,.jpeg,.gif,.webp"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;

              const formData = new FormData();
              
              Array.from(files).forEach(file => {
                formData.append("files", file);
              });

              toast({
                title: t.common.loading,
                description: `${t.common.processingFiles} ${files.length} ${t.common.files}...`,
              });

              try {
                const response = await fetch("/api/admin/upload-files", {
                  method: "POST",
                  body: formData,
                });

                const result = await response.json();

                if (response.ok) {
                  toast({
                    title: t.common.success,
                    description: `${result.processed} ${t.common.processedAndIndexed}`,
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
                } else {
                  toast({
                    title: t.common.error,
                    description: result.error || t.common.failedToProcess,
                    variant: "destructive",
                  });
                }
              } catch (error: any) {
                toast({
                  title: t.common.error,
                  description: error.message,
                  variant: "destructive",
                });
              }

              // Reset input
              e.target.value = "";
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
              
              {/* Namespace Selector - MOVIDO PARA CIMA! */}
              <div className="space-y-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                <label className="text-sm font-semibold text-primary">
                  🏷️ Namespaces (Multi-Agentes):
                </label>
                <NamespaceSelector
                  value={newNamespaces}
                  onChange={setNewNamespaces}
                />
                <p className="text-xs text-muted-foreground">
                  Selecione quais agentes terão acesso a este conhecimento
                </p>
              </div>
              
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
                {addTextMutation.isPending ? t.common.saving : t.common.save}
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
                            placeholder="Título do conhecimento"
                            data-testid={`input-edit-title-${doc.id}`}
                          />
                          
                          <NamespaceSelector
                            value={editNamespaces}
                            onChange={setEditNamespaces}
                            allowWildcard={true}
                          />
                          
                          <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="min-h-[100px]"
                            placeholder="Conteúdo do conhecimento"
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
                                  namespaces: editNamespaces,
                                })
                              }
                              disabled={updateDocMutation.isPending}
                              data-testid={`button-save-edit-${doc.id}`}
                            >
                              <Save className="w-4 h-4 mr-2" />
                              {updateDocMutation.isPending ? t.common.saving : t.common.save}
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
                            <div className="flex flex-wrap gap-2 mt-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Fonte: {doc.source || "manual"}</span>
                                <span>•</span>
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(doc.createdAt).toLocaleDateString("pt-BR", { dateStyle: "medium" })}</span>
                                <Clock className="w-3 h-3" />
                                <span>{new Date(doc.createdAt).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              {(doc.metadata as any)?.namespaces && (doc.metadata as any).namespaces.length > 0 && (
                                <>
                                  <span className="text-xs text-muted-foreground">•</span>
                                  <div className="flex gap-1">
                                    {(doc.metadata as any).namespaces.map((ns: string, idx: number) => (
                                      <Badge key={idx} variant="outline" className="text-xs h-5">
                                        {ns}
                                      </Badge>
                                    ))}
                                  </div>
                                </>
                              )}
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
                                setEditNamespaces((doc.metadata as any)?.namespaces || []);
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
