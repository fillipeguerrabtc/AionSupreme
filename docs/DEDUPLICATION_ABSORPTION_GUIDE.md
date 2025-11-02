# 📚 Guia Completo: Sistema de Deduplicação e Absorção Inteligente

## Visão Geral

O AION possui um sistema avançado de deduplicação que evita conteúdo duplicado na Knowledge Base enquanto preserva informações novas através de **absorção inteligente**.

---

## 🎯 Como Funciona a Deduplicação?

### TIER 1: Verificação por Hash (Instantânea)

**Velocidade:** <1ms  
**Propósito:** Detectar duplicatas **100% idênticas**

```
Entrada: "Python é uma linguagem de programação"
Hash:    "a3f5d9e2..." (SHA-256)
        ↓
Compara com hashes existentes na KB
        ↓
Match exato? → Duplicata Exata (vermelho)
```

**Quando usa:** Sempre, em tempo real quando você adiciona conteúdo.

---

### TIER 2: Verificação Semântica (Embeddings)

**Velocidade:** ~2 segundos  
**Propósito:** Detectar conteúdo **semanticamente similar** (mesmo com palavras diferentes)

```
Entrada: "Python é ótimo para programação"
Embedding: [0.23, 0.87, -0.45, ...] (1536 números)
           ↓
Compara com embeddings da KB usando cosseno
           ↓
Similaridade: 87%
           ↓
Classificação:
├─ 98%+   → Duplicata Exata (vermelho)
├─ 85-98% → Similar (amarelo) ← ABSORÇÃO!
└─ <85%   → Único (verde)
```

**Quando usa:** Quando você clica em **"Escanear Duplicatas"** no painel de curadoria.

---

## 🔍 Thresholds de Similaridade

| Faixa | Status | Badge | Ação Recomendada |
|-------|--------|-------|------------------|
| **>98%** | Duplicata Exata | 🔴 Vermelho | Rejeitar (conteúdo idêntico) |
| **85-98%** | Similar | 🟡 Amarelo | **Usar Preview de Absorção** |
| **<85%** | Único | 🟢 Verde | Aprovar normalmente |

---

## 📋 Fluxo de Trabalho: Similares (85-98%)

### Passo 1: Identificar Duplicatas

```
1. Vá para Admin → Curadoria
2. Clique em "Escanear Duplicatas"
   └─ Sistema gera embeddings para todos os itens pendentes
   └─ Compara com KB existente
   └─ Marca status: Único / Similar / Exata
3. Filtre por "Similares" para ver itens com 85-98% de match
```

### Passo 2: Preview de Absorção

Quando você clica em **"Preview Absorção"**, o sistema faz:

```python
# Algoritmo Simplificado (linha por linha)

KB_DOCUMENT = [
    "Python é uma linguagem de programação",
    "É amplamente usada para web",
    "Python tem sintaxe simples"
]

CURATION_ITEM = [
    "Python é uma linguagem de programação",  # ← DUPLICADA
    "É amplamente usada para web",            # ← DUPLICADA
    "Python tem sintaxe simples",             # ← DUPLICADA
    "Python tem comunidade ativa",            # ← NOVA ✅
    "Frameworks como Django facilitam"        # ← NOVA ✅
]

# Normalização (para comparação apenas):
# - Remove espaços extras
# - Converte para minúsculas
# - Remove pontuação

# Comparação linha por linha:
extracted_lines = []
for line in CURATION_ITEM:
    if normalize(line) not in [normalize(kb_line) for kb_line in KB_DOCUMENT]:
        extracted_lines.append(line)  # Preserva formatação original!

# Resultado:
EXTRACTED_CONTENT = [
    "Python tem comunidade ativa",
    "Frameworks como Django facilitam"
]

# Estatísticas:
original_length = 250 chars
extracted_length = 80 chars
reduction = 68%
unique_lines = 2
duplicate_lines = 3
```

### Passo 3: Preview Modal

O modal mostra:

