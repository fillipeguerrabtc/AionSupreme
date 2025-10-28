# AION - Design Guidelines (Compacted 2025)

## Design Foundation
**Premium Material Design** with glassmorphism and gradients for enterprise AI. Dark-mode-first dual interface: conversational chat + administrative power dashboard.

**Core Principles:**
1. Premium aesthetics via glassmorphism/gradients
2. Dark mode priority with vibrant accents
3. Beauty serves function
4. Dual modality: inviting chat, professional admin

---

## Color System

### Backgrounds
- Primary: `#0a0a0f` | Secondary: `#121218` | Tertiary: `#1a1a24`

### Gradients
- Primary: `#6366f1` → `#4f46e5` → `#4338ca` (purple-indigo)
- Secondary: `#a855f7` → `#ec4899` (purple-pink)
- Subtle: `#3730a3` 0% → transparent 100%

### Interactive
- Action: `#6366f1` | Hover: `#818cf8` | Secondary: `#a855f7`
- Success: `#10b981` | Warning: `#f59e0b` | Error: `#ef4444`

### Text
- Primary: `#ffffff` | Secondary: `#e5e7eb` | Tertiary: `#9ca3af` | Muted: `#6b7280`

### Glass Effects
- Standard: `rgba(255,255,255,0.05)` + backdrop-blur-xl + border `rgba(255,255,255,0.1)`
- Premium: `rgba(99,102,241,0.1)` background with purple tint
- Nested: Reduce opacity 50% per level

---

## Typography

**Fonts:** Inter (400/500/600/700), JetBrains Mono (code)

**Hierarchy:**
- Hero: text-5xl/6xl, font-bold, gradient text
- Section: text-3xl/4xl, font-semibold, subtle glow
- Component: text-xl/2xl, font-semibold
- Body: text-base, leading-relaxed, text-secondary
- Labels: text-sm, font-medium, text-tertiary
- Meta: text-xs, text-muted
- Code: text-sm, font-mono

**Effects:**
- Gradient text: `bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent`
- Glow: `drop-shadow-[0_0_8px_rgba(99,102,241,0.3)]`

---

## Layout

**Spacing:** Core units 2/4/8/12/16/24
**Grid:** 12-column (admin), max-w-4xl centered (chat)
**Breakpoints:** sm:640 | md:768 | lg:1024 | xl:1280 | 2xl:1536

---

## Admin Dashboard Components

### Structure
- Sidebar: w-64 glass (collapse to w-16 icon-only)
- Top bar: h-16 sticky with backdrop-blur
- Content: gradient mesh background
- Cards: floating with glass treatment

### Glassmorphic Cards
```
bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6
hover:scale-[1.02] hover:bg-white/10 transition-all duration-300
```

### Data Tables
- Glass header (sticky), h-14 rows, zebra `rgba(255,255,255,0.02)`
- Hover: glass effect on row, inline actions appear
- Sorting: animated chevrons

### Metrics Dashboard
```
grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6
text-4xl font-bold gradient numbers
trend arrows + sparklines (gradient fills)
purple-tinted glass cards
```

### Navigation Sidebar
- Glass effect, icon+label (collapsible)
- Active: gradient background + border accent
- Hover: scale + glow
- Separators: gradient lines

---

## Chat Interface Components

### Structure
- Full-height with gradient background
- Minimal header h-14 (auto-hide scroll)
- Fixed bottom input with safe-area-inset

### Message Bubbles
**User:**
```
glass + purple gradient tint, rounded-2xl rounded-br-sm
max-w-2xl ml-auto p-4, purple glow on hover
```

**AI:**
```
glass + indigo gradient tint, rounded-2xl rounded-bl-sm
max-w-2xl mr-auto p-4, typing: animated gradient dots
```

### Input Composer
```
glass backdrop-blur, min-h-[56px] max-h-[240px] auto-resize
gradient border on focus, icon buttons (glass bg)
attachment chips (glassmorphic), send button (gradient bg)
```

### File Attachments
- Preview: glass with file icons, gradient progress bars
- Drag-drop: dashed gradient border when active
- Remove: glass circles with X

