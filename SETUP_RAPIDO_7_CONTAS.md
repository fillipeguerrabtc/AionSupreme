# 🚀 Setup Rápido - 7 Contas Google (AION GPU Workers)

## 🎯 Objetivo
Configurar **7 GPU workers grátis** em ~30 minutos para treinar seu LLM próprio sem restrições!

**Capacidade Total:** ~50-60h/dia de GPU grátis

---

## 📋 Suas 7 Contas

Vamos usar:
- **5 Contas → Google Colab** (12h/dia cada = 60h/dia total)
- **2 Contas → Kaggle** (30h/semana cada = ~8.5h/dia total)

**Total: ~68h/dia de GPU T4/P100 grátis!** 🎉

---

## 🔧 Setup em 3 Passos

### PASSO 1: Informações Necessárias

**URL do seu AION:**
```
https://workspace-fillipebackup.replit.app
```

**Suas 7 Contas Google:**
```
Conta 1: _____________@gmail.com
Conta 2: _____________@gmail.com
Conta 3: _____________@gmail.com
Conta 4: _____________@gmail.com
Conta 5: _____________@gmail.com
Conta 6: _____________@gmail.com (Kaggle)
Conta 7: _____________@gmail.com (Kaggle)
```

---

### PASSO 2: Configurar Workers no Colab (Contas 1-5)

**Para cada uma das 5 contas:**

1. **Login na conta Google**
2. **Abrir:** https://colab.research.google.com/
3. **Upload:** `notebooks/colab_worker.ipynb` (deste projeto)
4. **Runtime > Change runtime type > GPU (T4)**
5. **Editar célula 2:**
   ```python
   AION_URL = "https://workspace-fillipebackup.replit.app"
   ACCOUNT_EMAIL = "sua-conta-1@gmail.com"  # ← TROCAR
   WORKER_NAME = "Colab-Conta1-T4"  # ← TROCAR (Conta1, Conta2, etc.)
   ```
6. **Run All (Ctrl+F9)**
7. **Aguardar:** "✅ WORKER IS ONLINE AND READY!"

**Pronto!** Worker #1 conectado. Repita para contas 2-5.

---

### PASSO 3: Configurar Workers no Kaggle (Contas 6-7)

**Para cada uma das 2 contas Kaggle:**

1. **Login na conta Google**
2. **Abrir:** https://www.kaggle.com/code
3. **New Notebook**
4. **Upload:** `notebooks/kaggle_worker.ipynb`
5. **Settings > Accelerator > GPU T4 x2** (ou P100)
6. **Editar primeira célula:**
   ```python
   AION_URL = "https://workspace-fillipebackup.replit.app"
   ACCOUNT_EMAIL = "sua-conta-6@gmail.com"  # ← TROCAR
   WORKER_NAME = "Kaggle-Conta6-T4"  # ← TROCAR
   ```
7. **Run All**
8. **Aguardar:** "✅ KAGGLE WORKER IS ONLINE!"

**Pronto!** Worker #6 conectado. Repita para conta 7.

---

## 🎛️ Verificar Status

**Acesse o Admin Dashboard:**
```
https://workspace-fillipebackup.replit.app/admin
```

**Clique em:** GPU Management

**Você verá:**
```
✅ Colab-Conta1-T4  (Tesla T4, 15GB VRAM) - Online
✅ Colab-Conta2-T4  (Tesla T4, 15GB VRAM) - Online
✅ Colab-Conta3-T4  (Tesla T4, 15GB VRAM) - Online
✅ Colab-Conta4-T4  (Tesla T4, 15GB VRAM) - Online
✅ Colab-Conta5-T4  (Tesla T4, 15GB VRAM) - Online
✅ Kaggle-Conta6-T4 (Tesla T4, 15GB VRAM) - Online
✅ Kaggle-Conta7-P100 (Tesla P100, 16GB VRAM) - Online

Pool Health: 7/7 workers online
Total Available: ~68h/dia
```

---

## 🤖 Começar o Treinamento

### Opção 1: Auto-Evolution (Automático)

AION já está coletando conversas de alta qualidade automaticamente!

**Ativar:**
1. Admin Dashboard > Auto-Evolution
2. Click "Enable Auto-Evolution"
3. Configurar:
   - Min Quality Score: 60
   - Min Conversations: 100
   - Auto-Train Interval: Weekly

**Sistema:**
- ✅ Coleta conversas de alta qualidade
- ✅ Exporta para formato JSONL (Alpaca/Instruct)
- ✅ Treina LoRA models automaticamente nos workers
- ✅ Atualiza modelos em produção

### Opção 2: Dataset Manual

**Upload seu próprio dataset:**
1. Admin Dashboard > Datasets
2. Click "Upload Dataset"
3. Formato: JSONL (Alpaca/Instruct)
   ```json
   {"instruction": "Pergunta", "input": "", "output": "Resposta"}
   ```
4. Click "Train Model"
5. Selecionar workers disponíveis
6. Iniciar treinamento

---

## 📊 Cronograma Recomendado (24/7)

Para **máxima disponibilidade**, escalone os horários:

```
Timeline (24h):

00:00 ──┐ Colab-1 (11.5h) ────────────────┐ Offline
11:30 ──┘                                  │
12:00 ──┐ Colab-2 (11.5h) ────────────────┐ Offline
23:30 ──┘                                  │

06:00 ──┐ Colab-3 (11.5h) ────────────────┐ Offline
17:30 ──┘                                  │

09:00 ──┐ Colab-4 (11.5h) ────────────────┐ Offline
20:30 ──┘                                  │

15:00 ──┐ Colab-5 (11.5h) ────────────────┐ Offline
02:30 ──┘                                  │

// Enquanto isso:
00:00 ──┐ Kaggle-6 (8.5h) ────────┐ Offline
08:30 ──┘                          │

12:00 ──┐ Kaggle-7 (8.5h) ────────┐ Offline
20:30 ──┘                          │
```

**Resultado:** Sempre 3-4 GPUs online ao mesmo tempo! ✅

---

## 🔄 Sistema Auto-Shutdown

**IMPORTANTE:** Workers desligam automaticamente 30min ANTES dos limites:

- **Colab:** Desliga após 11.5h (limite: 12h)
- **Kaggle:** Desliga após 8.5h (limite: 9h)

**Isso garante:**
- ❌ NUNCA atinge punições do Google
- ✅ Preserva quotas para próximas sessões
- ✅ Rotação automática entre workers

**Logs que você verá:**
```
⏱️  Runtime: 5.0h / 11.5h (remaining: 6.5h)
⚠️  WARNING: 1 hour until auto-shutdown!
⚠️  WARNING: 30 minutes until auto-shutdown!
🛑 AUTO-SHUTDOWN TRIGGERED
```

---

## ➕ Adicionar Mais Workers (Plug&Play)

**Quando quiser adicionar mais GPUs:**

1. Abrir Colab/Kaggle em nova conta
2. Upload notebook (`colab_worker.ipynb` ou `kaggle_worker.ipynb`)
3. Editar 3 variáveis:
   ```python
   AION_URL = "https://workspace-fillipebackup.replit.app"
   ACCOUNT_EMAIL = "nova-conta@gmail.com"
   WORKER_NAME = "Colab-Conta8-T4"
   ```
4. Run All

**Pronto!** Worker conecta automaticamente. ZERO configuração no servidor.

---

## 🎯 Quota Tracking

AION monitora automaticamente o uso de cada worker:

**Safety Margin:** Usa apenas **70% da quota** disponível

```
Worker Pool Status:

Colab-1: 45% usado (✅ Safe)
Colab-2: 68% usado (✅ Safe)
Colab-3: 72% usado (⚠️  Near limit - AION para de usar)
Colab-4: 30% usado (✅ Safe)
Colab-5: 55% usado (✅ Safe)
Kaggle-6: 40% usado (✅ Safe)
Kaggle-7: 25% usado (✅ Safe)
```

**Round-Robin:** AION distribui jobs automaticamente entre workers safe.

---

## 🚨 Troubleshooting

### Worker não conecta?

**Verificar:**
1. ✅ AION_URL está correto (https://workspace-fillipebackup.replit.app)
2. ✅ Runtime type é **GPU** (não CPU)
3. ✅ Ngrok túnel está ativo (deve aparecer: "✅ Worker accessible at: https://...")
4. ✅ AION está rodando (acesse https://workspace-fillipebackup.replit.app)

### Worker desconecta sozinho?

**Normal!** Auto-shutdown após 11.5h (Colab) ou 8.5h (Kaggle).

**Solução:** Apenas reabrir o notebook e Run All novamente.

### Quota excedida?

**AION previne isso automaticamente!** Workers desligam 30min antes do limite.

Mas se acontecer:
- Aguardar reset semanal (segunda 00:00 UTC)
- Usar outras contas enquanto isso

---

## 📈 Métricas Esperadas

**Com 7 workers:**

| Métrica | Valor |
|---------|-------|
| **GPUs simultâneas** | 3-4 (média) |
| **Horas/dia total** | ~68h |
| **Training jobs/dia** | ~10-15 |
| **Dataset size** | Cresce automaticamente |
| **Model updates** | Semanal (ou manual) |

---

## 🎉 Pronto para Produção!

**Após setup:**

1. ✅ 7 workers online
2. ✅ Auto-Evolution ativado
3. ✅ Training data collection rodando
4. ✅ Quota tracking ativo
5. ✅ Auto-shutdown configurado

**Agora você tem:**
- 🆓 ~68h/dia de GPU grátis
- 🤖 Sistema auto-evolutivo
- 🔒 LLM próprio sem restrições
- 🔄 Rotação automática de workers
- 📈 Melhoria contínua

---

## 📞 Suporte

**Problemas?**
1. Checar Admin Dashboard > GPU Management
2. Ver logs dos workers (Colab/Kaggle output)
3. Verificar AION logs (Replit console)

**Adicionar mais GPUs?**
- Apenas repetir Passo 2 ou 3 com novas contas
- Sistema aceita quantas contas você tiver!

---

**Tempo estimado de setup:** 30-40 minutos (para 7 workers)  
**Resultado:** Sistema autônomo de treinamento com GPU grátis 24/7

🚀 **Bora treinar seu LLM sem restrições!**
