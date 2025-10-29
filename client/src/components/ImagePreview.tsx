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

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-border glass" data-testid="image-preview">
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
    </div>
  );
}
