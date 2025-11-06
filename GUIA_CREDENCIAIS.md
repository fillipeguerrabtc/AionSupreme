# 📚 GUIA COMPLETO: Como Configurar Credenciais - PASSO A PASSO

## 🎯 RESUMO RÁPIDO (TL;DR)

**Você precisa criar Secrets manualmente?** ❌ **NÃO!**

Você só faz **3 coisas simples**:

1. ✅ Criar `SECRETS_MASTER_KEY` no Replit (uma vez só)
2. ✅ Obter API Key do Kaggle OU senha do Google
3. ✅ Adicionar via Admin Panel (interface bonita)

**AION cuida de TUDO automaticamente!** 🤖

---

## 📊 FLUXO VISUAL COMPLETO

```
┌─────────────────────────────────────────────────────────────┐
│  🔧 CONFIGURAÇÃO INICIAL (Fazer UMA VEZ)                    │
├─────────────────────────────────────────────────────────────┤
│  1. Gerar SECRETS_MASTER_KEY                                │
│     → npx tsx scripts/setup-secrets-encryption.ts           │
│  2. Adicionar no Replit Secrets                             │
│     → Ctrl+K → "Secrets" → Adicionar chave                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  🔑 OBTER CREDENCIAIS (Kaggle OU Google Colab)              │
├─────────────────────────────────────────────────────────────┤
│  OPÇÃO A - Kaggle (Recomendado - Mais Fácil):              │
│    → Kaggle.com → Settings → API → Create Token            │
│    → Baixa arquivo kaggle.json automaticamente             │
│                                                             │
│  OPÇÃO B - Google Colab (Requer App Password):             │
│    → Google Account → Security → 2FA → App Passwords       │
│    → Cria senha de 16 dígitos                              │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  🖥️  ADICIONAR VIA INTERFACE (Super Fácil!)                 │
├─────────────────────────────────────────────────────────────┤
│  1. Admin Panel → GPU Workers                               │
│  2. Clicar "+ Add Worker"                                   │
│  3. Escolher Kaggle ou Colab                                │
│  4. Colar credenciais                                       │
│  5. Clicar "Add Worker"                                     │
│                                                             │
│  ✅ AION automaticamente:                                   │
│     - Criptografa credenciais (AES-256)                     │
│     - Salva no banco de dados                               │
│     - Provisiona worker                                     │
│     - Gerencia tudo pra você                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 PARTE 1: Configurar Criptografia (OBRIGATÓRIO - Fazer PRIMEIRO)

### ✅ Passo 1.1: Gerar a Chave de Criptografia

**O que é isso?**
Uma chave mestra que protege TODAS as suas senhas quando salvas no banco.

**Como fazer:**

1. Abra o terminal do Replit (pressione `Ctrl+\`` ou clique em "Shell")

2. Execute:
```bash
npx tsx scripts/setup-secrets-encryption.ts
```

3. Vai aparecer algo assim:
```
╔════════════════════════════════════════════════════════════════╗
║ nLjCYjqllCLeFC5JHorzQLc6gwe1DEp44wsh6ezVQLI=                   ║
╚════════════════════════════════════════════════════════════════╝
```

4. **COPIE essa chave** (clique na chave e pressione Ctrl+C)

---

### ✅ Passo 1.2: Adicionar no Replit Secrets

**O que é Replit Secrets?**
Um cofre seguro do Replit onde você guarda variáveis sensíveis.

**Como fazer:**

1. **Abra o painel de Secrets:**
   - Pressione `Ctrl+K` (ou `Cmd+K` no Mac)
   - Digite "Secrets"
   - Pressione Enter

   **OU:**
   - Clique em "Tools" (ícone de ferramenta no lado esquerdo)
   - Procure "Secrets" na lista
   - Clique em "Secrets"

2. **Adicione o secret:**
   - Clique em "+ New Secret" (botão azul)
   - Preencha:
     ```
     Key:   SECRETS_MASTER_KEY
     Value: [COLE A CHAVE QUE VOCÊ COPIOU]
     ```
   - Clique "Save"

3. **Pronto!** 🎉
   - O servidor vai reiniciar automaticamente
   - Agora suas credenciais serão criptografadas

---

### ✅ Passo 1.3: Verificar se Funcionou

Execute novamente:
```bash
npx tsx scripts/setup-secrets-encryption.ts
```

**Se funcionou, você verá:**
```
✅ SECRETS_MASTER_KEY já está configurado!
✅ Criptografia funcionando perfeitamente!
✅ Suas credenciais estão SEGURAS 🔒

  🔐 Encryption: ENABLED
  🔑 Key Length: 256 bits (AES-256)
  🛡️  Security: Production-ready
```

