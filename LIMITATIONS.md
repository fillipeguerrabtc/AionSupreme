# AION - Limitações e Gaps Documentados

**Gerado em:** 2025-11-06  
**Status do Sistema:** Production-Ready com limitações conhecidas

---

## 🔴 LIMITAÇÕES CRÍTICAS DE PRODUÇÃO (Bloqueiam Enterprise Scale)

### 1. **Image Processor - BYPASS HITL (Zero Bypass Violation)** 🔴 **P0 - SECURITY CRITICAL**
**Arquivo:** `server/learn/image-processor.ts`  
**Status:** ✅ DOCUMENTADO | ⚠️ NÃO CORRIGIDO (requer refatoração arquitetural grande)  
**Limitação:**
- `processImage()` → `downloadImage()` → filesystem IMEDIATO
- Imagens salvas ANTES da aprovação humana na fila de curadoria
- Imagens persistem mesmo se conteúdo for REJEITADO na curadoria
- **VIOLAÇÃO da política Zero Bypass** - todas entradas devem passar por HITL

**Mitigação Atual:**
- Documentação EXPLÍCITA do problema no código
- Comentário: "SOLUÇÃO FUTURA NECESSÁRIA"

**Requisito de Produção:**
1. Adicionar campo `attachments` no schema `curationQueue`
2. Armazenar imagens como buffers/URLs TEMPORÁRIOS até aprovação
3. Salvar no filesystem APENAS após aprovação na curadoria
4. Limpar imagens temporárias quando item é rejeitado

**Impacto:**
- 🔴 CRÍTICO: Violação de política de segurança Zero Bypass
- 🔴 ALTO: Armazenamento poluído com imagens não aprovadas
- 🔴 MÉDIO: Compliance issues com GDPR/CCPA

**Timeline:** P0 - Requer redesign arquitetural (estimado 8-16h eng)

---

### 2. **VectorStore - Escalabilidade O(N)**
**Arquivo:** `server/rag/vector-store.ts`  
**Status:** MVP Implementation (brute-force)  
**Limitação:**
- Complexidade O(N) brute-force cosine similarity para TODAS as buscas
- Escala até ~10k embeddings com performance aceitável (<500ms)
- Acima de 10k embeddings: latência degrada linearmente
- SEM approximate nearest neighbor (ANN) indexing (HNSW/IVF)
- SEM mutex/locking para operações concorrentes
- Race condition: indexDocument() + removeDocument() simultâneos
- Race condition: Múltiplas chamadas indexDocument() para mesmo doc

**Mitigação Atual:**
- Basic guard `indexingInProgress: Set<number>` previne double-indexing
- Documentação EXPLÍCITA de limitações no código

**Requisito de Produção:**
- Substituir por FAISS Python service (HNSW/IVF index) para O(log N) search
- Usar faiss-node binding OU Python microservice com GPU acceleration
- Implementar async batch indexing + persistent storage (Redis/Postgres pgvector)
- Adicionar sharding para multi-tenant scale (100k+ embeddings por tenant)
- Adicionar proper locking/mutex (p-queue ou async-mutex)

**Impacto:**
- ⚠️ CRÍTICO: Sistema NÃO adequado para produção com >10k documentos
- ⚠️ ALTO: High-concurrency pode causar race conditions
- ⚠️ MÉDIO: Real-time inference at scale degradará

---

### 3. **File Upload Security - Validação Incompleta**
**Arquivo:** `docs/GUIA_DESENVOLVEDOR.md` + endpoints de upload  
**Status:** Parcialmente implementado  
**Implementado:**
- ✅ Validação de magic bytes para ícones
- ✅ Limite de tamanho (5MB para ícones)
- ✅ MIME type validation

**Pendente:**
- ❌ Validação de magic bytes para PDF, DOCX, XLSX
- ❌ Validação de conteúdo (anti-malware scanning)
- ❌ Sanitização de filenames (path traversal prevention)

