# AION - Sistema de IA Autônomo

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation, extending beyond current LLM limitations. Its purpose is to deliver a self-sustaining, continuously evolving AI that learns and improves autonomously, reducing reliance on external APIs over time. Key capabilities include configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents using POMDP with a ReAct framework, and professional video generation. The system provides a chat interface for end-users and an administrative dashboard with a 7-Trait Personality Equalizer. It incorporates production-ready autonomous meta-learning capabilities, including a Meta-Learner Service, an Adaptive Mixture of Experts (ShiftEx MoE), a Personalized expert selection (PM-MoE Aggregator), and a Self-Improvement Engine for autonomous code analysis and patching.

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
AION operates in a single-tenant mode with a multi-agent architecture and LLM-driven Mixture of Experts (MoE) routing, implementing a **GPU-FIRST 4-level priority chain** with automatic fallback and universal multi-language support (PT-BR, EN-US, ES-ES). It supports specialized agents with dedicated knowledge base namespaces, tool access, and budget limits. A Human-in-the-Loop (HITL) knowledge curation system requires human approval for all content before indexing.

**GPU-FIRST INFERENCE ARCHITECTURE (Updated 2025):**
The system implements a revolutionary **GPU-FIRST** priority order that maximizes zero-cost GPU inference before falling back to external APIs:

1. **KB + GPU Integration (Primary):** Knowledge Base search (confidence ≥ 0.7) triggers immediate GPU activation via DemandBasedKaggleOrchestrator for inference, with explicit auto-shutdown after completion (zero API cost, tracked via provider='gpu-internal').
2. **Web Search + GPU Integration (Secondary):** If KB fails or has low confidence, DuckDuckGo web search provides content that is then processed by GPU inference with immediate shutdown (zero API cost for processing).
3. **Free APIs Fallback (Tertiary):** If GPU fails, auto-fallback to free API rotation: Groq → Gemini → HuggingFace → OpenRouter.
4. **OpenAI Fallback (Last Resort):** GPT-4o only activated when all free resources exhausted (paid API).

**GPU Orchestration Features:**
- Demand-Based Kaggle Orchestrator with on-demand start/stop (28h/week quota management)
- Explicit auto-shutdown immediately after each inference job completes (via orchestrator.stopSession() in finally block)
- Safeguarded zero-cost tracking via trackTokenUsage (provider='gpu-internal', cost=0, wrapped in try/catch to prevent tracking errors from aborting valid GPU responses)
- GPU Pool System with worker detection, heartbeat monitoring, load balancing, and inference priority

A Continuous Self-Evolution System collects high-quality conversations for instruction tuning and dataset generation, applying HITL. Full Multimodal Processing supports various document types, images, videos, YouTube transcripts, and Deep Web Crawling with **dual-mode URL learning** (single-page scan vs deep crawl with optional media download). The Vision Cascade System provides automatic failover across 5 providers with quota tracking. The agent system includes a level-based hierarchy for agents and sub-agents with cascading deletion. Federated Learning is fully implemented. User & RBAC Management provides enterprise-level user and permission management. The system incorporates a Meta-Learner Service, Adaptive Mixture of Experts (ShiftEx MoE), a Personalized Expert Selection (PM-MoE Aggregator), and a Self-Improvement Engine for autonomous code analysis. Namespace isolation with schema updates ensures cross-tenant protection. Privacy-preserving heuristics are implemented via adaptive thresholds, LoRA fine-tuning, PII redaction, and a replay buffer.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query, utilizing Radix UI, shadcn/ui patterns, Tailwind CSS, and a custom HSL-based design system. It features an elegant minimalist design with modern glassmorphism, offering a clean conversational chat interface and an enterprise-level Admin Panel with a consolidated hierarchical menu and full Internationalization (i18n) supporting PT-BR (default), EN-US, ES-ES. All administrative pages are 100% translated with ZERO hardcoded strings, including Dataset, Agent, Curation Queue, and GPU Management (GPUOverviewPage, GPUManagementTab, EditWorkerDialog). The Curation Queue for HITL review supports filtering and batch actions. Vision System monitoring displays real-time quota tracking. AI-powered semantic image search and Health Diagnostics are included. The Personality Equalizer offers granular control via 7 functional sliders.

