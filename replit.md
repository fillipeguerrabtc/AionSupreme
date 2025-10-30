# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system providing a robust, flexible, and self-operating AI solution. It aims to overcome limitations and biases of underlying LLM providers through externalized policy enforcement, an automatic fallback system, and a 5-tier priority chain with multi-GPU load balancing. Key capabilities include configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents utilizing a POMDP with the ReAct framework, and professional video generation via an async GPU job system and LoRA fine-tuning. The system offers both an end-user chat interface and an administrative dashboard for comprehensive management, aiming to deliver a powerful, flexible, and cost-effective AI solution. Operates in **single-tenant mode** for simplified deployment and cost optimization.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core System Design
AION operates in **single-tenant mode** for simplified deployment and cost optimization. Policy enforcement is externalized via JSON configurations for runtime updates. It features a dual-interface: an end-user chat and an administrative dashboard. A key feature is an automatic fallback system for LLM refusals, performing web searches, indexing content, and responding without censorship in UNRESTRICTED mode. The system uses a **5-tier priority chain with multi-GPU load balancing**: **KB → GPU Pool (custom LoRA models) → Free APIs (Groq, Gemini, HF) → Web Search → OpenAI**. The GPU Pool provides zero-cost inference via automatic rotation of Google Colab workers across multiple accounts. Universal multilingual support is provided via LLM-based dynamic language detection and response generation.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query. It uses Radix UI with shadcn/ui patterns, Tailwind CSS, and a Material Design-inspired custom design system featuring HSL-based colors and Inter/JetBrains Mono fonts. It includes a conversational chat interface with persistent memory and an Admin Dashboard for policy and metrics management.

### Technical Implementations
**Backend (Node.js + TypeScript):**
- **Framework**: Express.js with TypeScript.
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless).
- **Timezone**: **America/Sao_Paulo (Brasília, Brazil)** - All date calculations use Brazilian timezone for accurate "today" and "this month" tracking.
- **Core Services**: LLM Client, Storage Layer, RAG Service, Agent Engine (ReAct with POMDP), Policy Enforcement, Automatic Fallback, Multimodal Processor, Web Content Discovery (SearchVideos, SearchImages, SearchWeb, TorSearch), Free LLM Providers rotation, GPU Orchestrator, Training Data Collector, Token Monitoring System.
- **Authentication**: Replit Auth (OpenID Connect).
- **Multilingual Support**: LLM-based dynamic language detection and response generation.
- **Refusal Detection**: A 5-level verification system with a whitelist approach.

**RAG (Retrieval-Augmented Generation):**
- **Components**: Embedder, Vector Store (in-memory FAISS-like), Hybrid Search (BM25 lexical + semantic), Knowledge Indexer.
- **Strategy**: Combines OpenAI embeddings with BM25 for re-ranking using Max-Marginal Relevance (MMR).
- **Knowledge Indexer**: Intelligent chunking, configurable chunk size/overlap, automatic embedding, quality scoring.

**Agent System:**
- **Framework**: ReAct (Reasoning + Acting) engine (Thought→Action→Observation loop).
- **Decision Making**: Partially Observable Markov Decision Process (POMDP).
- **Tools**: SearchWeb, SearchVideos, SearchImages, TorSearch, KBSearch, Exec, Finish.

**Policy Enforcement Pipeline:**
- **Components**: System Prompt Composer, Output Moderator, Policy DSL (JSON configuration).
- **Actions**: Policies can `refuse`, `redact`, or `rewrite` responses based on 7 categories.

**Automatic Fallback System:**
- **Mechanism**: Activated upon LLM refusals in UNRESTRICTED mode; performs web searches (DuckDuckGo), fetches content, indexes it, and generates uncensored responses.
- **Time-Sensitive Queries**: Triggers web search for time-sensitive keywords if KB confidence is low.

**Professional Video Generation System (100% Open-Source):**
- **Architecture**: Async job queue → GPU worker → Webhook callback.
- **Models**: Open-Sora 1.2, AnimateDiff, Stable Video Diffusion, ModelScope.

**Free LLM & GPU Infrastructure System:**
- **Free APIs (PRIORITY ORDER)**: Groq → Gemini → HuggingFace → OpenRouter. OpenAI is last resort.
- **Free GPU Training**: Automatic rotation between Google Colab and Kaggle for LoRA fine-tuning (Mistral 7B, Llama 3 8B, Phi-3).
- **Multi-GPU Pool System**: Manages GPU workers for distributed training and inference, including health checks, load balancing, and auto-registration.

