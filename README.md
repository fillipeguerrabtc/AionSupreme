# AION - Autonomous AI System (IA Suprema & Ilimitada)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)

[**English**](#english) | [**Português**](./README_PT-BR.md)

---

## 🌟 Overview

**AION** is an enterprise-grade **autonomous AI system** featuring multi-tenant architecture, configurable policy enforcement, RAG-based knowledge retrieval, and autonomous agent capabilities. The system emphasizes **externalized policy enforcement** - the core AI model remains unrestricted by default, with behavior controlled through composable system prompts and runtime configuration.

### 🎯 Key Features

- ⚡ **Automatic Fallback System** - Detects LLM provider refusals, searches free web, indexes in KB, responds without censorship
- 🤖 **Autonomous Agents** - ReAct framework with POMDP for complex task completion
- 📚 **RAG Knowledge Base** - Hybrid semantic + lexical search with vector embeddings
- 🎨 **Multimodal Processing** - PDF, DOCX, XLSX, images, audio, video support
- 🛡️ **Policy Enforcement** - Externalized, runtime-configurable content policies per tenant
- 📊 **Real-time Metrics** - Prometheus-compatible observability with latency, cost, and throughput tracking
- 🌍 **Multi-tenant** - Isolated policies, API keys, and usage quotas per organization
- 🎛️ **Admin Dashboard** - Complete policy management and system monitoring interface

### 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AION System                             │
├─────────────────────────────────────────────────────────────┤
│  Chat Interface          │         Admin Dashboard          │
│  (End Users)            │         (Policy Management)       │
├──────────────────────────┼──────────────────────────────────┤
│              Enforcement Pipeline & Auto-Fallback            │
│  • System Prompt Composer  • Refusal Detection              │
│  • Output Moderator        • Web Search & KB Indexing        │
├─────────────────────────────────────────────────────────────┤
│                    Core Services                             │
│  LLM Client  │  RAG Service  │  Agent Engine  │  Storage    │
├─────────────────────────────────────────────────────────────┤
│              External Integrations                           │
│  OpenAI API  │  Neon PostgreSQL  │  DuckDuckGo Search       │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ 
- **PostgreSQL** 15+ (or Neon serverless)
- **OpenAI API Key** (for LLM completions and embeddings)

### Installation

```bash
# Clone the repository
git clone https://github.com/filipeguerrrabr/AionSupreme.git
cd AionSupreme

# Install dependencies
npm install

# Configure environment variables
# Create a .env file with:
# - DATABASE_URL=postgresql://...
# - OPENAI_API_KEY=sk-...
# - SESSION_SECRET=your-secret-key

# Initialize database
npm run db:push

# Start development server
npm run dev
```

The application will be available at `http://localhost:5000`.

## 📚 Documentation

### Core Documentation

- [**Architecture Guide**](./docs/ARCHITECTURE.md) - System design, components, and technical decisions
- [**Automatic Fallback System**](./docs/AUTOMATIC_FALLBACK.md) - Refusal detection and autonomous web search
- [**PDF Documentation Index**](./docs/INDEX.md) - Complete guide to the 19 technical PDFs
- [**API Reference**](./docs/API.md) - REST API endpoints and usage
- [**Deployment Guide**](./GOOGLE_COLAB_DEPLOYMENT.md) - Google Colab GPU deployment instructions

### Technical PDFs (19 Parts)

Complete technical documentation covering:
- **Parts 1-2**: Theoretical foundations (Transformer, MoE, LoRA, RLHF, scaling laws)
- **Parts 3.1-3.4**: System architecture (multimodal, RAG, agents, deployment)
- **Parts 4-16**: Implementation details, mathematical proofs, practical guides

All PDFs are organized in [`docs/pdfs/`](./docs/pdfs/).

## 🎯 Core Features

### 1. Automatic Fallback System ⚡ NEW

When OpenAI refuses a request due to internal policies, AION automatically:
1. **Detects refusal** using 11+ pattern-matching rules
2. **Searches free web** (DuckDuckGo) for unrestricted information
3. **Fetches full content** from top 3 sources (~100KB each)
4. **Indexes in knowledge base** for future queries
5. **Generates uncensored response** using retrieved context

**Activation**: Only when system is in UNRESTRICTED mode (no policy rules enabled).

```javascript
// Example API response with fallback
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Direct answer using web sources..."
    }
  }],
  "fallback": {
    "used": true,
    "sourcesIndexed": 3,
    "searchQuery": "encryption libraries"
  }
}
```

### 2. Autonomous Agents (ReAct + POMDP)

Agents can autonomously complete complex tasks using:
- **Tools**: Web search, knowledge base search, code execution
- **Planning**: Hierarchical goal decomposition
- **Reasoning**: Thought → Action → Observation cycles

### 3. RAG Knowledge Base

Hybrid search combining:
- **Semantic**: OpenAI embeddings with cosine similarity
- **Lexical**: BM25 for keyword matching
- **Re-ranking**: MMR to avoid redundancy

### 4. Policy Enforcement Pipeline

Runtime-configurable policies per tenant:
- Content restrictions (hate speech, violence, profanity, etc.)
- Personality traits (humor, tone, formality)
- LLM parameters (temperature, top-p, top-k)
- Actions on violation: refuse, redact, or rewrite

**FUNDAMENTAL RULE**: System is **born unrestricted** (all rules = false). Restrictions only apply when manually configured via admin dashboard.

## 🛠️ Tech Stack

### Backend
- **Node.js** + TypeScript + Express
- **PostgreSQL** (Neon serverless) + Drizzle ORM  
- **Timezone**: America/Sao_Paulo (Brasília, Brazil) for accurate local date calculations
- **OpenAI API** (GPT-4, embeddings)
- **DuckDuckGo** (web search via HTML scraping)

### Frontend
- **React 18** + TypeScript
- **Vite** (build tool and dev server)
- **TanStack Query** (server state)
- **Radix UI** + **shadcn/ui** (components)
- **Tailwind CSS** (styling)

### Infrastructure
- **Replit** (primary development platform)
- **Google Colab** (optional GPU deployment)
- **Prometheus** (metrics export)

## 📊 Database Schema

9 core tables:
- `tenants` - Multi-tenant isolation
- `policies` - JSON/YAML policy definitions
- `conversations` - Chat history
- `messages` - Individual messages
- `documents` - Uploaded files for RAG
- `embeddings` - Vector embeddings for semantic search
- `tool_executions` - Agent tool call audit trail
- `metrics` - Performance and cost tracking
- `audit_logs` - Immutable logs with SHA-256 hashes

## 🔐 Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# OpenAI
OPENAI_API_KEY=sk-...

# Session
SESSION_SECRET=your-random-secret-key
```

## 🧪 Testing

```bash
# Run fallback system tests
npm run test:fallback

# Test outputs:
# ✅ Refusal Detection: 100% accuracy
# ✅ Web Search: 3 URLs found
# ✅ Fallback Logic: Activates only in UNRESTRICTED mode
```

## 📈 Metrics & Observability

Prometheus-compatible metrics at `/metrics`:
- Latency percentiles (p50, p95, p99)
- Throughput (requests/sec, tokens/sec)
- Cache hit rates
- Cost estimates (USD per tenant)
- Error rates

## 🤝 Contributing

This is a research and educational project. Contributions welcome for:
- Improving refusal detection patterns
- Adding new agent tools
- Enhancing multimodal processing
- Optimizing vector search

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

Built on top of:
- **OpenAI** - LLM completions and embeddings
- **Neon** - Serverless PostgreSQL
- **Replit** - Development platform
- **shadcn/ui** - Beautiful UI components

---

## 🔗 Links

- **Documentation**: [`docs/`](./docs/)
- **Technical PDFs**: [`docs/pdfs/`](./docs/pdfs/)
- **Production Status**: [PRODUCTION_STATUS.md](./PRODUCTION_STATUS.md)
- **Deployment Guide**: [GOOGLE_COLAB_DEPLOYMENT.md](./GOOGLE_COLAB_DEPLOYMENT.md)

---

**Made with ❤️ for autonomous AI research**
