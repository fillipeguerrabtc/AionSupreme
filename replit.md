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

## System Architecture

### Core System Design
AION operates in a single-tenant mode with a multi-agent architecture and LLM-driven Mixture of Experts (MoE) routing. It includes a 5-level priority chain automatic fallback system and universal multi-language support. Specialized agents with dedicated knowledge base namespaces, tool access, and budget limits are supported. A Human-in-the-Loop (HITL) knowledge curation system, backed by PostgreSQL, requires human approval for all content before indexing. A production-ready GPU Pool System manages worker detection, heartbeat monitoring, load balancing, inference priority, and schedule-based rotation. A Continuous Self-Evolution System collects high-quality conversations for instruction tuning and dataset generation, applying HITL. Full Multimodal Processing supports various document types, images, videos, YouTube transcripts, and Deep Web Crawling. The Vision Cascade System provides automatic failover across 5 providers with quota tracking. The agent system includes a level-based hierarchy for agents and sub-agents with cascading deletion. Federated Learning is fully implemented. User & RBAC Management provides enterprise-level user and permission management. The system incorporates a Meta-Learner Service, Adaptive Mixture of Experts (ShiftEx MoE), a Personalized Expert Selection (PM-MoE Aggregator), and a Self-Improvement Engine for autonomous code analysis. Namespace isolation with schema updates ensures cross-tenant protection. GPU orchestration includes 100% official Kaggle API automation, preventive quota thresholds, provider alternation, and continuous quota monitoring. Privacy-preserving heuristics are implemented via adaptive thresholds, LoRA fine-tuning, PII redaction, and a replay buffer.

### GPU ON-DEMAND STRATEGY
The system uses a demand-based GPU orchestration, dynamically starting/stopping Kaggle GPUs based on workload (e.g., ≥25 KBs ready for training, heavy inference). It tracks a weekly limit of 28 hours for Kaggle, with immediate auto-shutdown after job completion. Colab GPU usage is managed with fixed 11-hour sessions, 36-hour cooldowns, and randomization for anti-detection. A smart fallback system prioritizes internal KB and free GPUs, then free APIs (Groq, Gemini, HuggingFace), followed by web search (DuckDuckGo), and finally paid APIs (OpenAI) as a last resort. Core services like `GPUCooldownManager`, `HumanBehaviorSimulator`, `ToSComplianceMonitor`, `TrainingQueueMonitor`, `InferenceComplexityAnalyzer`, and `DemandBasedKaggleOrchestrator` manage this strategy. Background jobs via `node-cron` handle monitoring, quota resets, and compliance checks. The `gpuWorkers` database table tracks session and usage details for precise on-demand management.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query, utilizing Radix UI, shadcn/ui patterns, Tailwind CSS, and a custom HSL-based design system. It features an elegant minimalist design with modern glassmorphism. It offers a clean conversational chat interface and an enterprise-level Admin Panel with a consolidated hierarchical menu and full Internationalization (i18n) supporting PT-BR (default), EN-US, ES-ES. All administrative pages are translated, including Dataset, Agent, and Curation Queue management. The Curation Queue for HITL review supports filtering and batch actions. Vision System monitoring displays real-time quota tracking. AI-powered semantic image search and Health Diagnostics are included. The Personality Equalizer offers granular control via 7 functional sliders. The Admin Panel design balances auto-creation with manual management for auditing, correction, hygiene, seeding, override, and monitoring for namespaces, and customization, specialized configuration, hierarchy management, testing, migration, and emergency control for agents.

### Technical Implementations
The backend uses Node.js and TypeScript with Express.js and PostgreSQL via Drizzle ORM. Key services include LLM Client, Storage, Multi-Agent Router (MoE), namespace-scoped RAG, Agent Engine (ReAct with POMDP), Automatic Fallback, Production-Grade Multimodal Processing, Web Content Discovery, YouTube Transcription Service, Vision Cascade, free LLM Provider rotation, GPU Orchestrator, GPU Pool Manager, GPU Load Balancer, Training Data Collector, Dataset Generator, Auto-Learning System, Token Monitoring, Lifecycle Management, Orphan Detection, Validation (Zod schemas), and a Comprehensive Telemetry System. The Kaggle CLI Service uses environment variables for authentication, lazy loading from SecretsVault, UPM integration, multi-account support, and production-grade error handling. The system includes a Colab Orchestrator Service for Puppeteer automation, a GPU Management UI, a GPU Deletion Service, and an Auto-Scaling Service with a 24/7 Orchestrator. The Namespace Classifier uses LLM-based auto-classification. A Persistent Vector Store is PostgreSQL-backed with LRU cache. Robust error handling and structured logging are implemented. The frontend implements a centralized i18n system and uses Replit Auth (OpenID Connect). RAG combines OpenAI embeddings with BM25. Professional video generation uses an asynchronous job queue. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate. Training data validation and a Lifecycle Management System are in place.

### Billing & Cost Tracking (2025 Production System)
The system implements a production-grade multi-provider billing architecture with real-time cost tracking and automated synchronization. A unified `openai_billing_sync` table stores all billing data with provider isolation (openai, openrouter, gemini) via ENUM column and composite indexes. Real-time token tracking uses a comprehensive pricing system covering OpenAI (GPT-4o, GPT-4, GPT-3.5, embeddings, TTS, Whisper), Gemini (8 models including 2.5-Flash-Lite, 2.0-Flash, 1.5-Flash, 1.5-Pro, 2.5-Pro), and OpenRouter (3 sample models, expandable). The `calculateCost()` function in token-tracker.ts automatically computes costs based on provider/model/tokens without hardcoded values. Billing sync services include OpenAI (hourly sync via official Costs API with OPENAI_ADMIN_KEY scope: api.usage.read), OpenRouter (hourly sync via 2025 flat Activity API format with retry logic: 1s/2s/4s exponential backoff), and Gemini (hybrid architecture using real-time tracking + optional Cloud Billing API for reconciliation). An automated backfill service runs on startup to ensure provider column integrity. Free tier providers (Groq, HuggingFace) use real-time tracking only without external billing APIs. The system prevents cost calculation errors via comprehensive pricing coverage and fallback to $0.00 with warnings for unknown models. All billing services initialize cleanly with structured logging and production-grade error handling.

### System Design Decisions
Key decisions include single-tenant architecture and externalized JSON behavioral configurations for dynamic updates. Comprehensive observability and telemetry include query monitoring, granular hierarchical usage analytics, a modern dashboard with Recharts visualizations, PostgreSQL trigram indexes for optimized search performance, and 29 production-ready REST endpoints for metric access.

### Security & Credentials Management
The system follows official Kaggle API documentation best practices for credential management. All API credentials (Kaggle username + key, Colab email + password) are encrypted using AES-256-GCM in a SecretsVault before storage in PostgreSQL. Credentials are manually entered, not file-uploaded, to enhance security and auditability. They are injected as `KAGGLE_USERNAME` and `KAGGLE_KEY` environment variables at runtime. Multi-account support with individual quota tracking is managed, and production-grade error handling detects and informs users about API errors.

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