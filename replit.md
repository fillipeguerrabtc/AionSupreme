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