# AION — Upgrade Multi-Agente (Alinhado ao Monorepo)

## 0) Premissas
- Single-Tenant: sempre use `x-tenant-id` nas requisições e filtre por `tenant_id`.
- 100% gratuito: HuggingFace/OpenRouter free tiers; treino/LoRA em Google Colab + Kaggle.
- KB única, particionada por namespaces; RAG 2-estágios; roteamento MoE com budget.

## 1) Instalação
1. Copie os arquivos deste pacote para as mesmas pastas no seu repositório.
2. Adicione o novo schema ao bootstrap do Drizzle/DB: `shared/schema_agents.ts`.

## 2) Migration
- Execute o SQL em `server/migrations/001_init_agents.sql` (Postgres com `pgcrypto`).
  ```sh
  psql $DATABASE_URL -f server/migrations/001_init_agents.sql
  ```

## 3) Rotas (API)
- Abra `server/routes.ts` e aplique `patches/server_routes.patch` (ou edite manualmente):
  ```ts
  import { registerAgentRoutes } from "./routes/agents";
  export function registerRoutes(app) {
    // ...
    registerAgentRoutes(app);
  }
  ```

## 4) Sidebar (UI Admin)
- Aplique `patches/client_sidebar.patch` (ou edite `AdminSidebar.tsx`):
  ```tsx
  <li><Link href="/admin/agents">Agentes</Link></li>
  ```

## 5) Seeds
- Rode: `SEED_TENANT_ID=<uuid> ts-node server/seedAgents.ts`

## 6) Planner/Roteador
- No fluxo que hoje escolhe um agente único, use `server/agent/planner_multi.ts`:
  ```ts
  const out = await planAndExecute({ query, history }, { tenantId, sessionId, budgetUSD: 0.02 });
  ```

## 7) RAG + Reindex
- `server/rag/agents-indexer.ts` assina eventos para reindex automático.
- Garanta que seu `knowledge-indexer` exporte `rebuildNamespaceIndex(tenantId, namespace)`.

## 8) Pools
- `server/agent/runtime.ts` + seu registrador atual.
- `server/agent/router.ts` usa top-p + `maxFanOut`; plugue seu classificador leve de intenção.

## 9) Segurança & Custos
- `policy.perRequestBudgetUSD` por agente, `maxAgentsFanOut` pequeno (1–2).
- Ações sensíveis (pagamento, exclusões): confirmação humana/sandbox.

## 10) Test Bench
- Acesse `/admin/agents`; use o Test Bench (placeholder) para exercitar o roteador.
- Opcional: acrescente uma rota `/api/agents/test` que chame `planAndExecute(...)` e retorne `trace`.

---

### Estrutura entregue
- shared/schema_agents.ts
- server/migrations/001_init_agents.sql
- server/storage.agents.ts
- server/agent/{registry.ts, router.ts, planner_multi.ts, runtime.ts, types.ts}
- server/routes/agents.ts
- server/rag/agents-indexer.ts
- server/seeds/agents.seed.json
- server/seedAgents.ts
- client/src/pages/admin/AgentsPage.tsx
- client/src/components/agents/{AgentForm.tsx,AgentTable.tsx,TestBench.tsx}
- docs/multi_agent_architecture_expanded.tex
- patches/{server_routes.patch,client_sidebar.patch}

> Qualquer divergência de nomes/caminhos, me diga que regenero os arquivos casando 100% com seu repo.
