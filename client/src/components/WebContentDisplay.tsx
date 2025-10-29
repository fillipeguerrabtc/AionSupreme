import { ExternalLink, Image as ImageIcon, Video, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface WebContentProps {
  url: string;
  title?: string;
  type?: "image" | "video" | "text" | "webpage";
  content?: string;
}

export function WebContentDisplay({ url, title, type, content }: WebContentProps) {
  // Auto-detect type from URL if not provided
  const detectedType = type || detectContentType(url);
  
  return (
    <Card className="my-3 overflow-hidden border-primary/20 hover-elevate" data-testid="web-content-display">
      {/* Header */}
      <div className="bg-primary/5 px-4 py-2 border-b border-primary/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {detectedType === "image" && <ImageIcon className="w-4 h-4 text-primary" />}
          {detectedType === "video" && <Video className="w-4 h-4 text-primary" />}
          {detectedType === "text" && <FileText className="w-4 h-4 text-primary" />}
          {detectedType === "webpage" && <ExternalLink className="w-4 h-4 text-primary" />}
          <span className="text-sm font-medium">{title || getHostname(url)}</span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => window.open(url, '_blank')}
          className="text-xs"
          data-testid="button-open-url"
        >
          Open <ExternalLink className="w-3 h-3 ml-1" />
        </Button>
      </div>

      {/* Content */}
      <div className="p-4">
        {detectedType === "image" && (
          <div className="flex justify-center">
            <img 
              src={url} 
              alt={title || "Web image"} 
              className="max-w-full max-h-96 rounded-md object-contain"
              data-testid="img-web-content"
            />
          </div>
        )}
        
        {detectedType === "video" && (
          <video 
            src={url} 
            controls 
            className="w-full max-h-96 rounded-md"
            data-testid="video-web-content"
          >
            Your browser does not support the video tag.
          </video>
        )}
        
        {detectedType === "text" && content && (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="whitespace-pre-wrap text-sm" data-testid="text-web-content">
              {content.slice(0, 500)}
              {content.length > 500 && "..."}
            </p>
          </div>
        )}
        
        {detectedType === "webpage" && (
          <div className="space-y-2">
            {content && (
              <p className="text-sm text-muted-foreground line-clamp-3" data-testid="text-snippet">
                {content}
              </p>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate" data-testid="text-url">{url}</span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function detectContentType(url: string): "image" | "video" | "text" | "webpage" {
  const lowerUrl = url.toLowerCase();
  
  // Image
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(lowerUrl)) {
    return "image";
  }
  
  // Video
  if (/\.(mp4|webm|ogg|mov|avi|mkv)$/i.test(lowerUrl)) {
    return "video";
  }
  
  // Text
  if (/\.(txt|md|json|xml|csv)$/i.test(lowerUrl)) {
    return "text";
  }
  
  // Default to webpage
  return "webpage";
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Web Content";
  }
}