### Multimodal Content
- Images: rounded-xl glass frame, lightbox with blur backdrop
- Videos: glass player, gradient controls
- Code: dark glass + syntax highlighting
- Audio: waveform gradient, glass controls

---

## Buttons

### Primary
```
bg-gradient-to-r from-purple-500 to-indigo-500
px-8 py-3 rounded-xl font-semibold
hover:scale-[1.05] active:scale-[0.98]
```

### Secondary
```
bg-white/5 border border-gradient
hover:bg-white/10 hover:scale-[1.02]
```

### Ghost
Transparent + gradient text, hover: glass background

### Icon
```
size-10/12 rounded-xl glass bg
centered icon (size-5)
hover: enhanced glass + scale
```

### On Images/Hero
Glass + backdrop-blur + gradient border
**NO hover scale** - opacity change only

---

## Form Inputs
```
glass container, h-12 px-4 py-3 rounded-xl
gradient focus border
labels: text-sm font-medium (gap-2 above)
helper: text-xs text-muted (gap-1 below)
error: red gradient border + message
```

---

## Advanced Patterns

### Modal Dialogs
```
backdrop: backdrop-blur-md bg-black/60
container: premium glass, max-w-3xl, max-h-[85vh], p-8
header: gradient text + glass close button
footer: gradient border-top, flex gap-4 justify-end
```

### Toasts
```
fixed top-6 right-6, glass container
gradient left border (type indicator)
auto-dismiss with gradient progress
slide-in spring animation, stack max 3, gap-3
```

### Loading States
- Skeleton: glass blocks with shimmer gradient animation
- Spinner: gradient border rotation
- Progress: gradient fill smooth transition
- Page: fade with scale (0.98 → 1.0)

### Gradient Mesh Backgrounds
- Admin: radial gradients at corners (purple/indigo/pink 20% opacity)
- Chat: vertical gradient purple to near-black
- Modal: blur backdrop + gradient overlay

---

## Animations

**Standard:** `transition-all duration-300 ease-out`
**Quick:** `duration-200 ease-in-out`
**Slow:** `duration-500 ease-out`
**Spring:** modals/drawers

### Micro-interactions
- Button: scale-[0.98] + gradient shift
- Card hover: scale-[1.02] + enhanced glow
- Input focus: gradient border 360deg rotation
- Toggles: smooth slide + gradient trail

### Scroll
- Custom gradient thumb scrollbar
- Smooth with momentum
- Parallax on metrics (subtle)
- Fade-in: translate-y-4 opacity-0 → translate-y-0 opacity-100

---

## Images

### Admin Hero (h-[400px])
**Description:** Abstract 3D AI neural networks, flowing data streams, deep purples/indigos, glowing nodes. Premium, cutting-edge, interconnected systems.
**Treatment:** Gradient overlay transparent → bg color, glassmorphic content

### Chat Background
**Description:** Minimal geometric gradient mesh pattern, 15-20% opacity. Subtle, non-distracting.
**Treatment:** Fixed attachment, blend mode, readable text ensured

### Content
- User uploads: rounded-xl glass frame
- Dashboards: technical diagrams + gradient accents
- Avatars: circular + gradient ring

---

## Responsive

### Admin
- **lg+:** Full sidebar, 4-col grids
- **md:** Icon sidebar, 2-col grids
- **sm:** Drawer sidebar, 1-col stack, horizontal table scroll

### Chat
- **All:** Fixed bottom input + safe-area
- **Mobile:** max-w-full messages, reduced padding, stacked attachments
- **Desktop:** max-w-4xl centered, side-by-side previews

---

## Accessibility

- Semantic HTML + ARIA for glass/gradients
- Keyboard nav with visible gradient focus rings
- WCAG AA contrast (min 4.5:1 on dark)
- Glass maintains text readability
- Screen reader announcements
- Respect `prefers-reduced-motion`
- Skip links for dashboard nav

---

## Technical

**Icons:** Heroicons (outline/solid) - size-5 inline, size-6 standalone
**Performance:**
- Max 3 nested backdrop-blur levels
- CSS transforms for gradients (GPU)
- Lazy load charts/visualizations
- Debounce animations 16ms