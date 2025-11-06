# AION - Sistema de IA Autônomo

## Visão Geral
AION é um sistema de IA autônomo de nível empresarial projetado para robustez, flexibilidade e auto-operação, estendendo-se além das limitações atuais dos LLMs. Possui aplicação configurável de políticas, recuperação de conhecimento baseada em RAG, agentes autônomos avançados usando POMDP com framework ReAct e geração profissional de vídeos. O sistema fornece interface de chat para usuários finais e painel administrativo com Equalizador de Personalidade de 7 Traços. Operando em modo single-tenant para implantação otimizada e eficiência de custos, a visão de negócio do AION é fornecer IA auto-sustentável e continuamente evolutiva que aprende e melhora autonomamente, reduzindo dependência de APIs externas ao longo do tempo.

## User Preferences
Estilo de comunicação preferido: Linguagem simples e cotidiana.

**REGRA FUNDAMENTAL DE TRABALHO:**
1. **SEMPRE responda dúvidas do usuário primeiro**
2. **SEMPRE continue tarefas em andamento até o final**
3. **NUNCA deixe tarefas incompletas para trás**
4. Se o usuário pedir novas atividades → adicione à fila APÓS as tarefas atuais
5. Fluxo obrigatório: Responder → Completar tarefas atuais → Iniciar novas tarefas
6. **NUNCA comece tarefas novas antes de terminar as antigas**

**🚨 REGRA CRÍTICA DE QUALIDADE - ZERO TOLERÂNCIA:**
**"NADA NIVEL MVP - JA NASCE NIVEL PRODUÇÃO"**
- ❌ **ZERO strings hardcoded** - TUDO deve usar i18n (PT/EN/ES)
- ❌ **ZERO dados mocados** - TUDO deve vir do PostgreSQL
- ❌ **ZERO in-memory storage** - TUDO deve ser persistente no DB
- ❌ **ZERO implementações incompletas** - TUDO deve ser funcional e production-ready
- ✅ **100% dados reais e configuráveis** - Todas as features devem ser totalmente funcionais
- ✅ **100% persistência** - Todos os dados devem ser salvos no banco de dados
- ✅ **100% internacionalizado** - Todas as strings devem estar traduzidas em 3 idiomas
- ✅ **100% production-grade** - Código, validações, error handling completos

**IMPLEMENTAÇÃO OBRIGATÓRIA:**
- Sempre verificar se strings estão traduzidas antes de entregar
- Sempre usar PostgreSQL via Drizzle ORM, nunca in-memory
- Sempre implementar validações, error handling, loading states
- Sempre adicionar data-testid para testes E2E
- Sempre revisar código com architect antes de marcar como completed

## Arquitetura do Sistema

### Design do Sistema Central
AION opera em modo single-tenant com arquitetura multi-agente e roteamento Mixture of Experts (MoE) orientado por LLM baseado em classificação de intenção. Inclui sistema automático de fallback com cadeia de prioridade de 5 níveis para respostas e suporte multilíngue universal. O sistema suporta agentes especializados com namespaces dedicados da base de conhecimento, acesso a ferramentas e limites de orçamento. Um sistema de curadoria de conhecimento Human-in-the-Loop (HITL), apoiado por PostgreSQL, requer aprovação humana para todo conteúdo antes da indexação, com Política de Zero Bypass. Um Sistema de Pool de GPU pronto para produção gerencia detecção de workers, monitoramento de heartbeat, balanceamento de carga, prioridade de inferência e rotação baseada em agendamento. Um Sistema de Auto-Evolução Contínua coleta conversas de alta qualidade para instruction tuning e geração de datasets, aplicando HITL. Processamento Multimodal Completo suporta vários tipos de documentos, imagens, vídeos, transcrições do YouTube e Deep Web Crawling. O Sistema Vision Cascade fornece failover automático de 5 provedores com rastreamento de quota. O sistema de agentes inclui hierarquia baseada em níveis para agentes e sub-agentes com exclusão em cascata. Federated Learning está totalmente implementado com Gradient Aggregation Coordinator e Tolerância a Falhas. Gerenciamento de Usuários & RBAC fornecem gerenciamento de usuários e permissões de nível empresarial com sistema granular de permissões.

