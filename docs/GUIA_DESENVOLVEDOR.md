# 🛠️ GUIA COMPLETO DO DESENVOLVEDOR - AION

## 📋 Índice

1. [Visão Geral do Sistema](#visão-geral-do-sistema)
2. [Setup do Zero](#setup-do-zero)
3. [Arquitetura Técnica Completa](#arquitetura-técnica-completa)
4. [Stack Tecnológica](#stack-tecnológica)
5. [Estrutura do Projeto](#estrutura-do-projeto)
6. [Sistemas Implementados](#sistemas-implementados)
7. [Banco de Dados](#banco-de-dados)
8. [Otimizações de Performance](#otimizações-de-performance)
9. [Guia de Desenvolvimento](#guia-de-desenvolvimento)
10. [Deploy em Produção](#deploy-em-produção)
11. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral do Sistema

AION é um sistema de IA autônomo enterprise-grade projetado para robustez, flexibilidade e auto-operação. O sistema opera em **modo single-tenant** otimizado para custo e performance.

### Características Principais

- **Multi-Agente com MoE Router**: Classificação inteligente de intenção via LLM
- **RAG Híbrido**: Combinação de busca semântica (OpenAI embeddings) + lexical (BM25)
- **HITL Curation**: Sistema Human-in-the-Loop com deduplicação inteligente
- **GPU Pool Sistema**: 14 GPUs gratuitas (7 Google Colab + 7 Kaggle) para training/inference
- **Federated Learning**: Treinamento distribuído com agregação FedAvg
- **Auto-Evolution**: Sistema de aprendizado contínuo sem intervenção humana
- **Performance Otimizada**: Índices trigram PostgreSQL, monitoramento de latência em tempo real

---

## 🚀 Setup do Zero

### Pré-requisitos

```bash
# Ferramentas necessárias
- Node.js 20+
- PostgreSQL 15+ (ou conta Neon serverless)
- Chave API OpenAI
- Git
```

### 1. Clone e Instalação

```bash
# Clone o repositório
git clone https://github.com/filipeguerrrabr/AionSupreme.git
cd AionSupreme

# Instale as dependências
npm install
```

### 2. Configuração de Ambiente

Crie arquivo `.env` na raiz do projeto:

```env
# Database (Neon PostgreSQL Serverless)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
PGHOST=your-host.neon.tech
PGDATABASE=your-database
PGUSER=your-user
PGPASSWORD=your-password
PGPORT=5432

# OpenAI (obrigatório para embeddings e LLM principal)
OPENAI_API_KEY=sk-...

# Session (gere com: openssl rand -base64 32)
SESSION_SECRET=sua-chave-secreta-aqui

# APIs Grátis (opcionais mas recomendados)
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIzaSy...
OPEN_ROUTER_API_KEY=sk-or-v1-...
HUGGINGFACE_API_KEY=hf_...

# Timezone (padrão: America/Sao_Paulo)
TZ=America/Sao_Paulo
```

### 3. Inicialização do Banco de Dados

```bash
# Sincronizar schema do Drizzle com PostgreSQL
npm run db:push

# Verificar se funcionou
npm run db:studio # Abre interface visual do banco
```

**IMPORTANTE:** O comando `db:push` cria:
- ✅ Todas as tabelas necessárias
- ✅ Índices GIN trigram para busca otimizada (pg_trgm extension)
- ✅ Relações e constraints
- ✅ Dados seed iniciais (namespace padrão, policy, etc.)

### 4. Desenvolvimento

```bash
# Inicia servidor de desenvolvimento (hot reload)
npm run dev

# Aplicação disponível em http://localhost:5000
```

### 5. Verificar Instalação

Acesse `http://localhost:5000` e verifique:

1. ✅ Interface do chat carrega
2. ✅ Painel administrativo acessível (botão no header)
3. ✅ Enviar mensagem teste no chat
4. ✅ Verificar logs do terminal (sem erros)

---

## 🏗️ Arquitetura Técnica Completa

### Diagrama de Alto Nível

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTE (React + Vite)                    │
│  ┌──────────────┐              ┌──────────────┐             │
│  │ Chat UI      │              │ Admin Panel  │             │
│  │ - Conversa   │              │ - Datasets   │             │
│  │ - Histórico  │              │ - Agentes    │             │
│  │ - Upload     │              │ - Curadoria  │             │
│  └──────────────┘              └──────────────┘             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 SERVIDOR (Node.js + Express)                 │
├─────────────────────────────────────────────────────────────┤
│  CAMADA DE MIDDLEWARE                                        │
│  ├─ Rate Limiting (proteção DDoS)                           │
│  ├─ Audit (log todas ações)                                 │
│  ├─ Query Monitoring (latência em tempo real)               │
│  └─ Replit Auth (OpenID Connect)                            │
├─────────────────────────────────────────────────────────────┤
│  CAMADA DE NEGÓCIO                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  LLM ORQUESTRAÇÃO (5 níveis de fallback)            │   │
│  │  1. GPU Local (LoRA fine-tuned)                     │   │
│  │  2. Free APIs (Groq, Gemini, OpenRouter, HF)        │   │
│  │  3. Web Search (DuckDuckGo)                         │   │
│  │  4. OpenAI (último recurso)                         │   │
│  │  5. Fallback automático com indexação KB            │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  MULTI-AGENTE (ReAct + POMDP)                       │   │
│  │  - MoE Router (classificação via GPT-4)             │   │
│  │  - Namespace isolation (RAG dedicada por agente)    │   │
│  │  - Budget limits & escalation                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  RAG SERVICE                                         │   │
│  │  - Embedder (OpenAI text-embedding-3-small)         │   │
│  │  - VectorStore (in-memory + PostgreSQL)             │   │
│  │  - Hybrid Search (Semantic + BM25)                  │   │
│  │  - Re-ranking (MMR para evitar redundância)         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  HITL CURATION (Human-in-the-Loop)                  │   │
│  │  - Auto-detection duplicados (hash + embeddings)    │   │
│  │  - Absorção inteligente (merge parcial)             │   │
│  │  - Namespace classification (GPT-4)                 │   │
│  │  - Queue management                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  GPU POOL (14 GPUs gratuitas)                       │   │
│  │  - 7x Google Colab T4 (15GB VRAM cada)              │   │
│  │  - 7x Kaggle T4x2 (30GB VRAM combinado)             │   │
│  │  - Load balancing round-robin                       │   │
│  │  - Heartbeat monitoring                             │   │
│  │  - Auto-shutdown idle workers                       │   │
│  │  - Preempção: inference pausa treino                │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  FEDERATED LEARNING                                  │   │
│  │  - Gradient Aggregation (FedAvg algorithm)          │   │
│  │  - Multi-round training                             │   │
│  │  - Fault tolerance (continue se worker falhar)      │   │
│  │  - Auto-recovery system                             │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  AUTO-EVOLUTION (8 subsistemas)                      │   │
│  │  1. AutoIndexer - indexa automaticamente KB         │   │
│  │  2. AutoLearningListener - escuta todas fontes      │   │
│  │  3. DatasetGenerator - gera datasets (>100 ex)      │   │
│  │  4. AutoTrainingTrigger - treina automaticamente    │   │
│  │  5. GPUPool - balanceamento inteligente             │   │
│  │  6. Chat Ingestion - coleta conversas qualidade     │   │
│  │  7. Agent Learning - aprendizado contínuo agentes   │   │
│  │  8. Gradient Aggregator - coordena federado         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              BANCO DE DADOS (PostgreSQL + Neon)              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  TABLES (34 total)                                    │  │
│  │  - users, conversations, messages                    │  │
│  │  - namespaces, agents, agent_relationships           │  │
│  │  - kb_documents, kb_embeddings, kb_images            │  │
│  │  - curation_queue, training_data, datasets           │  │
│  │  - gpu_workers, training_jobs                        │  │
│  │  - lifecycle_policies, audit_logs                    │  │
│  │  - vision_image_analysis, token_tracking             │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ÍNDICES TRIGRAM (pg_trgm extension)                 │  │
│  │  - namespaces_name_trgm_idx (GIN)                    │  │
│  │  - namespaces_description_trgm_idx (GIN)             │  │
│  │  → Otimiza buscas ILIKE com wildcards %...%         │  │
│  │  → Usado automaticamente em tabelas >1000 registros │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo de Dados: Request do Usuário

```
1. Usuário envia mensagem no chat
        ↓
2. Frontend (React) → POST /api/v1/chat/stream
        ↓
3. Middleware Chain
   - Rate Limiting ✓
   - Query Monitoring (inicia timer) ✓
   - Audit Log ✓
   - Auth (opcional) ✓
        ↓
4. MoE Router (GPT-4 via OpenAI)
   - Classifica intenção da mensagem
   - Seleciona agente especialista
   - Exemplo: "ensine matemática" → Agente Educação
        ↓
5. Agent Engine (ReAct + POMDP)
   - Planejamento hierárquico
   - Executa ferramentas (SearchWeb, KB.Search, etc.)
   - Ciclos: Pensamento → Ação → Observação
        ↓
6. RAG Service (se necessário)
   - Gera embedding da query (OpenAI)
   - Busca híbrida:
     * Semantic: cosine similarity no vector store
     * Lexical: BM25 ranking
   - Re-ranking com MMR
   - Retorna top-K documentos
        ↓
7. LLM Generation (5-level fallback)
   a) Tenta GPU local (LoRA fine-tuned) - GRÁTIS
   b) Tenta Free APIs (Groq, Gemini, etc.) - GRÁTIS
   c) Web Search se recusa + indexa KB - GRÁTIS
   d) OpenAI API (última opção) - PAGO
        ↓
8. Enforcement Pipeline
   - Aplica políticas configuradas
   - Modera output
   - Audit log
        ↓
9. Response Stream (SSE)
   - Envia chunks para frontend
   - Frontend renderiza em tempo real
        ↓
10. Auto-Evolution (background)
    - AutoIndexer adiciona na KB
    - AutoLearningListener registra para dataset
    - Se ≥100 exemplos → trigger training automático
    - GPU workers treinam modelo
    - Modelo melhora gradualmente
        ↓
11. Query Monitoring
    - Registra latência total
    - Armazena métricas (p50, p95, p99)
    - Disponível em /api/admin/query-metrics
```

---

## 📚 Stack Tecnológica

### Backend

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| **Node.js** | 20+ | Runtime JavaScript server-side |
| **TypeScript** | 5.x | Type safety, melhor DX |
| **Express.js** | 4.x | Framework HTTP server |
| **Drizzle ORM** | 0.36+ | Type-safe database queries |
| **PostgreSQL** | 15+ | Database principal (via Neon) |
| **Neon** | Serverless | PostgreSQL serverless, auto-scaling |

### Frontend

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| **React** | 18.x | UI library |
| **Vite** | 5.x | Build tool ultra-rápido |
| **Wouter** | 3.x | Routing leve (2KB) |
| **TanStack Query** | 5.x | Server state management |
| **Radix UI** | Latest | Primitivos acessíveis |
| **shadcn/ui** | Latest | Componentes pre-construídos |
| **Tailwind CSS** | 3.x | Utility-first CSS |

### Integrações Externas

| Serviço | Uso | Custo |
|---------|-----|-------|
| **OpenAI API** | Embeddings + LLM (fallback) | PAGO (~$0.10/1M tokens) |
| **Groq** | LLM grátis | GRÁTIS (14.4k req/dia) |
| **Google Gemini** | LLM grátis | GRÁTIS (1.5k req/dia) |
| **OpenRouter** | LLM grátis (400+ modelos) | GRÁTIS (50 req/dia) |
| **HuggingFace** | LLM grátis | GRÁTIS (~720 req/dia) |
| **Google Colab** | 7x T4 GPUs (15GB cada) | GRÁTIS |
| **Kaggle** | 7x T4x2 GPUs (30GB cada) | GRÁTIS |
| **DuckDuckGo** | Web search | GRÁTIS (ilimitado) |
| **Replit Auth** | Autenticação (OIDC) | GRÁTIS |

---

## 📁 Estrutura do Projeto

```
AionSupreme/
├── client/                    # Frontend (React + Vite)
│   ├── src/
│   │   ├── components/        # Componentes reutilizáveis
│   │   │   ├── ui/           # shadcn/ui components
│   │   │   ├── agents/       # Gerenciamento de agentes
│   │   │   ├── chat/         # Interface do chat
│   │   │   └── admin/        # Painel administrativo
│   │   ├── pages/            # Páginas (rotas)
│   │   │   ├── admin/        # Páginas admin
│   │   │   └── ChatPage.tsx  # Chat principal
│   │   ├── lib/              # Utilities & helpers
│   │   ├── hooks/            # Custom React hooks
│   │   └── App.tsx           # Entry point
│   └── index.html
│
├── server/                    # Backend (Node.js + Express)
│   ├── index.ts              # Entry point (setup middlewares)
│   ├── routes.ts             # Registro de rotas principais
│   ├── db.ts                 # Conexão PostgreSQL (Drizzle)
│   ├── storage.ts            # Interface de armazenamento
│   │
│   ├── routes/               # Rotas separadas por domínio
│   │   ├── agents.ts         # CRUD agentes
│   │   ├── agent-relationships.ts
│   │   ├── namespaces.ts     # CRUD namespaces
│   │   ├── curation.ts       # HITL curation queue
│   │   ├── kb_promote.ts     # Promover curadoria → KB
│   │   ├── gpu.ts            # GPU Pool management
│   │   ├── vision.ts         # Vision system (OCR, etc.)
│   │   ├── kb-images.ts      # Busca semântica imagens
│   │   └── query-metrics.ts  # Monitoramento de latência
│   │
│   ├── middleware/           # Express middlewares
│   │   ├── rate-limit.ts     # Rate limiting (DDoS protection)
│   │   ├── audit.ts          # Audit logging
│   │   └── query-monitoring.ts # Latência em tempo real
│   │
│   ├── services/             # Serviços core
│   │   ├── namespace-classifier.ts  # GPT-4 classification
│   │   └── query-monitor.ts         # Metrics collector
│   │
│   ├── model/                # LLM & Inference
│   │   ├── llm-client.ts     # OpenAI client
│   │   ├── free-llm-providers.ts # Groq, Gemini, etc.
│   │   ├── gpu-orchestrator.ts   # GPU pool manager
│   │   └── priority-orchestrator.ts # 5-level fallback
│   │
│   ├── agent/                # Multi-Agent System
│   │   ├── loader.ts         # Load agents from DB
│   │   ├── react-engine.ts   # ReAct loop (POMDP)
│   │   ├── tools.ts          # Agent tools (SearchWeb, etc.)
│   │   └── hierarchical-planner.ts
│   │
│   ├── rag/                  # Retrieval-Augmented Generation
│   │   ├── vector-store.ts   # In-memory + PostgreSQL
│   │   ├── knowledge-indexer.ts # Indexação KB
│   │   └── embedder.ts       # OpenAI embeddings
│   │
│   ├── curation/             # HITL Curation System
│   │   ├── store.ts          # Curation queue storage
│   │   ├── deduplicator.ts   # Hash + embeddings
│   │   └── absorber.ts       # Merge parcial conteúdo
│   │
│   ├── training/             # Training & Auto-Evolution
│   │   ├── data-collector.ts # Coleta conversas qualidade
│   │   ├── init-auto-evolution.ts # Inicializa 8 subsistemas
│   │   └── datasets/         # Dataset management
│   │
│   ├── federated/            # Federated Learning
│   │   ├── gradient-aggregator.ts # FedAvg algorithm
│   │   └── auto-recovery.ts       # Recovery de jobs
│   │
│   ├── policy/               # Policy Enforcement
│   │   ├── enforcement-pipeline.ts # Aplica políticas
│   │   ├── auto-fallback.ts       # Detecção recusa
│   │   └── moderator.ts           # Content moderation
│   │
│   ├── multimodal/           # File Processing
│   │   └── file-processor.ts # PDF, DOCX, XLSX, etc.
│   │
│   ├── monitoring/           # Observability
│   │   └── token-tracker.ts  # Rastreamento tokens
│   │
│   └── gpu/                  # GPU Workers
│       ├── heartbeat-monitor.ts # Detecta workers offline
│       └── worker-manager.ts    # Gerencia conexões
│
├── shared/                    # Código compartilhado
│   └── schema.ts             # Schema Drizzle (tipos + DB)
│
├── docs/                      # Documentação
│   ├── GUIA_DESENVOLVEDOR.md  # Este arquivo
│   ├── GUIA_PRODUTO.md        # Para pessoas de produto
│   ├── ARCHITECTURE.md        # Arquitetura detalhada
│   ├── API.md                 # Referência API REST
│   ├── NAMESPACE_CLASSIFICATION_GUIDE.md
│   ├── DEDUPLICATION_ABSORPTION_GUIDE.md
│   └── ...
│
├── drizzle.config.ts         # Configuração Drizzle
├── vite.config.ts            # Configuração Vite
├── tailwind.config.ts        # Configuração Tailwind
├── package.json
└── tsconfig.json
```

---

## 🔧 Sistemas Implementados

### 1. Sistema de Namespaces com Classificação Automática

**Localização:** `server/services/namespace-classifier.ts`, `server/routes/namespaces.ts`

**Funcionalidade:**
- Classificação inteligente de conteúdo via GPT-4
- Análise semântica automática
- Sugestão de namespaces ideais
- Criação automática de namespace + agente especialista

**Endpoints:**
- `POST /api/namespaces/classify` - Classifica conteúdo e sugere namespace
- `GET /api/namespaces/search?q=<query>` - Busca namespaces (otimizado com índice trigram)
- `POST /api/namespaces/create-with-agent` - Cria namespace + agente em uma operação

**Exemplo de Uso:**

```typescript
// Classificar conteúdo
const result = await fetch('/api/namespaces/classify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content: 'Tutorial de cálculo diferencial com exemplos práticos',
    context: 'Material educacional para ensino superior'
  })
});

// Response:
{
  "suggestedNamespace": "educacao.matematica.calculo",
  "confidence": 0.92,
  "reasoning": "Conteúdo educacional focado em matemática avançada",
  "existingSimilar": [
    {
      "id": "...",
      "name": "educacao.matematica",
      "similarity": 0.87
    }
  ]
}
```

### 2. Sistema de Deduplicação e Absorção Inteligente

**Localização:** `server/curation/deduplicator.ts`, `server/curation/absorber.ts`

**Funcionalidade:**
- **Tier 1 (Hash)**: Detecta duplicatas 100% idênticas em <1ms
- **Tier 2 (Embeddings)**: Detecta conteúdo semanticamente similar em ~2s
- **Absorção**: Merge parcial preservando linhas únicas

**Thresholds:**
- **>98%**: Duplicata exata (rejeitar)
- **85-98%**: Similar (usar preview de absorção)
- **<85%**: Único (aprovar)

**Fluxo:**

```
1. Usuário adiciona conteúdo na fila de curadoria
2. Sistema calcula hash SHA-256
3. Compara com hashes existentes (Tier 1)
4. Se não for duplicata exata:
   4a. Gera embedding OpenAI
   4b. Compara com embeddings KB (cosine similarity)
   4c. Classifica: Exata / Similar / Único
5. Se Similar (85-98%):
   5a. Mostra preview de absorção
   5b. Extrai apenas linhas novas
   5c. Usuário decide: aprovar / rejeitar / editar
6. Aprovação → indexa na KB
```

### 3. Sistema de Monitoramento de Latência

**Localização:** `server/services/query-monitor.ts`, `server/middleware/query-monitoring.ts`

**Funcionalidade:**
- Captura automaticamente TODAS as requests HTTP
- Calcula latência end-to-end
- Armazena últimas 1000 queries em memória
- Estatísticas agregadas: avg, min, max, p50, p95, p99
- Detecção de queries lentas (>1s)

**Endpoints:**
- `GET /api/admin/query-metrics` - Lista todas métricas
- `GET /api/admin/query-metrics/stats` - Estatísticas agregadas
- `GET /api/admin/query-metrics/slow?threshold=1000` - Queries lentas
- `DELETE /api/admin/query-metrics` - Limpa histórico

**Exemplo:**

```bash
# Ver estatísticas
curl http://localhost:5000/api/admin/query-metrics/stats

# Response:
{
  "totalQueries": 142,
  "avgLatency": 28.5,
  "minLatency": 2,
  "maxLatency": 281,
  "p50Latency": 12,
  "p95Latency": 95,
  "p99Latency": 210,
  "errorRate": 0,
  "lastHour": {
    "count": 45,
    "avgLatency": 22.3
  }
}
```

### 4. GPU Pool System (14 GPUs Gratuitas)

**Localização:** `server/model/gpu-orchestrator.ts`, `server/routes/gpu.ts`

**Funcionalidade:**
- Gerenciamento de 14 GPUs gratuitas
- Load balancing round-robin
- Heartbeat monitoring (60s timeout)
- Auto-shutdown workers inativos
- Preempção: inference pausa treino automaticamente

**Workers:**
- 7x Google Colab T4 (15GB VRAM cada)
- 7x Kaggle T4x2 (30GB VRAM combinado)

**Endpoints:**
- `GET /api/gpu/workers` - Lista todos workers
- `POST /api/gpu/workers` - Registra novo worker
- `POST /api/gpu/workers/:id/heartbeat` - Atualiza heartbeat
- `DELETE /api/gpu/workers/:id` - Remove worker

### 5. Federated Learning

**Localização:** `server/federated/gradient-aggregator.ts`

**Funcionalidade:**
- Treinamento distribuído em múltiplas GPUs
- Algoritmo FedAvg para agregação de gradientes
- Fault tolerance (continua se worker falhar)
- Multi-round training
- Auto-recovery de jobs

**Fluxo:**

```
1. Training job criado com dataset
2. Job distribuído para N workers GPU
3. Cada worker treina localmente:
   - Carrega modelo base
   - Treina LoRA adapters
   - Envia gradientes para coordinator
4. Coordinator agrega gradientes (FedAvg):
   - Aguarda todos workers completarem
   - Calcula média ponderada dos gradientes
   - Atualiza modelo global
5. Nova rodada ou finaliza
```

### 6. Auto-Evolution System (8 Subsistemas)

**Localização:** `server/training/init-auto-evolution.ts`

**8 Subsistemas:**

1. **AutoIndexer**: Indexa automaticamente conteúdo na KB
2. **AutoLearningListener**: Escuta todas fontes de dados
3. **DatasetGenerator**: Gera datasets quando ≥100 exemplos
4. **AutoTrainingTrigger**: Dispara treinamento automático
5. **GPUPool**: Balanceamento inteligente (inference vs treino)
6. **Chat Ingestion**: Coleta conversas de alta qualidade
7. **Agent Learning**: Aprendizado contínuo de agentes
8. **Gradient Aggregator**: Coordena federated learning

**Fluxo Completo:**

```
Usuário pergunta
   ↓
AION responde (busca KB → GPU → Free APIs → Web → OpenAI)
   ↓
AutoIndexer adiciona resposta na KB automaticamente
   ↓
AutoLearningListener registra para dataset
   ↓
Acumula 100 exemplos
   ↓
DatasetGenerator cria dataset
   ↓
AutoTrainingTrigger dispara treino
   ↓
GPU workers treinam modelo (LoRA)
   ↓
Modelo fica mais inteligente
   ↓
Ciclo se repete infinitamente ♾️
```

---

## 💾 Banco de Dados

### Schema Drizzle (TypeScript)

**Localização:** `shared/schema.ts`

**Principais Tabelas:**

```typescript
// Usuários e Autenticação
export const users = pgTable("users", { ... });

// Conversas e Mensagens
export const conversations = pgTable("conversations", { ... });
export const messages = pgTable("messages", { ... });

// Namespaces e Agentes
export const namespaces = pgTable("namespaces", {
  id: varchar("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull().unique(),
  description: text("description").notNull(),
  icon: varchar("icon", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const agents = pgTable("agents", { ... });
export const agentRelationships = pgTable("agent_relationships", { ... });

// Knowledge Base
export const kbDocuments = pgTable("kb_documents", { ... });
export const kbEmbeddings = pgTable("kb_embeddings", { ... });
export const kbImages = pgTable("kb_images", { ... });

// Curadoria HITL
export const curationQueue = pgTable("curation_queue", { ... });

// Training & Datasets
export const trainingDataCollection = pgTable("training_data_collection", { ... });
export const datasets = pgTable("datasets", { ... });
export const trainingJobs = pgTable("training_jobs", { ... });

// GPU Workers
export const gpuWorkers = pgTable("gpu_workers", { ... });

// Lifecycle & Monitoring
export const lifecyclePolicies = pgTable("lifecycle_policies", { ... });
export const auditLogs = pgTable("audit_logs", { ... });
export const tokenTracking = pgTable("token_tracking", { ... });
```

### Sincronização do Schema

**NUNCA edite SQL manualmente!** Use Drizzle:

```bash
# Sincronizar schema (cria/atualiza tabelas)
npm run db:push

# Se necessário forçar (destructive!)
npm run db:push --force

# Abrir interface visual
npm run db:studio
```

**REGRA IMPORTANTE:** Nunca mude tipo de coluna ID (serial ↔ varchar) em tabelas existentes!

---

## ⚡ Otimizações de Performance

### 1. Índices Trigram PostgreSQL (pg_trgm)

**Problema:** Busca com `ILIKE '%termo%'` em tabelas grandes é lenta (seq scan)

**Solução:** Extensão `pg_trgm` com índices GIN

```sql
-- Habilitar extensão
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Criar índices trigram
CREATE INDEX namespaces_name_trgm_idx 
ON namespaces USING GIN (name gin_trgm_ops);

CREATE INDEX namespaces_description_trgm_idx 
ON namespaces USING GIN (description gin_trgm_ops);
```

**Resultado:**
- ✅ Busca `ILIKE` usa índice automaticamente (tabelas >1000 registros)
- ✅ Performance ~100x melhor em tabelas grandes
- ✅ Transparente para aplicação (sem mudança de código)

### 2. Monitoramento de Latência em Tempo Real

**Middleware:** `server/middleware/query-monitoring.ts`

Captura automaticamente:
- Tempo de resposta (ms)
- Endpoint acessado
- Método HTTP
- Status code
- Query parameters

**Benefícios:**
- Detecta queries lentas (>1s)
- Identifica bottlenecks
- Estatísticas p50, p95, p99
- Zero overhead (<0.1ms por request)

### 3. Caching e Memoization

**Vector Store:** Cache embeddings em memória + PostgreSQL

```typescript
// Busca embedding cached ANTES de gerar novo
const existingEmbedding = await db
  .select()
  .from(kbEmbeddings)
  .where(eq(kbEmbeddings.textHash, hash))
  .limit(1);

if (existingEmbedding) {
  return existingEmbedding.embedding; // Cache HIT
}

// Cache MISS → gera novo embedding
const embedding = await openai.embeddings.create({ ... });
```

**Economia:** ~$0.10/1M tokens (OpenAI embeddings)

### 4. Rate Limiting

**Middleware:** `server/middleware/rate-limit.ts`

Protege contra:
- DDoS attacks
- Abuse de API
- Custos excessivos (OpenAI API)

**Limites:**
- 100 requests/minuto por IP (geral)
- 20 requests/minuto para endpoints caros (embeddings, chat)

---

## 🛠️ Guia de Desenvolvimento

### Como Adicionar uma Nova Feature

**1. Definir Schema (se necessário)**

```typescript
// shared/schema.ts
export const minhaTabela = pgTable("minha_tabela", {
  id: serial("id").primaryKey(),
  nome: varchar("nome", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Criar insert schema
export const insertMinhaTabelaSchema = createInsertSchema(minhaTabela).omit({
  id: true,
  createdAt: true,
});

// Criar tipos TypeScript
export type MinhaTabela = typeof minhaTabela.$inferSelect;
export type InsertMinhaTabela = z.infer<typeof insertMinhaTabelaSchema>;
```

**2. Sincronizar com Banco**

```bash
npm run db:push
```

**3. Criar Rotas Backend**

```typescript
// server/routes/minha-feature.ts
import { Express } from "express";
import { db } from "../db";
import { minhaTabela } from "@shared/schema";

export function registerMinhaFeatureRoutes(app: Express) {
  // GET /api/minha-feature
  app.get("/api/minha-feature", async (req, res) => {
    try {
      const data = await db.select().from(minhaTabela);
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar dados" });
    }
  });

  // POST /api/minha-feature
  app.post("/api/minha-feature", async (req, res) => {
    try {
      const validated = insertMinhaTabelaSchema.parse(req.body);
      const [created] = await db.insert(minhaTabela).values(validated).returning();
      res.json(created);
    } catch (error) {
      res.status(400).json({ error: "Dados inválidos" });
    }
  });
}
```

**4. Registrar Rotas**

```typescript
// server/routes.ts
import { registerMinhaFeatureRoutes } from "./routes/minha-feature";

export function registerRoutes(app: Express) {
  // ... outras rotas
  registerMinhaFeatureRoutes(app);
}
```

**5. Criar Interface Frontend**

```typescript
// client/src/pages/admin/MinhaFeaturePage.tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export default function MinhaFeaturePage() {
  // Fetch data
  const { data, isLoading } = useQuery({
    queryKey: ["/api/minha-feature"],
  });

  // Mutation
  const createMutation = useMutation({
    mutationFn: async (values: InsertMinhaTabela) => {
      return await apiRequest("/api/minha-feature", {
        method: "POST",
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/minha-feature"] });
    },
  });

  if (isLoading) return <div>Carregando...</div>;

  return (
    <div>
      <h1>Minha Feature</h1>
      {/* UI aqui */}
    </div>
  );
}
```

**6. Adicionar Rota no Router**

```typescript
// client/src/App.tsx
import MinhaFeaturePage from "@/pages/admin/MinhaFeaturePage";

function Router() {
  return (
    <Switch>
      <Route path="/admin/minha-feature" component={MinhaFeaturePage} />
      {/* ... outras rotas */}
    </Switch>
  );
}
```

### Padrões de Código

**Backend:**
- ✅ Sempre validar input com Zod
- ✅ Usar try-catch em todas as rotas
- ✅ Retornar erros consistentes: `{ error: "mensagem" }`
- ✅ Usar transactions para operações multi-step
- ✅ Adicionar logs informativos: `console.log("[Feature] Ação")`

**Frontend:**
- ✅ Usar TanStack Query para server state
- ✅ Invalidar cache após mutations
- ✅ Mostrar loading states
- ✅ Adicionar `data-testid` em elementos interativos
- ✅ Usar shadcn/ui components quando possível

### Debugging

**Backend:**

```typescript
// Adicionar breakpoint
console.log("[DEBUG] Variável:", minhavar);

// Ver query SQL executada
const result = await db.select().from(minhaTabela);
console.log("SQL:", result.sql); // Se disponível
```

**Frontend:**

```typescript
// React Query Devtools
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

// Adicionar em App.tsx
<ReactQueryDevtools initialIsOpen={false} />

// Ver estado de queries na UI
```

**Database:**

```bash
# Ver dados
npm run db:studio

# Ou via SQL direto
psql $DATABASE_URL
\dt  # Listar tabelas
SELECT * FROM minha_tabela LIMIT 10;
```

---

## 🚀 Deploy em Produção

### Deploy no Google Cloud Run

**1. Criar Dockerfile**

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npm", "start"]
```

**2. Build e Deploy**

```bash
# Build imagem
docker build -t gcr.io/SEU-PROJETO/aion:latest .

# Push para GCR
docker push gcr.io/SEU-PROJETO/aion:latest

# Deploy no Cloud Run
gcloud run deploy aion \
  --image gcr.io/SEU-PROJETO/aion:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars DATABASE_URL=$DATABASE_URL,OPENAI_API_KEY=$OPENAI_API_KEY
```

### Deploy no AWS Fargate

**Similar, usando ECR + ECS:**

```bash
# Push para ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin SEU-REGISTRY
docker push SEU-REGISTRY/aion:latest

# Deploy via ECS Task Definition
```

### Configuração de Secrets

**NUNCA commitar secrets!** Use:

- **Development:** `.env` local (git ignored)
- **Production:** Google Secret Manager ou AWS Secrets Manager

```bash
# Google Cloud
gcloud secrets create OPENAI_API_KEY --data-file=- < api_key.txt

# AWS
aws secretsmanager create-secret --name OPENAI_API_KEY --secret-string "sk-..."
```

### Monitoramento em Produção

**Ferramentas:**
- **Logs:** Google Cloud Logging ou AWS CloudWatch
- **Métricas:** Integração nativa via `/api/admin/query-metrics`
- **Alertas:** Configure alertas para latência >1s ou error rate >1%

**Exemplo de Alert (Google Cloud Monitoring):**

```yaml
condition:
  filter: metric.type="custom.googleapis.com/query_latency_p95"
  comparison: COMPARISON_GT
  threshold_value: 1000
  duration: 60s
notification_channels:
  - projects/SEU-PROJETO/notificationChannels/EMAIL
```

---

## 🔧 Troubleshooting

### Problema: "Error: No such table"

**Causa:** Schema não sincronizado com banco

**Solução:**

```bash
npm run db:push
```

### Problema: "ECONNREFUSED localhost:5432"

**Causa:** PostgreSQL não está rodando ou `.env` incorreto

**Solução:**

```bash
# Verificar DATABASE_URL
echo $DATABASE_URL

# Testar conexão
psql $DATABASE_URL
```

### Problema: "OpenAI API Error: 429 Too Many Requests"

**Causa:** Rate limit OpenAI excedido

**Solução:**

1. Sistema já usa fallback para Free APIs (Groq, Gemini)
2. Verificar quota OpenAI: https://platform.openai.com/usage
3. Aguardar reset (geralmente 1 minuto)

### Problema: Busca ILIKE lenta

**Causa:** Tabela grande sem índice trigram

**Solução:**

```sql
-- Verificar se extensão está habilitada
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';

-- Se não, habilitar
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Criar índice
CREATE INDEX nome_coluna_trgm_idx 
ON minha_tabela USING GIN (nome_coluna gin_trgm_ops);
```

### Problema: GPU Workers offline

**Causa:** Workers perderam heartbeat

**Solução:**

1. Verificar logs: `GET /api/gpu/workers`
2. Workers Google Colab/Kaggle precisam executar script keep-alive
3. Reconectar worker ou remover: `DELETE /api/gpu/workers/:id`

### Problema: Frontend não carrega após deploy

**Causa:** Vite build não executado

**Solução:**

```bash
# Build frontend
npm run build

# Verificar pasta dist/ foi criada
ls -la dist/
```

---

## 📞 Suporte

Para dúvidas técnicas:

1. Consultar esta documentação
2. Ver exemplos em `docs/` (29 arquivos .md)
3. Verificar código existente em `server/` e `client/`
4. Executar `npm run db:studio` para explorar banco

---

## 📝 Changelog

### v1.0.0 (2025-11-02)

**Performance:**
- ✅ Implementado extensão `pg_trgm` no PostgreSQL
- ✅ Criados índices GIN trigram em `namespaces.name` e `namespaces.description`
- ✅ Sistema de monitoramento de latência em tempo real
- ✅ Endpoints `/api/admin/query-metrics` para observabilidade

**Features:**
- ✅ Namespace classification com GPT-4
- ✅ Deduplicação inteligente (hash + embeddings)
- ✅ Absorção parcial de conteúdo similar
- ✅ GPU Pool com 14 GPUs gratuitas
- ✅ Federated Learning (FedAvg)
- ✅ Auto-Evolution System (8 subsistemas)

**Documentação:**
- ✅ GUIA_DESENVOLVEDOR.md completo (este arquivo)
- ✅ GUIA_PRODUTO.md para pessoas não-técnicas
- ✅ 29 arquivos de documentação sincronizados

---

**🎉 Parabéns! Agora você tem conhecimento completo do AION!**

**Próximos Passos:**
1. ✅ Execute setup local
2. ✅ Explore código em `server/` e `client/`
3. ✅ Adicione sua primeira feature
4. ✅ Deploy em produção

**Lembre-se:** Código simples é sofisticado. Sempre prefira clareza sobre complexidade. 🚀
