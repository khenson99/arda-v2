# Arda V2 -- Command Surface Specification

> Defines the command palette architecture, global keyboard shortcuts, Go-To navigation chords, page-specific shortcuts, and contextual quick-action patterns.
> Source of truth for all non-mouse interaction paths.

---

## 1. Overview

### 1.1 Purpose

This document specifies every non-mouse interaction surface in the Arda Kanban system. The goal is to make every primary workflow (defined in `workflow-maps.md`) completable without reaching for the mouse.

### 1.2 Design Principles

1. **Discoverability over memorization** -- shortcuts are shown inline in the command palette and in tooltips.
2. **Progressive complexity** -- mouse-first users see inline action buttons; keyboard users layer shortcuts on top.
3. **No hidden-only actions** -- every shortcut maps to an action that also has a visible click target.
4. **Conflict-free** -- no shortcut shadows a browser-native or OS-native shortcut.

### 1.3 Current State (Audit, Feb 2025)

| Surface | Status | Gaps |
|---------|--------|------|
| Command palette | Partial | Only 5 of 8 pages listed; 2 incorrect routes (`/notifications`, `/scan`); no entity search; no workflow shortcuts |
| Global keyboard shortcuts | Minimal | `Cmd+K` and `/` open palette; `r` refreshes; no Go-To chords despite `onNavigate` handler in interface |
| Page-specific shortcuts | None | No `j`/`k` navigation, no inline-action shortcuts |
| Contextual quick actions | None | No bulk selection, no inline card actions |

**Source files audited:**
- `apps/web/src/components/command-palette.tsx` -- `PAGE_ITEMS` array, `CommandDialog`
- `apps/web/src/hooks/use-keyboard-shortcuts.ts` -- `UseKeyboardShortcutsOptions` interface, keydown handler
- `apps/web/src/layouts/app-shell.tsx` -- sidebar items, header actions, shortcut wiring
- `apps/web/src/pages/queue.tsx` -- `QueueCardItem`, `ExpandedCardPanel`

---

## 2. Command Palette

### 2.1 Architecture

The command palette is a `CommandDialog` (shadcn/ui wrapper around cmdk). It renders four groups in priority order.

```
+-----------------------------------------------+
| Type a command or search...                   |
+-----------------------------------------------+
|  PAGES                                        |
|    Dashboard                    g d           |
|    Cards                        g c           |
|    Loops                        g l           |
|    Items                        g i           |
|    Order Queue                  g q           |
|    Order History                g o           |
|    Receiving                    g r           |
|    Scan                         g s           |
|  -----------------------------------------    |
|  WORKFLOWS                                    |
|    Create order for focused card  Shift+Enter |
|    Scan a card               (opens scan)     |
|  -----------------------------------------    |
|  CONTEXTUAL                                   |
|    Refresh data                  r            |
|    Toggle shop floor mode                     |
|  -----------------------------------------    |
|  ENTITY SEARCH (appears as user types)        |
|    Part: "Widget A"   ->  /parts/:id         |
|    Card: "#1042"      ->  /cards/:id         |
|    Loop: "Procurement Loop 3" -> /loops/:id  |
+-----------------------------------------------+
```

### 2.2 Group: Pages (8 items)

All top-level routes. Each item shows its Go-To chord shortcut.

| Label | Route | Icon | Go-To Chord |
|-------|-------|------|-------------|
| Dashboard | `/` | `Activity` | `g d` |
| Cards | `/cards` | `CreditCard` | `g c` |
| Loops | `/loops` | `RefreshCw` | `g l` |
| Items | `/parts` | `Boxes` | `g i` |
| Order Queue | `/queue` | `SquareKanban` | `g q` |
| Order History | `/orders` | `Bell` | `g o` |
| Receiving | `/receiving` | `PackageCheck` | `g r` |
| Scan | `/scan` | `QrCode` | `g s` |

**Bug fixes required** (vs. current `PAGE_ITEMS`):
1. Add Cards, Loops, Receiving entries (currently missing)
2. Change "Order History" route from `/notifications` to `/orders`
3. Change "Receiving" route from `/scan` to `/receiving`
4. Add Go-To chord display via `<CommandShortcut>`

