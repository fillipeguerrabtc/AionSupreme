# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation. It extends beyond current LLM limitations through externalized policy enforcement, an automatic fallback system, and a 5-tier priority chain with multi-GPU load balancing. Key capabilities include configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents utilizing a POMDP with the ReAct framework, and professional video generation. The system provides both an end-user chat interface and an administrative dashboard, operating in a single-tenant mode for optimized deployment and cost efficiency. Its business vision is to provide a self-sustaining, continuously evolving AI that learns and improves autonomously, significantly reducing reliance on external APIs over time.

## User Preferences
Preferred communication style: Simple, everyday language.

**REGRA FUNDAMENTAL DE TRABALHO:**
1. **SEMPRE responda dúvidas do usuário primeiro**
2. **SEMPRE continue tarefas em andamento até o final**
3. **NUNCA deixe tarefas incompletas para trás**
4. Se o usuário pedir novas atividades → adicione à fila APÓS as tarefas atuais
5. Fluxo obrigatório: Responder → Completar tarefas atuais → Iniciar novas tarefas
6. **NUNCA comece tarefas novas antes de terminar as antigas**

## Recent Critical Fixes (Oct 31, 2025)

### Latest Production Improvements (Oct 31, 2025 - Session 2)
**6 Critical Fixes Implemented & Architect-Approved:**

1. ✅ **Deep Crawler Image Preservation** - Images now ALWAYS maintained in content even when Gemini Vision API fails. Fallback: alt text → "Imagem sem descrição". Categorized error logging (quota exceeded/API key/network).

2. ✅ **Crawler Limits Optimization** - Default limits changed to maxDepth=5, maxPages=100 (from unrealistic 999/9999) for complete site capture without timeouts. Overridable via API.

3. ✅ **Consolidated Knowledge Mode** - New `consolidatePages` option merges entire website into single markdown KB entry with structured sections, images grouped, and multi-page tags. Eliminates curation queue clutter.

4. ✅ **Namespaces Layout Fix** - Responsive dialogs (max-w-4xl + w-[95vw]) and horizontal table scrolling prevent content clipping. All fields visible on any screen size.

5. ✅ **History Timestamp Backfill** - 3 historical curation items retroactively received `statusChangedAt` timestamps so they appear in History tab. All future approvals/rejections tracked automatically.

6. ✅ **Token Monitor Clarity** - UI redesigned with Lucide icons (Activity, Zap, Hash) to distinguish request limits from token monitoring. Primary card: "Requisições Hoje" (counts toward limit), Secondary card: "Tokens Consumidos" (monitoring only). ZERO emojis per design guidelines.

### HITL (Human-In-The-Loop) System - 100% Operational
**Problem Solved:** All content now passes through mandatory human curation before entering Knowledge Base or training pipeline.

**Implementation Details:**
1. ✅ **AutoIndexer Bypass Closed** - All 3 indexing methods (indexResponse, indexWebContent, indexConversation) now route exclusively to curation_queue instead of direct KB writes.
2. ✅ **CurationStore Enhanced** - approveAndPublish() saves approved content to both documents (status='indexed') and training_data_collection (status='approved') with namespace/quality validation.
3. ✅ **RAG Filter Fixed** - semanticSearch() now uses storage.getEmbeddingsByTenant() which filters ONLY embeddings from documents with status='indexed'. Direct database queries eliminated.
4. ✅ **Dataset Generator Protected** - Accepts ONLY training_data with status='approved'.
5. ✅ **Migration Executed** - 102 legacy documents moved to curation queue, embeddings deleted, training data purged, multi-tenant compatible.

**Current State:** 106 items in curation queue awaiting human review. Zero unreviewed content in production KB or training data.

### System Prompt Priority Optimization
**Problem Solved:** Questions answerable from System Prompt now consume ZERO tokens.

**Implementation:** Added STEP -1 to Priority Orchestrator that checks System Prompt before KB/APIs. Questions about creator (Fillipe Guerra) now answered directly without consuming any API tokens.

**New Priority Cascade:**
```
STEP -1: System Prompt (ZERO tokens) ← NEW!
STEP  0: Trivial questions (date/time)
STEP  1: Knowledge Base (RAG)
STEP  2: GPU Pool
STEP  3: Free APIs
STEP  4: Web/DeepWeb
STEP  5: OpenAI
```

## System Architecture

### Core System Design
AION operates in a single-tenant mode featuring a multi-agent architecture with Mixture of Experts (MoE) routing driven by LLM-based intent classification. Policy enforcement is externalized via JSON configurations. It offers dual interfaces: an end-user chat and an administrative dashboard with an Agents Management page. An automatic fallback system handles LLM refusals by performing web searches and indexing content. The system uses a 2-phase architecture, currently utilizing free LLM inference providers with OpenAI as a final fallback, with a future phase aiming for zero-cost inference via custom LoRA models fine-tuned on free GPUs. Universal multilingual support is provided via LLM-based dynamic language detection.

The multi-agent system supports specialized agents with dedicated knowledge base namespaces, tool access, and budget limits. An MoE router selects agents using softmax probability distribution and top-p sampling, enabling vertical specialization, parallel processing, and cost efficiency through scoped RAG searches. A friendly namespace system allows human-readable categories, and an administrative UI enables custom namespace creation and management. A Human-in-the-Loop (HITL) knowledge curation system, backed by PostgreSQL, employs specialized Curator agents and requires human approval for all content before indexing into the Knowledge Base.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query, using Radix UI, shadcn/ui patterns, Tailwind CSS, and a Material Design-inspired HSL-based custom design system. It features a conversational chat interface and an Admin Dashboard with enterprise sidebar navigation, supporting 13 sections and multi-language capabilities (PT-BR, EN-US, ES-ES). Branding is consistently "AION". The dashboard includes a structured layout with a collapsible sidebar, sticky header, glassmorphism effects, and professional visual hierarchy. Key dashboard pages include Datasets Management, Agents Management (with CRUD operations and custom namespace creation), and a Curation Queue for HITL content review.