**Requisito de Produção:**
- Implementar magic bytes check para TODOS os tipos
- Integrar ClamAV ou similar para malware scanning
- Sanitizar filenames: `filename.replace(/[^a-zA-Z0-9.-]/g, '_')`

**Impacto:**
- ⚠️ ALTO: Risco de malware upload
- ⚠️ MÉDIO: Path traversal attacks

**Timeline:** P0 - Requer integration com antivirus service (estimado 4-8h eng)

---

### 4. **Hierarchical Planner - Aggregation Incompleto**
**Arquivo:** `server/agent/hierarchy-orchestrator.ts`  
**Status:** TODO Implementation  
**Limitação:**
- `executePlan()` não faz LLM review do output agregado
- Comentário: "Future: Add parent LLM call to review/refine aggregated output"
- Respostas de sub-agentes agregadas sem refinamento

**Requisito de Produção:**
- Adicionar chamada LLM parent para revisar outputs agregados
- Implementar refinement logic (consensus, voting, quality check)

**Impacto:**
- ⚠️ MÉDIO: Qualidade de respostas hierárquicas pode ser inferior
- ⚠️ BAIXO: Sistema funcional sem refinement

---

### 5. **GPU Orchestrator - AutoStart não implementado + Manual Registration**
**Arquivo:** `server/model/gpu-orchestrator.ts`, `server/gpu/pool-manager.ts`  
**Status:** TODO Implementation  
**Limitação:**
- `autoStartGPU()` é stub (Comentário: "TODO: Implement with Puppeteer/Selenium")
- GPUs não são iniciadas automaticamente quando offline
- **GPU Registration é MANUAL:** Requer copiar Ngrok URL manualmente do Colab/Kaggle
- **Worker Setup é MANUAL:** Requer executar notebook Python manualmente em Colab/Kaggle

**Workflow Manual Atual:**
1. Abrir Google Colab com GPU (T4/V100)
2. Instalar ngrok e configurar auth token manualmente
3. Executar notebook de inference server
4. Copiar Ngrok URL público (ex: `https://abc123.ngrok.io`)
5. Chamar `POST /api/gpu/register` com provider + ngrokUrl
6. Worker fica online e disponível para treinamento/inferência

**Requisito de Produção:**
- Implementar Puppeteer/Selenium automation para Colab/Kaggle
- Auto-setup ngrok tunnel e registro no backend
- Auto-restart GPUs quando status === "offline"
- Pre-configured notebooks com 1-click setup

**Impacto:**
- 🟠 ALTO: Setup inicial requer ~15min manual por GPU
- 🟠 MÉDIO: Operador precisa re-registrar se Colab/Kaggle session expirar
- 🟠 BAIXO: Downtime aumentado se GPUs crashearem

**Timeline:** P1 - Automation requer Puppeteer integration (estimado 16-24h eng)

---

### 6. **Web Crawler - JavaScript-Rendered Content Falha**
**Arquivo:** `server/learn/website-crawler-service.ts`  
**Status:** Limitação conhecida  
**Limitação:**
- `extractUrl()` usa Cheerio (static HTML parsing)
- Comentário: "NOTE: This code only extracts simple URLs; complex JavaScript-rendered content will fail"
- Sites SPA (React, Vue, Angular) com conteúdo dinâmico falham

**Requisito de Produção:**
- Implementar Puppeteer/Playwright para headless browser
- Renderizar JavaScript antes de extrair conteúdo
- Aumentar timeout para páginas pesadas

**Impacto:**
- ⚠️ MÉDIO: Muitos sites modernos não funcionam
- ⚠️ MÉDIO: Conhecimento web limitado

---

### 7. **LLM Client - Streaming Desabilitado**
**Arquivo:** `server/model/llm-client.ts`  
**Status:** Temporariamente desabilitado  
**Limitação:**
- `chatCompletionStream()` marcado como "⚠️ TEMPORARIAMENTE DESABILITADO"
- Razão: "potential censorship issues with streaming"
- Respostas não streamadas → latência percebida maior

