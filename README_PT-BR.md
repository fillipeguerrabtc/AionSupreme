# AION - Sistema de IA Autônoma

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)

[**English**](./README.md) | [**Português**](#português)

---

## 🌟 Visão Geral

**AION** é um **sistema de IA autônoma** de nível empresarial operando em **modo single-tenant** para implantação simplificada e otimização de custos. Apresenta aplicação configurável de políticas, recuperação de conhecimento baseada em RAG, capacidades de agentes autônomos e cadeia de prioridade de 5 níveis com balanceamento multi-GPU. O sistema enfatiza **aplicação externalizada de políticas** - o modelo de IA central permanece irrestrito por padrão, com comportamento controlado através de prompts de sistema compostos e configuração em tempo de execução.

### 🎯 Principais Recursos

- ⚡ **Sistema de Fallback Automático** - Detecta recusas do provedor de LLM, busca na web livre, indexa no KB, responde sem censura
- 🤖 **Agentes Autônomos** - Framework ReAct com POMDP para conclusão de tarefas complexas
- 📚 **Base de Conhecimento RAG** - Busca híbrida semântica + lexical com embeddings vetoriais
- 🎨 **Processamento Multimodal** - Suporte para PDF, DOCX, XLSX, imagens, áudio, vídeo
- 🛡️ **Aplicação de Políticas** - Políticas de conteúdo externalizadas e configuráveis em tempo de execução
- 📊 **Monitoramento de Tokens em Tempo Real** - Rastreamento de nível empresarial com timezone brasileiro (America/Sao_Paulo) para cálculos precisos de datas locais
- 🆓 **Cadeia de 5 Níveis de LLM Grátis** - KB → Pool de GPU → APIs Grátis (Groq, Gemini, HF) → Busca Web → OpenAI (último recurso)
- 🎛️ **Painel Administrativo** - Branding limpo "AION" com navegação sidebar empresarial para gerenciamento completo do sistema
- 📦 **Gerenciamento de Datasets** - Interface pronta para produção para gerenciar datasets de treinamento com filtragem, busca, preview, download e operações em massa
- 🌍 **Deploy Multi-Cloud** - Implantação dupla em GCP + AWS com failover automático (100% free tier)

### 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      Sistema AION                            │
├─────────────────────────────────────────────────────────────┤
│  Interface de Chat       │      Painel Administrativo       │
│  (Usuários Finais)       │      (Gerenciamento de Políticas)│
├──────────────────────────┼──────────────────────────────────┤
│          Pipeline de Enforcement & Auto-Fallback             │
│  • Compositor de Prompt  • Detecção de Recusa               │
│  • Moderador de Saída    • Busca Web & Indexação KB         │
├─────────────────────────────────────────────────────────────┤
│                    Serviços Principais                       │
│  Cliente LLM │ Serviço RAG │ Motor de Agente │ Armazenamento│
├─────────────────────────────────────────────────────────────┤
│              Integrações Externas                            │
│  API OpenAI  │  PostgreSQL Neon  │  DuckDuckGo Search       │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Início Rápido

### Pré-requisitos

- **Node.js** 20+
- **PostgreSQL** 15+ (ou Neon serverless)
- **Chave API OpenAI** (para completions LLM e embeddings)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/filipeguerrrabr/AionSupreme.git
cd AionSupreme

# Instale as dependências
npm install

# Configure as variáveis de ambiente
# Crie um arquivo .env com:
# - DATABASE_URL=postgresql://...
# - OPENAI_API_KEY=sk-...
# - SESSION_SECRET=sua-chave-secreta

# Inicialize o banco de dados
npm run db:push

# Inicie o servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:5000`.

## 📚 Documentação

### Documentação Principal

- [**Guia de Arquitetura**](./docs/ARCHITECTURE.md) - Design do sistema, componentes e decisões técnicas
- [**Sistema de Fallback Automático**](./docs/AUTOMATIC_FALLBACK.md) - Detecção de recusa e busca web autônoma
- [**Índice dos PDFs**](./docs/INDEX.md) - Guia completo para os 19 PDFs técnicos
- [**Referência da API**](./docs/API.md) - Endpoints da API REST e uso
- [**Guia de Deploy**](./GOOGLE_COLAB_DEPLOYMENT.md) - Instruções de deploy no Google Colab com GPU

### PDFs Técnicos (19 Partes)

Documentação técnica completa cobrindo:
- **Partes 1-2**: Fundamentos teóricos (Transformer, MoE, LoRA, RLHF, leis de escalonamento)
- **Partes 3.1-3.4**: Arquitetura do sistema (multimodal, RAG, agentes, deploy)
- **Partes 4-16**: Detalhes de implementação, provas matemáticas, guias práticos

Todos os PDFs estão organizados em [`docs/pdfs/`](./docs/pdfs/).

## 🎯 Recursos Principais

### 1. Sistema de Fallback Automático ⚡ NOVO

Quando a OpenAI recusa uma solicitação devido a políticas internas, o AION automaticamente:
1. **Detecta a recusa** usando 11+ regras de correspondência de padrões
2. **Busca na web livre** (DuckDuckGo) por informações irrestritas
3. **Busca conteúdo completo** das 3 principais fontes (~100KB cada)
4. **Indexa na base de conhecimento** para consultas futuras
5. **Gera resposta sem censura** usando contexto recuperado

**Ativação**: Apenas quando o sistema está em modo IRRESTRITO (sem regras de política habilitadas).

```javascript
// Exemplo de resposta da API com fallback
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Resposta direta usando fontes web..."
    }
  }],
  "fallback": {
    "used": true,
    "sourcesIndexed": 3,
    "searchQuery": "bibliotecas de criptografia"
  }
}
```

### 2. Agentes Autônomos (ReAct + POMDP)

Agentes podem completar autonomamente tarefas complexas usando:
- **Ferramentas**: Busca web, busca na base de conhecimento, execução de código
- **Planejamento**: Decomposição hierárquica de objetivos
- **Raciocínio**: Ciclos Pensamento → Ação → Observação

### 3. Base de Conhecimento RAG

Busca híbrida combinando:
- **Semântica**: Embeddings OpenAI com similaridade cosseno
- **Lexical**: BM25 para correspondência de palavras-chave
- **Re-ranking**: MMR para evitar redundância

### 4. Pipeline de Aplicação de Políticas

Políticas configuráveis em tempo de execução:
- Restrições de conteúdo (discurso de ódio, violência, palavrões, etc.)
- Traços de personalidade (humor, tom, formalidade)
- Parâmetros LLM (temperatura, top-p, top-k)
- Ações em violação: recusar, redatar ou reescrever

**REGRA FUNDAMENTAL**: O sistema **nasce irrestrito** (todas as regras = false). Restrições apenas se aplicam quando configuradas manualmente via painel administrativo.

## 🛠️ Stack Tecnológica

### Backend
- **Node.js** + TypeScript + Express
- **PostgreSQL** (Neon serverless) + Drizzle ORM
- **Timezone**: America/Sao_Paulo (Brasília, Brasil) para cálculos precisos de datas locais
- **API OpenAI** (GPT-4, embeddings)
- **DuckDuckGo** (busca web via scraping HTML)

### Frontend
- **React 18** + TypeScript
- **Vite** (ferramenta de build e servidor dev)
- **TanStack Query** (estado do servidor)
- **Radix UI** + **shadcn/ui** (componentes)
- **Tailwind CSS** (estilização)

### Infraestrutura
- **Replit** (plataforma principal de desenvolvimento)
- **Google Colab** (deploy opcional com GPU)
- **Prometheus** (exportação de métricas)

## 📊 Schema do Banco de Dados

9 tabelas principais:
- `tenants` - Configuração de tenant (modo single-tenant por padrão)
- `policies` - Definições de políticas JSON/YAML
- `conversations` - Histórico de chat
- `messages` - Mensagens individuais
- `documents` - Arquivos enviados para RAG
- `embeddings` - Embeddings vetoriais para busca semântica
- `tool_executions` - Trilha de auditoria de chamadas de ferramentas do agente
- `metrics` - Rastreamento de desempenho e custo
- `audit_logs` - Logs imutáveis com hashes SHA-256

## 🔐 Variáveis de Ambiente

```bash
# Banco de Dados
DATABASE_URL=postgresql://usuario:senha@host:5432/nomedb

# OpenAI
OPENAI_API_KEY=sk-...

# Sessão
SESSION_SECRET=sua-chave-secreta-aleatoria
```

## 🧪 Testes

```bash
# Execute os testes do sistema de fallback
npm run test:fallback

# Saídas dos testes:
# ✅ Detecção de Recusa: 100% de precisão
# ✅ Busca Web: 3 URLs encontradas
# ✅ Lógica de Fallback: Ativa apenas em modo IRRESTRITO
```

## 📈 Métricas & Observabilidade

Métricas compatíveis com Prometheus em `/metrics`:
- Percentis de latência (p50, p95, p99)
- Throughput (solicitações/seg, tokens/seg)
- Taxas de acerto de cache
- Estimativas de custo (USD)
- Taxas de erro

## 🤝 Contribuindo

Este é um projeto de pesquisa e educacional. Contribuições bem-vindas para:
- Melhorar padrões de detecção de recusa
- Adicionar novas ferramentas de agente
- Aprimorar processamento multimodal
- Otimizar busca vetorial

## 📄 Licença

Licença MIT - veja o arquivo [LICENSE](./LICENSE) para detalhes.

## 🙏 Agradecimentos

Construído em cima de:
- **OpenAI** - Completions LLM e embeddings
- **Neon** - PostgreSQL serverless
- **Replit** - Plataforma de desenvolvimento
- **shadcn/ui** - Componentes de UI bonitos

---

## 🔗 Links

- **Documentação**: [`docs/`](./docs/)
- **PDFs Técnicos**: [`docs/pdfs/`](./docs/pdfs/)
- **Status de Produção**: [PRODUCTION_STATUS.md](./PRODUCTION_STATUS.md)
- **Guia de Deploy**: [GOOGLE_COLAB_DEPLOYMENT.md](./GOOGLE_COLAB_DEPLOYMENT.md)

---

**Feito com ❤️ para pesquisa em IA autônoma**
