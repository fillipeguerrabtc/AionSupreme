import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Save, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function LifecyclePoliciesTab() {
  const { toast } = useToast();
  const [pendingChanges, setPendingChanges] = useState<any>(null);

  const { data: policy, isLoading } = useQuery({
    queryKey: ["/api/admin/lifecycle-policies"],
    queryFn: async () => {
      const res = await fetch("/api/admin/lifecycle-policies");
      return res.json();
    },
  });

  // Initialize pending changes when policy loads
  useEffect(() => {
    if (policy && !pendingChanges) {
      setPendingChanges(policy);
    }
  }, [policy]);

  const updatePolicyMutation = useMutation({
    mutationFn: async (updates: any) => {
      return await apiRequest("/api/admin/lifecycle-policies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lifecycle-policies"] });
      setPendingChanges(null);
      toast({
        title: "✅ Políticas atualizadas",
        description: "Configurações de retenção salvas com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Erro ao atualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveChanges = () => {
    if (!pendingChanges) return;
    updatePolicyMutation.mutate(pendingChanges);
  };

  const handleModuleToggle = (moduleName: string, enabled: boolean) => {
    if (!pendingChanges) return;
    
    setPendingChanges({
      ...pendingChanges,
      modules: {
        ...pendingChanges.modules,
        [moduleName]: {
          ...pendingChanges.modules[moduleName],
          enabled,
        },
      },
    });
  };

  const handleRetentionChange = (moduleName: string, policyIndex: number, field: string, value: any) => {
    if (!pendingChanges) return;
    
    const moduleConfig = pendingChanges.modules[moduleName];
    const policies = [...moduleConfig.policies];
    
    // Update nested condition field
    if (field.startsWith("condition.")) {
      const conditionField = field.replace("condition.", "");
      policies[policyIndex] = {
        ...policies[policyIndex],
        condition: {
          ...policies[policyIndex].condition,
          [conditionField]: value,
        },
      };
    } else {
      policies[policyIndex] = {
        ...policies[policyIndex],
        [field]: value,
      };
    }
    
    setPendingChanges({
      ...pendingChanges,
      modules: {
        ...pendingChanges.modules,
        [moduleName]: {
          ...moduleConfig,
          policies,
        },
      },
    });
  };

  const handleGlobalDefaultChange = (field: string, value: any) => {
    if (!pendingChanges) return;
    
    setPendingChanges({
      ...pendingChanges,
      globalDefaults: {
        ...pendingChanges.globalDefaults,
        [field]: value,
      },
    });
  };

  const hasChanges = pendingChanges && policy && JSON.stringify(pendingChanges) !== JSON.stringify(policy);

  if (isLoading || !pendingChanges) {
    return <div className="p-4" data-testid="loading-lifecycle-policies">Carregando políticas...</div>;
  }

  if (!policy) {
    return <div className="p-4" data-testid="error-lifecycle-policies">Erro ao carregar políticas</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" data-testid="title-lifecycle-policies">Políticas de Retenção e Limpeza</h2>
          <p className="text-sm text-muted-foreground">
            Configure períodos de retenção e limpeza automática para cada módulo do sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasChanges && (
            <Badge variant="outline" className="gap-2" data-testid="badge-unsaved-changes">
              <AlertTriangle className="w-3 h-3" />
              Mudanças não salvas
            </Badge>
          )}
          <Button 
            onClick={handleSaveChanges}
            disabled={!hasChanges || updatePolicyMutation.isPending}
            data-testid="button-save-policies"
          >
            <Save className="w-4 h-4 mr-2" />
            {updatePolicyMutation.isPending ? "Salvando..." : "Salvar Mudanças"}
          </Button>
        </div>
      </div>

      <Card data-testid="card-global-defaults">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            Configurações Globais
          </CardTitle>
          <CardDescription data-testid="text-global-defaults-info">
            Timezone: {pendingChanges.globalDefaults.timezone} | Retenção padrão: {pendingChanges.globalDefaults.retentionYears} anos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Audit Log Habilitado</Label>
                <p className="text-xs text-muted-foreground">Registrar todas as operações de lifecycle</p>
              </div>
              <Switch
                checked={pendingChanges.globalDefaults.auditLogEnabled}
                onCheckedChange={(checked) => handleGlobalDefaultChange("auditLogEnabled", checked)}
                data-testid="switch-audit-log"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Modo Dry Run</Label>
                <p className="text-xs text-muted-foreground">Simular limpeza sem deletar dados</p>
              </div>
              <Switch
                checked={pendingChanges.globalDefaults.dryRun}
                onCheckedChange={(checked) => handleGlobalDefaultChange("dryRun", checked)}
                data-testid="switch-dry-run"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {Object.entries(pendingChanges.modules).map(([moduleName, moduleConfig]: [string, any]) => (
          <Card key={moduleName} data-testid={`card-module-${moduleName}`}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="capitalize" data-testid={`text-module-${moduleName}-name`}>{moduleName}</CardTitle>
                  <CardDescription data-testid={`text-module-${moduleName}-description`}>{moduleConfig.description}</CardDescription>
                </div>
                <Switch
                  checked={moduleConfig.enabled}
                  onCheckedChange={(checked) => handleModuleToggle(moduleName, checked)}
                  data-testid={`switch-module-${moduleName}`}
                />
              </div>
            </CardHeader>
            <CardContent>
              {moduleConfig.enabled && moduleConfig.policies && (
                <div className="space-y-4">
                  {moduleConfig.policies.map((policyRule: any, idx: number) => (
                    <div key={idx} className="border rounded-md p-4 space-y-3" data-testid={`card-policy-${moduleName}-${idx}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="font-semibold" data-testid={`text-policy-${moduleName}-${idx}-name`}>{policyRule.name}</Label>
                          {policyRule.description && (
                            <p className="text-xs text-muted-foreground mt-1" data-testid={`text-policy-${moduleName}-${idx}-description`}>{policyRule.description}</p>
                          )}
                        </div>
                        <Switch
                          checked={policyRule.enabled}
                          onCheckedChange={(checked) => 
                            handleRetentionChange(moduleName, idx, "enabled", checked)
                          }
                          data-testid={`switch-policy-${moduleName}-${idx}`}
                        />
                      </div>

                      {policyRule.enabled && policyRule.condition && (
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                          {policyRule.condition.value !== undefined && (
                            <>
                              <div>
                                <Label className="text-xs">Período de Retenção</Label>
                                <Input
                                  type="number"
                                  value={policyRule.condition.value}
                                  onChange={(e) => 
                                    handleRetentionChange(moduleName, idx, "condition.value", parseInt(e.target.value))
                                  }
                                  className="mt-1"
                                  data-testid={`input-retention-${moduleName}-${idx}`}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Unidade</Label>
                                <Select
                                  value={policyRule.condition.unit}
                                  onValueChange={(value) =>
                                    handleRetentionChange(moduleName, idx, "condition.unit", value)
                                  }
                                >
                                  <SelectTrigger className="mt-1" data-testid={`select-unit-${moduleName}-${idx}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="days" data-testid={`option-days-${moduleName}-${idx}`}>Dias</SelectItem>
                                    <SelectItem value="months" data-testid={`option-months-${moduleName}-${idx}`}>Meses</SelectItem>
                                    <SelectItem value="years" data-testid={`option-years-${moduleName}-${idx}`}>Anos</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
