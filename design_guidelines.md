# AION - Diretrizes de Design (Compactado 2025)

## Fundação de Design
**Material Design Premium** com glassmorphism e gradientes para IA empresarial. Interface dual com foco em dark mode: chat conversacional + painel administrativo de poder.

**Princípios Centrais:**
1. Estética premium via glassmorphism/gradientes
2. Prioridade de dark mode com acentos vibrantes
3. Beleza serve à função
4. Modalidade dual: chat convidativo, admin profissional

---

## Sistema de Cores

### Backgrounds
- Primário: `#0a0a0f` | Secundário: `#121218` | Terciário: `#1a1a24`

### Gradientes
- Primário: `#6366f1` → `#4f46e5` → `#4338ca` (purple-indigo)
- Secundário: `#a855f7` → `#ec4899` (purple-pink)
- Sutil: `#3730a3` 0% → transparente 100%

### Interativos
- Ação: `#6366f1` | Hover: `#818cf8` | Secundário: `#a855f7`
- Sucesso: `#10b981` | Aviso: `#f59e0b` | Erro: `#ef4444`

### Texto
- Primário: `#ffffff` | Secundário: `#e5e7eb` | Terciário: `#9ca3af` | Discreto: `#6b7280`

### Efeitos de Vidro
- Padrão: `rgba(255,255,255,0.05)` + backdrop-blur-xl + borda `rgba(255,255,255,0.1)`
- Premium: background `rgba(99,102,241,0.1)` com tonalidade roxa
- Aninhado: Reduzir opacidade 50% por nível

---

## Tipografia

**Fontes:** Inter (400/500/600/700), JetBrains Mono (código)

**Hierarquia:**
- Hero: text-5xl/6xl, font-bold, texto gradiente
- Seção: text-3xl/4xl, font-semibold, brilho sutil
- Componente: text-xl/2xl, font-semibold
- Corpo: text-base, leading-relaxed, text-secondary
- Labels: text-sm, font-medium, text-tertiary
- Meta: text-xs, text-muted
- Código: text-sm, font-mono

**Efeitos:**
- Texto gradiente: `bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent`
- Brilho: `drop-shadow-[0_0_8px_rgba(99,102,241,0.3)]`

---

## Layout

**Espaçamento:** Unidades centrais 2/4/8/12/16/24
**Grid:** 12 colunas (admin), max-w-4xl centralizado (chat)
**Breakpoints:** sm:640 | md:768 | lg:1024 | xl:1280 | 2xl:1536

---

## Componentes do Painel Administrativo

### Estrutura
- Sidebar: w-64 vidro (colapsa para w-16 apenas ícones)
- Barra superior: h-16 sticky com backdrop-blur
- Conteúdo: background mesh gradiente
- Cards: flutuantes com tratamento de vidro

### Cards Glassmórficos
```
bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6
hover:scale-[1.02] hover:bg-white/10 transition-all duration-300
```

### Tabelas de Dados
- Cabeçalho vidro (sticky), linhas h-14, zebra `rgba(255,255,255,0.02)`
- Hover: efeito vidro na linha, ações inline aparecem
- Ordenação: chevrons animados

### Dashboard de Métricas
```
grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6
números text-4xl font-bold gradiente
setas de tendência + sparklines (preenchimentos gradiente)
cards de vidro com tonalidade roxa
```

### Sidebar de Navegação
- Efeito vidro, ícone+label (recolhível)
- Ativo: background gradiente + acento de borda
- Hover: escala + brilho
- Separadores: linhas gradiente

---

## Componentes da Interface de Chat

### Estrutura
- Altura total com background gradiente
- Cabeçalho mínimo h-14 (auto-oculta ao rolar)
- Entrada inferior fixa com safe-area-inset

### Bolhas de Mensagem
**Usuário:**
```
vidro + tonalidade gradiente roxa, rounded-2xl rounded-br-sm
max-w-2xl ml-auto p-4, brilho roxo no hover
```

**IA:**
```
vidro + tonalidade gradiente índigo, rounded-2xl rounded-bl-sm
max-w-2xl mr-auto p-4, digitando: pontos gradiente animados
```

### Compositor de Entrada
```
vidro backdrop-blur, min-h-[56px] max-h-[240px] auto-resize
borda gradiente no foco, botões de ícone (bg vidro)
chips de anexo (glassmórficos), botão enviar (bg gradiente)
```

### Anexos de Arquivo
- Preview: vidro com ícones de arquivo, barras de progresso gradiente
- Drag-drop: borda gradiente pontilhada quando ativo
- Remover: círculos de vidro com X

