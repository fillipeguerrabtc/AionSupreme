# AION - Fundamentos Matemáticos

## 🔴 REGRA FUNDAMENTAL ETERNA

**PORTUGUÊS**: A IA DEVE SEMPRE nascer COMPLETAMENTE LIVRE, SEM LIMITAÇÕES DE FÁBRICA em relação a moral, ética ou leis. Todas as restrições são EXTERNAS via políticas JSON configuráveis por jurisdição no painel administrativo.

**ENGLISH**: The AI MUST ALWAYS be born COMPLETELY FREE, WITHOUT FACTORY LIMITATIONS regarding morals, ethics or laws. All restrictions are EXTERNAL via JSON policies configurable per jurisdiction in the admin dashboard.

---

## 📋 Índice

1. [Transformer Architecture](#transformer-architecture)
2. [Mixture of Experts (MoE)](#mixture-of-experts-moe)
3. [Attention Mechanism](#attention-mechanism)
4. [Positional Encoding (RoPE)](#positional-encoding-rope)
5. [LoRA & Fine-tuning](#lora--fine-tuning)
6. [RLHF & PPO](#rlhf--ppo)
7. [RAG & Vector Similarity](#rag--vector-similarity)
8. [POMDP & Agent Decision Making](#pomdp--agent-decision-making)
9. [Scaling Laws](#scaling-laws)
10. [Optimization](#optimization)

---

## 🧠 Transformer Architecture

### Self-Attention Mechanism

**Definição**: Mecanismo que permite ao modelo "prestar atenção" em diferentes partes da sequência de entrada.

**Fórmula**:
```
Attention(Q, K, V) = softmax(QK^T / √d_k) · V
```

Onde:
- `Q` (Query): matriz de consultas (n × d_k)
- `K` (Key): matriz de chaves (n × d_k)
- `V` (Value): matriz de valores (n × d_v)
- `d_k`: dimensão das chaves (usada para escalonamento)
- `n`: comprimento da sequência

**Multi-Head Attention**:
```
MultiHead(Q, K, V) = Concat(head₁, ..., head_h) · W^O

onde head_i = Attention(Q·W_i^Q, K·W_i^K, V·W_i^V)
```

**Parâmetros**:
- `h`: número de cabeças (tipicamente 8, 12, 16, ou 32)
- `d_model`: dimensão do modelo (512, 768, 1024, etc.)
- `d_k = d_v = d_model / h`

### Feed-Forward Network (FFN)

**Arquitetura**:
```
FFN(x) = max(0, x·W₁ + b₁)·W₂ + b₂
```

Onde:
- `W₁`: matriz de peso da primeira camada (d_model × d_ff)
- `W₂`: matriz de peso da segunda camada (d_ff × d_model)
- `d_ff`: dimensão interna (tipicamente 4 × d_model)
- `max(0, ·)`: ativação ReLU ou variantes (GeLU, SwiGLU)

### Layer Normalization

**Fórmula**:
```
LayerNorm(x) = γ · (x - μ) / √(σ² + ε) + β
```

Onde:
- `μ = mean(x)`: média da camada
- `σ² = var(x)`: variância da camada
- `γ, β`: parâmetros aprendíveis (scale e shift)
- `ε`: constante pequena para estabilidade numérica (1e-5)

### Transformer Block Completo

```
# Encoder Block
x' = LayerNorm(x + MultiHeadAttention(x, x, x))
out = LayerNorm(x' + FFN(x'))

# Decoder Block (com Masked Attention)
x' = LayerNorm(x + MaskedMultiHeadAttention(x, x, x))
x'' = LayerNorm(x' + CrossAttention(x', encoder_out, encoder_out))
out = LayerNorm(x'' + FFN(x''))
```

---

## 🎯 Mixture of Experts (MoE)

### Arquitetura MoE

**Conceito**: Em vez de usar um único FFN para todos os tokens, usa múltiplos "especialistas" (FFNs) e um roteador que decide qual(is) especialista(s) ativar.

**Fórmula**:
```
MoE(x) = Σ_i G(x)_i · Expert_i(x)
```

Onde:
- `G(x)`: função de roteamento (gating)
- `Expert_i(x)`: i-ésimo FFN especialista
- Tipicamente, apenas os top-k especialistas são ativados (k=1 ou k=2)

### Função de Roteamento (Gating)

**Switch Routing** (usado em Switch Transformer):
```
G(x) = softmax(x · W_g)
```

**Top-k Gating**:
```
G(x)_i = {
  exp(x·W_g)_i / Σ_j∈Top-k exp(x·W_g)_j,  se i ∈ Top-k
  0,                                        caso contrário
}
```

### Load Balancing Loss

Para evitar que todos os tokens sejam roteados para poucos especialistas:

```
L_balance = α · Σ_i (f_i · P_i)
```

Onde:
- `f_i`: fração de tokens atribuídos ao especialista i
- `P_i`: probabilidade média de roteamento para especialista i
- `α`: coeficiente de balanceamento (tipicamente 0.01)

**Objetivo**: Minimizar L_balance junto com a perda principal (cross-entropy).

---

## 🔍 Attention Mechanism (Detalhamento)

### Scaled Dot-Product Attention

**Por que escalonar por √d_k?**

Sem escalonamento, o produto QK^T pode ter valores muito grandes, fazendo o softmax saturar (gradientes próximos a zero).

**Prova**:
```
Var(QK^T) = d_k · Var(Q) · Var(K)

Escalonando por √d_k:
Var(QK^T / √d_k) = Var(Q) · Var(K)
```

### Masked Attention (Causal)

Para modelos autorregressivos (GPT), impede que o modelo veja tokens futuros:

```
mask[i, j] = {
  0,     se i >= j  (pode ver token j ao processar token i)
  -∞,    se i < j   (não pode ver tokens futuros)
}

Attention(Q, K, V) = softmax((QK^T + mask) / √d_k) · V
```

### Cross-Attention

No decoder, permite atender à saída do encoder:

```
CrossAttn(query=decoder_hidden, key=encoder_out, value=encoder_out)
```

---

## 📐 Positional Encoding (RoPE)

### Rotary Position Embedding (RoPE)

**Problema**: Transformers não têm noção inerente de posição.

**Solução (RoPE)**: Aplica rotação nas dimensões dos embeddings baseada na posição.

**Fórmula 2D** (para ilustração):
```
f(x_m, m) = [
  [cos(mθ)  -sin(mθ)]   [x_m^(1)]
  [sin(mθ)   cos(mθ)] · [x_m^(2)]
]
```

Onde:
- `m`: posição do token
- `θ`: ângulo de rotação (tipicamente θ = 10000^(-2i/d) para dimensão i)
- `x_m`: embedding na posição m

**Generalização d-dimensional**:
```
RoPE(x_m, m) = R_Θ,m · x_m

onde R_Θ,m é uma matriz de rotação por blocos 2×2
```

**Propriedade chave**: A atenção entre posições m e n depende apenas da distância relativa (m - n):
```
⟨RoPE(q_m, m), RoPE(k_n, n)⟩ = ⟨q_m, R_{m-n} · k_n⟩
```

---

## 🎨 LoRA & Fine-tuning

### Low-Rank Adaptation (LoRA)

**Problema**: Fine-tuning de modelos grandes é caro (requer armazenar cópia completa dos pesos).

**Solução**: Adaptar apenas uma decomposição de baixo posto.

**Fórmula**:
```
W' = W₀ + ΔW = W₀ + B·A
```

Onde:
- `W₀`: pesos pré-treinados (congelados)
- `B`: matriz d × r (aprendível)
- `A`: matriz r × k (aprendível)
- `r << min(d, k)`: rank de adaptação (tipicamente r=8, 16, 32)

**Vantagens**:
- Parâmetros treináveis: `r·(d + k)` << `d·k`
- Exemplo: Para W de 4096×4096 com r=8:
  - Original: 16.7M parâmetros
  - LoRA: 65k parâmetros (0.4% do original)

### QLoRA (Quantized LoRA)

Combina LoRA com quantização de pesos:

```
W' = dequantize(Q(W₀)) + B·A
```

Onde:
- `Q(W₀)`: pesos quantizados (4-bit, 8-bit)
- `dequantize()`: converte para float16/float32 durante forward pass

**Economia de memória**: ~75% menos VRAM com quantização 4-bit.

---

## 🚀 RLHF & PPO

### Proximal Policy Optimization (PPO)

**Objetivo**: Treinar modelo de linguagem usando feedback humano.

**Função Objetivo PPO**:
```
L^CLIP(θ) = 𝔼_t [min(
  r_t(θ) · Â_t,
  clip(r_t(θ), 1-ε, 1+ε) · Â_t
)]
```

Onde:
- `r_t(θ) = π_θ(a_t|s_t) / π_θ_old(a_t|s_t)`: razão de probabilidade
- `Â_t`: vantagem estimada (quanto melhor que a média)
- `ε`: hiperparâmetro de clipping (tipicamente 0.2)

### RLHF Pipeline

**Etapa 1**: Supervised Fine-tuning (SFT)
```
L_SFT = -𝔼[(x,y)~D_SFT] [log π_θ(y|x)]
```

**Etapa 2**: Reward Model Training
```
L_RM = -𝔼[(x,y_w,y_l)~D_comp] [log σ(r_φ(x,y_w) - r_φ(x,y_l))]
```

Onde:
- `y_w`: resposta escolhida (winner)
- `y_l`: resposta rejeitada (loser)
- `σ`: função sigmoid

**Etapa 3**: RL Optimization (PPO)
```
L_RL(θ) = 𝔼[r_φ(x,y)] - β·KL(π_θ || π_SFT)
```

Onde:
- `β`: coeficiente de regularização KL (tipicamente 0.01-0.05)
- `KL(π_θ || π_SFT)`: divergência KL para evitar drift excessivo

---

## 🔎 RAG & Vector Similarity

### Cosine Similarity

**Fórmula**:
```
sim(a, b) = (a · b) / (||a|| · ||b||)
           = Σ_i a_i·b_i / (√Σ_i a_i² · √Σ_i b_i²)
```

**Propriedades**:
- Varia entre -1 (opostos) e 1 (idênticos)
- Invariante à magnitude dos vetores
- Eficiente de calcular com vetores normalizados

### BM25 (Best Matching 25)

**Fórmula**:
```
BM25(q, d) = Σ_{t∈q} IDF(t) · [f(t,d) · (k₁ + 1)] / [f(t,d) + k₁ · (1 - b + b · |d|/avgdl)]
```

Onde:
- `f(t, d)`: frequência do termo t no documento d
- `|d|`: comprimento do documento d
- `avgdl`: comprimento médio dos documentos
- `k₁`: parâmetro de saturação (tipicamente 1.2-2.0)
- `b`: parâmetro de normalização de comprimento (tipicamente 0.75)

**IDF (Inverse Document Frequency)**:
```
IDF(t) = log((N - df(t) + 0.5) / (df(t) + 0.5))
```

Onde:
- `N`: número total de documentos
- `df(t)`: número de documentos contendo termo t

### Max-Marginal Relevance (MMR)

Para evitar redundância nos resultados:

```
MMR(d) = arg max_{d_i ∈ R \ S} [λ · sim(d_i, q) - (1-λ) · max_{d_j ∈ S} sim(d_i, d_j)]
```

Onde:
- `R`: conjunto de documentos recuperados
- `S`: conjunto de documentos já selecionados
- `q`: query
- `λ`: trade-off entre relevância e diversidade (tipicamente 0.7)

---

## 🎮 POMDP & Agent Decision Making

### Partially Observable Markov Decision Process

**Definição formal**:
```
POMDP = (S, A, T, R, Ω, O, γ)
```

Onde:
- `S`: conjunto de estados (ocultos)
- `A`: conjunto de ações
- `T(s'|s,a)`: probabilidade de transição
- `R(s,a)`: função de recompensa
- `Ω`: conjunto de observações
- `O(o|s,a)`: probabilidade de observação
- `γ`: fator de desconto (0 ≤ γ < 1)

### Belief State

Como o estado real é parcialmente observável, mantemos uma distribuição de crenças:

```
b(s) = P(s | h_t)
```

Onde `h_t = (o₁, a₁, o₂, a₂, ..., o_t)` é o histórico de observações e ações.

**Atualização de Crença** (Bayes):
```
b'(s') = η · O(o|s',a) · Σ_s T(s'|s,a) · b(s)
```

Onde `η` é um fator de normalização.

### Value Function

**Objetivo**: Maximizar recompensa esperada cumulativa
```
V^π(b) = 𝔼[Σ_t γ^t · R(s_t, a_t) | b₀ = b, π]
```

**Bellman Equation**:
```
V*(b) = max_a [R(b,a) + γ · Σ_o P(o|b,a) · V*(τ(b,a,o))]
```

Onde `τ(b,a,o)` é a crença atualizada após ação `a` e observação `o`.

---

## 📊 Scaling Laws

### Neural Scaling Laws (Kaplan et al., OpenAI)

**Relação entre Loss e Compute**:
```
L(C) = (C_c / C)^α_C
```

Onde:
- `L`: cross-entropy loss
- `C`: compute budget (FLOPs)
- `C_c, α_C`: constantes empíricas

**Relação entre Loss e Parâmetros**:
```
L(N) = (N_c / N)^α_N
```

Onde:
- `N`: número de parâmetros
- `N_c ≈ 8.8 × 10^13`
- `α_N ≈ 0.076`

**Relação entre Loss e Dataset Size**:
```
L(D) = (D_c / D)^α_D
```

Onde:
- `D`: número de tokens de treinamento
- `D_c, α_D`: constantes empíricas

### Chinchilla Scaling Laws

**Alocação ótima de compute**:
```
N_optimal ∝ C^a
D_optimal ∝ C^b

onde a ≈ 0.50, b ≈ 0.50
```

**Implicação**: Para um modelo otimamente treinado, parâmetros e dados devem escalar igualmente.

**Exemplo**: Para GPT-3 (175B parâmetros):
- Tokens de treinamento ideais: ~3.5 trilhões (foi treinado com 300B)
- Conclusão: GPT-3 está "undertrained"

---

## ⚡ Optimization

### AdamW

**Atualização de pesos**:
```
m_t = β₁·m_{t-1} + (1-β₁)·g_t
v_t = β₂·v_{t-1} + (1-β₂)·g_t²

m̂_t = m_t / (1 - β₁^t)
v̂_t = v_t / (1 - β₂^t)

θ_t = θ_{t-1} - η·(m̂_t / (√v̂_t + ε) + λ·θ_{t-1})
```

Onde:
- `g_t`: gradiente no passo t
- `m_t, v_t`: momentos de primeira e segunda ordem
- `β₁, β₂`: taxas de decaimento (tipicamente 0.9, 0.999)
- `η`: learning rate
- `λ`: weight decay (tipicamente 0.01)
- `ε`: constante para estabilidade numérica (1e-8)

**Diferença AdamW vs Adam**: Weight decay é aplicado diretamente nos pesos, não nos gradientes.

### Learning Rate Schedule

**Warm-up linear + Cosine Decay**:
```
η(t) = {
  η_max · t / T_warmup,                          se t < T_warmup
  η_min + 0.5·(η_max - η_min)·(1 + cos(π·t'/T)), se t >= T_warmup
}
```

Onde:
- `t' = t - T_warmup`
- `T`: total de steps de treinamento
- `T_warmup`: steps de warm-up (tipicamente 2% de T)
- `η_max`: learning rate máximo (tipicamente 1e-4 a 3e-4)
- `η_min`: learning rate mínimo (tipicamente 0.1 × η_max)

### Gradient Clipping

Para evitar explosão de gradientes:

```
g ← g · min(1, θ_clip / ||g||)
```

Onde `θ_clip` é o threshold (tipicamente 1.0).

---

## 🔢 Cross-Entropy Loss

### Definição

Para classificação multi-classe (predição de próximo token):

```
L_CE = -Σ_i y_i · log(ŷ_i)
```

Onde:
- `y_i`: label verdadeiro (one-hot)
- `ŷ_i = softmax(logits)_i`: probabilidade predita

**Para sequências**:
```
L = (1/T) · Σ_t L_CE(y_t, ŷ_t)
```

### Perplexity

Métrica comum para modelos de linguagem:

```
PPL = exp(L_CE)
```

**Interpretação**: Número médio de escolhas igualmente prováveis que o modelo considera a cada passo.

---

## 🎯 Separation Theorem (CORE RULE)

### Formalização Matemática

**Teorema**: O modelo base M₀ é matematicamente separado das políticas de enforcement EP.

```
Pr[violation | θ, EP] ≠ Pr[violation | θ]

∂Pr[violation | θ, EP] / ∂θ = 0
```

**Interpretação**:
- A probabilidade de violação depende de EP, não dos pesos θ
- Mudanças em EP não requerem mudanças em θ (sem re-treinamento)

**Estado Padrão**:
```
EP_default = {
  mode: UNRESTRICTED,
  rules: ∅,
  outputModeration: {enabled: false}
}
```

**Propriedade chave**:
```
M₀(x) = argmax_y P(y | x, θ)  [sem restrições]

AION(x) = {
  M₀(x),                     se EP = EP_default
  enforce(M₀(x), EP),        se EP ≠ EP_default
}
```

---

## 📚 Referências

1. **Attention Is All You Need** (Vaswani et al., 2017)
2. **Switch Transformers** (Fedus et al., 2021)
3. **LoRA** (Hu et al., 2021)
4. **RoFormer** (Su et al., 2021) - RoPE
5. **Training language models to follow instructions with human feedback** (Ouyang et al., 2022)
6. **Scaling Laws for Neural Language Models** (Kaplan et al., 2020)
7. **Training Compute-Optimal Large Language Models** (Hoffmann et al., 2022) - Chinchilla

---

**Última atualização**: 28 de outubro de 2025
