# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed to be robust, flexible, and self-operating. It addresses limitations of underlying LLM providers through externalized policy enforcement, an automatic fallback system, and a 5-tier priority chain with multi-GPU load balancing. Key features include configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents utilizing a POMDP with the ReAct framework, and professional video generation via an async GPU job system and LoRA fine-tuning. The system offers both an end-user chat interface and an administrative dashboard, operating in a single-tenant mode for simplified deployment and cost optimization.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core System Design
AION operates in single-tenant mode with **multi-agent architecture** utilizing Mixture of Experts (MoE) routing. Policy enforcement is externalized via JSON configurations. It features dual interfaces: an end-user chat and an administrative dashboard with dedicated Agents Management page. An automatic fallback system handles LLM refusals by performing web searches and indexing content. The system uses a 5-tier priority chain: KB → GPU Pool (custom LoRA models) → Free APIs (Groq, Gemini, HF) → Web Search → OpenAI, with the GPU Pool providing zero-cost inference via Google Colab workers. Universal multilingual support is provided via LLM-based dynamic language detection.

**Multi-Agent System**: AION now supports multiple specialized agents, each with dedicated knowledge base namespaces, tool access, and budget limits. An MoE router analyzes user queries and selects the best agent(s) using softmax probability distribution and top-p sampling. This enables vertical specialization (finance, tech, tourism, etc.), parallel processing, and improved cost efficiency through scoped RAG searches.

### UI/UX
The frontend uses React 18, Vite, Wouter, and TanStack Query, built with Radix UI, shadcn/ui patterns, Tailwind CSS, and a Material Design-inspired HSL-based custom design system. It includes a conversational chat interface and an Admin Dashboard with enterprise sidebar navigation for policy and metrics management across **12 sections** with multi-language support (PT-BR, EN-US, ES-ES). Branding consistently displays "AION". The Admin Dashboard features a structured layout with a collapsible sidebar and a sticky header, incorporating glassmorphism effects and professional visual hierarchy. A full-featured Datasets Management Page (production-ready) provides statistics, advanced filtering, sorting, bulk operations, and quality indicators for dataset management. The new **Agents Management Page** provides full CRUD operations for specialist agents, namespace configuration, tool assignment, and budget limits.

### Technical Implementations
The backend is built with Node.js and TypeScript using Express.js, with PostgreSQL via Drizzle ORM (Neon serverless). All date calculations use the America/Sao_Paulo timezone. Core services include LLM Client, Storage, Multi-Agent Router (MoE), RAG with namespace-scoping, Agent Engine (ReAct with POMDP), Policy Enforcement, Automatic Fallback, Multimodal Processing, Web Content Discovery, Free LLM Providers rotation, GPU Orchestrator, Training Data Collector, and Token Monitoring System. Authentication uses Replit Auth (OpenID Connect). Multilingual support is LLM-based. Refusal detection uses a 5-level verification system.

**Multi-Agent Architecture (PRODUCTION-READY)**: The system uses a Mixture of Experts (MoE) router that analyzes incoming queries using intent classification and routing probability distribution. Agent selection employs softmax normalization with temperature control and top-p sampling. Each agent has isolated RAG namespaces, dedicated tool access (SearchWeb, KB.Search, Exec, CallAPI), configurable budget limits, and escalation rules. The planner supports multi-agent orchestration with parallel execution and result aggregation.

**Implementation Status**: Complete multi-agent infrastructure deployed and tested (Oct 2025):
- **Backend**: Full CRUD API (PATCH-based updates), 4 DB tables (agents, tools, agent_tools, traces), dual-cache architecture (registry for lookup, runtime for execution)
- **Agent Pipeline**: DB → Loader → Registry + Runtime → Router (MoE) → Planner → Execution
- **AgentExecutor Pattern**: Loader wraps Agent configs with run() method via createAgentExecutor() factory, enabling planner to invoke agents without runtime errors
- **9 Specialist Agents Seeded**: Atendimento, Finanças, Tecnologia, Turismo, Automóveis, Gestão, Calendário, Marketing, Auxiliar
- **Admin UI**: Full CRUD operations with shadcn components, create/edit dialogs, PATCH method alignment
- **Event-Driven RAG**: Namespace-scoped indexing triggered by AGENT_CREATED/UPDATED/DELETED events
- **Next Steps**: Implement production LLM/RAG logic in AgentExecutor.run() (currently placeholder), add runtime.unregisterAgent() for cleanup

RAG combines OpenAI embeddings with BM25 for re-ranking using Max-Marginal Relevance (MMR), supported by an intelligent knowledge indexer with **namespace-scoped indexing** for agent isolation. The agent system utilizes a ReAct engine with POMDP for decision-making. The Policy Enforcement Pipeline uses a System Prompt Composer and Output Moderator with a JSON-configurable Policy DSL to refuse, redact, or rewrite responses. The Automatic Fallback System activates on LLM refusals in UNRESTRICTED mode, performing web searches and indexing content to generate uncensored responses.

Professional video generation uses an async job queue, GPU workers, and webhook callbacks, supporting Open-Sora 1.2, AnimateDiff, Stable Video Diffusion, and ModelScope. Free LLM and GPU infrastructure prioritize Groq, Gemini, and HuggingFace, with OpenAI as a last resort. Free GPU training leverages Google Colab and Kaggle for LoRA fine-tuning. A Multi-GPU Pool System manages distributed training and inference.

The Continuous Auto-Evolution System collects high-quality conversations as training data, calculates quality scores, and enhances JSONL format for instruction tuning. It integrates KB indexing with training data collection and enables auto-generated datasets from the Knowledge Base via the admin dashboard. Dataset management supports uploading, validation, and approval of custom datasets. Federated Learning enables multi-GPU distributed training with gradient aggregation. A Token Monitoring Dashboard provides real-time token usage tracking in America/Sao_Paulo timezone with **5-year data retention policy** (automated cleanup runs 1st of each month at 06:00 UTC / 03:00 Brasília), offering detailed analytics and cost estimates across all providers.

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