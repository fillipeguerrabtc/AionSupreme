# AION - Sistema de IA Autônomo

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation, extending beyond current LLM limitations. It features configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents using POMDP with a ReAct framework, and professional video generation. The system provides a chat interface for end-users and an administrative dashboard with a 7-Trait Personality Equalizer. Operating in a single-tenant mode for optimized deployment and cost efficiency, AION's business vision is to deliver a self-sustaining, continuously evolving AI that learns and improves autonomously, reducing reliance on external APIs over time. It incorporates production-ready autonomous meta-learning capabilities, including a Meta-Learner Service, an Adaptive Mixture of Experts (ShiftEx MoE), a Personalized expert selection (PM-MoE Aggregator), and a Self-Improvement Engine for autonomous code analysis and patching.

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

## System Architecture

### Core System Design
AION operates in a single-tenant mode with a multi-agent architecture and LLM-driven Mixture of Experts (MoE) routing based on intent classification. It includes a 5-level priority chain automatic fallback system and universal multi-language support. Specialized agents with dedicated knowledge base namespaces, tool access, and budget limits are supported. A Human-in-the-Loop (HITL) knowledge curation system, backed by PostgreSQL, requires human approval for all content before indexing with a Zero Bypass Policy. A production-ready GPU Pool System manages worker detection, heartbeat monitoring, load balancing, inference priority, and schedule-based rotation. A Continuous Self-Evolution System collects high-quality conversations for instruction tuning and dataset generation, applying HITL. Full Multimodal Processing supports various document types, images, videos, YouTube transcripts, and Deep Web Crawling. The Vision Cascade System provides automatic failover across 5 providers with quota tracking. The agent system includes a level-based hierarchy for agents and sub-agents with cascading deletion. Federated Learning is fully implemented with a Gradient Aggregation Coordinator and Fault Tolerance. User & RBAC Management provides enterprise-level user and permission management with a granular permission system. The system incorporates a Meta-Learner Service, Adaptive Mixture of Experts (ShiftEx MoE) with MMD shift detection and dynamic expert spawning, a Personalized Expert Selection (PM-MoE Aggregator), and a Self-Improvement Engine for autonomous code analysis. Namespace isolation with schema updates and complete filtering for all KB sources ensures cross-tenant protection. GPU orchestration includes 100% official Kaggle API automation, preventive quota thresholds, provider alternation with PostgreSQL persistence, human-like behavioral delays, and a continuous quota monitoring loop. Privacy-preserving heuristics are implemented via adaptive thresholds, LoRA fine-tuning, PII redaction, and a replay buffer.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query, utilizing Radix UI, shadcn/ui patterns, Tailwind CSS, and a custom HSL-based design system. It features an elegant minimalist design with modern glassmorphism. It offers a clean conversational chat interface and an enterprise-level Admin Panel with a consolidated hierarchical menu (8 categories from 21 flat items) and full Internationalization (i18n) supporting PT-BR (default), EN-US, ES-ES. All administrative pages are translated, including Dataset, Agent, and Curation Queue management. The Curation Queue for HITL review supports filtering and batch actions. Vision System monitoring displays real-time quota tracking across 5 providers. AI-powered semantic image search and Health Diagnostics are included. The Personality Equalizer in the Settings tab offers granular control via 7 functional sliders. The Admin Panel design philosophy balances auto-creation with manual management for auditing, correction, hygiene, seeding, override, and monitoring for namespaces, and customization, specialized configuration, hierarchy management, testing, migration, and emergency control for agents.

### Technical Implementations
The backend uses Node.js and TypeScript with Express.js and PostgreSQL via Drizzle ORM. Key services include LLM Client, Storage, Multi-Agent Router (MoE), namespace-scoped RAG, Agent Engine (ReAct with POMDP), Automatic Fallback, Production-Grade Multimodal Processing, Web Content Discovery, YouTube Transcription Service, Vision Cascade, free LLM Provider rotation, GPU Orchestrator, GPU Pool Manager, GPU Load Balancer, Training Data Collector, Dataset Generator, Auto-Learning System, Token Monitoring, Lifecycle Management, Orphan Detection, Validation (Zod schemas), and a Comprehensive Telemetry System. It includes a Kaggle CLI Service for automatic provisioning and credential bootstrapping, a Colab Orchestrator Service for Puppeteer automation, and a GPU Management UI. A GPU Deletion Service handles cascading deletes, and an Auto-Scaling Service with a 24/7 Orchestrator intelligently manages all GPUs (Colab + Kaggle) using multi-factor dispatching and staggered rotation strategies. The Namespace Classifier uses LLM-based auto-classification. A Persistent Vector Store is PostgreSQL-backed with LRU cache. Robust error handling and structured logging are implemented. The frontend implements a centralized i18n system and uses Replit Auth (OpenID Connect). RAG combines OpenAI embeddings with BM25. Professional video generation uses an asynchronous job queue. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate. Training data validation and a Lifecycle Management System are in place.

### System Design Decisions
Key decisions include single-tenant architecture and externalized JSON behavioral configurations for dynamic updates. Comprehensive observability and telemetry include query monitoring, granular hierarchical usage analytics, a modern dashboard with Recharts visualizations, PostgreSQL trigram indexes for optimized search performance, and 29 production-ready REST endpoints for metric access.

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