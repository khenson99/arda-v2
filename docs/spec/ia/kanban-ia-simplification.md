# Arda V2 -- Kanban IA Simplification

> Defines the simplified information architecture for the Arda Kanban system, persona-driven workflow analysis, command-centered interaction model, and implementation-ready acceptance criteria.
> Parent epic: #84 (Kanban IA Redesign). Issue: #87.

---

## 1. Overview

### 1.1 Purpose

This document specifies the target information architecture for Arda's Kanban system, optimized for the shortest-path workflows used by the three primary MVP personas. It consolidates the analysis from the current navigation model, command surface specification, and UX debt backlog into a single actionable plan.

### 1.2 Goals

1. **Reduce click-depth**: Every primary workflow reachable and completable within 3 clicks from its entry page.
2. **Enable keyboard-only paths**: All primary workflows must be completable without a mouse.
3. **Command-centered IA**: The command palette (`Cmd+K`) becomes the universal entry point for navigation, entity search, and workflow actions.
4. **Persona alignment**: Navigation and quick actions surface the right tools for each role without requiring configuration.

### 1.3 Scope

- MVP Phase 1 routes (11 flat routes, see `navigation-model.md` section 9)
- 3 primary personas: Warehouse Operator, Procurement Manager, Inventory Analyst
- 5 primary workflows + 3 secondary workflows (defined in `workflow-maps.md`)
- Command palette, keyboard shortcuts, inline quick actions, bulk actions

### 1.4 Dependencies

| Dependency | Reference | Status |
|-----------|-----------|--------|
| MVP-12: Command palette | `command-surface.md` | Partial (bugs, missing features) |
| MVP-07: Queue page | `kanban-screens.md` section 4 | Implemented (missing inline actions) |
| MVP-22: Keyboard shortcuts | `command-surface.md` section 3 | Minimal (only `Cmd+K`, `/`, `r`) |

---

## 2. Persona Analysis

### 2.1 Primary Personas (MVP Phase 1)

#### 2.1.1 Warehouse Operator / Receiving Manager

| Attribute | Value |
|-----------|-------|
| **Role key** | `receiving_manager` |
| **Primary domain** | Scanning, receiving, inventory moves, transfer orders |
| **Landing page (target)** | `/mobile/receiving` (MVP: `/`) |
| **Top workflows** | Scan Trigger (20-50x/day), Goods Receiving (10-20x/day) |
| **Device** | Mobile / tablet on warehouse floor |
| **Interaction style** | Scan-first, minimal typing, large touch targets |

**Key IA needs:**
- Scan button always visible and accessible (header position preserved)
- Receiving workflow accessible in 1 tap from landing
- Card lookup via scan, not text search
- Minimal sidebar navigation -- most actions via scan deep-links

**Permission scope:**
- Full: `/scan/*`, `/mobile/*`, `/orders/transfer/*`
- Write: `/orders/purchase/:id/receive`
- Read: `/kanban/cards`, `/kanban/loops`, `/catalog/parts`
- No access: Reports, eCommerce, Settings

#### 2.1.2 Procurement Manager

| Attribute | Value |
|-----------|-------|
| **Role key** | `procurement_manager` |
| **Primary domain** | Purchase orders, suppliers, receiving, order queue |
| **Landing page (target)** | `/orders/queue` (MVP: `/`) |
| **Top workflows** | Queue Triage Single (10-30x/day), Queue Triage Bulk (2-5x/day), Part Lookup (10-20x/day) |
| **Device** | Desktop |
| **Interaction style** | Keyboard-heavy, batch operations, supplier-grouped views |

**Key IA needs:**
- Queue page is home base -- must load fast, support bulk operations
- Inline order creation without expanding cards
- Entity search for parts by name or number
- Supplier-grouped queue views for batch PO creation
- Keyboard navigation through queue cards (`j`/`k`)

