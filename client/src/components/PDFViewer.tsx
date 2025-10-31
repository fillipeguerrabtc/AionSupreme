import { useState } from "react";
import { FileText, Download, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PDFViewerProps {
  url: string;
  filename?: string;
  size?: number;
}

export function PDFViewer({ url, filename = "document.pdf", size }: PDFViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  return (
    <div className="glass-premium rounded-lg p-4 border border-primary/20 hover-elevate transition-all">
      <div className="flex items-start gap-3">
        <div className="glass p-3 rounded-lg">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-foreground truncate" data-testid="pdf-filename">
            {filename}
          </h4>
          {size && (
            <p className="text-xs text-muted-foreground mt-1">
              PDF • {formatSize(size)}
            </p>
          )}
          
          <div className="flex items-center gap-2 mt-3">
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="sm" 
                  variant="default"
                  className="gap-1.5"
                  data-testid="button-pdf-preview"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Visualizar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-5xl w-[95vw] h-[90vh] p-0">
                <DialogHeader className="px-6 py-4 border-b">
                  <DialogTitle className="flex items-center justify-between">
                    <span className="truncate">{filename}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setIsOpen(false)}
                      data-testid="button-close-pdf"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </DialogTitle>
                </DialogHeader>
                
                <iframe
                  src={`${url}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
                  className="w-full flex-1"
                  style={{ height: "calc(90vh - 80px)" }}
                  title={filename}
                  data-testid="iframe-pdf"
                />
              </DialogContent>
            </Dialog>
            
            <Button 
              size="sm" 
              variant="outline"
              asChild
              className="gap-1.5"
            >
              <a 
                href={url} 
                download={filename}
                data-testid="button-pdf-download"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
