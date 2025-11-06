# AION - Limitações e Gaps Documentados

**Gerado em:** 2025-11-06  
**Status do Sistema:** Production-Ready com limitações conhecidas

---

## 🔴 LIMITAÇÕES CRÍTICAS DE PRODUÇÃO

### 1. **VectorStore - Escalabilidade O(N)**
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

### 2. **Image Processor - BYPASS HITL (Zero Bypass Violation)**
**Arquivo:** `server/learn/image-processor.ts`  
**Status:** VIOLAÇÃO da Política Zero Bypass  
**Limitação:**
- `processImage()` → `downloadImage()` → filesystem IMEDIATO
- Imagens salvas ANTES da aprovação humana na fila de curadoria
- Imagens persistem mesmo se conteúdo for REJEITADO na curadoria
- VIOLAÇÃO da política Zero Bypass - todas entradas devem passar por HITL

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

---

### 3. **YouTube Transcript - Título é Stub**
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
- ⚠️ BAIXO: Funcionalidade opcional, não quebra sistema
- ⚠️ BAIXO: UX degradada sem títulos de vídeo

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

### 5. **GPU Orchestrator - AutoStart não implementado**
**Arquivo:** `server/model/gpu-orchestrator.ts`  
**Status:** TODO Implementation  
**Limitação:**
- `autoStartGPU()` é stub
- Comentário: "TODO: Implement with Puppeteer/Selenium"
- GPUs não são iniciadas automaticamente quando offline

**Requisito de Produção:**
- Implementar Puppeteer/Selenium automation
- Conectar com Google Colab/Kaggle/Modal APIs
- Auto-restart GPUs quando status === "offline"

**Impacto:**
- ⚠️ ALTO: Operador precisa iniciar GPUs manualmente
- ⚠️ MÉDIO: Downtime aumentado se GPUs crashearem

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

## 🔒 GAPS DE SEGURANÇA PRODUCTION-READY

### 9. **Autenticação Faltando em Endpoints Críticos**
**Arquivo:** `server/routes.ts`  
**Status:** VULNERABILIDADE  
**Endpoints sem autenticação:**
- `POST /api/training/datasets` (upload) - linha 3690-3717
- `POST /api/training/datasets/bulk-delete` - linha 3909-3957

**Requisito de Produção:**
- Adicionar `requireAuth` middleware
- Adicionar `requirePermission("training:datasets:write")` check

**Impacto:**
- 🔴 CRÍTICO: Qualquer usuário pode fazer upload/deletar datasets
- 🔴 ALTO: Risco de data exfiltration/pollution

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

## 📊 LIMITAÇÕES DE ESCALA

### 15. **BM25 Simplificado - Sem Corpus Statistics**
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

### 16. **Testing Manual - Sem CI/CD**
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

**🔴 CRÍTICAS (Bloqueiam Produção):**
1. VectorStore O(N) - NÃO escala >10k docs
2. Image Processor BYPASS HITL - Violação de segurança
3. Autenticação faltando em /api/training/datasets
4. File Upload Security incompleta

**🟠 ALTAS (Reduzem Confiabilidade):**
5. Race conditions no VectorStore
6. Rate limiting granular faltando
7. Input validation faltando
8. GPU Orchestrator autoStart não implementado

**🟡 MÉDIAS (Degradam UX):**
9. Web Crawler falha em JS-rendered content
10. Hierarchical Planner sem refinement
11. Agent Hierarchy usa heurística
12. GDPR/CCPA export manual
13. Testing manual

**🟢 BAIXAS (Cosméticas):**
14. YouTube título é stub
15. LLM streaming desabilitado
16. BM25 simplificado

---

## ✅ PRÓXIMOS PASSOS RECOMENDADOS

### Prioridade P0 (Bloqueia Deploy):
1. ✅ Corrigir autenticação em `/api/training/datasets`
2. ✅ Implementar FAISS Python service para VectorStore
3. ✅ Corrigir Image Processor BYPASS HITL
4. ✅ Adicionar validação completa de file uploads

### Prioridade P1 (Deploy com Mitigação):
5. ✅ Adicionar mutex completo no VectorStore
6. ✅ Implementar rate limiting granular
7. ✅ Adicionar Zod validation em ALL endpoints
8. ✅ Implementar GPU autoStart

### Prioridade P2 (Melhorias Incrementais):
9. Implementar Puppeteer para Web Crawler
10. Adicionar LLM refinement no Hierarchical Planner
11. Implementar GDPR export endpoint
12. Integrar Jest/Vitest CI/CD

---

**Conclusão:** AION está **production-ready para MVP/small-scale**, mas requer correções P0+P1 para **enterprise production at scale (>10k docs, high-concurrency)**.