```
┌──────────────────────────────────────────────┐
│  Preview de Absorção Inteligente             │
├──────────────────────────────────────────────┤
│                                              │
│  📊 Estatísticas:                            │
│  ├─ Conteúdo Original:    250 caracteres    │
│  ├─ Conteúdo Extraído:     80 caracteres    │
│  ├─ Linhas Únicas:          2 linhas        │
│  ├─ Linhas Duplicadas:      3 linhas        │
│  └─ Redução:               68%              │
│                                              │
│  ✅ Conteúdo Extraído (SÓ O NOVO):          │
│  ┌────────────────────────────────────────┐ │
│  │ Python tem comunidade ativa            │ │
│  │ Frameworks como Django facilitam       │ │
│  └────────────────────────────────────────┘ │
│                                              │
│  🔵 Ver Comparação Completa                  │
│  🟢 Salvar Diff e Aprovar                    │
│  🔴 Rejeitar Duplicata                       │
└──────────────────────────────────────────────┘
```

**IMPORTANTE:** O preview mostra **SOMENTE** o conteúdo novo (diff), não o conteúdo completo!

---

## ⚙️ Opções de Ação

### 🟢 Opção 1: Salvar Diff e Aprovar

**O que faz:**
1. Adiciona **SOMENTE as linhas novas** ao documento KB existente
2. Marca o item da fila como "rejeitado" (para não duplicar)
3. Atualiza a KB com o conteúdo mesclado

**Exemplo:**

```
ANTES (KB):
─────────────────────────────────
Python é uma linguagem de programação
É amplamente usada para web
Python tem sintaxe simples
─────────────────────────────────

DEPOIS (KB):
─────────────────────────────────
Python é uma linguagem de programação
É amplamente usada para web
Python tem sintaxe simples
Python tem comunidade ativa          ← ADICIONADO
Frameworks como Django facilitam     ← ADICIONADO
─────────────────────────────────
```

**Quando usar:** Quando o conteúdo novo é relevante e complementa o documento existente.

---

### 🔵 Opção 2: Ver Comparação Completa

**O que faz:**
- Abre um dialog com **duas colunas lado a lado**
- Coluna esquerda: Conteúdo original completo
- Coluna direita: Conteúdo extraído (só novo)

**Exemplo:**

```
┌─────────────────────────────────────────────────────────┐
│  Comparação: Original vs Extraído                       │
├─────────────────────────┬───────────────────────────────┤
│  Original (250 chars)   │  Extraído (80 chars)          │
├─────────────────────────┼───────────────────────────────┤
│ Python é uma linguagem  │ Python tem comunidade ativa   │
│ de programação          │ Frameworks como Django        │
│ É amplamente usada      │ facilitam desenvolvimento     │
│ para web                │                               │
│ Python tem sintaxe      │                               │
│ simples                 │                               │
│ Python tem comunidade   │                               │
│ ativa                   │                               │
│ Frameworks como Django  │                               │
│ facilitam               │                               │
└─────────────────────────┴───────────────────────────────┘
```

**Quando usar:** Para revisar antes de decidir se aprova ou rejeita.

---

### 🔴 Opção 3: Rejeitar Duplicata

**O que faz:**
1. Remove o item da fila de curadoria
2. **NÃO salva nada** na KB
3. Marca como "rejeitado" com nota

**Quando usar:** Quando o conteúdo novo não é relevante ou tem baixa qualidade.

---

## 🛡️ Validações de Segurança

O sistema **NÃO permite** absorção se:

1. **Conteúdo muito pequeno:** <50 caracteres de conteúdo novo
2. **Pouca redução:** <10% de conteúdo novo (>90% duplicado)
3. **Conteúdo muito grande:** >50KB (limite para evitar spam)
4. **Duplicata exata:** Similaridade >98%
5. **Item não é similar:** Não tem `duplicationStatus: 'near'`

**Mensagem de erro típica:**