**Requisito de Produção:**
- Revisar censorship issues
- Re-habilitar streaming com filtering adequado
- OU manter desabilitado se compliance exigir

**Impacto:**
- ⚠️ BAIXO: UX degradada (sem typing effect)
- ⚠️ BAIXO: Latência percebida maior

---

### 8. **Agent Hierarchy - Heurística em vez de LLM**
**Arquivo:** `server/agent/runtime.ts`  
**Status:** MVP heurística  
**Limitação:**
- `findGoverningAgents()` usa matching simples
- Comentário: "Future: Implement LLM-based analysis like Puppeteer"
- Seleção de agentes baseada em keywords, não semântica

**Requisito de Produção:**
- Implementar LLM-based agent selection
- Usar embeddings para similarity matching
- Ranking baseado em capabilities

**Impacto:**
- ⚠️ MÉDIO: Agentes sub-ótimos podem ser selecionados
- ⚠️ BAIXO: Sistema funcional com heurística

---

### 9. **Fine-Tuned Model Deployment - MANUAL (BLOQUEADOR SELF-IMPROVING AI)** 🔴
**Arquivo:** `server/gpu/orchestrator.ts`, worker notebooks  
**Status:** ⚠️ CRÍTICO - Pipeline incompleto  
**Limitação:**
- Workers carregam **base models** automaticamente (Mistral, Llama, Phi-3 via HuggingFace)
- **LoRA adapters** (fine-tuned) NÃO são deployed automaticamente
- Worker NÃO sabe onde buscar checkpoint do training job completado
- Operador precisa MANUALMENTE modificar worker code para carregar LoRA
- **Quebra promise de "self-improving AI"** - modelo fine-tuned não entra em produção automaticamente

**Workflow Manual Atual:**
1. Completar federated training job → checkpoint salvo em `/data/training/checkpoints/job-{id}/`
2. Download checkpoint via `GET /api/training/checkpoints/:jobId`
3. Upload para Google Colab/Kaggle (ou mount Google Drive)
4. Modificar worker code manualmente:
   ```python
   from peft import PeftModel
   base_model = AutoModelForCausalLM.from_pretrained("mistralai/Mistral-7B")
   model = PeftModel.from_pretrained(base_model, "/path/to/lora-adapters")
   ```
5. Re-registrar worker com modelo fine-tuned

**Requisito de Produção:**
- Implementar checkpoint auto-sync para workers (S3/GCS/webhook)
- Worker deve buscar latest checkpoint via `GET /api/training/checkpoints/:jobId` automaticamente
- Auto-aplicar LoRA adapters ao base model on startup
- Endpoint `/v1/models/reload` para hot-reload sem restart
- Health check que valida modelo carregado está atualizado

**Impacto:**
- 🔴 CRÍTICO: Fine-tuned inference NÃO funciona out-of-the-box
- 🔴 ALTO: Operador precisa ~30min de setup manual por modelo trained
- 🔴 ALTO: Self-improving loop QUEBRADO - modelo não entra em produção automaticamente
- 🟠 MÉDIO: Cada update de modelo requer re-deploy manual

**Timeline:** P0 - Bloqueador para autonomous self-improvement (estimado 8-12h eng)

---

## ✅ PROBLEMAS RESOLVIDOS (Durante Este Code Review)

### ✅ **1. Autenticação Granular em Endpoints de Datasets** 
**Arquivo:** `server/routes.ts`  
**Status:** ✅ RESOLVIDO  
**Problema Original:**
- Endpoints tinham `requireAuth` mas faltava `requirePermission` granular
- Falta de RBAC granular para operações sensíveis

**Correção Aplicada:**
- ✅ Adicionado `requirePermission("training:datasets:write")` em POST /api/training/datasets (linha 3673)
- ✅ Adicionado `requirePermission("training:datasets:delete")` em POST /api/training/datasets/bulk-delete (linha 3913)
- ✅ Adicionado `requirePermission("training:datasets:write")` em POST /api/training/datasets/generate-from-kb (linha 4007)

