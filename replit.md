# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation, extending beyond current LLM limitations. It features configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents utilizing a POMDP with the ReAct framework, and professional video generation. The system provides both an end-user chat interface and an administrative dashboard, operating in a single-tenant mode for optimized deployment and cost efficiency. Its business vision is to provide a self-sustaining, continuously evolving AI that learns and improves autonomously, reducing reliance on external APIs over time.

## User Preferences
Preferred communication style: Simple, everyday language.

**REGRA FUNDAMENTAL DE TRABALHO:**
1. **SEMPRE responda dúvidas do usuário primeiro**
2. **SEMPRE continue tarefas em andamento até o final**
3. **NUNCA deixe tarefas incompletas para trás**
4. Se o usuário pedir novas atividades → adicione à fila APÓS as tarefas atuais
5. Fluxo obrigatório: Responder → Completar tarefas atuais → Iniciar novas tarefas
6. **NUNCA comece tarefas novas antes de terminar as antigas**

## Recent Changes (November 1, 2025)

### 🏗️ Agent Tier System & Namespace Hierarchy (Tasks 8a-8e)
- **NEW Schema** (`shared/schema.ts`): Added `agentTier` ('agent' | 'subagent') and `assignedNamespaces` (string[]) to agents table
- **Validation Rules** (`server/storage.ts`):
  - Agents: MUST have exactly 1 namespace assignment
  - SubAgents: MUST have N namespaces with matching parent prefix (e.g., `tech/` for all namespaces)
  - Fail-fast on invalid configurations (prevents orphans)
- **Runtime Hierarchy Inference**: Parent-child relationships automatically detected via namespace prefix matching (no explicit parent_id)
- **UI Separation** (`client/src/pages/admin/AgentsPage.tsx`):
  - Separate "Create Agent" / "Create SubAgent" buttons with visual distinction (default vs outline variants)
  - Tab-based navigation for Agents vs SubAgents lists
  - Compliance forms guide user through tier-specific requirements
- **Migration**: Deprecated old `agent_relationships` table, migrated to new model
- **Location**: `shared/schema.ts`, `server/storage.ts`, `client/src/pages/admin/AgentsPage.tsx`

### 🗑️ Cascade Delete & Orphan Detection (Tasks 9a-9d, 10a)
- **Namespace Cascade** (`server/services/namespace-cascade.ts`):
  - Delete Namespace → auto-deletes all child Subnamespaces + Agents + SubAgents
  - Atomic transactions prevent partial deletes
  - Result schema: `{ namespacesDeleted, subNamespacesDeleted, agentsDeleted, subAgentsDeleted }`
- **Orphan Detection** (`server/services/orphan-detection.ts`):
  - Scans for Agents/SubAgents with zero valid namespace assignments
  - **Safe Auto-Fix**: Only applies if at least 1 valid namespace remains (prevents deletion of all assignments)
  - **Manual Review Required**: Flags agents with 0 valid namespaces (no auto-delete to prevent race conditions)
  - Result schema: `{ totalOrphans, autoFixed, requiresManualReview[] }`
- **KB Cascade** (`server/services/kb-cascade.ts`):
  - Delete Document → auto-deletes embeddings (RAG vectors) via FK CASCADE + physical files (storageUrl, attachments)
  - **Dataset Protection**: Warns if doc was used for training (no auto-delete to prevent data loss)
  - Single + Bulk endpoints: DELETE `/api/admin/documents/:id`, DELETE `/api/admin/documents/bulk`
  - Result schema: `{ documentsDeleted, embeddingsDeleted, filesDeleted[], warnings[] }`
- **UI Integration**:
  - Separate buttons for Create/Edit/Delete Namespaces and Subnamespaces (NamespacesTab)
  - Separate buttons for Create/Edit/Delete Agents and SubAgents (AgentsPage)
  - Delete confirmation dialogs with cascade warnings
  - Existing KB delete UI (Trash2 icon) already functional
- **BUG FIX** (`server/curation/store.ts`): Implemented missing `cleanupOldCurationData()` for 5-year retention (LGPD compliance)
- **Location**: `server/services/namespace-cascade.ts`, `server/services/orphan-detection.ts`, `server/services/kb-cascade.ts`, `server/curation/store.ts`

