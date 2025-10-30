# AION - API Reference

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Autenticação](#autenticação)
3. [Chat & Completions](#chat--completions)
4. [Knowledge Base & RAG](#knowledge-base--rag)
5. [Agentes Autônomos](#agentes-autônomos)
6. [Admin & Políticas](#admin--políticas)
7. [Dataset Management](#dataset-management)
8. [Métricas & Observabilidade](#métricas--observabilidade)
9. [Multimodal](#multimodal)
10. [Códigos de Erro](#códigos-de-erro)
11. [Rate Limits](#rate-limits)

---

## 🌐 Visão Geral

**Base URL**: `http://localhost:5000` (desenvolvimento)

**Content-Type**: `application/json`

**Versão**: `v1`

Todos os endpoints da API estão sob `/api/v1/*` exceto endpoints admin (`/api/admin/*`) e métricas (`/metrics`).

---

## 🔐 Autenticação

### API Key (Opcional)

```http
POST /api/v1/chat/completions
X-API-Key: seu-api-key-aqui
Content-Type: application/json
```

**Nota**: Em desenvolvimento, autenticação é opcional. Em produção, use API keys por tenant.

**Obter API Key**: Via admin dashboard ou no log de seed do banco:
```
📋 Default API Key (save this): 52f9e3474908df56c58f585d4f24797c67a4baa7...
```

---

## 💬 Chat & Completions

### POST `/api/v1/chat/completions`

Gera uma resposta de chat usando o LLM.

#### Request

```json
{
  "tenant_id": 1,
  "messages": [
    {
      "role": "user",
      "content": "Explain quantum entanglement"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_web",
        "description": "Search the web for information",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string"
            }
          }
        }
      }
    }
  ],
  "stream": false
}
```

#### Request Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `tenant_id` | number | Não | ID do tenant (default: 1) |
| `messages` | array | Sim | Array de mensagens do chat |
| `messages[].role` | string | Sim | `"user"`, `"assistant"`, ou `"system"` |
| `messages[].content` | string | Sim | Conteúdo da mensagem |
| `tools` | array | Não | Ferramentas disponíveis para o LLM |
| `stream` | boolean | Não | Enable streaming (default: false) |

#### Response (Sucesso - 200)

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Quantum entanglement is a phenomenon where..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "promptTokens": 15,
    "completionTokens": 87,
    "totalTokens": 102
  },
  "fallback": {
    "used": false
  }
}
```

#### Response (com Fallback Automático)

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Based on information from Wikipedia and MIT OpenCourseWare..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "promptTokens": 2345,
    "completionTokens": 456,
    "totalTokens": 2801
  },
  "fallback": {
    "used": true,
    "sourcesIndexed": 3,
    "searchQuery": "quantum entanglement explanation"
  }
}
```

#### Campos de Resposta

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `choices[].message.content` | string | Resposta gerada |
| `choices[].finish_reason` | string | Razão de parada: `"stop"`, `"length"`, `"tool_calls"` |
| `usage.promptTokens` | number | Tokens do prompt |
| `usage.completionTokens` | number | Tokens da completion |
| `usage.totalTokens` | number | Total de tokens |
| `fallback.used` | boolean | Se fallback automático foi ativado |
| `fallback.sourcesIndexed` | number | Quantas fontes web foram indexadas (se fallback usado) |
| `fallback.searchQuery` | string | Query usada na busca web (se fallback usado) |

#### Erro (500)

```json
{
  "error": "OpenAI API error: Rate limit exceeded"
}
```

---

### POST `/api/v1/chat/multimodal`

Chat com anexos de arquivos (PDF, DOCX, imagens, etc.).

#### Request

```http
POST /api/v1/chat/multimodal
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="data"

{
  "tenant_id": 1,
  "messages": [
    {"role": "user", "content": "Summarize this document"}
  ]
}
--boundary
Content-Disposition: form-data; name="files"; filename="document.pdf"
Content-Type: application/pdf

[binary file content]
--boundary--
```

#### Request Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `data` | string (JSON) | Sim | JSON stringified com messages e tenant_id |
| `files` | file[] | Não | Array de arquivos (max: 5 arquivos) |

#### Response (200)

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "This document discusses three main points: 1) Transformer architecture..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "promptTokens": 1234,
    "completionTokens": 567,
    "totalTokens": 1801
  }
}
```

---

### POST `/api/v1/transcribe`

Transcreve áudio para texto usando Whisper.

#### Request

```http
POST /api/v1/transcribe
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="audio"; filename="recording.mp3"
Content-Type: audio/mpeg

[binary audio content]
--boundary
Content-Disposition: form-data; name="tenant_id"

1
--boundary--
```

#### Response (200)

```json
{
  "text": "This is the transcribed text from the audio file..."
}
```

---

## 📚 Knowledge Base & RAG

### POST `/api/kb/ingest`

Faz upload e indexa um documento na base de conhecimento.

#### Request

```http
POST /api/kb/ingest
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="research.pdf"
Content-Type: application/pdf

[binary file content]
--boundary
Content-Disposition: form-data; name="tenant_id"

1
--boundary--
```

#### Response (200)

```json
{
  "ok": true,
  "id": 42
}
```

#### Formatos Suportados
- PDF (`.pdf`)
- Word (`.docx`)
- Excel (`.xlsx`)
- XML (`.xml`)
- CSV (`.csv`)
- Images (`.png`, `.jpg`, `.jpeg`) - OCR

---

### POST `/api/kb/search`

Busca semântica na base de conhecimento.

#### Request

```json
{
  "query": "How does attention mechanism work?",
  "k": 10,
  "tenant_id": 1
}
```

#### Request Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `query` | string | Sim | Query de busca |
| `k` | number | Não | Número de resultados (default: 10) |
| `tenant_id` | number | Não | ID do tenant (default: 1) |

#### Response (200)

```json
{
  "results": [
    {
      "id": 123,
      "score": 0.924,
      "chunkText": "The attention mechanism allows the model to focus on...",
      "documentId": 42,
      "metadata": {
        "author": "Vaswani et al.",
        "title": "Attention Is All You Need"
      }
    },
    {
      "id": 456,
      "score": 0.887,
      "chunkText": "Multi-head attention computes attention multiple times...",
      "documentId": 43,
      "metadata": {}
    }
  ]
}
```

---

### GET `/api/documents`

Lista documentos indexados.

#### Request

```http
GET /api/documents?tenant_id=1
```

#### Response (200)

```json
{
  "documents": [
    {
      "id": 42,
      "tenantId": 1,
      "filename": "research.pdf",
      "mimeType": "application/pdf",
      "size": 1234567,
      "status": "indexed",
      "createdAt": "2025-10-28T15:30:00Z"
    }
  ]
}
```

---

## 🤖 Agentes Autônomos

### POST `/api/agent/plan_act`

Executa um agente autônomo com ReAct.

#### Request

```json
{
  "goal": "Research the latest developments in quantum computing and summarize the top 3 breakthroughs",
  "tenant_id": 1,
  "conversation_id": 1,
  "message_id": 1
}
```

#### Request Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `goal` | string | Sim | Objetivo do agente |
| `tenant_id` | number | Não | ID do tenant (default: 1) |
| `conversation_id` | number | Não | ID da conversa (para contexto) |
| `message_id` | number | Não | ID da mensagem original |

#### Response (200)

```json
{
  "status": "success",
  "steps": [
    {
      "thought": "I need to search for recent quantum computing breakthroughs",
      "action": "SearchWeb",
      "actionInput": {
        "query": "latest quantum computing breakthroughs 2025"
      },
      "observation": "Found 5 results:\n1. IBM announces 1000-qubit processor..."
    },
    {
      "thought": "Now I'll search the knowledge base for more details",
      "action": "KBSearch",
      "actionInput": {
        "query": "quantum computing qubits error correction"
      },
      "observation": "Found 3 relevant chunks..."
    },
    {
      "thought": "I have enough information to answer",
      "action": "Finish",
      "actionInput": {
        "answer": "Top 3 breakthroughs: 1) IBM's 1000-qubit processor..."
      },
      "observation": "Task completed"
    }
  ],
  "finalAnswer": "Top 3 breakthroughs in quantum computing:\n\n1. IBM's 1000-qubit processor..."
}
```

---

### POST `/api/agent/hierarchical_plan`

Planejamento hierárquico de tarefas complexas.

#### Request

```json
{
  "goal": "Build a REST API with authentication and deploy to production",
  "tenant_id": 1
}
```

#### Response (200)

```json
{
  "plan": {
    "goal": "Build a REST API with authentication and deploy to production",
    "subgoals": [
      {
        "id": 1,
        "description": "Design API architecture and endpoints",
        "dependencies": []
      },
      {
        "id": 2,
        "description": "Implement authentication system",
        "dependencies": [1]
      },
      {
        "id": 3,
        "description": "Write API endpoints",
        "dependencies": [1, 2]
      },
      {
        "id": 4,
        "description": "Deploy to production",
        "dependencies": [3]
      }
    ]
  },
  "executionResult": {
    "status": "completed",
    "steps": [...]
  }
}
```

---

## 🛡️ Admin & Políticas

### GET `/api/admin/policies/:tenant_id`

Obter política do tenant.

#### Request

```http
GET /api/admin/policies/1
```

#### Response (200)

```json
{
  "id": 1,
  "tenantId": 1,
  "policyName": "DEFAULT_UNRESTRICTED",
  "rules": {
    "hate_speech": false,
    "explicit_sexual": false,
    "self_harm": false,
    "political_extremism": false,
    "illicit_howto": false,
    "mild_profanity": false,
    "minor_violence": false
  },
  "onBlock": "refuse",
  "humor": "neutral",
  "tone": "professional",
  "behavior": {
    "verbosity": 0.7,
    "formality": 0.5,
    "creativity": 0.7,
    "precision": 0.8
  },
  "temperature": 0.7,
  "topP": 0.9,
  "topK": 40,
  "systemPrompt": "You are AION in UNRESTRICTED mode...",
  "maxTokensPerDay": 100000,
  "maxRequestsPerMinute": 60,
  "maxCostPerDay": 10.0,
  "enabledTools": ["SearchWeb", "KBSearch", "Exec"],
  "isActive": true
}
```

---

### POST `/api/admin/policies/:tenant_id`

Criar ou atualizar política do tenant.

#### Request

```json
{
  "policyName": "Custom Policy",
  "rules": {
    "hate_speech": true,
    "explicit_sexual": false,
    "self_harm": true,
    "political_extremism": false,
    "illicit_howto": false,
    "mild_profanity": false,
    "minor_violence": false
  },
  "onBlock": "refuse",
  "temperature": 0.8
}
```

#### Response (200)

```json
{
  "id": 1,
  "tenantId": 1,
  "policyName": "Custom Policy",
  "rules": {
    "hate_speech": true,
    ...
  },
  ...
}
```

---

### POST `/api/admin/index-pdfs`

Indexa os 19 PDFs técnicos na base de conhecimento.

#### Request

```json
{
  "tenant_id": 1
}
```

#### Response (200)

```json
{
  "success": true,
  "documentIds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
}
```

---

## 📦 Dataset Management

### GET `/api/training/datasets`

Lista todos os datasets de treinamento do tenant.

#### Request

```http
GET /api/training/datasets?tenantId=1
```

#### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| `tenantId` | number | Sim | ID do tenant |

#### Response (200)

```json
{
  "datasets": [
    {
      "id": 1,
      "name": "KB Auto-Generated Dataset",
      "description": "High-quality conversations from Knowledge Base",
      "datasetType": "kb-auto",
      "status": "ready",
      "totalExamples": 150,
      "fileSize": 524288,
      "averageLength": 1250,
      "originalFilename": "kb-auto-2025-01-30.jsonl",
      "storagePath": "/uploaded_datasets/kb-auto-2025-01-30.jsonl",
      "fileMimeType": "application/jsonl",
      "schema": {
        "format": "jsonl",
        "columns": ["messages", "context", "tools"],
        "inputField": "messages",
        "outputField": null
      },
      "qualityScore": 85,
      "validationErrors": [],
      "createdAt": "2025-01-30T10:00:00Z",
      "tenantId": 1
    }
  ]
}
```

---

### GET `/api/training/datasets/:id/preview`

Visualiza as primeiras linhas de um dataset.

#### Request

```http
GET /api/training/datasets/1/preview
```

#### Response (200)

```json
{
  "preview": [
    {
      "messages": [
        {"role": "user", "content": "Explain quantum entanglement"},
        {"role": "assistant", "content": "Quantum entanglement is..."}
      ],
      "context": ["Previous conversation about quantum physics"],
      "tools": []
    },
    {
      "messages": [
        {"role": "user", "content": "What is RAG?"},
        {"role": "assistant", "content": "RAG stands for Retrieval-Augmented Generation..."}
      ]
    }
  ],
  "totalLines": 150
}
```

---

### GET `/api/training/datasets/:id/download`

Faz download do arquivo do dataset.

#### Request

```http
GET /api/training/datasets/1/download
```

#### Response (200)

Returns the dataset file with appropriate headers:
- `Content-Type`: `application/jsonl` (or original MIME type)
- `Content-Disposition`: `attachment; filename="dataset-name.jsonl"`
- `Content-Length`: File size in bytes

---

### DELETE `/api/training/datasets/:id`

Deleta um dataset específico.

#### Request

```http
DELETE /api/training/datasets/1
```

#### Response (200)

```json
{
  "message": "Dataset deleted successfully"
}
```

---

### POST `/api/training/datasets/bulk-delete`

Deleta múltiplos datasets de uma vez.

#### Request

```json
{
  "ids": [1, 2, 3, 4, 5]
}
```

#### Response (200)

```json
{
  "message": "Datasets deleted successfully",
  "deleted": 5
}
```

#### Error (404)

```json
{
  "error": "No datasets found with provided IDs"
}
```

---

## 📊 Métricas & Observabilidade

### GET `/api/metrics/realtime`

Métricas em tempo real do tenant.

#### Request

```http
GET /api/metrics/realtime?tenant_id=1
```

#### Response (200)

```json
{
  "metrics": [
    {
      "id": 1,
      "tenantId": 1,
      "metricType": "latency",
      "value": 1234,
      "unit": "ms",
      "operation": "chat_completion",
      "metadata": {
        "model": "gpt-4o"
      },
      "timestamp": "2025-10-28T15:30:00Z"
    },
    {
      "metricType": "tokens",
      "value": 1567,
      "unit": "tokens",
      "operation": "chat_completion"
    },
    {
      "metricType": "cost",
      "value": 0.0234,
      "unit": "usd",
      "operation": "chat_completion"
    }
  ]
}
```

---

### GET `/metrics`

Métricas em formato Prometheus.

#### Request

```http
GET /metrics
```

#### Response (200 - text/plain)

```
# HELP aion_requests_total Total number of requests
# TYPE aion_requests_total counter
aion_requests_total{tenant="1"} 1234

# HELP aion_latency_seconds Request latency
# TYPE aion_latency_seconds histogram
aion_latency_seconds_bucket{tenant="1",le="0.1"} 100
aion_latency_seconds_bucket{tenant="1",le="0.5"} 450
aion_latency_seconds_bucket{tenant="1",le="1.0"} 890
aion_latency_seconds_bucket{tenant="1",le="+Inf"} 1234

# HELP aion_tokens_total Total tokens processed
# TYPE aion_tokens_total counter
aion_tokens_total{tenant="1",model="gpt-4o"} 234567

# HELP aion_cost_usd_total Total cost in USD
# TYPE aion_cost_usd_total counter
aion_cost_usd_total{tenant="1"} 12.34
```

---

## ❌ Códigos de Erro

### Códigos HTTP

| Código | Significado | Exemplo |
|--------|-------------|---------|
| **200** | Success | Request processado com sucesso |
| **400** | Bad Request | Parâmetros inválidos ou faltando |
| **401** | Unauthorized | API key inválida ou ausente |
| **403** | Forbidden | Sem permissão para acessar recurso |
| **404** | Not Found | Recurso não encontrado |
| **429** | Too Many Requests | Rate limit excedido |
| **500** | Internal Server Error | Erro no servidor ou API externa |

### Formato de Erro

```json
{
  "error": "Descrição do erro",
  "code": "ERROR_CODE",
  "details": {
    "field": "messages",
    "message": "messages is required"
  }
}
```

### Códigos de Erro Comuns

| Código | Descrição | Solução |
|--------|-----------|---------|
| `MISSING_PARAMETER` | Parâmetro obrigatório faltando | Adicionar parâmetro à request |
| `INVALID_TENANT` | Tenant ID inválido | Verificar tenant_id |
| `RATE_LIMIT_EXCEEDED` | Rate limit excedido | Aguardar antes de nova request |
| `OPENAI_API_ERROR` | Erro na API OpenAI | Verificar API key e quota |
| `DOCUMENT_NOT_FOUND` | Documento não encontrado | Verificar ID do documento |
| `POLICY_VIOLATION` | Violação de política | Ajustar conteúdo ou política |

---

## ⏱️ Rate Limits

### Por Tenant

| Limite | Valor Padrão | Configurável |
|--------|--------------|--------------|
| Requests por minuto | 60 | ✅ Sim (via policy) |
| Tokens por dia | 100,000 | ✅ Sim (via policy) |
| Custo por dia (USD) | $10.00 | ✅ Sim (via policy) |

### Globalais

| Limite | Valor |
|--------|-------|
| Max file size (upload) | 10 MB |
| Max files per request | 5 |
| Max message length | 10,000 chars |
| Max KB search results | 100 |

### Headers de Rate Limit

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1730146800
```

---

## 🔧 Exemplos de Uso

### cURL

```bash
# Chat completion
curl -X POST http://localhost:5000/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Upload documento
curl -X POST http://localhost:5000/api/kb/ingest \
  -F "file=@document.pdf" \
  -F "tenant_id=1"

# Busca KB
curl -X POST http://localhost:5000/api/kb/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "transformer architecture",
    "k": 5
  }'
```

### JavaScript (fetch)

```javascript
// Chat completion
const response = await fetch('http://localhost:5000/api/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: 'Explain RAG' }]
  })
});

const data = await response.json();
console.log(data.choices[0].message.content);

// Upload arquivo
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('tenant_id', '1');

const uploadResponse = await fetch('http://localhost:5000/api/kb/ingest', {
  method: 'POST',
  body: formData
});
```

### Python

```python
import requests

# Chat completion
response = requests.post(
    'http://localhost:5000/api/v1/chat/completions',
    json={
        'messages': [{'role': 'user', 'content': 'Hello!'}]
    }
)

data = response.json()
print(data['choices'][0]['message']['content'])

# Busca KB
search_response = requests.post(
    'http://localhost:5000/api/kb/search',
    json={
        'query': 'attention mechanism',
        'k': 10
    }
)

results = search_response.json()['results']
for result in results:
    print(f"Score: {result['score']:.3f} - {result['chunkText'][:100]}...")
```

---

## 📚 Recursos Adicionais

- [Arquitetura do Sistema](./ARCHITECTURE.md)
- [Sistema de Fallback Automático](./AUTOMATIC_FALLBACK.md)
- [README](../README.md)

---

**Última atualização**: 28 de outubro de 2025
