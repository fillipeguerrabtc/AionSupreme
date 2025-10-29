# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed for multi-tenant environments. Its core purpose is to provide a robust, flexible, and autonomously operating AI solution for complex enterprise needs, overcoming limitations and biases of underlying LLM providers through externalized policy enforcement and an automatic fallback system. It features configurable policy enforcement, RAG-based knowledge retrieval, and advanced autonomous agent capabilities, utilizing a Partially Observable Markov Decision Process (POMDP) for autonomous agent behavior with the ReAct framework. The system includes both an end-user chat interface and an administrative dashboard for policy management and monitoring. AION also supports professional video generation via an async GPU job system and integrates a LoRA fine-tuning system using free GPU resources.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core System Design
AION utilizes a multi-tenant architecture with isolated policies, API keys, and usage metrics per tenant. Policy enforcement is externalized via JSON configurations, allowing runtime updates without code changes. The system features a dual-interface: a chat for end-users and an administrative dashboard for policy management and monitoring. A key feature is an automatic fallback system that detects LLM refusals, performs web searches, indexes content, and responds without censorship when in UNRESTRICTED mode. The system prioritizes free LLM APIs (OpenRouter, Groq, Gemini, HF) before resorting to OpenAI.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query. It uses Radix UI with shadcn/ui patterns, Tailwind CSS, and a Material Design-inspired custom design system featuring HSL-based colors and Inter/JetBrains Mono fonts. Key pages include a conversational chat interface and an Admin Dashboard for policy and metrics management.

### Technical Implementations
**Backend (Node.js + TypeScript):**
- **Framework**: Express.js with TypeScript.
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless).
- **Core Services**: LLM Client, Storage Layer, RAG Service, Agent Engine (ReAct with POMDP), Policy Enforcement, Automatic Fallback, Multimodal Processor, Web Content Discovery (SearchVideos, SearchImages, SearchWeb, TorSearch), Free LLM Providers rotation, GPU Orchestrator, Training Data Collector.

**RAG (Retrieval-Augmented Generation):**
- **Components**: Embedder, Vector Store (in-memory FAISS-like), Hybrid Search (BM25 lexical + semantic), Knowledge Indexer.
- **Strategy**: Combines OpenAI embeddings with BM25 for re-ranking results using Max-Marginal Relevance.

**Agent System:**
- **Framework**: ReAct (Reasoning + Acting) engine with a Thought→Action→Observation loop.
- **Decision Making**: Implements a Partially Observable Markov Decision Process (POMDP).
- **Tools**: SearchWeb, SearchVideos, SearchImages, TorSearch, KBSearch, Exec, Finish.

**Policy Enforcement Pipeline:**
- **Components**: System Prompt Composer, Output Moderator, Policy DSL (JSON configuration).
- **Actions**: Policies can `refuse`, `redact`, or `rewrite` responses.

**Automatic Fallback System:**
- **Mechanism**: Activated upon detecting LLM refusals in UNRESTRICTED mode. It performs web searches (DuckDuckGo), fetches content, indexes it into the knowledge base, and generates uncensored responses.

**Professional Video Generation System (100% Open-Source):**
- **Architecture**: Async job queue → GPU worker → Webhook callback.
- **Models**: Open-Sora 1.2, AnimateDiff, Stable Video Diffusion, ModelScope.
- **Deployment**: RunPod/Modal GPU workers or self-hosted.

**Free LLM & GPU Infrastructure System (UPDATED 2025):**
- **Free APIs (PRIORITY ORDER)**: OpenRouter, Groq, Gemini, HuggingFace. OpenAI is a last resort.
- **2025 Free Models**:
  - **OpenRouter**: Meta Llama 4 Scout:free (50 req/dia, geral purpose)
  - **Groq**: Llama 3.3 70B Versatile (14.4k req/dia, maior performance que Llama 405B)
  - **Gemini**: Gemini 2.0 Flash Exp (1.5k req/dia, experimental free tier)
  - **HuggingFace**: Meta Llama 3 8B Instruct (720 req/dia, conversational API)
- **Total Capacity**: ~16.7k requisições/dia 100% GRATUITAS antes de usar OpenAI
- **GPU Orchestrator**: Automatic rotation between Colab, Kaggle, Modal for fine-tuning.
- **Training Pipeline**: Automatic conversation collection → JSONL export → LoRA fine-tuning on Llama-3-8B.

### System Design Choices
- **Multi-tenancy**: Complete isolation of data and policies per tenant.
- **Externalized Policies**: Policies are JSON configurations for dynamic updates.
- **Separation Theorem**: Core model is distinct from externalized Enforcement Policies.
- **Uncensored Default**: System starts with all policies disabled, configurable via admin dashboard.
- **Observability**: Metrics collection for latency, throughput, cache hit rates, cost estimates, and error rates.

## External Dependencies

### Third-Party Services
- **OpenAI API**: For LLM completions, embeddings, and function calling.
- **Neon Database**: Provides serverless PostgreSQL.
- **DuckDuckGo**: Utilized for web search capabilities.
- **OpenRouter, Groq, Gemini, HuggingFace**: Free LLM API providers.
- **Google Colab, Kaggle, Modal**: Free GPU resources for fine-tuning.
- **RunPod/Modal**: GPU workers for video generation.
- **Replit, GCP e2-micro, Supabase**: Free hosting for frontend, backend, and database.

### Key Libraries (NPM)
- **@neondatabase/serverless**: PostgreSQL client.
- **drizzle-orm**: Type-safe ORM.
- **openai**: Official OpenAI SDK.
- **@radix-ui/**: Accessible UI primitives.
- **@tanstack/react-query**: Server state management.
- **tailwindcss**: CSS framework.
- **zod**: Schema validation.
- **mammoth, xlsx, xml2js, cheerio, multer**: For document parsing and HTML scraping.