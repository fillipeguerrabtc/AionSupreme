# AION - Sistema de IA Autônomo

[![Licença: MIT](https://img.shields.io/badge/Licença-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)

[**Português**](#português) | [**English**](./README_PT-BR.md)

---

## 🌟 Visão Geral

**AION** é um **sistema de IA autônomo** de nível empresarial operando em **modo single-tenant** para implantação simplificada e otimização de custos. Apresenta aplicação configurável de políticas, recuperação de conhecimento baseada em RAG, capacidades de agentes autônomos e uma cadeia de prioridade de 5 níveis com balanceamento de carga multi-GPU. O sistema enfatiza **aplicação externalizada de políticas** - o modelo central de IA permanece irrestrito por padrão, com comportamento controlado através de prompts de sistema composáveis e configuração em tempo de execução.

### 🎯 Recursos Principais

- ⚡ **Sistema de Fallback Automático** - Detecta recusas de provedores LLM, busca na web gratuita, indexa na KB, responde sem censura
- 🤖 **Agentes Autônomos** - Framework ReAct com POMDP para conclusão de tarefas complexas
- 📚 **Base de Conhecimento RAG** - Busca híbrida semântica + lexical com embeddings vetoriais
- 🎨 **Processamento Multimodal** - Suporte a PDF, DOCX, XLSX, imagens, áudio, vídeo
- 🛡️ **Aplicação de Políticas** - Políticas de conteúdo externalizadas e configuráveis em runtime
- 📊 **Monitoramento de Tokens em Tempo Real** - Rastreamento de nível empresarial com fuso horário do Brasil (America/Sao_Paulo) para cálculos de data local precisos
- 🆓 **Cadeia de 5 Níveis de LLMs Gratuitos** - KB → Pool de GPU → APIs Gratuitas (Groq, Gemini, HF) → Busca Web → OpenAI (último recurso)
- 🎮 **Sistema de Pool de GPU** - 10 GPUs gratuitas simultâneas (Colab + Kaggle) com gerenciamento inteligente de quota, auto-desligamento e rotação 24/7 (~70-80 horas GPU/dia a custo zero)
- 🎛️ **Painel Administrativo** - Marca limpa "AION" com navegação lateral empresarial (15 seções) para gerenciamento completo do sistema
- 📦 **Gerenciamento de Datasets** - Interface pronta para produção para gerenciar datasets de treinamento com filtragem, busca, preview, download e operações em massa
- 👁️ **Sistema de Visão** - Monitoramento multi-provedor com cascata de 5 níveis (Gemini, GPT-4V, Claude3, HuggingFace, OpenAI) e rastreamento de quota em tempo real
- 🔍 **Busca de Imagens na KB** - Busca de imagens com IA semântica usando descrições geradas por visão com suporte multilíngue
- 🌍 **Implantação Multi-Nuvem** - Implantação dupla em GCP + AWS com failover automático (100% free tier)

### 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                      Sistema AION                            │
├─────────────────────────────────────────────────────────────┤
│  Interface de Chat      │      Painel Administrativo         │
│  (Usuários Finais)      │      (Gerenciamento de Políticas)  │
├──────────────────────────┼──────────────────────────────────┤
│         Pipeline de Aplicação & Auto-Fallback                │
│  • Compositor de Prompts   • Detecção de Recusa              │
│  • Moderador de Saída      • Busca Web & Indexação KB        │
├─────────────────────────────────────────────────────────────┤
│                    Serviços Principais                        │
│  Cliente LLM  │  Serviço RAG  │  Motor de Agente  │  Storage │
├─────────────────────────────────────────────────────────────┤
│              Integrações Externas                            │
│  API OpenAI  │  Neon PostgreSQL  │  Busca DuckDuckGo         │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Início Rápido

### Pré-requisitos

- **Node.js** 20+ 
- **PostgreSQL** 15+ (ou Neon serverless)
- **Chave API OpenAI** (para completions LLM e embeddings)

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/filipeguerrrabr/AionSupreme.git
cd AionSupreme

# Instalar dependências
npm install

# Configurar variáveis de ambiente
# Criar arquivo .env com:
# - DATABASE_URL=postgresql://...
# - OPENAI_API_KEY=sk-...
# - SESSION_SECRET=sua-chave-secreta

# Inicializar banco de dados
npm run db:push

# Iniciar servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:5000`.

## 📚 Documentação

### Documentação Principal

- 📖 [**Guia do Desenvolvedor**](./docs/GUIA_DESENVOLVEDOR.md) - Documentação técnica completa (115KB)
- 🏗️ [**Guia de Arquitetura**](./docs/ARCHITECTURE.md) - Design do sistema e decisões técnicas
- 📡 [**Referência da API**](./docs/API.md) - Endpoints REST e schemas
- 🎮 [**Configuração GPU Workers**](./docs/GPU_WORKERS_SETUP_GUIDE.md) - Setup completo de 10 GPUs gratuitas
- 📋 [**Informações do Projeto**](./replit.md) - Arquitetura, preferências e convenções

## 🎯 Recursos Principais

### 1. Sistema de Fallback Automático ⚡ NOVO

Quando OpenAI recusa uma requisição devido a políticas internas, AION automaticamente:
1. **Detecta recusa** usando 11+ regras de correspondência de padrões
2. **Busca na web gratuita** (DuckDuckGo) por informação irrestrita
3. **Obtém conteúdo completo** das 3 principais fontes (~100KB cada)
4. **Indexa na base de conhecimento** para consultas futuras
5. **Gera resposta sem censura** usando contexto recuperado

**Ativação**: Apenas quando sistema está em modo UNRESTRICTED (nenhuma regra de política ativada).

```javascript
// Exemplo de resposta de API com fallback
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "Resposta direta usando fontes da web..."
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

Agentes podem concluir autonomamente tarefas complexas usando:
- **Ferramentas**: Busca web, busca na base de conhecimento, execução de código
- **Planejamento**: Decomposição hierárquica de objetivos
- **Raciocínio**: Ciclos Pensamento → Ação → Observação

### 3. Base de Conhecimento RAG

Busca híbrida combinando:
- **Semântica**: Embeddings OpenAI com similaridade de cosseno
- **Lexical**: BM25 para correspondência de palavras-chave
- **Re-ranking**: MMR para evitar redundância

### 4. Pipeline de Aplicação de Políticas

Políticas configuráveis em runtime:
- Restrições de conteúdo (discurso de ódio, violência, profanidade, etc.)
- Traços de personalidade (humor, tom, formalidade)
- Parâmetros LLM (temperature, top-p, top-k)
- Ações em violação: recusar, ocultar ou reescrever

**REGRA FUNDAMENTAL**: Sistema **nasce irrestrito** (todas regras = false). Restrições só se aplicam quando configuradas manualmente via painel admin.

## 🛠️ Stack Tecnológico

### Backend
- **Node.js** + TypeScript + Express
- **PostgreSQL** (Neon serverless) + Drizzle ORM  
- **Fuso Horário**: America/Sao_Paulo (Brasília, Brasil) para cálculos de data local precisos
- **API OpenAI** (GPT-4, embeddings)
- **DuckDuckGo** (busca web via scraping HTML)

### Frontend
- **React 18** + TypeScript
- **Vite** (ferramenta de build e servidor dev)
- **TanStack Query** (estado do servidor)
- **Radix UI** + **shadcn/ui** (componentes)
- **Tailwind CSS** (estilização)

### Infraestrutura
- **Replit** (plataforma primária de desenvolvimento)
- **Google Colab** (implantação opcional de GPU)
- **Prometheus** (exportação de métricas)

## 📊 Schema do Banco de Dados

9 tabelas principais:
- `tenants` - Configuração do sistema (apenas single-tenant)
- `policies` - Definições de políticas JSON/YAML
- `conversations` - Histórico de chat
- `messages` - Mensagens individuais
- `documents` - Arquivos enviados para RAG
- `embeddings` - Embeddings vetoriais para busca semântica
- `tool_executions` - Trilha de auditoria de chamadas de ferramentas de agentes
- `metrics` - Rastreamento de desempenho e custos
- `audit_logs` - Logs imutáveis com hashes SHA-256

## 🔐 Variáveis de Ambiente

```bash
# Banco de Dados
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# OpenAI
OPENAI_API_KEY=sk-...

# Sessão
SESSION_SECRET=sua-chave-secreta-aleatória
```

## 🧪 Testes

```bash
# Executar testes do sistema de fallback
npm run test:fallback

# Saídas de teste:
# ✅ Detecção de Recusa: 100% de precisão
# ✅ Busca Web: 3 URLs encontradas
# ✅ Lógica de Fallback: Ativa apenas em modo UNRESTRICTED
```

## 📈 Métricas & Observabilidade

Métricas compatíveis com Prometheus em `/metrics`:
- Percentis de latência (p50, p95, p99)
- Throughput (requisições/s, tokens/s)
- Taxa de acerto de cache
- Estimativas de custo (USD)
- Taxa de erros

## 🤝 Contribuindo

Este é um projeto de pesquisa e educacional. Contribuições bem-vindas para:
- Melhorar padrões de detecção de recusa
- Adicionar novas ferramentas de agentes
- Aprimorar processamento multimodal
- Otimizar busca vetorial

## 📄 Licença

Licença MIT - veja arquivo [LICENSE](./LICENSE) para detalhes.

## 🙏 Agradecimentos

Construído em cima de:
- **OpenAI** - Completions LLM e embeddings
- **Neon** - PostgreSQL Serverless
- **Replit** - Plataforma de desenvolvimento
- **shadcn/ui** - Componentes UI bonitos

---

## 🎮 Sistema de Pool de GPU (Fase 2)

AION inclui um **pool de GPU totalmente autônomo** com inferência de custo zero usando Google Colab e Kaggle:

### Recursos:
- ✅ **10 Workers Simultâneos** (5 Colab + 5 Kaggle)
- ✅ **~70-80 horas GPU/dia** a custo zero
- ✅ **Gerenciamento Inteligente de Quota** - Usa apenas 70% da quota (margem de segurança de 30%)
- ✅ **Auto-Desligamento** - Notebooks encerram 30min antes dos limites do Google
- ✅ **Balanceamento Round-Robin** - Rotação automática entre workers
- ✅ **Cobertura 24/7** - Agendamento otimizado para disponibilidade contínua

### Configuração Rápida:
```bash
# 1. Upload notebooks para Google Colab/Kaggle
notebooks/colab_worker.ipynb   → 5 contas Google
notebooks/kaggle_worker.ipynb  → 5 contas Google

# 2. Configurar cada notebook
AION_URL = "https://sua-url-aion.replit.app"

# 3. Clicar "Run All" (30 segundos por worker)
# 4. Fechar navegador - workers rodam na nuvem!

# Auto-desligamento após:
# - Colab: 11.5h (limite Google: 12h)
# - Kaggle: 8.5h (limite Google: 9h)
```

### Documentação:
- 📖 **Guia de Setup GPU**: [docs/GPU_WORKERS_SETUP_GUIDE.md](./docs/GPU_WORKERS_SETUP_GUIDE.md)
- 🚀 **Estratégia GPU Gratuita**: [docs/FREE_GPU_API_STRATEGY.md](./docs/FREE_GPU_API_STRATEGY.md)

### Endpoints da API:
```bash
POST /api/gpu/workers/register   # Registro de worker
POST /api/gpu/workers/heartbeat  # Keep-alive (60s)
GET  /api/gpu/workers             # Listar todos workers
GET  /api/gpu/quota/status        # Rastreamento de quota em tempo real
POST /api/gpu/quota/record        # Registrar uso após jobs
```

**ROI**: Economia de ~$18-29k/ano vs. serviços de GPU cloud pagos! 🚀

---

## 🔗 Links Importantes

- 📁 **Documentação Técnica**: [`docs/`](./docs/)
- 📋 **Informações do Projeto**: [replit.md](./replit.md)
- 🎮 **Setup GPU Workers**: [docs/GPU_WORKERS_SETUP_GUIDE.md](./docs/GPU_WORKERS_SETUP_GUIDE.md)
- 🏗️ **Arquitetura do Sistema**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- 📖 **Guia Completo**: [docs/GUIA_DESENVOLVEDOR.md](./docs/GUIA_DESENVOLVEDOR.md)

---

**Feito com ❤️ para pesquisa de IA autônoma**
