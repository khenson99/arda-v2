# Arda V2 -- UX Debt Backlog

> Prioritized list of UX gaps between the current implementation and the target interaction model.
> Each item references the workflow it blocks and the source file(s) requiring change.

---

## 1. Overview

### 1.1 Purpose

This document catalogs every known UX gap in the Arda Kanban system, prioritized by workflow impact and estimated effort. Items are derived from the source code audit conducted against the workflow budgets in `workflow-maps.md` and the target command surface in `command-surface.md`.

### 1.2 Priority Levels

| Priority | Definition | Timeline |
|----------|-----------|----------|
| **P0** | Blocks a primary workflow or contains a bug in shipped code | Sprint 1 |
| **P1** | Degrades a primary workflow (extra clicks, no keyboard path) | Sprint 1-2 |
| **P2** | Degrades a secondary workflow or harms discoverability | Sprint 2-3 |
| **P3** | Nice-to-have polish; deferred until primary workflows meet budget | Backlog |

### 1.3 Effort Scale

| Size | Estimate | Description |
|------|----------|-------------|
| XS | < 2h | Config change, string fix, single-component tweak |
| S | 2-4h | New component or hook addition within existing patterns |
| M | 4-8h | Cross-component feature (new hook + UI + wiring) |
| L | 1-2d | New subsystem or significant refactor |

---

## 2. P0 -- Critical (Sprint 1)

### 2.1 Command palette has incorrect routes

**ID**: UX-001
**Workflow**: Part Lookup, Queue Triage (indirect)
**Current behavior**: `PAGE_ITEMS` in `command-palette.tsx` maps "Order History" to `/notifications` (redirects to `/orders`) and "Receiving" to `/scan` (wrong page entirely).
**Target**: "Order History" -> `/orders`, "Receiving" -> `/receiving`.
**File(s)**: `apps/web/src/components/command-palette.tsx` (lines 34-40)
**Effort**: XS

### 2.2 Command palette missing 3 pages

**ID**: UX-002
**Workflow**: All workflows (navigation completeness)
**Current behavior**: Cards (`/cards`), Loops (`/loops`), and Receiving (`/receiving`) are absent from `PAGE_ITEMS`.
**Target**: Add all 8 routable pages to the palette.
**File(s)**: `apps/web/src/components/command-palette.tsx`
**Effort**: XS

### 2.3 Queue card requires expand to create order

**ID**: UX-003
**Workflow**: Queue Triage (Single) -- 4 clicks instead of 2
**Current behavior**: "Create Order" button is inside `ExpandedCardPanel`, visible only after expanding a card and scrolling.
**Target**: Add inline ShoppingCart icon button to `QueueCardItem` row, visible without expansion.
**File(s)**: `apps/web/src/pages/queue.tsx` (`QueueCardItem` component, lines 146-220)
**Effort**: S

### 2.4 No entity search in command palette

**ID**: UX-004
**Workflow**: Part Lookup -- 2+ clicks instead of 1
**Current behavior**: Command palette only searches page labels and action names. No part/card/loop entity search.
**Target**: Add entity search group that queries in-memory `useWorkspaceData` results (parts, cards, loops).
**File(s)**: `apps/web/src/components/command-palette.tsx`, `apps/web/src/hooks/use-workspace-data.ts`
**Effort**: M

---

## 3. P1 -- High (Sprint 1-2)

### 3.1 No Go-To keyboard navigation

**ID**: UX-005
**Workflow**: All primary workflows (keyboard-only path)
**Current behavior**: `useKeyboardShortcuts` defines `onNavigate` in its TypeScript interface but the keydown handler never invokes it. No Go-To chord system exists.
**Target**: Implement `g` + letter chord system (500ms window) wired to React Router `navigate()`.
**File(s)**: `apps/web/src/hooks/use-keyboard-shortcuts.ts`, `apps/web/src/layouts/app-shell.tsx`
**Effort**: M

### 3.2 No bulk order creation

