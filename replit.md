# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed for multi-tenant environments. Its core purpose is to provide a robust, flexible, and autonomously operating AI solution for complex enterprise needs, overcoming limitations and biases of underlying LLM providers through externalized policy enforcement and an automatic fallback system. It features configurable policy enforcement, RAG-based knowledge retrieval, and advanced autonomous agent capabilities, utilizing a Partially Observable Markov Decision Process (POMDP) for autonomous agent behavior with the ReAct framework. The system includes both an end-user chat interface and an administrative dashboard for policy management and monitoring. AION also supports professional video generation via an async GPU job system and integrates a LoRA fine-tuning system using free GPU resources.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes

### October 29, 2025 - Universal Multilingual Support (100+ Languages) (COMPLETED)
**LLM-Based Dynamic Language Detection:**
- Removed limited 4-language hardcoded detection system
- Implemented UNIVERSAL multilingual support via LLM-based dynamic generation
- System automatically detects and responds in ANY language the user writes in
- Supports 100+ languages: Portuguese, English, Spanish, French, German, Italian, Russian, Chinese, Japanese, Korean, Arabic, Hindi, Thai, Vietnamese, Dutch, Polish, Turkish, Swedish, Greek, Hebrew, and MANY more
- Paridade completa com ChatGPT - funciona em QUALQUER idioma

**System Prompt (Universal Language Instruction):**
- Main system prompt: "ALWAYS RESPOND IN THE SAME LANGUAGE AS THE USER'S MESSAGE"
- LLM detects language naturally from user's input
- No manual language detection needed for normal conversation
- Works for ALL languages without hardcoded translations

**Fallback Error Messages (Dynamic Generation):**
- When web search fails (no results/insufficient content): LLM generates error message dynamically in user's language
- Uses gpt-4o-mini for fast, cheap multilingual error generation
- Emergency fallback (if LLM fails completely): Heuristic detection for 20 most common languages
- Guarantees error messages always in user's language

**Limitation Messages (Multilingual):**
- UNRESTRICTED mode limitation message has examples in 3 languages (Portuguese, English, Spanish)
- LLM adapts the message to user's language automatically
- No hardcoded language forcing

**Architecture:**
1. Normal conversation: LLM detects user's language → responds in that language (universal support)
2. Fallback activation (refusal detected): Web search → LLM generates content in user's language
3. Error scenarios: LLM generates error message dynamically in user's language
4. Emergency fallback: Heuristic detection for 20 common languages

**Files Modified:**
- server/policy/enforcement-pipeline.ts: Universal language instruction in system prompt
- server/policy/auto-fallback.ts: Dynamic error message generation via LLM, expanded language detection

**System Remains 100% FREE:**
- gpt-4o-mini used for error messages (very cheap, fast)
- OpenRouter/Groq/Gemini free APIs prioritized for main responses
- No additional costs for multilingual support

### October 29, 2025 - Database Schema Synchronization (Bug Fix)
**Fixed Conversation Creation Error:**
- Synchronized database schema with Drizzle ORM definitions
- Added missing `project_id` column to conversations table
- Fixed 500 error when creating conversations
- Ran `npm run db:push --force` to apply schema changes

**Impact:**
- Conversations now create successfully (200 OK)
- System fully functional with persistent memory
- Projects schema ready for future implementation

### October 29, 2025 - Persistent Memory System with Replit Auth (COMPLETED)
**ChatGPT-Style Conversation Memory:**
- Implemented complete persistent memory system with user authentication
- Users can now create accounts, log in, and access conversation history across devices
- Conversations automatically saved to PostgreSQL database with userId linking
- Auto-save for every message (user and assistant) without manual intervention
- Cross-device synchronization via database storage

**Replit Auth Integration (OpenID Connect):**
- Passwordless authentication using Replit Auth (supports Google, GitHub, X, Apple, email)
- Zero-configuration OAuth setup via blueprint:javascript_log_in_with_replit
- Session management with 7-day TTL stored in PostgreSQL
- Automatic token refresh on expiration
- Optional authentication: system supports both logged-in and anonymous modes

