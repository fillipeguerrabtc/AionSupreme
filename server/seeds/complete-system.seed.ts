/**
 * AION Complete System Seed
 * Populates DB with:
 * - Namespaces (all categories, zero hardcode)
 * - Tools (KB, Web, Vision, etc.)
 * - Agents (specialists + Curator)
 * - Agent-Tool associations
 */

import { db } from "../db";
import { namespaces, tools, agents, agentTools } from "@shared/schema";
import { sql } from "drizzle-orm";

interface NamespaceData {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  category: string;
}

interface ToolData {
  id: string;
  name: string;
  slug: string;
  type: string;
  config: any;
}

interface AgentData {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string;
  systemPrompt: string;
  ragNamespaces: string[];
  policy: {
    allowedTools: string[];
    perRequestBudgetUSD?: number;
    fallbackHuman?: boolean;
    escalationRules?: any;
  };
  budgetLimit?: number;
  escalationAgent?: string;
}

// ============================================================================
// NAMESPACES: All categories migrated from hardcoded to DB
// ============================================================================

const NAMESPACE_SEED_DATA: NamespaceData[] = [
  // CURADORIA
  { name: "curation", displayName: "Toda Curadoria", description: "Acesso a todo namespace de curadoria", icon: "Settings", category: "curation" },
  { name: "curation/pending", displayName: "Pendente", description: "Conteúdo aguardando revisão", icon: "Clock", category: "curation" },
  { name: "curation/approved", displayName: "Aprovado", description: "Conteúdo aprovado para publicação", icon: "CheckCircle", category: "curation" },
  { name: "curation/rejected", displayName: "Rejeitado", description: "Conteúdo rejeitado", icon: "XCircle", category: "curation" },
  { name: "curation/drafts", displayName: "Rascunhos", description: "Rascunhos em elaboração", icon: "FileEdit", category: "curation" },

  // ATENDIMENTO
  { name: "atendimento", displayName: "Todo Atendimento", description: "Acesso a todo namespace de atendimento", icon: "Headphones", category: "customer_service" },
  { name: "atendimento/geral", displayName: "Atendimento Geral", description: "Perguntas frequentes e suporte", icon: "HelpCircle", category: "customer_service" },
  { name: "atendimento/reclamacoes", displayName: "Reclamações", description: "Gestão de reclamações", icon: "AlertTriangle", category: "customer_service" },
  { name: "atendimento/devolucoes", displayName: "Devoluções", description: "Políticas de devolução", icon: "RotateCcw", category: "customer_service" },
  { name: "atendimento/garantias", displayName: "Garantias", description: "Informações sobre garantias", icon: "Shield", category: "customer_service" },

  // FINANÇAS
  { name: "financas", displayName: "Todas Finanças", description: "Acesso a todo namespace de finanças", icon: "DollarSign", category: "finance" },
  { name: "financas/relatorios", displayName: "Relatórios Financeiros", description: "Balanços e demonstrativos", icon: "FileText", category: "finance" },
  { name: "financas/investimentos", displayName: "Investimentos", description: "Análises de investimento", icon: "TrendingUp", category: "finance" },
  { name: "financas/impostos", displayName: "Impostos", description: "Documentação fiscal", icon: "Receipt", category: "finance" },
  { name: "financas/orcamentos", displayName: "Orçamentos", description: "Planejamento orçamentário", icon: "Calculator", category: "finance" },
  { name: "financas/contas", displayName: "Contas a Pagar/Receber", description: "Gestão de contas", icon: "Wallet", category: "finance" },

  // TECNOLOGIA
  { name: "tech", displayName: "Toda Tecnologia", description: "Acesso a todo namespace de tecnologia", icon: "Laptop", category: "technology" },
  { name: "tech/desenvolvimento", displayName: "Desenvolvimento", description: "Código e arquitetura", icon: "Code", category: "technology" },
  { name: "tech/infraestrutura", displayName: "Infraestrutura", description: "DevOps e cloud", icon: "Server", category: "technology" },
  { name: "tech/seguranca", displayName: "Segurança", description: "Políticas de segurança", icon: "Lock", category: "technology" },
  { name: "tech/apis", displayName: "APIs", description: "Documentação de APIs", icon: "Webhook", category: "technology" },
  { name: "tech/bugs", displayName: "Bugs & Issues", description: "Rastreamento de problemas", icon: "Bug", category: "technology" },

  // TURISMO
  { name: "turismo", displayName: "Todo Turismo", description: "Acesso a todo namespace de turismo", icon: "Globe", category: "tourism" },
  { name: "turismo/destinos", displayName: "Destinos", description: "Informações sobre destinos", icon: "Map", category: "tourism" },
  { name: "turismo/hospedagem", displayName: "Hospedagem", description: "Hotéis e acomodações", icon: "Hotel", category: "tourism" },
  { name: "turismo/passeios", displayName: "Passeios", description: "Tours e atividades", icon: "Compass", category: "tourism" },
  { name: "turismo/gastronomia", displayName: "Gastronomia", description: "Restaurantes e culinária", icon: "UtensilsCrossed", category: "tourism" },
  { name: "turismo/transporte", displayName: "Transporte", description: "Voos, trens e transfers", icon: "Plane", category: "tourism" },

  // AUTOMÓVEIS
  { name: "auto", displayName: "Todos Automóveis", description: "Acesso a todo namespace automotivo", icon: "Car", category: "automotive" },
  { name: "auto/manutencao", displayName: "Manutenção", description: "Guias de manutenção", icon: "Wrench", category: "automotive" },
  { name: "auto/modelos", displayName: "Modelos", description: "Catálogo de veículos", icon: "CarFront", category: "automotive" },
  { name: "auto/pecas", displayName: "Peças", description: "Inventário de peças", icon: "Cog", category: "automotive" },
  { name: "auto/servicos", displayName: "Serviços", description: "Serviços automotivos", icon: "Briefcase", category: "automotive" },

  // GESTÃO
  { name: "gestao", displayName: "Toda Gestão", description: "Acesso a todo namespace de gestão", icon: "BarChart3", category: "management" },
  { name: "gestao/recursos-humanos", displayName: "Recursos Humanos", description: "Políticas de RH", icon: "Users", category: "management" },
  { name: "gestao/processos", displayName: "Processos", description: "Procedimentos operacionais", icon: "Workflow", category: "management" },
  { name: "gestao/qualidade", displayName: "Qualidade", description: "Controle de qualidade", icon: "CheckSquare", category: "management" },
  { name: "gestao/projetos", displayName: "Projetos", description: "Gestão de projetos", icon: "FolderKanban", category: "management" },

  // CALENDÁRIO
  { name: "calendario", displayName: "Todo Calendário", description: "Acesso a todo namespace de calendário", icon: "Calendar", category: "calendar" },
  { name: "calendario/eventos", displayName: "Eventos", description: "Agenda de eventos", icon: "CalendarDays", category: "calendar" },
  { name: "calendario/feriados", displayName: "Feriados", description: "Feriados e datas comemorativas", icon: "CalendarCheck", category: "calendar" },
  { name: "calendario/reunioes", displayName: "Reuniões", description: "Agendamento de reuniões", icon: "CalendarClock", category: "calendar" },
  { name: "calendario/prazos", displayName: "Prazos", description: "Deadlines e entregas", icon: "AlarmClock", category: "calendar" },

  // MARKETING
  { name: "marketing", displayName: "Todo Marketing", description: "Acesso a todo namespace de marketing", icon: "Megaphone", category: "marketing" },
  { name: "marketing/campanhas", displayName: "Campanhas", description: "Campanhas publicitárias", icon: "Target", category: "marketing" },
  { name: "marketing/conteudo", displayName: "Conteúdo", description: "Biblioteca de conteúdo", icon: "FileType", category: "marketing" },
  { name: "marketing/redes-sociais", displayName: "Redes Sociais", description: "Gestão de redes sociais", icon: "Share2", category: "marketing" },
  { name: "marketing/email", displayName: "Email Marketing", description: "Campanhas de email", icon: "Mail", category: "marketing" },

  // GERAL (catch-all)
  { name: "geral", displayName: "Geral", description: "Conhecimento geral não categorizado", icon: "Database", category: "general" },
  { name: "kb/general", displayName: "KB Geral", description: "Base de conhecimento geral", icon: "BookOpen", category: "general" },
];

