import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Image, Video, FileText, Play } from "lucide-react";

interface MediaOption {
  type: "image" | "video" | "document";
  url: string;
  filename: string;
  mimeType: string;
  title?: string;
  description?: string;
  thumbnail?: string;
}

interface MediaSelectorProps {
  options: MediaOption[];
  onSelect: (option: MediaOption) => void;
}

export function MediaSelector({ options, onSelect }: MediaSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const getIcon = (type: string) => {
    switch (type) {
      case "image":
        return <Image className="w-5 h-5 text-primary" />;
      case "video":
        return <Video className="w-5 h-5 text-primary" />;
      case "document":
        return <FileText className="w-5 h-5 text-primary" />;
      default:
        return <FileText className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const handleSelect = (index: number) => {
    setSelectedIndex(index);
    onSelect(options[index]);
  };

  if (options.length === 0) {
    return null;
  }

  // Se houver apenas 1 opção, selecione automaticamente
  if (options.length === 1) {
    if (selectedIndex === null) {
      setTimeout(() => handleSelect(0), 0);
    }
    return null;
  }

  return (
    <div className="my-4 space-y-3" data-testid="media-selector">
      <div className="text-sm font-medium text-foreground">
        🎯 Encontrei {options.length} opções. Escolha qual deseja visualizar:
      </div>
      
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((option, index) => (
          <Card
            key={index}
            className={`
              p-4 cursor-pointer transition-all hover-elevate active-elevate-2
              ${selectedIndex === index ? "ring-2 ring-primary bg-accent/10" : ""}
            `}
            onClick={() => handleSelect(index)}
            data-testid={`media-option-${index}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {getIcon(option.type)}
              </div>
              
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-sm font-medium truncate text-foreground">
                  {option.title || option.filename}
                </div>
                
                {option.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {option.description}
                  </div>
                )}
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{option.type}</span>
                  {option.type === "video" && (
                    <Play className="w-3 h-3" />
                  )}
                </div>
              </div>
            </div>
            
            {selectedIndex === index && (
              <div className="mt-3 pt-3 border-t border-border">
                <Button size="sm" variant="default" className="w-full" data-testid="button-view-media">
                  Visualizar
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