**Impacto:**
- ✅ RESOLVIDO: Agora requer permissão granular além de autenticação
- ✅ RBAC compliance: Apenas usuários com permissões corretas podem acessar

---

## 🔒 GAPS DE SEGURANÇA PRODUCTION-READY

---

### 10. **Rate Limiting Granular Faltando**
**Arquivo:** `server/routes.ts`  
**Status:** Configuração global apenas  
**Limitação:**
- Rate limiting aplicado globalmente em `/api`
- Endpoints críticos sem rate limiting específico:
  - `/api/media/proxy` (target de abuse)
  - `/api/videos/generate` (resource-intensive)
  - `/api/agent/chat` (computationally expensive)

**Requisito de Produção:**
- Implementar rate limiting granular por endpoint
- Exemplo: `/api/media/proxy` → 10 req/min por IP
- Exemplo: `/api/videos/generate` → 5 req/hour por user

**Impacto:**
- ⚠️ ALTO: Risco de abuse/DoS em endpoints específicos
- ⚠️ MÉDIO: Resource exhaustion

---

### 11. **Validação de Input Faltando**
**Arquivo:** `server/routes.ts`  
**Status:** Vulnerabilidade  
**Endpoints sem validação:**
- `/api/agent/chat` - `messages`, `maxIterations` não validados (linha 3183-3395)
- `/api/videos/generate` - `duration`, `fps`, `resolution` não validados (linha 2576-2630)

**Requisito de Produção:**
- Adicionar Zod schemas para ALL request bodies
- Validar ranges: `duration: z.number().min(5).max(300)`
- Validar enums: `resolution: z.enum(["720p", "1080p", "4k"])`

**Impacto:**
- ⚠️ ALTO: Resource exhaustion (vídeos de 9999 segundos)
- ⚠️ MÉDIO: Injection attacks via unvalidated inputs

---

### 12. **Error Handling Masking Issues**
**Arquivo:** `server/routes.ts`  
**Status:** Observabilidade degradada  
**Problemas:**
- `/api/auth/user` retorna `null` ao invés de logar erros críticos (linha 2742-2795)
- `/api/media/proxy` catch genérico não diferencia network errors (linha 4863-4926)

**Requisito de Produção:**
- Logar erros críticos no Sentry/DataDog antes de retornar `null`
- Diferenciar network timeout vs 404 vs 500 no media proxy
- Adicionar alerting para failed auth checks

**Impacto:**
- ⚠️ MÉDIO: Debugging dificultado
- ⚠️ BAIXO: Observabilidade limitada

---

### 13. **File Upload Security - Validação Incompleta**
**Arquivo:** `docs/GUIA_DESENVOLVEDOR.md` + código  
**Status:** Parcialmente implementado  
**Implementado:**
- ✅ Validação de magic bytes para ícones
- ✅ Limite de tamanho (5MB para ícones)
- ✅ MIME type validation

**Pendente:**
- ❌ Validação de magic bytes para PDF, DOCX, XLSX
- ❌ Validação de conteúdo (anti-malware scanning)
- ❌ Sanitização de filenames (path traversal prevention)

**Requisito de Produção:**
- Implementar magic bytes check para TODOS os tipos
- Integrar ClamAV ou similar para malware scanning
- Sanitizar filenames: `filename.replace(/[^a-zA-Z0-9.-]/g, '_')`

**Impacto:**
- ⚠️ ALTO: Risco de malware upload
- ⚠️ MÉDIO: Path traversal attacks

---

### 14. **GDPR/CCPA - Right of Portability Manual**
**Arquivo:** `docs/GUIA_DESENVOLVEDOR.md`  
**Status:** Implementação manual  
**Limitação:**
- Direito de portabilidade requer export manual
- Comentário: "⚠️ Direito de portabilidade (export manual necessário)"
- Não há endpoint `/api/users/me/export`

