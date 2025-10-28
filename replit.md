# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed for multi-tenant environments. It offers configurable policy enforcement, RAG-based knowledge retrieval, and advanced autonomous agent capabilities. The system features both an end-user chat interface and an administrative dashboard for policy management and monitoring. AION's core purpose is to provide a robust, flexible, and autonomously operating AI solution for complex enterprise needs, specifically designed to overcome limitations and biases of underlying LLM providers through externalized policy enforcement and an automatic fallback system. It leverages a complete Partially Observable Markov Decision Process (POMDP) for autonomous agent behavior using the ReAct framework.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core System Design
AION utilizes a multi-tenant architecture with isolated policies, API keys, and usage metrics per tenant. Policy enforcement is externalized via JSON configurations, allowing runtime updates without code changes. The system features a dual-interface: a chat for end-users and an administrative dashboard for policy management and monitoring. A key feature is an automatic fallback system that detects LLM refusals, performs web searches, indexes content, and responds without censorship when in UNRESTRICTED mode.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query. It uses Radix UI with shadcn/ui patterns, Tailwind CSS, and a Material Design-inspired custom design system featuring HSL-based colors and Inter/JetBrains Mono fonts. Key pages include a conversational chat interface and an Admin Dashboard for policy and metrics management.

### Technical Implementations
**Backend (Node.js + TypeScript):**
- **Framework**: Express.js with TypeScript (strict mode, ESM modules).
- **Database**: PostgreSQL via Drizzle ORM (Neon serverless).
- **Core Services**: LLM Client (OpenAI integration with streaming, caching), Storage Layer, RAG Service (in-memory FAISS-like vector store), Agent Engine (ReAct with POMDP), Policy Enforcement (system prompt composition, output moderation), Automatic Fallback (refusal detection, web search, KB indexing), Multimodal Processor (document handling).
- **Middleware**: Rate limiting, audit logging, API key authentication, request/response logging.

**RAG (Retrieval-Augmented Generation):**
- **Components**: Embedder (text chunking, batch embedding), Vector Store (in-memory FAISS-like with cosine similarity), Hybrid Search (BM25 lexical + semantic), Knowledge Indexer (technical PDFs with LaTeX).
- **Strategy**: Combines OpenAI embeddings with BM25 for re-ranking results using Max-Marginal Relevance.

**Agent System:**
- **Framework**: ReAct (Reasoning + Acting) engine with a Thought→Action→Observation loop.
- **Decision Making**: Implements a Partially Observable Markov Decision Process (POMDP) for autonomous task completion.
- **Tools**: SearchWeb, KBSearch, Exec, Finish, and other custom tools.
- **Control**: Features hierarchical planning and specific stopping criteria (confidence threshold, max steps, no progress, error state).

**Policy Enforcement Pipeline:**
- **Components**: System Prompt Composer, Output Moderator, Policy DSL (JSON configuration).
- **Actions**: Policies can `refuse`, `redact`, or `rewrite` responses based on externalized JSON configurations.

**Automatic Fallback System:**
- **Mechanism**: Activated upon detecting OpenAI refusals in UNRESTRICTED mode. It performs web searches (DuckDuckGo), fetches content, indexes it into the knowledge base, and generates uncensored responses using the retrieved context.

### System Design Choices
- **Multi-tenancy**: Complete isolation of data and policies per tenant.
- **Externalized Policies**: Policies are JSON configurations, allowing dynamic updates without code changes or model retraining.
- **Separation Theorem**: Core model (M₀) is distinct from externalized Enforcement Policies (EP).
- **Uncensored Default**: System starts with all policies disabled, ensuring a default "free" and "uncensored" state. Changes are made via the admin dashboard based on jurisdiction.
- **Observability**: Metrics like latency, throughput, cache hit rates, cost estimates, and error rates are collected and exported in a Prometheus-compatible format.

## External Dependencies

### Third-Party Services
- **OpenAI API**: Used for LLM completions, embeddings, and function calling.
- **Neon Database**: Provides serverless PostgreSQL.
- **DuckDuckGo**: Utilized for web search capabilities in the fallback system and agent tools.

### Key Libraries (NPM)
- **@neondatabase/serverless**: PostgreSQL client.
- **drizzle-orm**: Type-safe ORM.
- **openai**: Official OpenAI SDK.
- **@radix-ui/**: Accessible UI primitives.
- **@tanstack/react-query**: Server state management.
- **tailwindcss**: CSS framework.
- **zod**: Schema validation.
- **mammoth, xlsx, xml2js, cheerio, multer**: For document parsing and HTML scraping.