**ChatGPT-Style Sidebar:**
- ConversationSidebar component showing full conversation history
- Click any past conversation to load complete message history
- "New Conversation" button to start fresh chats
- Delete conversations with confirmation dialog
- User profile display with avatar, name, and email
- Login/Logout buttons in sidebar

**Database Schema Updates:**
- Added `users` table (id, email, firstName, lastName, profileImageUrl)
- Added `sessions` table for express-session storage
- Updated `conversations` table with optional `userId` column for user-linking
- Foreign key relationship: conversations.userId → users.id

**API Endpoints (server/routes.ts):**
- GET /api/auth/user - Returns current user or null
- GET /api/conversations - Lists user's conversations (authenticated only)
- POST /api/conversations - Creates conversation with userId if authenticated
- GET /api/conversations/:id - Fetches conversation with ownership verification
- GET /api/conversations/:id/messages - Fetches messages with ownership verification
- DELETE /api/conversations/:id - Deletes conversation (strict ownership check)
- POST /api/conversations/:id/messages - Saves message to database

**Security Implementation:**
- All conversation endpoints use `optionalAuth` middleware
- Strict ownership verification: users can only access their own conversations
- Anonymous conversations (userId null) blocked from API access (403 Forbidden)
- Prevents enumeration attacks and unauthorized access
- Conversations isolated by userId - complete privacy between users

**Dual-Mode Support:**
- **Authenticated Mode**: Full conversation history, auto-save, cross-device sync
- **Anonymous Mode**: Chat works without login, no persistent memory
- Seamless switching between modes via login/logout
- localStorage only used for authenticated users

**Testing:**
- Comprehensive end-to-end test suite executed via Playwright
- 31 test steps covering authentication, conversation management, security
- All tests passed successfully
- Verified OIDC login, auto-save, conversation history, logout, security isolation

**Files Modified/Created:**
- Modified: server/index.ts, server/routes.ts, server/storage.ts, shared/schema.ts, client/src/pages/chat/ChatPage.tsx, client/src/lib/authUtils.ts
- Created: server/replitAuth.ts, client/src/components/ConversationSidebar.tsx, client/src/components/app-sidebar.tsx, client/src/hooks/useAuth.ts

**System Remains 100% FREE:**
- Replit Auth is completely free (no pricing tiers)
- PostgreSQL database already in use (Neon free tier)
- No additional costs for authentication or memory features

### October 29, 2025 - Chat UX & Moderation Improvements (PREVIOUS)
**Auto-Scroll Enhancement:**
- Implemented automatic smooth scrolling in chat interface using `messagesEndRef`
- Chat viewport now automatically scrolls to latest message when new responses arrive
- Improves user experience by eliminating manual scrolling

**Context Preservation:**
- Verified full conversation history is properly sent to backend
- Added debug logging for message array size monitoring
- Confirmed LLM providers receive complete context for coherent conversations

**Refusal Detection System (detectRefusal) - Complete Overhaul:**
- Implemented 5-level verification system with whitelist approach
- **Level 1:** finish_reason === "content_filter" → always block
- **Level 2:** Policy/Harmful patterns (violates policies, harmful content) → always block
- **Level 3:** General refusal patterns (I cannot, I refuse, I decline, I will not) → context-dependent
- **Level 4:** Whitelist of legitimate memory phrases ("I cannot remember", "I can't recall") → allow
- **Level 5:** Decision logic with whitelist approach → blocks refusals, allows memory explanations

**Security Improvements:**
- Eliminates false-negative bypass (refusals incorrectly allowed)
- Prevents false-positive blocking (legitimate memory responses)
- Expanded detection patterns to cover all refusal variations
- Whitelist approach ensures only explicitly allowed phrases bypass blocking

**Testing:**
- End-to-end test passed successfully
- Auto-scroll verified working
- Context preservation confirmed
- Memory whitelist behavior validated
- Free LLM providers (OpenRouter) functioning as expected

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