**Permission scope:**
- Full: `/orders/queue`, `/orders/purchase/*`, `/catalog/suppliers/*`
- Read: `/kanban/*`, `/catalog/parts/*`, `/orders/work/*`, `/orders/transfer/*`
- No access: eCommerce, Settings (except facilities read)

#### 2.1.3 Inventory Manager / Analyst

| Attribute | Value |
|-----------|-------|
| **Role key** | `inventory_manager` |
| **Primary domain** | Stock levels, reorder points, bin management, Kanban loops |
| **Landing page (target)** | `/kanban` (MVP: `/`) |
| **Top workflows** | Aging Card Review (2-5x/day), Loop Parameter Adjustment (1-3x/week), Card Stage History (2-5x/week) |
| **Device** | Desktop |
| **Interaction style** | Analytical, cross-referencing, parameter tuning |

**Key IA needs:**
- Quick access to aging cards via NextActionBanner
- Loop parameter editing with minimal navigation
- Card search by card number for stage history review
- Velocity dashboards for trend analysis (deferred)
- ReLoWiSa recommendations review (deferred)

**Permission scope:**
- Full: `/kanban/*`, `/catalog/parts/*`, `/catalog/categories/*`, `/catalog/bom/*`
- Read: `/orders/*`, `/catalog/suppliers/*`, `/reports/*`
- No access: eCommerce

### 2.2 Persona Workflow Frequency Matrix

| Workflow | Warehouse Operator | Procurement Manager | Inventory Analyst |
|----------|:-:|:-:|:-:|
| Queue Triage (Single) | -- | **30x/day** | 2x/day |
| Queue Triage (Bulk) | -- | **5x/day** | -- |
| Scan Trigger | **50x/day** | -- | 2x/day |
| Part Lookup | 5x/day | **20x/day** | **20x/day** |
| Aging Card Review | -- | 3x/day | **5x/day** |
| Loop Parameter Adjust | -- | -- | **3x/week** |
| Card Stage History | -- | -- | **5x/week** |
| Notification Triage | 3x/day | 5x/day | 5x/day |

Bold indicates the persona is the primary user of that workflow.

---

## 3. Current vs Target Click-Depth Analysis

### 3.1 Primary Workflows

| # | Workflow | Primary Persona | Current Clicks | Target Clicks | Reduction | Target Time | Priority |
|---|----------|----------------|:-:|:-:|:-:|:-:|:-:|
| 1 | Queue Triage (Single) | Procurement Mgr | 4 | 2 | -50% | < 5s | P0 |
| 2 | Queue Triage (Bulk, 5 cards) | Procurement Mgr | 26 | 8 | -69% | < 15s | P0 |
| 3 | Scan Trigger | Warehouse Op | 2 | 1 | -50% | < 2s | P1 |
| 4 | Part Lookup | All | 2+ | 1 | -50%+ | < 3s | P0 |
| 5 | Aging Card Review | Inventory Analyst | 2 | 1 | -50% | < 2s | P1 |

### 3.2 Secondary Workflows

| # | Workflow | Primary Persona | Current Clicks | Target Clicks | Reduction | Target Time | Priority |
|---|----------|----------------|:-:|:-:|:-:|:-:|:-:|
| 6 | Loop Parameter Adjust | Inventory Analyst | 4 | 3 | -25% | < 15s | P2 |
| 7 | Card Stage History | Inventory Analyst | 3 | 2 | -33% | < 6s | P2 |
| 8 | Notification Triage | All | 2 | 2 | 0% | < 5s | -- |

### 3.3 Gap Analysis Summary

**Total primary workflow click budget:**
- Current: 36+ clicks across 5 primary workflows
- Target: 13 clicks across 5 primary workflows
- **Overall reduction: 64%**

**Keyboard-only coverage:**
- Current: 0 of 5 primary workflows have keyboard-only paths
- Target: 5 of 5 primary workflows have keyboard-only paths

