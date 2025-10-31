// shared/namespaces.ts
// Sistema de namespaces predefinidos amigáveis para organização do conhecimento

export interface NamespaceCategory {
  id: string;
  label: string;
  icon: string; // lucide-react icon name
  namespaces: NamespaceOption[];
}

export interface NamespaceOption {
  value: string;
  label: string;
  description?: string;
}

// Namespaces organizados por categoria
export const NAMESPACE_CATEGORIES: NamespaceCategory[] = [
  {
    id: "curation",
    label: "Curadoria",
    icon: "Settings",
    namespaces: [
      { value: "curation", label: "🏷️ TODA Curadoria", description: "Acesso a todo namespace de curadoria" },
      { value: "curation/pending", label: "Pendente", description: "Conteúdo aguardando revisão" },
      { value: "curation/approved", label: "Aprovado", description: "Conteúdo aprovado para publicação" },
      { value: "curation/rejected", label: "Rejeitado", description: "Conteúdo rejeitado" },
      { value: "curation/drafts", label: "Rascunhos", description: "Rascunhos em elaboração" },
    ],
  },
  {
    id: "customer_service",
    label: "Atendimento ao Cliente",
    icon: "Headphones",
    namespaces: [
      { value: "atendimento", label: "🏷️ TODO Atendimento", description: "Acesso a todo namespace de atendimento" },
      { value: "atendimento/geral", label: "Atendimento Geral", description: "Perguntas frequentes e suporte" },
      { value: "atendimento/reclamacoes", label: "Reclamações", description: "Gestão de reclamações" },
      { value: "atendimento/devolucoes", label: "Devoluções", description: "Políticas de devolução" },
      { value: "atendimento/garantias", label: "Garantias", description: "Informações sobre garantias" },
    ],
  },
  {
    id: "finance",
    label: "Finanças",
    icon: "DollarSign",
    namespaces: [
      { value: "financas", label: "🏷️ TODAS Finanças", description: "Acesso a todo namespace de finanças" },
      { value: "financas/relatorios", label: "Relatórios Financeiros", description: "Balanços e demonstrativos" },
      { value: "financas/investimentos", label: "Investimentos", description: "Análises de investimento" },
      { value: "financas/impostos", label: "Impostos", description: "Documentação fiscal" },
      { value: "financas/orcamentos", label: "Orçamentos", description: "Planejamento orçamentário" },
      { value: "financas/contas", label: "Contas a Pagar/Receber", description: "Gestão de contas" },
    ],
  },
  {
    id: "technology",
    label: "Tecnologia",
    icon: "Laptop",
    namespaces: [
      { value: "tecnologia", label: "🏷️ TODA Tecnologia", description: "Acesso a todo namespace de tecnologia" },
      { value: "tech/desenvolvimento", label: "Desenvolvimento", description: "Código e arquitetura" },
      { value: "tech/infraestrutura", label: "Infraestrutura", description: "DevOps e cloud" },
      { value: "tech/seguranca", label: "Segurança", description: "Políticas de segurança" },
      { value: "tech/apis", label: "APIs", description: "Documentação de APIs" },
      { value: "tech/bugs", label: "Bugs & Issues", description: "Rastreamento de problemas" },
    ],
  },
  {
    id: "tourism",
    label: "Turismo",
    icon: "Globe",
    namespaces: [
      { value: "turismo", label: "🏷️ TODO Turismo", description: "Acesso a todo namespace de turismo" },
      { value: "turismo/destinos", label: "Destinos", description: "Informações sobre destinos" },
      { value: "turismo/hospedagem", label: "Hospedagem", description: "Hotéis e acomodações" },
      { value: "turismo/passeios", label: "Passeios", description: "Tours e atividades" },
      { value: "turismo/gastronomia", label: "Gastronomia", description: "Restaurantes e culinária" },
      { value: "turismo/transporte", label: "Transporte", description: "Voos, trens e transfers" },
    ],
  },
  {
    id: "automotive",
    label: "Automóveis",
    icon: "Car",
    namespaces: [
      { value: "auto", label: "🏷️ TODOS Automóveis", description: "Acesso a todo namespace automotivo" },
      { value: "auto/manutencao", label: "Manutenção", description: "Guias de manutenção" },
      { value: "auto/modelos", label: "Modelos", description: "Catálogo de veículos" },
      { value: "auto/pecas", label: "Peças", description: "Inventário de peças" },
      { value: "auto/servicos", label: "Serviços", description: "Serviços automotivos" },
    ],
  },
  {
    id: "management",
    label: "Gestão",
    icon: "BarChart3",
    namespaces: [
      { value: "gestao", label: "🏷️ TODA Gestão", description: "Acesso a todo namespace de gestão" },
      { value: "gestao/recursos-humanos", label: "Recursos Humanos", description: "Políticas de RH" },
      { value: "gestao/processos", label: "Processos", description: "Procedimentos operacionais" },
      { value: "gestao/qualidade", label: "Qualidade", description: "Controle de qualidade" },
      { value: "gestao/projetos", label: "Projetos", description: "Gestão de projetos" },
    ],
  },
  {
    id: "calendar",
    label: "Calendário",
    icon: "Calendar",
    namespaces: [
      { value: "calendario", label: "🏷️ TODO Calendário", description: "Acesso a todo namespace de calendário" },
      { value: "calendario/eventos", label: "Eventos", description: "Agenda de eventos" },
      { value: "calendario/feriados", label: "Feriados", description: "Feriados e datas comemorativas" },
      { value: "calendario/reunioes", label: "Reuniões", description: "Agendamento de reuniões" },
      { value: "calendario/prazos", label: "Prazos", description: "Deadlines e entregas" },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: "Megaphone",
    namespaces: [
      { value: "marketing", label: "🏷️ TODO Marketing", description: "Acesso a todo namespace de marketing" },
      { value: "marketing/campanhas", label: "Campanhas", description: "Campanhas publicitárias" },
      { value: "marketing/conteudo", label: "Conteúdo", description: "Biblioteca de conteúdo" },
      { value: "marketing/analytics", label: "Analytics", description: "Métricas e análises" },
      { value: "marketing/social", label: "Redes Sociais", description: "Gestão de redes sociais" },
    ],
  },
  {
    id: "general",
    label: "Geral",
    icon: "BookOpen",
    namespaces: [
      { value: "geral", label: "🏷️ TODO Geral", description: "Acesso a todo namespace geral" },
      { value: "geral/conhecimento", label: "Conhecimento Geral", description: "Base de conhecimento geral" },
      { value: "geral/politicas", label: "Políticas", description: "Políticas da empresa" },
      { value: "geral/treinamento", label: "Treinamento", description: "Material de treinamento" },
      { value: "geral/documentacao", label: "Documentação", description: "Documentação técnica" },
    ],
  },
];

// Função para obter todos os namespaces como lista plana
export function getAllNamespaces(): NamespaceOption[] {
  return NAMESPACE_CATEGORIES.flatMap(cat => cat.namespaces);
}

// Função para buscar namespace por valor
export function getNamespaceByValue(value: string): NamespaceOption | undefined {
  return getAllNamespaces().find(ns => ns.value === value);
}

// Função para obter label de um namespace
export function getNamespaceLabel(value: string): string {
  const ns = getNamespaceByValue(value);
  return ns?.label || value;
}

// Wildcard especial para acesso total (apenas para Curador)
export const WILDCARD_NAMESPACE = "*";