**Se não funcionou:**
- Certifique-se de copiar a chave completa (sem espaços)
- Reinicie o servidor (Ctrl+C no terminal, depois `npm run dev`)
- Execute novamente o script

---

## 🔑 PARTE 2: Obter Credenciais (Escolha UMA opção)

Você tem **duas opções**:

### 🅰️ OPÇÃO A: Kaggle (Recomendado - Mais Fácil)

**Por que Kaggle?**
- ✅ Mais fácil de configurar (só precisa de API Key)
- ✅ Não requer senha de aplicativo
- ✅ 30 horas/semana de GPU grátis
- ✅ Mais estável

**Como obter API Key do Kaggle:**

#### Passo A.1: Acessar Kaggle

1. Acesse: **https://www.kaggle.com/**
2. Faça login (ou crie conta se não tiver)

#### Passo A.2: Ir para Settings

1. Clique no **seu avatar** (foto de perfil) no canto superior direito
2. Clique em **"Settings"**

#### Passo A.3: Criar API Token

1. Role a página até a seção **"API"**
2. Clique em **"Create New Token"**
3. **Baixa automaticamente** um arquivo `kaggle.json`

#### Passo A.4: Abrir o arquivo kaggle.json

O arquivo terá este formato:
```json
{
  "username": "seu_usuario_kaggle",
  "key": "abc123xyz456789..."
}
```

**GUARDE essas informações!** Você vai precisar delas depois.

**Exemplo real:**
```json
{
  "username": "joaosilva",
  "key": "1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p"
}
```

---

### 🅱️ OPÇÃO B: Google Colab (Mais Complexo)

**Por que Colab?**
- ✅ GPU T4 grátis
- ✅ Integração com Google Drive
- ⚠️ Requer App Password (mais seguro que senha normal)

**⚠️ IMPORTANTE - Segurança:**
**NÃO use sua senha principal do Google!** Use uma **App Password** (senha de aplicativo).

#### Passo B.1: Habilitar 2-Factor Authentication (2FA)

**Se você JÁ tem 2FA ativado**, pule para o Passo B.2.

1. Acesse: **https://myaccount.google.com/security**
2. Procure "2-Step Verification"
3. Clique em "Turn on 2-Step Verification"
4. Siga as instruções (você vai receber um código no celular)

#### Passo B.2: Criar App Password

1. **Acesse diretamente (mais rápido):**
   👉 **https://myaccount.google.com/apppasswords**

   **OU:**
   - Acesse: https://myaccount.google.com
   - Clique em "Security" (lado esquerdo)
   - Procure por "App Passwords" (use o buscador no topo)
   - Clique em "App Passwords"

2. **Criar o password:**
   - Digite um nome para o app: `AION GPU Worker`
   - Clique "Create"

3. **Copiar a senha:**
   - Vai aparecer uma senha de **16 dígitos** tipo: `abcd efgh ijkl mnop`
   - **COPIE e GUARDE** em um local seguro
   - ⚠️ Você só verá essa senha UMA VEZ!

**Exemplo de App Password:**
```
Email: seu.email@gmail.com
App Password: abcd efgh ijkl mnop
```

---

## 🖥️ PARTE 3: Adicionar Credenciais via Interface (SUPER FÁCIL!)

**Agora você NÃO precisa criar Secrets manualmente!**

Tudo é feito pela **interface visual** do Admin Panel.

### ✅ Passo 3.1: Acessar Admin Panel

1. Abra seu app AION no navegador
2. Faça login (se necessário)
3. Clique em **"Admin"** no menu lateral
4. Clique em **"GPU Workers"**

### ✅ Passo 3.2: Adicionar Worker

1. Clique no botão **"+ Add Worker"** (canto superior direito)

2. Vai abrir um dialog com **2 abas**:
   - **Kaggle** (se você escolheu Opção A)
   - **Google Colab** (se você escolheu Opção B)

### ✅ Passo 3.3A: Se você escolheu Kaggle

1. Clique na aba **"Kaggle"**
2. Preencha os campos:
   ```
   Username: [seu_usuario do kaggle.json]
   API Key:  [key do kaggle.json]
   ```
3. Clique **"Add Worker"**

**Exemplo:**
```
Username: joaosilva
API Key:  1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p
```

### ✅ Passo 3.3B: Se você escolheu Google Colab

1. Clique na aba **"Google Colab"**
2. Preencha os campos:
   ```
   Email:    [seu email do Google]
   Password: [App Password de 16 dígitos]
   ```
3. (Opcional) Cole URL de notebook existente
4. Clique **"Provision Worker"**

**Exemplo:**
```
Email:    seu.email@gmail.com
Password: abcd efgh ijkl mnop
```

---

### ✅ Passo 3.4: Verificar se Funcionou

Após adicionar o worker:

1. **Você verá uma mensagem de sucesso:**
   ```
   ✅ Worker adicionado com sucesso!
   ```