**Continuous Auto-Evolution System:**
- **Automatic Training Data Collection**: High-quality conversations (score ≥ 60, ≥ 4 messages, ≥ 100 tokens) are automatically collected after each assistant response.
- **Quality Metrics**: Calculates scores based on message count, token count, latency, provider diversity, tool usage, and attachments.
- **Enhanced JSONL Format**: Includes conversation context (last 3 exchanges), tool execution results with arguments, system prompt, and full message history for instruction tuning.
- **KB → Training Integration**: Conversations are indexed into Knowledge Base for immediate reuse, then collected for long-term model fine-tuning.
- **Auto-Generated Datasets from KB**: Admin dashboard includes automatic dataset generation from Knowledge Base with quality-based filtering (≥60 for auto, ≥80 for high-quality). Endpoint POST /api/training/datasets/generate-from-kb creates JSONL datasets with proper lifecycle management.
- **Dataset Management**: Admin dashboard for uploading custom datasets (JSONL, CSV, TXT), validation, quality scoring, and approval workflow. Supports both manual uploads and KB auto-generation with unified UI.
- **Federated Learning**: Multi-GPU distributed training system with automatic chunk splitting, worker registration, gradient aggregation via FedAvg algorithm. Dataset selector includes KB-auto and KB-high-quality options alongside uploaded datasets.
- **Data Isolation**: All training data collection uses default tenantId=1 for single-tenant deployments. Schema supports multi-tenant expansion if needed in future.
- **Token Monitoring Dashboard**: Enterprise-grade real-time tracking of token usage with **America/Sao_Paulo (Brasília) timezone** for accurate local date calculations. Includes today/month/all-time aggregation with per-provider breakdown, cost estimates, custom date ranges, professional chart visualization with zero-filled timelines, and comprehensive analytics.

**Multi-Cloud Deployment (100% Free Tier):**
- **Architecture**: Dual deployment on Google Cloud Run + AWS Fargate with shared Neon PostgreSQL database.
- **Auto-Failover**: Health monitoring every 30s, automatic failover after 3 consecutive failures.
- **Zero-Cost**: Both clouds scale to zero when idle, stay within free tier limits (512MB RAM, 1 vCPU).
- **Production Dockerfile**: Multi-stage build optimized for both clouds (frontend builder → backend builder → production runtime).
- **CI/CD Pipeline**: GitHub Actions workflow for automated deployment to both clouds with secrets management.
- **Health Endpoints**: 5 comprehensive endpoints (/health, /health/detailed, /health/ready, /health/live, /health/multi-cloud).
- **Deployment Process**: 3-step process (GCP → AWS with GCP endpoint → GCP redeploy with AWS endpoint) for full bidirectional monitoring.

### System Design Choices
- **Single-Tenant Architecture**: Simplified deployment with default tenantId=1, optimized for personal/small team use. Multi-tenant schema preserved in database for future scalability but not actively enforced.
- **Externalized Policies**: JSON configurations for dynamic updates.
- **Separation Theorem**: Core model distinct from externalized Enforcement Policies.
- **Uncensored Default**: System starts with all policies disabled, configurable via admin dashboard.
- **Observability**: Metrics collection for latency, throughput, cache hit rates, cost estimates, and error rates, including real-time token usage tracking.

## External Dependencies

### Third-Party Services
- **OpenAI API**: LLM completions, embeddings, function calling.
- **Neon Database**: Serverless PostgreSQL (shared across GCP + AWS deployments).
- **Google Cloud Run**: Primary deployment platform (free tier: 2M requests/month, 360k vCPU-seconds, 180k GiB-seconds).
- **AWS Fargate**: Backup deployment platform (free tier: 20 GB storage, limited compute).
- **DuckDuckGo**: Web search.
- **OpenRouter, Groq, Gemini, HuggingFace**: Free LLM API providers.
- **Google Colab, Kaggle, Modal**: Free GPU resources for fine-tuning.
- **RunPod/Modal**: GPU workers for video generation.
- **Replit**: Development environment and authentication.
- **GitHub Actions**: CI/CD pipeline for automated multi-cloud deployment.

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