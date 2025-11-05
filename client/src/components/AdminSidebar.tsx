import {
  LayoutDashboard,
  Activity,
  Clock,
  DollarSign,
  Database,
  Server,
  Cpu,
  Sparkles,
  FileText,
  Settings as SettingsIcon,
  Users,
  UserCog,
  ClipboardCheck,
  FolderTree,
  Image,
  Timer,
  Eye,
  BarChart3,
  LogOut,
  Shield,
  ListTodo,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useLanguage } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { logoutAdmin } from "@/lib/authUtils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function AdminSidebar({ activeTab, onTabChange }: AdminSidebarProps) {
  const { t } = useLanguage();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { hasPermission } = usePermissions();
  const { isMobile, setOpenMobile } = useSidebar();

  const getUserInitials = () => {
    if (!user) return "?";
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return "A";
  };

  const menuItems = [
    {
      title: t.admin.tabs.overview,
      icon: LayoutDashboard,
      value: "overview",
      testId: "nav-overview",
      requiredPermission: "dashboard:overview:read",
    },
    {
      title: t.admin.tabs.telemetry,
      icon: BarChart3,
      value: "telemetry",
      testId: "nav-telemetry",
      requiredPermission: "telemetry:metrics:read",
    },
    {
      title: t.admin.tabs.tokenMonitoring,
      icon: Activity,
      value: "tokens",
      testId: "nav-tokens",
      requiredPermission: "telemetry:metrics:read",
    },
    {
      title: t.admin.tabs.history,
      icon: Clock,
      value: "history",
      testId: "nav-history",
      requiredPermission: "telemetry:usage:read",
    },
    {
      title: t.admin.tabs.costHistory,
      icon: DollarSign,
      value: "cost",
      testId: "nav-cost",
      requiredPermission: "telemetry:usage:read",
    },
    {
      title: t.admin.tabs.knowledgeBase,
      icon: Database,
      value: "knowledge",
      testId: "nav-knowledge",
      requiredPermission: "kb:documents:read",
    },
    {
      title: t.admin.tabs.gpuManagement,
      icon: Server,
      value: "gpu",
      testId: "nav-gpu",
      requiredPermission: "gpu:pool:read",
    },
    {
      title: t.admin.tabs.federatedTraining,
      icon: Cpu,
      value: "federated",
      testId: "nav-federated",
      requiredPermission: "training:jobs:read",
    },
    {
      title: t.admin.tabs.autoEvolution,
      icon: Sparkles,
      value: "evolution",
      testId: "nav-evolution",
      requiredPermission: "settings:system:read",
    },
    {
      title: t.admin.tabs.datasets,
      icon: FileText,
      value: "datasets",
      testId: "nav-datasets",
      requiredPermission: "training:datasets:read",
    },
    {
      title: t.admin.tabs.agents,
      icon: Users,
      value: "agents",
      testId: "nav-agents",
      requiredPermission: "agents:list:read",
    },
    {
      title: t.admin.userManagement.title,
      icon: UserCog,
      value: "users",
      testId: "nav-users",
      requiredPermission: "users:list:read",
    },
    {
      title: t.admin.permissions.title,
      icon: Shield,
      value: "permissions",
      testId: "nav-permissions",
      requiredPermission: "roles:permissions:manage",
    },
    {
      title: t.admin.tabs.curation,
      icon: ClipboardCheck,
      value: "curation",
      testId: "nav-curation",
      requiredPermission: "curation:queue:read",
    },
    {
      title: t.admin.jobs.title,
      icon: ListTodo,
      value: "jobs",
      testId: "nav-jobs",
      requiredPermission: "curation:queue:read",
    },
    {
      title: t.admin.knowledgeBase.imagesTab,
      icon: Image,
      value: "images",
      testId: "nav-images",
      requiredPermission: "kb:images:read",
    },
    {
      title: t.admin.imageSearch.title,
      icon: Eye,
      value: "image-search",
      testId: "nav-image-search",
      requiredPermission: "kb:images:read",
    },
    {
      title: t.admin.vision.title,
      icon: Eye,
      value: "vision",
      testId: "nav-vision",
      requiredPermission: "vision:status:read",
    },
    {
      title: t.admin.namespaces.title,
      icon: FolderTree,
      value: "namespaces",
      testId: "nav-namespaces",
      requiredPermission: "namespaces:list:read",
    },
    {
      title: t.admin.lifecycle.title,
      icon: Timer,
      value: "lifecycle",
      testId: "nav-lifecycle",
      requiredPermission: "settings:policies:read",
    },
    {
      title: t.admin.tabs.settings,
      icon: SettingsIcon,
      value: "settings",
      testId: "nav-settings",
      requiredPermission: "settings:policies:read",
    },
  ];

  // Filter menu items based on user permissions
  const visibleMenuItems = menuItems.filter(item => {
    // If no permission required, always show
    if (!item.requiredPermission) return true;
    // Otherwise, check if user has the required permission
    return hasPermission(item.requiredPermission);
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t.admin.sidebar.navigation}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleMenuItems.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    onClick={() => {
                      onTabChange(item.value);
                      if (isMobile) setOpenMobile(false);
                    }}
                    isActive={activeTab === item.value}
                    data-testid={item.testId}
                    tooltip={item.title}
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground text-center">Loading...</div>
        ) : isAuthenticated && user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 group-data-[collapsible=icon]:hidden">
              <Avatar className="w-8 h-8" data-testid="avatar-admin-user">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback>{getUserInitials()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" data-testid="text-admin-username">
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>
            <Button
              onClick={() => {
                logoutAdmin();
                if (isMobile) setOpenMobile(false);
              }}
              variant="ghost"
              className="w-full justify-start group-data-[collapsible=icon]:justify-center"
              data-testid="button-admin-logout"
            >
              <LogOut className="w-4 h-4 mr-2 group-data-[collapsible=icon]:mr-0" />
              <span className="group-data-[collapsible=icon]:hidden">Logout</span>
            </Button>
            <div className="text-xs text-muted-foreground text-center group-data-[collapsible=icon]:hidden">
              AION v1.0.0
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center">
            Not authenticated
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
