import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Edit, Trash2, Shield, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useLanguage } from "@/lib/i18n";

interface User {
  id: string;
  email: string;
  name: string;
  userType: 'dashboard_admin' | 'chat_only' | 'both';
  roles: string[];
  isAdmin: boolean;
  createdAt: string;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
}

interface Permission {
  id: number;
  code: string;
  name: string;
  description: string | null;
  module: string | null;
}

interface UserPermission {
  id: number;
  code: string;
  name: string;
}

export default function UsersPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUserPermissions, setSelectedUserPermissions] = useState<number[]>([]);

  const form = useForm<{
    email: string;
    name: string;
    password: string;
    accessDashboard: boolean;
    accessChat: boolean;
    roleIds: string[];
  }>({
    defaultValues: {
      email: "",
      name: "",
      password: "",
      accessDashboard: true,
      accessChat: true,
      roleIds: [],
    },
  });

  // Fetch users
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
  });

  // Fetch roles
  const { data: roles } = useQuery<Role[]>({
    queryKey: ['/api/admin/roles'],
  });

  // Fetch all permissions
  const { data: allPermissions = [] } = useQuery<Permission[]>({
    queryKey: ['/api/admin/permissions'],
  });

  // Fetch user-specific permissions
  const { data: userPermissions = [] } = useQuery<UserPermission[]>({
    queryKey: ['/api/admin/users', selectedUser?.id, 'permissions'],
    enabled: !!selectedUser?.id,
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: t.common.success,
        description: t.admin.userManagement.toasts.createSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.error,
        description: error.message || t.admin.userManagement.toasts.createError,
        variant: "destructive",
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest(`/api/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      form.reset();
      toast({
        title: t.common.success,
        description: t.admin.userManagement.toasts.updateSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.error,
        description: error.message || t.admin.userManagement.toasts.updateError,
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest(`/api/admin/users/${id}`, {
        method: 'DELETE',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: t.common.success,
        description: t.admin.userManagement.toasts.deleteSuccess,
      });
    },
    onError: (error: any) => {
      toast({
        title: t.common.error,
        description: error.message || t.admin.userManagement.toasts.deleteError,
        variant: "destructive",
      });
    },
  });

  const handleCreateUser = (data: any) => {
    // Convert accessDashboard/accessChat to userType
    const { accessDashboard, accessChat, ...rest } = data;
    let userType: 'dashboard_admin' | 'chat_only' | 'both';
    
    if (accessDashboard && accessChat) {
      userType = 'both';
    } else if (accessDashboard) {
      userType = 'dashboard_admin';
    } else if (accessChat) {
      userType = 'chat_only';
    } else {
      toast({
        title: t.common.error,
        description: t.admin.userManagement.dialog.userTypeRequired,
        variant: "destructive",
      });
      return;
    }
    
    createUserMutation.mutate({ ...rest, userType });
  };

  const handleUpdateUser = (data: any) => {
    if (!selectedUser) return;
    
    // Convert accessDashboard/accessChat to userType
    const { accessDashboard, accessChat, ...rest } = data;
    let userType: 'dashboard_admin' | 'chat_only' | 'both';
    
    if (accessDashboard && accessChat) {
      userType = 'both';
    } else if (accessDashboard) {
      userType = 'dashboard_admin';
    } else if (accessChat) {
      userType = 'chat_only';
    } else {
      toast({
        title: t.common.error,
        description: t.admin.userManagement.dialog.userTypeRequired,
        variant: "destructive",
      });
      return;
    }
    
    updateUserMutation.mutate({ id: selectedUser.id, data: { ...rest, userType } });
  };

  const handleDeleteUser = (id: string) => {
    if (confirm(t.admin.userManagement.deleteConfirm)) {
      deleteUserMutation.mutate(id);
    }
  };

  const handleEditClick = async (user: User) => {
    setSelectedUser(user);
    
    // Convert userType to accessDashboard/accessChat
    const accessDashboard = user.userType === 'dashboard_admin' || user.userType === 'both';
    const accessChat = user.userType === 'chat_only' || user.userType === 'both';
    
    form.reset({
      email: user.email,
      name: user.name,
      password: "",
      accessDashboard,
      accessChat,
      roleIds: [],
    });
    
    // Load user-specific permissions
    try {
      const res = await fetch(`/api/admin/users/${user.id}/permissions`);
      const permissions: UserPermission[] = await res.json();
      setSelectedUserPermissions(permissions.map(p => p.id));
    } catch {
      setSelectedUserPermissions([]);
    }
    
    setIsEditDialogOpen(true);
  };

  // Mutations for user-specific permissions
  const assignUserPermissionMutation = useMutation({
    mutationFn: async ({ userId, permissionId }: { userId: string; permissionId: number }) => {
      const res = await apiRequest(`/api/admin/users/${userId}/permissions`, {
        method: 'POST',
        body: JSON.stringify({ permissionId }),
        headers: { 'Content-Type': 'application/json' },
      });
      return res.json();
    },
    onSuccess: () => {
      if (selectedUser) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users', selectedUser.id, 'permissions'] });
      }
    },
  });

  const revokeUserPermissionMutation = useMutation({
    mutationFn: async ({ userId, permissionId }: { userId: string; permissionId: number }) => {
      const res = await apiRequest(`/api/admin/users/${userId}/permissions/${permissionId}`, {
        method: 'DELETE',
      });
      return res.json();
    },
    onSuccess: () => {
      if (selectedUser) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users', selectedUser.id, 'permissions'] });
      }
    },
  });

  const toggleUserPermission = async (permissionId: number) => {
    if (!selectedUser) return;
    
    const hasPermission = selectedUserPermissions.includes(permissionId);
    
    if (hasPermission) {
      await revokeUserPermissionMutation.mutateAsync({ userId: selectedUser.id, permissionId });
      setSelectedUserPermissions(prev => prev.filter(id => id !== permissionId));
    } else {
      await assignUserPermissionMutation.mutateAsync({ userId: selectedUser.id, permissionId });
      setSelectedUserPermissions(prev => [...prev, permissionId]);
    }
  };

  const handleCreateClick = () => {
    form.reset({
      email: "",
      name: "",
      password: "",
      accessDashboard: true,
      accessChat: true,
      roleIds: [],
    });
    setIsCreateDialogOpen(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold">{t.admin.userManagement.title}</h1>
          <p className="text-muted-foreground mt-1">
            {t.admin.userManagement.subtitle}
          </p>
        </div>
        <Button onClick={handleCreateClick} data-testid="button-create-user">
          <UserPlus className="w-4 h-4 mr-2" />
          {t.admin.userManagement.addUser}
        </Button>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {t.admin.userManagement.alertInfo}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.userManagement.usersCount} ({users?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t.admin.userManagement.loading}
            </div>
          ) : users && users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-users">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">{t.admin.userManagement.table.name}</th>
                    <th className="text-left p-3 font-semibold">{t.admin.userManagement.table.email}</th>
                    <th className="text-left p-3 font-semibold">{t.admin.userManagement.table.type}</th>
                    <th className="text-left p-3 font-semibold">{t.admin.userManagement.table.roles}</th>
                    <th className="text-left p-3 font-semibold">{t.admin.userManagement.table.created}</th>
                    <th className="text-right p-3 font-semibold">{t.admin.userManagement.table.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b" data-testid={`row-user-${user.id}`}>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {user.name}
                          {user.isAdmin && (
                            <Shield className="w-4 h-4 text-primary" />
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">{user.email}</td>
                      <td className="p-3">
                        <Badge variant={user.userType === 'chat_only' ? 'secondary' : 'default'}>
                          {user.userType === 'both' 
                            ? t.admin.userManagement.dialog.userTypeBoth
                            : user.userType === 'dashboard_admin'
                              ? t.admin.userManagement.dialog.userTypeDashboard
                              : t.admin.userManagement.dialog.userTypeChat}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {user.roles.length > 0 ? (
                            user.roles.map((role) => (
                              <Badge key={role} variant="outline" className="text-xs">
                                {role}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground text-sm">{t.admin.userManagement.table.noRoles}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground text-sm">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEditClick(user)}
                            data-testid={`button-edit-user-${user.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteUser(user.id)}
                            data-testid={`button-delete-user-${user.id}`}
                          >
                            <Trash2 className="flex items-center gap-2" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {t.admin.userManagement.noUsers} {t.admin.userManagement.noUsersDesc}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-user">
          <DialogHeader>
            <DialogTitle>{t.admin.userManagement.dialog.createTitle}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateUser)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.userManagement.dialog.name}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t.admin.userManagement.dialog.namePlaceholder} data-testid="input-user-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.userManagement.dialog.email}</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder={t.admin.userManagement.dialog.emailPlaceholder} data-testid="input-element" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.userManagement.dialog.password}</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" placeholder={t.admin.userManagement.dialog.passwordPlaceholder} data-testid="input-user-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-3">
                <Label className="text-base font-semibold">{t.admin.userManagement.dialog.userTypeAccessLabel}</Label>
                <p className="text-sm text-muted-foreground">{t.admin.userManagement.dialog.userTypeAccessDescription}</p>
                
                <FormField
                  control={form.control}
                  name="accessDashboard"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox 
                          checked={field.value} 
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-access-dashboard"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 cursor-pointer">{t.admin.userManagement.dialog.userTypeDashboard}</FormLabel>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="accessChat"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox 
                          checked={field.value} 
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-access-chat"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 cursor-pointer">{t.admin.userManagement.dialog.userTypeChat}</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {t.admin.userManagement.dialog.cancel}
                </Button>
                <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-submit-user">
                  {createUserMutation.isPending ? t.admin.userManagement.dialog.creating : t.admin.userManagement.dialog.create}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-user" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.admin.userManagement.dialog.editTitle}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleUpdateUser)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.userManagement.dialog.name}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t.admin.userManagement.dialog.namePlaceholder} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.userManagement.dialog.email}</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder={t.admin.userManagement.dialog.emailPlaceholder} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.admin.userManagement.dialog.passwordEditNote}</FormLabel>
                    <FormControl>
                      <Input {...field} type="password" placeholder={t.admin.userManagement.dialog.passwordPlaceholder} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* User-Specific Permissions Section */}
              {selectedUser && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    <Label className="text-base font-semibold">{t.admin.userPermissions.title}</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t.admin.userPermissions.description}
                  </p>
                  
                  <div className="flex items-center gap-2">
                    {Object.entries(
                      allPermissions.reduce((acc, permission) => {
                        const module = permission.module || 'general';
                        if (!acc[module]) acc[module] = [];
                        acc[module].push(permission);
                        return acc;
                      }, {} as Record<string, Permission[]>)
                    ).map(([module, permissions]) => (
                      <div key={module} className="space-y-2">
                        <div className="flex items-center gap-2">{module}</div>
                        <div className="space-y-1 ml-4">
                          {permissions.map(permission => {
                            const isSelected = selectedUserPermissions.includes(permission.id);
                            return (
                              <div 
                                key={permission.id} 
                                className="flex items-center gap-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleUserPermission(permission.id)}
                                  className="flex items-center gap-2"
                                  data-testid={`checkbox-user-permission-${permission.id}`}
                                />
                                <div className="flex-1">
                                  <div className="text-sm">{permission.name}</div>
                                  <div className="text-xs text-muted-foreground">{permission.code}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label className="text-base font-semibold">{t.admin.userManagement.dialog.userTypeAccessLabel}</Label>
                <p className="text-sm text-muted-foreground">{t.admin.userManagement.dialog.userTypeAccessDescription}</p>
                
                <FormField
                  control={form.control}
                  name="accessDashboard"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox 
                          checked={field.value} 
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-edit-access-dashboard"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 cursor-pointer">{t.admin.userManagement.dialog.userTypeDashboard}</FormLabel>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="accessChat"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox 
                          checked={field.value} 
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-edit-access-chat"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0 cursor-pointer">{t.admin.userManagement.dialog.userTypeChat}</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  {t.admin.userManagement.dialog.cancel}
                </Button>
                <Button type="submit" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending ? t.admin.userManagement.dialog.updating : t.admin.userManagement.dialog.update}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
