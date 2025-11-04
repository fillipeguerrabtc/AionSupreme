# AION - Roadmap de Desenvolvimento

## 📋 TODOs Categorizados (17 items)

### 🎯 Alta Prioridade (Próximas Releases)

#### 1. Vision System - Database Migration
**Arquivo:** `server/routes/vision.ts:28`  
**Descrição:** Migrar configuração de provedores Vision de hardcoded para tabela `vision_providers`  
**Benefício:** Permitir atualização dinâmica de provedores sem redeploy  
**Status:** Planejado

#### 2. GPU Pool - Load Tracking
**Arquivo:** `server/gpu/pool.ts:78-79`  
**Descrição:** Implementar tracking real de `currentLoad` e `quotaRemaining`  
**Benefício:** Melhor balanceamento de carga e quota management  
**Status:** Planejado

#### 3. Gradient Aggregation - Timeout System
**Arquivo:** `server/federated/gradient-aggregation-coordinator.ts:235`  
**Descrição:** Implementar timeout automático se gradientes não chegarem em X minutos  
**Benefício:** Evitar jobs travados indefinidamente  
**Status:** Planejado

---

### 🚀 Médio Prazo (Futuras Melhorias)

#### 4. LLM Streaming - Buffer Optimization
**Arquivo:** `server/model/llm-client.ts:498`  
**Descrição:** Implementar buffer + detecção de conteúdo antes de emitir chunks  
**Benefício:** Streaming mais eficiente e com menos overhead  
**Status:** Planejado

#### 5. Deduplication - pgvector Optimization
**Arquivo:** `server/services/deduplication-service.ts:105`  
**Descrição:** Implementar pgvector + IVFFlat index para top-k otimizado em KB grande  
**Benefício:** Performance em KBs com milhões de documentos  
**Status:** Futuro (quando KB crescer >100k docs)

#### 6. YouTube Transcript - Official API
**Arquivo:** `server/learn/youtube-transcript-service.ts:125`  
**Descrição:** Migrar de scraping para YouTube Data API oficial  
**Benefício:** Maior confiabilidade e compliance com TOS  
**Status:** Planejado

#### 7. Auto-Indexer - Pending Examples Counter
**Arquivo:** `server/training/auto-indexer.ts:328`  
**Descrição:** Calcular exemplos pendentes de treino em tempo real  
**Benefício:** Melhor visibilidade do pipeline de treinamento  
**Status:** Planejado

#### 8. Data Collector - Rating System
**Arquivo:** `server/training/data-collector.ts:105`  
**Descrição:** Adicionar rating de usuários nas conversas coletadas  
**Benefício:** Melhor curadoria de dados de treino  
**Status:** Planejado

---

### 🔮 Longo Prazo (Visão Futura)

#### 9. GPU Orchestrator - Email/SMS Notifications
**Arquivo:** `server/model/gpu-orchestrator.ts:229, 238`  
**Descrição:** Notificação via email/SMS quando GPU fica offline  
**Benefício:** Alertas proativos para administradores  
**Status:** Futuro

#### 10. GPU Orchestrator - Puppeteer Automation
**Arquivo:** `server/model/gpu-orchestrator.ts:248, 253`  
**Descrição:** Automação de setup de GPUs via Puppeteer/Selenium  
**Benefício:** Onboarding automático de GPUs  
**Status:** Futuro

#### 11. Agent Curator - Real LLM Logic
**Arquivo:** `server/agent/curator.ts:27, 54`  
**Descrição:** Implementar lógica real de curadoria com LLM  
**Benefício:** Curadoria automática mais inteligente  
**Status:** Futuro (HITL ainda é prioridade)

#### 12. Gradient Aggregation - Full Loop Implementation
**Arquivo:** `server/training/auto-training-trigger.ts:255`  
**Descrição:** Implementar loop completo de agregação de gradientes  
**Benefício:** Federated Learning totalmente funcional  
**Status:** Em desenvolvimento parcial

#### 13. Gemini Billing - Google Cloud Integration
**Arquivo:** `server/services/gemini-billing-sync.ts:19`  
**Descrição:** Integração completa com Google Cloud Billing API  
**Benefício:** Tracking automático de custos Gemini  
**Status:** Futuro (cálculo local funciona bem)

---

## 📊 Estatísticas

- **Total de TODOs:** 17
- **Alta Prioridade:** 3 (18%)
- **Médio Prazo:** 6 (35%)
- **Longo Prazo:** 8 (47%)

## 🎯 Critérios de Priorização

1. **Alta:** Impacto direto na produção ou escalabilidade
2. **Média:** Melhorias de performance ou UX
3. **Baixa:** Nice-to-have ou features experimentais

---

**Última Atualização:** 2025-11-04  
**Responsável:** AION Development Team