**Bottleneck analysis:**
1. **Queue Triage (Bulk)** has the largest absolute gap (26 -> 8 clicks). Root cause: no checkbox selection, no bulk action bar.
2. **Queue Triage (Single)** has the highest frequency * gap product. Root cause: order creation buried inside expanded card panel.
3. **Part Lookup** is the most cross-persona workflow. Root cause: requires navigating to Parts page before searching.

---

## 4. Command-Centered IA Design

### 4.1 Design Philosophy

The command palette replaces page-first navigation as the primary interaction model. Instead of "navigate to a page, then find the action," users invoke the action or entity directly via `Cmd+K`.

```
Traditional IA:          Command-Centered IA:
Page -> Find -> Act      Cmd+K -> Search/Select -> Done
4+ clicks                1-2 interactions
```

### 4.2 Command Palette Architecture

The command palette is a `CommandDialog` (shadcn/ui wrapper around cmdk) organized into 4 priority groups.

#### 4.2.1 Group 1: Pages (8 items)

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

**Current bugs** (from `ux-debt-backlog.md` UX-001, UX-002):
- "Order History" routes to `/notifications` instead of `/orders`
- "Receiving" routes to `/scan` instead of `/receiving`
- Cards, Loops, Receiving pages are missing from the palette entirely

#### 4.2.2 Group 2: Workflows

Workflow shortcuts surface the highest-frequency actions.

| Label | Action | Shortcut | Context |
|-------|--------|----------|---------|
| Create order for focused card | Calls `createPurchaseOrderFromCards` | `Shift+Enter` | Queue page with focused card |
| Scan a card | Navigate to `/scan`, activate camera | -- | Global |

#### 4.2.3 Group 3: Contextual Actions

Actions that depend on the current page or selection state.

| Label | Action | Shortcut | Visibility |
|-------|--------|----------|------------|
| Refresh data | Trigger page data refresh | `r` | Always |
| Toggle shop floor mode | Calls `onToggleShopFloorMode` | -- | Always |

#### 4.2.4 Group 4: Entity Search

Entity search matches against in-memory data from `useWorkspaceData`, providing instant results.

| Entity | Search Fields | Data Source | Navigate To |
|--------|--------------|-------------|-------------|
| Parts | `name`, `partNumber`, `primarySupplier` | `parts` array from `useWorkspaceData` | `/parts` (filtered) |
| Cards | `cardNumber`, `partId` | `queueByLoop` flattened | `/cards` |
| Loops | loop name, type | `loops` from `useWorkspaceData` | `/loops/:loopId` |

**Deferred**: Order entity search requires API endpoint `GET /api/orders/search?q=...` (P3, UX-015).

### 4.3 Global Keyboard Shortcuts

Single-key shortcuts are suppressed inside editable elements (inputs, textareas, selects, contentEditable).

| Shortcut | Action | Category |
|----------|--------|----------|
| `Cmd+K` / `Ctrl+K` | Open command palette | Navigation |
| `/` | Open command palette (focus search) | Navigation |
| `r` | Refresh current page data | Data |
| `?` | Show keyboard shortcut help overlay | Help |
| `Escape` | Close open modal/palette/drawer | UI |

### 4.4 Go-To Navigation Chords

Two-key sequences: press `g`, then within 500ms press the target letter. If the second key is not pressed within 500ms, the chord is cancelled silently.

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

**Implementation gap** (UX-005): `UseKeyboardShortcutsOptions` interface defines `onNavigate?: (path: string) => void` but the keydown handler never invokes it. Requires:
1. Track `gPending` state (boolean, reset after 500ms timeout)
2. On `g` keypress: set `gPending = true`, start 500ms timer
3. On second keypress within window: call `onNavigate(targetPath)` and reset
4. Wire `onNavigate` in `app-shell.tsx` to call React Router `navigate()`

### 4.5 Page-Specific Shortcuts

#### Queue Page (`/queue`)