**Requisito de Produção:**
- Implementar endpoint `GET /api/users/me/export`
- Retornar JSON com TODOS os dados do usuário
- Incluir: conversas, documentos, imagens, vídeos, datasets

**Impacto:**
- ⚠️ MÉDIO: Compliance risk com GDPR/CCPA
- ⚠️ BAIXO: Manual export funciona mas escala mal

---

## 🟢 LIMITAÇÕES BAIXAS (Cosméticas/Opcionais)

### 15. **YouTube Transcript - Título é Stub**
**Arquivo:** `server/learn/youtube-transcript-service.ts`  
**Status:** TODO Implementation  
**Limitação:**
- `getYouTubeVideoTitle()` retorna `"Unknown Video"` sempre
- Comentário: "TODO: Implement using YouTube Data API or web scraping"
- Metadados incompletos para vídeos indexados

**Mitigação Atual:**
- Fallback para "Unknown Video"
- Sistema continua funcionando sem título

**Requisito de Produção:**
- Implementar YouTube Data API v3 integration
- OU web scraping de `https://www.youtube.com/watch?v={videoId}`
- Extrair título, duração, thumbnail

**Impacto:**
- 🟢 BAIXO: Funcionalidade opcional, não quebra sistema
- 🟢 BAIXO: UX levemente degradada sem títulos de vídeo

**Timeline:** P2 - Nice-to-have (estimado 2-4h eng)

---

### 16. **BM25 Simplificado - Sem Corpus Statistics**
**Arquivo:** `server/rag/vector-store.ts`  
**Status:** TODO Implementation  
**Limitação:**
- BM25 class falta corpus statistics para scoring real
- Comentário: "TODO: Implement improvements"
- Ranking BM25 sub-ótimo

**Requisito de Produção:**
- Implementar corpus statistics (IDF, avg doc length)
- Calcular BM25 score corretamente: `score = IDF * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgDocLen)))`

**Impacto:**
- ⚠️ BAIXO: Ranking levemente degradado
- ⚠️ BAIXO: Sistema funcional com BM25 simplificado

---

### 17. **LLM Streaming Desabilitado**
**Arquivo:** `server/model/llm-client.ts`  
**Status:** Temporariamente desabilitado  
**Limitação:**
- `chatCompletionStream()` marcado como "⚠️ TEMPORARIAMENTE DESABILITADO"
- Razão: "potential censorship issues with streaming"
- Respostas não streamadas → latência percebida maior

**Requisito de Produção:**
- Revisar censorship issues
- Re-habilitar streaming com filtering adequado
- OU manter desabilitado se compliance exigir

**Impacto:**
- 🟢 BAIXO: UX degradada (sem typing effect)
- 🟢 BAIXO: Latência percebida maior

**Timeline:** P2 - Nice-to-have (estimado 1-2h eng)

---

### 18. **Testing Manual - Sem CI/CD**
**Arquivo:** `server/ai/knowledge-indexer.ts`  
**Status:** Manual testing apenas  
**Limitação:**
- Comentário: "NOTE: This is a MANUAL test suite for validation."
- Comentário: "For production, integrate with a test framework like Jest or Vitest."
- Sem testes automatizados

**Requisito de Produção:**
- Integrar Jest/Vitest
- Cobertura de testes: >80% para backend crítico
- CI/CD: GitHub Actions rodando testes em PRs

**Impacto:**
- ⚠️ MÉDIO: Risco de regressões não detectadas
- ⚠️ MÉDIO: Quality assurance manual é custosa

---

## 📝 RESUMO EXECUTIVO

### Limitações por Criticidade

**🔴 CRÍTICAS (Bloqueiam Enterprise Scale >10k docs / Self-Improving AI):**
1. **Image Processor BYPASS HITL** - Violação Zero Bypass Policy (P0 Security)
2. **VectorStore O(N)** - NÃO escala >10k docs (P0 Performance)
3. **File Upload Security** - Magic bytes validation incomplete (P0 Security)
4. **Fine-Tuned Model Deployment MANUAL** - Self-improving loop quebrado (P0 Autonomy)

