import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NamespaceSelector } from "@/components/agents/NamespaceSelector";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PromoteToKBButtonProps {
  answerText: string;
  defaultNamespaces?: string[];
  className?: string;
}

export function PromoteToKBButton({
  answerText,
  defaultNamespaces = ["geral/conhecimento"],
  className,
}: PromoteToKBButtonProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(answerText);
  const [namespaces, setNamespaces] = useState<string[]>(defaultNamespaces);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handlePromote = async () => {
    if (!title.trim() || !content.trim() || namespaces.length === 0) {
      toast({
        title: "Erro",
        description: "Preencha título, conteúdo e selecione ao menos um namespace",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("/api/kb/promote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": "1",
        },
        body: JSON.stringify({
          title,
          text: content,
          suggestedNamespaces: namespaces,
          submittedBy: "user",
        }),
      });

      toast({
        title: "Sucesso!",
        description: "Conteúdo adicionado à fila de curadoria para revisão",
      });

      setOpen(false);
      setTitle("");
      setContent(answerText);
      setNamespaces(defaultNamespaces);
    } catch (error: any) {
      toast({
        title: "Erro ao promover conteúdo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={className}
          data-testid="button-promote-to-kb"
        >
          <Upload className="h-4 w-4 mr-2" />
          Promover à KB
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl" data-testid="dialog-promote-to-kb">
        <DialogHeader>
          <DialogTitle>Promover Conteúdo à Knowledge Base</DialogTitle>
          <DialogDescription>
            Este conteúdo será adicionado à fila de curadoria para revisão antes da publicação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="promote-title">Título</Label>
            <Input
              id="promote-title"
              placeholder="Título descritivo do conteúdo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-promote-title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="promote-content">Conteúdo</Label>
            <Textarea
              id="promote-content"
              placeholder="Conteúdo a ser adicionado à KB"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              data-testid="input-promote-content"
            />
          </div>

          <div className="space-y-2">
            <Label>Namespaces Sugeridos</Label>
            <NamespaceSelector
              value={namespaces}
              onChange={setNamespaces}
              placeholder="Selecione os namespaces apropriados"
            />
            <p className="text-sm text-muted-foreground">
              Um curador revisará e poderá ajustar os namespaces antes da publicação.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
            data-testid="button-cancel-promote"
          >
            Cancelar
          </Button>
          <Button
            onClick={handlePromote}
            disabled={isSubmitting}
            data-testid="button-submit-promote"
          >
            {isSubmitting ? "Enviando..." : "Adicionar à Fila"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
