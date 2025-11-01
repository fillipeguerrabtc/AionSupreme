import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Check, 
  ChevronsUpDown, 
  X, 
  Plus,
  Settings,
  Headphones,
  DollarSign,
  Laptop,
  Globe,
  Car,
  BarChart3,
  Calendar,
  Megaphone,
  BookOpen,
  FolderTree,
  LucideIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Namespace } from "@shared/schema";
import { cn } from "@/lib/utils";

// Wildcard namespace for curator (full access)
const WILDCARD_NAMESPACE = "*";

const ICON_MAP: Record<string, LucideIcon> = {
  Settings,
  Headphones,
  DollarSign,
  Laptop,
  Globe,
  Car,
  BarChart3,
  Calendar,
  Megaphone,
  BookOpen,
  FolderTree,
};

interface NamespaceSelectorProps {
  value: string[];
  onChange: (namespaces: string[]) => void;
  placeholder?: string;
  className?: string;
  allowWildcard?: boolean;
  allowCustom?: boolean;
  rootOnly?: boolean; // Mostrar apenas namespaces raiz (sem "/")
  subOnly?: boolean; // Mostrar apenas subnamespaces (com "/")
  parentNamespace?: string; // Filtrar subnamespaces por namespace pai
}

export function NamespaceSelector({
  value,
  onChange,
  placeholder = "Selecione namespaces...",
  className,
  allowWildcard = false,
  allowCustom = true,
  rootOnly = false,
  subOnly = false,
  parentNamespace,
}: NamespaceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customNamespace, setCustomNamespace] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Fetch ALL namespaces from database (unified approach)
  const { data: dbNamespaces = [] } = useQuery<Namespace[]>({
    queryKey: ["/api/namespaces"],
  });

  // Filtrar namespaces baseado em props
  const filteredNamespaces = dbNamespaces.filter((ns) => {
    // Filtrar por root only (sem "/")
    if (rootOnly && ns.name.includes("/")) {
      return false;
    }

    // Filtrar por sub only (com "/")
    if (subOnly && !ns.name.includes("/")) {
      return false;
    }

    // Filtrar por namespace pai específico
    if (parentNamespace && !ns.name.startsWith(parentNamespace + "/")) {
      return false;
    }

    return true;
  });

  const toggleNamespace = (namespace: string) => {
    if (value.includes(namespace)) {
      onChange(value.filter(ns => ns !== namespace));
    } else {
      onChange([...value, namespace]);
    }
  };

  const removeNamespace = (namespace: string) => {
    onChange(value.filter(ns => ns !== namespace));
  };

  const clearAll = () => {
    onChange([]);
  };

  const selectAll = () => {
    // Coletar todos os namespaces disponíveis filtrados (sem wildcard)
    const allNamespaces = filteredNamespaces.map(ns => ns.name);
    onChange(allNamespaces);
  };

  const addCustomNamespace = () => {
    const trimmed = customNamespace.trim();
    if (!trimmed) return;

    // Aceitar tanto namespace simples (ex: "tecnologia") quanto hierárquico (ex: "categoria/subcategoria")
    // Validar apenas caracteres válidos (letras, números, hífen, underscore, barra)
    if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)?$/i.test(trimmed)) {
      alert("Namespace inválido. Use apenas letras, números, hífen e underscore.\nExemplos válidos:\n- tecnologia\n- empresa-x/financas\n- kb/geral");
      return;
    }

    if (!value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setCustomNamespace("");
      setShowCustomInput(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            data-testid="button-select-namespaces"
          >
            <span className="truncate">
              {value.length === 0
                ? placeholder
                : `${value.length} namespace${value.length > 1 ? "s" : ""} selecionado${value.length > 1 ? "s" : ""}`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" onWheel={(e) => e.stopPropagation()}>
          <Command shouldFilter={true}>
            <CommandInput placeholder="Buscar namespaces..." data-testid="input-search-namespaces" />
            <CommandList className="max-h-[300px]" style={{ overflowY: 'auto' }}>
              {/* Botão Selecionar Todos no topo */}
              <CommandGroup>
                <CommandItem
                  onSelect={selectAll}
                  data-testid="button-select-all-namespaces"
                  className="font-semibold bg-primary/5"
                >
                  <Check className="mr-2 h-4 w-4 opacity-100" />
                  <span>✅ Selecionar TODOS os namespaces</span>
                </CommandItem>
              </CommandGroup>
              
              <CommandEmpty>
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Nenhum namespace encontrado.
                  {allowCustom && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      onClick={() => setShowCustomInput(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Criar namespace customizado
                    </Button>
                  )}
                </div>
              </CommandEmpty>
              {allowCustom && (
                  <CommandGroup heading="Criar Novo">
                    {!showCustomInput ? (
                      <CommandItem
                        onSelect={() => setShowCustomInput(true)}
                        data-testid="button-create-custom-namespace"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        <span>Criar namespace customizado</span>
                      </CommandItem>
                    ) : (
                      <div className="p-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                        <Input
                          placeholder="categoria/subcategoria (ex: empresa-x/vendas)"
                          value={customNamespace}
                          onChange={(e) => setCustomNamespace(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addCustomNamespace();
                            } else if (e.key === "Escape") {
                              setShowCustomInput(false);
                              setCustomNamespace("");
                            }
                          }}
                          autoFocus
                          data-testid="input-custom-namespace"
                          className="text-sm"
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={addCustomNamespace}
                            data-testid="button-add-custom-namespace"
                            className="flex-1 h-7 text-xs"
                          >
                            Adicionar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setShowCustomInput(false);
                              setCustomNamespace("");
                            }}
                            className="flex-1 h-7 text-xs"
                          >
                            Cancelar
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Formatos aceitos: "tecnologia" ou "categoria/subcategoria"
                        </p>
                      </div>
                    )}
                  </CommandGroup>
                )}
                {allowWildcard && (
                  <CommandGroup heading="Acesso Especial">
                    <CommandItem
                      onSelect={() => toggleNamespace(WILDCARD_NAMESPACE)}
                      data-testid={`namespace-option-${WILDCARD_NAMESPACE}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value.includes(WILDCARD_NAMESPACE) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="font-mono text-sm">*</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        (Acesso total - apenas para Curador)
                      </span>
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup heading="Namespaces Disponíveis">
                  {filteredNamespaces.map((ns) => (
                    <CommandItem
                      key={ns.name}
                      onSelect={() => toggleNamespace(ns.name)}
                      data-testid={`namespace-option-${ns.name}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value.includes(ns.name) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{ns.displayName || ns.name}</span>
                        {ns.description && (
                          <span className="text-xs text-muted-foreground">{ns.description}</span>
                        )}
                        <span className="text-xs font-mono text-muted-foreground mt-0.5">
                          {ns.name}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="max-h-[200px] overflow-y-auto p-2 border border-border/50 rounded-md bg-background/50">
          <div className="flex flex-wrap gap-1.5">
            {value.map((namespace) => {
              const ns = dbNamespaces.find(n => n.name === namespace);
              return (
                <Badge
                  key={namespace}
                  variant="secondary"
                  className="gap-1"
                  data-testid={`badge-namespace-${namespace}`}
                >
                  <span className="text-xs font-mono">{ns?.displayName || namespace}</span>
                  <button
                    type="button"
                    onClick={() => removeNamespace(namespace)}
                    className="ml-1 hover:bg-destructive/20 rounded-sm"
                    data-testid={`button-remove-namespace-${namespace}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            {value.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAll}
                className="h-6 text-xs"
                data-testid="button-clear-all-namespaces"
              >
                Limpar tudo
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