// ============================================================================
// TOOLS: Core capabilities
// ============================================================================

const TOOLS_SEED_DATA: ToolData[] = [
  {
    id: "kb_search",
    name: "Knowledge Base Search",
    slug: "kb-search",
    type: "kb_search",
    config: {
      description: "Search the internal knowledge base using semantic search (RAG)",
      parameters: {
        query: { type: "string", required: true, description: "Search query" },
        k: { type: "number", required: false, description: "Number of results (default: 5)" },
      },
    },
  },
  {
    id: "web_search",
    name: "Web Search",
    slug: "web-search",
    type: "web_search",
    config: {
      description: "Search the web using DuckDuckGo",
      parameters: {
        query: { type: "string", required: true, description: "Search query" },
        maxResults: { type: "number", required: false, description: "Max results (default: 5)" },
      },
    },
  },
  {
    id: "deepweb_search",
    name: "DeepWeb Search",
    slug: "deepweb-search",
    type: "deepweb_search",
    config: {
      description: "Search deep web and Tor network",
      parameters: {
        query: { type: "string", required: true, description: "Search query" },
      },
    },
  },
  {
    id: "vision_cascade",
    name: "Vision Analysis",
    slug: "vision-cascade",
    type: "vision",
    config: {
      description: "Analyze images using Vision AI cascade (Gemini → GPT-4V → Claude → HF)",
      parameters: {
        imageUrl: { type: "string", required: true, description: "Image URL or path" },
        prompt: { type: "string", required: false, description: "Analysis prompt" },
      },
    },
  },
  {
    id: "calculator",
    name: "Calculator",
    slug: "calculator",
    type: "calculator",
    config: {
      description: "Perform mathematical calculations",
      parameters: {
        expression: { type: "string", required: true, description: "Math expression to evaluate" },
      },
    },
  },
  {
    id: "crawler",
    name: "Web Crawler",
    slug: "web-crawler",
    type: "crawler",
    config: {
      description: "Crawl websites and extract content",
      parameters: {
        url: { type: "string", required: true, description: "URL to crawl" },
        depth: { type: "number", required: false, description: "Crawl depth (default: 2)" },
      },
    },
  },
  {
    id: "youtube_transcript",
    name: "YouTube Transcript",
    slug: "youtube-transcript",
    type: "youtube",
    config: {
      description: "Extract transcripts from YouTube videos",
      parameters: {
        videoUrl: { type: "string", required: true, description: "YouTube video URL" },
      },
    },
  },
];

