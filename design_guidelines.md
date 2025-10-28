# AION - Design Guidelines

## Design Approach
**System-Based Design** using Material Design principles adapted for enterprise productivity applications. This dual-interface system requires distinct but cohesive patterns for administrative control and conversational interaction.

## Core Design Principles
1. **Functional Clarity**: Every element serves a clear purpose in system control or communication
2. **Information Density**: Maximize useful data display while maintaining scanability
3. **Professional Precision**: Enterprise-grade polish with technical sophistication
4. **Dual Modality**: Administrative power meets conversational simplicity

---

## Typography System

### Font Selection
- **Primary**: Inter (via Google Fonts CDN)
- **Monospace**: JetBrains Mono (for code, technical data)

### Hierarchy
- **Display/Headers**: 2xl to 4xl, font-semibold to font-bold
- **Section Titles**: xl to 2xl, font-semibold
- **Body Text**: base (16px), font-normal, leading-relaxed
- **Labels/Meta**: sm to xs, font-medium
- **Code/Technical**: text-sm, font-mono

---

## Layout & Spacing System

### Spacing Primitives
Primary units: **2, 4, 8, 12, 16** (as in p-2, gap-4, mb-8, space-x-12, py-16)

### Grid System
- Admin Dashboard: 12-column grid with 16-column option for dense data views
- Chat Interface: Centered max-w-4xl container with full-width message area
- Breakpoints: Standard Tailwind (sm: 640px, md: 768px, lg: 1024px, xl: 1280px, 2xl: 1536px)

---

## Component Architecture

### Administrative Dashboard

**Layout Structure:**
- Fixed sidebar navigation (64 width units, collapsible to icon-only)
- Top bar with metrics summary (h-16)
- Main content area with responsive padding (p-8 on desktop, p-4 on mobile)
- Floating action controls where appropriate

**Primary Components:**

1. **Control Panels**
   - Card-based sections with rounded-lg borders
   - Header with title (text-lg font-semibold) + action buttons
   - Grid layouts for toggle groups (grid-cols-2 md:grid-cols-3 lg:grid-cols-4)
   - Clear visual separation between categories (space-y-8)

2. **Configuration Forms**
   - Grouped sections with descriptive labels
   - Inline validation indicators
   - Multi-column layouts on larger screens (grid-cols-2 gap-8)
   - Sticky action bar at bottom (Save/Reset/Cancel)

3. **Data Tables**
   - Compact row height (h-12) with hover states
   - Fixed header on scroll
   - Column sorting indicators
   - Inline action menus (three-dot or icon buttons)
   - Pagination controls at bottom

4. **Metrics Dashboard**
   - Grid of metric cards (grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4)
   - Large number display (text-3xl font-bold)
   - Trend indicators (arrows, sparklines)
   - Time period selector in top-right

5. **Policy Management Interface**
   - Two-column layout: Categories (left, w-1/3) + Details (right, w-2/3)
   - Toggle switches with clear ON/OFF states
   - Nested indentation for hierarchical rules (pl-6 for sub-items)
   - Jurisdiction selector with country flags

### Client Chat Interface

**Layout Structure:**
- Full-height container (min-h-screen flex flex-col)
- Optional minimal header (h-14, can be hidden)
- Messages area (flex-1 overflow-y-auto with custom scrollbar)
- Input area fixed at bottom (sticky bottom-0)

**Primary Components:**

1. **Message Bubbles**
   - User messages: max-w-2xl ml-auto, rounded-2xl rounded-br-md
   - AI responses: max-w-2xl mr-auto, rounded-2xl rounded-bl-md
   - Padding p-4 for readable text blocks
   - Code blocks with syntax highlighting (rounded-lg p-4 font-mono text-sm)
   - Markdown rendering with proper spacing

2. **Input Composer**
   - Textarea with auto-resize (min-h-[48px] max-h-[200px])
   - Attachment preview area above input (flex gap-2 flex-wrap)
   - Icon buttons for actions (attach, send, voice)
   - Character/token counter (text-xs opacity-60)

