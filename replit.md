# AION - Sistema de IA Autônomo

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation, extending beyond current LLM limitations. It features configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents using POMDP with a ReAct framework, and professional video generation. The system provides a chat interface for end-users and an administrative dashboard with a 7-Trait Personality Equalizer. AION's business vision is to deliver a self-sustaining, continuously evolving AI that learns and improves autonomously, reducing reliance on external APIs over time. It incorporates production-ready autonomous meta-learning capabilities, including a Meta-Learner Service, an Adaptive Mixture of Experts (ShiftEx MoE), a Personalized expert selection (PM-MoE Aggregator), and a Self-Improvement Engine for autonomous code analysis and patching.

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

## Recent Changes

### 2025-11-09 - ReAct Engine Integration Complete ✅
**Tasks #27-31 Production-Ready & Architect Approved**

- **✅ Tool Name Mapping Layer**: Implemented production-ready TOOL_NAME_MAP in runtime.ts to bridge DB tool names ("Knowledge Base Search", "Web Search") to agentTools registry keys ("KBSearch", "SearchWeb", "GenerateImage"). Fully documented with maintenance guidelines for future tool additions.

- **✅ End-to-End Validation**: Successfully tested image generation via ReAct engine:
  - 3 tool_executions persisted in PostgreSQL (2 failures + 1 success with intelligent auto-retry)
  - Image generated and saved to kb_storage/generated_images/ (permanent storage)
  - ReAct completed in 4 steps with 1 attachment
  - Assistant message updated correctly with proper FK constraints
  - HITL curation flow triggered automatically for quality control

- **✅ Persistence Architecture**: Bulletproof message/tool execution persistence:
  - routes.ts creates assistant message BEFORE orchestration (prevents FK violations)
  - Updates content AFTER completion (ensures data integrity)
  - Deletes empty messages on failure (no orphaned records)

- **✅ Initialization Order Fix**: Resolved seed/loader race condition by moving seedDatabase() call to index.ts BEFORE loadAgentsFromDatabase() to ensure tools table is populated before agents attempt to load their tool references.

- **✅ Custom Icons Migration**: Moved all custom icons from attached_assets/ (temporary) to kb_storage/media/custom_icons/ (permanent storage) to comply with production persistence requirements.

**Architect Review**: All tasks reviewed and approved for production deployment. Recommendations implemented: comprehensive documentation added, logging enhanced for unmapped tools monitoring.

## System Architecture

### Core System Design
AION operates in a single-tenant mode with a multi-agent architecture and LLM-driven Mixture of Experts (MoE) routing. It includes a 5-level priority chain automatic fallback system and universal multi-language support (PT-BR, EN-US, ES-ES). Specialized agents with dedicated knowledge base namespaces, tool access, and budget limits are supported. A Human-in-the-Loop (HITL) knowledge curation system requires human approval for all content before indexing. A production-ready GPU Pool System manages worker detection, heartbeat monitoring, load balancing, inference priority, and schedule-based rotation. A Continuous Self-Evolution System collects high-quality conversations for instruction tuning and dataset generation, applying HITL. Full Multimodal Processing supports various document types, images, videos, YouTube transcripts, and Deep Web Crawling. The Vision Cascade System provides automatic failover across 5 providers with quota tracking. The agent system includes a level-based hierarchy for agents and sub-agents with cascading deletion. Federated Learning is fully implemented. User & RBAC Management provides enterprise-level user and permission management. The system incorporates a Meta-Learner Service, Adaptive Mixture of Experts (ShiftEx MoE), a Personalized Expert Selection (PM-MoE Aggregator), and a Self-Improvement Engine for autonomous code analysis. Namespace isolation with schema updates ensures cross-tenant protection. GPU orchestration includes 100% official Kaggle API automation, preventive quota thresholds, provider alternation, and continuous quota monitoring. Privacy-preserving heuristics are implemented via adaptive thresholds, LoRA fine-tuning, PII redaction, and a replay buffer. The system uses a demand-based GPU orchestration, dynamically starting/stopping Kaggle GPUs based on workload and tracking usage limits, with smart fallback logic prioritizing internal resources, free APIs, web search, and paid APIs.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query, utilizing Radix UI, shadcn/ui patterns, Tailwind CSS, and a custom HSL-based design system. It features an elegant minimalist design with modern glassmorphism, offering a clean conversational chat interface and an enterprise-level Admin Panel with a consolidated hierarchical menu and full Internationalization (i18n) supporting PT-BR (default), EN-US, ES-ES. All administrative pages are translated, including Dataset, Agent, and Curation Queue management. The Curation Queue for HITL review supports filtering and batch actions. Vision System monitoring displays real-time quota tracking. AI-powered semantic image search and Health Diagnostics are included. The Personality Equalizer offers granular control via 7 functional sliders.

### Technical Implementations
The backend uses Node.js and TypeScript with Express.js and PostgreSQL via Drizzle ORM. Key services include LLM Client, Storage, Multi-Agent Router (MoE), namespace-scoped RAG, Agent Engine (ReAct with POMDP), Automatic Fallback, Production-Grade Multimodal Processing, Web Content Discovery, YouTube Transcription Service, Vision Cascade, free LLM Provider rotation, GPU Orchestrator, GPU Pool Manager, GPU Load Balancer, Training Data Collector, Dataset Generator, Auto-Learning System, Token Monitoring, Lifecycle Management, Orphan Detection, Validation (Zod schemas), and a Comprehensive Telemetry System. The Kaggle CLI Service uses environment variables for authentication, lazy loading from SecretsVault, UPM integration, multi-account support, and production-grade error handling. The system includes a Colab Orchestrator Service for Puppeteer automation, a GPU Management UI, a GPU Deletion Service, and an Auto-Scaling Service with a 24/7 Orchestrator. The Namespace Classifier uses LLM-based auto-classification. A Persistent Vector Store is PostgreSQL-backed with LRU cache. Robust error handling and structured logging are implemented. The frontend implements a centralized i18n system and uses Replit Auth (OpenID Connect). RAG combines OpenAI embeddings with BM25. Professional video generation uses an asynchronous job queue. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate. Training data validation and a Lifecycle Management System are in place. The system implements a production-grade multi-provider billing architecture with real-time cost tracking and automated synchronization.

### System Design Decisions
Key decisions include single-tenant architecture and externalized JSON behavioral configurations for dynamic updates. Comprehensive observability and telemetry include query monitoring, granular hierarchical usage analytics, a modern dashboard with Recharts visualizations, PostgreSQL trigram indexes for optimized search performance, and 29 production-ready REST endpoints for metric access. Security involves AES-256-GCM encryption for API credentials stored in a SecretsVault and injected as environment variables at runtime, supporting multi-account management with individual quota tracking.

## External Dependencies

### Third-Party Services
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

### Core Libraries (NPM)
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