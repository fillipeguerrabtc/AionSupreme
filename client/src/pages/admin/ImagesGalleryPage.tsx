import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Image as ImageIcon, Download, ExternalLink, Filter, Grid3x3, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

export default function ImagesGalleryPage() {
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading } = useQuery<ImagesResponse>({
    queryKey: ["/api/admin/images/all"],
  });

  // Filtered images
  const filteredImages = data?.images.filter(img => {
    const matchesSource = sourceFilter === 'all' || img.source === sourceFilter;
    const matchesSearch = searchQuery === '' || 
      img.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      img.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      img.documentTitle?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSource && matchesSearch;
  }) || [];

  const getSourceBadge = (source: string) => {
    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
      crawler: { label: 'Web Crawler', variant: 'default' },
      chat: { label: 'Chat Upload', variant: 'secondary' },
      document: { label: 'Knowledge Base', variant: 'outline' }
    };
    return variants[source] || { label: source, variant: 'outline' };
  };

  if (isLoading) {
    return <div className="p-6">Carregando galeria de imagens...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Galeria Universal de Imagens</h1>
        <p className="text-muted-foreground mt-2">
          Todas as imagens aprovadas de todas as fontes
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total de Imagens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Web Crawler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.sources.crawler || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Chat Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.sources.chat || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Knowledge Base</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.sources.document || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:w-auto">
              <div className="flex-1 sm:max-w-xs">
                <Input
                  placeholder="Buscar por nome, descrição..."
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
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mostrando {filteredImages.length} de {data?.total || 0} imagens
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
              className="group hover-elevate cursor-pointer overflow-hidden"
              onClick={() => setSelectedImage(img)}
              data-testid={`image-card-${img.id}`}
            >
              <div className="relative aspect-square">
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
                <p className="text-[10px] text-muted-foreground mt-1">
                  {(img.size / 1024).toFixed(1)} KB
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredImages.map((img) => (
            <Card 
              key={img.id}
              className="hover-elevate cursor-pointer"
              onClick={() => setSelectedImage(img)}
              data-testid={`image-row-${img.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <img
                    src={img.url}
                    alt={img.description || img.filename}
                    className="w-20 h-20 object-cover rounded-md"
                    loading="lazy"
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
                        📄 {img.documentTitle}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={getSourceBadge(img.source).variant}>
                      {getSourceBadge(img.source).label}
                    </Badge>
                    <p className="text-sm text-muted-foreground whitespace-nowrap">
                      {(img.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
    </div>
  );
}
