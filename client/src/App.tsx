import { Switch, Route, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "./lib/i18n";
import ChatPage from "@/pages/chat/ChatPage";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import KnowledgeBasePage from "@/pages/admin/KnowledgeBasePage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/knowledge-base" component={KnowledgeBasePage} />
      <Route path="/admin/:section" component={AdminDashboard} />
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
