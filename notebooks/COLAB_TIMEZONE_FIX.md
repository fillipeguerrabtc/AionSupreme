# 🔧 Correção de Discrepância de Timezone - Colab Worker

## 🐛 Problema Identificado

Havia **duas** discrepâncias entre o Colab e o Dashboard:

### 1. **MAX_RUNTIME_HOURS Incorreto**
- **Antes:** `11.5h` (30min antes do limite de 12h)
- **Depois:** `10.0h` (2h antes do limite de 12h)
- **Impacto:** O Colab mostrava shutdown às 13:16h, mas deveria ser às 13:13h

### 2. **Timezone Inconsistente**
- **Problema:** O Colab usava `datetime.now()` sem timezone, pegando o horário local do servidor do Google
- **Problema:** O Dashboard calculava em UTC e convertia depois
- **Resultado:** Discrepância de ~3h nos cálculos

## ✅ Correções Implementadas

### 1. MAX_RUNTIME_HOURS Corrigido
```python
MAX_RUNTIME_HOURS = 10.0  # Desliga 2h antes do limite de 12h do Colab
```

### 2. Timezone America/Sao_Paulo em TODOS os cálculos
```python
import pytz

# Célula Flask/Ngrok
start_time = datetime.now(pytz.timezone("America/Sao_Paulo"))

# Célula Auto-Shutdown
start_time = datetime.now(pytz.timezone("America/Sao_Paulo"))
shutdown_time = start_time + timedelta(hours=MAX_RUNTIME_HOURS)
now = datetime.now(pytz.timezone("America/Sao_Paulo"))

# Célula Heartbeat
now = datetime.now(pytz.timezone("America/Sao_Paulo"))
```

### 3. Prints Clarificados
```python
print(f"🛑 Auto-shutdown programado: {shutdown_time.strftime('%H:%M:%S')} (São Paulo)")
print(f"Auto-shutdown: {shutdown_time.strftime('%H:%M:%S')} (São Paulo)")
```

## 📋 Como Usar o Notebook Atualizado

### Passo 1: Deletar Worker Atual (se existir)
No Dashboard AION > Gerenciamento GPUs:
1. Clique no botão **🗑️ Delete** do Worker #8
2. Confirme a exclusão

### Passo 2: Abrir Novo Colab
1. Vá para [Google Colab](https://colab.research.google.com/)
2. Clique em **Upload** e selecione `notebooks/colab_worker.ipynb`

### Passo 3: Configurar Runtime
1. **Runtime** > **Change runtime type**
2. Selecione **GPU** (T4)
3. Clique **Save**

### Passo 4: Preencher Configurações
Na **Célula 2** (Configuração):
```python
AION_URL = "https://ff2e6297-cbf6-4c2e-ac26-3872e4c9c3ae-00-1vce3mtitdkqj.janeway.replit.dev"
ACCOUNT_EMAIL = "becodobatmansuites@gmail.com"  # Seu email Google
WORKER_NAME = "Colab-Worker-1"  # Nome único
```

### Passo 5: Rodar Tudo
1. Pressione **Ctrl+F9** (ou **Runtime** > **Run all**)
2. Aguarde ~2 minutos para setup completo
3. Verifique os prints:

```
✅ JavaScript Keep-Alive ATIVADO!
✅ Flask server started on port 5000
✅ Ngrok authenticated successfully!
✅ Worker accessible at: https://xxxx.ngrok.io
✅ Registered successfully! Worker ID: 9
⏰ Auto-shutdown configured: 10.0h runtime limit
🛑 Will shutdown at: 13:13:07 (São Paulo)  ← AGORA CORRETO!
💓 Heartbeat started (60s interval) with runtime tracking
```

### Passo 6: Verificar no Dashboard
No Dashboard AION > Gerenciamento GPUs:
- **Status:** ✅ Healthy
- **Tempo Restante:** ~10h (countdown correto!)
- **Auto-Shutdown:** 10:00h (2h antes do limite)

## 🎯 Resultado Esperado

### Antes (❌ Incorreto):
- **Colab dizia:** "Shutdown às 13:16h (quase 10h restantes)"
- **Dashboard dizia:** "6h 41m restantes"
- **Discrepância:** ~3.5 horas

### Depois (✅ Correto):
- **Colab diz:** "Shutdown às 13:13h (São Paulo)"
- **Dashboard diz:** "9h 58m restantes"
- **Acordo:** 100% sincronizado!

## 📊 Validação

Após rodar o notebook atualizado, você deve ver:

1. **No Colab:**
   ```
   🛑 Auto-shutdown programado: 13:13:07 (São Paulo)
   Runtime: 0.0h / 10.0h (remaining: 10.0h)
   ```

2. **No Dashboard:**
   ```
   Tempo Restante: 9h 58m 30s
   ```

3. **Ambos concordam:** ✅

## 🔍 Debug

Se ainda houver discrepância:
1. Verifique se usou o notebook atualizado
2. Confirme que o worker foi deletado e recriado
3. Verifique no Console do navegador (F12) se há erros
4. Cheque os logs do servidor AION

---

**Data da Correção:** 2025-10-31  
**Versão do Notebook:** v1.1 (com timezone fix)