### Conteúdo Multimodal
- Imagens: moldura vidro rounded-xl, lightbox com backdrop blur
- Vídeos: player vidro, controles gradiente
- Código: vidro escuro + destaque de sintaxe
- Áudio: forma de onda gradiente, controles vidro

---

## Botões

### Primário
```
bg-gradient-to-r from-purple-500 to-indigo-500
px-8 py-3 rounded-xl font-semibold
hover:scale-[1.05] active:scale-[0.98]
```

### Secundário
```
bg-white/5 border border-gradient
hover:bg-white/10 hover:scale-[1.02]
```

### Fantasma
Transparente + texto gradiente, hover: background vidro

### Ícone
```
size-10/12 rounded-xl bg vidro
ícone centralizado (size-5)
hover: vidro aprimorado + escala
```

### Em Imagens/Hero
Vidro + backdrop-blur + borda gradiente
**SEM hover scale** - apenas mudança de opacidade

---

## Inputs de Formulário
```
container vidro, h-12 px-4 py-3 rounded-xl
borda gradiente no foco
labels: text-sm font-medium (gap-2 acima)
helper: text-xs text-muted (gap-1 abaixo)
erro: borda gradiente vermelha + mensagem
```

---

## Padrões Avançados

### Diálogos Modais
```
backdrop: backdrop-blur-md bg-black/60
container: vidro premium, max-w-3xl, max-h-[85vh], p-8
cabeçalho: texto gradiente + botão fechar vidro
rodapé: borda-topo gradiente, flex gap-4 justify-end
```

### Toasts
```
fixed top-6 right-6, container vidro
borda esquerda gradiente (indicador de tipo)
auto-dismiss com progresso gradiente
animação slide-in spring, empilhar max 3, gap-3
```

### Estados de Carregamento
- Skeleton: blocos vidro com animação shimmer gradiente
- Spinner: rotação de borda gradiente
- Progresso: transição suave de preenchimento gradiente
- Página: fade com escala (0.98 → 1.0)

### Backgrounds Mesh Gradiente
- Admin: gradientes radiais nos cantos (purple/indigo/pink opacidade 20%)
- Chat: gradiente vertical roxo para quase-preto
- Modal: backdrop blur + overlay gradiente

---

## Animações

**Padrão:** `transition-all duration-300 ease-out`
**Rápido:** `duration-200 ease-in-out`
**Lento:** `duration-500 ease-out`
**Spring:** modais/drawers

### Micro-interações
- Botão: scale-[0.98] + mudança gradiente
- Card hover: scale-[1.02] + brilho aprimorado
- Input focus: rotação borda gradiente 360deg
- Toggles: deslize suave + rastro gradiente

### Scroll
- Scrollbar thumb gradiente customizada
- Suave com momentum
- Parallax em métricas (sutil)
- Fade-in: translate-y-4 opacity-0 → translate-y-0 opacity-100

---

## Imagens

### Hero Admin (h-[400px])
**Descrição:** Redes neurais 3D abstratas de IA, fluxos de dados, roxos/índigos profundos, nós brilhantes. Premium, vanguarda, sistemas interconectados.
**Tratamento:** Overlay gradiente transparente → cor bg, conteúdo glassmórfico

### Background Chat
**Descrição:** Padrão mesh geométrico gradiente mínimo, opacidade 15-20%. Sutil, não distrai.
**Tratamento:** Anexo fixo, modo de mistura, texto legível assegurado

### Conteúdo
- Uploads de usuário: moldura vidro rounded-xl
- Dashboards: diagramas técnicos + acentos gradiente
- Avatares: circular + anel gradiente

---

## Responsivo

### Admin
- **lg+:** Sidebar completa, grids 4 colunas
- **md:** Sidebar ícones, grids 2 colunas
- **sm:** Drawer sidebar, empilhamento 1 coluna, scroll horizontal tabela

### Chat
- **Tudo:** Entrada inferior fixa + safe-area
- **Mobile:** mensagens max-w-full, padding reduzido, anexos empilhados
- **Desktop:** max-w-4xl centralizado, previews lado a lado

---

## Acessibilidade

- HTML semântico + ARIA para vidro/gradientes
- Navegação por teclado com anéis de foco gradiente visíveis
- Contraste WCAG AA (mín 4.5:1 em escuro)
- Vidro mantém legibilidade do texto
- Anúncios de leitor de tela
- Respeitar `prefers-reduced-motion`
- Links de pular para navegação do dashboard

---

## Técnico

**Ícones:** Heroicons (outline/solid) - size-5 inline, size-6 standalone
**Performance:**
- Máx 3 níveis de backdrop-blur aninhados
- Transformações CSS para gradientes (GPU)
- Lazy load gráficos/visualizações
- Debounce animações 16ms
