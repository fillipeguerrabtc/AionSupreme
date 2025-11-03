# 🚀 Guia Passo a Passo - Google Colab Setup

**Tempo total: ~10 minutos**

---

## ✅ **SUAS API KEYS - VERIFICAÇÃO**

Você JÁ TEM todas as keys necessárias no Replit Secrets:

```
✅ OPENAI_API_KEY          (fallback final)
✅ GROQ_API_KEY             (14.4k req/dia - prioridade 1)
✅ GEMINI_API_KEY           (1.5k req/dia - prioridade 2)
✅ HUGGINGFACE_API_KEY      (720 req/dia - prioridade 3)
✅ OPEN_ROUTER_API_KEY      (50 req/dia - prioridade 4)
✅ DATABASE_URL             (PostgreSQL Neon)
✅ SESSION_SECRET           (segurança)
```

**Falta apenas:**
- ❌ **NGROK_AUTH_TOKEN** - Vamos obter agora (Passo 1)

---

## 📋 **ESCLARECIMENTO - ARQUITETURA**

### **O que é "Computing Gratuito"?**

```
┌─────────────────────────────────────────────────┐
│ REPLIT (Sempre Online)                          │
│ • Frontend React (chat interface)               │
│ • Backend Node.js (orquestrador)                │
│ • PostgreSQL (Neon) - dados permanentes         │
│ • Free APIs - fallback quando GPU offline       │
│                                                  │
│ NÃO PRECISA DE GPU AQUI! ✅                     │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ GOOGLE COLAB (Computing Gratuito = GPU T4)     │
│ • Llama 3 8B (modelo LLM)                       │
│ • FastAPI (servidor HTTP)                       │
│                                                  │
│ AQUI RODA SEU LLM PRÓPRIO! 🚀                   │
└─────────────────────────────────────────────────┘
```

**Resumo:**
- **Replit** = Orquestrador (frontend + coordenação) - **SEM GPU**
- **Google Colab** = Worker (GPU + LLM + Tor) - **COM GPU GRÁTIS**
- **Comunicação** = Replit chama Colab via HTTP (Ngrok)

**Você NÃO faz deploy no Google!** Apenas copia/cola script e roda.

---

## 🎯 **PASSO A PASSO COMPLETO**

### **PASSO 1: Obter Token Ngrok (2 min)**

**O que é Ngrok?** 
- Cria túnel público para servidor local
- Permite Replit acessar seu Colab

**Como obter:**

1. Acesse: **https://dashboard.ngrok.com/signup**
2. Faça cadastro (pode usar Google login)
3. Após login, vá em: **https://dashboard.ngrok.com/get-started/your-authtoken**
4. Copie o token (exemplo: `2abc123def456...`)

**Salve esse token!** Vamos usar no Passo 4.

---

### **PASSO 2: Abrir Google Colab (1 min)**

1. Acesse: **https://colab.research.google.com**
2. Faça login com sua conta Google
3. Clique em **"Arquivo" → "Novo notebook"**
4. Vai abrir notebook vazio

---

### **PASSO 3: Configurar GPU (30 seg)**

No notebook que abriu:

1. Menu **"Ambiente de execução" → "Alterar tipo de ambiente de execução"**
   
   (Inglês: **"Runtime" → "Change runtime type"**)

2. Em **"Acelerador de hardware"** selecione: **GPU**

   (Inglês: **"Hardware accelerator"** → **GPU**)

3. Clique **"Salvar"**

**✅ Pronto!** Você ganhou GPU T4 grátis (16GB VRAM, ~$0.50/hora se fosse pago)

---

### **PASSO 4: Copiar Script All-in-One (1 min)**

1. Abra este arquivo no Replit:
   ```
   training/colab/AION_ALL_IN_ONE.py
   ```

2. **Selecione TODO o código** (Ctrl+A)

3. **Copie** (Ctrl+C)

4. Volte ao Colab

5. **Cole no notebook** (Ctrl+V)

**Resultado:** Você terá um código Python gigante (~500 linhas)

---

### **PASSO 5: Executar Script (5 min de espera)**

No Colab:

1. Clique em **"Ambiente de execução" → "Executar tudo"**
   
   (Inglês: **"Runtime" → "Run all"**)

2. **Primeira pergunta** vai aparecer:
   ```
   Digite a URL do seu AION Replit (ex: https://xxx.repl.co):
   ```
   
   **Cole:** `https://seu-projeto.replit.dev`
   
   *(Substitua pelo SEU URL do Replit!)*

3. **Segunda pergunta:**
   ```
   Digite seu Ngrok Auth Token:
   ```
   
   **Cole o token que você pegou no Passo 1**

4. **Aguarde ~5 minutos** enquanto instala:
   - Tor Browser
   - Llama 3 8B
   - FastAPI
   - Todas dependências

---

### **PASSO 6: Verificar Sucesso (30 seg)**

Após 5 minutos, você verá:

```
🎉 SETUP COMPLETO!
========================================================
🔗 URL Pública: https://xyz123.ngrok.io
✅ Tor: localhost:9050 (SOCKS5)
✅ GPU: Tesla T4
✅ Modelo: Llama 3 8B
========================================================

✅ GPU registrada no AION com sucesso!
   O AION agora pode usar esta GPU automaticamente.
```

**Se viu isso = DEU CERTO! 🎉**

---

### **PASSO 7: Testar no Replit (1 min)**

Volte ao Replit e execute:

```bash
curl https://seu-url.repl.co/api/gpu/status
```

**Resposta esperada:**

