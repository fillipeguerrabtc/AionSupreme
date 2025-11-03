import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, AlertCircle } from "lucide-react";

interface ProtectedRouteProps {
  /**
   * Required permission code (e.g., "kb:documents:create")
   * If undefined, route is accessible to all authenticated users
   */
  requiredPermission?: string;
  
  /**
   * Component to render if user has permission
   */
  children: React.ReactNode;
  
  /**
   * Optional custom access denied message
   */
  accessDeniedMessage?: string;
}

/**
 * Protected Route Component
 * 
 * Wraps page content and checks if user has the required permission.
 * If permission is missing, shows an access denied message.
 * 
 * @example
 * ```tsx
 * <ProtectedRoute requiredPermission="kb:documents:create">
 *   <CreateDocumentPage />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
  requiredPermission,
  children,
  accessDeniedMessage = "You don't have permission to access this page.",
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { hasPermission, isLoading: permissionsLoading } = usePermissions();

  // Show loading state while checking auth and permissions
  if (authLoading || permissionsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-lg text-muted-foreground" data-testid="text-loading">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // If not authenticated, show unauthorized message
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Unauthorized
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" data-testid="alert-unauthorized">
              <AlertDescription>
                You must be logged in to access this page.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // If no permission required, render children
  if (!requiredPermission) {
    return <>{children}</>;
  }

  // Check if user has the required permission
  if (!hasPermission(requiredPermission)) {
    return (
      <div className="flex items-center justify-center h-screen p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Shield className="w-5 h-5" />
              Access Denied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" data-testid="alert-access-denied">
              <AlertDescription>{accessDeniedMessage}</AlertDescription>
            </Alert>
            <div className="mt-4 text-sm text-muted-foreground" data-testid="text-required-permission">
              Required permission: <code className="font-mono bg-muted px-1 py-0.5 rounded">{requiredPermission}</code>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User has permission, render children
  return <>{children}</>;
}
