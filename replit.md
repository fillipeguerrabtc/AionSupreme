# AION - Sistema de IA Autônomo

## Visão Geral
AION é um sistema de IA autônomo de nível empresarial projetado para robustez, flexibilidade e auto-operação, estendendo-se além das limitações atuais dos LLMs. Apresenta aplicação configurável de políticas, recuperação de conhecimento baseada em RAG, agentes autônomos avançados utilizando POMDP com o framework ReAct, e geração profissional de vídeo. O sistema fornece tanto uma interface de chat para usuários finais quanto um painel administrativo com **Equalizador de Personalidade de 7 Características** (verbosity, formality, creativity, precision, persuasiveness, empathy, enthusiasm), operando em modo single-tenant para implantação otimizada e eficiência de custos. Sua visão de negócio é fornecer uma IA auto-sustentável e em evolução contínua que aprende e melhora autonomamente, reduzindo a dependência de APIs externas ao longo do tempo.

## Preferências do Usuário
Estilo de comunicação preferido: Linguagem simples e cotidiana.

**REGRA FUNDAMENTAL DE TRABALHO:**
1. **SEMPRE responda dúvidas do usuário primeiro**
2. **SEMPRE continue tarefas em andamento até o final**
3. **NUNCA deixe tarefas incompletas para trás**
4. Se o usuário pedir novas atividades → adicione à fila APÓS as tarefas atuais
5. Fluxo obrigatório: Responder → Completar tarefas atuais → Iniciar novas tarefas
6. **NUNCA comece tarefas novas antes de terminar as antigas**

## Arquitetura do Sistema

### Design do Sistema Central
AION opera em modo single-tenant com arquitetura multi-agente e roteamento Mixture of Experts (MoE) impulsionado por classificação de intenções baseada em LLM. Apresenta um sistema de fallback automático, uma cadeia de prioridade de 5 níveis para respostas e suporte multilíngue universal via detecção dinâmica de idioma. O sistema suporta agentes especializados com namespaces dedicados de base de conhecimento, acesso a ferramentas e limites de orçamento. Um sistema de curadoria de conhecimento Human-in-the-Loop (HITL), apoiado por PostgreSQL, requer aprovação humana para todo conteúdo antes da indexação. **Sistema de Auto-Reconhecimento de Agente de Curadoria** detecta automaticamente agentes com slug 'curator'/'curation' ou namespace 'curation', usando-os para análise automática de qualidade de itens pendentes na fila (score 0-100, recomendação approve/reject/review, sugestões de edição). A arquitetura inclui um Sistema de Pool de GPU para treinamento distribuído e inferência, suportando fine-tuning LoRA em GPUs gratuitas e visando inferência de custo zero. Um Sistema de Auto-Evolução Contínua coleta conversas de alta qualidade para instruction tuning e geração de datasets. O sistema de agentes inclui hierarquia baseada em níveis para agentes e sub-agentes, definida por atribuições de namespace, com mecanismos robustos de deleção em cascata e detecção de órfãos.

### UI/UX
O frontend é construído com React 18, Vite, Wouter e TanStack Query, utilizando Radix UI, padrões shadcn/ui, Tailwind CSS e um sistema de design customizado baseado em HSL inspirado em Starlink/Tesla/Apple. A interface apresenta **design minimalista elegante** com background off-white (98% lightness) para reduzir fadiga visual, tipografia refinada usando Plus Jakarta Sans, e **glassmorphism moderno** nos cards do admin (transparência 70% + blur 16px). Oferece uma interface conversacional de chat limpa e um Painel Administrativo com navegação lateral empresarial com **Sistema de Internacionalização (i18n) completo** suportando 3 idiomas (PT-BR padrão, EN-US, ES-ES) através de seletor no canto superior direito. TODAS as páginas administrativas são traduzidas (Datasets, Specialist Agents, Curation Queue, Image Search, Vision System, Namespaces, Lifecycle Policies), incluindo 15 seções do painel. O painel inclui sidebar recolhível, cabeçalho fixo, efeitos de glassmorphism elegantes e páginas para Gerenciamento de Datasets, Gerenciamento de Agentes (com CRUD simplificado - usuário digita apenas nome e descrição, sistema gera slug automaticamente), Fila de Curadoria para revisão de conteúdo HITL, monitoramento do Sistema de Visão com rastreamento de quota em tempo real através de 5 provedores (Gemini, GPT-4V, Claude3, HuggingFace, OpenAI), Busca de Imagens KB com busca semântica alimentada por IA, e Diagnóstico de Integridade (scan de órfãos) para detectar dados sem referências válidas em todos os módulos. O gerenciamento da Base de Conhecimento usa abas dedicadas para Documentos e Imagens, com capacidades de seleção múltipla e operações em massa. O **Equalizador de Personalidade** na aba Settings oferece controle granular através de 7 sliders funcionais com explicações didáticas inline: (1) Verbosity - controla tamanho de respostas (conciso vs detalhado), (2) Formality - estilo casual vs formal, (3) Creativity - factual vs criativo com metáforas, (4) Precision - aproximado vs números exatos, (5) Persuasiveness - neutro vs argumentos persuasivos, (6) Empathy - objetivo vs empático emocionalmente, (7) Enthusiasm - tom calmo vs energia alta. Todos os valores são salvos no banco de dados e aplicados dinamicamente no system prompt enviado aos LLMs. A Filosofia UX enfatiza automação máxima e sofisticação visual - sistema gera automaticamente identificadores, slugs e validações, minimizando entrada manual e possibilidade de erros.