### 🔗 [DEPRECATED] Hierarchical Sub-Agent Orchestration System
- **Agent Relationships Schema**: New `agent_relationships` table with parent/child delegation, budget sharing (0-1 decimal), delegation modes (always/dynamic/fallback), max depth limits, and soft-delete support
- **Hierarchical Orchestrator**: Recursive delegation engine with confidence-weighted aggregation, budget normalization (prevents cost overruns), cycle detection (BFS), and trace logging for parent→child workflows
- **Admin UI - Hierarchy Management**: 
  - Tabs interface (Agentes vs Hierarquia) in AgentsPage
  - Create relationships: parent/child dropdowns with filtering (no self-loops), budget slider (10-100% → 0.4 normalized), delegation mode selector, max depth input
  - List relationships: Table with parent/child names (Drizzle double-alias), budget %, mode, depth, status badges, delete actions
  - Budget display fix: Handles both legacy (>1) and normalized (0-1) values
- **Backend Storage (server/storage.agent-relationships.ts)**:
  - Distinct Drizzle aliases: `alias(agents, "parent_agents")` + `alias(agents, "child_agents")` for proper JOIN hydration
  - Soft-delete filtering: `.where(eq(agentRelationships.enabled, true))` in listAll()
  - Cycle prevention: BFS traversal blocks circular delegations
- **E2E Testing**: Playwright smoke test passed (create → list → delete flow verified, budget normalization correct, soft-delete filtering applied)
- **Location**: `server/agent/hierarchy-orchestrator.ts`, `server/storage.agent-relationships.ts`, `server/routes/agent-relationships.ts`, `client/src/components/agents/AgentHierarchyManager.tsx`, `shared/schema.ts`

### 🌱 Complete Multi-Agent System Seed
- **Database-Driven Architecture**: All namespaces, tools, and agents now stored in PostgreSQL (zero hardcode)
- **50 Namespaces**: Migrated all NAMESPACE_CATEGORIES to DB with hierarchical organization (curation, finance, tech, tourism, auto, management, calendar, marketing, general)
  - **Consistent Prefixes**: All parent/child namespaces use matching prefixes (e.g., `tech` + `tech/*`)
