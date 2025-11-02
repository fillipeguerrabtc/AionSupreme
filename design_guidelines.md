# AION - Design System Guidelines
**Inspirado em: Starlink, Tesla e Apple**

## 🎨 Filosofia de Design

**MINIMALISMO EXTREMO + ELEGÂNCIA + FUNCIONALIDADE**

Seguimos os princípios das melhores marcas tech do mundo: simplicidade radical, hierarquia tipográfica forte, white space generoso e foco total no conteúdo.

---

## 📐 Layout Principles

### Grid System
- **Max-width containers**: 1200px para conteúdo principal
- **Breakpoints**: 
  - Mobile: < 768px
  - Tablet: 768px - 1024px
  - Desktop: > 1024px
- **Spacing scale**: 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px, 96px, 128px

### White Space (Critical)
- **Hero sections**: 128px padding vertical mínimo
- **Section spacing**: 96px entre seções principais
- **Component spacing**: 48px entre componentes relacionados
- **Element spacing**: 24px entre elementos dentro de componentes
- **Breathing room**: NUNCA comprimir elementos - deixar respirar

### Hero Sections (Estilo Starlink/Tesla)
- **Full-width**: Ocupar 100% da largura
- **Height**: Mínimo 60vh (viewport height)
- **Imagem de fundo**: Alta qualidade, blur sutil opcional
- **Overlay**: Gradient escuro para legibilidade
- **CTA**: Máximo 2 botões, sempre visíveis

---

## 🎨 Color Palette

### Cores Neutras (Base) - 90% do design
```css
--background: 0 0% 98%;            /* Off-white (menos cansativo) */
--foreground: 0 0% 5%;              /* Preto quase puro */
--card: 0 0% 100%;                  /* Branco puro para cards (contraste) */
--muted: 240 5% 96%;                /* Cinza muito claro */
--muted-foreground: 240 4% 46%;     /* Cinza médio */
--border: 240 6% 90%;               /* Bordas sutis */
```

**IMPORTANTE**: Background usa off-white (98%) ao invés de branco puro para reduzir fadiga visual durante uso prolongado.

### Cores de Destaque (Mínimas) - 10% do design
```css
--primary: 221 83% 53%;             /* Azul tech (Starlink) */
--primary-foreground: 0 0% 100%;    /* Branco */
--accent: 142 76% 36%;              /* Verde tech (Tesla) */
--accent-foreground: 0 0% 100%;     /* Branco */
```

### Uso de Cores
- **90% neutras**: Preto/branco/cinza para quase tudo
- **10% destaque**: Azul/verde apenas para CTAs e estados ativos
- **NUNCA**: Gradientes coloridos chamativos, múltiplas cores primárias
- **Exceção**: Backgrounds de hero com gradientes sutis escuros

---

## 🔤 Typography

### Font Families
```css
--font-sans: 'Inter', -apple-system, system-ui, sans-serif;
--font-display: 'Space Grotesk', 'Inter', sans-serif; /* Headlines */
--font-mono: 'Geist Mono', 'Fira Code', monospace;
```

### Type Scale (Hierarquia Apple)
```css
/* Headlines */
--text-9xl: 96px;  /* Hero principal */
--text-8xl: 72px;  /* Hero secundário */
--text-7xl: 60px;  /* Seção principal */
--text-6xl: 48px;  /* Seção secundária */
--text-5xl: 36px;  /* Card título */

/* Body */
--text-xl: 20px;   /* Lead text */
--text-lg: 18px;   /* Body grande */
--text-base: 16px; /* Body padrão */
--text-sm: 14px;   /* Secondary */
--text-xs: 12px;   /* Captions */
```

### Font Weights
- **Regular (400)**: Body text
- **Medium (500)**: Ênfase sutil
- **Semibold (600)**: Subtítulos
- **Bold (700)**: Headlines principais

### Line Heights
- Headlines: 1.1 - 1.2 (tight)
- Body: 1.6 - 1.8 (confortável)
- Captions: 1.4

### Letter Spacing
- Headlines grandes (>48px): -0.02em (mais apertado)
- Headlines médios: -0.01em
- Body: 0 (normal)
- Uppercase: 0.05em (mais aberto)

---

## 🔘 Components

### Cards & Glassmorphism

**ATUALIZAÇÃO (Nov 2024): Glassmorphism Moderno Aprovado**
- **Admin Dashboard**: Usa glassmorphism elegante nos cards para sofisticação
- **Estilo**: Transparência sutil (70%) + blur(16px) + saturação(180%)
- **Aplicação**: `.glass-modern` class - background translúcido com backdrop-filter
- **Evitar**: Glassmorphism exagerado - deve ser elegante e discreto

### Buttons (Estilo Tesla/Apple)

**Primary**
- Background: Azul sólido (--primary)
- Texto: Branco
- Padding: 14px 32px
- Border-radius: 4px (quase quadrado)
- Font-size: 14px
- Font-weight: 600
- Transition: opacity 200ms
- Hover: opacity 0.9 (NUNCA mudar cor)

**Secondary/Ghost**
- Background: Transparente
- Texto: Foreground
- Border: 1px solid border
- Hover: background muted

**Sizes**
- Small: 10px 20px, text-sm
- Default: 14px 32px, text-base
- Large: 18px 48px, text-lg

### Cards

**Minimal Style (Apple)**
- Background: Branco
- Border: 1px solid border (sutil)
- Border-radius: 12px
- Padding: 32px
- Shadow: MUITO sutil (0 1px 3px rgba(0,0,0,0.05))
- Hover: Shadow um pouco maior (0 4px 12px rgba(0,0,0,0.08))