**ID**: UX-006
**Workflow**: Queue Triage (Bulk) -- 26 clicks instead of 8 for 5 cards
**Current behavior**: No checkbox selection on queue cards. Each order must be created individually via expand -> click.
**Target**: Add per-card checkboxes, selection state, sticky bulk actions bar with "Create Orders" and "Print Labels" buttons.
**File(s)**: `apps/web/src/pages/queue.tsx`
**Effort**: M

### 3.3 No j/k keyboard card navigation

**ID**: UX-007
**Workflow**: Queue Triage (Single and Bulk) -- no keyboard-only path
**Current behavior**: No focus management for queue card list. Tab key skips over cards.
**Target**: `j`/`k` moves a visible focus ring through cards in the current loop column. Focus state tracked in `QueueRoute` component.
**File(s)**: `apps/web/src/pages/queue.tsx`
**Effort**: S

### 3.4 NextActionBanner does not deep-link

**ID**: UX-008
**Workflow**: Aging Card Review -- 2 clicks instead of 1
**Current behavior**: `NextActionBanner` shows counts but clicking it does not filter or navigate.
**Target**: Add "Review N aging cards" link that navigates to `/queue?aging=true`. Render banner on both Dashboard and Queue pages.
**File(s)**: `apps/web/src/components/next-action-banner.tsx`, `apps/web/src/pages/dashboard.tsx`
**Effort**: XS

### 3.5 Refresh shortcut not wired

**ID**: UX-009
**Workflow**: All (data freshness)
**Current behavior**: `useKeyboardShortcuts` partially handles `r` key but `onRefresh` is not wired in `app-shell.tsx`.
**Target**: Wire `onRefresh` to trigger the current page's data refresh function (e.g., `refreshQueueOnly` on queue page).
**File(s)**: `apps/web/src/layouts/app-shell.tsx`, `apps/web/src/hooks/use-keyboard-shortcuts.ts`
**Effort**: S

---

## 4. P2 -- Medium (Sprint 2-3)

### 4.1 No keyboard shortcut help overlay

**ID**: UX-010
**Workflow**: Discoverability
**Current behavior**: No way to discover available shortcuts without reading source code.
**Target**: `?` key opens a modal listing all shortcuts grouped by category. Shows current page context.
**File(s)**: New component: `apps/web/src/components/keyboard-help.tsx`
**Effort**: S

### 4.2 Shift+Enter order creation shortcut

**ID**: UX-011
**Workflow**: Queue Triage (Single) -- keyboard-only order creation
**Current behavior**: No shortcut for creating an order from a focused card.
**Target**: When a card has keyboard focus on queue page, `Shift+Enter` triggers order creation.
**File(s)**: `apps/web/src/pages/queue.tsx`, `apps/web/src/hooks/use-keyboard-shortcuts.ts`
**Effort**: S

### 4.3 Command palette shortcut display

**ID**: UX-012
**Workflow**: Discoverability
**Current behavior**: Only "Refresh data" shows a shortcut hint (`R`). Page items show no Go-To chord hints.
**Target**: All palette items display their keyboard shortcut via `<CommandShortcut>`.
**File(s)**: `apps/web/src/components/command-palette.tsx`
**Effort**: XS

### 4.4 Scan workflow via command palette

**ID**: UX-013
**Workflow**: Scan Trigger -- keyboard-accessible scan initiation
**Current behavior**: Scan requires clicking the header "Scan" button.
**Target**: "Scan a card" workflow item in command palette navigates to `/scan`.
**File(s)**: `apps/web/src/components/command-palette.tsx`
**Effort**: XS

### 4.5 Queue sort/filter state not in URL

**ID**: UX-014
**Workflow**: Aging Card Review, Queue Triage
**Current behavior**: `activeLoopFilter`, `searchTerm`, and `sortKey` are React state only. Refreshing the page resets all filters.
**Target**: Persist filter state in URL search params (`?loop=procurement&sort=age&q=widget`).
**File(s)**: `apps/web/src/pages/queue.tsx`
**Effort**: S

