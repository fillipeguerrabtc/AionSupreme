# AION - Sistema de IA Autônomo

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation, extending beyond current LLM limitations. It features configurable policy application, RAG-based knowledge retrieval, advanced autonomous agents using POMDP with the ReAct framework, and professional video generation. The system provides both a chat interface for end-users and an administrative panel with a **7-Trait Personality Equalizer** (verbosity, formality, creativity, precision, persuasiveness, empathy, enthusiasm). Operating in single-tenant mode for optimized deployment and cost efficiency, AION's business vision is to provide a self-sustaining, continuously evolving AI that learns and improves autonomously, reducing reliance on external APIs over time.

## User Preferences
Estilo de comunicação preferido: Linguagem simples e cotidiana.

**REGRA FUNDAMENTAL DE TRABALHO:**
1. **SEMPRE responda dúvidas do usuário primeiro**
2. **SEMPRE continue tarefas em andamento até o final**
3. **NUNCA deixe tarefas incompletas para trás**
4. Se o usuário pedir novas atividades → adicione à fila APÓS as tarefas atuais
5. Fluxo obrigatório: Responder → Completar tarefas atuais → Iniciar novas tarefas
6. **NUNCA comece tarefas novas antes de terminar as antigas**

## System Architecture

### Core System Design
AION operates in single-tenant mode with a multi-agent architecture and LLM-driven Mixture of Experts (MoE) routing based on intent classification. It includes an automatic fallback system, a 5-level priority chain for responses, and universal multilingual support via dynamic language detection. The system supports specialized agents with dedicated knowledge base namespaces, tool access, and budget limits. A Human-in-the-Loop (HITL) knowledge curation system, backed by PostgreSQL, requires human approval for all content before indexing, featuring an **Auto-Recognition Curating Agent System** for automated quality analysis. The architecture incorporates a GPU Pool System for distributed training and inference, supporting LoRA fine-tuning on free GPUs and aiming for zero-cost inference. A Continuous Self-Evolution System gathers high-quality conversations for instruction tuning and dataset generation. The agent system includes a level-based hierarchy for agents and sub-agents, defined by namespace assignments, with robust cascading deletion and orphan detection mechanisms. Federated Learning is fully implemented with Gradient Aggregation Coordinator, GPUPool Federated Methods, and Fault Tolerance for multi-round training.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query, using Radix UI, shadcn/ui patterns, Tailwind CSS, and a custom HSL-based design system. It features an **elegant minimalist design** with an off-white background and refined Plus Jakarta Sans typography, applying **modern glassmorphism** to admin cards. It offers a clean conversational chat interface and an Admin Panel with enterprise-grade side navigation and a **complete Internationalization (i18n) system** supporting PT-BR (default), EN-US, ES-ES. All administrative pages are translated, including 15 panel sections (Datasets, Specialist Agents, Curation Queue, Image Search, Vision System, Namespaces, Lifecycle Policies, **Telemetria**). The panel includes a collapsible sidebar, sticky header, and pages for Dataset Management, Agent Management (simplified CRUD), Curation Queue for HITL review, Vision System monitoring with real-time quota tracking across 5 providers, AI-powered semantic Image Search, and Health Diagnostics (orphan scan). Knowledge Base management uses dedicated tabs for Documents and Images with multi-selection and bulk operations. The **Personality Equalizer** in the Settings tab offers granular control via 7 functional sliders with inline explanations, dynamically applied via system prompts to LLMs. UX philosophy emphasizes maximum automation and visual sophistication, generating identifiers, slugs, and validations automatically.

### Technical Implementations
The backend uses Node.js and TypeScript with Express.js and PostgreSQL via Drizzle ORM (Neon serverless). Key services include an LLM Client, Storage, Multi-Agent Router (MoE), namespace-scoped RAG, an Agent Engine (ReAct with POMDP), Automatic Fallback, Multimodal Processing, Web Content Discovery, free LLM Provider rotation, GPU Orchestrator, Training Data Collector, Token Monitoring, Lifecycle Management, Orphan Detection, Validation (Zod schemas), and **Complete Telemetry System** (Query Monitoring with p50/p95/p99 latency tracking, Usage Tracking for agents/namespaces with historical analytics, 24 REST endpoints, and modern dashboard with auto-refresh). The frontend implements a **centralized i18n system** with `useLanguage()` hook and language persistence. Slug generation is automatic, unique, and immutable. Authentication uses Replit Auth (OpenID Connect). The multi-agent architecture uses an MoE router for LLM-based intent classification, with each agent having isolated RAG namespaces, dedicated tool access, configurable budget limits, and escalation rules. RAG combines OpenAI embeddings with BM25 for re-ranking. Professional video generation uses an asynchronous job queue, GPU workers, and webhook callbacks. The **Automated Namespace Classification System** uses GPT-4 for intelligent content analysis and ideal namespace suggestion during HITL curation, incorporating multi-metric similarity detection and an auto-creation workflow with Zod validation. The GPU Pool System manages intelligent quota, auto-shutdown, round-robin load balancing, heartbeat monitoring, and multi-GPU parallel processing across Google Colab and Kaggle. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate with a shared Neon PostgreSQL database. Training data validation includes 8 real-time inline validation types. The Lifecycle Management System applies retention policies with document-level preservation checks, timezone-aware scheduling, and comprehensive audit logging. KB Cascade Delete ensures embeddings and physical files are deleted with documents, preventing dangling references.

### System Design Choices
Key decisions include a single-tenant architecture, externalized JSON behavioral configurations for dynamic updates and separation of core model from application settings. **Full observability and telemetry** includes comprehensive query monitoring (latency p50/p95/p99, success/error rates, slow query detection), **granular hierarchical usage analytics** (agent vs subagent tier tracking, root namespace vs sub-namespace tracking, drill-down UI, sub-entity counters), usage analytics (agent execution tracking, namespace search tracking, top/least-used analysis, 30-day historical trends), modern dashboard with 2 tabs (System Metrics + KB/Chat Analytics) featuring Recharts visualizations and auto-refresh every 10s, PostgreSQL trigram indexes (GIN) for optimized namespace search performance, and **29 production-ready REST endpoints** (24 core + 5 hierarchical drill-down) for metrics access.

## External Dependencies

### Third-Party Services
- **API OpenAI**: LLM completions, embeddings, function calling.
- **Neon Database**: PostgreSQL Serverless.
- **Google Cloud Run**: Primary deployment platform.
- **AWS Fargate**: Backup deployment platform.
- **DuckDuckGo**: Web search.
- **OpenRouter, Groq, Gemini, HuggingFace**: Free LLM API providers.
- **Google Colab, Kaggle, Modal**: Free GPU resources for fine-tuning.
- **RunPod/Modal**: GPU workers for video generation.
- **Replit**: Development environment and authentication.
- **GitHub Actions**: CI/CD pipeline.

### Core Libraries (NPM)
- **@neondatabase/serverless**: PostgreSQL client
- **drizzle-orm**: Type-safe ORM
- **openai**: Official OpenAI SDK
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
- **sharp**: Image processing
- **file-type**: MIME type detection