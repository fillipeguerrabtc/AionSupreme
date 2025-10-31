import { ImagePreview } from "./ImagePreview";
import { VideoPreview } from "./VideoPreview";
import { PDFViewer } from "./PDFViewer";
import { DocViewer } from "./DocViewer";
import { FileAudio, Download } from "lucide-react";
import { Button } from "./ui/button";

interface Attachment {
  type: "image" | "video" | "audio" | "document";
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface AttachmentsRendererProps {
  attachments: Attachment[];
}

export function AttachmentsRenderer({ attachments }: AttachmentsRendererProps) {
  if (!attachments || attachments.length === 0) return null;
  
  return (
    <div className="space-y-2 mt-3">
      {attachments.map((att, idx) => {
        // IMAGE
        if (att.type === "image" || att.mimeType.startsWith("image/")) {
          return (
            <ImagePreview 
              key={idx} 
              url={att.url}
              data-testid={`attachment-image-${idx}`}
            />
          );
        }
        
        // VIDEO
        if (att.type === "video" || att.mimeType.startsWith("video/")) {
          return (
            <VideoPreview 
              key={idx} 
              url={att.url}
              data-testid={`attachment-video-${idx}`}
            />
          );
        }
        
        // PDF
        if (att.mimeType === "application/pdf") {
          return (
            <PDFViewer 
              key={idx}
              url={att.url}
              filename={att.filename}
              size={att.size}
              data-testid={`attachment-pdf-${idx}`}
            />
          );
        }
        
        // OFFICE DOCUMENTS (Word, Excel, PowerPoint)
        if (
          att.mimeType.includes("word") || 
          att.mimeType.includes("document") ||
          att.mimeType.includes("spreadsheet") ||
          att.mimeType.includes("excel") ||
          att.mimeType.includes("presentation") ||
          att.mimeType.includes("powerpoint")
        ) {
          return (
            <DocViewer 
              key={idx}
              url={att.url}
              filename={att.filename}
              mimeType={att.mimeType}
              size={att.size}
              data-testid={`attachment-doc-${idx}`}
            />
          );
        }
        
        // AUDIO
        if (att.type === "audio" || att.mimeType.startsWith("audio/")) {
          return (
            <div 
              key={idx}
              className="glass-premium rounded-lg p-4 border border-primary/20 hover-elevate transition-all"
              data-testid={`attachment-audio-${idx}`}
            >
              <div className="flex items-center gap-3">
                <div className="glass p-3 rounded-lg">
                  <FileAudio className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-foreground truncate">
                    {att.filename}
                  </h4>
                  <audio 
                    controls 
                    className="w-full mt-2"
                    src={att.url}
                  >
                    Seu navegador não suporta áudio.
                  </audio>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  asChild
                  className="gap-1.5"
                >
                  <a href={att.url} download={att.filename}>
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          );
        }
        
        // FALLBACK - Arquivo genérico
        return (
          <div 
            key={idx}
            className="glass-premium rounded-lg p-3 border border-primary/20 hover-elevate"
            data-testid={`attachment-generic-${idx}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground truncate">{att.filename}</span>
              <Button size="sm" variant="ghost" asChild>
                <a href={att.url} download={att.filename}>
                  <Download className="w-4 h-4" />
                </a>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
