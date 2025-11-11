import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
import { useLocation } from "wouter";
import { CascadeDeleteDialog } from "@/components/admin/CascadeDeleteDialog";

export default function KnowledgeBasePage() {
  useScrollToTop();
  const [location] = useLocation();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  // Scroll ScrollArea to top when page loads
  useEffect(() => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = 0;
      }
    }
  }, [location]);
  const { toast } = useToast();
  const { t } = useLanguage();
  const [showAddText, setShowAddText] = useState(false);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [showWebSearch, setShowWebSearch] = useState(false);
  const [newTextTitle, setNewTextTitle] = useState("");
  const [newTextContent, setNewTextContent] = useState("");
  const [urlToLearn, setUrlToLearn] = useState("");
  const [crawlMode, setCrawlMode] = useState<"single" | "deep">("single");
  const [downloadMedia, setDownloadMedia] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingDoc, setEditingDoc] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editNamespaces, setEditNamespaces] = useState<string[]>([]);
  const [newNamespaces, setNewNamespaces] = useState<string[]>([]);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);

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
          mode: crawlMode,
          downloadMedia: downloadMedia,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      setShowAddUrl(false);
      setUrlToLearn("");
      setCrawlMode("single");
      setDownloadMedia(false);
      
      // ✅ Show warning if protocol was auto-added
      if (data.warning) {
        toast({ 
          title: t.common.addedSuccess,
          description: `${data.warning} - ${data.normalizedUrl}`
        });
      } else {
        toast({ title: t.common.addedSuccess });
      }
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

  // Removed legacy deleteDocMutation - now using CascadeDeleteDialog
  // which calls POST /api/admin/cascade/delete/:documentId instead

  return (
    <div className="flex items-center gap-2">
      <header className="flex items-center gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => window.location.href = "/admin"}
              className="flex items-center gap-2"
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
            <LinkIcon className="w-4 h-4 mr-2" />{t.common.loading}</Button>

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
          <Card className="flex items-center gap-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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
                placeholder="[PT]"
                value={newTextTitle}
                onChange={(e) => setNewTextTitle(e.target.value)}
                data-testid="input-new-doc-title"
              />
              
              {/* Namespace Selector - MOVIDO PARA CIMA! */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-semibold text-primary">
                  🏷️ Namespaces (Multi-Agentes):
                </label>
                <NamespaceSelector
                  value={newNamespaces}
                  onChange={setNewNamespaces}
                />
                <p className="text-xs text-muted-foreground">{t.common.loading}</p>
              </div>
              
              <Textarea
                placeholder="[PT]"
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
          <Card className="flex items-center gap-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="gradient-text-vibrant">{t.common.loading}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowAddUrl(false)}
                  data-testid="button-close-learn-url"
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardTitle>
              <CardDescription>{t.common.loading}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="[PT]"
                value={urlToLearn}
                onChange={(e) => setUrlToLearn(e.target.value)}
                data-testid="input-url-to-learn"
              />
              
              <div className="flex items-center gap-2">
                <Label className="text-sm font-semibold">{t.common.loading}</Label>
                <RadioGroup
                  value={crawlMode}
                  onValueChange={(value) => setCrawlMode(value as "single" | "deep")}
                  data-testid="test-id"
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="single" id="single" data-testid="radio-single-page" />
                    <Label htmlFor="single" className="cursor-pointer font-normal">{t.common.loading}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="deep" id="deep" data-testid="test-id" />
                    <Label htmlFor="deep" className="cursor-pointer font-normal">{t.common.loading}</Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div className="flex items-center gap-2">
                <Checkbox
                  id="download-media"
                  checked={downloadMedia}
                  onCheckedChange={(checked) => setDownloadMedia(checked as boolean)}
                  data-testid="checkbox-download-media"
                />
                <Label
                  htmlFor="download-media"
                  className="cursor-pointer font-normal text-sm"
                >{t.common.loading}</Label>
              </div>
              
              <Button
                onClick={() => learnFromUrlMutation.mutate()}
                disabled={!urlToLearn || learnFromUrlMutation.isPending}
                className="bg-gradient-to-r from-accent to-primary"
                data-testid="button-start-learn-url"
              >
                <LinkIcon className="w-4 h-4 mr-2" />
                {learnFromUrlMutation.isPending ? "[PT]" : "[PT]"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Web Search Form */}
        {showWebSearch && (
          <Card className="flex items-center gap-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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
              <CardDescription>{t.common.loading}</CardDescription>
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
                {webSearchMutation.isPending ? "Pesquisando..." : "[PT]"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Documents List */}
        <Card className="flex items-center gap-2">
          <CardHeader>
            <CardTitle className="gradient-text">Conhecimentos Armazenados ({documents.length})</CardTitle>
            <CardDescription>
              Gerenciar todos os conhecimentos da Knowledge Base
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea ref={scrollAreaRef} className="h-[600px]">
              <div className="space-y-2">
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">{t.common.loading}</div>
                ) : documents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum conhecimento encontrado. Adicione novos conhecimentos acima!
                  </div>
                ) : (
                  documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2"
                    >
                      {editingDoc === doc.id ? (
                        <div className="space-y-3">
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            placeholder="[PT]"
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
                            placeholder="[PT]"
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
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <h3 className="flex items-center gap-2">{doc.title}</h3>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {doc.content}
                            </p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              <div className="flex items-center gap-2">
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
                              onClick={() => setDocumentToDelete(doc)}
                              data-testid={`button-delete-${doc.id}`}
                            >
                              <Trash2 className="flex items-center gap-2" />
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

      {/* CASCADE DELETE DIALOG - Enterprise deletion with impact preview */}
      <CascadeDeleteDialog
        document={documentToDelete}
        open={!!documentToDelete}
        onClose={() => setDocumentToDelete(null)}
        onDeleted={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
          setDocumentToDelete(null);
        }}
      />
    </div>
  );
}
