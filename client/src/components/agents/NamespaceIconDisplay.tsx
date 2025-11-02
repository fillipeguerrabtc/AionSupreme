import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FolderTree } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Namespace } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ICON_MAP } from "@/lib/icon-map";

interface NamespaceIconDisplayProps {
  namespaces: string[];
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function NamespaceIconDisplay({ 
  namespaces, 
  size = "md",
  className 
}: NamespaceIconDisplayProps) {
  const [, setLocation] = useLocation();

  // Fetch all namespaces from API
  const { data: allNamespaces = [] } = useQuery<Namespace[]>({
    queryKey: ["/api/namespaces"],
  });

  // Get namespace objects for the provided namespace names
  const namespaceObjects = namespaces
    .map(nsName => allNamespaces.find(ns => ns.name === nsName))
    .filter(Boolean) as Namespace[];

  if (namespaceObjects.length === 0) {
    return null;
  }

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const iconSize = sizeClasses[size];

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1.5", className)}>
        {namespaceObjects.map((ns) => {
          const Icon = ns.icon && ICON_MAP[ns.icon] ? ICON_MAP[ns.icon] : FolderTree;
          
          return (
            <Tooltip key={ns.name}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setLocation("/admin/namespaces")}
                  className="hover:scale-110 transition-transform cursor-pointer"
                  data-testid={`icon-namespace-${ns.name}`}
                >
                  <Icon className={cn(iconSize, "text-primary")} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-mono text-xs">{ns.name}</p>
                {ns.description && (
                  <p className="text-xs text-muted-foreground mt-1">{ns.description}</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
