import { Switch, Route, useRoute, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "./lib/i18n";
import { usePageTitle } from "./hooks/usePageTitle";
import ChatPage from "@/pages/chat/ChatPage";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import GPUDashboard from "@/pages/admin/gpu-dashboard";
import MetaLearningDashboard from "@/pages/meta-learning-dashboard";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function ProtectedRoute({ component: Component }: { component: any }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isFetched, isError } = useQuery<any>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // CRITICAL SECURITY: Redirect if error, not authenticated, OR not admin
  useEffect(() => {
    if (isError) {
      // Query error (e.g., 401) → redirect to login
      console.log('[ProtectedRoute] Query error (401?), redirecting to /login');
      setLocation("/login");
    } else if (isFetched) {
      if (!user) {
        console.log('[ProtectedRoute] Not authenticated, redirecting to /login');
        setLocation("/login");
      } else if (!user.isAdmin) {
        console.log('[ProtectedRoute] User is not admin, redirecting to /');
        setLocation("/");
      }
    }
  }, [user, isFetched, isError, setLocation]);

  // Show loading while checking authentication
  if (isLoading || !isFetched) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }

  // SECURITY: Block rendering if error, not authenticated, or not admin
  if (isError || !user) {
    console.log('[ProtectedRoute] Blocking render - error or not authenticated');
    return null;
  }

  if (!user.isAdmin) {
    console.log('[ProtectedRoute] Blocking render - not admin');
    return null;
  }

  console.log('[ProtectedRoute] Admin authenticated, rendering component');
  return <Component />;
}

function Router() {
  usePageTitle();
  
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route path="/login" component={Login} />
      <Route path="/admin/meta-learning" component={() => <ProtectedRoute component={MetaLearningDashboard} />} />
      <Route path="/admin/gpu-dashboard" component={() => <ProtectedRoute component={GPUDashboard} />} />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminDashboard} />} />
      <Route path="/admin/:section" component={() => <ProtectedRoute component={AdminDashboard} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