### 2.3 Group: Workflows

Workflow shortcuts surface the highest-frequency actions from `workflow-maps.md`.

| Label | Action | Shortcut | Context |
|-------|--------|----------|---------|
| Create order for focused card | Calls `createPurchaseOrderFromCards` for focused card | `Shift+Enter` | Queue page with focused card |
| Scan a card | Navigate to `/scan` and activate camera | -- | Global |

### 2.4 Group: Contextual Actions

Actions that depend on the current page or selection state.

| Label | Action | Shortcut | Visibility |
|-------|--------|----------|------------|
| Refresh data | `window.location.reload()` | `r` | Always |
| Toggle shop floor mode | Calls `onToggleShopFloorMode` | -- | Always |

### 2.5 Group: Entity Search

Entity search appears as the user types and matches against in-memory data from `useWorkspaceData`.

| Entity | Search fields | Data source | Navigate to |
|--------|--------------|-------------|-------------|
| Parts | `name`, `partNumber`, `primarySupplier` | `parts` array from `useWorkspaceData` | `/parts` (filtered) |
| Cards | `cardNumber`, `partId` | `queueByLoop` flattened from `useWorkspaceData` | `/cards` |
| Loops | loop name/type | `loops` from `useWorkspaceData` (if available) | `/loops/:loopId` |

**Implementation note**: Parts, cards, and queue data are already loaded client-side via `useWorkspaceData`, so entity search can be instant (no API call). Orders would require an API search endpoint and are deferred to Phase 2.

### 2.6 Opening the Palette

| Trigger | Context |
|---------|---------|
| `Cmd+K` / `Ctrl+K` | Global, always works |
| `/` (forward slash) | Global, suppressed when focus is inside INPUT, TEXTAREA, SELECT, or `contentEditable` |
| Header search icon click | Always visible in header |

---

## 3. Keyboard Shortcuts

### 3.1 Global Shortcuts

These work on every page. Single-key shortcuts are suppressed inside editable elements (inputs, textareas, selects, contentEditable).

| Shortcut | Action | Category |
|----------|--------|----------|
| `Cmd+K` / `Ctrl+K` | Open command palette | Navigation |
| `/` | Open command palette (focus search) | Navigation |
| `r` | Refresh current page data | Data |
| `?` | Show keyboard shortcut help overlay | Help |
| `Escape` | Close open modal/palette/drawer | UI |

### 3.2 Go-To Navigation Chords

Go-To chords use a two-key sequence: press `g`, then within 500ms press the target letter. If the second key is not pressed within 500ms, the chord is cancelled silently.

| Chord | Target | Route |
|-------|--------|-------|
| `g d` | Dashboard | `/` |
| `g c` | Cards | `/cards` |
| `g l` | Loops | `/loops` |
| `g i` | Items (Parts) | `/parts` |
| `g q` | Order Queue | `/queue` |
| `g o` | Order History | `/orders` |
| `g r` | Receiving | `/receiving` |
| `g s` | Scan | `/scan` |

**Implementation gap**: The `UseKeyboardShortcutsOptions` interface in `use-keyboard-shortcuts.ts` already defines `onNavigate?: (path: string) => void` but the keydown handler never invokes it. The Go-To chord system must:
1. Track `gPending` state (boolean, reset after 500ms timeout)
2. On `g` keypress: set `gPending = true`, start 500ms timer
3. On second keypress within window: call `onNavigate(targetPath)` and reset
4. `onNavigate` must be wired in `app-shell.tsx` to call `navigate()` from React Router

### 3.3 Page-Specific Shortcuts: Queue Page

| Shortcut | Action | Notes |
|----------|--------|-------|
| `j` | Move focus to next card | Wraps at bottom of current loop column |
| `k` | Move focus to previous card | Wraps at top |
| `x` | Toggle checkbox on focused card | For bulk selection |
| `Enter` | Expand/collapse focused card | Same as clicking card header |
| `Shift+Enter` | Create order for focused card | Calls `createPurchaseOrderFromCards({ cardIds: [focusedCardId] })` |
| `Ctrl+Shift+Enter` | Create orders for all selected cards | Bulk create, opens confirmation modal |

