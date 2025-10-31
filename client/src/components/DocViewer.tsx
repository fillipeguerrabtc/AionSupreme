import { FileText, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocViewerProps {
  url: string;
  filename?: string;
  mimeType: string;
  size?: number;
}

export function DocViewer({ url, filename = "document", mimeType, size }: DocViewerProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  const getFileIcon = () => {
    if (mimeType.includes('word') || mimeType.includes('document')) {
      return { icon: FileText, color: "text-blue-500", label: "DOCX" };
    }
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) {
      return { icon: FileText, color: "text-orange-500", label: "PPT" };
    }
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return { icon: FileText, color: "text-green-500", label: "XLSX" };
    }
    return { icon: FileText, color: "text-primary", label: "DOC" };
  };
  
  const { icon: Icon, color, label } = getFileIcon();
  
  // Google Docs Viewer URL for previewing Office documents
  const previewUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  
  return (
    <div className="glass-premium rounded-lg p-4 border border-primary/20 hover-elevate transition-all">
      <div className="flex items-start gap-3">
        <div className="glass p-3 rounded-lg">
          <Icon className={`w-6 h-6 ${color}`} />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-foreground truncate" data-testid="doc-filename">
            {filename}
          </h4>
          <p className="text-xs text-muted-foreground mt-1">
            {label} {size && `• ${formatSize(size)}`}
          </p>
          
          <div className="flex items-center gap-2 mt-3">
            <Button 
              size="sm" 
              variant="default"
              asChild
              className="gap-1.5"
            >
              <a 
                href={previewUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                data-testid="button-doc-preview"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Visualizar
              </a>
            </Button>
            
            <Button 
              size="sm" 
              variant="outline"
              asChild
              className="gap-1.5"
            >
              <a 
                href={url} 
                download={filename}
                data-testid="button-doc-download"
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