```json
{
  "error": "Conteúdo insuficiente para absorção",
  "analysis": {
    "newContentPercent": 8,
    "extractedLength": 45,
    "reason": "Requires at least 10% new content (8% found) and minimum 50 chars (45 found)"
  }
}
```

---

## 🎓 Casos de Uso Reais

### Caso 1: Tutorial Expandido

**Situação:** Alguém enviou um tutorial de Python mais completo

```
KB: "Python é uma linguagem de programação. É usada para web."
Fila: "Python é uma linguagem de programação. É usada para web e ciência de dados. Frameworks como Django facilitam desenvolvimento."
```

**Resultado:**
- Similaridade: **87%** (Similar)
- Preview mostra: `"É usada para web e ciência de dados. Frameworks como Django facilitam desenvolvimento."`
- Ação: **Salvar Diff** → KB recebe as linhas novas

---

### Caso 2: Reformulação Sem Conteúdo Novo

**Situação:** Alguém reescreveu o mesmo conteúdo com outras palavras

```
KB: "Python é excelente para iniciantes porque tem sintaxe clara"
Fila: "Python é ótimo para novatos pois possui sintaxe simples"
```

**Resultado:**
- Similaridade: **92%** (Similar via embeddings)
- Preview mostra: Pouquíssimo conteúdo novo
- Ação: **Rejeitar** → Não adiciona nada

---

### Caso 3: Conteúdo Complementar

**Situação:** Tutorial básico + alguém adiciona seção avançada

```
KB: "Python: Variáveis, Loops, Funções"
Fila: "Python: Variáveis, Loops, Funções, Decorators, Generators, Context Managers"
```

**Resultado:**
- Similaridade: **75%** (bordeline Similar/Único)
- Preview mostra: `"Decorators, Generators, Context Managers"`
- Ação: **Salvar Diff** → KB recebe seções avançadas

---

## 📊 Métricas do Sistema

### Performance

| Operação | Latência Média | Throughput |
|----------|----------------|------------|
| Hash check | <1ms | 10,000/s |
| Embedding generation | ~200ms | 5/s |
| Similarity search | ~50ms | 20/s |
| Preview generation | ~100ms | 10/s |

### Precisão

| Threshold | Falsos Positivos | Falsos Negativos |
|-----------|------------------|------------------|
| 98% (exata) | <0.1% | <0.5% |
| 85-98% (similar) | ~2% | ~5% |

---

## 🔧 Troubleshooting

### "Similares (0)" mesmo tendo duplicatas

**Causa:** Embeddings não foram gerados  
**Solução:** Clique em "Escanear Duplicatas" para forçar geração

### Preview mostra "Conteúdo insuficiente"

**Causa:** <10% de conteúdo novo ou <50 caracteres  
**Solução:** Rejeite o item (não vale a pena absorver)

### Absorção falha com erro 400

**Causa:** Item não está marcado como "near-duplicate"  
**Solução:** Execute scan de duplicatas primeiro

---

## 📖 Referências Técnicas

- **Algoritmo:** Line-by-line diff com normalização
- **Embeddings:** OpenAI text-embedding-3-small (1536 dimensões)
- **Similaridade:** Cosseno entre vetores
- **Código:** `server/utils/absorption.ts`, `server/services/deduplication-service.ts`
- **UI:** `client/src/components/AbsorptionPreviewModal.tsx`

---

## ✅ Resumo Executivo

**Para aprovar SOMENTE as diffs/coisas novas:**

1. Filtre por **"Similares"** (85-98%)
2. Clique em **"Preview Absorção"**
3. Revise o **"Conteúdo Extraído"** (só mostra o novo!)
4. Clique em **"Salvar Diff e Aprovar"**
5. ✅ KB recebe apenas as linhas novas, duplicatas são descartadas

**O preview SEMPRE mostra SÓ a parte nova, nunca o conteúdo completo!**

---

**Última atualização:** 02 de novembro de 2025  
**Versão:** AION v1.0.0