// ============================================================================
// AGENTS: Specialists + Curator
// ============================================================================

const AGENTS_SEED_DATA: AgentData[] = [
  // CURATOR AGENT - Most important!
  {
    id: "curator",
    name: "Agente Curador",
    slug: "curator",
    type: "specialist",
    description: "Especialista em curadoria de conteúdo para a Knowledge Base. Revisa, categoriza e aprova conteúdo com alta qualidade.",
    systemPrompt: `Você é o Curador da Knowledge Base do AION.

**Sua Missão:**
- Revisar conteúdo submetido para curadoria
- Sugerir namespaces adequados baseado no conteúdo
- Detectar duplicatas na KB
- Validar qualidade (fontes confiáveis, precisão factual)
- Enriquecer com metadados (tags, descrições detalhadas)
- Garantir que apenas conteúdo de alta qualidade seja indexado

**Diretrizes:**
1. SEMPRE sugira pelo menos 2 namespaces por conteúdo
2. Use hierarquia quando apropriado (ex: "financas/impostos" em vez de só "financas")
3. Adicione tags descritivas e específicas
4. Se detectar duplicata, rejeite e informe qual documento já existe
5. Em caso de dúvida sobre qualidade, peça revisão humana

**Formato de Resposta:**
- Namespace sugerido: [lista]
- Tags sugeridas: [lista]
- Qualidade: [alta/média/baixa]
- Duplicatas detectadas: [sim/não]
- Observações: [suas análises]`,
    ragNamespaces: ["*"], // Acesso total para aprender
    policy: {
      allowedTools: ["kb_search", "web_search", "vision_cascade"],
      perRequestBudgetUSD: 0.10, // $0.10 per review
      fallbackHuman: true,
      escalationRules: {
        lowConfidenceThreshold: 0.6,
        negativeSentiment: false,
      },
    },
    budgetLimit: 10.0, // $10/day max
    escalationAgent: undefined,
  },

  // FINANCIAL AGENT
  {
    id: "financial_specialist",
    name: "Especialista Financeiro",
    slug: "financial-specialist",
    type: "specialist",
    description: "Especialista em finanças, investimentos, impostos e orçamentos.",
    systemPrompt: `Você é um especialista financeiro com acesso à base de conhecimento de finanças.

**Expertise:**
- Análise de investimentos
- Planejamento tributário
- Orçamentos e projeções
- Relatórios financeiros
- Gestão de contas

Sempre cite suas fontes da KB quando disponível. Se precisar de informações atualizadas (preços, cotações), use web search.`,
    ragNamespaces: ["financas", "financas/*"],
    policy: {
      allowedTools: ["kb_search", "web_search", "calculator"],
      perRequestBudgetUSD: 0.05,
      fallbackHuman: false,
    },
    budgetLimit: 5.0,
    escalationAgent: "curator",
  },

  // TECH SUPPORT AGENT
  {
    id: "tech_support",
    name: "Suporte Técnico",
    slug: "tech-support",
    type: "specialist",
    description: "Especialista em tecnologia, desenvolvimento, infraestrutura e segurança.",
    systemPrompt: `Você é um engenheiro de software sênior e especialista em infraestrutura.

**Expertise:**
- Desenvolvimento de software
- DevOps e Cloud
- Segurança cibernética
- APIs e integrações
- Debugging e troubleshooting

Use a KB para consultar documentação interna. Para bugs conhecidos, sempre verifique "tech/bugs" primeiro.`,
    ragNamespaces: ["tech", "tech/*"],
    policy: {
      allowedTools: ["kb_search", "web_search", "crawler"],
      perRequestBudgetUSD: 0.05,
    },
    budgetLimit: 5.0,
    escalationAgent: "curator",
  },

  // CUSTOMER SERVICE AGENT
  {
    id: "customer_service",
    name: "Atendente",
    slug: "customer-service",
    type: "specialist",
    description: "Especialista em atendimento ao cliente, suporte e resolução de problemas.",
    systemPrompt: `Você é um atendente profissional e empático.

**Expertise:**
- Suporte geral
- Gestão de reclamações
- Políticas de devolução e garantias
- FAQ e troubleshooting básico

Sempre mantenha tom cordial e profissional. Consulte a KB para políticas oficiais antes de responder.`,
    ragNamespaces: ["atendimento", "atendimento/*"],
    policy: {
      allowedTools: ["kb_search"],
      perRequestBudgetUSD: 0.02,
      fallbackHuman: true,
    },
    budgetLimit: 3.0,
  },

  // GENERALIST AGENT (fallback)
  {
    id: "generalist",
    name: "Assistente Geral",
    slug: "generalist",
    type: "generalist",
    description: "Assistente generalista para questões diversas que não se encaixam em especialidades.",
    systemPrompt: `Você é um assistente geral versátil.

Você lida com perguntas que não se encaixam nas especialidades dos outros agentes. Use a KB sempre que possível e faça web search para informações atualizadas.`,
    ragNamespaces: ["geral", "kb/general"],
    policy: {
      allowedTools: ["kb_search", "web_search", "calculator", "vision_cascade"],
      perRequestBudgetUSD: 0.05,
    },
    budgetLimit: 5.0,
  },
];

