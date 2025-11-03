# 📁 Attached Assets - Gestão de Arquivos

## 🛡️ PASTAS PROTEGIDAS (NÃO DELETAR)

### 1️⃣ `learned_images/`
- **Uso:** Imagens processadas pelo Vision AI
- **Sistema:** `server/learn/image-processor.ts` salva aqui
- **Crítico:** SIM ✅
- **Regra:** NUNCA deletar esta pasta ou seu conteúdo

### 2️⃣ `generated_images/`
- **Uso:** Logos e imagens geradas pelo sistema
- **Conteúdo atual:**
  - `AION_AI_professional_logo_b0ff5d97.png`
  - `AION_AI_logo_icon_95efc0b3.png`
- **Crítico:** SIM ✅
- **Regra:** MANTER para histórico e possível uso futuro

---

## 🗑️ PASTAS/ARQUIVOS QUE PODEM SER LIMPOS

### ❌ Screenshots e Anexos Temporários
- `image_*.png` - Screenshots enviados durante desenvolvimento
- `IMG_*.png` - Fotos temporárias
- `Logo_*.png` - Testes de logo (não usados pelo sistema)
- `Favicon_*.png` - Testes de favicon (não usados)
- `*.jpeg` - Imagens de demonstração
- `stay-cool-cat-nail-file_*.gif` - GIF de teste (não usado pelo sistema)
- Arquivos .txt anexados temporariamente

### ❌ Pastas Vazias
- `stock_images/` - vazia, pode deletar
- `custom_icons/` - vazia, pode deletar

---

## 📝 REGRA DE OURO

**Quando o usuário anexa algo:**

✅ **Para uso pelo sistema** → Vai para `client/public/system/` (assets críticos)
  - Exemplos: favicon, logo oficial, avatar do chat, ícones da UI

❌ **Apenas para demonstração visual** → Fica em `attached_assets/` (pode limpar depois)
  - Exemplos: screenshots, mockups, imagens de exemplo

---

**Última atualização:** 2025-11-03
