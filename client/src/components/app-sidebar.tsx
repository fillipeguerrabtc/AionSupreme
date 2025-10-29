import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { login, logout } from "@/lib/authUtils";
import { LogIn, LogOut, Bot } from "lucide-react";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ProjectsSidebar } from "@/components/ProjectsSidebar";

interface AppSidebarProps {
  currentConversationId: number | null;
  onSelectConversation: (conversationId: number) => void;
  onNewConversation: () => void;
}

export function AppSidebar({
  currentConversationId,
  onSelectConversation,
  onNewConversation,
}: AppSidebarProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const getUserInitials = () => {
    if (!user) return "?";
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <Sidebar data-testid="app-sidebar">
      <SidebarHeader className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              AION
            </h2>
            <p className="text-xs text-muted">AI Assistant</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <ProjectsSidebar
          currentProjectId={selectedProjectId}
          onSelectProject={setSelectedProjectId}
        />
        <ConversationSidebar
          currentConversationId={currentConversationId}
          currentProjectId={selectedProjectId}
          onSelectConversation={onSelectConversation}
          onNewConversation={onNewConversation}
        />
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-white/10">
        {isLoading ? (
          <div className="text-sm text-muted text-center">Loading...</div>
        ) : isAuthenticated && user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
              <Avatar className="w-8 h-8" data-testid="avatar-user">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback>{getUserInitials()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-username">
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email}
                </p>
                <p className="text-xs text-muted truncate">{user.email}</p>
              </div>
            </div>
            <Button
              onClick={logout}
              variant="ghost"
              className="w-full justify-start"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        ) : (
          <Button
            onClick={login}
            variant="default"
            className="w-full"
            data-testid="button-login"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Login
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