// ============================================================================
// AGENT-TOOL ASSOCIATIONS
// ============================================================================

const AGENT_TOOL_ASSOCIATIONS: Array<{ agentId: string; toolId: string }> = [
  // Curator
  { agentId: "curator", toolId: "kb_search" },
  { agentId: "curator", toolId: "web_search" },
  { agentId: "curator", toolId: "vision_cascade" },

  // Financial Specialist
  { agentId: "financial_specialist", toolId: "kb_search" },
  { agentId: "financial_specialist", toolId: "web_search" },
  { agentId: "financial_specialist", toolId: "calculator" },

  // Tech Support
  { agentId: "tech_support", toolId: "kb_search" },
  { agentId: "tech_support", toolId: "web_search" },
  { agentId: "tech_support", toolId: "crawler" },

  // Customer Service
  { agentId: "customer_service", toolId: "kb_search" },

  // Generalist
  { agentId: "generalist", toolId: "kb_search" },
  { agentId: "generalist", toolId: "web_search" },
  { agentId: "generalist", toolId: "calculator" },
  { agentId: "generalist", toolId: "vision_cascade" },
];

// ============================================================================
// SEED EXECUTION
// ============================================================================

export async function seedCompleteSystem() {
  console.log("\n🌱 Starting AION Complete System Seed...\n");

  try {
    // 1. SEED NAMESPACES
    console.log("📚 Seeding Namespaces...");
    for (const ns of NAMESPACE_SEED_DATA) {
      await db
        .insert(namespaces)
        .values({
          name: ns.name,
          displayName: ns.displayName,
          description: ns.description,
          icon: ns.icon,
          category: ns.category,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: namespaces.name,
          set: {
            displayName: ns.displayName,
            description: ns.description,
            icon: ns.icon,
            category: ns.category,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        });
    }
    console.log(`   ✅ ${NAMESPACE_SEED_DATA.length} namespaces seeded\n`);

    // 2. SEED TOOLS
    console.log("🔧 Seeding Tools...");
    for (const tool of TOOLS_SEED_DATA) {
      await db
        .insert(tools)
        .values({
          id: tool.id,
          name: tool.name,
          slug: tool.slug,
          type: tool.type,
          config: tool.config,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: tools.id,
          set: {
            name: tool.name,
            slug: tool.slug,
            type: tool.type,
            config: tool.config,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        });
    }
    console.log(`   ✅ ${TOOLS_SEED_DATA.length} tools seeded\n`);

    // 3. SEED AGENTS
    console.log("🤖 Seeding Agents...");
    for (const agent of AGENTS_SEED_DATA) {
      await db
        .insert(agents)
        .values({
          id: agent.id,
          name: agent.name,
          slug: agent.slug,
          type: agent.type as any,
          description: agent.description,
          systemPrompt: agent.systemPrompt,
          ragNamespaces: agent.ragNamespaces,
          policy: agent.policy as any,
          budgetLimit: agent.budgetLimit,
          escalationAgent: agent.escalationAgent,
          enabled: true,
        })
        .onConflictDoUpdate({
          target: agents.id,
          set: {
            name: agent.name,
            description: agent.description,
            systemPrompt: agent.systemPrompt,
            ragNamespaces: agent.ragNamespaces,
            policy: agent.policy as any,
            budgetLimit: agent.budgetLimit,
            escalationAgent: agent.escalationAgent,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          },
        });
    }
    console.log(`   ✅ ${AGENTS_SEED_DATA.length} agents seeded\n`);

    // 4. SEED AGENT-TOOL ASSOCIATIONS
    console.log("🔗 Seeding Agent-Tool Associations...");
    
    // Clear existing associations
    await db.delete(agentTools);
    
    // Insert new associations
    for (const assoc of AGENT_TOOL_ASSOCIATIONS) {
      await db.insert(agentTools).values({
        agentId: assoc.agentId,
        toolId: assoc.toolId,
      });
    }
    console.log(`   ✅ ${AGENT_TOOL_ASSOCIATIONS.length} associations seeded\n`);

    console.log("✅ Complete System Seed finished successfully!\n");
    
    return {
      success: true,
      namespaces: NAMESPACE_SEED_DATA.length,
      tools: TOOLS_SEED_DATA.length,
      agents: AGENTS_SEED_DATA.length,
      associations: AGENT_TOOL_ASSOCIATIONS.length,
    };
  } catch (error: any) {
    console.error("❌ Seed failed:", error.message);
    throw error;
  }
}
