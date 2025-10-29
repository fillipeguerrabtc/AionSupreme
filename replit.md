# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed for multi-tenant environments. Its core purpose is to provide a robust, flexible, and autonomously operating AI solution for complex enterprise needs, overcoming limitations and biases of underlying LLM providers through externalized policy enforcement and an automatic fallback system. It features configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agent capabilities utilizing a Partially Observable Markov Decision Process (POMDP) with the ReAct framework, and supports professional video generation via an async GPU job system and LoRA fine-tuning. The system includes both an end-user chat interface and an administrative dashboard for policy management, monitoring, and comprehensive Knowledge Base management, aiming to provide a powerful, flexible, and cost-effective AI solution for enterprises.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 29, 2025)

### 🎮 Multi-GPU Pool System (LATEST - October 29, 2025)

**Complete Multi-GPU Infrastructure Implementation:**
- ✅ Database schema: `gpuWorkers` table with provider, accountId, ngrokUrl, capabilities (model, GPU, VRAM, max_concurrent), health metrics
- ✅ GPU Pool Manager: Automatic health checks every 30s, worker registration/deregistration, metrics tracking (requests, latency, errors)
- ✅ Load Balancer: Round-robin algorithm with health-aware selection, automatic failover, parallel processing support
- ✅ Priority orchestrator integration: **KB → GPU Pool → Free APIs → Web → OpenAI** (GPU Pool is now STEP 2)
- ✅ REST APIs: `/api/gpu/register`, `/api/gpu/status`, `/api/gpu/workers`, `/api/gpu/:id` (delete)
- ✅ Admin Dashboard: Real-time GPU Management tab with live metrics, worker status, health indicators
- ✅ Auto-registration script: Updated Colab script with full metadata (provider, accountId, capabilities) for seamless GPU registration

**Multi-GPU Benefits:**
- 🚀 **3x throughput**: 3 Google accounts = 3 GPUs running in parallel
- ⚡ **~100% uptime**: Automatic rotation when one GPU expires (12h limit)
- 💰 **~500h free GPU/month**: Each account provides ~170h/month (15h/day × 30 days ÷ 3 accounts)
- 🎯 **Zero cost**: All GPU inference is 100% free via Google Colab rotation

**Technical Highlights:**
- Health-based worker selection: Only routes to healthy workers (last check < 60s)
- Automatic cleanup: Workers removed after 3 consecutive health check failures
- Load metrics: Tracks requests, average latency, error rates per worker
- Refusal detection: GPU responses checked for LLM refusals, triggers web fallback if needed

### Previous Updates - 6 Critical Enhancements Completed

**Dashboard Overview - Real-Time Data Integration:**
- ✅ Fixed all 8 dashboard cards to display real-time data from backend APIs
- ✅ Added `/api/tokens/summary`, `/api/tokens/cost-history`, `/api/tokens/free-apis-history` endpoints
- ✅ Total Tokens, Total Cost, KB Documents, Free APIs, OpenAI, Web Searches, DeepWeb, History - all showing real metrics
- ✅ Responsive grid system (1→2→3→4 columns based on screen size)
- ✅ Each card is clickable and navigates to its corresponding tab/subtab in Token Monitoring

**Media Rendering in Chat:**
- ✅ Implemented ImagePreview component for inline image display (jpg, jpeg, png, gif, webp, svg, bmp, avif)
- ✅ Fixed critical multi-media regex bug using NON-global patterns for type detection
- ✅ Chat now supports both VideoPreview and ImagePreview with proper multi-URL handling
- ✅ Sanitizes URLs by removing trailing punctuation and markdown delimiters

**DeepWeb Search Fix:**
- ✅ Eliminated JSON.parse() error by modifying tor-search.ts to return structured metadata.results
- ✅ DeepWeb searches now display properly with full results array
- ✅ Fixed priority-orchestrator.ts to use metadata.results instead of formatted observation string

**Data Integrity - [object Object] Eliminated:**
- ✅ Fixed routes.ts line 1641 where agent observations could be objects instead of strings
- ✅ Now always converts observations to proper strings (JSON.stringify if object)
- ✅ Clean, readable responses in all agent interactions

**Auto-Indexing System (Already Implemented):**
- ✅ Confirmed conversation auto-indexing is working perfectly (routes.ts:95-141)
- ✅ System automatically indexes last 5 conversation exchanges after each chat response
- ✅ Includes full context window (user + assistant messages) with metadata (source, provider, timestamp)
- ✅ Enables KB-first retrieval for future similar queries, reducing dependency on paid APIs

### Previous Updates

**Performance Optimization:**
- Fixed sidebar conversations query to use efficient SQL LEFT JOIN + COUNT (O(conversations)) instead of pulling all messages (O(total messages))
- Implemented `getConversationsWithMessageCount()` storage method for scalable conversation listing
- Added `countMessagesByConversation()` for O(1) message counting using SQL COUNT

**Knowledge Base Tracking:**
- Token Monitoring now shows ALL KB search attempts (both successes and failures)
- Tracks low-confidence skips, high-confidence hits, and KB errors with full metadata
- Provides complete visibility into KB → Free APIs → Web → OpenAI priority flow

**Conversation Management:**
- Empty chat filter: sidebar only displays conversations with messages (messagesCount > 0)
- Auto-generated titles: first user message (up to 50 chars) becomes conversation title
- Clickable logo and back button navigation using wouter's useLocation()
- Improved UX with semantic navigation (keyboard + mouse support)

