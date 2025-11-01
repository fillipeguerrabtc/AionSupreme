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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Namespace {
  id: number;
  namespace: string;
  parentNamespace: string | null;
  icon: string | null;
  description: string | null;
}

const createSubAgentFormSchema = insertAgentSchema.extend({
  name: z.string().min(1, "Nome é obrigatório"),
  slug: z.string().min(1, "Slug é obrigatório"),
  agentTier: z.literal("subagent"),
  assignedNamespaces: z
    .array(z.string())
    .min(1, "SubAgents devem ter pelo menos 1 subnamespace"),
});

type CreateSubAgentFormValues = z.infer<typeof createSubAgentFormSchema>;

export function CreateSubAgentForm() {
  const { toast } = useToast();

  const { data: namespaces = [] } = useQuery<Namespace[]>({
    queryKey: ["/api/admin/namespaces"],
  });

  const subNamespaces = namespaces.filter((ns) => ns.namespace.includes("/"));

  const groupedSubNamespaces = subNamespaces.reduce((acc, ns) => {
    const root = ns.namespace.split("/")[0];
    if (!acc[root]) acc[root] = [];
    acc[root].push(ns);
    return acc;
  }, {} as Record<string, Namespace[]>);

  const form = useForm<CreateSubAgentFormValues>({
    resolver: zodResolver(createSubAgentFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      systemPrompt: "",
      agentTier: "subagent",
      assignedNamespaces: [],
      type: "specialist",
      enabled: true,
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

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug (identificador único) *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex: especialista-investimentos"
                      data-testid="input-subagent-slug"
                    />
                  </FormControl>
                  <FormMessage data-testid="error-subagent-slug" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assignedNamespaces"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subnamespaces *</FormLabel>
                  <FormDescription data-testid="desc-subagent-namespaces">
                    Selecione 1 ou mais subnamespaces do mesmo namespace pai
                  </FormDescription>
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