```json
{
  "registeredGPUs": {
    "colab": {
      "url": "https://xyz123.ngrok.io",
      "status": "healthy",
      "capabilities": {
        "tor_enabled": true,
        "model": "llama-3-8b",
        "gpu": "Tesla T4"
      }
    }
  }
}
```

**✅ FUNCIONOU!** Seu AION agora usa GPU grátis do Google!

---

## 🎊 **O QUE ACONTECEU?**

### **Antes:**
```
User → Replit → Groq/Gemini/HF APIs
                (APIs externas censuradas)
```

### **Agora:**
```
User → Replit → Google Colab (SEU Llama 3 8B)
                ↓ (se Colab offline)
                Groq/Gemini/HF (fallback)
```

**Benefícios:**
- ✅ **Sem censura** (seu modelo, suas regras)
- ✅ **Gratuito** (12h/sessão, ~84h/semana)
- ✅ **Privado** (dados não saem do Google)

---

## ⚠️ **LIMITAÇÕES E SOLUÇÕES**

### **1. Sessão expira após 12h**

**Problema:** Colab desconecta após 12h ou 90 min inativo

**Solução automática:** Script tem keep-alive (mantém vivo)

**Solução manual:** Re-execute o script (demora 2 min)

### **2. GPU nem sempre disponível**

**Problema:** Google pode não ter GPU T4 livre

**Solução:** 
- Tente outro horário (madrugada funciona melhor)
- Use Kaggle (30h/semana garantidas)
- AION automaticamente usa fallback APIs

### **3. Ngrok muda URL a cada sessão**

**Problema:** Cada vez que reinicia, URL muda

**Solução:** Script auto-registra nova URL no AION

---

## 🔄 **ROTAÇÃO DE GPUs (OPCIONAL)**

Quer aumentar disponibilidade? Configure Kaggle também:

### **Kaggle Setup (5 min)**

1. Acesse: **https://www.kaggle.com**
2. Crie conta (gratuita)
3. **Settings → Phone Verification** (obrigatório para GPU)
4. **Create → New Notebook**
5. **Accelerator → GPU T4 x2**
6. Cole MESMO script do Colab
7. Na linha 44, mude:
   ```python
   "provider": "kaggle"  # ao invés de "colab"
   ```

**Resultado:** 30h/semana GARANTIDAS (vs Colab que pode falhar)

---

## 📊 **CHECKLIST FINAL**

Marque conforme completa:

- [ ] Obtive token Ngrok
- [ ] Abri Google Colab
- [ ] Configurei GPU T4
- [ ] Copiei script AION_ALL_IN_ONE.py
- [ ] Executei script (5 min)
- [ ] Vi mensagem "SETUP COMPLETO"
- [ ] Testei `/api/gpu/status` no Replit
- [ ] Recebi resposta com "status: healthy"

**Se marcou TUDO = FUNCIONOU! 🎉**

---

## 🆘 **PROBLEMAS COMUNS**

### **Erro: "GPU não disponível"**

```
❌ ERRO: GPU não disponível!
   Vá em Runtime > Change runtime type > GPU
```

**Solução:** Você esqueceu Passo 3. Configure GPU e rode novamente.

---

### **Erro: "Tor não verificado"**

```
⚠️  Tor instalado mas não verificado
```

**Solução:** Ignorar (Tor está rodando, apenas verificação falhou). Continue.

---

### **Erro: "Erro conectando ao AION"**

```
⚠️  Erro conectando ao AION: timeout
```

**Solução:** 
1. Verifique URL do Replit está correto
2. Certifique-se que Replit está online
3. Registre manualmente depois (guia abaixo)

**Registro manual:**

```bash
curl -X POST https://seu-replit.repl.co/api/gpu/register \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "colab",
    "ngrok_url": "https://xyz123.ngrok.io",
    "capabilities": {
      "tor_enabled": true,
      "model": "llama-3-8b"
    }
  }'
```

---

## 🎓 **PRÓXIMOS PASSOS (OPCIONAL)**

### **Treinar Modelo Próprio**

Após coletar ~5k conversas (1-2 semanas de uso):

1. Execute `training/colab/COLAB_FINE_TUNING.py`
2. Aguarde 8-12h (treino LoRA)
3. Modelo fica especializado no seu domínio!

### **Adicionar Mais Providers**

- **Modal.com**: $30 créditos grátis (GPU A100)
- **Lightning.ai**: 22h GPU/mês grátis
- **Paperspace**: $10 créditos iniciais

---

## 💡 **DICAS AVANÇADAS**

### **Manter Colab Sempre Ativo**

O script já tem keep-alive automático, mas você pode:

1. Instalar extensão Chrome: "Colab Auto-Reconnect"
2. Abrir aba do Colab em segundo plano
3. Deixar rodando 24/7

### **Múltiplas Contas Google**

Crie 3-4 contas Google:
- Conta 1: Segunda/Terça (12h/dia × 2 = 24h)
- Conta 2: Quarta/Quinta (24h)
- Conta 3: Sexta/Sábado (24h)
- Conta 4: Domingo (12h)

**Total: ~84h/semana** em UMA plataforma!

---

## 📞 **SUPORTE**

Dúvidas? Veja documentação completa em:
- `DEPLOYMENT_COMPLETE.md` - Guia técnico completo
- `docs/FREE_GPU_API_STRATEGY.md` - Estratégia de infraestrutura
- `docs/MATHEMATICAL_FOUNDATIONS.md` - Fundamentos LoRA

---

**Criado com ❤️ para AION - Autonomous AI System**
