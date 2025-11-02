import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAgentSchema } from "@shared/schema";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Namespace {
  id: number;
  namespace: string;
  parentNamespace: string | null;
  icon: string | null;
  description: string | null;
}

interface Agent {
  id: string;
  name: string;
  slug: string;
  agentTier: "agent" | "subagent";
  assignedNamespaces: string[];
}

const createSubAgentFormSchema = insertAgentSchema.extend({
  name: z.string().min(1, "Nome é obrigatório"),
  agentTier: z.literal("subagent"),
  assignedNamespaces: z
    .array(z.string())
    .min(1, "SubAgents devem ter pelo menos 1 subnamespace"),
}).omit({ slug: true });

type CreateSubAgentFormValues = z.infer<typeof createSubAgentFormSchema>;

export function CreateSubAgentForm() {
  const { toast } = useToast();
  const [selectedParentAgentId, setSelectedParentAgentId] = useState<string>("");

  // Fetch all agents (we'll filter to get parent agents)
  const { data: allAgents = [] } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
  });

  // Filter to get only tier="agent" (potential parents)
  const parentAgents = allAgents.filter(agent => agent.agentTier === "agent");

  // Get selected parent agent
  const selectedParent = parentAgents.find(agent => agent.id === selectedParentAgentId);
  const parentNamespace = selectedParent?.assignedNamespaces?.[0]; // Agent has exactly 1 namespace

  const { data: namespaces = [] } = useQuery<Namespace[]>({
    queryKey: ["/api/admin/namespaces"],
  });

  // Filter subnamespaces based on selected parent's namespace
  const availableSubNamespaces = parentNamespace
    ? namespaces.filter((ns) => ns.namespace.startsWith(parentNamespace + "/"))
    : [];

  const groupedSubNamespaces = availableSubNamespaces.reduce((acc, ns) => {
    const root = ns.namespace.split("/")[0];
    if (!acc[root]) acc[root] = [];
    acc[root].push(ns);
    return acc;
  }, {} as Record<string, Namespace[]>);

  const form = useForm<CreateSubAgentFormValues>({
    resolver: zodResolver(createSubAgentFormSchema),
    defaultValues: {
      name: "",
      description: "",
      systemPrompt: "",
      agentTier: "subagent",
      assignedNamespaces: [],
      type: "specialist",
      tenantId: 1,
    },
  });

  async function onSubmit(values: CreateSubAgentFormValues) {
    try {
      const res = await apiRequest("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao criar SubAgent");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "SubAgent criado com sucesso!" });
      form.reset();
    } catch (error: any) {
      toast({
        title: "Erro ao criar SubAgent",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  return (
    <Card data-testid="card-create-subagent">
      <CardHeader>
        <CardTitle data-testid="title-create-subagent">Criar SubAgent (Especialista)</CardTitle>
        <CardDescription data-testid="description-create-subagent">
          SubAgents trabalham em subnamespaces e são governados automaticamente por Agents
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do SubAgent *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex: Especialista em Investimentos"
                      data-testid="input-subagent-name"
                    />
                  </FormControl>
                  <FormMessage data-testid="error-subagent-name" />
                </FormItem>
              )}
            />

            {/* Parent Agent Selector */}
            <div className="space-y-2">
              <Label htmlFor="parent-agent">Agente Pai (Parent Agent) *</Label>
              <Select
                value={selectedParentAgentId}
                onValueChange={(value) => {
                  setSelectedParentAgentId(value);
                  // Clear selected namespaces when parent changes
                  form.setValue("assignedNamespaces", []);
                }}
                data-testid="select-parent-agent"
              >
                <SelectTrigger id="parent-agent" data-testid="trigger-parent-agent">
                  <SelectValue placeholder="Selecione o Agent Pai..." />
                </SelectTrigger>
                <SelectContent>
                  {parentAgents.map((agent) => (
                    <SelectItem 
                      key={agent.id} 
                      value={agent.id}
                      data-testid={`option-parent-${agent.id}`}
                    >
                      {agent.name} ({agent.assignedNamespaces?.[0] || "sem namespace"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedParent && (
                <p className="text-sm text-muted-foreground" data-testid="info-parent-namespace">
                  Namespace do pai: <Badge variant="outline">{parentNamespace}</Badge>
                </p>
              )}
              {!selectedParentAgentId && (
                <p className="text-sm text-muted-foreground">
                  Escolha primeiro o Agent Pai para ver os subnamespaces disponíveis
                </p>
              )}
            </div>

            <FormField
              control={form.control}
              name="assignedNamespaces"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subnamespaces *</FormLabel>
                  <FormDescription data-testid="desc-subagent-namespaces">
                    Selecione 1 ou mais subnamespaces dentro do namespace do Agent Pai
                  </FormDescription>
                  {!selectedParentAgentId ? (
                    <div className="border rounded-md p-4 text-center text-sm text-muted-foreground">
                      ⬆️ Selecione primeiro um Agent Pai para ver os subnamespaces disponíveis
                    </div>
                  ) : availableSubNamespaces.length === 0 ? (
                    <div className="border rounded-md p-4 text-center text-sm text-muted-foreground">
                      ⚠️ O Agent Pai selecionado não possui subnamespaces. Crie subnamespaces no namespace "{parentNamespace}" primeiro.
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-64 overflow-y-auto border rounded-md p-4">
                      {Object.entries(groupedSubNamespaces).map(([root, subNs]) => (
                        <div key={root} className="space-y-2">
                          <h4 className="font-medium text-sm" data-testid={`group-${root}`}>
                            {root} ({subNs.length})
                          </h4>
                          {subNs.map((ns) => (
                            <div
                              key={ns.id}
                              className="flex items-center space-x-2 ml-4"
                              data-testid={`namespace-item-${ns.namespace}`}
                            >
                              <Checkbox
                                id={`ns-${ns.id}`}
                                data-testid={`checkbox-namespace-${ns.namespace}`}
                                checked={field.value?.includes(ns.namespace)}
                                onCheckedChange={(checked) => {
                                  const updated = checked
                                    ? [...(field.value || []), ns.namespace]
                                    : (field.value || []).filter((v) => v !== ns.namespace);
                                  field.onChange(updated);
                                }}
                              />
                              <label
                                htmlFor={`ns-${ns.id}`}
                                className="text-sm cursor-pointer flex-1"
                                data-testid={`label-namespace-${ns.namespace}`}
                              >
                                {ns.icon} {ns.namespace}
                              </label>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {field.value && field.value.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1" data-testid="selected-namespaces">
                      {field.value.map((ns) => (
                        <Badge
                          key={ns}
                          variant="secondary"
                          data-testid={`badge-selected-${ns}`}
                        >
                          {ns}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <FormMessage data-testid="error-subagent-namespaces" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Descreva as especializações deste SubAgent"
                      rows={3}
                      data-testid="textarea-subagent-description"
                    />
                  </FormControl>
                  <FormMessage data-testid="error-subagent-description" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="systemPrompt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>System Prompt</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Instruções para o SubAgent (opcional)"
                      rows={4}
                      data-testid="textarea-subagent-prompt"
                    />
                  </FormControl>
                  <FormMessage data-testid="error-subagent-prompt" />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              data-testid="button-submit-create-subagent"
              disabled={form.formState.isSubmitting}
              className="w-full"
            >
              {form.formState.isSubmitting ? "Criando..." : "Criar SubAgent"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