- **7 Core Tools**: kb_search, web_search, deepweb_search, vision_cascade, calculator, crawler, youtube_transcript
- **5 Specialized Agents**: 
  - Curator (namespace: *, tools: kb_search, web_search, vision_cascade, budget: $10/day)
  - Financial Specialist (namespace: financas/*, tools: kb_search, web_search, calculator, budget: $5/day)
  - Tech Support (namespace: tech/*, tools: kb_search, web_search, crawler, budget: $5/day)
  - Customer Service (namespace: atendimento/*, tools: kb_search, budget: $3/day)
  - Generalist (namespace: geral/*, tools: kb_search, web_search, calculator, vision_cascade, budget: $5/day)
- **14 Agent-Tool Associations**: Many-to-many mapping in `agent_tools` table
- **Seed Endpoint**: POST `/api/admin/seed-system` executes complete system initialization
  - **Security**: Admin allowlist via `ADMIN_ALLOWED_SUBS` env var (comma-separated list of Replit user IDs)
  - **Development Mode**: Allows any authenticated user if allowlist is empty
  - **Production Mode**: Requires user.claims.sub to be in allowlist
- **Location**: `server/seeds/complete-system.seed.ts`, `server/routes.ts`

### Training Data Validation System
- **ValidationError Class**: Structured error propagation with errors, warnings, and corrections extraction from backend responses
- **Real-time Inline Validation**: useEffect-based validation with character counters and comprehensive feedback
- **8 Validation Types**: Empty fields, length limits, whitespace normalization, duplicate detection, placeholder text, JSON syntax, code formatting, and message structure validation
- **Location**: `server/training/training-data-validator.ts`, `client/src/lib/queryClient.ts`

### Knowledge Base Reorganization
- **Dedicated Tabs System**: Separate views for Documents and Images using Shadcn Tabs component
- **Clean Separation**: Replaced bottom-positioned images with proper tab-based organization
- **Location**: `client/src/pages/admin/KnowledgeBaseTab.tsx`

### Image Multi-Select & Bulk Operations
- **Checkbox Selection**: Visual ring indicators for selected images
- **Bulk Delete**: Proper mutation with correct array passing, count return, and dialog closing
- **Race Condition Fixes**: Comprehensive state management and cache invalidation
- **Location**: `client/src/pages/admin/KnowledgeBaseTab.tsx`

### Vision Parsing for Curation Queue
- **VisionCascade Integration**: POST `/api/curation/:id/generate-descriptions` endpoint
- **UI Button**: "🤖 Gerar Descrições AI" in EditDialog with loading state
- **Badge Feedback**: Green "✓ Descrição AI" indicator for processed images
- **Race-Condition-Free**: Backend returns full updated item; frontend validates ID before state update
- **Performance**: Optimized to avoid unnecessary refetches
- **5-Tier Cascade**: Gemini → GPT-4V → Claude 3.5 → HuggingFace → OpenAI (2,300+ req/day free tier)
- **Location**: `server/routes/curation.ts`, `client/src/pages/admin/CurationQueuePage.tsx`, `server/learn/vision-cascade.ts`

### Enhanced Error Handling
- **Structured Validation**: ValidationError class extracts errors, warnings, and corrections from API responses
- **Clear User Feedback**: Detailed error messages with actionable suggestions
- **Location**: `client/src/lib/queryClient.ts`

## System Architecture

### Core System Design
AION operates in a single-tenant mode with a multi-agent architecture and Mixture of Experts (MoE) routing driven by LLM-based intent classification. Policy enforcement is externalized via JSON configurations. It features an automatic fallback system for LLM refusals, a 5-tier priority chain for responses, and universal multilingual support via dynamic language detection. The system supports specialized agents with dedicated knowledge base namespaces, tool access, and budget limits. A Human-in-the-Loop (HITL) knowledge curation system, backed by PostgreSQL, requires human approval for all content before indexing. The architecture includes a GPU Pool System for distributed training and inference, supporting LoRA fine-tuning on free GPUs and aiming for zero-cost inference. A Continuous Auto-Evolution System collects high-quality conversations for instruction tuning and dataset generation.

### UI/UX
The frontend is built with React 18, Vite, Wouter, and TanStack Query, utilizing Radix UI, shadcn/ui patterns, Tailwind CSS, and a Material Design-inspired HSL-based custom design system. It offers a conversational chat interface and an Admin Dashboard with enterprise sidebar navigation, supporting 13 sections and multi-language capabilities (PT-BR, EN-US, ES-ES). The dashboard includes a collapsible sidebar, sticky header, glassmorphism effects, and pages for Datasets Management, Agents Management (with CRUD and custom namespace creation), and a Curation Queue for HITL content review.

### Technical Implementations
The backend uses Node.js and TypeScript with Express.js and PostgreSQL via Drizzle ORM (Neon serverless). Core services include an LLM Client, Storage, Multi-Agent Router (MoE), RAG with namespace-scoping, an Agent Engine (ReAct with POMDP), Policy Enforcement, Automatic Fallback, Multimodal Processing, Web Content Discovery, Free LLM Providers rotation, GPU Orchestrator, Training Data Collector, and Token Monitoring System. Authentication uses Replit Auth (OpenID Connect). The multi-agent architecture utilizes a MoE router for LLM-based intent classification, with each agent having isolated RAG namespaces, dedicated tool access, configurable budget limits, and escalation rules. RAG combines OpenAI embeddings with BM25 for re-ranking. The Policy Enforcement Pipeline uses a System Prompt Composer and Output Moderator with a JSON-configurable Policy DSL. Professional video generation uses an async job queue, GPU workers, and webhook callbacks. The GPU Pool System manages intelligent quota, auto-shutdown, round-robin load balancing, heartbeat monitoring, and multi-GPU parallel processing across Google Colab and Kaggle. Multi-Cloud Deployment uses Google Cloud Run and AWS Fargate with a shared Neon PostgreSQL database.

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