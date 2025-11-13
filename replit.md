# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation, extending beyond current LLM limitations. Its core purpose is to deliver a self-sustaining, continuously evolving AI that learns and improves autonomously, reducing reliance on external APIs over time. Key capabilities include configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents using POMDP with a ReAct framework, and professional video generation. The system provides a chat interface for end-users and an administrative dashboard with a 7-Trait Personality Equalizer. It incorporates production-ready autonomous meta-learning capabilities, including a Meta-Learner Service, an Adaptive Mixture of Experts (ShiftEx MoE), a Personalized expert selection (PM-MoE Aggregator), and a Self-Improvement Engine for autonomous code analysis and patching. The business vision is to provide a comprehensive, self-managing AI solution that offers significant market potential by automating complex tasks and continuous self-optimization across various enterprise applications.

## User Preferences
Estilo de comunicação preferido: Linguagem simples e cotidiana.

**REGRA FUNDAMENTAL DE TRABALHO:**
1. **SEMPRE responda dúvidas do usuário primeiro**
2. **SEMPRE continue tarefas em andamento até o final**
3. **NUNCA deixe tarefas incompletas para trás**
4. Se o usuário pedir novas atividades → adicione à fila APÓS as tarefas atuais
5. Fluxo obrigatório: Responder → Completar tarefas atuais → Iniciar novas tarefas
6. **NUNCA comece tarefas novas antes de terminar as antigas**

**🚨 REGRAS CRÍTICAS DE GPU - RISCO DE BAN!**

**KAGGLE - On-Demand + Idle Timeout:**
- 🔢 **Quota Semanal**: 30h oficial → Usamos 21h (70% safety) = 75600s
- ⏱️ **Quota Sessão**: 12h oficial → Usamos 8.4h (70% safety) = 30240s
- 🎯 **Ativação**: ON-DEMAND (liga quando chega tarefa: training/inference/KB/internet)
- ⏲️ **Idle Timeout**: 10min após completar tarefa
  - Executa → Aguarda 10min → Nova tarefa? → Executa + 10min novamente
  - Sem tarefa em 10min? → DESLIGA automaticamente
- ⚠️ **CRITICAL**: Respeitar AMBAS quotas (sessão E semanal) = OBRIGATÓRIO!
  - Violar qualquer limite = BAN PERMANENTE da conta Google!
- 📊 **Tracking**: PostgreSQL-based (Kaggle não tem API de quota)

**COLAB - Schedule Fixo:**
- ⏱️ **Quota Sessão**: 12h oficial → Usamos 8.4h (70% safety) = 30240s
- ⏰ **Cooldown**: 36h obrigatório entre sessões = 129600s
- 🔄 **Ativação**: ROTAÇÃO FIXA (schedule automático)
  - Liga → Roda 8.4h → Desliga → 36h rest → Repete
- ❌ **NUNCA on-demand** - apenas schedule fixo!
- ⚠️ **CRITICAL**: Respeitar cooldown = OBRIGATÓRIO!
  - Violar = BAN PERMANENTE da conta Google!

**CONSTANTES CENTRALIZADAS:**
```typescript
// server/gpu-orchestration/intelligent-quota-manager.ts
export const GPU_QUOTA_CONSTANTS = {
  COLAB_SAFETY: 30240,        // 8.4h
  COLAB_COOLDOWN: 129600,     // 36h
  KAGGLE_GPU_SAFETY: 30240,   // 8.4h
  KAGGLE_WEEKLY_SAFETY: 75600, // 21h
  KAGGLE_IDLE_TIMEOUT: 600,   // 10min
}
```

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
AION operates in a single-tenant mode with a multi-agent architecture and LLM-driven Mixture of Experts (MoE) routing. It implements a GPU-FIRST 4-level priority chain with automatic fallback and universal multi-language support. Specialized agents have dedicated knowledge base namespaces, tool access, and budget limits. A Human-in-the-Loop (HITL) knowledge curation system requires human approval for content. The GPU-FIRST inference architecture prioritizes internal GPU usage, falling back to web search + GPU, then free APIs, and finally OpenAI as a last resort, managed by a Production-Grade On-Demand GPU System. The system features a Continuous Self-Evolution System, Multimodal Processing, Vision Cascade System, level-based agent hierarchy, federated learning, and enterprise-level User & RBAC Management. Namespace isolation with schema updates ensures cross-tenant protection, and privacy-preserving heuristics are implemented.

### UI/UX
The frontend uses React 18, Vite, Wouter, and TanStack Query, built with Radix UI, shadcn/ui patterns, Tailwind CSS, and a custom HSL-based design system. It features a minimalist, glassmorphism design with a conversational chat interface and an enterprise-level Admin Panel. The Admin Panel includes a consolidated hierarchical menu, full Internationalization (i18n) supporting PT-BR (default), EN-US, ES-ES, a 7-Trait Personality Equalizer with granular control, and a GPU Management Dashboard with RBAC and auto-orchestration.