| Shortcut | Action | Notes |
|----------|--------|-------|
| `j` | Move focus to next card | Wraps at bottom of current loop column |
| `k` | Move focus to previous card | Wraps at top |
| `x` | Toggle checkbox on focused card | For bulk selection |
| `Enter` | Expand/collapse focused card | Same as clicking card header |
| `Shift+Enter` | Create order for focused card | Calls `createPurchaseOrderFromCards({ cardIds: [focusedCardId] })` |
| `Ctrl+Shift+Enter` | Create orders for all selected cards | Opens confirmation modal |

#### Parts Page (`/parts`)

| Shortcut | Action |
|----------|--------|
| `j` / `k` | Move focus through part list |
| `Enter` | Open focused part detail |

---

## 5. Quick Actions & Inline Interactions

### 5.1 Inline Card Actions (Queue Page)

**Current state** (UX-003): "Create Order" button is inside `ExpandedCardPanel`, visible only after expanding a card and scrolling. This adds 2 unnecessary clicks to every single-card triage.

**Target state**: Each `QueueCardItem` row shows an inline icon button:

```
+----------------------------------------------+
| Card #1042  .  Widget A                      |
| Qty: 5   Min: 3   Stage: triggered   2h ago  |
|                                  [cart] [v]  |
+----------------------------------------------+
```

- `[cart]` (ShoppingCart icon): Inline "Create Order" button. Calls `createPurchaseOrderFromCards` directly without expanding. **Reduces single-card triage from 4 clicks to 2.**
- `[v]` (ChevronDown): Existing expand toggle, preserved for detail inspection.

**File**: `apps/web/src/pages/queue.tsx` (`QueueCardItem` component, lines 146-220)

### 5.2 Bulk Actions Bar (Queue Page)

**Current state** (UX-006): No checkbox selection on queue cards. Each order must be created individually.

**Target state**: When 1+ cards are selected via checkbox, a sticky bar appears at the bottom of the viewport:

```
+----------------------------------------------+
|  5 cards selected                            |
|              [Create Orders]  [Print Labels] |
|              [Clear Selection]               |
+----------------------------------------------+
```

- **Create Orders**: Calls `createPurchaseOrderFromCards({ cardIds: selectedIds })`. Opens confirmation modal with count and estimated total.
- **Print Labels**: Calls `createPrintJob({ cardIds: selectedIds })`.
- **Clear Selection**: Deselects all cards.

**API readiness**: `createPurchaseOrderFromCards` already accepts `{ cardIds: string[] }`, so bulk creation requires no backend changes.

**File**: `apps/web/src/pages/queue.tsx`

### 5.3 NextActionBanner Enhancement

**Current state** (UX-008): `NextActionBanner` renders on the queue page showing summary counts but does not deep-link to specific cards or filtered views.

**Target state**:

```
+----------------------------------------------+
| 3 aging cards need attention                 |
|    Review aging cards ->                     |
+----------------------------------------------+
```

- "Review aging cards" link navigates to `/queue?aging=true` (pre-filtered view).
- Banner renders on both Dashboard (`/`) and Queue (`/queue`) pages.

**Files**: `apps/web/src/components/next-action-banner.tsx`, `apps/web/src/pages/dashboard.tsx`

---

## 6. Navigation Model Changes

### 6.1 Sidebar (No Changes for MVP Phase 1)

The current 7-item flat sidebar (2 groups: Kanban, Operations) is preserved for MVP Phase 1. The command palette and keyboard shortcuts layer on top of the existing sidebar without modifying its structure.

| Group | Label | Route | Icon |
|-------|-------|-------|------|
| **Kanban** | Dashboard | `/` | `Activity` |
| | Cards | `/cards` | `CreditCard` |
| | Loops | `/loops` | `RefreshCw` |
| **Operations** | Items | `/parts` | `Boxes` |
| | Order Queue | `/queue` | `SquareKanban` |
| | Order History | `/orders` | `Bell` |
| | Receiving | `/receiving` | `PackageCheck` |

