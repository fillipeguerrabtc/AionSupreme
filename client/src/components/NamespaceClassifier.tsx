import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Check, X, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface NamespaceClassifierProps {
  content: string;
  title?: string;
  onNamespaceSelected?: (namespace: string) => void;
}

interface ClassificationResult {
  suggestedNamespace: string;
  confidence: number;
  reasoning: string;
  existingMatches: Array<{
    id: string;
    name: string;
    similarity: number;
    description: string;
  }>;
}

/**
 * Component for LLM-powered namespace classification
 * 
 * Features:
 * - Classifies content via GPT-4
 * - Shows confidence score and reasoning
 * - Suggests existing similar namespaces
 * - Allows user to approve/edit proposed namespace
 * - Auto-creates namespace + agent if needed
 */
export function NamespaceClassifier({ content, title, onNamespaceSelected }: NamespaceClassifierProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [editedNamespace, setEditedNamespace] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [namespaceDescription, setNamespaceDescription] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const { toast } = useToast();

  // Classify mutation
  const classifyMutation = useMutation({
    mutationFn: async (data: { content: string; title?: string }) => {
      const res = await apiRequest("/api/namespaces/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json() as Promise<ClassificationResult>;
    },
    onSuccess: (data) => {
      // Defensive fallback - ensure existingMatches is always an array
      const safeData = {
        ...data,
        existingMatches: data.existingMatches || []
      };
      
      setClassification(safeData);
      setEditedNamespace(safeData.suggestedNamespace);
      setDialogOpen(true);
      
      // Auto-suggest agent name from namespace
      const nameParts = safeData.suggestedNamespace.split('.');
      const suggestedAgentName = nameParts[nameParts.length - 1]
        .split(/[-_]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      setAgentName(`Especialista em ${suggestedAgentName}`);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao classificar", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  // Create namespace + agent mutation
  const createMutation = useMutation({
    mutationFn: async (data: {
      namespaceName: string;
      description: string;
      agentName: string;
      agentDescription: string;
    }) => {
      const res = await apiRequest("/api/namespaces/create-with-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "✅ Namespace + Agente criados!", 
        description: `Namespace "${data.namespace.name}" e agente "${data.agent.name}" foram criados com sucesso.` 
      });
      
      if (onNamespaceSelected) {
        onNamespaceSelected(data.namespace.name);
      }
      
      handleClose();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao criar namespace", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleClassify = () => {
    classifyMutation.mutate({ content, title });
  };

  const handleSelectExisting = (namespaceName: string) => {
    if (onNamespaceSelected) {
      onNamespaceSelected(namespaceName);
    }
    toast({ 
      title: "Namespace selecionado", 
      description: `Namespace "${namespaceName}" selecionado.` 
    });
    handleClose();
  };

  const handleCreateNew = () => {
    if (!editedNamespace.trim() || !agentName.trim() || !agentDescription.trim() || !namespaceDescription.trim()) {
      toast({ 
        title: "Campos obrigatórios", 
        description: "Preencha todos os campos para criar namespace + agente.", 
        variant: "destructive" 
      });
      return;
    }

    // Validar formato
    if (!/^[a-z0-9]+(\.[a-z0-9]+)*$/.test(editedNamespace)) {
      toast({ 
        title: "Formato inválido", 
        description: "Use apenas letras minúsculas, números e pontos (ex: educacao.matematica)", 
        variant: "destructive" 
      });
      return;
    }

    createMutation.mutate({
      namespaceName: editedNamespace,
      description: namespaceDescription,
      agentName,
      agentDescription,
    });
  };

  const handleClose = () => {
    setDialogOpen(false);
    setClassification(null);
    setEditedNamespace("");
    setCreateMode(false);
    setAgentName("");
    setAgentDescription("");
    setNamespaceDescription("");
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return "bg-green-500";
    if (confidence >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <>
      <Button
        onClick={handleClassify}
        disabled={classifyMutation.isPending}
        size="sm"
        variant="outline"
        data-testid="button-classify-namespace"
      >
        {classifyMutation.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4 mr-2" />
        )}
        Classify Namespace
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Namespace Classification
            </DialogTitle>
            <DialogDescription>
              LLM analyzed your content and proposed an ideal namespace
            </DialogDescription>
          </DialogHeader>

          {classification && (
            <div className="space-y-6">
              {/* Classification Result */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Proposed Namespace
                    <Badge 
                      variant="outline" 
                      className={`${getConfidenceColor(classification.confidence)} text-white`}
                    >
                      {classification.confidence}% confidence
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Namespace</Label>
                    <Input
                      value={editedNamespace}
                      onChange={(e) => setEditedNamespace(e.target.value)}
                      placeholder="educacao.matematica"
                      data-testid="input-namespace-name"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Format: lowercase letters, numbers, dots (e.g., educacao.matematica)
                    </p>
                  </div>

                  <div>
                    <Label>Reasoning</Label>
                    <p className="text-sm text-muted-foreground">{classification.reasoning}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Existing Matches */}
              {classification.existingMatches.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Similar Existing Namespaces</CardTitle>
                    <CardDescription>
                      These namespaces already exist and are similar to the proposed one
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {classification.existingMatches.map((match) => (
                      <div 
                        key={match.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover-elevate"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{match.name}</p>
                          <p className="text-sm text-muted-foreground">{match.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{Math.round(match.similarity)}% similar</Badge>
                          <Button
                            size="sm"
                            onClick={() => handleSelectExisting(match.name)}
                            data-testid={`button-select-namespace-${match.id}`}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Select
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Create New Section */}
              {createMode && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Create New Namespace + Agent</CardTitle>
                    <CardDescription>
                      Automatically create namespace and specialist agent
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Namespace Description</Label>
                      <Textarea
                        value={namespaceDescription}
                        onChange={(e) => setNamespaceDescription(e.target.value)}
                        placeholder="Describe what this namespace is about..."
                        rows={2}
                        data-testid="textarea-namespace-description"
                      />
                    </div>

                    <div>
                      <Label>Agent Name</Label>
                      <Input
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="e.g., Especialista em Matemática"
                        data-testid="input-agent-name"
                      />
                    </div>

                    <div>
                      <Label>Agent Description</Label>
                      <Textarea
                        value={agentDescription}
                        onChange={(e) => setAgentDescription(e.target.value)}
                        placeholder="Describe the agent's expertise and capabilities..."
                        rows={3}
                        data-testid="textarea-agent-description"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleClose}
              data-testid="button-cancel-classify"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>

            {!createMode ? (
              <Button
                onClick={() => setCreateMode(true)}
                data-testid="button-create-new-namespace"
              >
                <Plus className="h-4 w-4 mr-1" />
                Create New Namespace
              </Button>
            ) : (
              <Button
                onClick={handleCreateNew}
                disabled={createMutation.isPending}
                data-testid="button-confirm-create-namespace"
              >
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Confirm & Create
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