**🟠 ALTAS (Reduzem Confiabilidade/Segurança/Autonomia):**
5. **GPU Registration MANUAL** - Setup ~15min por GPU (P1 Autonomy)
6. **Race conditions no VectorStore** - Concurrency sem mutex (P1)
7. **Rate limiting granular faltando** - DoS risk (P1)
8. **Input validation faltando** - Resource exhaustion (P1)

**🟡 MÉDIAS (Degradam UX/Compliance):**
9. **Web Crawler** - Falha em JS-rendered content (P2)
10. **Hierarchical Planner** - Sem LLM refinement (P2)
11. **Agent Hierarchy** - Usa heurística vs LLM (P2)
12. **GDPR/CCPA export** - Manual export required (P2)
13. **Testing manual** - Sem CI/CD (P2)
14. **Error handling** - Observabilidade degradada (P2)

**🟢 BAIXAS (Cosméticas/Nice-to-Have):**
15. **YouTube título** - Fallback para "Unknown Video" (P3)
16. **LLM streaming** - Desabilitado por compliance (P3)
17. **BM25 simplificado** - Corpus statistics faltando (P3)

**✅ RESOLVIDOS (Durante Este Code Review):**
18. **Autenticação granular em /api/training/datasets** - ✅ requirePermission adicionado

---

## ✅ PRÓXIMOS PASSOS RECOMENDADOS

### Prioridade P0 (Bloqueia Enterprise Scale + Self-Improving AI):
1. 🔴 **Fine-Tuned Model Auto-Deployment** - Checkpoint auto-sync + hot-reload (~8-12h)
2. 🔴 **Corrigir Image Processor BYPASS HITL** - Temp storage + HITL approval (~8-16h)
3. 🔴 **Implementar FAISS Python service** - Replace VectorStore O(N) (~16-24h)
4. 🔴 **File Upload Security completa** - Magic bytes ALL types + antivirus (~4-8h)
5. ✅ **Autenticação granular** - requirePermission adicionado ✅

### Prioridade P1 (Deploy com Mitigação - Autonomia):
6. 🟠 **GPU Auto-Registration** - Puppeteer automation Colab/Kaggle (~16-24h)
7. 🟠 **Mutex completo no VectorStore** - async-mutex ou p-queue (~2-4h)
8. 🟠 **Rate limiting granular** - Endpoint-specific limits (~4-6h)
9. 🟠 **Zod validation em ALL endpoints** - Input validation completa (~6-8h)

### Prioridade P2 (Melhorias Incrementais):
9. Implementar Puppeteer para Web Crawler
10. Adicionar LLM refinement no Hierarchical Planner
11. Implementar GDPR export endpoint
12. Integrar Jest/Vitest CI/CD

---

## 🚨 **CONCLUSÃO ATUALIZADA:**

**AION está production-ready para:**
- ✅ **MVP/Small-Scale** (<10k docs, <100 users, <1000 req/day)
- ✅ **Popular KB e aprovar 100 itens** via HITL curation
- ✅ **Treinamento federado** com datasets da KB

**AION NÃO está pronto para:**
- ❌ **Self-Improving AI AUTOMÁTICO** - Fine-tuned model deployment é MANUAL (~30min setup)
- ❌ **GPU Auto-Connection** - Colab/Kaggle registration é MANUAL (~15min setup)
- ❌ **Enterprise Scale** (>10k docs, high-concurrency) - VectorStore O(N), race conditions
- ❌ **Inferência com LLM próprio out-of-the-box** - LoRA deployment manual

**Próximo passo para Self-Improving AI:**
1. 🔴 **P0:** Implementar checkpoint auto-sync + worker hot-reload (~8-12h eng)
2. 🟠 **P1:** Automatizar GPU registration via Puppeteer (~16-24h eng)
3. 🟢 **Então:** Sistema se torna verdadeiramente autônomo e auto-evolutivo!
