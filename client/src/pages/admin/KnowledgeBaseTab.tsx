import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
  Image as ImageIcon,
  Youtube
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { formatDateTimeInTimezone } from "@/lib/datetime";
import type { Document } from "@shared/schema";
import { NamespaceSelector } from "@/components/agents/NamespaceSelector";
import { Badge } from "@/components/ui/badge";

export default function KnowledgeBaseTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [showAddText, setShowAddText] = useState(false);
  const [showAddUrl, setShowAddUrl] = useState(false);
  const [showAddYoutube, setShowAddYoutube] = useState(false);
  const [showWebSearch, setShowWebSearch] = useState(false);
  const [newTextTitle, setNewTextTitle] = useState("");
  const [newTextContent, setNewTextContent] = useState("");
  const [urlToLearn, setUrlToLearn] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubeNamespace, setYoutubeNamespace] = useState<string[]>(["kb/youtube"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingDoc, setEditingDoc] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editNamespaces, setEditNamespaces] = useState<string[]>([]);
  const [newNamespaces, setNewNamespaces] = useState<string[]>([]);
  const [deleteDocId, setDeleteDocId] = useState<number | null>(null);
  const [showImages, setShowImages] = useState(false);
  const [deleteImageFilename, setDeleteImageFilename] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [showBulkDeleteImages, setShowBulkDeleteImages] = useState(false);

  // Fetch system timezone for dynamic date formatting (single-tenant system)
  const { data: systemTimezone } = useQuery<{ timezone: string }>({
    queryKey: ["/api/admin/settings/timezone"],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/settings/timezone`);
      return res.json();
    },
  });
  const timezone = systemTimezone?.timezone || "America/Sao_Paulo";

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/admin/documents"],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/documents`);
      return res.json();
    },
  });

  // Fetch learned images
  interface LearnedImage {
    filename: string;
    path: string;
    size: number;
    createdAt: string;
    modifiedAt: string;
  }

  const { data: images = [], isLoading: imagesLoading } = useQuery<LearnedImage[]>({
    queryKey: ["/api/admin/images"],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/images`);
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
      toast({ title: t.admin.knowledgeBase.toasts.knowledgeAdded });
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
      toast({ title: t.admin.knowledgeBase.toasts.urlContentLearned });
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
        title: t.admin.knowledgeBase.toasts.webSearchSuccess.replace('{{count}}', String(data.documentsIndexed || 0)),
        description: t.admin.knowledgeBase.toasts.searchLabel + ` "${searchQuery}"`,
      });
    },
  });

  const learnFromYoutubeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/learn-from-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: youtubeUrl,
          namespace: youtubeNamespace[0] || "kb/youtube",
          title: youtubeTitle || undefined,
        }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curation"] });
      setShowAddYoutube(false);
      setYoutubeUrl("");
      setYoutubeTitle("");
      setYoutubeNamespace(["kb/youtube"]);
      toast({ 
        title: "[PT]",
        description: `${data.stats?.wordCount || 0} palavras extraídas do vídeo`,
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
          ...(namespaces && { metadata: { namespaces } })
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      setEditingDoc(null);
      toast({ title: t.admin.knowledgeBase.toasts.documentUpdated });
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
      toast({ title: t.admin.knowledgeBase.toasts.documentRemoved });
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: async (filename: string) => {
      await apiRequest(`/api/admin/images/${filename}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/images"] });
      setDeleteImageFilename(null);
      toast({ title: t.common.removedSuccess });
    },
  });

  const bulkDeleteImagesMutation = useMutation({
    mutationFn: async (filenames: string[]) => {
      await Promise.all(
        filenames.map((filename) =>
          apiRequest(`/api/admin/images/${filename}`, { method: "DELETE" })
        )
      );
      return filenames.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/images"] });
      toast({
        title: "[PT]",
        description: `${count} imagens removidas com sucesso`,
      });
      setSelectedImages(new Set());
      setShowBulkDeleteImages(false);
    },
    onError: (error: Error) => {
      toast({
        title: "[PT]",
        description: error.message,
        variant: "destructive",
      });
      setShowBulkDeleteImages(false);
    },
  });

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Action Buttons */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Button
          onClick={() => setShowAddText(!showAddText)}
          className="bg-gradient-to-r from-primary to-accent hover:scale-105 active:scale-95 transition-all duration-300"
          data-testid="button-add-text"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t.admin.knowledgeBase.actions.addText}
        </Button>

        <Button
          onClick={() => setShowAddUrl(!showAddUrl)}
          variant="secondary"
          className="hover:scale-105 active:scale-95 transition-all duration-300"
          data-testid="button-learn-url"
        >
          <LinkIcon className="w-4 h-4 mr-2" />
          {t.admin.knowledgeBase.actions.learnFromUrl}
        </Button>

        <Button
          onClick={() => setShowAddYoutube(!showAddYoutube)}
          variant="secondary"
          className="flex items-center gap-2"
          data-testid="button-learn-youtube"
        >
          <Youtube className="w-4 h-4 mr-2" />
          YouTube
        </Button>

        <Button
          onClick={() => setShowWebSearch(!showWebSearch)}
          variant="secondary"
          className="hover:scale-105 active:scale-95 transition-all duration-300"
          data-testid="button-web-search"
        >
          <Globe className="w-4 h-4 mr-2" />
          {t.admin.knowledgeBase.actions.searchWeb}
        </Button>

        <Button
          onClick={() => document.getElementById('file-upload')?.click()}
          variant="secondary"
          className="hover:scale-105 active:scale-95 transition-all duration-300"
          data-testid="button-upload-file"
        >
          <Upload className="w-4 h-4 mr-2" />
          {t.admin.knowledgeBase.actions.uploadFiles}
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
              title: t.admin.knowledgeBase.toasts.uploadingFiles,
              description: t.admin.knowledgeBase.toasts.processingFiles.replace('{{count}}', String(files.length)),
            });

            try {
              const response = await fetch("/api/admin/upload-files", {
                method: "POST",
                body: formData,
              });

              const result = await response.json();

              if (response.ok) {
                toast({
                  title: t.admin.knowledgeBase.toasts.uploadCompleted,
                  description: t.admin.knowledgeBase.toasts.filesProcessed.replace('{{count}}', String(result.processed)),
                });
                queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
              } else {
                toast({
                  title: t.admin.knowledgeBase.toasts.uploadError,
                  description: result.error || t.admin.knowledgeBase.toasts.processingFailed,
                  variant: "destructive",
                });
              }
            } catch (error: any) {
              toast({
                title: t.admin.knowledgeBase.toasts.error,
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
              <span className="gradient-text">{t.admin.knowledgeBase.forms.addText.title}</span>
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
              placeholder={t.admin.knowledgeBase.forms.addText.titlePlaceholder}
              value={newTextTitle}
              onChange={(e) => setNewTextTitle(e.target.value)}
              data-testid="input-new-doc-title"
            />
            
            <NamespaceSelector
              value={newNamespaces}
              onChange={setNewNamespaces}
              allowWildcard={true}
            />
            
            <Textarea
              placeholder={t.admin.knowledgeBase.forms.addText.contentPlaceholder}
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
              {addTextMutation.isPending ? t.admin.knowledgeBase.forms.addText.saving : t.admin.knowledgeBase.forms.addText.save}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Learn from URL Form */}
      {showAddUrl && (
        <Card className="flex items-center gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="gradient-text-vibrant">{t.admin.knowledgeBase.forms.learnUrl.title}</span>
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
              {t.admin.knowledgeBase.forms.learnUrl.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder={t.admin.knowledgeBase.forms.learnUrl.urlPlaceholder}
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
              {learnFromUrlMutation.isPending ? t.admin.knowledgeBase.forms.learnUrl.learning : t.admin.knowledgeBase.forms.learnUrl.learnFromThisUrl}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Learn from YouTube Form */}
      {showAddYoutube && (
        <Card className="flex items-center gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="gradient-text-vibrant">"[TEXTO]"</span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowAddYoutube(false)}
                data-testid="button-close-learn-youtube"
              >
                <X className="w-4 h-4" />
              </Button>
            </CardTitle>
            <CardDescription>"[TEXTO]"</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="[PT]"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              data-testid="input-youtube-url"
            />
            <Input
              placeholder="[PT]"
              value={youtubeTitle}
              onChange={(e) => setYoutubeTitle(e.target.value)}
              data-testid="input-youtube-title"
            />
            <NamespaceSelector
              value={youtubeNamespace}
              onChange={setYoutubeNamespace}
              allowWildcard={false}
            />
            <Button
              onClick={() => learnFromYoutubeMutation.mutate()}
              disabled={!youtubeUrl || learnFromYoutubeMutation.isPending}
              className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600"
              data-testid="button-start-learn-youtube"
            >
              <Youtube className="w-4 h-4 mr-2" />
              {learnFromYoutubeMutation.isPending ? "[PT]" : "[PT]"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Web Search Form */}
      {showWebSearch && (
        <Card className="flex items-center gap-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="gradient-text-vibrant">{t.admin.knowledgeBase.forms.webSearch.title}</span>
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
              {t.admin.knowledgeBase.forms.webSearch.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder={t.admin.knowledgeBase.forms.webSearch.searchPlaceholder}
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
              {webSearchMutation.isPending ? t.admin.knowledgeBase.forms.webSearch.searching : t.admin.knowledgeBase.forms.webSearch.searchAndLearn}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Documents | Images */}
      <Tabs defaultValue="documents" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="documents" data-testid="tab-documents">
            <FileText className="w-4 h-4 mr-2" />
            {t.admin.knowledgeBase.documents.title} ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="images" data-testid="tab-images">
            <ImageIcon className="w-4 h-4 mr-2" />
            Imagens ({images.length})
          </TabsTrigger>
        </TabsList>

        {/* Documents Tab Content */}
        <TabsContent value="documents">
          <Card className="flex items-center gap-2">
            <CardHeader>
              <CardTitle className="gradient-text">{t.admin.knowledgeBase.documents.title}</CardTitle>
              <CardDescription>
                {t.admin.knowledgeBase.documents.subtitle}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-2">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">{t.admin.knowledgeBase.states.loading}</div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t.admin.knowledgeBase.states.noDocuments}
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
                            data-testid={`button-save-edit-${doc.id}`}
                          >
                            <Save className="w-4 h-4 mr-2" />
                            {t.admin.knowledgeBase.documents.save}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingDoc(null)}
                            data-testid={`button-cancel-edit-${doc.id}`}
                          >
                            {t.admin.knowledgeBase.documents.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <h3 className="flex items-center gap-2">{doc.title}</h3>
                          
                          {/* Exibir namespaces como badges */}
                          {doc.metadata?.namespaces && doc.metadata.namespaces.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {doc.metadata.namespaces.map((ns: string) => (
                                <Badge 
                                  key={ns} 
                                  variant={ns === "*" ? "default" : "secondary"}
                                  className="text-xs"
                                  data-testid={`badge-namespace-${ns}`}
                                >
                                  {ns === "*" ? "🌟 TODOS (Acesso Total)" : `🏷️ ${ns}`}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {doc.content}
                          </p>
                          <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                            <span>{t.admin.knowledgeBase.documents.source} {doc.source || "manual"}</span>
                            <span>•</span>
                            <span>{formatDateTimeInTimezone(doc.createdAt, timezone, { format: 'short' })}</span>
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
                              setEditNamespaces(doc.metadata?.namespaces || []);
                            }}
                            data-testid={`button-edit-${doc.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleteDocId(doc.id)}
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
    </TabsContent>

    {/* Images Tab Content */}
    <TabsContent value="images">
      <Card className="flex items-center gap-2">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Imagens Aprendidas
              </CardTitle>
              <CardDescription>
                Todas as imagens baixadas e processadas pelo sistema
              </CardDescription>
            </div>
            {selectedImages.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteImages(true)}
                data-testid="button-element"
              >
                <Trash2 className="w-4 h-4 mr-2" />"[TEXTO]"{selectedImages.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            {imagesLoading ? (
              <div className="text-center py-8 text-muted-foreground">"[TEXTO]"</div>
            ) : images.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Nenhuma imagem encontrada</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {images.map((image) => {
                  const isSelected = selectedImages.has(image.filename);
                  return (
                    <div 
                      key={image.filename}
                      className={`group relative bg-card border rounded-lg overflow-hidden hover-elevate transition-all ${
                        isSelected ? 'ring-2 ring-primary' : ''
                      }`}
                    >
                      <div className="absolute top-2 left-2 z-10">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            const newSelected = new Set(selectedImages);
                            if (checked) {
                              newSelected.add(image.filename);
                            } else {
                              newSelected.delete(image.filename);
                            }
                            setSelectedImages(newSelected);
                          }}
                          className="bg-background/80 backdrop-blur-sm"
                          data-testid={`checkbox-image-${image.filename}`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <img
                          src={image.path}
                          alt={image.filename}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="p-2 space-y-1">
                        <p className="text-xs font-medium truncate" title={image.filename}>
                          {image.filename}
                        </p>
                        <div className="flex items-center gap-2">
                          <span>{(image.size / 1024).toFixed(1)}KB</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setDeleteImageFilename(image.filename)}
                            data-testid={`button-delete-image-${image.filename}`}
                          >
                            <Trash2 className="flex items-center gap-2" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </TabsContent>
  </Tabs>

      {/* Delete Image Confirmation Dialog */}
      <AlertDialog open={!!deleteImageFilename} onOpenChange={(open) => !open && setDeleteImageFilename(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>"[TEXTO]"</AlertDialogTitle>
            <AlertDialogDescription>"[TEXTO]"</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-element">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteImageFilename) {
                  deleteImageMutation.mutate(deleteImageFilename);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-element"
            >"[TEXTO]"</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Images Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteImages} onOpenChange={setShowBulkDeleteImages}>
        <AlertDialogContent className="flex items-center gap-2">
          <AlertDialogHeader>
            <AlertDialogTitle>"[TEXTO]"</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {selectedImages.size} "[PT]"
                                      </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-element">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const filenamesToDelete = Array.from(selectedImages);
                if (filenamesToDelete.length > 0) {
                  bulkDeleteImagesMutation.mutate(filenamesToDelete);
                }
              }}
              disabled={bulkDeleteImagesMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-element"
            >
              {bulkDeleteImagesMutation.isPending ? t.common.deleting : t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDocId} onOpenChange={(open) => !open && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>"[TEXTO]"</AlertDialogTitle>
            <AlertDialogDescription>"[TEXTO]"</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-element">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteDocId) {
                  deleteDocMutation.mutate(deleteDocId);
                  setDeleteDocId(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-element"
            >"[TEXTO]"</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