### Technical Implementations
The backend uses Node.js and TypeScript with Express.js and PostgreSQL via Drizzle ORM (Neon serverless). All date calculations use the America/Sao_Paulo timezone. Core services include an LLM Client, Storage, Multi-Agent Router (MoE), RAG with namespace-scoping, an Agent Engine (ReAct with POMDP), Policy Enforcement, Automatic Fallback, Multimodal Processing, Web Content Discovery, Free LLM Providers rotation, GPU Orchestrator, Training Data Collector, and Token Monitoring System. Authentication uses Replit Auth (OpenID Connect). Multilingual support is LLM-based, and refusal detection employs a 5-level verification system.

The multi-agent architecture is fully functional, utilizing a Mixture of Experts (MoE) router for LLM-based intent classification via Groq, with fallback to keyword matching. Agent selection uses softmax normalization and temperature control. Each agent has isolated RAG namespaces, dedicated tool access, configurable budget limits, and escalation rules. The planner supports multi-agent orchestration with parallel execution. The AgentExecutor performs LLM calls, RAG searches within agent namespaces, budget enforcement, citation tracking, and token usage tracking. Eleven agents are seeded, including specialist and curator agents. The curation system includes backend routes, PostgreSQL-backed queue storage, and a UI for reviewing and publishing content. Event-driven RAG ensures namespace-scoped indexing.

RAG combines OpenAI embeddings with BM25 for re-ranking using Max-Marginal Relevance (MMR, with an intelligent knowledge indexer supporting namespace-scoped indexing for agent isolation. The Policy Enforcement Pipeline uses a System Prompt Composer and Output Moderator with a JSON-configurable Policy DSL. The Automatic Fallback System activates on LLM refusals in unrestricted mode, performing web searches and indexing content to generate uncensored responses.

Professional video generation uses an async job queue, GPU workers, and webhook callbacks, supporting various models like Open-Sora 1.2 and Stable Video Diffusion. Free LLM and GPU infrastructure prioritize Groq, Gemini, and HuggingFace, with OpenAI as a last resort. Free GPU training leverages Google Colab and Kaggle for LoRA fine-tuning. A Multi-GPU Pool System manages distributed training and inference.

The GPU Pool System (Phase 2) is fully operational with intelligent quota management and auto-shutdown capabilities. It supports plug&play connection of Google Colab and Kaggle GPUs through ngrok tunnels. Key features include: (1) **Intelligent Quota Manager** - Uses only 70% of available quota with 2-hour safety margin before Google limits (Colab: 10.0h sessions, Kaggle: 8.5h sessions), (2) **Auto-Shutdown System** - Notebooks automatically terminate 2 hours before platform limits to prevent quota violations, (3) **Round-Robin Load Balancing** - Distributes jobs across all available workers while respecting quota limits, (4) **Heartbeat Monitoring** - Detects offline workers and automatically rotates to next available GPU via background service (60s checks, 180s timeout), (5) **Multi-GPU Parallel Processing** - Supports up to 10 simultaneous workers (5 Colab + 5 Kaggle accounts) providing ~70-80 GPU hours per day at zero cost, (6) **Timezone Consistency** - All workers use America/Sao_Paulo timezone with sessionStart tracking for accurate runtime monitoring across restarts. Workers cannot be started remotely due to Google platform limitations - users must manually open notebooks and click "Run All", but all shutdown and rotation is fully automated. The system includes Jupyter notebooks (colab_worker.ipynb, kaggle_worker.ipynb) with pre-configured auto-shutdown logic, ngrok tunnel setup, API registration, and JavaScript Keep-Alive to prevent idle disconnection. Weekly quota resets occur automatically every Monday at 00:00 UTC. Complete setup documentation in SETUP_GPU_WORKERS.md and COLAB_TIMEZONE_FIX.md.

The GPU architecture supports both training (LoRA fine-tuning on free GPUs, with agents having specialized LoRA models trained on high-quality interactions, enabling continuous auto-evolution) and inference (GPU pool workers running custom LoRA models for zero-cost inference, replacing expensive API calls). This creates an autonomous growth cycle where user interactions lead to training data collection, auto-training, updated models, and continuously improving responses, aiming for near-full autonomy and minimal reliance on external APIs. The system learns and grows, with the Knowledge Base expanding with curated content.

The Continuous Auto-Evolution System collects high-quality conversations, calculates quality scores, and enhances JSONL for instruction tuning. It integrates KB indexing with training data collection and allows auto-generated datasets from the Knowledge Base via the admin dashboard. Dataset management supports custom dataset uploads, validation, and approval. Federated Learning enables multi-GPU distributed training. A Token Monitoring Dashboard provides real-time token usage tracking in America/Sao_Paulo timezone with a 5-year data retention policy, offering analytics and cost estimates across providers.

Multi-Cloud Deployment leverages Google Cloud Run and AWS Fargate (both free tier) with a shared Neon PostgreSQL database, featuring auto-failover, Dockerized production builds, and GitHub Actions for CI/CD.

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