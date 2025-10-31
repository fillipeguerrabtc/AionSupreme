# 🎮 AION GPU Workers - Setup Completo

## 📊 Visão Geral

AION suporta **múltiplas GPUs simultâneas** com rotação automática e quota management inteligente.

### Capacidade Total (5 Colab + 5 Kaggle)
- **10 Workers** rodando ao mesmo tempo
- **~70-80h/dia** de GPU grátis
- **Auto-shutdown** 30min antes dos limites
- **Round-robin** automático entre workers

---

## 🚀 Setup Rápido (15 minutos)

### Passo 1: Configurar Workers

**Para cada conta Google (recomendado: 5 contas):**

1. **Colab Worker:**
   - Abra: `notebooks/colab_worker.ipynb`
   - Upload para Google Colab
   - Edite variáveis:
     ```python
     AION_URL = "https://seu-aion.replit.app"
     ACCOUNT_EMAIL = "conta1@gmail.com"
     WORKER_NAME = "Colab-Account1-T4"
     ```
   - Runtime > Change runtime type > **GPU (T4)**
   - Run All (Ctrl+F9)

2. **Kaggle Worker:**
   - Abra: `notebooks/kaggle_worker.ipynb`
   - Upload para Kaggle Notebooks
   - Edite variáveis (mesmo processo)
   - Settings > Accelerator > **GPU T4 x2** ou **GPU P100**
   - Run All

### Passo 2: Verificar Status

Acesse o Dashboard AION:
```
https://seu-aion.replit.app/admin/gpu-workers
```

Você verá todos os workers online! ✅

---

## 📖 Guia Detalhado

### Limites e Quotas

| Plataforma | Quota por Conta | Sessão Máxima | Nosso Limite (safety) |
|------------|----------------|---------------|----------------------|
| **Google Colab** | ~12h/dia (dinâmico) | 12h | **11.5h** |
| **Kaggle** | 30h/semana | 9h | **8.5h** |

**Margem de Segurança:** Desligamos **30 minutos antes** do limite Google para NUNCA atingir punições.

### Sistema de Auto-Shutdown

Os notebooks monitoram o tempo de execução e **desligam automaticamente**:

```
Colab Worker:
  Start: 08:00
  Shutdown: 19:30 (após 11.5h)
  
  Logs:
  ⏱️  Runtime: 1.0h / 11.5h (remaining: 10.5h)
  ⏱️  Runtime: 5.0h / 11.5h (remaining: 6.5h)
  ⚠️  WARNING: 1 hour until auto-shutdown!
  ⚠️  WARNING: 30 minutes until auto-shutdown!
  🛑 AUTO-SHUTDOWN TRIGGERED
```

### Rotação Automática

AION usa **round-robin + quota tracking**:

```typescript
// Worker Pool (exemplo com 4 workers)
Workers: [
  { id: 1, usage: 45%, safe: ✅ },  // Colab Acc 1
  { id: 2, usage: 68%, safe: ✅ },  // Colab Acc 2
  { id: 3, usage: 72%, safe: ❌ },  // Colab Acc 3 (limite!)
  { id: 4, usage: 30%, safe: ✅ },  // Kaggle Acc 1
]

// AION seleciona automaticamente:
Job 1 → Worker 1 (45% usage)
Job 2 → Worker 2 (68% usage)
Job 3 → Worker 4 (30% usage)  // Pula Worker 3 (>70%)
Job 4 → Worker 1 (round-robin)
```

---

## 🎯 Estratégias de Uso

### Estratégia 1: Máxima Disponibilidade (24/7)
**Objetivo:** Sempre ter GPUs disponíveis

```
Timeline (24h):

00:00 ──┐ Colab 1 (11.5h) ────────────────┐ Offline
11:30                                      │
12:00 ──┐ Colab 2 (11.5h) ────────────────┐ Offline
23:30                                      │
                                           
// Enquanto isso:
00:00 ──┐ Kaggle 1 (8.5h) ────────┐ Offline
08:30                             │
09:00 ──┐ Kaggle 2 (8.5h) ────────┐ Offline
17:30                             │
18:00 ──┐ Kaggle 3 (8.5h) ────────┐ Offline
```

**Resultado:** Sempre 2-3 GPUs online ao mesmo tempo!

### Estratégia 2: Burst Training (Treino Intensivo)
**Objetivo:** Máximo poder de computação por período curto

```
Ligue TODOS os 10 workers ao mesmo tempo:
- 5 Colab (T4)
- 5 Kaggle (P100/T4)

Resultado: 10 GPUs em paralelo!
Duração: ~8h (menor limite)
```