---

## 5. P3 -- Low (Backlog)

### 5.1 Order entity search (API-backed)

**ID**: UX-015
**Workflow**: Part Lookup (extended to orders)
**Current behavior**: Orders are not searchable from the command palette.
**Target**: Add API endpoint `GET /api/orders/search?q=...` and integrate into command palette entity search.
**File(s)**: Backend API + `command-palette.tsx`
**Effort**: M

### 5.2 Mobile bottom navigation bar

**ID**: UX-016
**Workflow**: All mobile workflows
**Current behavior**: No bottom navigation on mobile. Sidebar drawer is the only navigation.
**Target**: Bottom nav bar with Scan, Receive, Cards, Queue, More for `< 768px` viewports.
**File(s)**: New component: `apps/web/src/components/mobile-nav.tsx`, `app-shell.tsx`
**Effort**: M

### 5.3 Breadcrumb navigation

**ID**: UX-017
**Workflow**: All (wayfinding)
**Current behavior**: No breadcrumbs rendered. Navigation model spec defines breadcrumb patterns but they are not implemented.
**Target**: Auto-generated breadcrumbs from route path segments per `navigation-model.md` section 6.
**File(s)**: New component: `apps/web/src/components/breadcrumbs.tsx`, `app-shell.tsx`
**Effort**: M

### 5.4 Command palette recent items

**ID**: UX-018
**Workflow**: Part Lookup, general navigation
**Current behavior**: No history of recently accessed pages or entities.
**Target**: Track last 5 navigations in `localStorage`, show as "Recent" group above Pages in command palette.
**File(s)**: `apps/web/src/components/command-palette.tsx`
**Effort**: S

---

## 6. Summary Table

| ID | Title | Priority | Effort | Workflow(s) Affected |
|----|-------|----------|--------|---------------------|
| UX-001 | Fix command palette routes | P0 | XS | Part Lookup, Navigation |
| UX-002 | Add missing pages to palette | P0 | XS | All |
| UX-003 | Inline card order button | P0 | S | Queue Triage (Single) |
| UX-004 | Entity search in palette | P0 | M | Part Lookup |
| UX-005 | Go-To keyboard chords | P1 | M | All primary workflows |
| UX-006 | Bulk order creation | P1 | M | Queue Triage (Bulk) |
| UX-007 | j/k card navigation | P1 | S | Queue Triage |
| UX-008 | NextActionBanner deep-link | P1 | XS | Aging Card Review |
| UX-009 | Wire refresh shortcut | P1 | S | All |
| UX-010 | Keyboard help overlay | P2 | S | Discoverability |
| UX-011 | Shift+Enter order shortcut | P2 | S | Queue Triage (Single) |
| UX-012 | Palette shortcut display | P2 | XS | Discoverability |
| UX-013 | Scan via command palette | P2 | XS | Scan Trigger |
| UX-014 | Queue filters in URL | P2 | S | Queue Triage, Aging Review |
| UX-015 | Order entity search (API) | P3 | M | Part Lookup (extended) |
| UX-016 | Mobile bottom nav | P3 | M | All mobile |
| UX-017 | Breadcrumb navigation | P3 | M | All (wayfinding) |
| UX-018 | Recent items in palette | P3 | S | Navigation |

**Total effort estimate**: ~55-65 hours across all priorities.
**P0 sprint estimate**: ~9 hours (4 items).
**P0+P1 sprint estimate**: ~28 hours (9 items).

---

## 7. Cross-References

| Document | Relationship |
|----------|-------------|
| `docs/spec/ia/workflow-maps.md` | Click/time budgets that define "done" for each debt item |
| `docs/spec/ia/command-surface.md` | Target interaction model that debt items work toward |
| `docs/spec/ia/navigation-model.md` | Route and sidebar definitions |
| `docs/spec/screens/kanban-screens.md` | Screen-level specs for affected pages |
