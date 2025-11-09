import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Folder, Trash2, Edit2, Check, X, ChevronDown, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ProjectsSidebarProps {
  currentProjectId: number | null;
  onSelectProject: (projectId: number | null) => void;
}

export function ProjectsSidebar({
  currentProjectId,
  onSelectProject,
}: ProjectsSidebarProps) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return response.json();
    },
    onSuccess: (newProject) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setIsCreating(false);
      setNewProjectName("");
      onSelectProject(newProject.id);
      toast({
        title: "Project created",
        description: `"${newProject.name}" has been created.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      await apiRequest(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditingId(null);
      setEditingName("");
      toast({
        title: "Project updated",
        description: "Project name has been changed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update project",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (projectId: number) => {
      await apiRequest(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (currentProjectId === deletedId) {
        onSelectProject(null);
      }
      toast({
        title: "Project deleted",
        description: "The project has been removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete project",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!newProjectName.trim()) return;
    createMutation.mutate(newProjectName.trim());
  };

  const handleUpdate = (id: number) => {
    if (!editingName.trim()) return;
    updateMutation.mutate({ id, name: editingName.trim() });
  };

  const handleDelete = (e: React.MouseEvent, projectId: number) => {
    e.stopPropagation();
    if (window.confirm("Delete this project? All conversations in this project will remain but won't be linked to it.")) {
      deleteMutation.mutate(projectId);
    }
  };

  const startEdit = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditingId(project.id);
    setEditingName(project.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="flex flex-col"
    >
      <div className="p-4 border-b border-white/10">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start font-semibold"
            data-testid="button-toggle-projects"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 mr-2" />
            ) : (
              <ChevronRight className="w-4 h-4 mr-2" />
            )}
            <Folder className="w-4 h-4 mr-2" />
            Projects
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="flex flex-col">
        <div className="p-2 border-b border-white/10">
          {isCreating ? (
            <div className="flex items-center gap-2 p-2">
              <Input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setIsCreating(false);
                    setNewProjectName("");
                  }
                }}
                data-testid="input-new-project-name"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCreate}
                disabled={!newProjectName.trim() || createMutation.isPending}
                data-testid="button-confirm-create-project"
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setIsCreating(false);
                  setNewProjectName("");
                }}
                data-testid="button-cancel-create-project"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => setIsCreating(true)}
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              data-testid="button-new-project"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 max-h-64">
          <div className="p-2 space-y-1">
            {/* "All Conversations" option */}
            <div
              className={`
                flex items-center gap-2 p-2 rounded-lg cursor-pointer
                transition-all duration-200 text-sm
                ${
                  currentProjectId === null
                    ? "bg-white/10 border border-white/20"
                    : "hover-elevate"
                }
              `}
              onClick={() => onSelectProject(null)}
              data-testid="project-item-all"
            >
              <Folder className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
              <span>All Conversations</span>
            </div>

            {isLoading ? (
              <div className="p-2 text-center text-xs text-muted">
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <div className="p-2 text-center text-xs text-muted">
                No projects yet
              </div>
            ) : (
              projects.map((project) => (
                <div
                  key={project.id}
                  className={`
                    group relative flex items-center gap-2 p-2 rounded-lg cursor-pointer
                    transition-all duration-200 text-sm
                    ${
                      currentProjectId === project.id
                        ? "bg-white/10 border border-white/20"
                        : "hover-elevate"
                    }
                  `}
                  onClick={() => editingId !== project.id && onSelectProject(project.id)}
                  data-testid={`project-item-${project.id}`}
                >
                  <Folder className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  
                  {editingId === project.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") handleUpdate(project.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        data-testid={`input-edit-project-${project.id}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdate(project.id);
                        }}
                        disabled={!editingName.trim() || updateMutation.isPending}
                        data-testid={`button-confirm-edit-${project.id}`}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          cancelEdit();
                        }}
                        data-testid={`button-cancel-edit-${project.id}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate">{project.name}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => startEdit(e, project)}
                          data-testid={`button-edit-project-${project.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => handleDelete(e, project.id)}
                          data-testid={`button-delete-project-${project.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}
