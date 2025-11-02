import {
  // Geral & Arquivos
  Database, FileText, Folder, FolderTree, BookOpen, File, Files, Archive, Inbox, 
  // Finanças
  DollarSign, TrendingUp, TrendingDown, Calculator, Receipt, Wallet, CreditCard, Coins, Banknote, PiggyBank, BadgeDollarSign,
  // Tecnologia
  Code, Server, Lock, Webhook, Bug, Laptop, Monitor, Smartphone, Tablet, Cloud, CloudUpload, CloudDownload, HardDrive, Cpu, CircuitBoard, Terminal, Boxes,
  // E-commerce & Vendas
  ShoppingCart, ShoppingBag, Package, Package2, Store, Tag, Percent, Gift, Sparkles,
  // Saúde & Medicina
  Heart, Activity, Pill, Stethoscope, Hospital, Syringe, Thermometer, Cross, HeartPulse, Ambulance,
  // Educação
  GraduationCap, School, BookMarked, Library, Award, Trophy, Medal, Bookmark, PenTool,
  // Jurídico
  Scale, FileCheck, FileSearch, Stamp, ScrollText, ShieldCheck, Gavel,
  // RH & Pessoas
  Users, User, UserPlus, UserCheck, UserX, UsersRound, IdCard, Handshake, UserCircle, Contact,
  // Comunicação
  MessageCircle, MessageSquare, Phone, Video, Send, Mail, AtSign, Megaphone, Radio,
  // Mídia & Conteúdo
  Image, Film, Music, Mic, Camera, Youtube, Instagram, PlayCircle, Tv, Newspaper,
  // Comida & Bebida
  Coffee, Pizza, Wine, Soup, ChefHat, Apple, Utensils, UtensilsCrossed, Cookie, IceCream,
  // Casa & Imóveis
  Home, Building, Building2, Warehouse, Key, DoorOpen, DoorClosed, Bed, Sofa, Armchair,
  // Natureza & Ambiente
  Leaf, Trees, Sprout, Flower2, Sun, CloudRain, Droplets, Wind, Mountain, Waves,
  // Esportes & Fitness
  Dumbbell, Bike, Footprints, Flame, Flag,
  // Ciência & Lab
  Microscope, TestTube, Atom, Beaker, FlaskConical, Rocket, Telescope,
  // Segurança
  Shield, ShieldAlert, Eye, EyeOff, Fingerprint, KeyRound, AlertTriangle, ShieldQuestion,
  // Produção & Indústria
  Factory, Hammer, Wrench, Cog, Settings, Box, Container,
  // Arte & Design
  Palette, Brush, Scissors, Layers, Shapes, Sparkle, Stars, Wand2,
  // Animais & Pets
  Dog, Cat, Bird, Fish, Rabbit,
  // Transporte & Logística
  Truck, Ship, Anchor, MapPin, Map, Globe, Plane, Car, CarFront, Train, Bus,
  // Turismo & Viagem
  Hotel, Compass, Luggage, Palmtree, Ticket, MapPinned,
  // Gestão & Negócios
  Workflow, CheckSquare, FolderKanban, BarChart3, Briefcase, PieChart, LineChart, BarChart, TrendingUpDown,
  // Calendário & Tempo
  Calendar, CalendarDays, CalendarCheck, CalendarClock, AlarmClock, Clock, Timer, Hourglass, Watch,
  // Marketing & Publicidade
  Share2, FileType, Hash, Tv2, Podcast,
  // Suporte & Assistência
  HelpCircle, RotateCcw, LifeBuoy, Headphones, MessagesSquare, Bot,
  // Ações & Controles
  CheckCircle, XCircle, FileEdit, Search, Filter, Plus, Minus, Edit, Trash, Download, Upload,
  // Energia & Utilidades
  Lightbulb, Power, Battery, Plug, Moon, Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * ICON_MAP - Mapa compartilhado de todos os ícones disponíveis
 * Usado em: IconPicker, NamespaceSelector, NamespaceIconDisplay
 * IMPORTANTE: Manter sincronizado em todos os componentes
 */
export const ICON_MAP: Record<string, LucideIcon> = {
  // Geral & Arquivos
  Database,
  FileText,
  Folder,
  FolderTree,
  BookOpen,
  File,
  Files,
  Archive,
  Inbox,
  // Finanças
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calculator,
  Receipt,
  Wallet,
  CreditCard,
  Coins,
  Banknote,
  PiggyBank,
  BadgeDollarSign,
  // Tecnologia
  Code,
  Server,
  Lock,
  Webhook,
  Bug,
  Laptop,
  Monitor,
  Smartphone,
  Tablet,
  Cloud,
  CloudUpload,
  CloudDownload,
  HardDrive,
  Cpu,
  CircuitBoard,
  Terminal,
  Boxes,
  // E-commerce & Vendas
  ShoppingCart,
  ShoppingBag,
  Package,
  Package2,
  Store,
  Tag,
  Percent,
  Gift,
  Sparkles,
  // Saúde & Medicina
  Heart,
  Activity,
  Pill,
  Stethoscope,
  Hospital,
  Syringe,
  Thermometer,
  Cross,
  HeartPulse,
  Ambulance,
  // Educação
  GraduationCap,
  School,
  BookMarked,
  Library,
  Award,
  Trophy,
  Medal,
  Bookmark,
  PenTool,
  // Jurídico
  Scale,
  FileCheck,
  FileSearch,
  Stamp,
  ScrollText,
  ShieldCheck,
  Gavel,
  // RH & Pessoas
  Users,
  User,
  UserPlus,
  UserCheck,
  UserX,
  UsersRound,
  IdCard,
  Handshake,
  UserCircle,
  Contact,
  // Comunicação
  MessageCircle,
  MessageSquare,
  Phone,
  Video,
  Send,
  Mail,
  AtSign,
  Megaphone,
  Radio,
  // Mídia & Conteúdo
  Image,
  Film,
  Music,
  Mic,
  Camera,
  Youtube,
  Instagram,
  PlayCircle,
  Tv,
  Newspaper,
  // Comida & Bebida
  Coffee,
  Pizza,
  Wine,
  Soup,
  ChefHat,
  Apple,
  Utensils,
  UtensilsCrossed,
  Cookie,
  IceCream,
  // Casa & Imóveis
  Home,
  Building,
  Building2,
  Warehouse,
  Key,
  DoorOpen,
  DoorClosed,
  Bed,
  Sofa,
  Armchair,
  // Natureza & Ambiente
  Leaf,
  Trees,
  Sprout,
  Flower2,
  Sun,
  CloudRain,
  Droplets,
  Wind,
  Mountain,
  Waves,
  // Esportes & Fitness
  Dumbbell,
  Bike,
  Footprints,
  Flame,
  Flag,
  // Ciência & Lab
  Microscope,
  TestTube,
  Atom,
  Beaker,
  FlaskConical,
  Rocket,
  Telescope,
  // Segurança
  Shield,
  ShieldAlert,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  AlertTriangle,
  ShieldQuestion,
  // Produção & Indústria
  Factory,
  Hammer,
  Wrench,
  Cog,
  Settings,
  Box,
  Container,
  // Arte & Design
  Palette,
  Brush,
  Scissors,
  Layers,
  Shapes,
  Sparkle,
  Stars,
  Wand2,
  // Animais & Pets
  Dog,
  Cat,
  Bird,
  Fish,
  Rabbit,
  // Transporte & Logística
  Truck,
  Ship,
  Anchor,
  MapPin,
  Map,
  Globe,
  Plane,
  Car,
  CarFront,
  Train,
  Bus,
  // Turismo & Viagem
  Hotel,
  Compass,
  Luggage,
  Palmtree,
  Ticket,
  MapPinned,
  // Gestão & Negócios
  Workflow,
  CheckSquare,
  FolderKanban,
  BarChart3,
  Briefcase,
  PieChart,
  LineChart,
  BarChart,
  TrendingUpDown,
  // Calendário & Tempo
  Calendar,
  CalendarDays,
  CalendarCheck,
  CalendarClock,
  AlarmClock,
  Clock,
  Timer,
  Hourglass,
  Watch,
  // Marketing & Publicidade
  Share2,
  FileType,
  Zap,
  Hash,
  Tv2,
  Podcast,
  // Suporte & Assistência
  HelpCircle,
  RotateCcw,
  LifeBuoy,
  Headphones,
  MessagesSquare,
  Bot,
  // Ações & Controles
  CheckCircle,
  XCircle,
  FileEdit,
  Search,
  Filter,
  Plus,
  Minus,
  Edit,
  Trash,
  Download,
  Upload,
  // Energia & Utilidades
  Lightbulb,
  Power,
  Battery,
  Plug,
  Moon,
  Lightning: Zap, // Alias for compatibility with ICON_CATEGORIES
};
