import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";
import { formatDateTimeInTimezone } from "@/lib/datetime";
import type { Document } from "@shared/schema";
import { NamespaceSelector } from "@/components/agents/NamespaceSelector";

export default function KnowledgeBaseTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
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
  const [editNamespaces, setEditNamespaces] = useState<string[]>([]);
  const [newNamespaces, setNewNamespaces] = useState<string[]>([]);

  // Fetch tenant timezone for dynamic date formatting
  const { data: tenantTimezone } = useQuery<{ timezone: string }>({
    queryKey: ["/api/admin/settings/timezone", tenantId],
    queryFn: async () => {
      const res = await apiRequest(`/api/admin/settings/timezone/${tenantId}`);
      return res.json();
    },
  });
  const timezone = tenantTimezone?.timezone || "America/Sao_Paulo";

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
          metadata: { namespaces: newNamespaces },
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", tenantId] });
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
      toast({ title: t.admin.knowledgeBase.toasts.urlContentLearned });
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
        title: t.admin.knowledgeBase.toasts.webSearchSuccess.replace('{{count}}', String(data.documentsIndexed || 0)),
        description: t.admin.knowledgeBase.toasts.searchLabel + ` "${searchQuery}"`,
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", tenantId] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents", tenantId] });
      toast({ title: t.admin.knowledgeBase.toasts.documentRemoved });
    },
  });

  return (
    <div className="space-y-6">
      {/* Action Buttons */}
      <div className="grid gap-4 md:grid-cols-4">
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
            formData.append("tenant_id", "1");
            
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
                queryClient.invalidateQueries({ queryKey: ["/api/admin/documents/1"] });
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
        <Card className="glass-premium border-primary/20 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
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
        <Card className="glass-premium border-accent/20 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
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

      {/* Web Search Form */}
      {showWebSearch && (
        <Card className="glass-premium border-accent/20 animate-slide-up">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
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

      {/* Documents List */}
      <Card className="glass-premium border-primary/20">
        <CardHeader>
          <CardTitle className="gradient-text">{t.admin.knowledgeBase.documents.title} ({documents.length})</CardTitle>
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
                    className="p-4 rounded-lg bg-card/50 border border-border/50 hover-elevate"
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
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm mb-1">{doc.title}</h3>
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
                            onClick={() => {
                              if (window.confirm(t.admin.knowledgeBase.documents.confirmDelete)) {
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
  );
}