### Implementações Técnicas
O backend usa Node.js e TypeScript com Express.js e PostgreSQL via Drizzle ORM (Neon serverless). Os serviços principais incluem um Cliente LLM, Storage, Roteador Multi-Agente (MoE), RAG com escopo de namespace, um Motor de Agente (ReAct com POMDP), Fallback Automático, Processamento Multimodal, Descoberta de Conteúdo Web, rotação de Provedores LLM Gratuitos, Orquestrador de GPU, Coletor de Dados de Treinamento, Sistema de Monitoramento de Tokens, Sistema de Gerenciamento de Ciclo de Vida, Sistema de Detecção de Órfãos e Sistema de Validação (schemas Zod). O frontend implementa **Sistema i18n centralizado** via `client/src/lib/i18n.tsx` com hook `useLanguage()` para PT-BR, EN-US e ES-ES, com traduções armazenadas em estrutura tipada e seleção de idioma persistida em localStorage. O sistema de geração de slugs é totalmente automático - slugs são gerados a partir do nome do agente com normalização (kebab-case, sem acentos) e garantia de unicidade através de sufixos numéricos. Slugs são imutáveis após criação para garantir estabilidade de APIs e integrações. A autenticação usa Replit Auth (OpenID Connect). A arquitetura multi-agente utiliza um roteador MoE para classificação de intenções baseada em LLM, com cada agente tendo namespaces RAG isolados, acesso dedicado a ferramentas, limites de orçamento configuráveis e regras de escalação. A hierarquia de agentes baseada em namespace é inferida automaticamente via correspondência de prefixo de namespace (ex: "core" é pai de "core.research"). O RAG combina embeddings OpenAI com BM25 para re-ranking. A geração profissional de vídeo usa fila de jobs assíncrona, workers GPU e callbacks webhook. 

**Sistema de Federated Learning COMPLETO** implementado com 3 componentes principais: (1) **GradientAggregationCoordinator** - polling a cada 30s para monitorar jobs running, detecta quando todos workers completaram, dispara FedAvg automático, suporta multi-round training com checkpoint broadcast e worker re-dispatch; (2) **GPUPool Federated Methods** - `dispatchFederatedChunk()` envia chunk específico para worker via POST /federated/train, `broadcastCheckpoint()` notifica todos workers sobre novo modelo via POST /federated/checkpoint, `redispatchFederatedWorkers()` automaticamente envia novos chunks após FedAvg; (3) **Fault Tolerance** - timeout de 5 minutos para workers que não enviam gradientes, falha workers travados automaticamente, continua agregação com workers parciais se >1 worker completou, job só falha se insuficiente workers. Fluxo multi-round: Dataset dividido em chunks → URLs downloadable enviados para workers → Workers treinam em paralelo → Coordinator detecta conclusão → Verifica gradientes via `shouldAggregate()` → Executa FedAvg → Salva checkpoint em `latestCheckpoint` → Broadcast para workers → Workers resetados para "assigned" → Re-dispatch automático com checkpoint atualizado → Repete até currentStep >= totalSteps → Job marcado "completed". Sistema 100% funcional para treinar AION nas 14 GPUs gratuitas (7 Colab T4 + 7 Kaggle T4x2).