### 3.4 Page-Specific Shortcuts: Parts Page

| Shortcut | Action |
|----------|--------|
| `j` / `k` | Move focus through part list |
| `Enter` | Open focused part detail |

---

## 4. Contextual Quick Actions

### 4.1 Inline Card Actions (Queue Page)

**Current state**: The "Create Order" button is only visible inside the `ExpandedCardPanel` (requires expanding the card first -- 4 clicks total).

**Target state**: Each `QueueCardItem` row shows an inline icon button for the primary action:

```
+----------------------------------------------+
| Card #1042  .  Widget A                      |
| Qty: 5   Min: 3   Stage: triggered   2h ago  |
|                                  [cart] [v]  |
+----------------------------------------------+
```

- `[cart]` (ShoppingCart icon): Inline "Create Order" button. Calls `createPurchaseOrderFromCards` directly without expanding the card. Reduces the single-card triage workflow from 4 clicks to 2.
- `[v]` (ChevronDown): Existing expand toggle, preserved for users who want to see part details before ordering.

### 4.2 Bulk Actions Bar (Queue Page)

When 1+ cards are selected via checkbox, a sticky bar appears at the bottom of the viewport:

```
+----------------------------------------------+
|  5 cards selected                            |
|              [Create Orders]  [Print Labels] |
|              [Clear Selection]               |
+----------------------------------------------+
```

- **Create Orders**: Calls `createPurchaseOrderFromCards({ cardIds: selectedIds })`. Opens a confirmation modal showing the count and estimated total.
- **Print Labels**: Calls `createPrintJob({ cardIds: selectedIds })`.
- **Clear Selection**: Deselects all cards.

**API readiness**: `createPurchaseOrderFromCards` already accepts `{ cardIds: string[] }`, so bulk creation requires no backend changes.

### 4.3 NextActionBanner Enhancement

**Current state**: `NextActionBanner` renders on the queue page showing summary counts but does not deep-link to specific cards or filtered views.

**Target state**: The banner includes an actionable link:

```
+----------------------------------------------+
| 3 aging cards need attention                 |
|    Review aging cards ->                     |
+----------------------------------------------+
```

- "Review aging cards" link navigates to `/queue?aging=true` (pre-filtered view).
- Banner renders on both Dashboard (`/`) and Queue (`/queue`) pages.

---

## 5. Implementation Priority

| Priority | Surface | Effort | Workflow Impact |
|----------|---------|--------|-----------------|
| P0 | Fix command palette page routes | XS (1h) | Corrects broken navigation |
| P0 | Add missing pages to command palette | S (2h) | Enables full palette navigation |
| P0 | Inline card action button (queue) | S (2h) | Queue Triage Single: 4 clicks -> 2 |
| P0 | Entity search in command palette | M (4h) | Part Lookup: 2+ clicks -> 1 |
| P1 | Go-To navigation chords | M (4h) | Keyboard-only navigation for all pages |
| P1 | Bulk selection + actions bar (queue) | M (6h) | Queue Triage Bulk: 26 clicks -> 8 |
| P1 | `j`/`k` card focus navigation | S (3h) | Keyboard-only queue triage |
| P1 | NextActionBanner deep-link | XS (1h) | Aging Card Review: 2 clicks -> 1 |
| P2 | `Shift+Enter` create order shortcut | S (2h) | Keyboard-only order creation |
| P2 | `?` help overlay | S (3h) | Discoverability |
| P3 | Order entity search (API) | M (4h) | Deferred to Phase 2 |

---

## 6. Cross-References

| Document | Relationship |
|----------|-------------|
| `docs/spec/ia/workflow-maps.md` | Click/time budgets that this command surface is designed to meet |
| `docs/spec/ia/navigation-model.md` | Route definitions and sidebar structure |
| `docs/spec/ia/ux-debt-backlog.md` | Prioritized list of UX gaps referenced here |
| `docs/spec/screens/kanban-screens.md` | Screen-level specs for pages that receive new interaction patterns |
