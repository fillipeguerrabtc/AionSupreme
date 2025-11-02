import { useState } from "react";
import { X, Download, FileText, FileVideo, FileAudio, File } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

interface AttachmentThumbnailProps {
  file: File;
  onRemove?: () => void;
  showRemove?: boolean;
  testId?: string;
}

export function AttachmentThumbnail({ file, onRemove, showRemove = true, testId }: AttachmentThumbnailProps) {
  const [preview, setPreview] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  // Generate preview URL for images
  if (file.type.startsWith("image/") && !preview) {
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  const getIcon = () => {
    if (file.type.startsWith("image/")) return null;
    if (file.type.startsWith("video/")) return <FileVideo className="w-8 h-8 text-primary" />;
    if (file.type.startsWith("audio/")) return <FileAudio className="w-8 h-8 text-primary" />;
    if (file.type.includes("pdf")) return <FileText className="w-8 h-8 text-destructive" />;
    return <File className="w-8 h-8 text-muted-foreground" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <div
            className="relative group rounded-lg overflow-hidden border-2 border-border bg-card hover-elevate active-elevate-2 cursor-pointer transition-all"
            style={{ width: "120px", height: "120px" }}
            data-testid={testId}
          >
            {/* Image Thumbnail */}
            {file.type.startsWith("image/") && preview ? (
              <img
                src={preview}
                alt={file.name}
                className="w-full h-full object-cover"
              />
            ) : (
              /* Icon for non-images */
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-2">
                {getIcon()}
                <span className="text-xs text-center text-muted-foreground truncate w-full px-1">
                  {file.name}
                </span>
              </div>
            )}

            {/* Remove Button */}
            {showRemove && onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="absolute top-1 right-1 bg-destructive/90 hover:bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                data-testid={`${testId}-remove`}
              >
                <X className="w-3 h-3" />
              </button>
            )}

            {/* Size Label */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1">
              <p className="text-xs text-white truncate">{formatSize(file.size)}</p>
            </div>
          </div>
        </DialogTrigger>

        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4">
              <span className="truncate">{file.name}</span>
              <Button
                size="sm"
                variant="outline"
                asChild
                className="shrink-0"
                data-testid={`${testId}-download`}
              >
                <a href={preview || URL.createObjectURL(file)} download={file.name}>
                  <Download className="w-4 h-4 mr-2" />
                  Salvar
                </a>
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            {file.type.startsWith("image/") && preview && (
              <img
                src={preview}
                alt={file.name}
                className="w-full h-auto rounded-lg border border-border"
              />
            )}
            {file.type.startsWith("video/") && (
              <video
                controls
                className="w-full rounded-lg border border-border"
                src={URL.createObjectURL(file)}
              >
                Seu navegador não suporta vídeo.
              </video>
            )}
            {file.type.startsWith("audio/") && (
              <div className="p-8 text-center">
                <FileAudio className="w-20 h-20 mx-auto mb-4 text-primary" />
                <audio controls className="w-full" src={URL.createObjectURL(file)}>
                  Seu navegador não suporta áudio.
                </audio>
              </div>
            )}
            {!file.type.startsWith("image/") && 
             !file.type.startsWith("video/") && 
             !file.type.startsWith("audio/") && (
              <div className="p-12 text-center">
                {getIcon()}
                <p className="mt-4 text-muted-foreground">
                  Pré-visualização não disponível. Clique em "Salvar" para baixar.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
