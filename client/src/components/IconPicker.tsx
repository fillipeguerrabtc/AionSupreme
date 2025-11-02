import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText } from "lucide-react";
import { ICON_MAP } from "@/lib/icon-map";

const ICON_CATEGORIES = {
  "📁 Geral": ["Database", "FileText", "Folder", "FolderTree", "BookOpen", "File", "Files", "Archive", "Inbox"],
  "💰 Finanças": ["DollarSign", "TrendingUp", "TrendingDown", "Calculator", "Receipt", "Wallet", "CreditCard", "Coins", "Banknote", "PiggyBank", "BadgeDollarSign"],
  "💻 Tecnologia": ["Code", "Server", "Lock", "Webhook", "Bug", "Laptop", "Monitor", "Smartphone", "Tablet", "Cloud", "CloudUpload", "CloudDownload", "HardDrive", "Cpu", "CircuitBoard", "Terminal", "Boxes"],
  "🛒 E-commerce": ["ShoppingCart", "ShoppingBag", "Package", "Package2", "Store", "Tag", "Percent", "Gift", "Sparkles"],
  "🏥 Saúde": ["Heart", "Activity", "Pill", "Stethoscope", "Hospital", "Syringe", "Thermometer", "Cross", "HeartPulse", "Ambulance"],
  "🎓 Educação": ["GraduationCap", "School", "BookMarked", "Library", "Award", "Trophy", "Medal", "Bookmark", "PenTool"],
  "⚖️ Jurídico": ["Scale", "FileCheck", "FileSearch", "Stamp", "ScrollText", "ShieldCheck", "Gavel"],
  "👥 RH & Pessoas": ["Users", "User", "UserPlus", "UserCheck", "UserX", "UsersRound", "IdCard", "Handshake", "UserCircle", "Contact"],
  "💬 Comunicação": ["MessageCircle", "MessageSquare", "Phone", "Video", "Send", "Mail", "AtSign", "Megaphone", "Radio"],
  "🎬 Mídia": ["Image", "Film", "Music", "Mic", "Camera", "Youtube", "Instagram", "PlayCircle", "Tv", "Newspaper"],
  "🍕 Comida": ["Coffee", "Pizza", "Wine", "Soup", "ChefHat", "Apple", "Utensils", "UtensilsCrossed", "Cookie", "IceCream"],
  "🏠 Imóveis": ["Home", "Building", "Building2", "Warehouse", "Key", "DoorOpen", "DoorClosed", "Bed", "Sofa", "Armchair"],
  "🌿 Natureza": ["Leaf", "Trees", "Sprout", "Flower2", "Sun", "CloudRain", "Droplets", "Wind", "Mountain", "Waves"],
  "🏋️ Esportes": ["Dumbbell", "Bike", "Footprints", "Flame", "Flag"],
  "🔬 Ciência": ["Microscope", "TestTube", "Atom", "Beaker", "FlaskConical", "Rocket", "Telescope"],
  "🔒 Segurança": ["Shield", "ShieldAlert", "Eye", "EyeOff", "Fingerprint", "KeyRound", "AlertTriangle", "ShieldQuestion"],
  "🏭 Indústria": ["Factory", "Hammer", "Wrench", "Cog", "Settings", "Box", "Container"],
  "🎨 Arte": ["Palette", "Brush", "Scissors", "Layers", "Shapes", "Sparkle", "Stars", "Wand2"],
  "🐾 Animais": ["Dog", "Cat", "Bird", "Fish", "Rabbit"],
  "🚚 Logística": ["Truck", "Ship", "Anchor", "MapPin", "Map", "Globe", "Plane", "Car", "CarFront", "Train", "Bus"],
  "✈️ Turismo": ["Hotel", "Compass", "Luggage", "Palmtree", "Ticket", "MapPinned", "UtensilsCrossed"],
  "📊 Gestão": ["Workflow", "CheckSquare", "FolderKanban", "BarChart3", "Briefcase", "PieChart", "LineChart", "BarChart", "TrendingUpDown"],
  "📅 Tempo": ["Calendar", "CalendarDays", "CalendarCheck", "CalendarClock", "AlarmClock", "Clock", "Timer", "Hourglass", "Watch"],
  "📢 Marketing": ["Share2", "FileType", "Zap", "Hash", "Tv2", "Podcast"],
  "🎧 Suporte": ["HelpCircle", "RotateCcw", "LifeBuoy", "Headphones", "MessagesSquare", "Bot"],
  "⚡ Ações": ["CheckCircle", "XCircle", "FileEdit", "Search", "Filter", "Plus", "Minus", "Edit", "Trash", "Download", "Upload"],
  "💡 Energia": ["Lightbulb", "Power", "Lightning", "Battery", "Plug", "Moon"],
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          data-testid="button-icon-picker"
        >
          <SelectedIcon className="h-5 w-5" />
          <span className="flex-1 text-left">
            {value || "Selecionar ícone..."}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Selecionar Ícone</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Buscar ícone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
            data-testid="input-icon-search"
          />
          
          <ScrollArea className="h-[500px] pr-4">
            {search ? (
              <div className="grid grid-cols-8 gap-2">
                {filteredIcons.map((name) => {
                  const Icon = ICON_MAP[name];
                  return (
                    <Button
                      key={name}
                      variant={value === name ? "default" : "ghost"}
                      size="icon"
                      className="h-12 w-12"
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                      }}
                      title={name}
                      data-testid={`button-icon-${name.toLowerCase()}`}
                    >
                      <Icon className="h-6 w-6" />
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
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
                            className="h-12 w-12"
                            onClick={() => {
                              onChange(name);
                              setOpen(false);
                            }}
                            title={name}
                            data-testid={`button-icon-${name.toLowerCase()}`}
                          >
                            <Icon className="h-6 w-6" />
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

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
      </DialogContent>
    </Dialog>
  );
}
