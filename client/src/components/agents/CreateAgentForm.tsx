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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Namespace {
  id: number;
  namespace: string;
  parentNamespace: string | null;
  icon: string | null;
  description: string | null;
}

const createAgentFormSchema = insertAgentSchema.extend({
  name: z.string().min(1, "Nome é obrigatório"),
  slug: z.string().min(1, "Slug é obrigatório"),
  agentTier: z.literal("agent"),
  assignedNamespaces: z.array(z.string()).length(1, "Agents devem ter exatamente 1 namespace raiz"),
});

type CreateAgentFormValues = z.infer<typeof createAgentFormSchema>;

export function CreateAgentForm() {
  const { toast } = useToast();

  const { data: namespaces = [] } = useQuery<Namespace[]>({
    queryKey: ["/api/admin/namespaces"],
  });

  const rootNamespaces = namespaces.filter((ns) => !ns.namespace.includes("/"));

  const form = useForm<CreateAgentFormValues>({
    resolver: zodResolver(createAgentFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      systemPrompt: "",
      agentTier: "agent",
      assignedNamespaces: [],
      type: "specialist",
      enabled: true,
      tenantId: 1,
    },
  });

  async function onSubmit(values: CreateAgentFormValues) {
    try {
      const res = await apiRequest("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao criar Agent");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Agent criado com sucesso!" });
      form.reset();
    } catch (error: any) {
      toast({
        title: "Erro ao criar Agent",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  return (
    <Card data-testid="card-create-agent">
      <CardHeader>
        <CardTitle data-testid="title-create-agent">Criar Agent (Coordenador)</CardTitle>
        <CardDescription data-testid="description-create-agent">
          Agents trabalham em 1 namespace raiz e coordenam SubAgents especializados
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
                  <FormLabel>Nome do Agent *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Ex: Coordenador Financeiro"
                      data-testid="input-agent-name"
                    />
                  </FormControl>
                  <FormMessage data-testid="error-agent-name" />
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
                      placeholder="Ex: coordenador-financeiro"
                      data-testid="input-agent-slug"
                    />
                  </FormControl>
                  <FormMessage data-testid="error-agent-slug" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assignedNamespaces"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Namespace Raiz *</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange([value])}
                    value={field.value?.[0] || ""}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-agent-namespace">
                        <SelectValue placeholder="Selecione 1 namespace raiz" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {rootNamespaces.map((ns) => (
                        <SelectItem
                          key={ns.id}
                          value={ns.namespace}
                          data-testid={`option-namespace-${ns.namespace}`}
                        >
                          {ns.icon} {ns.namespace}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription data-testid="desc-agent-namespace">
                    Agents trabalham em 1 namespace raiz (ex: "financas", "tech")
                  </FormDescription>
                  <FormMessage data-testid="error-agent-namespace" />
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
                      placeholder="Descreva as responsabilidades deste Agent"
                      rows={3}
                      data-testid="textarea-agent-description"
                    />
                  </FormControl>
                  <FormMessage data-testid="error-agent-description" />
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
                      placeholder="Instruções para o Agent (opcional)"
                      rows={4}
                      data-testid="textarea-agent-prompt"
                    />
                  </FormControl>
                  <FormMessage data-testid="error-agent-prompt" />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              data-testid="button-submit-create-agent"
              disabled={form.formState.isSubmitting}
              className="w-full"
            >
              {form.formState.isSubmitting ? "Criando..." : "Criar Agent"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
