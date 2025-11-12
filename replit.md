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
AION operates in a single-tenant mode with a multi-agent architecture and LLM-driven Mixture of Experts (MoE) routing, implementing a GPU-FIRST 4-level priority chain with automatic fallback and universal multi-language support. It supports specialized agents with dedicated knowledge base namespaces, tool access, and budget limits. A Human-in-the-Loop (HITL) knowledge curation system requires human approval for all content before indexing.

The **GPU-FIRST inference architecture** prioritizes internal GPU usage, falling back to web search + GPU, then free APIs (Groq, Gemini, HuggingFace, OpenRouter), and finally OpenAI (GPT-4o) as a last resort. GPU orchestration includes a **Production-Grade On-Demand GPU System** (`OnDemandGPUService`) with intelligent start/stop, quota-aware provider selection, and automatic idle shutdown. The service features Kaggle-only concurrency locking (1 session limit enforced), parallel Colab starts (multiple sessions allowed), 10-minute idle threshold with 5-minute check cadence (scheduler job: `gpu-idle-monitor`), retry logic on orchestrator failures (preserves activity timestamps), graceful shutdown via orchestrator.stopSession(), and SecretsVault integration for multi-account credential management. A GPU Pool System manages workers, heartbeat monitoring, load balancing, and inference priority.

The system features a Continuous Self-Evolution System for instruction tuning and dataset generation, Multimodal Processing (documents, images, videos, YouTube, Deep Web Crawling), and a Vision Cascade System with automatic failover. Agent systems include a level-based hierarchy, federated learning, and enterprise-level User & RBAC Management. Namespace isolation with schema updates ensures cross-tenant protection, and privacy-preserving heuristics are implemented via adaptive thresholds, LoRA fine-tuning, PII redaction, and a replay buffer.

### UI/UX
The frontend uses React 18, Vite, Wouter, and TanStack Query, built with Radix UI, shadcn/ui patterns, Tailwind CSS, and a custom HSL-based design system. It features a minimalist design with glassmorphism, offering a conversational chat interface and an enterprise-level Admin Panel with a consolidated hierarchical menu and full Internationalization (i18n) supporting PT-BR (default), EN-US, ES-ES. All administrative pages, including Dataset, Agent, Curation Queue, and GPU Management, are fully translated. The Curation Queue supports filtering and batch actions. Vision System monitoring displays real-time quota tracking. AI-powered semantic image search and Health Diagnostics are included. The Personality Equalizer offers granular control via 7 functional sliders. The i18n architecture is centralized, type-safe, and uses a semantic hierarchical structure with interpolation. The GPU Management Dashboard is unified, aggregating manual and auto-managed GPU workers with RBAC security and 100% automatic orchestration. The Cascade Deletion system features a reusable CascadeDeleteDialog component showing dependency impact preview with dataset/model counts, taint status, metadata collection forms, and GDPR-compliant audit trail.

### Technical Implementations
The backend uses Node.js, TypeScript, Express.js, and PostgreSQL via Drizzle ORM. Key services include an LLM Client, Storage, Multi-Agent Router (MoE), namespace-scoped RAG, Agent Engine (ReAct with POMDP), Automatic Fallback, Production-Grade Multimodal Processing, Web Content Discovery, YouTube Transcription Service, Vision Cascade, free LLM Provider rotation, GPU Orchestrator, GPU Pool Manager, GPU Load Balancer, Training Data Collector, Dataset Generator, Auto-Learning System, Token Monitoring, Lifecycle Management, Orphan Detection, Zod schema validation, and a Comprehensive Telemetry System. The Kaggle CLI Service uses environment variables for authentication, lazy loading from SecretsVault, UPM integration, and multi-account support. The Namespace Classifier uses LLM-based auto-classification.

**Enterprise Cascade Data Lineage System** (`KBCascadeService`) implements production-grade deletion tracking with:
- **Hybrid deletion strategy**: Hard delete embeddings/files (reduce storage costs), soft preserve GDPR-compliant metadata in `deletion_tombstones` (forensic audit trail)
- **Dependency tracking**: GIN-indexed array containment queries on `kb_dependency_edges` (documents → datasets) and `model_data_lineage` (datasets → models)
- **Automatic model tainting**: When training data is deleted, all derived models automatically marked as tainted with cascading propagation
- **4 Admin API endpoints**: GET dependencies/:id (impact preview), GET tombstones (audit queries with filters), GET tombstone/:id (detail view), POST delete/:id (cascade deletion with metadata)
- **Type-safe contracts**: `shared/cascade-types.ts` ensures frontend/backend alignment for CascadeDependencyResponse, CascadeDeletePayload, CascadeDeleteResponse, TombstoneRecord
- **GDPR compliance**: Tombstones store only non-PII metadata (entityType, entityId, deletedBy, deletedAt, reason, gdprReason, retentionDays, affectedEntities)
- **Reusable UI component**: `CascadeDeleteDialog` (326 lines) shows real-time impact analysis, validation forms, loading states, error handling

