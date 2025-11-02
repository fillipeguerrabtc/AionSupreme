import { useState, useRef } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Upload, Image as ImageIcon } from "lucide-react";
import { ICON_MAP } from "@/lib/icon-map";
import { useToast } from "@/hooks/use-toast";

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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const filteredIcons = Object.keys(ICON_MAP).filter(name =>
    name.toLowerCase().includes(search.toLowerCase())
  );

  // Verifica se é uma imagem customizada (URL)
  const isCustomImage = value && value.startsWith('/');
  const SelectedIcon = !isCustomImage && value && ICON_MAP[value] ? ICON_MAP[value] : FileText;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validar tipo de arquivo
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Erro",
        description: "Formato inválido. Use PNG, JPEG, GIF ou WEBP.",
        variant: "destructive",
      });
      return;
    }

    // Validar tamanho (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Erro",
        description: "Imagem muito grande. Máximo 2MB.",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('icon', file);

      // Usar fetch direto para FormData (não pode ter Content-Type manual)
      const res = await fetch('/api/icons/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Upload falhou');
      }

      const data = await res.json();
      onChange(data.url);
      setOpen(false);
      toast({
        title: "Sucesso",
        description: "Ícone customizado enviado!",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Falha ao enviar imagem. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          data-testid="button-icon-picker"
        >
          {isCustomImage ? (
            <img 
              src={value} 
              alt="Custom icon" 
              className="h-5 w-5 object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent && !parent.querySelector('svg')) {
                  const fallback = document.createElement('div');
                  fallback.innerHTML = `<svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z"/><path d="M15 2v5h5"/></svg>`;
                  parent.appendChild(fallback.firstChild!);
                }
              }}
            />
          ) : (
            <SelectedIcon className="h-5 w-5" />
          )}
          <span className="flex-1 text-left">
            {value || "Selecionar ícone..."}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Selecionar Ícone</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="library" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library" data-testid="tab-icon-library">
              📚 Biblioteca
            </TabsTrigger>
            <TabsTrigger value="custom" data-testid="tab-icon-custom">
              🎨 Customizado
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="space-y-4">
            <Input
              placeholder="Buscar ícone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
              data-testid="input-icon-search"
            />
            
            <ScrollArea className="h-[550px] pr-4">
            {search ? (
              <div className="grid grid-cols-6 gap-3">
                {filteredIcons.map((name) => {
                  const Icon = ICON_MAP[name];
                  return (
                    <Button
                      key={name}
                      variant={value === name ? "default" : "ghost"}
                      size="icon"
                      className="h-14 w-14"
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                      }}
                      title={name}
                      data-testid={`button-icon-${name.toLowerCase()}`}
                    >
                      <Icon className="h-7 w-7" />
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(ICON_CATEGORIES).map(([category, icons]) => (
                  <div key={category} className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground sticky top-0 bg-background py-1 z-10">
                      {category}
                    </h4>
                    <div className="grid grid-cols-6 gap-3">
                      {icons.map((name) => {
                        const Icon = ICON_MAP[name];
                        return (
                          <Button
                            key={name}
                            variant={value === name ? "default" : "ghost"}
                            size="icon"
                            className="h-14 w-14"
                            onClick={() => {
                              onChange(name);
                              setOpen(false);
                            }}
                            title={name}
                            data-testid={`button-icon-${name.toLowerCase()}`}
                          >
                            <Icon className="h-7 w-7" />
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
          </TabsContent>

          <TabsContent value="custom" className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleFileUpload}
                className="hidden"
                data-testid="input-icon-file"
              />
              
              <div className="flex flex-col items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Upload de Ícone Customizado</h4>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPEG, GIF ou WEBP (max 2MB)
                  </p>
                </div>
                
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  variant="outline"
                  className="gap-2"
                  data-testid="button-upload-icon"
                >
                  <Upload className="h-4 w-4" />
                  {uploading ? "Enviando..." : "Escolher Arquivo"}
                </Button>
              </div>

              <div className="pt-4 border-t space-y-2">
                <p className="text-xs text-muted-foreground">
                  💡 <strong>Dica:</strong> Use imagens quadradas (ex: 512x512px) para melhor resultado
                </p>
                <p className="text-xs text-muted-foreground">
                  ✨ GIFs animados são suportados!
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