3. **File Upload Zone**
   - Drag-and-drop area with dashed border when active
   - File preview cards showing icon + name + size (rounded-lg p-3)
   - Progress bars during upload (h-1 rounded-full)
   - Remove button on hover (absolute top-1 right-1)

4. **Multimodal Content Display**
   - Images: max-w-md rounded-lg with lightbox on click
   - Videos: Embedded player with controls
   - Documents: Card with icon + filename + download button
   - Audio: Waveform visualization with playback controls

---

## Advanced Patterns

### Split Views
- Resizable panels with drag handle (w-1 hover:w-2 transition)
- Minimum widths enforced (min-w-[240px])
- Collapse/expand toggle buttons

### Modal Dialogs
- Overlay with backdrop blur (backdrop-blur-sm)
- Centered modal with max-w-2xl and max-h-[90vh]
- Header (p-6), content (p-6 overflow-y-auto), footer (p-4 flex gap-3 justify-end)
- Close button (absolute top-4 right-4)

### Toast Notifications
- Fixed top-right positioning (top-4 right-4)
- Stack vertically with gap-2
- Auto-dismiss after 5s with progress bar
- Icon + message + close button layout

### Loading States
- Skeleton screens matching final content structure
- Spinner for inline actions (size-4 to size-6)
- Progress bars for long operations
- Shimmer animation for placeholders

---

## Interaction Patterns

### Forms & Inputs
- Labels above inputs (block mb-1 text-sm font-medium)
- Input height h-10 to h-12 with px-4 py-2
- Focus rings (focus:ring-2 focus:ring-offset-2)
- Helper text below (text-xs mt-1)
- Error states with inline messages

### Buttons
- Primary actions: px-6 py-2.5 rounded-lg font-medium
- Secondary actions: Outlined or ghost variants
- Icon buttons: size-9 to size-10 square with centered icon
- Loading state: Disabled with spinner replacing icon
- Groups: Border-collapse with rounded corners on ends only

### Navigation
- Active state clearly indicated (font-semibold with indicator)
- Hover previews for items with submenus
- Breadcrumbs for deep navigation (text-sm with separators)

---

## Responsive Behavior

### Admin Dashboard
- Sidebar collapses to icons-only on md breakpoint
- Metric grids stack to 2-column on tablet, single-column on mobile
- Tables scroll horizontally on mobile with fixed first column
- Forms switch to single column below lg breakpoint

### Chat Interface  
- Input area remains fixed with safe-area-inset on mobile
- Message max-width reduces on smaller screens (max-w-full on mobile)
- Attachment previews wrap on mobile (flex-wrap)

---

## Accessibility

- Semantic HTML throughout (nav, main, aside, article)
- ARIA labels for icon buttons and complex widgets
- Keyboard navigation for all interactive elements (focus-visible rings)
- Sufficient contrast ratios (WCAG AA minimum)
- Form inputs always associated with labels
- Skip navigation link for dashboard
- Screen reader announcements for dynamic content updates

---

## Technical Specifications

### Icons
Use **Heroicons** (via CDN) exclusively - outline for navigation/secondary actions, solid for primary actions

### Motion
Minimal, purposeful animation:
- Transitions: transition-all duration-200 ease-in-out
- Hover scale: hover:scale-105 (for cards/buttons only)
- Page transitions: Fade-in with slide-up (translate-y-2 opacity-0 → translate-y-0 opacity-100)
- NO decorative animations, parallax, or scroll-triggered effects

### Images
- Admin Dashboard: Technical diagrams, architecture visualizations, metric graphs
- Chat Interface: Inline rendering of uploaded/generated images with proper aspect ratio preservation

This design creates a powerful, professional dual-interface system optimized for both administrative control and fluid conversation, with every element purposefully supporting the advanced AI capabilities of AION.