### Technical Implementations
The backend uses Node.js, TypeScript, Express.js, and PostgreSQL via Drizzle ORM. Key services include an LLM Client, Storage, Multi-Agent Router (MoE), namespace-scoped RAG, Agent Engine (ReAct with POMDP), Automatic Fallback, Production-Grade Multimodal Processing, Web Content Discovery, YouTube Transcription Service, Vision Cascade, free LLM Provider rotation, GPU Orchestrator, GPU Pool Manager, GPU Load Balancer, Training Data Collector, Dataset Generator, Auto-Learning System, Token Monitoring, Lifecycle Management, Orphan Detection, Zod schema validation, and a Comprehensive Telemetry System. A Kaggle CLI Service uses environment variables for authentication. The Namespace Classifier uses LLM-based auto-classification.

An **Enterprise Cascade Data Lineage System** (`KBCascadeService`) implements production-grade deletion tracking with a hybrid strategy, dependency tracking, automatic model tainting, and 4 Admin API endpoints for impact preview, audit queries, and cascade deletion, ensuring GDPR compliance. A **Production-Grade Colab Orchestrator Service** (`ColabCreator`) automates notebook creation with Puppeteer, stealth anti-detection, session persistence, robust authentication, and secure worker code injection. The **Persistent Vector Store** uses PostgreSQL's `pgvector` extension with IVFFlat Index for approximate nearest neighbor search and multi-tenant isolation. A **Production-Grade Persistence Layer** (PostgreSQL-backed) implements a Circuit Breaker, LLM Provider Quotas, Vision Cascade Quotas, and GPU Quota Enforcement with `QuotaEnforcementService` and `GpuWatchdogService`. A **Real-Time Provider Quota Monitoring System** (`ProviderLimitsTracker`) fetches real quota data directly from provider APIs and documentation, persisting it in PostgreSQL with automatic synchronization. All persistence systems feature structured logging, fault-tolerant error handling, and backward compatibility. The frontend uses Replit Auth (OpenID Connect). RAG combines OpenAI embeddings with BM25. Professional video generation uses an asynchronous job queue. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate. A multi-provider billing architecture with real-time cost tracking is implemented. Message and tool execution persistence ensures data integrity. An Enterprise Backup & Recovery System provides full database exports with security, rate limiting, and audit logging.

The **Production-Grade LoRA Training Pipeline** implements end-to-end autonomous model fine-tuning with GPU quota management, including automated training triggers, dataset preprocessing into HuggingFace format, Kaggle worker automation via Puppeteer, LoRA training on TinyLlama-1.1B-Chat (4-bit quantization, PEFT), model persistence, and metrics tracking.

The **Semantic Enforcement System** ensures 100% semantic enforcement across all components using OpenAI embeddings, featuring a Query Frequency Service, Auto-Namespace Creator with accent-aware defaults and trait sliders, LLM-based Namespace Classifier, multi-stage Auto-Approval Logic, and a 3-Tier Deduplication System.

### System Design Decisions
Key decisions include a single-tenant architecture, externalized JSON behavioral configurations, and comprehensive observability and telemetry with query monitoring and granular usage analytics. Security involves AES-256-GCM encryption for API credentials stored in a SecretsVault, supporting multi-account management with individual quota tracking.

## External Dependencies

### Third-Party Services
- **API OpenAI**: LLM completions, embeddings, function calling, GPT-4o Vision.
- **Neon Database**: PostgreSQL Serverless.
- **Google Cloud Run**: Primary deployment platform.
- **AWS Fargate**: Backup deployment platform.
- **DuckDuckGo**: Web search.
- **OpenRouter, Groq, Gemini, HuggingFace**: Free LLM API providers.
- **Google Colab, Kaggle, Modal**: Free GPU resources.
- **RunPod/Modal**: GPU workers for video generation.
- **Replit**: Development environment and authentication (OpenID Connect).

### Core Libraries (NPM)
- **@neondatabase/serverless**: PostgreSQL client.
- **drizzle-orm**: Type-safe ORM.
- **openai**: Official OpenAI SDK.
- **@google/generative-ai**: Gemini API client.
- **@huggingface/inference**: HuggingFace API client.
- **groq-sdk**: Groq API client.
- **youtube-transcript**: YouTube caption/subtitle extraction.
- **@radix-ui/**: Accessible UI primitives.
- **@tanstack/react-query**: Server state management.
- **tailwindcss**: Utility-first CSS framework.
- **zod**: Schema validation.
- **mammoth**: DOCX to text extraction.
- **xlsx**: Excel file parsing.
- **xml2js**: XML parsing.
- **pdf-parse**: PDF text extraction.
- **cheerio**: HTML parsing and web scraping.
- **multer**: File upload handling.
- **file-type**: MIME type detection.
```