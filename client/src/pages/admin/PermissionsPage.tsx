import { useState } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Check, X, Plus, Edit, Trash2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface Permission {
  id: number;
  code: string;
  name: string;
  description: string | null;
  module: string | null;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
}

interface RolePermission {
  id: number;
  code: string;
  name: string;
  description: string | null;
  module: string | null;
}

/**
 * Permissions Management Page
 * 
 * Displays a matrix of roles and permissions, allowing admins to:
 * - View all permissions grouped by module
 * - Assign/revoke permissions for each role
 * - See which roles have which permissions at a glance
 */
export default function PermissionsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set(["all"]));
  
  // CRUD Modal states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);
  const [permissionUsage, setPermissionUsage] = useState<{ roleCount: number; userCount: number } | null>(null);
  
  // Form states for Create/Edit
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formModule, setFormModule] = useState("");

  // Fetch all permissions
  const { data: allPermissions = [], isLoading: permissionsLoading } = useQuery<Permission[]>({
    queryKey: ['/api/admin/permissions'],
  });

  // Fetch all roles
  const { data: roles = [], isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ['/api/admin/roles'],
  });

  // Fetch permissions for each role using useQueries (React hooks-compliant dynamic queries)
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

  // Create permission mutation
  const createPermissionMutation = useMutation({
    mutationFn: async (data: { code: string; name: string; description: string; module: string }) => {
      const res = await apiRequest('/api/admin/permissions', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/permissions'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: t.common.createSuccess,
        description: t.admin.permissions.toasts.createSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.createError,
        description: error.message || t.admin.permissions.toasts.createError,
        variant: "destructive",
      });
    },
  });

  // Update permission mutation
  const updatePermissionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { code: string; name: string; description: string; module: string } }) => {
      const res = await apiRequest(`/api/admin/permissions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/permissions'] });
      setIsEditDialogOpen(false);
      setSelectedPermission(null);
      resetForm();
      toast({
        title: t.common.updateSuccess,
        description: t.admin.permissions.toasts.updateSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.updateError,
        description: error.message || t.admin.permissions.toasts.updateError,
        variant: "destructive",
      });
    },
  });

  // Delete permission mutation
  const deletePermissionMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(`/api/admin/permissions/${id}`, {
        method: 'DELETE',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/permissions'] });
      setIsDeleteDialogOpen(false);
      setSelectedPermission(null);
      setPermissionUsage(null);
      toast({
        title: t.common.deleteSuccess,
        description: t.admin.permissions.toasts.deleteSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.deleteError,
        description: error.message || t.admin.permissions.toasts.deleteError,
        variant: "destructive",
      });
    },
  });

  // Helper functions
  const resetForm = () => {
    setFormCode("");
    setFormName("");
    setFormDescription("");
    setFormModule("");
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (permission: Permission) => {
    setSelectedPermission(permission);
    setFormCode(permission.code);
    setFormName(permission.name);
    setFormDescription(permission.description || "");
    setFormModule(permission.module || "");
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = async (permission: Permission) => {
    setSelectedPermission(permission);
    // Fetch usage
    try {
      const res = await fetch(`/api/admin/permissions/${permission.id}/usage`);
      const usage = await res.json();
      setPermissionUsage(usage);
    } catch {
      setPermissionUsage({ roleCount: 0, userCount: 0 });
    }
    setIsDeleteDialogOpen(true);
  };

  const handleCreate = () => {
    createPermissionMutation.mutate({
      code: formCode,
      name: formName,
      description: formDescription,
      module: formModule,
    });
  };

  const handleUpdate = () => {
    if (!selectedPermission) return;
    updatePermissionMutation.mutate({
      id: selectedPermission.id,
      data: {
        code: formCode,
        name: formName,
        description: formDescription,
        module: formModule,
      },
    });
  };

  const handleDelete = () => {
    if (!selectedPermission) return;
    deletePermissionMutation.mutate(selectedPermission.id);
  };

  // Group permissions by module
  const permissionsByModule = allPermissions.reduce((acc, permission) => {
    const module = permission.module || 'general';
    if (!acc[module]) {
      acc[module] = [];
    }
    acc[module].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  // Check if role has permission
  const roleHasPermission = (roleId: number, permissionId: number): boolean => {
    const roleIndex = roles.findIndex(r => r.id === roleId);
    if (roleIndex === -1) return false;
    
    const rolePermissions = (rolePermissionsQueries[roleIndex]?.data as RolePermission[]) || [];
    return rolePermissions.some(p => p.id === permissionId);
  };

  // Toggle permission for role
  const togglePermission = (roleId: number, permissionId: number) => {
    const hasPermission = roleHasPermission(roleId, permissionId);
    
    if (hasPermission) {
      revokePermissionMutation.mutate({ roleId, permissionId });
    } else {
      assignPermissionMutation.mutate({ roleId, permissionId });
    }
  };

  // Toggle module expansion
  const toggleModule = (module: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return next;
    });
  };

  const isLoading = permissionsLoading || rolesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">{t.admin.permissions.title}</h1>
            <p className="text-muted-foreground mt-1" data-testid="text-page-description">
              {t.admin.permissions.description}
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-muted-foreground">{t.common.loading}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">{t.admin.permissions.title}</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-page-description">
            {t.admin.permissions.description}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreateDialog} data-testid="button-create-permission">
            <Plus className="w-4 h-4 mr-2" />
            {t.admin.permissions.crud.createButton}
          </Button>
        </div>
      </div>

      {/* Permissions Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            {t.admin.permissions.matrix.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Roles Header */}
            <div className="flex gap-4 border-b pb-4">
              <div className="flex-1 font-semibold" data-testid="text-permission-column">
                {t.admin.permissions.matrix.permissionColumn}
              </div>
              <div className="flex gap-2">
                {roles.map(role => (
                  <div 
                    key={role.id} 
                    className="w-24 text-center"
                    data-testid={`text-role-header-${role.id}`}
                  >
                    <Badge variant="outline" className="w-full">
                      {role.name}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Permission Rows Grouped by Module */}
            {Object.entries(permissionsByModule).map(([module, permissions]) => (
              <div key={module} className="space-y-2">
                {/* Module Header */}
                <Button
                  variant="ghost"
                  onClick={() => toggleModule(module)}
                  className="w-full justify-start hover-elevate"
                  data-testid={`button-toggle-module-${module}`}
                >
                  <span className="font-semibold capitalize">
                    {expandedModules.has(module) ? '▼' : '▶'} {module}
                  </span>
                  <Badge variant="secondary" className="ml-2">
                    {permissions.length}
                  </Badge>
                </Button>

                {/* Permission Rows */}
                {expandedModules.has(module) && (
                  <div className="space-y-2 ml-4">
                    {permissions.map(permission => (
                      <div 
                        key={permission.id} 
                        className="flex gap-4 items-center py-2 border-b last:border-0"
                        data-testid={`row-permission-${permission.id}`}
                      >
                        <div className="flex-1">
                          <div className="font-medium" data-testid={`text-permission-name-${permission.id}`}>
                            {permission.name}
                          </div>
                          <div className="text-sm text-muted-foreground" data-testid={`text-permission-code-${permission.id}`}>
                            {permission.code}
                          </div>
                          {permission.description && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {permission.description}
                            </div>
                          )}
                        </div>

                        {/* Edit/Delete Buttons */}
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditDialog(permission)}
                            data-testid={`button-edit-permission-${permission.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openDeleteDialog(permission)}
                            data-testid={`button-delete-permission-${permission.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Permission Toggle Buttons */}
                        <div className="flex gap-2">
                          {roles.map(role => {
                            const hasPermission = roleHasPermission(role.id, permission.id);
                            return (
                              <Button
                                key={role.id}
                                size="icon"
                                variant={hasPermission ? "default" : "outline"}
                                onClick={() => togglePermission(role.id, permission.id)}
                                disabled={assignPermissionMutation.isPending || revokePermissionMutation.isPending}
                                className="w-24"
                                data-testid={`button-toggle-permission-${role.id}-${permission.id}`}
                              >
                                {hasPermission ? (
                                  <Check className="w-4 h-4" />
                                ) : (
                                  <X className="w-4 h-4" />
                                )}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Empty State */}
            {allPermissions.length === 0 && (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-no-permissions">
                {t.admin.permissions.matrix.noPermissions}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Create Permission Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-permission">
          <DialogHeader>
            <DialogTitle>{t.admin.permissions.crud.createTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">{t.admin.permissions.crud.codeLabel}*</Label>
              <Input
                id="code"
                placeholder={t.admin.permissions.crud.codePlaceholder}
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                data-testid="input-permission-code"
              />
            </div>
            <div>
              <Label htmlFor="name">{t.admin.permissions.crud.nameLabel}*</Label>
              <Input
                id="name"
                placeholder={t.admin.permissions.crud.namePlaceholder}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                data-testid="input-permission-name"
              />
            </div>
            <div>
              <Label htmlFor="module">{t.admin.permissions.crud.moduleLabel}*</Label>
              <Input
                id="module"
                placeholder={t.admin.permissions.crud.modulePlaceholder}
                value={formModule}
                onChange={(e) => setFormModule(e.target.value)}
                data-testid="input-permission-module"
              />
            </div>
            <div>
              <Label htmlFor="description">{t.admin.permissions.crud.descriptionLabel}</Label>
              <Textarea
                id="description"
                placeholder={t.admin.permissions.crud.descriptionPlaceholder}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                data-testid="input-permission-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} data-testid="button-cancel-create">
              {t.admin.permissions.crud.cancel}
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={createPermissionMutation.isPending || !formCode || !formName || !formModule}
              data-testid="button-confirm-create"
            >
              {createPermissionMutation.isPending ? t.admin.permissions.crud.creating : t.admin.permissions.crud.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Permission Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-permission">
          <DialogHeader>
            <DialogTitle>{t.admin.permissions.crud.editTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-code">{t.admin.permissions.crud.codeLabel}*</Label>
              <Input
                id="edit-code"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
                data-testid="input-edit-permission-code"
              />
            </div>
            <div>
              <Label htmlFor="edit-name">{t.admin.permissions.crud.nameLabel}*</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                data-testid="input-edit-permission-name"
              />
            </div>
            <div>
              <Label htmlFor="edit-module">{t.admin.permissions.crud.moduleLabel}*</Label>
              <Input
                id="edit-module"
                value={formModule}
                onChange={(e) => setFormModule(e.target.value)}
                data-testid="input-edit-permission-module"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">{t.admin.permissions.crud.descriptionLabel}</Label>
              <Textarea
                id="edit-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                data-testid="input-edit-permission-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} data-testid="button-cancel-edit">
              {t.admin.permissions.crud.cancel}
            </Button>
            <Button 
              onClick={handleUpdate} 
              disabled={updatePermissionMutation.isPending || !formCode || !formName || !formModule}
              data-testid="button-confirm-edit"
            >
              {updatePermissionMutation.isPending ? t.admin.permissions.crud.saving : t.admin.permissions.crud.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Permission Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-delete-permission">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.admin.permissions.crud.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPermission && (
                <div className="space-y-2">
                  <p>
                    {t.admin.permissions.crud.deleteConfirm} <strong>{selectedPermission.name}</strong>?
                  </p>
                  {permissionUsage && (
                    <div className="bg-muted p-3 rounded-md space-y-1 text-sm">
                      <p>{t.admin.permissions.crud.usageInfo}</p>
                      <ul className="list-disc list-inside">
                        <li>{permissionUsage.roleCount} {t.admin.permissions.crud.rolesUsing}</li>
                        <li>{permissionUsage.userCount} {t.admin.permissions.crud.usersUsing}</li>
                      </ul>
                      {(permissionUsage.roleCount > 0 || permissionUsage.userCount > 0) && (
                        <p className="text-destructive font-medium mt-2">
                          {t.admin.permissions.crud.usageWarning}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t.admin.permissions.crud.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deletePermissionMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deletePermissionMutation.isPending ? t.admin.permissions.crud.deleting : t.admin.permissions.crud.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
