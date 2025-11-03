# 🛡️ PASTA PROTEGIDA - NÃO DELETAR

## ⚠️ ATENÇÃO: ARQUIVOS CRÍTICOS DO SISTEMA

Esta pasta contém arquivos **ESSENCIAIS** para o funcionamento do AION.

**NÃO DELETAR** nenhum arquivo desta pasta durante limpezas!

---

## 📁 Arquivos Protegidos

### 1. `favicon.png` (208KB)
- **Uso:** Favicon do site (index.html)
- **Referências:** 4x em `client/index.html`
- **Crítico:** SIM ✅

### 2. `aion-logo.png` (162KB)
- **Uso:** Logo principal da aplicação
- **Referências:** `client/src/components/AionLogo.tsx`
- **Crítico:** SIM ✅

### 3. `cat.gif` (1.9MB)
- **Uso:** Avatar do bot AION no chat
- **Referências:** 4x em `client/src/pages/chat/ChatPage.tsx` (linhas 594, 632, 796, 834)
- **Crítico:** SIM ✅

---

## 🚨 Regras de Limpeza

✅ **MANTER SEMPRE:**
- Todos os arquivos em `client/public/system/`
- Todos os arquivos em `attached_assets/learned_images/` (imagens processadas pelo Vision AI)
- Todos os arquivos em `attached_assets/generated_images/` (logos gerados)

❌ **PODE LIMPAR:**
- Screenshots temporários em `attached_assets/` (image_*.png, IMG_*.png, etc.)
- Arquivos duplicados em `client/public/` (exceto esta pasta)
- PDFs obsoletos em `docs/pdfs/` (documentação já está em .md)

---

**Data de criação:** 2025-11-03  
**Responsável:** Sistema AION  
**Documentação:** replit.md