### 6.2 Header (Minor Enhancements)

| Position | Element | Current | Target |
|----------|---------|---------|--------|
| Center | Search icon | Opens command palette | Unchanged |
| Right | Scan button | Navigates to `/scan` | Unchanged |
| Right | Bell icon | Opens notifications drawer | Unchanged |

No header changes are required for the IA simplification. The scan button and command palette trigger are already well-positioned.

### 6.3 Breadcrumbs (Deferred)

Breadcrumb navigation is defined in `navigation-model.md` section 6 but deferred to a later phase (UX-017). The flat route structure of MVP Phase 1 makes breadcrumbs less critical -- users are never more than 1 level deep from the sidebar.

### 6.4 URL Query Parameters (New)

Queue filter state should be persisted in URL search params to enable deep-linking and back/forward navigation (UX-014):

| Parameter | Type | Example | Default |
|-----------|------|---------|---------|
| `loop` | string | `?loop=procurement` | all |
| `sort` | enum | `?sort=age` | `priority` |
| `q` | string | `?q=widget` | empty |
| `aging` | boolean | `?aging=true` | false |

**File**: `apps/web/src/pages/queue.tsx` (lift `activeLoopFilter`, `searchTerm`, `sortKey` from React state to URL params)

---

## 7. Permission Model Alignment

### 7.1 Current State

MVP Phase 1 has no route-level permission guards. All authenticated users can access all routes. The full route-to-role access matrix is defined in `navigation-model.md` section 5 but is not implemented.

### 7.2 Command Surface Permission Rules

When command palette items and keyboard shortcuts are implemented, they must respect the same permission model:

| Rule | Description |
|------|-------------|
| **Page visibility** | Command palette Pages group only shows routes accessible to the user's role |
| **Workflow visibility** | "Create order for focused card" only appears for roles with write access to `/orders/queue` |
| **Entity search scope** | All entities are read-accessible for MVP; restrict to role-permitted entities in Phase 2 |
| **Shortcut activation** | Keyboard shortcuts for write actions (e.g., `Shift+Enter` order creation) are no-ops for read-only roles |

### 7.3 Queue Page Action Permissions

| Action | Roles with Access | Guard |
|--------|-------------------|-------|
| View queue cards | `tenant_admin`, `inventory_manager`, `procurement_manager`, `receiving_manager`, `executive` | Read |
| Create order (inline or bulk) | `tenant_admin`, `procurement_manager` | Write to `/orders/queue` |
| Print labels | `tenant_admin`, `inventory_manager`, `procurement_manager`, `receiving_manager` | Read + print |

### 7.4 Deferred Permission Work

Full route-level `RoleGuard` implementation is deferred. For MVP Phase 1, permission checks are applied at the UI action level (hiding buttons, disabling shortcuts) rather than at the route level.

---

## 8. Implementation Acceptance Criteria

### 8.1 Queue Triage (Single Card) -- P0

**Workflow ID**: WF-01
**Target**: 2 clicks, < 5s, keyboard-only path available

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-01 | Inline ShoppingCart icon button visible on every `QueueCardItem` row without expanding | Visual inspection |
| AC-02 | Clicking inline button calls `createPurchaseOrderFromCards({ cardIds: [cardId] })` | Network trace shows POST |
| AC-03 | Success toast appears within 1s of click | UI timing |
| AC-04 | Card disappears from queue or transitions to `ordered` stage in UI | State update |
| AC-05 | `j`/`k` keyboard navigation moves visible focus ring through cards | Keyboard test |
| AC-06 | `Shift+Enter` on focused card triggers same action as inline button | Keyboard test |

### 8.2 Queue Triage (Bulk Order) -- P0

