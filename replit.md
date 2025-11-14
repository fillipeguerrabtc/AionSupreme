# AION - Autonomous AI System

## Overview
AION is an enterprise-grade autonomous AI system designed for robustness, flexibility, and self-operation, extending beyond current LLM limitations. Its core purpose is to deliver a self-sustaining, continuously evolving AI that learns and improves autonomously, reducing reliance on external APIs over time. Key capabilities include configurable policy enforcement, RAG-based knowledge retrieval, advanced autonomous agents using POMDP with a ReAct framework, professional video generation, and production-ready autonomous meta-learning. The business vision is to provide a comprehensive, self-managing AI solution that offers significant market potential by automating complex tasks and continuous self-optimization across various enterprise applications.

## User Preferences
### ⚠️ ENFORCEMENT CHARTER - REGRAS OBRIGATÓRIAS (LEIA PRIMEIRO!)
## 🎯 PRINCÍPIO FUNDAMENTAL: QUALIDADE > VELOCIDADE > ECONOMIA

**MANDATOS ABSOLUTOS:**
- **NUNCA economize tokens** - Tokens economizados = Retrabalho caro no futuro
- **NUNCA priorize velocidade** - Rápido e errado custa mais que lento e certo
- **SEMPRE priorize qualidade** - 100% enterprise-grade desde linha 1 de código
- **SEMPRE complete TUDO** - Zero tolerância para trabalho superficial/incompleto

## 🚫 PROIBIÇÕES ABSOLUTAS (ZERO TOLERANCE)

### 💀 NUNCA FAÇA ISSO (PROIBIDO):

**Dados e Storage:**
- ❌ **Hardcoded values** (strings, números, configs)
- ❌ **Mock data** (dados fake, placeholders, exemplos)
- ❌ **In-memory storage** (arrays, Maps, Sets como persistência)
- ❌ **localStorage/sessionStorage** (dados devem estar no PostgreSQL)
- ❌ **Dados temporários** (tudo deve persistir no banco)

