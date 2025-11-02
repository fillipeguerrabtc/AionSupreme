# 🎮 Guia Completo - Setup de Workers GPU (14 GPUs Gratuitas)

## 📊 **Visão Geral do Sistema**

AION suporta treino distribuído em **14 GPUs gratuitas**:
- **7x Google Colab** (T4, 15GB VRAM, 12h/dia cada)
- **7x Kaggle** (2x T4 por notebook, 30h/semana total)

**Arquitetura:**
```
AION (Replit) ←→ Ngrok Tunnels ←→ Workers GPU (Colab/Kaggle)
     ↓
  Postgres DB
  (Jobs, Gradientes, Checkpoints)
```

---

## 🚀 **Setup Rápido (5 Minutos)**

### **Opção 1: Google Colab (Recomendado para iniciantes)**

1. **Abrir Colab:**
   - Ir para https://colab.research.google.com/
   - Criar novo notebook: File → New notebook

2. **Ativar GPU:**
   - Runtime → Change runtime type
   - Hardware accelerator → **T4 GPU**
   - Save

3. **Executar Keepalive:**
   - Abrir DevTools (Ctrl+Shift+I)
   - Console tab
   - Colar script JavaScript de [`docs/COLAB_KEEPALIVE_GUIDE.md`](./COLAB_KEEPALIVE_GUIDE.md)
   - Pressionar Enter

4. **Executar Worker Script:**
   - Criar nova célula no notebook
   - Copiar **COMPLETO** script de [`docs/worker_scripts/colab_worker_auto_lifecycle.py`](./worker_scripts/colab_worker_auto_lifecycle.py)
   - **EDITAR linha 19:** Mudar `AION_BASE_URL` para sua URL do Replit
   - Executar célula (Shift+Enter)

5. **Confirmar Registro:**
   - Ir para https://seu-aion.replit.app/admin/gpu-pool
   - Ver worker listado com status "online"

**PRONTO!** Worker fica ativo por até 12h ou até completar primeiro job.

---

### **Opção 2: Kaggle Notebooks**

1. **Abrir Kaggle:**
   - Ir para https://www.kaggle.com/code
   - Click **"New Notebook"**

2. **Ativar GPUs:**
   - Settings (⚙️ no canto direito)
   - Accelerator → **GPU T4 x2**
   - Save

3. **Executar Worker Script:**
   - Copiar **COMPLETO** script de [`docs/worker_scripts/kaggle_worker_auto_lifecycle.py`](./worker_scripts/kaggle_worker_auto_lifecycle.py)
   - **EDITAR linha 32:** Mudar `AION_BASE_URL`
   - Executar célula

4. **Confirmar Registro:**
   - Verificar em https://seu-aion.replit.app/admin/gpu-pool

**PRONTO!** Worker fica ativo por até 9h (quota Kaggle).

---

## 📋 **Checklist de Validação**

Após setup de cada worker, verificar:

### ✅ **Worker Online:**
- [ ] Worker aparece no dashboard `/admin/gpu-pool`
- [ ] Status: **"online"** (verde)
- [ ] Last heartbeat < 1 minuto atrás

