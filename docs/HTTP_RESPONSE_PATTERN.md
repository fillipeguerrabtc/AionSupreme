# 📦 HTTP Response Envelope Pattern

## 🎯 Objetivo

Padronizar TODAS as respostas HTTP da API para formato consistente e previsível.

## 📋 Formato Padrão

### Sucesso (2xx)
```typescript
{
  ok: true,
  data: { ...seus dados aqui },
  metadata?: { ...metadados opcionais }
}
```

### Erro (4xx, 5xx)
```typescript
{
  ok: false,
  error: "Mensagem de erro descritiva",
  metadata?: { ...metadados opcionais }
}
```

## 🛠️ Como Usar

### Importar Helpers

```typescript
import { 
  sendSuccess, 
  sendError,
  sendValidationError,
  sendNotFound,
  sendForbidden,
  sendUnauthorized,
  sendServerError,
  sendRateLimitError
} from "../utils/response";
```

### Exemplos Práticos

#### ✅ Resposta de Sucesso

```typescript
// ANTES (inconsistente)
res.json({ results: data });
res.json({ success: true, data });
res.json(data); // objeto direto

// DEPOIS (padronizado)
sendSuccess(res, data);
sendSuccess(res, data, { requestId: "abc123" }); // com metadata
```

#### ❌ Resposta de Erro

```typescript
// ANTES (inconsistente)
res.status(400).json({ error: "Invalid input" });
res.status(404).json({ message: "Not found" });

// DEPOIS (padronizado)
sendValidationError(res, "Invalid input"); // 400
sendNotFound(res, "User"); // 404
sendForbidden(res, "Access denied"); // 403
sendUnauthorized(res); // 401
sendServerError(res, error); // 500
sendRateLimitError(res, 60); // 429
```

#### 🔧 Erro Customizado

```typescript
// Erro com código específico
sendError(res, 418, "I'm a teapot");

// Erro com metadata
sendError(res, 422, "Validation failed", { 
  fields: ["email", "password"] 
});
```

## 📊 Benefícios

### Para o Frontend
```typescript
// TypeScript pode tipar genericamente
const response = await api.get<ApiResponse<User>>("/api/users/1");

if (response.ok) {
  console.log(response.data.name); // Type-safe!
} else {
  console.error(response.error);
}
```

### Para Debugging
- ✅ Sempre mesmo formato (fácil de ler logs)
- ✅ Metadata para rastreabilidade (requestId, timing, etc)
- ✅ Erros consistentes

### Para Manutenção
- ✅ Código mais limpo e legível
- ✅ Menos bugs (formato previsível)
- ✅ Fácil de adicionar campos globais (ex: versão da API)

## 🚀 Migração Gradual

**NÃO precisa refatorar tudo de uma vez!**

1. **Novas rotas**: Use helpers desde o início
2. **Rotas críticas**: Refatore aos poucos
3. **Rotas legadas**: Deixe para depois (se funciona, não mexa!)

## 📝 Checklist para Novas Rotas

- [ ] Importou helpers de `server/utils/response.ts`
- [ ] Sucesso usa `sendSuccess(res, data)`
- [ ] Erros usam helpers apropriados (`sendValidationError`, `sendNotFound`, etc)
- [ ] Try-catch usa `sendServerError(res, error)`
- [ ] Metadados importantes estão em `metadata` (opcional)

## 🔍 Exemplo Completo

```typescript
app.post("/api/users", requireAuth, async (req, res) => {
  try {
    // Validação
    const validation = insertUserSchema.safeParse(req.body);
    if (!validation.success) {
      return sendValidationError(res, validation.error.message);
    }

    // Verificar se já existe
    const existing = await storage.getUserByEmail(validation.data.email);
    if (existing) {
      return sendError(res, 409, "User already exists");
    }

    // Criar usuário
    const user = await storage.createUser(validation.data);

    // Sucesso com metadata
    sendSuccess(res, user, { 
      requestId: req.id,
      createdAt: new Date().toISOString() 
    });
  } catch (error) {
    sendServerError(res, error);
  }
});
```

## ⚠️ Casos Especiais

### Streaming (SSE)
```typescript
// SSE não usa envelope, usa Server-Sent Events format
res.setHeader("Content-Type", "text/event-stream");
res.write(`data: ${JSON.stringify({ chunk: "..." })}\n\n`);
```

### Webhooks
```typescript
// Webhooks de terceiros podem exigir formato específico
// Documente claramente nesses casos
```

### Compatibilidade com APIs Externas
```typescript
// Se precisa manter formato específico (ex: OpenAI API compatible)
// Documente no código por que não usa envelope
```

## 🎨 Design Decisions

**Por que `ok` em vez de `success`?**
- Mais curto, mais semântico
- `ok: true` lê como "está OK"
- Convenção comum em Rust's Result<T, E>

**Por que `data` em vez de retornar objeto direto?**
- Permite adicionar metadata sem quebrar tipo de data
- Formato consistente facilita error handling
- Frontend pode sempre fazer `response.data.field`

**Por que `error` como string em vez de objeto?**
- Simples para 90% dos casos
- Se precisar estruturado, use `metadata.details`
- Mantém envelope leve e rápido de processar
