import { useState } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Check, X } from "lucide-react";
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
    </div>
  );
}