### UI/UX
O frontend é construído com React 18, Vite, Wouter e TanStack Query, utilizando Radix UI, padrões shadcn/ui, Tailwind CSS e sistema de design customizado baseado em HSL. Apresenta design minimalista elegante com glassmorphism moderno. Oferece interface de chat conversacional limpa e Painel Administrativo com navegação lateral de nível empresarial e sistema completo de Internacionalização (i18n) suportando PT-BR (padrão), EN-US, ES-ES. Todas as páginas administrativas estão traduzidas, incluindo gerenciamento de Dataset, Agente e Fila de Curadoria. A Fila de Curadoria para revisão HITL suporta filtragem e ações em lote. Monitoramento do Vision System exibe rastreamento de quota em tempo real através de 5 provedores. Busca de Imagem semântica alimentada por IA e Diagnósticos de Saúde estão incluídos. O Equalizador de Personalidade na aba Configurações oferece controle granular via 7 sliders funcionais.

### Painel Admin - Filosofia de Gerenciamento

**Auto-Criação vs Gerenciamento Manual**

Embora o AION implemente classificação automática de namespaces e atribuição de agentes, o Painel Admin fornece interfaces de gerenciamento manual para controle operacional crítico:

**Aba Namespaces - Por que a UI Manual Existe:**
- **Auditoria & Revisão**: Inspecionar namespaces classificados automaticamente e verificar coerência semântica
- **Correção**: Renomear ou mesclar namespaces com classificação automática ruim (ex: domínios divididos agrupados incorretamente)
- **Higiene**: Deletar namespaces vazios/órfãos não capturados pela coleta de lixo automática
- **Seeding**: Pré-criar namespaces específicos de domínio antes da primeira ingestão de conteúdo para melhor roteamento inicial
- **Override**: Atribuir manualmente documentos ao namespace correto quando o classificador automático falha
- **Monitoramento**: Rastrear distribuição de namespaces, contagem de documentos e detectar poluição de namespaces

**Aba Agentes - Por que a UI Manual Existe:**
- **Customização**: Criar agentes especializados com ferramentas customizadas, orçamentos e perfis de personalidade além dos padrões
- **Configuração Especializada**: Ajustar prompts de agentes, acesso a ferramentas e restrições de namespace para especialistas de domínio
- **Gerenciamento de Hierarquia**: Construir hierarquias multi-nível de agentes (sênior → júnior) com regras de delegação
- **Testes**: Prototipar novos comportamentos de agentes antes de implantar no sistema de auto-criação
- **Migração**: Editar em lote ou depreciar agentes durante upgrades de sistema ou mudanças de política
- **Controle de Emergência**: Desabilitar ou modificar agentes com mau comportamento descobertos durante monitoramento de produção

**Princípio de Design:**
Automação fornece **conveniência** (80% dos casos de uso), gerenciamento manual fornece **precisão** (20% casos de borda + segurança operacional). Ambos são essenciais para sistemas autônomos de nível produção.

### Implementações Técnicas
O backend usa Node.js e TypeScript com Express.js e PostgreSQL via Drizzle ORM. Serviços-chave incluem Cliente LLM, Storage, Multi-Agent Router (MoE), RAG com escopo de namespace, Motor de Agente (ReAct com POMDP), Fallback Automático, Processamento Multimodal de Nível Produção, Descoberta de Conteúdo Web, Serviço de Transcrição YouTube, Vision Cascade, rotação de Provedores LLM gratuitos, GPU Orchestrator, GPU Pool Manager, GPU Load Balancer, Training Data Collector, Dataset Generator, Auto-Learning System, Monitoramento de Tokens, Lifecycle Management, Orphan Detection, Validação (schemas Zod) e Sistema de Telemetria Completo. 