**Workflow ID**: WF-02
**Target**: 8 clicks for 5 cards, < 15s, keyboard-only path available

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-07 | Each `QueueCardItem` has a checkbox that toggles selection | Click test |
| AC-08 | `x` key toggles checkbox on focused card | Keyboard test |
| AC-09 | Selecting 1+ cards shows sticky bulk actions bar at viewport bottom | Visual inspection |
| AC-10 | Bulk actions bar shows selected count and "Create Orders" button | Visual inspection |
| AC-11 | "Create Orders" button opens confirmation modal with count and summary | Click test |
| AC-12 | Confirming modal calls `createPurchaseOrderFromCards({ cardIds: selectedIds })` | Network trace |
| AC-13 | `Ctrl+Shift+Enter` triggers bulk create confirmation modal | Keyboard test |
| AC-14 | All selected cards update/disappear from queue after bulk creation | State update |

### 8.3 Part Lookup -- P0

**Workflow ID**: WF-04
**Target**: 1 interaction, < 3s

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-15 | `Cmd+K` opens command palette | Keyboard test |
| AC-16 | Typing in palette searches across Pages, Workflows, and Entity Search groups | Type test |
| AC-17 | Entity search matches parts by `name`, `partNumber`, `primarySupplier` | Search test |
| AC-18 | Entity search matches cards by `cardNumber` | Search test |
| AC-19 | Entity search matches loops by name | Search test |
| AC-20 | Selecting a part entity navigates to the part detail or filtered Parts page | Navigation test |
| AC-21 | Search results appear within 100ms (client-side, from `useWorkspaceData`) | Performance test |

### 8.4 Command Palette Fixes -- P0

**Workflow ID**: WF-ALL (prerequisite)

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-22 | "Order History" routes to `/orders` (not `/notifications`) | Navigation test |
| AC-23 | "Receiving" routes to `/receiving` (not `/scan`) | Navigation test |
| AC-24 | Cards (`/cards`), Loops (`/loops`), Receiving (`/receiving`) appear in Pages group | Visual inspection |
| AC-25 | All 8 page items display Go-To chord hints via `<CommandShortcut>` | Visual inspection |

### 8.5 Go-To Navigation Chords -- P1

**Workflow ID**: WF-ALL

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-26 | Pressing `g` starts a 500ms chord window | Timer test |
| AC-27 | Pressing target letter within window navigates to correct route | Navigation test for all 8 chords |
| AC-28 | Chord is cancelled silently if second key not pressed within 500ms | Timer test |
| AC-29 | Chords are suppressed inside editable elements | Input focus test |

### 8.6 Scan Trigger -- P1

**Workflow ID**: WF-03
**Target**: 1 click, < 2s

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-30 | Header Scan button navigates to `/scan` and activates camera | Click test |
| AC-31 | "Scan a card" appears in command palette Workflows group | Palette test |
| AC-32 | `g s` chord navigates to `/scan` | Keyboard test |

### 8.7 Aging Card Review -- P1

**Workflow ID**: WF-05
**Target**: 1 click, < 2s

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-33 | NextActionBanner shows "Review N aging cards" link when aging cards exist | Visual inspection |
| AC-34 | Link navigates to `/queue?aging=true` | Navigation test |
| AC-35 | Queue page filters to aging cards when `?aging=true` is in URL | Filter test |
| AC-36 | Banner renders on both Dashboard (`/`) and Queue (`/queue`) pages | Multi-page test |

### 8.8 Keyboard Help Overlay -- P2

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-37 | `?` key opens a modal listing all available shortcuts | Keyboard test |
| AC-38 | Shortcuts are grouped by category (Navigation, Queue, Data, Help) | Visual inspection |
| AC-39 | Modal shows context-sensitive shortcuts based on current page | Page switch test |

---

## 9. Implementation Roadmap

### 9.1 Sprint 1 (P0 Items -- ~9 hours)

