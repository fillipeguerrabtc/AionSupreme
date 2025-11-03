# 🧠 GUIA COMPLETO: Sistema Multi-Agente Hierárquico do AION

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Conceitos Fundamentais](#conceitos-fundamentais)
3. [Arquitetura Hierárquica](#arquitetura-hierárquica)
4. [Funcionamento do Roteamento](#funcionamento-do-roteamento)
5. [Exemplos Práticos](#exemplos-práticos)
6. [Implementação Técnica](#implementação-técnica)
7. [Boas Práticas](#boas-práticas)
8. [FAQ](#faq)

---

## 🎯 Visão Geral

O AION utiliza uma **arquitetura multi-agente hierárquica** baseada em **Mixture of Experts (MoE)** com roteamento inteligente via LLM. O sistema organiza agentes especializados em uma estrutura de árvore, permitindo:

- **Especialização profunda**: Cada agente domina um conjunto específico de conhecimentos
- **Roteamento inteligente**: Sistema identifica automaticamente o melhor agente para cada pergunta
- **Escalabilidade horizontal**: Adicione novos agentes sem modificar código
- **RAG isolado**: Cada agente tem acesso a knowledge bases específicas

---

## 📚 Conceitos Fundamentais

### 1. Namespaces (Espaços de Conhecimento)

**O que são?**
Namespaces são "pastas" hierárquicas que organizam o conhecimento. São similares a diretórios em um sistema de arquivos.

**Estrutura hierárquica:**
```
📁 tecnologia (namespace raiz)
  ├─ 📁 tecnologia/backend (sub-namespace)
  ├─ 📁 tecnologia/frontend (sub-namespace)
  └─ 📁 tecnologia/mobile (sub-namespace)

📁 financas (namespace raiz)
  ├─ 📁 financas/investimentos (sub-namespace)
  └─ 📁 financas/impostos (sub-namespace)
```

**Características:**
- Separador: `/` (barra) indica hierarquia
- Cada namespace pode ter documentos, imagens e conhecimento específico
- Suporta múltiplos níveis: `empresa/ti/backend/apis/rest`

**No banco de dados:**
```sql
-- Tabela: namespaces
name: "tecnologia/backend"  -- Serve como ID único e path hierárquico
description: "Conhecimento sobre backend, APIs, bancos de dados"
icon: "Server"  -- Ícone Lucide React
```

### 2. Tipos de Agentes

#### 🌍 **Generalista** (`type: "generalist"`)
- **Função**: Responde qualquer pergunta, sem especialização
- **Namespace**: Não possui (acessa conhecimento geral)
- **Uso**: Perguntas genéricas ou quando nenhum especialista serve
- **Exemplo**: "Assistente AION"

#### 🎯 **Especialista - Agent Tier** (`type: "specialist"`, `agent_tier: "agent"`)
- **Função**: Especialista em um domínio específico (raiz)
- **Namespace**: Vinculado a 1 namespace raiz (ex: `tecnologia`)
- **Uso**: Perguntas sobre o domínio inteiro
- **Exemplo**: "Agente Tech" → domínio `tecnologia`

#### 🔬 **Especialista - SubAgent Tier** (`type: "specialist"`, `agent_tier: "subagent"`)
- **Função**: Especialista ultra-focado em sub-domínio
- **Namespace**: Vinculado a 1+ sub-namespaces (ex: `tecnologia/backend`)
- **Uso**: Perguntas muito específicas dentro de um domínio
- **Exemplo**: "Especialista Backend" → sub-domínio `tecnologia/backend`

### 3. Tiers (Hierarquia de Agentes)

```
┌─────────────────────────────────────────┐
│  👤 GENERALISTA                         │
│  "Assistente AION"                      │
│  Sem namespace, conhecimento geral      │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  🌲 AGENT TIER (Root Specialist)        │
│  "Agente Tech"                          │
│  Namespace: tecnologia                  │
└─────────────────────────────────────────┘
              ↓
    ┌─────────┴─────────┐
    ↓                   ↓
┌──────────────┐  ┌──────────────┐
│ 🔬 SUBAGENT  │  │ 🔬 SUBAGENT  │
│ "Esp.Backend"│  │ "Esp.Frontend"│
│ tecnologia/  │  │ tecnologia/  │
│   backend    │  │   frontend   │
└──────────────┘  └──────────────┘
```

---

## 🏗️ Arquitetura Hierárquica

### Estrutura no Banco de Dados

#### Tabela `agents`
```typescript
{
  id: "backend-specialist-001",
  name: "Especialista Backend",
  slug: "especialista-backend",
  type: "specialist",           // specialist | generalist
  agent_tier: "subagent",        // agent | subagent
  assigned_namespaces: ["tecnologia/backend"], // Array JSON
  description: "Expert em APIs REST, GraphQL, SQL...",
  system_prompt: "Você é especialista em backend...",
  rag_namespaces: ["tecnologia/backend"], // LEGACY
  policy: {
    allowedTools: ["KB.Search", "SearchWeb"],
    perRequestBudgetUSD: 0.50
  }
}
```

#### Tabela `namespaces`
```typescript
{
  id: "04f46e27-fc0a-4c09-bd34-285296b77be0",
  name: "tecnologia/backend",   // Path hierárquico único
  description: "Conhecimento backend",
  icon: "Server"
}
```

### Relação Agent ↔ Namespace

```
┌────────────────┐      assigned_namespaces      ┌─────────────────┐
│    AGENTS      │◄──────────────────────────────┤   NAMESPACES    │
├────────────────┤        (JSON array)           ├─────────────────┤
│ Agente Tech    │  →  ["tecnologia"]            │ tecnologia      │
│ Esp. Backend   │  →  ["tecnologia/backend"]    │ tecnologia/     │
│ Esp. Frontend  │  →  ["tecnologia/frontend"]   │   backend       │
│ Assistente AION│  →  []  (sem namespace)       │ tecnologia/     │
│                │                                │   frontend      │
└────────────────┘                                └─────────────────┘
```

---

## 🚦 Funcionamento do Roteamento

### Fluxo Completo (Mixture of Experts)

```
1. 👤 Usuário: "Como criar uma API REST em Node.js?"
        ↓
2. 🤖 ORCHESTRATOR (MoE Router)
   - Carrega todos os agentes disponíveis
   - Monta contexto: nome, descrição, namespaces
   - Chama GPT-4 para classificar a intenção
        ↓
3. 🧠 GPT-4 DECISION (Intent Classification)
   Input:
   ```
   Agentes disponíveis:
   1. Assistente AION (generalista)
   2. Agente Tech (tecnologia) 
   3. Especialista Backend (tecnologia/backend)
   
   Pergunta: "Como criar uma API REST em Node.js?"
   ```
   Output:
   ```json
   {
     "selectedAgent": "especialista-backend",
     "confidence": 0.95,
     "reasoning": "API REST é backend, Node.js é backend"
   }
   ```
        ↓
4. ✅ EXECUÇÃO DO AGENTE SELECIONADO
   - Carrega system_prompt do "Especialista Backend"
   - Busca RAG apenas no namespace "tecnologia/backend"
   - Executa ferramentas permitidas (KB.Search, Web)
   - Gera resposta especializada
        ↓
5. 📊 MONITORING & TELEMETRIA
   - Registra query_monitoring (latência, sucesso/erro)
   - Registra usage_tracking (agente usado, namespace buscado)
   - Salva tokens consumidos (token_usage)
        ↓
6. 📝 HITL CURATION (Background)
   - Avalia qualidade da resposta
   - Se > threshold → envia para curation_queue
   - Aguarda aprovação humana antes de indexar na KB
        ↓
7. 💬 RESPOSTA AO USUÁRIO
   {
     "response": "Para criar uma API REST em Node.js...",
     "metadata": {
       "agentsUsed": ["Especialista Backend"],
       "source": "multi-agent",
       "totalLatency": 1200
     }
   }
```

### Código Simplificado do Orchestrator

```typescript
// server/agent/orchestrator.ts
async function routeToAgent(query: string) {
  // 1. Carregar agentes
  const agents = await loadAllAgents();
  
  // 2. Montar contexto
  const agentContext = agents.map(a => ({
    id: a.slug,
    name: a.name,
    description: a.description,
    namespaces: a.assignedNamespaces
  }));
  
  // 3. LLM Classification
  const decision = await llm.classify({
    agents: agentContext,
    query: query
  });
  
  // 4. Executar agente selecionado
  const selectedAgent = agents.find(a => a.slug === decision.selectedAgent);
  const response = await executeAgent(selectedAgent, query);
  
  // 5. Telemetria
  await trackUsage(selectedAgent, query, response);
  
  return response;
}
```

---

## 💡 Exemplos Práticos

### Exemplo 1: Estrutura Completa - Empresa Tech

```
📁 Namespaces Hierárquicos:
tecnologia
├─ tecnologia/backend
│  ├─ tecnologia/backend/nodejs
│  └─ tecnologia/backend/python
├─ tecnologia/frontend
│  ├─ tecnologia/frontend/react
│  └─ tecnologia/frontend/vue
└─ tecnologia/mobile
   ├─ tecnologia/mobile/ios
   └─ tecnologia/mobile/android

👥 Agentes:
- Assistente AION (generalista, sem namespace)
- Agente Tech (agent tier, namespace: tecnologia)
  ├─ Especialista Backend (subagent, tecnologia/backend)
  │  ├─ Expert Node.js (subagent, tecnologia/backend/nodejs)
  │  └─ Expert Python (subagent, tecnologia/backend/python)
  ├─ Especialista Frontend (subagent, tecnologia/frontend)
  └─ Especialista Mobile (subagent, tecnologia/mobile)
```

### Exemplo 2: Roteamento de Perguntas

| Pergunta | Agente Selecionado | Tier | Namespace Buscado |
|----------|-------------------|------|-------------------|
| "Qual a capital da França?" | Assistente AION | generalista | (nenhum) |
| "O que é computação em nuvem?" | Agente Tech | agent | `tecnologia` |
| "Como fazer async/await em Node.js?" | Expert Node.js | subagent | `tecnologia/backend/nodejs` |
| "Diferença entre React e Vue?" | Especialista Frontend | subagent | `tecnologia/frontend` |

### Exemplo 3: RAG Isolado por Namespace

```typescript
// Usuário pergunta: "Como usar useState em React?"

// 1. Roteador escolhe: "Especialista Frontend"
selectedAgent = {
  name: "Especialista Frontend",
  assigned_namespaces: ["tecnologia/frontend"]
}

// 2. RAG busca APENAS em "tecnologia/frontend"
const docs = await searchKnowledgeBase({
  query: "useState React",
  namespaces: ["tecnologia/frontend"], // ← Filtro automático
  limit: 5
});

// 3. Documentos de outros namespaces são IGNORADOS
// ✅ tecnologia/frontend/react-hooks.md → INCLUÍDO
// ❌ tecnologia/backend/nodejs-async.md → EXCLUÍDO
// ❌ financas/investimentos.md → EXCLUÍDO
```

---

## ⚙️ Implementação Técnica

### 1. Criando um Novo Namespace

```sql
-- Via SQL direto
INSERT INTO namespaces (name, description, icon) VALUES 
  ('educacao', 'Conhecimento educacional', 'GraduationCap'),
  ('educacao/matematica', 'Matemática do ensino básico ao superior', 'Calculator');

-- Ou via Admin Dashboard → Knowledge Base → Namespaces → Add
```

### 2. Criando um Novo Agente

```sql
INSERT INTO agents (
  id, 
  name, 
  slug, 
  type, 
  agent_tier, 
  assigned_namespaces,
  description,
  system_prompt
) VALUES (
  'math-specialist-001',
  'Professor de Matemática',
  'professor-matematica',
  'specialist',
  'subagent',
  '["educacao/matematica"]'::jsonb,
  'Especialista em ensino de matemática, álgebra, cálculo, geometria',
  'Você é um professor de matemática experiente. Explique conceitos de forma didática com exemplos práticos.'
);
```

### 3. Estrutura de Diretórios no Código

```
server/
├─ agent/
│  ├─ orchestrator.ts     # MoE Router (LLM-based)
│  ├─ registry.ts         # Carrega agentes do DB
│  └─ runtime.ts          # Executa agente selecionado
├─ rag/
│  └─ retriever.ts        # Busca com filtro de namespace
└─ monitoring/
   ├─ query-monitor.ts    # Latência p50/p95/p99
   └─ usage-tracker.ts    # Contadores por agent/namespace
```

---

## ✅ Boas Práticas

### Estruturação de Namespaces

✅ **BOM:**
```
tecnologia/backend/apis
tecnologia/backend/databases
tecnologia/frontend/react
```

❌ **RUIM:**
```
backend-apis              # Sem hierarquia
tech-front-react          # Não segue padrão /
tecnologia_backend_apis   # Usa _ em vez de /
```

### Nomeação de Agentes

✅ **BOM:**
- Nome claro e específico: "Especialista em React Hooks"
- Slug sem espaços: `especialista-react-hooks`
- Description detalhada: "Expert em hooks customizados, useEffect, useState, context API"

❌ **RUIM:**
- Nome genérico: "Agente 1"
- Slug confuso: `ag1_react`
- Description vaga: "Sabe React"

### Vinculação Agent ↔ Namespace

✅ **BOM:**
```typescript
// Agent tier: 1 namespace raiz
assigned_namespaces: ["tecnologia"]

// SubAgent tier: 1+ sub-namespaces
assigned_namespaces: ["tecnologia/backend", "tecnologia/backend/nodejs"]
```

❌ **RUIM:**
```typescript
// SubAgent com namespace raiz (deveria ser agent tier)
agent_tier: "subagent",
assigned_namespaces: ["tecnologia"]  // ← ERRADO

// Namespaces não relacionados
assigned_namespaces: ["tecnologia/backend", "financas/impostos"]  // ← EVITAR
```

### System Prompts Efetivos

✅ **BOM:**
```
Você é um especialista em desenvolvimento backend com Node.js e Express.
Sua expertise inclui:
- Design de APIs REST e GraphQL
- Integração com bancos de dados SQL (PostgreSQL) e NoSQL (MongoDB)
- Autenticação JWT e OAuth2
- Práticas de segurança e performance

Sempre forneça exemplos de código TypeScript.
Foque em boas práticas de arquitetura limpa.
```

❌ **RUIM:**
```
Você é um assistente.
Ajude com perguntas sobre programação.
```

---

## ❓ FAQ

### 1. Qual a diferença entre `agent_tier` e `type`?

- **`type`**: Define se é especialista (`specialist`) ou generalista (`generalist`)
  - Generalista: Responde tudo, sem expertise
  - Especialista: Focado em domínio específico
  
- **`agent_tier`**: Define nível hierárquico (apenas para `specialist`)
  - `agent`: Especialista em namespace raiz (ex: `tecnologia`)
  - `subagent`: Especialista em sub-namespace (ex: `tecnologia/backend`)

### 2. Posso ter múltiplos generalistas?

Sim, mas é raro! Geralmente você tem 1 generalista principal (ex: "Assistente AION") e vários especialistas. Múltiplos generalistas competiriam pelo mesmo espaço.

### 3. SubAgents podem ter sub-subagents?

**Sim!** A hierarquia suporta múltiplos níveis:

```
Agente Tech (agent, "tecnologia")
  └─ Especialista Backend (subagent, "tecnologia/backend")
      └─ Expert Node.js (subagent, "tecnologia/backend/nodejs")
          └─ Especialista Express (subagent, "tecnologia/backend/nodejs/express")
```

### 4. Como o sistema escolhe entre agentes similares?

O **LLM (GPT-4) decide** baseado em:
- Descrição do agente
- Namespaces atribuídos
- Contexto da pergunta

Exemplo:
```
Pergunta: "Como fazer validação de dados em APIs?"

Candidatos:
1. Especialista Backend (tecnologia/backend)
2. Expert Node.js (tecnologia/backend/nodejs)

GPT-4 Decision:
→ Escolhe "Especialista Backend" (mais genérico)
  Reasoning: "Validação é conceito geral de backend, não específico de Node.js"
```

### 5. O que acontece se nenhum agente for adequado?

**Fallback para generalista:**
```typescript
if (decision.confidence < 0.6) {
  // Confiança baixa → usa generalista
  selectedAgent = assistenteAION;
}
```

### 6. Namespaces vazios são permitidos?

**Sim**, mas NÃO recomendado! Um namespace sem documentos indexados faz o RAG retornar vazio, prejudicando a qualidade da resposta.

**Solução**: Sempre adicione documentos via:
- Admin Dashboard → Knowledge Base → Documents
- Upload de arquivos (PDF, DOCX, TXT)
- Links/URLs para indexação

### 7. Como funciona a telemetria hierárquica?

```sql
-- Tabela: usage_tracking
SELECT 
  agent_tier,           -- "agent" | "subagent"
  namespace_tier,       -- "root" | "subnamespace"
  COUNT(*) as total_queries
FROM usage_tracking
WHERE agent_tier = 'subagent'
GROUP BY agent_tier, namespace_tier;

-- Resultado:
-- agent_tier | namespace_tier | total_queries
-- subagent   | subnamespace   | 1250
```

Isso permite analytics granulares:
- "Quantas queries foram para subagents?"
- "Qual sub-namespace mais usado?"
- "Agentes raiz vs subagents - qual mais eficiente?"

### 8. Posso ter um agente sem namespace?

**Sim, apenas para generalistas!**

```typescript
// ✅ Correto
{
  type: "generalist",
  assigned_namespaces: []
}

// ❌ Incorreto
{
  type: "specialist",  // Especialista DEVE ter namespace
  assigned_namespaces: []
}
```

---

## 🎓 Resumo Executivo

| Conceito | Definição | Exemplo |
|----------|-----------|---------|
| **Namespace** | Organização hierárquica de conhecimento | `tecnologia/backend` |
| **Generalista** | Agente sem especialização | "Assistente AION" |
| **Agent Tier** | Especialista em namespace raiz | "Agente Tech" → `tecnologia` |
| **SubAgent Tier** | Especialista ultra-focado em sub-domínio | "Esp. Backend" → `tecnologia/backend` |
| **MoE Routing** | LLM decide qual agente usar | GPT-4 classifica intenção |
| **RAG Isolado** | Busca apenas em namespaces do agente | Backend não vê docs de Frontend |
| **HITL** | Humano aprova antes de indexar na KB | Fila de curadoria manual |

---

## 📞 Próximos Passos

1. **Criar mais especialistas**: Use o Admin Dashboard para adicionar agentes
2. **Popular namespaces**: Adicione documentos relevantes em cada área
3. **Monitorar telemetria**: Veja quais agentes são mais usados
4. **Refinar system prompts**: Melhore a qualidade das respostas
5. **Adicionar ferramentas**: Configure `allowedTools` por agente

---

**Última atualização**: 2025-11-03  
**Versão**: 1.0.0  
**Autor**: Sistema AION  
**Status**: Produção ✅
