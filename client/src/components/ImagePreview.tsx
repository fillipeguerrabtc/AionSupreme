import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface ImagePreviewProps {
  url: string;
  title?: string;
}

export function ImagePreview({ url, title }: ImagePreviewProps) {
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
  };

  const handleImageClick = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async () => {
    try {
      // Use proxy to avoid CORS issues
      const proxyUrl = `/api/media/proxy?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = url.split('/').pop() || 'image.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Falha ao baixar imagem. Tente abrir em nova aba.');
    }
  };

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-border glass group relative" data-testid="image-preview">
      <img 
        src={url} 
        alt={title || "Image from search"}
        className="w-full max-h-96 object-contain cursor-pointer hover-elevate transition-all"
        onError={handleImageError}
        onClick={handleImageClick}
        loading="lazy"
        data-testid="image-preview-img"
      />
      {title && (
        <div className="p-2 text-xs text-muted-foreground bg-card/50">
          {title}
        </div>
      )}
      
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="icon"
          variant="default"
          className="h-8 w-8 shadow-lg"
          onClick={handleDownload}
          data-testid="button-download-image"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