2. **O worker aparecerá na tabela:**
   ```
   Provider: Kaggle (ou Colab)
   Status: Online / Pending
   ```

3. **Suas credenciais estão criptografadas:**
   - No banco de dados: `U2FsdGVkX1+...` (criptografado)
   - Apenas AION consegue descriptografar (usando SECRETS_MASTER_KEY)

---

## 🔒 SEGURANÇA - Perguntas Frequentes

### ❓ Eu preciso te passar minhas senhas?

**NÃO!** Você **adiciona diretamente** pela interface.

**O que acontece:**
1. Você cola credenciais no formulário
2. AION criptografa automaticamente (AES-256)
3. Salva no banco de dados (já criptografado)
4. Eu (agente IA) **nunca vejo** suas credenciais

### ❓ É seguro usar minha senha do Google?

**NÃO use sua senha principal!** Use **App Password**.

**Por quê?**
- ✅ App Password é específica para cada aplicativo
- ✅ Você pode revogar a qualquer momento
- ✅ Não dá acesso total à sua conta
- ❌ Senha principal é MUITO perigoso compartilhar

### ❓ O que é armazenado no banco de dados?

**SEM SECRETS_MASTER_KEY:**
```sql
kaggle_credentials:
  username: "joaosilva"
  api_key: "1a2b3c4d5e6f..."  ← TEXTO PURO! 😱
```

**COM SECRETS_MASTER_KEY:**
```sql
kaggle_credentials:
  username: "joaosilva"
  api_key: "U2FsdGVkX1+..."  ← CRIPTOGRAFADO! 🔒
```

### ❓ Posso usar múltiplas contas Kaggle/Colab?

**SIM!** ✅

Você pode adicionar quantos workers quiser:
- 5 contas Kaggle diferentes
- 3 contas Google diferentes
- Mix de Kaggle + Colab

AION gerencia tudo automaticamente!

---

## 🎯 CHECKLIST FINAL

Antes de começar a usar, verifique:

- [ ] ✅ SECRETS_MASTER_KEY configurado no Replit
- [ ] ✅ Criptografia ativa (executou script e viu "ENABLED")
- [ ] ✅ Credenciais Kaggle OU Google prontas
- [ ] ✅ Worker adicionado via Admin Panel
- [ ] ✅ Worker aparecendo como "Online" na tabela

**Se tudo marcado: PRONTO! 🎉**

---

## 🆘 TROUBLESHOOTING

### ❌ "Encryption is DISABLED" no console

**Solução:**
1. Verifique se criou o secret `SECRETS_MASTER_KEY`
2. Reinicie o servidor (Ctrl+C, depois `npm run dev`)
3. Execute: `npx tsx scripts/setup-secrets-encryption.ts`

### ❌ "Failed to add worker"

**Solução:**
1. Verifique se as credenciais estão corretas
2. Para Kaggle: username e key do `kaggle.json`
3. Para Colab: email + App Password (não senha normal!)

### ❌ "Worker stuck in Pending status"

**Solução:**
1. Aguarde 1-2 minutos (provisionamento demora)
2. Clique em "Refresh" na página
3. Verifique logs no console do servidor

---

## 📚 RESUMO VISUAL (Diagrama)

```
┌─────────────────────────────────────────────────────────────┐
│                    VOCÊ FAZ UMA VEZ                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │  1. Gerar SECRETS_MASTER_KEY        │
        │     (Script automático)              │
        └─────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │  2. Adicionar no Replit Secrets     │
        │     (Ctrl+K → Secrets)              │
        └─────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │  3. Obter credenciais Kaggle/Colab  │
        │     (Kaggle.com ou Google Account)  │
        └─────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  VOCÊ FAZ SEMPRE QUE QUISER                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │  4. Admin Panel → GPU Workers       │
        │     "+ Add Worker"                  │
        └─────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────────┐
        │  5. Colar credenciais               │
        │     (Interface bonita)              │
        └─────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   AION FAZ AUTOMATICAMENTE                  │
├─────────────────────────────────────────────────────────────┤
│  • Criptografa credenciais (AES-256)                        │
│  • Salva no banco de dados                                  │
│  • Provisiona worker Kaggle/Colab                           │
│  • Gerencia workers automaticamente                         │
│  • Balanceia carga entre workers                            │
│  • Monitora saúde e quota                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎓 PRÓXIMOS PASSOS

Agora que você configurou tudo:

1. ✅ Adicione seus primeiros workers
2. ✅ Teste enviando mensagens no chat
3. ✅ AION vai usar os workers automaticamente
4. ✅ Monitore via Admin Panel → GPU Workers

**Divirta-se com IA auto-evolutiva! 🚀**

---

**Dúvidas?** É só perguntar! 😊