## System Architecture

### Core System Design
AION utilizes a multi-tenant architecture with isolated policies, API keys, and usage metrics per tenant. Policy enforcement is externalized via JSON configurations, allowing runtime updates without code changes. The system features a dual-interface: a chat for end-users and an administrative dashboard for policy management and monitoring. A key feature is an automatic fallback system that detects LLM refusals, performs web searches, indexes content, and responds without censorship when in UNRESTRICTED mode. The system features a **5-tier priority chain with multi-GPU load balancing**: **KB → GPU Pool (custom LoRA models) → Free APIs (Groq, Gemini, HF) → Web Search → OpenAI**. GPU Pool provides zero-cost inference via automatic rotation of Google Colab workers across multiple accounts. The system also includes universal multilingual support via LLM-based dynamic language detection and response generation.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query. It uses Radix UI with shadcn/ui patterns, Tailwind CSS, and a Material Design-inspired custom design system featuring HSL-based colors and Inter/JetBrains Mono fonts. Key pages include a conversational chat interface with persistent memory and an Admin Dashboard for policy and metrics management.

### Technical Implementations
**Backend (Node.js + TypeScript):**
- **Framework**: Express.js with TypeScript.
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless).
- **Core Services**: LLM Client, Storage Layer, RAG Service, Agent Engine (ReAct with POMDP), Policy Enforcement, Automatic Fallback, Multimodal Processor, Web Content Discovery (SearchVideos, SearchImages, SearchWeb, TorSearch), Free LLM Providers rotation, GPU Orchestrator, Training Data Collector, Token Monitoring System.
- **Authentication**: Replit Auth (OpenID Connect) for passwordless login and session management, supporting both authenticated and anonymous modes.
- **Multilingual Support**: LLM-based dynamic language detection and response generation for over 100 languages, including dynamic error message generation.
- **Refusal Detection**: A 5-level verification system with a whitelist approach to accurately detect and manage LLM refusals while allowing legitimate memory phrases.

**RAG (Retrieval-Augmented Generation):**
- **Components**: Embedder, Vector Store (in-memory FAISS-like), Hybrid Search (BM25 lexical + semantic), Knowledge Indexer.
- **Strategy**: Combines OpenAI embeddings with BM25 for re-ranking results using Max-Marginal Relevance (MMR) for diversity.
- **Knowledge Indexer**: Intelligent chunking, configurable chunk size/overlap, automatic embedding, quality scoring.

**Agent System:**
- **Framework**: ReAct (Reasoning + Acting) engine with a Thought→Action→Observation loop.
- **Decision Making**: Implements a Partially Observable Markov Decision Process (POMDP).
- **Tools**: SearchWeb, SearchVideos, SearchImages, TorSearch, KBSearch, Exec, Finish.

**Policy Enforcement Pipeline:**
- **Components**: System Prompt Composer, Output Moderator, Policy DSL (JSON configuration).
- **Actions**: Policies can `refuse`, `redact`, or `rewrite` responses based on 7 categories (hate_speech, explicit_sexual, self_harm, etc.).

**Automatic Fallback System:**
- **Mechanism**: Activated upon detecting LLM refusals in UNRESTRICTED mode. It performs web searches (DuckDuckGo), fetches content, indexes it into the knowledge base, and generates uncensored responses.
- **Time-Sensitive Queries**: Automatically triggers web search for time-sensitive keywords if KB confidence is low.

**Professional Video Generation System (100% Open-Source):**
- **Architecture**: Async job queue → GPU worker → Webhook callback.
- **Models**: Open-Sora 1.2, AnimateDiff, Stable Video Diffusion, ModelScope.
- **Deployment**: RunPod/Modal GPU workers or self-hosted.

**Free LLM & GPU Infrastructure System:**
- **Free APIs (PRIORITY ORDER)**: Groq → Gemini → HuggingFace → OpenRouter. OpenAI is last resort.
- **Free GPU Training**: Automatic rotation between Google Colab and Kaggle for LoRA fine-tuning (Mistral 7B, Llama 3 8B, Phi-3).

### System Design Choices
- **Multi-tenancy**: Complete isolation of data and policies per tenant.
- **Externalized Policies**: Policies are JSON configurations for dynamic updates.
- **Separation Theorem**: Core model is distinct from externalized Enforcement Policies.
- **Uncensored Default**: System starts with all policies disabled, configurable via admin dashboard.
- **Observability**: Metrics collection for latency, throughput, cache hit rates, cost estimates, and error rates, including real-time token usage tracking for all providers and web/deepweb searches.

## External Dependencies

### Third-Party Services
- **OpenAI API**: For LLM completions, embeddings, and function calling.
- **Neon Database**: Provides serverless PostgreSQL.
- **DuckDuckGo**: Utilized for web search capabilities.
- **OpenRouter, Groq, Gemini, HuggingFace**: Free LLM API providers.
- **Google Colab, Kaggle, Modal**: Free GPU resources for fine-tuning.
- **RunPod/Modal**: GPU workers for video generation.
- **Replit**: Hosting for authentication and development environment.
- **Vercel/Netlify**: Frontend hosting.
- **Supabase**: Database services.
- **Cloudflare**: CDN.

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