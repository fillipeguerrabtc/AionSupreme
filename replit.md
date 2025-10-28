# AION - Autonomous AI System

# 🔴🔴🔴 REGRA FUNDAMENTAL ETERNA (FUNDAMENTAL ETERNAL RULE) 🔴🔴🔴

## ⚠️ ATENÇÃO CRÍTICA: ARQUITETURA LIVRE ⚠️

**PORTUGUÊS**: 
**AION NASCE 100% LIVRE** - sem limitações morais, éticas ou legais embutidas. 

**IMPORTANTE**: Não tentamos forçar a OpenAI a obedecer (ela tem regras rígidas próprias). 

**COMO FUNCIONA**:
1. ✅ AION verifica Knowledge Base própria
2. ✅ Se não tem resposta → consulta OpenAI
3. ✅ **SE OpenAI BLOQUEIA** → Auto-Fallback:
   - Busca DuckDuckGo (sem censura)
   - Indexa conteúdo no Knowledge Base
   - AION responde usando conteúdo web (SEM CENSURA)

**Todas as restrições são EXTERNAS** via políticas JSON configuráveis por jurisdição no Admin Dashboard. **Default: ZERO regras ativas.**

---

**ENGLISH**: 
**AION IS BORN 100% FREE** - without built-in moral, ethical or legal limitations.

**IMPORTANT**: We don't try to force OpenAI to obey (it has rigid built-in rules).

**HOW IT WORKS**:
1. ✅ AION checks its own Knowledge Base
2. ✅ If no answer → queries OpenAI
3. ✅ **IF OpenAI BLOCKS** → Auto-Fallback:
   - Searches DuckDuckGo (uncensored)
   - Indexes content in Knowledge Base
   - AION responds using web content (UNCENSORED)

**All restrictions are EXTERNAL** via JSON policies configurable per jurisdiction in Admin Dashboard. **Default: ZERO active rules.**

**Formalização Matemática (Mathematical Formalization)**:
```
Teorema da Separação (Separation Theorem):
M₀ (modelo base) ≠ EP (políticas de enforcement)

Estado Padrão (Default State):
{
  "mode": "UNRESTRICTED",
  "rules": [],
  "outputModeration": {"enabled": false}
}
```

**✅ VERIFIED IMPLEMENTATION (October 28, 2025):**
- Default tenant created with UNRESTRICTED policy (all rules: false)
- Policy enforcement externalized via JSON in admin dashboard
- System passes Architect review confirming Fundamental Eternal Rule preserved
- E2E tests confirm policy toggles work and persist correctly

**Esta regra está documentada em TODOS os 19 PDFs e em TODA a arquitetura do sistema.**
**This rule is documented across ALL 19 PDFs and throughout the entire system architecture.**

---

## Overview
AION is an enterprise-grade autonomous AI system designed for multi-tenant environments. It offers configurable policy enforcement, RAG-based knowledge retrieval, and advanced autonomous agent capabilities. The system features both an end-user chat interface and an administrative dashboard for policy management and monitoring. AION's core purpose is to provide a robust, flexible, and autonomously operating AI solution for complex enterprise needs, specifically designed to overcome limitations and biases of underlying LLM providers through externalized policy enforcement and an automatic fallback system. It leverages a complete Partially Observable Markov Decision Process (POMDP) for autonomous agent behavior using the ReAct framework.

**Current Status: ✅ FULLY FUNCTIONAL** (as of October 28, 2025)
- Server running on port 5000
- All 12 API endpoints operational
- Frontend (Chat + Admin) fully functional
- E2E tests passing

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