# 🔐 Configuração de Criptografia de Secrets - GUIA RÁPIDO

## O que é SECRETS_MASTER_KEY?

Uma **chave de criptografia** que protege suas credenciais sensíveis quando salvas no banco de dados.

**Status Atual:**
- ❌ **SEM SECRETS_MASTER_KEY**: Credenciais em texto puro (INSEGURO para produção)
- ✅ **COM SECRETS_MASTER_KEY**: Credenciais criptografadas (SEGURO)

---

## 🚀 Setup Automático (3 minutos)

### Passo 1: Gere a chave automaticamente

```bash
npx tsx scripts/setup-secrets-encryption.ts
```

Este comando irá:
- ✅ Gerar uma chave AES-256 segura (256 bits)
- ✅ Testar se funciona
- ✅ Criar backup temporário
- ✅ Mostrar instruções passo a passo

### Passo 2: Copie a chave gerada

O script mostrará algo assim:

```
╔════════════════════════════════════════════════════════════════╗
║ nLjCYjqllCLeFC5JHorzQLc6gwe1DEp44wsh6ezVQLI=                   ║
╚════════════════════════════════════════════════════════════════╝
```

**COPIE** essa chave (Ctrl+C ou clique e copie).

### Passo 3: Configure no Replit Secrets

1. **Abra o painel de Secrets:**
   - Clique em "**Tools**" (lado esquerdo do Replit)
   - Procure por "**Secrets**"
   - Ou pressione `Ctrl+K` e digite "Secrets"

2. **Adicione o secret:**
   - Clique em "+ **New Secret**" ou "**Add Secret**"
   - **Key** (nome): `SECRETS_MASTER_KEY`
   - **Value** (valor): COLE a chave que você copiou
   - Clique em "**Save**"

### Passo 4: Reinicie o servidor

O Replit vai reiniciar automaticamente, mas você pode forçar:
- Pressione `Ctrl+C` no terminal
- Execute: `npm run dev`

### Passo 5: Verifique se funcionou ✅

Execute novamente:

```bash
npx tsx scripts/setup-secrets-encryption.ts
```

Se funcionou, você verá:

```
✅ SECRETS_MASTER_KEY já está configurado!
✅ Criptografia funcionando perfeitamente!
✅ Suas credenciais estão SEGURAS 🔒

═══════════════════════════════════════════════════════
  STATUS ATUAL:
═══════════════════════════════════════════════════════
  🔐 Encryption: ENABLED
  🔑 Key Length: 256 bits (AES-256)
  🛡️  Security: Production-ready
═══════════════════════════════════════════════════════
```

---

## ⚠️ IMPORTANTE - Segurança

### ✅ Faça:
- **Guarde a chave em um password manager** (1Password, LastPass, Bitwarden)
- **Delete o backup temporário** após configurar (`.secrets-backup/`)
- **Use a mesma chave em todos os ambientes** (dev, staging, prod)
- **Configure antes de ir para produção**

### ❌ NÃO Faça:
- ❌ Compartilhar a chave publicamente (GitHub, chat, email)
- ❌ Commitar a chave no git
- ❌ Deixar o backup temporário no projeto
- ❌ Perder a chave (credenciais criptografadas ficam irrecuperáveis)

---

## 🔍 Como funciona?

### Antes (SEM SECRETS_MASTER_KEY):
```sql
-- Banco de dados
kaggle_credentials:
  username: "meu_user"
  api_key: "abc123xyz456"  ← TEXTO PURO! 😱
```

### Depois (COM SECRETS_MASTER_KEY):
```sql
-- Banco de dados
kaggle_credentials:
  username: "meu_user"
  api_key: "U2FsdGVkX1+..."  ← CRIPTOGRAFADO! 🔒
```

---

## 💡 Casos de Uso

### Quando as credenciais são criptografadas?

Sempre que você:
- ✅ Adiciona conta Kaggle via GPU Management UI
- ✅ Provisiona worker Colab com email/senha
- ✅ Salva qualquer secret via SecretsVault service

### O que NÃO é criptografado?

- Environment variables padrão do Replit (já são seguras)
- Dados do PostgreSQL (use encryption at rest se necessário)

---

## 🆘 Troubleshooting

### "SECRETS_MASTER_KEY já está configurado" mas vejo warning?

Reinicie o servidor:
```bash
# Ctrl+C no terminal, depois:
npm run dev
```

### Perdi a chave! E agora?

**Opção 1** - Se você salvou no password manager:
- Configure novamente no Replit Secrets com a mesma chave

**Opção 2** - Se perdeu totalmente:
- Gere uma nova chave (execute o script novamente)
- ⚠️ Credenciais antigas ficam irrecuperáveis
- Você precisará re-adicionar todas as contas Kaggle/Colab

### Como trocar a chave?

1. Delete credenciais antigas do banco de dados
2. Gere nova chave (execute script)
3. Configure no Replit Secrets
4. Re-adicione todas as credenciais

---

## 📚 Referências

- **Algoritmo**: AES-256-CBC (padrão da indústria)
- **Key Size**: 256 bits (32 bytes)
- **Service**: `server/services/secrets-vault.ts`
- **Script**: `scripts/setup-secrets-encryption.ts`

---

## ✨ Próximos Passos

Após configurar a criptografia:

1. ✅ Adicione workers via Admin Panel → GPU Workers
2. ✅ Suas credenciais estarão automaticamente protegidas
3. ✅ Deploy para produção com segurança

**Documentação completa**: `replit.md`