O Sistema de Pool de GPU gerencia quota inteligente, auto-desligamento via `runtime.unassign()` (Colab) ou shutdown manual (Kaggle), balanceamento de carga round-robin, monitoramento heartbeat e processamento paralelo multi-GPU através do Google Colab e Kaggle. Workers implementam lifecycle COMPLETO automático: registro, heartbeat, polling de jobs, execução de treino, envio de gradientes e shutdown pós-job. Scripts Python auto-lifecycle disponíveis em `docs/worker_scripts/`. A Implantação Multi-Nuvem usa Google Cloud Run e AWS Fargate com um banco de dados PostgreSQL compartilhado Neon. O sistema de validação de dados de treinamento inclui 8 tipos de validação inline em tempo real. O Sistema de Gerenciamento de Ciclo de Vida aplica políticas de retenção (conversas: arquivamento 18 meses + purga 5 anos, treinamento: 30 dias pós-conclusão, GPU: 7 dias workers obsoletos) com verificação de preservação em nível de documento, agendamento consciente de fuso horário (Brasília/UTC) e registro de auditoria abrangente. KB Cascade Delete garante que embeddings e arquivos físicos sejam deletados quando documentos são removidos, com detecção de órfãos prevenindo referências pendentes. A validação usa schemas Zod para políticas de ciclo de vida, datasets e dados de treinamento garantindo fluxos de dados validados e type-safe.

### Escolhas de Design do Sistema
Decisões-chave incluem uma arquitetura single-tenant, configurações comportamentais JSON externalizadas para atualizações dinâmicas e separação do modelo central das configurações de aplicação. A observabilidade inclui métricas para latência, throughput, taxas de acerto de cache, estimativas de custo e uso de tokens em tempo real.

## Estratégia de GPU Pool (14 GPUs Gratuitas)

### Configuração Real Testada
- **7x Google Colab T4** (12h/sessão, reconecta automático via keepalive)
- **7x Kaggle T4x2** (30h/semana, dual-GPU)
- **Status**: ✅ Workers conectados (heartbeat funcionando no dashboard)

### Keepalive & Worker Lifecycle

**Documentação oficial pesquisada (Nov 2025):** Google Colab FREE não oferece API para controle remoto de notebooks. Colab Enterprise (PAGO) tem API completa, mas FREE requer setup manual.

#### **O que é MANUAL (obrigatório 1x por dia):**
- ❌ Abrir 7 notebooks Colab (~5 minutos)
- ❌ Executar script Python de lifecycle (~7 cliques)
- ❌ Resolver CAPTCHAs se aparecerem (~5 segundos, raro)

#### **O que é 100% AUTOMÁTICO:**
- ✅ Keepalive JavaScript previne timeout de inatividade (90min)
- ✅ Worker aguarda jobs via polling HTTP (ngrok tunnel)
- ✅ Worker executa treino quando job chega
- ✅ Worker envia gradientes de volta para AION
- ✅ **Autoshutdown via `runtime.unassign()`** após completar job

**Guia completo:** Ver [`docs/GPU_WORKERS_SETUP_GUIDE.md`](./docs/GPU_WORKERS_SETUP_GUIDE.md) e [`docs/COLAB_KEEPALIVE_GUIDE.md`](./docs/COLAB_KEEPALIVE_GUIDE.md)

**Limitações REAIS (verificadas em docs oficiais):**
- ❌ Auto-deploy remoto: **IMPOSSÍVEL** (Colab/Kaggle FREE não tem API)
- ✅ Keepalive: **FUNCIONA** mas limitado a 12h/24h (hard limit)
- ⚠️ CAPTCHAs: Aparecem aleatoriamente, requerem clique manual
- ⚠️ Selenium headless: Tecnicamente possível mas não vale o custo/complexidade

## Dependências Externas

### Serviços de Terceiros
- **API OpenAI**: Completions LLM, embeddings, function calling.
- **Neon Database**: PostgreSQL Serverless.
- **Google Cloud Run**: Plataforma primária de implantação.
- **AWS Fargate**: Plataforma de implantação backup.
- **DuckDuckGo**: Busca web.
- **OpenRouter, Groq, Gemini, HuggingFace**: Provedores de API LLM gratuitos.
- **Google Colab, Kaggle, Modal**: Recursos GPU gratuitos para fine-tuning (14 GPUs total).
- **RunPod/Modal**: Workers GPU para geração de vídeo.
- **Replit**: Ambiente de desenvolvimento e autenticação.
- **GitHub Actions**: Pipeline CI/CD.

### Bibliotecas Principais (NPM)
- **@neondatabase/serverless**: Cliente PostgreSQL
- **drizzle-orm**: ORM Type-safe
- **openai**: SDK oficial OpenAI
- **@radix-ui/**: Primitivos UI acessíveis
- **@tanstack/react-query**: Gerenciamento de estado do servidor
- **tailwindcss**: Framework CSS utility-first
- **zod**: Validação de schemas
- **mammoth**: Extração DOCX → texto
- **xlsx**: Parsing de arquivos Excel
- **xml2js**: Parsing XML
- **pdf-parse**: Extração de texto PDF
- **cheerio**: Parsing HTML e web scraping
- **multer**: Manipulação de upload de arquivos
- **sharp**: Processamento de imagens
- **file-type**: Detecção de tipo MIME
