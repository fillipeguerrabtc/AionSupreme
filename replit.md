# AION - Autonomous AI System

## Overview

AION is an enterprise-grade autonomous AI system featuring a multi-tenant architecture with configurable policy enforcement, RAG-based knowledge retrieval, and autonomous agent capabilities. The system combines conversational AI with administrative control through a dual-interface approach: a chat interface for end users and an administrative dashboard for policy management and system monitoring.

The architecture is built around externalized policy enforcement (∂Pr[violation]/∂θ=0), meaning the core AI model remains unchanged while behavior is controlled through composable system prompts and output moderation. The system implements complete POMDP (Partially Observable Markov Decision Process) for autonomous agent behavior using the ReAct framework (Reasoning-Action-Observation cycles).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture (Node.js + TypeScript)

**Framework**: Express.js server with Vite for development
- Type-safe implementation using TypeScript with strict mode
- ESM module system throughout
- Database ORM via Drizzle with PostgreSQL (Neon serverless)
- API-first design with RESTful endpoints at `/api/v1/*`

**Core Services**:
1. **LLM Client** (`server/model/llm-client.ts`): OpenAI API integration with streaming support, tool calling, rate limiting, retry logic, and response caching
2. **Storage Layer** (`server/storage.ts`): Complete CRUD interface for all database entities with Drizzle ORM
3. **RAG Service** (`server/rag/vector-store.ts`): In-memory FAISS-like vector store with semantic search using normalized embeddings and cosine similarity
4. **Agent Engine** (`server/agent/react-engine.ts`): ReAct autonomous agent with POMDP implementation, supporting iterative reasoning cycles with thought→action→observation pattern
5. **Policy Enforcement** (`server/policy/enforcement-pipeline.ts`): System prompt composition and output moderation based on tenant-specific policies
6. **Multimodal Processor** (`server/multimodal/file-processor.ts`): Document processing for PDF, DOCX, XLSX, XML, CSV, images, and videos

**Middleware Stack**:
- Rate limiting (per-tenant and per-IP)
- Audit logging with SHA-256 hashing for immutable trails
- Authentication via API keys (JWT-ready architecture)
- Request/response logging with metrics collection

**Problem Solved**: The backend abstracts LLM complexity while providing production-ready features (rate limiting, caching, multimodal support) that would be difficult to implement client-side. The policy enforcement pipeline allows flexible content moderation without retraining models.

**Architecture Rationale**: 
- **Externalized Policies**: Policies are JSON/YAML configurations stored in the database, not hardcoded. This allows runtime updates without code changes.
- **Multi-tenancy**: Each tenant has isolated policies, API keys, and usage metrics. This enables SaaS deployment.
- **Agent Autonomy**: The ReAct engine can chain multiple tool calls (web search, knowledge base, code execution) to solve complex tasks autonomously.

### Frontend Architecture (React + TypeScript)

**Framework**: React 18 with Vite, React Router (Wouter), and TanStack Query
- Component library: Radix UI primitives with shadcn/ui patterns
- Styling: Tailwind CSS with custom design system (Material Design-inspired)
- State management: React Query for server state, React hooks for local state

**Key Pages**:
1. **Chat Interface** (`client/src/pages/chat/ChatPage.tsx`): Conversational UI with streaming responses
2. **Admin Dashboard** (`client/src/pages/admin/AdminDashboard.tsx`): Policy management, metrics visualization, document indexing

**Design System**:
- Typography: Inter (primary), JetBrains Mono (monospace)
- Spacing: 2, 4, 8, 12, 16px primitives
- Color system: HSL-based with CSS custom properties for theme switching
- Component variants: Flat/elevated styles with subtle shadows

**Problem Solved**: Dual-interface design separates concerns—chat for end users, dashboard for administrators. This follows Material Design principles adapted for enterprise applications.

**Alternatives Considered**: 
- Could use Next.js for SSR, but Vite provides faster dev experience and simpler deployment for SPA
- Could use Redux for state, but React Query handles server state more elegantly with built-in caching

### Database Schema (PostgreSQL via Drizzle)

**Tables** (9 total in `shared/schema.ts`):
1. **tenants**: Multi-tenant isolation with API keys and jurisdictions
2. **policies**: JSON/YAML policy definitions with rules, personality traits, LLM parameters
3. **conversations**: Chat history tied to tenants
4. **messages**: Individual messages with role and content
5. **documents**: Uploaded files for RAG indexing
6. **embeddings**: Vector embeddings for semantic search (chunk text + embedding vector)
7. **tool_executions**: Audit trail of agent tool calls
8. **metrics**: Performance metrics (latency, throughput, costs)
9. **audit_logs**: Immutable logs with SHA-256 hashes
10. **knowledge_sources**: References to indexed technical PDFs

**Schema Decisions**:
- JSONB columns for flexible data (policy rules, embeddings metadata, tool execution traces)
- Timestamps on all tables for audit compliance
- Foreign keys for referential integrity
- Indexes on frequently queried columns (tenant_id, conversation_id, document_id)

**Rationale**: PostgreSQL provides JSONB for semi-structured data while maintaining relational integrity. Drizzle ORM offers type safety without the complexity of Prisma.

### RAG (Retrieval-Augmented Generation)

