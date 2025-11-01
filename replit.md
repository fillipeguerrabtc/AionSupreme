# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation, extending beyond current LLM limitations. It features configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents utilizing a POMDP with the ReAct framework, and professional video generation. The system provides both an end-user chat interface and an administrative dashboard, operating in a single-tenant mode for optimized deployment and cost efficiency. Its business vision is to provide a self-sustaining, continuously evolving AI that learns and improves autonomously, reducing reliance on external APIs over time.

## User Preferences
Preferred communication style: Simple, everyday language.

**REGRA FUNDAMENTAL DE TRABALHO:**
1. **SEMPRE responda dúvidas do usuário primeiro**
2. **SEMPRE continue tarefas em andamento até o final**
3. **NUNCA deixe tarefas incompletas para trás**
4. Se o usuário pedir novas atividades → adicione à fila APÓS as tarefas atuais
5. Fluxo obrigatório: Responder → Completar tarefas atuais → Iniciar novas tarefas
6. **NUNCA comece tarefas novas antes de terminar as antigas**

## System Architecture

### Core System Design
AION operates in a single-tenant mode with a multi-agent architecture and Mixture of Experts (MoE) routing driven by LLM-based intent classification. Policy enforcement is externalized via JSON configurations. It features an automatic fallback system for LLM refusals, a 5-tier priority chain for responses, and universal multilingual support via dynamic language detection. The system supports specialized agents with dedicated knowledge base namespaces, tool access, and budget limits. A Human-in-the-Loop (HITL) knowledge curation system, backed by PostgreSQL, requires human approval for all content before indexing. The architecture includes a GPU Pool System for distributed training and inference, supporting LoRA fine-tuning on free GPUs and aiming for zero-cost inference. A Continuous Auto-Evolution System collects high-quality conversations for instruction tuning and dataset generation. The agent system includes a tier-based hierarchy for agents and sub-agents, defined by namespace assignments, with robust cascade deletion and orphan detection mechanisms.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query, utilizing Radix UI, shadcn/ui patterns, Tailwind CSS, and a Material Design-inspired HSL-based custom design system. It offers a conversational chat interface and an Admin Dashboard with enterprise sidebar navigation, supporting 15 sections and multi-language capabilities (PT-BR, EN-US, ES-ES). The dashboard includes a collapsible sidebar, sticky header, glassmorphism effects, and pages for Datasets Management, Agents Management (with CRUD and unified namespace creation without system/custom distinction), Curation Queue for HITL content review, Vision System monitoring with real-time quota tracking across 5 providers (Gemini, GPT-4V, Claude3, HuggingFace, OpenAI), and KB Image Search with semantic AI-powered search using vision-generated descriptions. Knowledge Base management uses dedicated tabs for Documents and Images, with multi-select and bulk operation capabilities. UX Philosophy emphasizes dropdown selectors for all entity relationships (Agent→Namespace, SubAgent→Parent, Subnamespace→Parent) minimizing manual text input.

### Technical Implementations
The backend uses Node.js and TypeScript with Express.js and PostgreSQL via Drizzle ORM (Neon serverless). Core services include an LLM Client, Storage, Multi-Agent Router (MoE), RAG with namespace-scoping, an Agent Engine (ReAct with POMDP), Policy Enforcement, Automatic Fallback, Multimodal Processing, Web Content Discovery, Free LLM Providers rotation, GPU Orchestrator, Training Data Collector, Token Monitoring System, Lifecycle Management System, and Validation System (Zod schemas). Authentication uses Replit Auth (OpenID Connect). The multi-agent architecture utilizes a MoE router for LLM-based intent classification, with each agent having isolated RAG namespaces, dedicated tool access, configurable budget limits, and escalation rules. Namespace-based agent hierarchy is automatically inferred via namespace prefix matching (e.g., "core" is parent of "core.research"). RAG combines OpenAI embeddings with BM25 for re-ranking. The Policy Enforcement Pipeline uses a System Prompt Composer and Output Moderator with a JSON-configurable Policy DSL. Professional video generation uses an async job queue, GPU workers, and webhook callbacks. The GPU Pool System manages intelligent quota, auto-shutdown, round-robin load balancing, heartbeat monitoring, and multi-GPU parallel processing across Google Colab and Kaggle. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate with a shared Neon PostgreSQL database. Training data validation system includes 8 types of real-time inline validation. Lifecycle Management System enforces retention policies (conversations: 18mo archive + 5yr purge, training: 30d post-completion, GPU: 7d stale workers) with document-level preservation checking, timezone-aware scheduling (Brasília/UTC), and comprehensive audit logging. KB Cascade Delete ensures embeddings and physical files are deleted when documents are removed, with orphan detection preventing dangling references. Validation uses Zod schemas for lifecycle policies, datasets, and training data ensuring type-safe and validated data flows.

### System Design Choices
Key decisions include a single-tenant architecture, externalized JSON policies for dynamic updates, separation of the core model from enforcement policies, and an uncensored default mode. Observability includes metrics for latency, throughput, cache hit rates, cost estimates, and real-time token usage.

## External Dependencies

### Third-Party Services
- **OpenAI API**: LLM completions, embeddings, function calling.
- **Neon Database**: Serverless PostgreSQL.
- **Google Cloud Run**: Primary deployment platform.
- **AWS Fargate**: Backup deployment platform.
- **DuckDuckGo**: Web search.
- **OpenRouter, Groq, Gemini, HuggingFace**: Free LLM API providers.
- **Google Colab, Kaggle, Modal**: Free GPU resources for fine-tuning.
- **RunPod/Modal**: GPU workers for video generation.
- **Replit**: Development environment and authentication.
- **GitHub Actions**: CI/CD pipeline.

### Key Libraries (NPM)
- **@neondatabase/serverless**: PostgreSQL client
- **drizzle-orm**: Type-safe ORM
- **openai**: Official OpenAI SDK
- **@radix-ui/**: Accessible UI primitives
- **@tanstack/react-query**: Server state management
- **tailwindcss**: Utility-first CSS framework
- **zod**: Schema validation
- **mammoth**: DOCX → text extraction
- **xlsx**: Excel file parsing
- **xml2js**: XML parsing
- **pdf-parse**: PDF text extraction
- **cheerio**: HTML parsing and web scraping
- **multer**: File upload handling
- **sharp**: Image processing
- **file-type**: MIME type detection