**NO glassmorphism, NO gradientes chamativos, NO bordas coloridas**

### Navigation (Top Bar Sticky)

**Style Tesla/Apple**
- Height: 60px
- Background: rgba(255,255,255,0.95) com backdrop-blur
- Border-bottom: 1px solid border
- Position: sticky top-0
- Z-index: 50
- Padding: 0 48px
- Logo: Tamanho médio (40px)
- Links: text-sm, peso 500, hover com underline sutil

### Forms

**Minimal Apple Style**
- Input height: 44px (touch-friendly)
- Border: 1px solid border
- Border-radius: 8px
- Focus: Border primary + shadow sutil
- Padding: 12px 16px
- Font-size: 16px (evita zoom no iOS)
- Placeholder: muted-foreground

---

## ✨ Animations & Transitions

### Princípios
- **Sutis**: Usuário mal percebe, mas sente a suavidade
- **Rápidas**: 150ms - 300ms (NUNCA mais de 500ms)
- **Easing**: ease-out para entrada, ease-in para saída

### Transições Permitidas
```css
/* Hover states */
opacity: 200ms ease-out;
transform: 300ms cubic-bezier(0.4, 0, 0.2, 1);

/* Fade in */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Slide up (Tesla style) */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### Transições NÃO Permitidas
- ❌ Bounce
- ❌ Rotações exageradas
- ❌ Scale > 1.05
- ❌ Animações longas (> 500ms)
- ❌ Efeitos chamativos/distrações

---

## 📱 Responsive Design

### Mobile First
- Sempre começar com mobile
- Progressive enhancement para desktop
- Touch targets: mínimo 44x44px

### Breakpoint Strategy
```css
/* Mobile: Base styles */
.element { /* mobile styles */ }

/* Tablet: 768px+ */
@media (min-width: 768px) { /* tablet styles */ }

/* Desktop: 1024px+ */
@media (min-width: 1024px) { /* desktop styles */ }
```

---

## 🎯 Design Patterns

### Hero Section (Starlink Style)
```
[Full-width background image]
  [Overlay gradient]
    [Container max-w-7xl mx-auto px-6 py-32]
      [Headline text-7xl font-bold mb-6]
      [Subtext text-xl text-muted-foreground mb-12]
      [CTA buttons flex gap-4]
        [Primary button]
        [Secondary button]
```

### Product Grid (Apple Style)
```
[Container]
  [Grid 3 cols desktop, 2 cols tablet, 1 col mobile]
    [Card]
      [Image aspect-square]
      [Title text-2xl font-semibold mt-6]
      [Description text-base text-muted-foreground mt-2]
      [Price/CTA mt-6]
```

### Content Section (Tesla Style)
```
[Container max-w-4xl mx-auto py-24]
  [Headline text-5xl font-bold text-center mb-12]
  [Two-column grid gap-12]
    [Left: Image]
    [Right: Content]
      [Subtitle text-xl font-semibold mb-4]
      [Body text-base text-muted-foreground]
      [CTA button mt-8]
```

---

## ⚠️ Design DON'Ts

### NUNCA usar:
- ❌ Mais de 2-3 cores no design
- ❌ Glassmorphism exagerado
- ❌ Gradientes arco-íris
- ❌ Bordas coloridas grossas
- ❌ Sombras pesadas/múltiplas
- ❌ Animações bounce/spin sem motivo
- ❌ Tipografia >3 pesos diferentes na mesma tela
- ❌ Espaçamento inconsistente
- ❌ Ícones coloridos misturados
- ❌ Fundos texturizados

### SEMPRE usar:
- ✅ White space generoso
- ✅ Hierarquia tipográfica clara
- ✅ Cores neutras (90%)
- ✅ Transições sutis
- ✅ Grid/alignment perfeito
- ✅ Conteúdo como protagonista
- ✅ Mobile-first
- ✅ Performance (imagens otimizadas)

---

## 📸 Imagery

### Photos
- **Alta qualidade**: Mínimo 1920px largura
- **Aspect ratios**: 16:9 (hero), 1:1 (products), 4:3 (content)
- **Estilo**: Profissional, limpo, minimalista
- **Overlay**: Gradient escuro se texto por cima

### Icons
- **Style**: Outline (stroke, não filled)
- **Size**: 20px, 24px, 32px
- **Stroke width**: 1.5px - 2px
- **Color**: Sempre foreground ou muted-foreground
- **Source**: Lucide React (consistência)

---

## 🚀 Performance

### Critical
- **First paint**: < 1.5s
- **Imagens**: WebP/AVIF, lazy load
- **Fonts**: Preload, subset, fallback
- **JS**: Code splitting, tree shaking
- **CSS**: Purge unused, inline critical

---

## ✅ Checklist - Antes de Lançar

- [ ] White space generoso em TODAS as seções
- [ ] Máximo 3 pesos de fonte na página
- [ ] Hero section com mínimo 60vh
- [ ] Todos os CTAs com max 2 opções
- [ ] Cores 90% neutras, 10% destaque
- [ ] Transições < 300ms
- [ ] Mobile testado em device real
- [ ] Imagens otimizadas (WebP)
- [ ] Sem animações exageradas
- [ ] Tipografia hierárquica clara
- [ ] Navigation sticky funcionando
- [ ] Touch targets 44x44px mínimo

---

**Lembre-se: Menos é mais. Simplicidade é sofisticação.**

*"Design is not just what it looks like and feels like. Design is how it works." - Steve Jobs*