### ✅ **Túnel Ngrok Funcional:**
- [ ] Worker mostra ngrok URL no console (https://xyz.ngrok.io)
- [ ] Testar endpoint: `curl https://xyz.ngrok.io/health` → Deve retornar 200

### ✅ **GPU Detectada:**
- [ ] Dashboard mostra tipo de GPU (T4)
- [ ] VRAM listada corretamente (15GB Colab, 30GB Kaggle)

### ✅ **Heartbeat Ativo:**
- [ ] Console do worker mostra "💓 HEARTBEAT Enviado" a cada 30s
- [ ] Dashboard atualiza "Last heartbeat" em tempo real

### ✅ **Aguardando Jobs:**
- [ ] Console mostra "✅ WORKER ATIVO - Aguardando jobs..."
- [ ] Sem erros no console

---

## 🔧 **Troubleshooting Comum**

### **Problema 1: Worker não registra**

```
❌ [REGISTER] Erro ao registrar: Connection refused
```

**Causas possíveis:**
1. `AION_BASE_URL` incorreto
2. AION está offline
3. Firewall bloqueando

**Soluções:**
1. Verificar URL (deve ser https://seu-aion.replit.app)
2. Testar no navegador: https://seu-aion.replit.app/api/health
3. Verificar se AION está rodando

---

### **Problema 2: Ngrok túnel falha**

```
❌ [SETUP] Erro ao criar túnel ngrok
```

**Causas possíveis:**
1. Quota ngrok esgotada (free tier: 1 túnel simultâneo)
2. Ngrok token inválido

**Soluções:**
1. Fechar outros túneis ngrok ativos
2. Aguardar 5 min e tentar novamente
3. Criar conta ngrok e usar token autenticado

---

### **Problema 3: GPU não detectada**

```
GPU: CPU (0.0 GB VRAM)
```

**Causas possíveis:**
1. Runtime não está usando GPU
2. Quota de GPU esgotada (Google)

**Soluções:**
1. **Colab:** Runtime → Change runtime type → T4 GPU → Save
2. **Kaggle:** Settings → Accelerator → GPU T4 x2
3. Aguardar 24h se quota esgotou

---

### **Problema 4: Worker desconecta após 90 min**

**Causa:** Keepalive JavaScript não está rodando

**Solução:**
1. Verificar se console está aberto
2. Re-executar script keepalive
3. Manter aba do Colab VISÍVEL (não minimizada)

---

### **Problema 5: Worker não recebe jobs**

```
⏳ Aguardando jobs... (por horas)
```

**Causas possíveis:**
1. Sem jobs na fila
2. Job alocado para outro worker
3. Worker offline no backend

**Soluções:**
1. Criar training job via `/admin/training-jobs`
2. Verificar status no dashboard
3. Re-registrar worker (reiniciar script)

---

## 🎯 **Fluxo de Treino End-to-End**

### **1. Preparar Dataset**

```typescript
// Admin Dashboard → Datasets
POST /api/datasets
{
  "name": "AION Instruction Dataset v1",
  "description": "100 conversas curadas",
  "source": "curation_approved"
}
```

### **2. Registrar 14 Workers**

- 7x Colab workers (manual, 5 min)
- 7x Kaggle workers (manual, 5 min)

### **3. Criar Training Job**

```typescript
// Admin Dashboard → Training Jobs
POST /api/training-jobs
{
  "datasetId": 1,
  "modelName": "llama-3-8b",
  "config": {
    "epochs": 3,
    "batchSize": 4,
    "learningRate": 0.0001,
    "loraR": 16,
    "loraAlpha": 32
  },
  "federatedConfig": {
    "enabled": true,
    "totalSteps": 10,  // 10 rodadas de FedAvg
    "workersPerStep": 14  // Todos workers em paralelo
  }
}
```

### **4. Sistema Dispara Automaticamente**

1. **GPUPool.dispatchFederatedChunk()** envia chunk para cada worker
2. **Workers** recebem via POST /federated/train
3. **Workers** treinam LoRA em paralelo
4. **Workers** enviam gradientes via POST /api/gpu/gradients
5. **GradientAggregationCoordinator** detecta conclusão
6. **FedAvg** agrega gradientes → Novo checkpoint
7. **broadcastCheckpoint()** notifica workers
8. **redispatchFederatedWorkers()** envia próxima rodada
9. **Repete 10x** até totalSteps completo

### **5. Workers Desligam Automaticamente**

- Colab: `runtime.unassign()` (automático)
- Kaggle: Notificação para shutdown manual

---

## 📊 **Comparação: Colab vs Kaggle**

| **Aspecto** | **Google Colab FREE** | **Kaggle** |
|------------|---------------------|-----------|
| **GPUs por notebook** | 1x T4 (15GB) | 2x T4 (30GB total) |
| **Quota** | 12h/dia por notebook | 30h/semana total |
| **Notebooks simultâneos** | Até 7 (não documentado) | Até 7 |
| **Keepalive** | JavaScript obrigatório | Opcional |
| **Autoshutdown** | ✅ `runtime.unassign()` | ❌ Manual |
| **Melhor para** | Treinos curtos (<12h) | Treinos longos (9h x múltiplos dias) |

**Recomendação:**
- Use **Colab** para testes e desenvolvimento
- Use **Kaggle** para treino produtivo (mais quota semanal)

---

## 💡 **Otimizações e Boas Práticas**

### **1. Maximizar Uso de Quota**

- **Colab:** 7 notebooks x 12h = 84h GPU/dia
- **Kaggle:** 30h/semana dividido entre workers

**Estratégia:**
- Segunda-feira: Usar Kaggle (30h disponíveis)
- Terça-Sexta: Usar Colab (12h/dia)
- Resultado: ~80h GPU/semana GRÁTIS

### **2. Minimizar Desperdício**

- ✅ Autoshutdown após jobs (economiza GPU ociosa)
- ✅ Fechar workers quando não estiver treinando
- ✅ Monitorar quota no dashboard

### **3. Evitar Bans**

- ❌ **NÃO** deixar GPUs ociosas por horas
- ❌ **NÃO** usar para mineração/cripto
- ❌ **NÃO** tentar contornar limites de tempo
- ✅ Usar apenas para ML/AI legítimo

---

## 🔐 **Segurança**

### **Ngrok Tunnels**

- Túnel ngrok é **público** mas único (https://random.ngrok.io)
- Sem autenticação (qualquer um pode enviar requests)
- **Solução:** Workers validam workerId com AION antes de executar jobs

### **API Tokens**

- Workers não precisam de API keys (registro via POST aberto)
- **Produção:** Adicionar token de autenticação

---

## 📚 **Recursos Adicionais**

- [Colab FAQ Oficial](https://research.google.com/colaboratory/faq.html)
- [Kaggle Notebooks Docs](https://www.kaggle.com/docs/notebooks)
- [Ngrok Documentation](https://ngrok.com/docs)
- [PyTorch Distributed Training](https://pytorch.org/tutorials/beginner/dist_overview.html)

---

## ✅ **Checklist Final - 14 Workers Ativos**

Antes de iniciar treino produtivo:

- [ ] **7 Colab workers** registrados e online
- [ ] **7 Kaggle workers** registrados e online
- [ ] **Keepalive JavaScript** rodando em todos Colabs
- [ ] **Dashboard** mostra 14 workers "online"
- [ ] **Todos heartbeats** < 1 min atrás
- [ ] **Dataset** criado com 100+ exemplos
- [ ] **Training job** criado com federatedConfig

**PRONTO PARA TREINAR! 🚀**

---

**Última atualização:** Novembro 2025  
**Testado em:** Colab FREE, Kaggle FREE  
**Status:** ✅ Production-Ready
