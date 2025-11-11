import { useState, useEffect } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Check, X, Plus, Edit, Trash2, Code } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface Permission {
  id: number;
  name: string;
  code: string;
  module: string;
  submodule: string;
  action: string;
  description: string | null;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
}

interface ModuleDefinition {
  slug: string;
  labelKey: string;
  submodules: SubmoduleDefinition[];
}

interface SubmoduleDefinition {
  slug: string;
  labelKey: string;
  actions: string[];
}

export default function PermissionsPage() {
  const { t } = useLanguage();
  
  const createPermissionSchema = z.object({
    name: z.string().min(1, t.admin.permissions.validation.nameRequired),
    module: z.string().min(1, t.admin.permissions.validation.moduleRequired),
    submodule: z.string().min(1, t.admin.permissions.validation.submoduleRequired),
    actions: z.array(z.string()).min(1, t.admin.permissions.validation.actionsRequired),
    description: z.string().optional(),
  });
  
  type CreatePermissionForm = z.infer<typeof createPermissionSchema>;
  const { toast } = useToast();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(["all"]));
  
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
  const [permissionUsage, setPermissionUsage] = useState<{ inUse: boolean; roleCount: number; userCount: number } | null>(null);

  // Fetch permissions catalog
  const { data: catalog = [], isLoading: catalogLoading } = useQuery<ModuleDefinition[]>({
    queryKey: ['/api/admin/permissions/catalog'],
  });

  // Fetch all permissions
  const { data: allPermissions = [], isLoading: permissionsLoading } = useQuery<Permission[]>({
    queryKey: ['/api/admin/permissions'],
  });

  // Fetch all roles
  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ['/api/admin/roles'],
  });

  // Fetch permissions for each role
  const rolePermissionsQueries = useQueries({
    queries: roles.map(role => ({
      queryKey: ['/api/admin/roles', role.id, 'permissions'],
      queryFn: async () => {
        const res = await fetch(`/api/admin/roles/${role.id}/permissions`);
        if (!res.ok) throw new Error('Failed to fetch role permissions');
        return res.json();
      },
      enabled: !!role.id,
    })),
  });

  // Form for creating permission
  const form = useForm<CreatePermissionForm>({
    resolver: zodResolver(createPermissionSchema),
    defaultValues: {
      name: "",
      module: "",
      submodule: "",
      actions: [],
      description: "",
    },
  });

  const watchModule = form.watch("module");
  const watchSubmodule = form.watch("submodule");
  const watchActions = form.watch("actions");

  // Get current module definition
  const selectedModuleDef = catalog.find(m => m.slug === watchModule);
  const selectedSubmoduleDef = selectedModuleDef?.submodules.find(s => s.slug === watchSubmodule);

  // Reset submodule and actions when module changes
  useEffect(() => {
    if (watchModule) {
      form.setValue("submodule", "");
      form.setValue("actions", []);
    }
  }, [watchModule]);

  // Reset actions when submodule changes
  useEffect(() => {
    if (watchSubmodule) {
      form.setValue("actions", []);
    }
  }, [watchSubmodule]);

  // Generate preview codes
  const previewCodes = watchModule && watchSubmodule && watchActions.length > 0
    ? watchActions.map(action => `${watchModule}:${watchSubmodule}:${action}`)
    : [];

  // Create permission mutation
  const createPermissionMutation = useMutation({
    mutationFn: async (data: CreatePermissionForm) => {
      const res = await apiRequest('/api/admin/permissions/structured', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/permissions'] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: t.common.success,
        description: t.admin.permissions.toasts.createSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.error,
        description: error.message || t.admin.permissions.toasts.createError,
        variant: "destructive",
      });
    },
  });

  // Delete permission mutation
  const deletePermissionMutation = useMutation({
    mutationFn: async (permissionId: number) => {
      const res = await apiRequest(`/api/admin/permissions/${permissionId}`, {
        method: 'DELETE',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/permissions'] });
      setIsDeleteDialogOpen(false);
      setSelectedPermission(null);
      toast({
        title: t.common.success,
        description: t.admin.permissions.toasts.deleteSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.error,
        description: error.message || t.admin.permissions.toasts.deleteError,
        variant: "destructive",
      });
    },
  });

  // Assign permission mutation
  const assignPermissionMutation = useMutation({
    mutationFn: async ({ roleId, permissionId }: { roleId: number; permissionId: number }) => {
      const res = await apiRequest(`/api/admin/roles/${roleId}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ permissionId }),
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/roles', variables.roleId, 'permissions'] });
      toast({
        title: t.common.success,
        description: t.admin.permissions.toasts.assignSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.error,
        description: error.message || t.admin.permissions.toasts.assignError,
        variant: "destructive",
      });
    },
  });

  // Revoke permission mutation
  const revokePermissionMutation = useMutation({
    mutationFn: async ({ roleId, permissionId }: { roleId: number; permissionId: number }) => {
      const res = await apiRequest(`/api/admin/roles/${roleId}/permissions/${permissionId}`, {
        method: 'DELETE',
      });
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/roles', variables.roleId, 'permissions'] });
      toast({
        title: t.common.success,
        description: t.admin.permissions.toasts.revokeSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.error,
        description: error.message || t.admin.permissions.toasts.revokeError,
        variant: "destructive",
      });
    },
  });

  // Handle create dialog open
  const handleOpenCreateDialog = () => {
    form.reset();
    setIsCreateDialogOpen(true);
  };

  // Handle delete click
  const handleDeleteClick = async (permission: Permission) => {
    setSelectedPermission(permission);
    
    // Fetch usage
    try {
      const res = await fetch(`/api/admin/permissions/${permission.id}/usage`);
      const usage = await res.json();
      setPermissionUsage(usage);
    } catch (error) {
      console.error("Erro ao buscar uso de permissões", error);
    }
    
    setIsDeleteDialogOpen(true);
  };

  // Handle create submit
  const handleCreateSubmit = (data: CreatePermissionForm) => {
    createPermissionMutation.mutate(data);
  };

  // Handle toggle permission
  const handleTogglePermission = (roleId: number, permissionId: number, isAssigned: boolean) => {
    if (isAssigned) {
      revokePermissionMutation.mutate({ roleId, permissionId });
    } else {
      assignPermissionMutation.mutate({ roleId, permissionId });
    }
  };

  // Group permissions by module
  const permissionsByModule = allPermissions.reduce((acc, perm) => {
    const module = perm.module || "other";
    if (!acc[module]) {
      acc[module] = [];
    }
    acc[module].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const toggleModule = (module: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(module)) {
      newExpanded.delete(module);
    } else {
      newExpanded.add(module);
    }
    setExpandedModules(newExpanded);
  };

  const loading = permissionsLoading || rolesLoading || catalogLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8" />
            {t.admin.permissions.title}
          </h1>
          <p className="text-muted-foreground mt-2">{t.admin.permissions.description}</p>
        </div>
        <Button onClick={handleOpenCreateDialog} data-testid="button-create-permission">
          <Plus className="w-4 h-4 mr-2" />
          {t.admin.permissions.crud.createButton}
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t.common.loading}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t.admin.permissions.matrix.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(permissionsByModule).map(([module, permissions]) => {
              const isExpanded = expandedModules.has(module);
              
              return (
                <div key={module} className="space-y-2">
                  <Button
                    variant="ghost"
                    onClick={() => toggleModule(module)}
                    className="flex items-center gap-2"
                    data-testid={`button-toggle-module-${module}`}
                  >
                    {isExpanded ? "▼" : "▶"} {module.toUpperCase()} ({permissions.length})
                  </Button>

                  {isExpanded && (
                    <div className="ml-6 space-y-2">
                      {permissions.map(permission => {
                        return (
                          <div key={permission.id} className="flex items-center gap-2">
                            <div className="flex-1">
                              <div className="font-medium">{permission.name}</div>
                              <div className="text-sm text-muted-foreground flex items-center gap-2">
                                <Code className="w-3 h-3" />
                                <code className="text-xs">{permission.code}</code>
                              </div>
                              {permission.description && (
                                <div className="text-xs text-muted-foreground mt-1">{permission.description}</div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {roles.map((role, roleIndex) => {
                                const rolePerms = rolePermissionsQueries[roleIndex]?.data || [];
                                const isAssigned = rolePerms.some((p: any) => p.id === permission.id);
                                
                                return (
                                  <Button
                                    key={role.id}
                                    variant={isAssigned ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handleTogglePermission(role.id, permission.id, isAssigned)}
                                    data-testid={`button-toggle-${permission.id}-${role.id}`}
                                  >
                                    {isAssigned ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                    <span className="ml-1">{role.name}</span>
                                  </Button>
                                );
                              })}
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteClick(permission)}
                              data-testid={`button-delete-permission-${permission.id}`}
                            >
                              <Trash2 className="flex items-center gap-2" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Create Permission Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-create-permission">
          <DialogHeader>
            <DialogTitle>{t.admin.permissions.crud.createTitle}</DialogTitle>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.permissions.crud.nameLabel}*</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t.admin.permissions.crud.namePlaceholder} data-testid="input-permission-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="module"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.permissions.crud.moduleLabel}*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-module">
                          <SelectValue placeholder={t.admin.permissions.placeholders.selectModule} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {catalog.map(module => (
                          <SelectItem key={module.slug} value={module.slug}>
                            {module.slug}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="submodule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.permissions.crud.submoduleLabel}*</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                      disabled={!watchModule}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-submodule">
                          <SelectValue placeholder={!watchModule ? t.admin.permissions.placeholders.selectModuleFirst : t.admin.permissions.placeholders.selectSubmodule} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {selectedModuleDef?.submodules.map(submodule => (
                          <SelectItem key={submodule.slug} value={submodule.slug}>
                            {submodule.slug}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="actions"
                render={() => (
                  <FormItem>
                    <FormLabel>{t.admin.permissions.crud.actionsLabel}*</FormLabel>
                    <div className="space-y-2">
                      {selectedSubmoduleDef?.actions.map(action => (
                        <FormField
                          key={action}
                          control={form.control}
                          name="actions"
                          render={({ field }) => (
                            <FormItem className="flex items-center gap-2">
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(action)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    const updated = checked
                                      ? [...current, action]
                                      : current.filter(v => v !== action);
                                    field.onChange(updated);
                                  }}
                                  disabled={!watchSubmodule}
                                  data-testid={`checkbox-action-${action}`}
                                />
                              </FormControl>
                              <FormLabel className="!mt-0 cursor-pointer font-normal">
                                {action}
                              </FormLabel>
                            </FormItem>
                          )}
                        />
                      ))}
                      {!watchSubmodule && (
                        <p className="text-sm text-muted-foreground">{t.admin.permissions.helpers.selectSubmoduleToSeeActions}</p>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="permission"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.permissions.crud.descriptionLabel}</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder={t.admin.permissions.crud.descriptionPlaceholder} data-testid="text-element" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {previewCodes.length > 0 && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-semibold mb-2 block">{t.admin.permissions.helpers.codesPreview}</Label>
                  <div className="space-y-1">
                    {previewCodes.map(code => (
                      <div key={code} className="flex items-center gap-2">
                        <Code className="w-3 h-3 text-muted-foreground" />
                        <code>{code}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {t.admin.permissions.crud.cancel}
                </Button>
                <Button 
                  type="submit" 
                  disabled={createPermissionMutation.isPending}
                  data-testid="button-submit-permission"
                >
                  {createPermissionMutation.isPending ? t.admin.permissions.crud.creating : t.admin.permissions.crud.create}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Permission Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent data-testid="test-id">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.admin.permissions.crud.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.admin.permissions.crud.deleteConfirm} <strong>{selectedPermission?.name}</strong>?
              {permissionUsage && permissionUsage.inUse && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
                  <p className="text-destructive font-semibold">{t.admin.permissions.helpers.permissionInUse}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li>• {permissionUsage.roleCount} {t.admin.permissions.crud.rolesUsing}</li>
                    <li>• {permissionUsage.userCount} {t.admin.permissions.crud.usersUsing}</li>
                  </ul>
                  <p className="mt-2 text-xs">{t.admin.permissions.crud.usageWarning}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.admin.permissions.crud.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedPermission && deletePermissionMutation.mutate(selectedPermission.id)}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-element"
            >
              {deletePermissionMutation.isPending ? t.admin.permissions.crud.deleting : t.admin.permissions.crud.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