**Production-Grade Colab Orchestrator Service** (`ColabCreator`) implements Puppeteer-based automation with:
- **Stealth anti-detection**: puppeteer-extra with StealthPlugin, `--disable-blink-features=AutomationControlled`
- **Session persistence**: Per-email Chrome userDataDir (env: `CHROME_USER_DATA_DIR`, fallback: `/tmp`)
- **Robust authentication**: Retry logic (max 3 attempts), exponential backoff, 2FA detection, login error detection, screenshot debugging, human-like typing simulation (50ms delay)
- **Resilient notebook creation**: Múltiplos seletores robustos (fallback chain), retry logic, rename non-critical (continua se falhar)
- **Production-grade GPU configuration**: 4 strategies para abrir Runtime Settings (XPath text matching, DOM evaluate, keyboard shortcut, direct URL navigation), multiple selector fallbacks, screenshot em caso de erro
- **Secure worker code injection**: NGROK_AUTH_TOKEN lido de env var (nunca hardcoded), GPU detection com memory info, health/shutdown endpoints, fail-fast se token ausente
- **XPath-based selector resilience**: Todos `:has-text()` removidos (não suportados), substituídos por `page.$x()` ou `evaluate()` para text matching
- A GPU Management UI, a GPU Deletion Service, and an Auto-Scaling Service with a 24/7 Orchestrator are implemented.

The **Persistent Vector Store** uses PostgreSQL's `pgvector` extension with native vector operations, including `IVFFlat Index` for approximate nearest neighbor search and multi-tenant isolation. 

**Production-Grade Persistence Layer (PostgreSQL-backed):**
- **Circuit Breaker**: State machine (CLOSED → OPEN → HALF_OPEN) com persistência PostgreSQL na tabela `circuit_breaker_state`, usando async factory pattern (`CircuitBreakerManager.create()`) para recovery de estado após restarts. Automatic upsert em transições de estado.
- **LLM Provider Quotas**: Sistema de quota tracking para 4 providers (OpenRouter, Groq, Gemini, HuggingFace) com persistência na tabela `llm_provider_quotas`. Async factory pattern (`LLMClient.create()`) garante hydration de quotas do DB ao iniciar.
- **Vision Cascade Quotas**: Sistema de quota tracking para 4 vision providers (Gemini, GPT-4V OpenRouter, Claude-3 OpenRouter, HuggingFace) com persistência na tabela `vision_quota_state`. Async factory pattern (`VisionCascade.create()`, `ImageProcessor.create()`, `DeepCrawler.create()`) garante recovery de quotas após restarts. Inclui 11 pontos de integração com hydration automática do DB.
- **GPU Quota Enforcement (70% ENTERPRISE STANDARD)**: Sistema de quota enforcement com `QuotaEnforcementService` (495 linhas) + `GpuWatchdogService` (335 linhas) garantindo 70% de uso semanal (Kaggle: 21h/week max, 8.4h/session; Colab: 8.4h/session, 36h cooldown). DB registration é FATAL (throw + Puppeteer cleanup) - se PostgreSQL falhar, GPU NÃO inicia (zero quota bypass). Watchdog monitora autoShutdownAt do DB every 1min e força shutdown durável via registered callback. Survives restarts (PostgreSQL persistence). Zero orphaned sessions.

Todos os sistemas de persistência implementam structured logging via Pino, error handling não-throwing (fault-tolerant), e backward compatibility nos construtores. The frontend uses Replit Auth (OpenID Connect). RAG combines OpenAI embeddings with BM25. Professional video generation uses an asynchronous job queue. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate. A multi-provider billing architecture with real-time cost tracking and automated synchronization is implemented. Tool registration uses a mapping layer. Message and tool execution persistence ensures data integrity. An Enterprise Backup & Recovery System provides full database exports with security, rate limiting, temporary file streaming, automatic cleanup, atomic restore operations, file validation, and comprehensive audit logging.

### System Design Decisions
Key decisions include a single-tenant architecture, externalized JSON behavioral configurations, and comprehensive observability and telemetry with query monitoring, granular hierarchical usage analytics, and a modern dashboard with Recharts. Security involves AES-256-GCM encryption for API credentials stored in a SecretsVault, supporting multi-account management with individual quota tracking.

## External Dependencies

### Third-Party Services
- **API OpenAI**: LLM completions, embeddings, function calling, GPT-4o Vision.
- **Neon Database**: PostgreSQL Serverless.
- **Google Cloud Run**: Primary deployment platform.
- **AWS Fargate**: Backup deployment platform.
- **DuckDuckGo**: Web search.
- **OpenRouter**: Free LLM API gateway.
- **Groq, Gemini, HuggingFace**: Free LLM API providers.
- **Google Colab, Kaggle, Modal**: Free GPU resources.
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