### Estratégia 3: Economia de Quota
**Objetivo:** Preservar quota para momentos críticos

```
Use apenas 2-3 workers por vez
Mantenha 70% dos workers em standby
Ligue mais workers apenas quando necessário
```

---

## 🔧 Manutenção

### Quando um Worker Desliga

**Automático:**
1. Worker envia status "offline" para AION
2. AION remove worker da rotação
3. Jobs vão para próximo worker disponível
4. Dashboard mostra alerta: "🔴 Worker 1 offline"

**Manual:**
5. Você abre o notebook novamente
6. Run All
7. Worker registra automaticamente
8. AION detecta e adiciona de volta à rotação

### Resetar Quota Semanal

**Kaggle:**
- Reset automático (rolling 7 dias)
- Verificar em: https://www.kaggle.com/me/account

**Colab:**
- Cooldown dinâmico (12-24h após uso intenso)
- Sem dashboard oficial

### Monitoramento no Dashboard AION

```
📊 GPU Pool Status:
  Total Workers: 10
  Online: 7
  Safe (< 70% quota): 5
  Warning (70-90%): 2
  Critical (> 90%): 0
  
  Total Available Hours: 45.2h
  Pool Utilization: 56%
```

---

## 🎮 Uso Avançado

### Múltiplas Contas Google

**Por que 5 contas?**
- Colab: 5 × ~12h = ~60h/dia potencial
- Kaggle: 5 × 30h/sem = 150h/sem

**Como gerenciar:**
1. Use Chrome Profiles separados
2. Ou navegadores diferentes (Chrome, Firefox, Edge, Brave, Opera)
3. Ou modo anônimo + login/logout

### Priorização de Workers

Edite `server/gpu/quota-manager.ts`:

```typescript
// Preferir Kaggle (mais estável)
const sortedWorkers = safeWorkers.sort((a, b) => {
  if (a.workerType === 'kaggle' && b.workerType !== 'kaggle') return -1;
  return a.utilizationPercentage - b.utilizationPercentage;
});
```

### Auto-Restart Notebooks (Experimental)

**Não recomendado** - Google pode bloquear por automação excessiva.

Mas se quiser experimentar:
```python
# Adicione ao final do notebook
import time
from IPython.display import Javascript

time.sleep(11.5 * 3600)  # Aguarda shutdown
display(Javascript('window.location.reload()'))  # Tenta recarregar
```

---

## 🐛 Troubleshooting

### Worker não registra

**Erro:** `Registration failed: Connection refused`

**Solução:**
1. Verifique `AION_URL` está correto
2. Teste: `curl https://seu-aion.replit.app/api/health`
3. Verifique firewall/CORS no Replit

### Worker desliga antes do tempo

**Possível causa:** Google detectou uso não-interativo

**Solução:**
1. Mantenha aba do notebook aberta
2. Interaja ocasionalmente (scroll, clique)
3. Use extensões "Colab Keep Alive" (use com cuidado)

### Quota excedida rapidamente

**Causa:** Uso intensivo prévio

**Solução:**
1. Aguarde cooldown (12-24h para Colab)
2. Use contas alternativas
3. Reduza tempo de sessão (ex: 8h ao invés de 11.5h)

### Múltiplos workers mesmo email

**Erro:** Account collision

**Solução:**
- Use emails diferentes para cada worker
- Ou adicione sufixo no WORKER_NAME: `Colab-Acc1-Session1`, `Colab-Acc1-Session2`

---

## 📚 Referências

- [Google Colab FAQ](https://research.google.com/colaboratory/faq.html)
- [Kaggle GPU Usage](https://www.kaggle.com/docs/efficient-gpu-usage)
- [Replit Deployment](https://docs.replit.com/deployment/about-deployments)

---

## ✅ Checklist de Setup

- [ ] Criar 5 contas Google (ou usar existentes)
- [ ] Upload colab_worker.ipynb para Colab (5×)
- [ ] Upload kaggle_worker.ipynb para Kaggle (5×)
- [ ] Configurar AION_URL em todos notebooks
- [ ] Ativar GPU em todos notebooks
- [ ] Run All em todos notebooks
- [ ] Verificar Dashboard AION
- [ ] Confirmar 10 workers online
- [ ] Testar job de inferência
- [ ] Monitorar auto-shutdown (aguardar 11.5h)
- [ ] Verificar rotação automática

**Pronto! Você agora tem um cluster de 10 GPUs grátis com rotação automática! 🎉**