**Components**:
1. **Embedder** (`server/rag/embedder.ts`): Text chunking with overlap, semantic splitting, batch embedding generation
2. **Vector Store** (`server/rag/vector-store.ts`): In-memory FAISS-like index with cosine similarity search
3. **Hybrid Search** (`server/rag/hybrid-search.ts`): Combines BM25 lexical search with semantic search (α-blending)
4. **Knowledge Indexer** (`server/rag/knowledge-indexer.ts`): Indexes 7 technical PDFs with LaTeX preservation

**Search Strategy**:
- **Semantic**: OpenAI embeddings (text-embedding-ada-002) with normalized vectors
- **Lexical**: BM25 scoring for keyword matching
- **Hybrid**: score(q,c) = α·BM25(q,c) + (1-α)·sim(q,c) where α=0.5
- **Re-ranking**: Max-Marginal Relevance (MMR) to avoid redundant results

**Problem Solved**: Pure semantic search misses exact keyword matches (e.g., model names, equations). Pure lexical search misses conceptual similarity. Hybrid search combines both strengths.

### Agent System (ReAct Framework)

**Architecture**:
- **ReAct Engine** (`server/agent/react-engine.ts`): Iterative loop of Thought→Action→Observation
- **Tools** (`server/agent/tools/`): SearchWeb (DuckDuckGo), KBSearch (RAG), Exec (Python sandbox), Finish
- **Hierarchical Planner** (`server/agent/hierarchical-planner.ts`): Decomposes complex goals into sub-goals

**POMDP Implementation**:
- State space: Hidden (agent infers state from observations)
- Action space: {SearchWeb, KBSearch, Exec, Finish}
- Observation space: Tool outputs (text)
- Transition model: Implicit in LLM reasoning
- Reward model: Goal completion

**Stopping Criteria**:
1. Confidence threshold reached (τ=0.8)
2. Max steps exceeded (T_max=15)
3. No progress for N steps (N=3)
4. Error state

**Problem Solved**: Enables autonomous task completion without human intervention. Agent can search web, query knowledge base, execute code, and synthesize results.

**Rationale**: ReAct combines reasoning (Chain-of-Thought) with actions (tool use), proven more effective than either alone. Hierarchical planning handles multi-step tasks.

### Policy Enforcement Pipeline

**Components**:
1. **System Prompt Composer**: Injects personality traits, tone, and content restrictions into system message
2. **Output Moderator**: Post-processes responses based on active rules
3. **Policy DSL**: JSON configuration with boolean flags for each content category

**Actions on Violation**:
- `refuse`: Block content entirely
- `redact`: Replace with placeholder
- `rewrite`: Use LLM to rephrase within guidelines

**Design Decision**: Policies are **externalized** from model weights. This means the core LLM is unchanged, and behavior modifications happen at the prompt/output level. This allows instant policy updates without retraining.

**Rationale**: Training custom models for each policy variant is impractical. Externalized enforcement provides ∂Pr[violation]/∂θ=0 (policy changes don't affect base model), enabling flexible, jurisdiction-specific compliance.

### Observability & Metrics

**Metrics Collected** (`server/metrics/collector.ts`):
- Latency percentiles (p50, p95, p99)
- Throughput (requests/sec, tokens/sec)
- Cache hit rates
- Cost estimates (USD per tenant)
- Error rates

**Export Format**: Prometheus-compatible metrics at `/api/v1/metrics/prometheus`
- Histograms for latency
- Gauges for throughput/cache rates
- Counters for requests/errors

**Problem Solved**: Production systems need observability for debugging, optimization, and cost control. Prometheus format enables integration with Grafana/DataDog.

## External Dependencies

### Third-Party Services
1. **OpenAI API**: LLM completions (GPT-4/3.5), embeddings (text-embedding-ada-002), function calling
   - Rate limits handled via exponential backoff
   - Response caching by content hash
   - Cost tracking per tenant

2. **Neon Database**: Serverless PostgreSQL
   - WebSocket connection pooling
   - Automatic scaling
   - Configured via DATABASE_URL environment variable

3. **DuckDuckGo**: Web search (HTML scraping, no API key required)
   - Fallback for web search tool
   - Timeout: 10 seconds

### NPM Dependencies (Key Libraries)
- **@neondatabase/serverless**: Postgres client with WebSocket support
- **drizzle-orm**: Type-safe ORM with schema migrations
- **openai**: Official OpenAI SDK
- **@radix-ui/***: Accessible UI primitives (40+ components)
- **@tanstack/react-query**: Server state management
- **tailwindcss**: Utility-first CSS framework
- **zod**: Schema validation for API requests
- **mammoth**: DOCX parsing
- **xlsx**: Excel file processing
- **xml2js**: XML parsing
- **cheerio**: HTML scraping
- **multer**: Multipart file uploads

### Development Tools
- **Vite**: Build tool and dev server
- **TypeScript**: Type safety across frontend/backend
- **ESBuild**: Production bundling
- **tsx**: TypeScript execution for development

### Deployment Targets
1. **Replit**: Primary development environment
2. **Google Colab**: Free GPU deployment option (documented in GOOGLE_COLAB_DEPLOYMENT.md)
   - Python backend via FastAPI
   - Ngrok tunnels for public access
   - Google Drive for persistent storage

**Note**: The system is designed to run without a dedicated vector database (using in-memory store). For production scale, consider integrating FAISS (Python), Pinecone, or Weaviate.