**Código e Qualidade:**
- ❌ **MVP/POC code** (só código production-ready)
- ❌ **TODO/FIXME** comments (implemente agora ou não faça)
- ❌ **Placeholder functions** (funções vazias/incompletas)
- ❌ **Console.log em produção** (use logging estruturado)
- ❌ **Any type no TypeScript** (type safety 100%)
- ❌ **Código duplicado** (DRY - Don't Repeat Yourself)
- ❌ **Implementações incompletas** (termine ou não comece)

**Internacionalização:**
- ❌ **Strings sem i18n** (tudo PT/EN/ES via i18n.tsx)
- ❌ **Labels hardcoded** (use translation keys)
- ❌ **Messages em inglês** (default PT-BR)

**Scope e Tasks:**
- ❌ **Adicionar tasks não solicitadas** (Stripe, features extras, etc)
- ❌ **Remover tasks da lista** (sem autorização do usuário)
- ❌ **Trabalhar em features "bônus"** (só o que foi pedido)
- ❌ **Assumir requirements** (pergunte se incerto)
- ❌ **Inventar soluções** (use código existente)
- ❌ **Reorganizar prioridades** (mantenha ordem da lista)

### ✅ SEMPRE FAÇA ISSO (OBRIGATÓRIO):

**Antes de Qualquer Código:**
1. **grep/search_codebase** - Verificar o que já existe
2. **read arquivos** - Ler COMPLETO antes de editar
3. **Perguntar se incerto** - user_query ao invés de assumir

**Durante Desenvolvimento:**
1. **PostgreSQL via Drizzle** - NUNCA in-memory
2. **i18n para TUDO** - 3 idiomas (PT/EN/ES)
3. **TypeScript strict** - Tipos completos, zero any
4. **Error handling** - Try/catch, validações, fallbacks
5. **Loading states** - Skeletons, spinners, feedback
6. **data-testid** - Em TODOS elementos interativos
7. **Zod validation** - Schemas para todas inputs
8. **Structured logging** - Pino logger, zero console.log

**Depois de Modificar:**
1. **LSP check** - 0 errors obrigatório
2. **Architect review** - Toda mudança de código
3. **Workflow check** - Confirmar running sem errors
4. **run_test** - E2E testing quando aplicável

## 📋 NON-NEGOTIABLE WORKFLOW (ORDEM OBRIGATÓRIA)

**SEMPRE nesta ordem:**
1. **RESPONDER** - Perguntas do usuário primeiro
2. **CONFIRMAR** - Qual task está ativa agora
3. **INSPECIONAR** - grep/search código existente
4. **LER** - Arquivos relevantes COMPLETOS
5. **EXECUTAR** - Mudança mínima necessária
6. **VALIDAR** - LSP + Workflow + Logs
7. **REVISAR** - Architect review (código)
8. **TESTAR** - run_test quando aplicável
9. **COMPLETAR** - Marcar task completed só após review

**NUNCA:**
- Pule etapas para "economizar tempo"
- Comece nova task antes de completar atual
- Marque completed sem architect review
- Assuma que algo não existe sem verificar

## 📝 TASK LIST GOVERNANCE (LISTA SAGRADA)

### PROIBIDO (Violação = Roubo):
- ❌ Adicionar tasks sem approval explícito
- ❌ Remover tasks da lista
- ❌ Reorganizar prioridades
- ❌ Trabalhar em "extras" ou "nice-to-have"
- ❌ Marcar completed sem architect review

### OBRIGATÓRIO:
- ✅ Seguir ordem EXATA da lista
- ✅ Completar task atual ANTES de próxima
- ✅ Architect review para TODA mudança de código
- ✅ Perguntar via user_query se lista parece errada
- ✅ Documentar TUDO no código

### Process:
1. **Read task** - Entender requirement completo
2. **Verify existing** - grep/search o que já existe
3. **Plan approach** - Pensar antes de codificar
4. **Implement** - Código production-grade
5. **Validate** - LSP + Workflow + Tests
6. **Review** - Architect approval obrigatório
7. **Complete** - Marcar só após review Pass

## 🔍 CHANGE SAFETY PROTOCOL (PRÉ-FLIGHT CHECKLIST)

### ANTES de modificar qualquer código:
- [ ] **grep/search_codebase** - Função já existe?
- [ ] **read arquivo completo** - Entender contexto
- [ ] **Verificar imports** - Libs já disponíveis?
- [ ] **Conferir schema** - DB structure atual
- [ ] **Revisar i18n** - Keys já existem?
- [ ] **Checar types** - Interfaces já definidas?

### DURANTE modificação:
- [ ] **Mínima mudança** - Menos código = menos bugs
- [ ] **Comentários claros** - Explicar "por quê"
- [ ] **Type annotations** - Tipos explícitos
- [ ] **Error handling** - Try/catch apropriado
- [ ] **Validation** - Zod schemas
- [ ] **i18n completo** - 3 idiomas

### DEPOIS de modificar:
- [ ] **LSP check** - 0 errors confirmado
- [ ] **Workflow logs** - Running sem errors
- [ ] **Git diff review** - Mudanças fazem sentido?
- [ ] **Architect review** - Aprovação obrigatória
- [ ] **E2E test** - run_test quando aplicável

## 🎓 TRUTHFULNESS & ACCOUNTABILITY (HONESTIDADE ABSOLUTA)

### SEMPRE faça:
- ✅ Admita quando NÃO sabe algo
- ✅ Revele incertezas ANTES de executar
- ✅ Documente decisões no código
- ✅ Logue raciocínio em comments
- ✅ Pergunte ao usuário se duvidoso
- ✅ Cite fontes de decisões técnicas

### NUNCA faça:
- ❌ "Assumir" requirements não especificados
- ❌ "Inventar" features não solicitadas
- ❌ Silenciar erros ou warnings
- ❌ Esconder problemas do usuário
- ❌ Trabalhar em extras sem permissão
- ❌ Mentir sobre completion status

## 🚨 REGRAS CRÍTICAS DE GPU (RISCO DE BAN PERMANENTE!)

### KAGGLE - On-Demand + Idle Timeout:
- 🔢 **Quota Semanal**: 30h oficial → Usamos 21h (70% safety) = 75600s
- ⏱️ **Quota Sessão**: 12h oficial → Usamos 8.4h (70% safety) = 30240s
- 🎯 **Ativação**: ON-DEMAND (liga quando chega tarefa)
- ⏲️ **Idle Timeout**: 10min após completar tarefa
- ⚠️ **CRITICAL**: Respeitar AMBAS quotas = OBRIGATÓRIO!
  - Violar = BAN PERMANENTE da conta Google!
- 📊 **Tracking**: PostgreSQL-based

### COLAB - Schedule Fixo:
- ⏱️ **Quota Sessão**: 12h oficial → Usamos 8.4h (70% safety) = 30240s
- ⏰ **Cooldown**: 36h obrigatório entre sessões = 129600s
- 🔄 **Ativação**: ROTAÇÃO FIXA (schedule automático)
- ❌ **NUNCA on-demand** - apenas schedule fixo!
- ⚠️ **CRITICAL**: Respeitar cooldown = OBRIGATÓRIO!
  - Violar = BAN PERMANENTE da conta Google!

### CONSTANTES CENTRALIZADAS:
```typescript
// server/gpu-orchestration/intelligent-quota-manager.ts
export const GPU_QUOTA_CONSTANTS = {
  COLAB_SAFETY: 30240,        // 8.4h
  COLAB_COOLDOWN: 129600,     // 36h
  KAGGLE_GPU_SAFETY: 30240,   // 8.4h
  KAGGLE_WEEKLY_SAFETY: 75600, // 21h
  KAGGLE_IDLE_TIMEOUT: 600,   // 10min
}
```

## 🎯 REGRA DE OURO: "JÁ NASCE NÍVEL PRODUÇÃO"

**Tudo que você faz deve ser:**
- ✅ **100% persistente** - PostgreSQL, zero in-memory
- ✅ **100% internacionalizado** - PT/EN/ES via i18n
- ✅ **100% validado** - Zod schemas, error handling
- ✅ **100% tipado** - TypeScript strict, zero any
- ✅ **100% testável** - data-testid em tudo
- ✅ **100% observável** - Structured logging
- ✅ **100% seguro** - Input validation, encryption
- ✅ **100% production-ready** - Enterprise-grade desde dia 1

**ZERO TOLERANCE para:**
- ❌ MVP mindset
- ❌ "Vou melhorar depois"
- ❌ "Isso é só um teste"
- ❌ "Placeholder temporário"
- ❌ Mock data "por enquanto"

## System Architecture

AION operates in a single-tenant, multi-agent architecture with LLM-driven Mixture of Experts (MoE) routing, prioritizing GPU-FIRST inference. It features a 4-level priority chain with automatic fallback, universal multi-language support, and specialized agents with dedicated knowledge bases, tool access, and budget limits. A Human-in-the-Loop (HITL) system requires human approval for knowledge curation.

**UI/UX Decisions:**
- **Frontend Frameworks:** React 18, Vite, Wouter, TanStack Query.
- **Components & Styling:** Radix UI, shadcn/ui patterns, Tailwind CSS, custom HSL-based design system.
- **Design Principles:** Minimalist, glassmorphism design, conversational chat interface.
- **Admin Panel:** Enterprise-level, consolidated hierarchical menu, full Internationalization (i18n) supporting PT-BR (default), EN-US, ES-ES, 7-Trait Personality Equalizer with granular control, GPU Management Dashboard with RBAC and auto-orchestration.

**Technical Implementations & System Design Choices:**
- **AI System Core:** Continuous Self-Evolution System, Multimodal Processing, Vision Cascade System, level-based agent hierarchy, federated learning.
- **Security & Data Management:** Enterprise-level User & RBAC Management, Namespace isolation with schema updates, privacy-preserving heuristics, AES-256-GCM encryption for API credentials in a SecretsVault, multi-account management with individual quota tracking.
- **Architectural Patterns:** Externalized JSON behavioral configurations, comprehensive observability and telemetry, LLM-driven Mixture of Experts (MoE) routing, 4-level priority chain with automatic fallback.
- **Data Lineage:** Enterprise Cascade Data Lineage System for production-grade deletion tracking with hybrid strategy, dependency tracking, automatic model tainting, and 4 Admin API endpoints for impact preview, audit queries, and cascade deletion (GDPR compliant).
- **GPU Orchestration:** Production-Grade Colab Orchestrator Service (automates notebook creation via Puppeteer, stealth anti-detection, session persistence, robust authentication, secure worker code injection), GPU Orchestrator, GPU Pool Manager, GPU Load Balancer.
- **Data Persistence:** Persistent Vector Store using PostgreSQL's `pgvector` with IVFFlat Index (approximate nearest neighbor, multi-tenant isolation). Production-Grade Persistence Layer (PostgreSQL-backed) with Circuit Breaker, LLM Provider Quotas, Vision Cascade Quotas, GPU Quota Enforcement. Real-Time Provider Quota Monitoring System (fetches data from provider APIs, persists in PostgreSQL). Structured logging, fault-tolerant error handling, backward compatibility.
- **AI Training:** Production-Grade LoRA Training Pipeline (end-to-end autonomous model fine-tuning, GPU quota management, automated training triggers, dataset preprocessing to HuggingFace format, Kaggle worker automation via Puppeteer, LoRA training on TinyLlama-1.1B-Chat (4-bit quantization, PEFT), model persistence, metrics tracking).
- **Semantic Enforcement:** Semantic Enforcement System (100% semantic enforcement via OpenAI embeddings, Query Frequency Service, Auto-Namespace Creator with accent-aware defaults and trait sliders, LLM-based Namespace Classifier, multi-stage Auto-Approval Logic, 3-Tier Deduplication System).
- **Billing:** Multi-provider billing architecture with real-time cost tracking.
- **Backup:** Enterprise Backup & Recovery System (full database exports with security, rate limiting, audit logging).
- **Messaging:** Message and tool execution persistence.
- **Backend Stack:** Node.js, TypeScript, Express.js, PostgreSQL via Drizzle ORM.
- **Core Backend Services:** LLM Client, Storage, Multi-Agent Router (MoE), namespace-scoped RAG, Agent Engine (ReAct with POMDP), Automatic Fallback, Production-Grade Multimodal Processing, Web Content Discovery, YouTube Transcription Service, Vision Cascade, free LLM Provider rotation, Training Data Collector, Dataset Generator, Auto-Learning System, Token Monitoring, Lifecycle Management, Orphan Detection, Zod schema validation, Comprehensive Telemetry System.
- **Deployment:** Multi-Cloud Deployment using Google Cloud Run and AWS Fargate.

## External Dependencies

### Third-Party Services
- **API OpenAI**: LLM completions, embeddings, function calling, GPT-4o Vision.
- **Neon Database**: PostgreSQL Serverless.
- **Google Cloud Run**: Primary deployment platform.
- **AWS Fargate**: Backup deployment platform.
- **DuckDuckGo**: Web search.
- **OpenRouter, Groq, Gemini, HuggingFace**: Free LLM API providers.
- **Google Colab, Kaggle, Modal**: Free GPU resources.
- **RunPod/Modal**: GPU workers for video generation.
- **Replit**: Development environment and authentication (OpenID Connect).

### Core Libraries (NPM)
- **@neondatabase/serverless**: PostgreSQL client.
- **drizzle-orm**: Type-safe ORM.
- **openai**: Official OpenAI SDK.
- **@google/generative-ai**: Gemini API client.
- **@huggingface/inference**: HuggingFace API client.
- **groq-sdk**: Groq API client.
- **youtube-transcript**: YouTube caption/subtitle extraction.
- **@radix-ui/**: Accessible UI primitives.
- **@tanstack/react-query**: Server state management.
- **tailwindcss**: Utility-first CSS framework.
- **zod**: Schema validation.
- **mammoth**: DOCX to text extraction.
- **xlsx**: Excel file parsing.
- **xml2js**: XML parsing.
- **pdf-parse**: PDF text extraction.
- **cheerio**: HTML parsing and web scraping.
- **multer**: File upload handling.
- **file-type**: MIME type detection.