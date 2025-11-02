import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Search, Image as ImageIcon, Trash2, ExternalLink, FileImage } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/i18n";

interface ImageSearchResult {
  id: number;
  filename: string;
  mimeType: string;
  storageUrl: string;
  description: string;
  metadata: any;
  createdAt: string;
  similarity: number;
}

export default function ImageSearchPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ImageSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Lista todas as imagens indexadas
  const { data: allImages, isLoading: isLoadingAll } = useQuery<{ images: any[]; total: number }>({
    queryKey: ["/api/kb/images"],
    queryFn: async () => {
      const res = await apiRequest("/api/kb/images?limit=50");
      const data = await res.json();
      return data.data;
    },
  });

  // Busca semântica
  const searchMutation = useMutation({
    mutationFn: async (query: string) => {
      setIsSearching(true);
      const res = await apiRequest("/api/kb/images/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 20 }),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSearchResults(data.data.results);
      setIsSearching(false);
      toast({
        title: `${data.data.results.length} ${t.admin.imageSearch.imagesFound} "${searchQuery}"`,
        description: `${t.admin.imageSearch.search}: "${searchQuery}"`,
      });
    },
    onError: (error: any) => {
      setIsSearching(false);
      toast({
        title: t.admin.imageSearch.searchError,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Deletar imagem
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/kb/images/${id}`, {
        method: "DELETE",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kb/images"] });
      toast({ title: t.admin.imageSearch.removed });
    },
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery);
    }
  };

  const displayImages = searchResults.length > 0 ? searchResults : (allImages?.images || []);

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">{t.admin.imageSearch.title}</h1>
          <p className="text-sm text-muted-foreground">
            {t.admin.imageSearch.subtitle}
          </p>
        </div>
        <Badge variant="secondary" data-testid="badge-total-images">
          {allImages?.total || 0} {t.admin.imageSearch.imagesIndexed}
        </Badge>
      </div>

      {/* Search Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t.admin.imageSearch.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
                data-testid="input-image-search"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isSearching}
              data-testid="button-search-images"
            >
              {isSearching ? t.admin.imageSearch.searching : t.admin.imageSearch.search}
            </Button>
            {searchResults.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchResults([]);
                  setSearchQuery("");
                }}
                data-testid="button-clear-search"
              >
                {t.admin.imageSearch.clear}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            {searchResults.length > 0 ? t.admin.imageSearch.results : t.admin.imageSearch.allImages}
          </CardTitle>
          <CardDescription>
            {searchResults.length > 0
              ? `${searchResults.length} ${t.admin.imageSearch.imagesFound} "${searchQuery}"`
              : `${allImages?.total || 0} ${t.admin.imageSearch.imagesInKb}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            {isLoadingAll ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-muted-foreground">{t.admin.imageSearch.loading}</p>
              </div>
            ) : displayImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileImage className="w-16 h-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">{t.admin.imageSearch.noImages}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  {searchQuery
                    ? t.admin.imageSearch.noImagesDesc
                    : t.admin.imageSearch.uploadPrompt}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayImages.map((image) => (
                  <Card key={image.id} className="overflow-hidden hover-elevate" data-testid={`card-image-${image.id}`}>
                    <div className="aspect-video bg-muted relative">
                      <img
                        src={`/${image.storageUrl}`}
                        alt={image.description}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23666' width='400' height='300'/%3E%3Ctext fill='%23fff' x='50%25' y='50%25' text-anchor='middle' dy='.3em'%3EImagem não disponível%3C/text%3E%3C/svg%3E";
                        }}
                      />
                      {image.similarity && (
                        <Badge
                          variant="secondary"
                          className="absolute top-2 right-2"
                          data-testid={`badge-similarity-${image.id}`}
                        >
                          {(image.similarity * 100).toFixed(0)}% match
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <p className="text-sm font-medium truncate" title={image.filename}>
                          {image.filename}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-3">
                          {image.description || image.extractedText || "Sem descrição"}
                        </p>
                        <div className="flex items-center justify-between pt-2">
                          <Badge variant="outline" className="text-xs">
                            {image.mimeType}
                          </Badge>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => window.open(`/${image.storageUrl}`, "_blank")}
                              data-testid={`button-view-${image.id}`}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                if (confirm(t.admin.imageSearch.confirmRemove)) {
                                  deleteMutation.mutate(image.id);
                                }
                              }}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-${image.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
