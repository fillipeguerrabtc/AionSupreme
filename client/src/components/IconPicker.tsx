import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  // Common icons for namespaces
  Database, FileText, Folder, FolderTree, BookOpen,
  DollarSign, TrendingUp, Calculator, Receipt, Wallet,
  Code, Server, Lock, Webhook, Bug, Laptop,
  Globe, Map, Hotel, Compass, UtensilsCrossed, Plane,
  Car, Wrench, CarFront, Cog, Briefcase,
  Users, Workflow, CheckSquare, FolderKanban, BarChart3,
  Calendar, CalendarDays, CalendarCheck, CalendarClock, AlarmClock,
  Megaphone, Target, FileType, Share2, Mail,
  Settings, Clock, CheckCircle, XCircle, FileEdit,
  Headphones, HelpCircle, AlertTriangle, RotateCcw, Shield,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  // Database & Files
  Database, FileText, Folder, FolderTree, BookOpen,
  // Finance
  DollarSign, TrendingUp, Calculator, Receipt, Wallet,
  // Technology
  Code, Server, Lock, Webhook, Bug, Laptop,
  // Tourism
  Globe, Map, Hotel, Compass, UtensilsCrossed, Plane,
  // Automotive
  Car, Wrench, CarFront, Cog, Briefcase,
  // Management
  Users, Workflow, CheckSquare, FolderKanban, BarChart3,
  // Calendar
  Calendar, CalendarDays, CalendarCheck, CalendarClock, AlarmClock,
  // Marketing
  Megaphone, Target, FileType, Share2, Mail,
  // Curation & Support
  Settings, Clock, CheckCircle, XCircle, FileEdit,
  Headphones, HelpCircle, AlertTriangle, RotateCcw, Shield,
};

const ICON_CATEGORIES = {
  "Geral": ["Database", "FileText", "Folder", "FolderTree", "BookOpen"],
  "Finanças": ["DollarSign", "TrendingUp", "Calculator", "Receipt", "Wallet"],
  "Tecnologia": ["Code", "Server", "Lock", "Webhook", "Bug", "Laptop"],
  "Turismo": ["Globe", "Map", "Hotel", "Compass", "UtensilsCrossed", "Plane"],
  "Automóveis": ["Car", "Wrench", "CarFront", "Cog", "Briefcase"],
  "Gestão": ["Users", "Workflow", "CheckSquare", "FolderKanban", "BarChart3"],
  "Calendário": ["Calendar", "CalendarDays", "CalendarCheck", "CalendarClock", "AlarmClock"],
  "Marketing": ["Megaphone", "Target", "FileType", "Share2", "Mail"],
  "Suporte": ["Settings", "Clock", "CheckCircle", "XCircle", "FileEdit", "Headphones", "HelpCircle", "AlertTriangle", "RotateCcw", "Shield"],
};

interface IconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filteredIcons = Object.keys(ICON_MAP).filter(name =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  const SelectedIcon = value && ICON_MAP[value] ? ICON_MAP[value] : FileText;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          data-testid="button-icon-picker"
        >
          <SelectedIcon className="h-4 w-4" />
          <span className="flex-1 text-left">
            {value || "Selecionar ícone..."}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-4" align="start">
        <div className="space-y-4">
          <Input
            placeholder="Buscar ícone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
            data-testid="input-icon-search"
          />
          
          {search ? (
            <div className="grid grid-cols-8 gap-2 max-h-[300px] overflow-y-auto">
              {filteredIcons.map((name) => {
                const Icon = ICON_MAP[name];
                return (
                  <Button
                    key={name}
                    variant={value === name ? "default" : "ghost"}
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                    title={name}
                    data-testid={`button-icon-${name.toLowerCase()}`}
                  >
                    <Icon className="h-5 w-5" />
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4 max-h-[400px] overflow-y-auto">
              {Object.entries(ICON_CATEGORIES).map(([category, icons]) => (
                <div key={category} className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    {category}
                  </h4>
                  <div className="grid grid-cols-8 gap-2">
                    {icons.map((name) => {
                      const Icon = ICON_MAP[name];
                      return (
                        <Button
                          key={name}
                          variant={value === name ? "default" : "ghost"}
                          size="icon"
                          className="h-10 w-10"
                          onClick={() => {
                            onChange(name);
                            setOpen(false);
                          }}
                          title={name}
                          data-testid={`button-icon-${name.toLowerCase()}`}
                        >
                          <Icon className="h-5 w-5" />
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            Mais ícones em{" "}
            <a
              href="https://lucide.dev/icons"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              lucide.dev
            </a>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