**PRODUÇÃO-READY (2025-11-06):**
- **Kaggle CLI Service**: Provisioning automático de binary + bootstrap de credenciais via SecretsVault + 5 endpoints API completos
- **Colab Orchestrator Service**: Automação Puppeteer para Google Colab (sem API pública) com provisioning lock e session tracking + 3 endpoints API
- **GPU Management UI**: Interface simplificada com "+ Add Worker" dialog suportando Kaggle (API) e Colab (Puppeteer), edição inline de workers via PATCH /api/gpu/:id
- **GPU Deletion Service**: CASCADE DELETE completo (sessions, resources, training jobs) com batch operations e cleanup automático de trainingWorkers
- **Auto-Scaling Service**: Multi-factor dispatcher baseado em métricas reais (latency, load, availability, quota) com 4 scoring factors
- **Namespace Classifier**: Auto-classification via LLM integrada no pipeline de upload/curation com consolidação inteligente (>80% similarity)
- **Persistent Vector Store**: PostgreSQL-backed com LRU cache (10k embeddings), lazy loading e performance stats tracking
- **Error Handling & Logging**: Structured logging service + error classes + circuit breaker (resilient) + retry/timeout patterns
- **Integration Tests**: 100% pass rate (11/11 tests) validando DB, GPU, curation, training, namespaces e data integrity

O frontend implementa sistema i18n centralizado com hook `useLanguage()`. Autenticação usa Replit Auth (OpenID Connect). RAG combina embeddings OpenAI com BM25 para re-ranking. Geração profissional de vídeo usa fila assíncrona de jobs, GPU workers e webhook callbacks. O Sistema de Classificação Automática de Namespaces usa GPT-4 para análise inteligente de conteúdo. O Sistema de Pool de GPU gerencia quota inteligente, auto-desligamento, balanceamento de carga e monitoramento de heartbeat. Implantação Multi-Nuvem usa Google Cloud Run e AWS Fargate. Validação de dados de treinamento inclui 8 tipos de validação inline em tempo real. O Sistema de Lifecycle Management aplica políticas de retenção. KB Cascade Delete garante remoção abrangente de dados.

**⚠️ NOTA DE SEGURANÇA - SECRETS_MASTER_KEY:**
- SecretsVault requer SECRETS_MASTER_KEY para encryption de credenciais (Kaggle API keys, Google passwords)
- Em desenvolvimento sem SECRETS_MASTER_KEY, credenciais ficam em plaintext no PostgreSQL
- **Produção**: SEMPRE configurar SECRETS_MASTER_KEY antes de deployar
- Usar Google App Passwords ou tokens de curta duração ao invés de senhas reais quando possível

### Decisões de Design do Sistema
Decisões-chave incluem arquitetura single-tenant, configurações comportamentais JSON externalizadas para atualizações dinâmicas. Observabilidade e telemetria completas incluem monitoramento abrangente de queries, analytics de uso hierárquico granular, dashboard moderno com visualizações Recharts, índices trigram PostgreSQL para performance otimizada de busca e 29 endpoints REST prontos para produção para acesso a métricas.

## Dependências Externas

### Serviços de Terceiros
- **API OpenAI**: LLM completions, embeddings, function calling, GPT-4o Vision.
- **Neon Database**: PostgreSQL Serverless.
- **Google Cloud Run**: Primary deployment platform.
- **AWS Fargate**: Backup deployment platform.
- **DuckDuckGo**: Web search.
- **OpenRouter**: Free LLM API gateway (GPT-4V, Claude 3 Haiku).
- **Groq, Gemini, HuggingFace**: Free LLM API providers.
- **Google Colab, Kaggle, Modal**: Free GPU resources for fine-tuning and inference.
- **RunPod/Modal**: GPU workers for video generation.
- **Replit**: Development environment and authentication (OpenID Connect).
- **GitHub Actions**: CI/CD pipeline.

### Bibliotecas Principais (NPM)
- **@neondatabase/serverless**: PostgreSQL client
- **drizzle-orm**: Type-safe ORM
- **openai**: Official OpenAI SDK
- **@google/generative-ai**: Gemini API client
- **@huggingface/inference**: HuggingFace API client
- **groq-sdk**: Groq API client
- **youtube-transcript**: YouTube caption/subtitle extraction
- **@radix-ui/**: Accessible UI primitives
- **@tanstack/react-query**: Server state management
- **tailwindcss**: Utility-first CSS framework
- **zod**: Schema validation
- **mammoth**: DOCX to text extraction
- **xlsx**: Excel file parsing
- **xml2js**: XML parsing
- **pdf-parse**: PDF text extraction
- **cheerio**: HTML parsing and web scraping
- **multer**: File upload handling
- **file-type**: MIME type detection