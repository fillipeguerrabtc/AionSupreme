import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Check, X, ArrowDownToLine, Eye, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AbsorptionPreviewModalProps {
  itemId: string | null;
  itemTitle: string;
  onClose: () => void;
}

export function AbsorptionPreviewModal({ itemId, itemTitle, onClose }: AbsorptionPreviewModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showFullComparison, setShowFullComparison] = useState(false);

  // Fetch preview (only when modal is open)
  const { data: previewData, isLoading: isLoadingPreview } = useQuery<{
    success: boolean;
    preview: {
      shouldAbsorb: boolean;
      extractedContent: string;
      originalContent: string;
      duplicateTitle: string;
      stats: {
        originalLength: number;
        extractedLength: number;
        uniqueLines: number;
        totalLines: number;
        duplicateLines: number;
        reductionPercent: number;
        newContentPercent: number;
      };
      reason: string;
    };
  }>({
    queryKey: [`/api/curation/preview-absorption/${itemId}`],
    enabled: !!itemId,
  });

  const preview = previewData?.preview;

  // Mutation to execute absorption
  const absorbMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/curation/absorb-partial/${itemId}`, {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/curation/pending"] });
      toast({
        title: "✅ Absorção concluída!",
        description: `Conteúdo reduzido de ${data.analysis.originalLength} para ${data.analysis.extractedLength} caracteres (${data.analysis.reductionPercent}% de redução).`,
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao absorver",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to reject duplicate
  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(`/api/curation/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          id: itemId, 
          reviewedBy: "admin", 
          note: "Rejeitado (duplicata)" 
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/curation/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/curation/history"] });
      toast({
        title: "Item rejeitado",
        description: "Duplicata removida da fila de curadoria.",
      });
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao rejeitar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!itemId) return null;

  return (
    <Dialog open={!!itemId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="h-5 w-5 text-orange-600" />
            Absorção Inteligente de Conteúdo
          </DialogTitle>
          <DialogDescription>
            Documento: <span className="font-medium">{itemTitle}</span>
          </DialogDescription>
        </DialogHeader>

        {isLoadingPreview ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !preview ? (
          <div className="text-center py-8 text-muted-foreground">
            Erro ao carregar preview
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats Card */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <BarChart3 className="h-4 w-4" />
                Estatísticas da Análise
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Linhas únicas</div>
                  <div className="text-lg font-semibold text-green-600">
                    {preview.stats.uniqueLines}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Total de linhas</div>
                  <div className="text-lg font-semibold">
                    {preview.stats.totalLines}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Conteúdo novo</div>
                  <div className="text-lg font-semibold text-blue-600">
                    {preview.stats.newContentPercent}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Redução</div>
                  <div className="text-lg font-semibold text-orange-600">
                    {preview.stats.reductionPercent}%
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-border/50">
                <div className="text-xs text-muted-foreground">Duplicado de:</div>
                <div className="text-sm font-medium">{preview.duplicateTitle}</div>
              </div>
            </div>

            {/* Recommendation */}
            <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className={`p-1.5 rounded ${preview.shouldAbsorb ? 'bg-green-500' : 'bg-orange-500'}`}>
                {preview.shouldAbsorb ? (
                  <Check className="h-4 w-4 text-white" />
                ) : (
                  <X className="h-4 w-4 text-white" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">
                  {preview.shouldAbsorb ? "✅ Recomendado absorver" : "⚠️ Absorção não recomendada"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {preview.reason}
                </div>
              </div>
            </div>

            {/* Content Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">
                  {showFullComparison ? "Comparação Completa" : "Conteúdo Extraído (Preview)"}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullComparison(!showFullComparison)}
                  data-testid="button-toggle-comparison"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {showFullComparison ? "Ver apenas diff" : "Ver comparação completa"}
                </Button>
              </div>

              {showFullComparison ? (
                <div className="grid grid-cols-2 gap-4">
                  {/* Original Content */}
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase">
                      Documento Original
                    </div>
                    <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                      <pre className="text-xs whitespace-pre-wrap font-mono">
                        {preview.originalContent}
                      </pre>
                    </ScrollArea>
                  </div>

                  {/* Extracted Content */}
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-green-600 uppercase">
                      Conteúdo Extraído (Novo)
                    </div>
                    <ScrollArea className="h-[300px] w-full rounded-md border border-green-500/50 bg-green-50/50 dark:bg-green-950/10 p-4">
                      <pre className="text-xs whitespace-pre-wrap font-mono text-green-700 dark:text-green-400">
                        {preview.extractedContent}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-[300px] w-full rounded-md border border-green-500/50 bg-green-50/50 dark:bg-green-950/10 p-4">
                  <div className="text-xs text-muted-foreground mb-2">
                    ✨ Este é o conteúdo que será salvo (apenas partes únicas):
                  </div>
                  <pre className="text-xs whitespace-pre-wrap font-mono text-green-700 dark:text-green-400">
                    {preview.extractedContent}
                  </pre>
                </ScrollArea>
              )}
            </div>

            <Separator />

            {/* Action Buttons */}
            <div className="flex justify-between gap-3">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={absorbMutation.isPending || rejectMutation.isPending}
                data-testid="button-cancel-absorption"
              >
                Cancelar
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => rejectMutation.mutate()}
                  disabled={absorbMutation.isPending || rejectMutation.isPending}
                  className="text-red-600 hover:text-red-700"
                  data-testid="button-reject-duplicate"
                >
                  <X className="h-4 w-4 mr-2" />
                  {rejectMutation.isPending ? "Rejeitando..." : "Rejeitar duplicata"}
                </Button>

                <Button
                  onClick={() => absorbMutation.mutate()}
                  disabled={!preview.shouldAbsorb || absorbMutation.isPending || rejectMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-confirm-absorption"
                >
                  <ArrowDownToLine className="h-4 w-4 mr-2" />
                  {absorbMutation.isPending ? "Salvando..." : "Salvar apenas diff"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