**i18n Architecture (Nov 2024):**
- Centralized translation system in `client/src/lib/i18n.tsx` with TypeScript type safety
- Semantic hierarchical structure with sub-blocks (header, stats, table, badges, dialogs, etc.)
- `interpolate()` helper function for safe template string substitution
- Legacy flat keys maintained for backward compatibility alongside new hierarchical structure
- All GPU Management UI components fully internationalized: GPUOverviewPage.tsx, EditWorkerDialog.tsx, GPUManagementTab.tsx
- Production-ready implementation verified by architect with ZERO untranslated strings

**GPU Management Dashboard (Unified Architecture - Nov 2024):**
The GPU Management interface has been consolidated into a single unified page (`GPUOverviewPage.tsx`) that aggregates both manual and auto-managed GPU workers with RBAC security and **100% automatic orchestration** (zero manual controls). Key features include:
- Single `/api/gpu/overview` endpoint protected with `requirePermission("gpu:pool:read")` that returns all workers (manual + auto-managed), global stats, and orchestrator status
- Stats cards displaying: Total Workers, Online Workers, Total Requests, Average Latency
- Unified worker table with visual badges: "Auto" workers (purple badge with Zap icon) for auto-managed Kaggle/Colab notebooks, "Manual" workers (gray badge with Cpu icon) for manually added GPUs
- Quota status display exclusively for auto-managed workers (Kaggle 28h/week tracking)
- GPU orchestration is fully automatic and transparent - no manual Start/Stop controls in UI
- All GPU endpoints secured with RBAC: `gpu:pool:read` for read operations, `gpu:pool:manage` for CRUD operations, `gpu:pool:execute` for internal system operations
- Real-time status monitoring with 30-second auto-refresh

### Technical Implementations
The backend uses Node.js and TypeScript with Express.js and PostgreSQL via Drizzle ORM. Key services include LLM Client, Storage, Multi-Agent Router (MoE), namespace-scoped RAG, Agent Engine (ReAct with POMDP), Automatic Fallback, Production-Grade Multimodal Processing, Web Content Discovery, YouTube Transcription Service, Vision Cascade, free LLM Provider rotation, GPU Orchestrator, GPU Pool Manager, GPU Load Balancer, Training Data Collector, Dataset Generator, Auto-Learning System, Token Monitoring, Lifecycle Management, Orphan Detection, Validation (Zod schemas), and a Comprehensive Telemetry System. The Kaggle CLI Service uses environment variables for authentication, lazy loading from SecretsVault, UPM integration, multi-account support, and production-grade error handling. The system includes a Colab Orchestrator Service for Puppeteer automation, a GPU Management UI, a GPU Deletion Service, and an Auto-Scaling Service with a 24/7 Orchestrator. The Namespace Classifier uses LLM-based auto-classification.

**Vector Store Architecture (pgvector Native - Nov 2024):**
The Persistent Vector Store uses PostgreSQL pgvector extension with native vector operations for production-grade semantic search:
- **pgvector 0.8.0** with native `vector(1536)` data type for OpenAI embeddings
- **IVFFlat Index** with `vector_cosine_ops` for O(log N) approximate nearest neighbor search (vs O(N) brute-force)
- **Multi-tenant Isolation:** Namespace filtering applied post-query for cross-tenant protection with case-insensitive matching and wildcard "*" support
- **Performance:** IVFFlat index with lists=10 optimized for 10-1000 vector scale, degrades gracefully to exact search at <10k vectors
- **Cosine Distance Operator:** Native `<=>` operator leverages IVFFlat index for fast similarity search with distance normalization to [0,1] scores
- **LRU Cache:** In-memory hot embedding cache for frequently accessed documents with cache statistics tracking
- Migration from JSONB to native vector type completed with zero data loss (2 embeddings preserved)

Robust error handling and structured logging are implemented. The frontend implements a centralized i18n system and uses Replit Auth (OpenID Connect). RAG combines OpenAI embeddings with BM25. Professional video generation uses an asynchronous job queue. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate. Training data validation and a Lifecycle Management System are in place. The system implements a production-grade multi-provider billing architecture with real-time cost tracking and automated synchronization. Tool registration uses a mapping layer to bridge database tool names to agentTools registry keys. Message and tool execution persistence is bulletproof, ensuring data integrity. Enterprise Backup & Recovery System provides full database exports with admin-only access, rate limiting (1 backup/hour), temporary file streaming (no permanent storage), automatic cleanup of temp files >1hr old, atomic restore operations with safety snapshots, file validation (schema + size limits), and comprehensive audit logging via structured pino logging with userId, IP, requestId, and operationId tracking.

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