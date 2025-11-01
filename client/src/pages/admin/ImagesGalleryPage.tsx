import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Image as ImageIcon, Download, ExternalLink, Filter, Grid3x3, List, Trash2, CheckSquare, Square, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ImageItem {
  id: string;
  filename: string;
  url: string;
  source: 'crawler' | 'chat' | 'document';
  size: number;
  mimeType: string;
  createdAt: string;
  description?: string;
  documentId?: string;
  documentTitle?: string;
  namespace?: string;
}

interface ImagesResponse {
  total: number;
  sources: {
    crawler: number;
    chat: number;
    document: number;
  };
  images: ImageItem[];
}

interface Document {
  id: number;
  content: string;
  source: string;
  status: string;
  namespace: string;
  tags: string[];
  createdAt: string;
  attachments?: any[];
}

interface Namespace {
  id: string;
  name: string;
  displayName: string | null;
  description: string | null;
}

export default function ImagesGalleryPage() {
  const { toast } = useToast();
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [namespaceFilter, setNamespaceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingImage, setEditingImage] = useState<ImageItem | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [selectedTab, setSelectedTab] = useState<'images' | 'kb'>('images');
  
  // Multi-select state
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: imagesData, isLoading: imagesLoading } = useQuery<ImagesResponse>({
    queryKey: ["/api/admin/images/all"],
  });

  const { data: documentsData, isLoading: documentsLoading } = useQuery<Document[]>({
    queryKey: ["/api/admin/documents"],
  });

  const { data: namespacesData } = useQuery<Namespace[]>({
    queryKey: ["/api/admin/namespaces"],
  });

  // Filtered images
  const filteredImages = imagesData?.images.filter(img => {
    const matchesSource = sourceFilter === 'all' || img.source === sourceFilter;
    const matchesNamespace = namespaceFilter === 'all' || img.namespace === namespaceFilter;
    const matchesSearch = searchQuery === '' || 
      img.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (img.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (img.documentTitle?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
      (img.namespace?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesSource && matchesNamespace && matchesSearch;
  }) || [];

  // Filter KB documents (only indexed ones)
  const kbDocuments = documentsData?.filter(doc => doc.status === 'indexed') || [];

  const updateDescriptionMutation = useMutation({
    mutationFn: async ({ img, description }: { img: ImageItem; description: string }) => {
      const docId = img.documentId;
      const attachmentIndex = img.id.split('-').pop();
      
      const response = await apiRequest(`/api/admin/documents/${docId}/attachments/${attachmentIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao atualizar descrição');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Descrição atualizada",
        description: "A descrição da imagem foi atualizada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/images/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      setEditingImage(null);
      setEditDescription('');
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (imageIds: string[]) => {
      const response = await apiRequest('/api/admin/images', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageIds }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao deletar imagens');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Imagens deletadas",
        description: `${data.deleted} imagem(ns) deletada(s) com sucesso`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/images/all"] });
      setSelectedImages(new Set());
      setShowDeleteDialog(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao deletar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSelectAll = () => {
    if (selectedImages.size === filteredImages.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(filteredImages.map(img => img.id)));
    }
  };

  const handleToggleImage = (imageId: string) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(imageId)) {
      newSelected.delete(imageId);
    } else {
      newSelected.add(imageId);
    }
    setSelectedImages(newSelected);
  };

  const handleDeleteSelected = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate(Array.from(selectedImages));
  };

  const getSourceBadge = (source: string) => {
    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      crawler: { label: 'Web Crawler', variant: 'default' },
      chat: { label: 'Chat Upload', variant: 'secondary' },
      document: { label: 'Knowledge Base', variant: 'outline' }
    };
    return variants[source] || { label: source, variant: 'outline' };
  };

  if (imagesLoading || documentsLoading) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gerenciar Conteúdo</h1>
        <p className="text-muted-foreground mt-2">
          Imagens e documentos aprovados da Knowledge Base
        </p>
      </div>

      {/* Main Tabs */}
      <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as 'images' | 'kb')}>
        <TabsList className="grid w-full max-w-md grid-cols-2" data-testid="tabs-content-type">
          <TabsTrigger value="images" data-testid="tab-images">
            <ImageIcon className="h-4 w-4 mr-2" />
            Imagens ({imagesData?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="kb" data-testid="tab-kb">
            <Badge className="mr-2" variant="outline">KB</Badge>
            Documentos ({kbDocuments.length})
          </TabsTrigger>
        </TabsList>

        {/* IMAGES TAB */}
        <TabsContent value="images" className="space-y-6 mt-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Total de Imagens</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{imagesData?.total || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Web Crawler</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{imagesData?.sources.crawler || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Chat Uploads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{imagesData?.sources.chat || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Knowledge Base</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{imagesData?.sources.document || 0}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters & Actions */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col gap-4">
                {/* Search & Filter Row */}
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto flex-wrap">
                    <div className="flex-1 sm:max-w-xs">
                      <Input
                        placeholder="Buscar por nome, descrição, namespace..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        data-testid="input-search-images"
                      />
                    </div>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-source-filter">
                        <SelectValue placeholder="Todas as fontes" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as fontes</SelectItem>
                        <SelectItem value="crawler">Web Crawler</SelectItem>
                        <SelectItem value="chat">Chat Upload</SelectItem>
                        <SelectItem value="document">Knowledge Base</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={namespaceFilter} onValueChange={setNamespaceFilter}>
                      <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-namespace-filter">
                        <SelectValue placeholder="Todos os namespaces" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os namespaces</SelectItem>
                        {namespacesData?.map(ns => (
                          <SelectItem key={ns.id} value={ns.name}>
                            {ns.displayName || ns.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={viewMode === 'grid' ? 'default' : 'outline'}
                      size="icon"
                      onClick={() => setViewMode('grid')}
                      data-testid="button-view-grid"
                    >
                      <Grid3x3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'outline'}
                      size="icon"
                      onClick={() => setViewMode('list')}
                      data-testid="button-view-list"
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Selection Actions Row */}
                {filteredImages.length > 0 && (
                  <div className="flex items-center justify-between gap-4 pt-3 border-t">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                        data-testid="button-select-all"
                      >
                        {selectedImages.size === filteredImages.length ? (
                          <>
                            <CheckSquare className="h-4 w-4 mr-2" />
                            Desselecionar todas
                          </>
                        ) : (
                          <>
                            <Square className="h-4 w-4 mr-2" />
                            Selecionar todas
                          </>
                        )}
                      </Button>
                      {selectedImages.size > 0 && (
                        <span className="text-sm text-muted-foreground">
                          {selectedImages.size} selecionada(s)
                        </span>
                      )}
                    </div>
                    {selectedImages.size > 0 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteSelected}
                        data-testid="button-delete-selected"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Deletar selecionadas ({selectedImages.size})
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results Count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Mostrando {filteredImages.length} de {imagesData?.total || 0} imagens
            </p>
          </div>

          {/* Images Gallery */}
          {filteredImages.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery || sourceFilter !== 'all' 
                    ? 'Nenhuma imagem encontrada com os filtros aplicados' 
                    : 'Nenhuma imagem aprovada ainda'}
                </p>
              </CardContent>
            </Card>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredImages.map((img) => (
                <Card 
                  key={img.id} 
                  className="group hover-elevate overflow-hidden relative"
                  data-testid={`image-card-${img.id}`}
                >
                  {/* Selection Checkbox */}
                  <div 
                    className="absolute top-2 left-2 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={selectedImages.has(img.id)}
                      onCheckedChange={() => handleToggleImage(img.id)}
                      className="bg-background/80 backdrop-blur-sm"
                      data-testid={`checkbox-image-${img.id}`}
                    />
                  </div>
                  
                  <div 
                    className="relative aspect-square cursor-pointer"
                    onClick={() => setSelectedImage(img)}
                  >
                    <img
                      src={img.url}
                      alt={img.description || img.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute top-2 right-2">
                      <Badge variant={getSourceBadge(img.source).variant} className="text-xs">
                        {getSourceBadge(img.source).label}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <p className="text-xs truncate font-medium">{img.filename}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <p className="text-[10px] text-muted-foreground">
                        {(img.size / 1024).toFixed(1)} KB
                      </p>
                      {img.namespace && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {img.namespace}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredImages.map((img) => (
                <Card 
                  key={img.id}
                  className="hover-elevate"
                  data-testid={`image-row-${img.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedImages.has(img.id)}
                          onCheckedChange={() => handleToggleImage(img.id)}
                          data-testid={`checkbox-image-${img.id}`}
                        />
                      </div>
                      <img
                        src={img.url}
                        alt={img.description || img.filename}
                        className="w-20 h-20 object-cover rounded-md cursor-pointer"
                        loading="lazy"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedImage(img);
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{img.filename}</p>
                        {img.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                            {img.description}
                          </p>
                        )}
                        {img.documentTitle && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {img.documentTitle}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant={getSourceBadge(img.source).variant}>
                          {getSourceBadge(img.source).label}
                        </Badge>
                        {img.namespace && (
                          <Badge variant="outline" className="font-mono">
                            {img.namespace}
                          </Badge>
                        )}
                        <p className="text-sm text-muted-foreground whitespace-nowrap">
                          {(img.size / 1024).toFixed(1)} KB
                        </p>
                        {img.documentId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingImage(img);
                              setEditDescription(img.description || '');
                            }}
                            data-testid={`button-edit-description-${img.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* KNOWLEDGE BASE TAB */}
        <TabsContent value="kb" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Documentos Indexados</CardTitle>
              <CardDescription>
                {kbDocuments.length} documento(s) aprovado(s) e disponível(is) na Knowledge Base
              </CardDescription>
            </CardHeader>
            <CardContent>
              {kbDocuments.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">
                    Nenhum documento aprovado na Knowledge Base ainda
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {kbDocuments.map((doc) => (
                    <Card key={doc.id} className="hover-elevate" data-testid={`kb-doc-${doc.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary" className="font-mono">
                                {doc.namespace}
                              </Badge>
                              <Badge variant="outline">{doc.source}</Badge>
                            </div>
                            <p className="text-sm line-clamp-3 text-muted-foreground">
                              {doc.content.substring(0, 200)}...
                            </p>
                            {doc.tags && doc.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {doc.tags.map((tag, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {doc.attachments && doc.attachments.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {doc.attachments.length} imagem(ns) anexada(s)
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Image Detail Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col" data-testid="dialog-image-detail">
          <DialogHeader>
            <DialogTitle>{selectedImage?.filename}</DialogTitle>
            <DialogDescription>
              <Badge variant={selectedImage ? getSourceBadge(selectedImage.source).variant : 'outline'}>
                {selectedImage ? getSourceBadge(selectedImage.source).label : ''}
              </Badge>
            </DialogDescription>
          </DialogHeader>

          {selectedImage && (
            <div className="space-y-4 overflow-y-auto flex-1">
              {/* Image Preview */}
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img
                  src={selectedImage.url}
                  alt={selectedImage.description || selectedImage.filename}
                  className="w-full h-auto max-h-[500px] object-contain mx-auto"
                />
              </div>

              {/* Image Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Tamanho:</span> {(selectedImage.size / 1024).toFixed(1)} KB
                </div>
                <div>
                  <span className="font-medium">Tipo:</span> {selectedImage.mimeType}
                </div>
                <div className="col-span-2">
                  <span className="font-medium">Data:</span>{' '}
                  {new Date(selectedImage.createdAt).toLocaleString('pt-BR')}
                </div>
                {selectedImage.description && (
                  <div className="col-span-2">
                    <span className="font-medium">Descrição AI:</span>
                    <p className="text-muted-foreground mt-1">{selectedImage.description}</p>
                  </div>
                )}
                {selectedImage.documentTitle && (
                  <div className="col-span-2">
                    <span className="font-medium">Documento:</span>
                    <p className="text-muted-foreground mt-1">{selectedImage.documentTitle}</p>
                  </div>
                )}
                {selectedImage.namespace && (
                  <div className="col-span-2">
                    <span className="font-medium">Namespace:</span>
                    <Badge variant="secondary" className="ml-2 font-mono">
                      {selectedImage.namespace}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button variant="outline" asChild className="flex-1">
                  <a href={selectedImage.url} target="_blank" rel="noopener noreferrer" data-testid="button-open-new-tab">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir em nova aba
                  </a>
                </Button>
                <Button variant="outline" asChild className="flex-1">
                  <a href={selectedImage.url} download={selectedImage.filename} data-testid="button-download">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a deletar {selectedImages.size} imagem(ns). Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Deletar {selectedImages.size} imagem(ns)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Description Dialog */}
      <Dialog open={!!editingImage} onOpenChange={() => setEditingImage(null)}>
        <DialogContent data-testid="dialog-edit-description">
          <DialogHeader>
            <DialogTitle>Editar Descrição</DialogTitle>
            <DialogDescription>
              Edite a descrição gerada por IA para esta imagem
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Digite a nova descrição da imagem..."
                rows={4}
                data-testid="textarea-edit-description"
              />
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setEditingImage(null)}
                data-testid="button-cancel-edit"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => editingImage && updateDescriptionMutation.mutate({ 
                  img: editingImage, 
                  description: editDescription 
                })}
                disabled={updateDescriptionMutation.isPending}
                data-testid="button-save-description"
              >
                {updateDescriptionMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