| Item | UX Debt ID | Effort | Acceptance Criteria |
|------|-----------|--------|---------------------|
| Fix command palette routes | UX-001 | XS (1h) | AC-22, AC-23 |
| Add missing pages to palette | UX-002 | XS (2h) | AC-24, AC-25 |
| Inline card order button | UX-003 | S (2h) | AC-01 through AC-04 |
| Entity search in palette | UX-004 | M (4h) | AC-15 through AC-21 |

### 9.2 Sprint 1-2 (P1 Items -- ~19 hours)

| Item | UX Debt ID | Effort | Acceptance Criteria |
|------|-----------|--------|---------------------|
| Go-To navigation chords | UX-005 | M (4h) | AC-26 through AC-29 |
| Bulk order creation | UX-006 | M (6h) | AC-07 through AC-14 |
| j/k card navigation | UX-007 | S (3h) | AC-05, AC-06 |
| NextActionBanner deep-link | UX-008 | XS (1h) | AC-33 through AC-36 |
| Wire refresh shortcut | UX-009 | S (2h) | -- |
| Scan via command palette | UX-013 | XS (1h) | AC-30 through AC-32 |
| Command palette shortcut display | UX-012 | XS (1h) | AC-25 |

### 9.3 Sprint 2-3 (P2 Items -- ~10 hours)

| Item | UX Debt ID | Effort | Acceptance Criteria |
|------|-----------|--------|---------------------|
| Keyboard help overlay | UX-010 | S (3h) | AC-37 through AC-39 |
| Shift+Enter order shortcut | UX-011 | S (2h) | AC-06 |
| Queue filters in URL | UX-014 | S (3h) | AC-35 |

### 9.4 Effort Summary

| Phase | Items | Total Effort | Cumulative |
|-------|-------|-------------|-----------|
| Sprint 1 (P0) | 4 | ~9h | 9h |
| Sprint 1-2 (P1) | 7 | ~19h | 28h |
| Sprint 2-3 (P2) | 3 | ~10h | 38h |
| **Total MVP Phase 1** | **14** | **~38h** | |

---

## 10. Files Affected

| File | Changes |
|------|---------|
| `apps/web/src/components/command-palette.tsx` | Fix routes (UX-001), add pages (UX-002), entity search (UX-004), shortcut display (UX-012), scan workflow (UX-013) |
| `apps/web/src/hooks/use-keyboard-shortcuts.ts` | Go-To chords (UX-005), refresh wiring (UX-009), Shift+Enter (UX-011) |
| `apps/web/src/layouts/app-shell.tsx` | Wire `onNavigate` for Go-To chords (UX-005), wire `onRefresh` (UX-009) |
| `apps/web/src/pages/queue.tsx` | Inline card action (UX-003), bulk selection (UX-006), j/k navigation (UX-007), URL params (UX-014) |
| `apps/web/src/components/next-action-banner.tsx` | Deep-link to filtered queue (UX-008) |
| `apps/web/src/pages/dashboard.tsx` | Render NextActionBanner (UX-008) |
| New: `apps/web/src/components/keyboard-help.tsx` | Help overlay (UX-010) |

---

## 11. Cross-References

| Document | Relationship |
|----------|-------------|
| `docs/spec/ia/workflow-maps.md` | Detailed workflow step-by-step flows and click/time budgets |
| `docs/spec/ia/command-surface.md` | Command palette architecture and keyboard shortcut specifications |
| `docs/spec/ia/ux-debt-backlog.md` | Prioritized UX gap list with effort estimates |
| `docs/spec/ia/navigation-model.md` | Route definitions, sidebar structure, permission matrix |
| `docs/spec/ia/sitemap.md` | Full route hierarchy across all personas |
| `docs/spec/screens/kanban-screens.md` | Screen-level specs for all Kanban pages |
| `docs/spec/workflows/queue-prioritization.md` | Queue priority scoring and PO creation flow |
| `docs/spec/workflows/automation-policy.md` | Automation rules governing order creation |
