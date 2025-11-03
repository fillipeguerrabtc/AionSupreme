import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

/**
 * Permission object returned from backend
 */
interface Permission {
  id: number;
  code: string;
  name: string;
  description: string | null;
  module: string | null;
}

/**
 * Hook to manage user permissions
 * 
 * Fetches all permissions for the authenticated user and provides
 * a helper function to check if user has a specific permission.
 * 
 * @example
 * ```tsx
 * const { hasPermission, isLoading } = usePermissions();
 * 
 * if (hasPermission("kb:documents:create")) {
 *   return <Button>Create Document</Button>
 * }
 * ```
 */
export function usePermissions() {
  const { user, isAuthenticated } = useAuth();
  
  // Only fetch permissions if user is authenticated
  const { data: permissions = [], isLoading } = useQuery<Permission[]>({
    queryKey: ["/api/admin/users", user?.id, "permissions"],
    enabled: isAuthenticated && !!user?.id,
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  /**
   * Check if user has a specific permission
   * 
   * @param permissionCode - Permission code (e.g., "kb:documents:create")
   * @returns true if user has the permission, false otherwise
   */
  const hasPermission = (permissionCode: string): boolean => {
    if (!isAuthenticated || !permissions) return false;
    return permissions.some(p => p.code === permissionCode);
  };

  /**
   * Check if user has ANY of the provided permissions
   * 
   * @param permissionCodes - Array of permission codes
   * @returns true if user has at least one permission, false otherwise
   */
  const hasAnyPermission = (permissionCodes: string[]): boolean => {
    if (!isAuthenticated || !permissions) return false;
    return permissionCodes.some(code => 
      permissions.some(p => p.code === code)
    );
  };

  /**
   * Check if user has ALL of the provided permissions
   * 
   * @param permissionCodes - Array of permission codes
   * @returns true if user has all permissions, false otherwise
   */
  const hasAllPermissions = (permissionCodes: string[]): boolean => {
    if (!isAuthenticated || !permissions) return false;
    return permissionCodes.every(code => 
      permissions.some(p => p.code === code)
    );
  };

  return {
    permissions,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
