# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system offering multi-tenant architecture, configurable policy enforcement, RAG-based knowledge retrieval, and autonomous agent capabilities. It features a dual-interface: a chat for end-users and an administrative dashboard for policy and monitoring. The system emphasizes externalized policy enforcement, controlling behavior through composable system prompts and output moderation, and implements a complete POMDP for autonomous agent behavior using the ReAct framework. AION aims to provide a robust, flexible, and autonomously operating AI solution for complex enterprise needs, with a focus on overcoming limitations of underlying LLM providers.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core System Design
AION employs a multi-tenant architecture with isolated policies, API keys, and usage metrics per tenant. Policy enforcement is externalized, allowing runtime updates without code changes. The system uses a dual-interface design: a chat interface for end-users and an administrative dashboard for policy management and system monitoring. It features an automatic fallback system that detects LLM refusals, searches the web, indexes content, and responds without censorship when in UNRESTRICTED mode, ensuring autonomous operation.

### Backend (Node.js + TypeScript)
- **Framework**: Express.js with Vite for development, TypeScript with strict mode, ESM modules.
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless).
- **Core Services**: LLM Client (OpenAI integration with streaming, caching), Storage Layer (CRUD with Drizzle), RAG Service (in-memory FAISS-like vector store), Agent Engine (ReAct with POMDP), Policy Enforcement (system prompt composition, output moderation), Automatic Fallback (refusal detection, web search, KB indexing), Multimodal Processor (document handling).
- **Middleware**: Rate limiting, audit logging, API key authentication, request/response logging.
- **Problem Solved**: Abstracts LLM complexity, provides production-ready features, and enables flexible content moderation without model retraining.

### Frontend (React + TypeScript)
- **Framework**: React 18 with Vite, Wouter, and TanStack Query.
- **UI/UX**: Radix UI with shadcn/ui patterns, Tailwind CSS, Material Design-inspired custom design system (HSL-based color system, Inter/JetBrains Mono fonts).
- **Key Pages**: Conversational Chat Interface, Admin Dashboard for policy and metrics.
- **Problem Solved**: Separates user interaction from administrative control.

### Database Schema (PostgreSQL via Drizzle)
- **Tables**: `tenants`, `policies`, `conversations`, `messages`, `documents`, `embeddings`, `tool_executions`, `metrics`, `audit_logs`, `knowledge_sources`.
- **Design Decisions**: JSONB columns for flexible data, timestamps for audit, foreign keys for integrity, indexes on frequently queried columns.

### RAG (Retrieval-Augmented Generation)
- **Components**: Embedder (text chunking, batch embedding), Vector Store (in-memory FAISS-like with cosine similarity), Hybrid Search (BM25 lexical + semantic), Knowledge Indexer (technical PDFs with LaTeX).
- **Strategy**: Combines OpenAI embeddings for semantic search with BM25 for lexical search, re-ranks results using Max-Marginal Relevance.

### Agent System (ReAct Framework)
- **Architecture**: ReAct Engine (Thought→Action→Observation loop), Tools (SearchWeb, KBSearch, Exec, Finish), Hierarchical Planner.
- **POMDP**: Implements a Partially Observable Markov Decision Process for autonomous task completion.
- **Stopping Criteria**: Confidence threshold, max steps, no progress, error state.

### Policy Enforcement Pipeline
- **Components**: System Prompt Composer, Output Moderator, Policy DSL (JSON configuration).
- **Actions on Violation**: `refuse`, `redact`, `rewrite`.
- **Design Decision**: Policies are externalized JSON configurations, allowing instant updates without model retraining.

### Automatic Fallback System
- **Functionality**: Detects OpenAI refusals, performs web searches (DuckDuckGo), fetches content, indexes it into the knowledge base, and generates uncensored responses using the retrieved context.
- **Activation**: Triggers only if an OpenAI refusal is detected AND the system is in UNRESTRICTED mode (no policy rules enabled).
- **Problem Solved**: Bypasses hardcoded content policies of external LLM providers to ensure autonomous operation when no internal restrictions are configured.

### Observability & Metrics
- **Collected**: Latency, throughput, cache hit rates, cost estimates, error rates.
- **Export**: Prometheus-compatible metrics for integration with monitoring tools.

## External Dependencies

### Third-Party Services
- **OpenAI API**: LLM completions, embeddings, function calling.
- **Neon Database**: Serverless PostgreSQL.
- **DuckDuckGo**: Web search (HTML scraping) for fallback and agent tools.

### NPM Dependencies (Key Libraries)
- **@neondatabase/serverless**: PostgreSQL client.
- **drizzle-orm**: Type-safe ORM.
- **openai**: Official OpenAI SDK.
- **@radix-ui/**: Accessible UI primitives.
- **@tanstack/react-query**: Server state management.
- **tailwindcss**: CSS framework.
- **zod**: Schema validation.
- **mammoth, xlsx, xml2js, cheerio, multer**: Document parsing and HTML scraping.

### Deployment Targets
- **Replit**: Primary development environment.
- **Google Colab**: Optional GPU deployment.