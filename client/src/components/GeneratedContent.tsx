/**
 * Generated Content Component
 * 
 * Displays generated files (images, text, video) inline in chat
 * with download option
 */

import { Download, FileText, Image, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface GeneratedFile {
  id: number;
  filename: string;
  fileType: "image" | "text" | "code" | "video";
  url: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
    language?: string;
    revisedPrompt?: string;
  };
  expiresAt: string;
}

interface GeneratedContentProps {
  file: GeneratedFile;
}

export function GeneratedContent({ file }: GeneratedContentProps) {
  const downloadUrl = `${file.url}/download`;
  
  const getIcon = () => {
    switch (file.fileType) {
      case "image":
        return <Image className="w-4 h-4" />;
      case "video":
        return <Video className="w-4 h-4" />;
      case "text":
      case "code":
        return <FileText className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const renderContent = () => {
    switch (file.fileType) {
      case "image":
        return (
          <div className="relative group">
            <img
              src={file.url}
              alt={file.filename}
              className="max-w-full rounded-md"
              style={{ maxHeight: "500px", objectFit: "contain" }}
            />
            {file.metadata?.revisedPrompt && (
              <div className="mt-2 text-xs text-muted-foreground">
                <strong>DALL-E Prompt:</strong> {file.metadata.revisedPrompt}
              </div>
            )}
          </div>
        );

      case "video":
        return (
          <video
            controls
            className="max-w-full rounded-md"
            style={{ maxHeight: "500px" }}
          >
            <source src={file.url} type="video/mp4" />
            Your browser does not support video playback.
          </video>
        );

      case "text":
      case "code":
        // For text/code, show a preview message
        return (
          <div className="text-sm text-muted-foreground">
            <p>📄 {file.filename}</p>
            {file.metadata?.language && (
              <p className="text-xs">Language: {file.metadata.language}</p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className="p-4 my-2 max-w-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="text-sm font-medium">{file.filename}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          asChild
          data-testid={`button-download-${file.id}`}
        >
          <a href={downloadUrl} download={file.filename}>
            <Download className="w-4 h-4 mr-1" />
            Download
          </a>
        </Button>
      </div>

      <div className="mb-2">{renderContent()}</div>

      <div className="text-xs text-muted-foreground">
        Expires: {new Date(file.expiresAt).toLocaleString()} (1 hour from generation)
      </div>
    </Card>
  );
}
