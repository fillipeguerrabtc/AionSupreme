import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Image as ImageIcon, Video, FileText, Globe } from "lucide-react";
import { useState } from "react";
import { WebContentDisplay } from "./WebContentDisplay";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  type?: "image" | "video" | "webpage" | "text";
  thumbnail?: string;
}

interface SearchResultsListProps {
  results: SearchResult[];
  query: string;
  source?: "web";
}

export function SearchResultsList({ results, query, source = "web" }: SearchResultsListProps) {
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  if (results.length === 0) {
    return (
      <Card className="p-6 text-center border-primary/20" data-testid="search-no-results">
        <p className="text-muted-foreground">Nenhum resultado encontrado para "{query}"</p>
      </Card>
    );
  }

  // If a result is selected, show it in full
  if (selectedResult) {
    return (
      <div data-testid="search-selected-result">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Exibindo: {selectedResult.title}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedResult(null)}
            data-testid="button-back-to-results"
          >
            ← Voltar aos resultados
          </Button>
        </div>
        <WebContentDisplay
          url={selectedResult.url}
          title={selectedResult.title}
          type={selectedResult.type}
          content={selectedResult.snippet}
        />
      </div>
    );
  }

  // Show results list
  return (
    <div className="space-y-3" data-testid="search-results-list">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {results.length} resultado{results.length !== 1 ? 's' : ''} para "{query}"
        </h3>
      </div>

      {/* Results Grid */}
      <div className="grid gap-3">
        {results.map((result, index) => {
          const resultType = result.type || detectResultType(result.url, result.title);
          
          return (
            <Card
              key={index}
              className="p-4 hover-elevate cursor-pointer border-primary/20"
              onClick={() => setSelectedResult(result)}
              data-testid={`search-result-${index}`}
            >
              <div className="flex gap-3">
                {/* Icon/Thumbnail */}
                <div className="flex-shrink-0">
                  {result.thumbnail ? (
                    <img
                      src={result.thumbnail}
                      alt={result.title}
                      className="w-16 h-16 rounded object-cover"
                      data-testid={`thumbnail-${index}`}
                    />
                  ) : (
                    <div className="w-16 h-16 rounded bg-primary/5 flex items-center justify-center">
                      {resultType === "image" && <ImageIcon className="w-6 h-6 text-primary" />}
                      {resultType === "video" && <Video className="w-6 h-6 text-primary" />}
                      {resultType === "text" && <FileText className="w-6 h-6 text-primary" />}
                      {resultType === "webpage" && <Globe className="w-6 h-6 text-primary" />}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-sm line-clamp-1" data-testid={`title-${index}`}>
                      {result.title}
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(result.url, '_blank');
                      }}
                      data-testid={`button-open-${index}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </div>
                  
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1" data-testid={`snippet-${index}`}>
                    {result.snippet}
                  </p>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-muted-foreground truncate" data-testid={`url-${index}`}>
                      {getHostname(result.url)}
                    </span>
                    {resultType !== "webpage" && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {resultType}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function detectResultType(url: string, title: string): "image" | "video" | "text" | "webpage" {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();
  
  // Image extensions or image-related keywords
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(lowerUrl) || 
      /(image|photo|picture|img)/i.test(lowerTitle)) {
    return "image";
  }
  
  // Video extensions or video-related keywords
  if (/\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(lowerUrl) || 
      /(video|watch|youtube|vimeo)/i.test(lowerUrl) ||
      /(video|vídeo)/i.test(lowerTitle)) {
    return "video";
  }
  
  // Text/Document extensions
  if (/\.(pdf|doc|docx|txt|md|xlsx|pptx)$/i.test(lowerUrl) ||
      /(document|pdf|file|download)/i.test(lowerTitle)) {
    return "text";
  }
  
  return "webpage";
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
