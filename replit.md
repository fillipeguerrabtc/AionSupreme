# AION - Sistema de IA Autônomo

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation, extending beyond current LLM limitations. It features configurable policy application, RAG-based knowledge retrieval, advanced autonomous agents using POMDP with the ReAct framework, and professional video generation. The system provides both a chat interface for end-users and an administrative panel with a 7-Trait Personality Equalizer. Operating in single-tenant mode for optimized deployment and cost efficiency, AION's business vision is to provide a self-sustaining, continuously evolving AI that learns and improves autonomously, reducing reliance on external APIs over time.

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
AION operates in single-tenant mode with a multi-agent architecture and LLM-driven Mixture of Experts (MoE) routing based on intent classification. It includes an automatic fallback system with a 5-level priority chain for responses and universal multilingual support. The system supports specialized agents with dedicated knowledge base namespaces, tool access, and budget limits. A Human-in-the-Loop (HITL) knowledge curation system, backed by PostgreSQL, requires human approval for all content before indexing, with a Zero Bypass Policy. A Production-Ready GPU Pool System manages worker detection, heartbeat monitoring, load balancing, inference priority, and schedule-based rotation. A Continuous Self-Evolution System gathers high-quality conversations for instruction tuning and dataset generation, enforcing HITL. Complete Multimodal Processing supports various document types, images, videos, YouTube transcripts, and Deep Web Crawling. The Vision Cascade System provides 5-provider automatic failover with quota tracking. The agent system includes a level-based hierarchy for agents and sub-agents with cascading deletion. Federated Learning is fully implemented with Gradient Aggregation Coordinator and Fault Tolerance. User Management & RBAC provide enterprise-grade user and permission management with a granular permissions system.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query, using Radix UI, shadcn/ui patterns, Tailwind CSS, and a custom HSL-based design system. It features an elegant minimalist design with modern glassmorphism. It offers a clean conversational chat interface and an Admin Panel with enterprise-grade side navigation and a complete Internationalization (i18n) system supporting PT-BR (default), EN-US, ES-ES. All administrative pages are translated, including Dataset, Agent, and Curation Queue management. The Curation Queue for HITL review supports filtering and bulk actions. Vision System monitoring displays real-time quota tracking across 5 providers. An AI-powered semantic Image Search and Health Diagnostics are included. The Personality Equalizer in the Settings tab offers granular control via 7 functional sliders.

### Technical Implementations
The backend uses Node.js and TypeScript with Express.js and PostgreSQL via Drizzle ORM. Key services include an LLM Client, Storage, Multi-Agent Router (MoE), namespace-scoped RAG, an Agent Engine (ReAct with POMDP), Automatic Fallback, Production-Grade Multimodal Processing, Web Content Discovery, YouTube Transcript Service, Vision Cascade, free LLM Provider rotation, GPU Orchestrator, GPU Pool Manager, GPU Load Balancer, Training Data Collector, Dataset Generator, Auto-Learning System, Token Monitoring, Lifecycle Management, Orphan Detection, Validation (Zod schemas), and a Complete Telemetry System. The frontend implements a centralized i18n system with a `useLanguage()` hook. Authentication uses Replit Auth (OpenID Connect). RAG combines OpenAI embeddings with BM25 for re-ranking. Professional video generation uses an asynchronous job queue, GPU workers, and webhook callbacks. The Automated Namespace Classification System uses GPT-4 for intelligent content analysis. The GPU Pool System manages intelligent quota, auto-shutdown, load balancing, and heartbeat monitoring. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate. Training data validation includes 8 real-time inline validation types. The Lifecycle Management System applies retention policies. KB Cascade Delete ensures comprehensive data removal.

### System Design Choices
Key decisions include a single-tenant architecture, externalized JSON behavioral configurations for dynamic updates. Full observability and telemetry include comprehensive query monitoring, granular hierarchical usage analytics, a modern dashboard with Recharts visualizations, PostgreSQL trigram indexes for optimized search performance, and 29 production-ready REST endpoints for metrics access.

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
- **GitHub Actions**: CI/CD pipeline.

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