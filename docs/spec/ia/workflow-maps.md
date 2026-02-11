# Arda V2 -- Workflow Maps

> Defines the primary and secondary user workflows with current and target click/time budgets.
> Source of truth for workflow-level UX performance goals.

---

## 1. Overview

### 1.1 Purpose

This document maps the highest-frequency user workflows in the Arda Kanban system, establishes measurable click-depth and time budgets, and identifies the gaps between current implementation and target state.

### 1.2 Scope

Covers the 5 primary workflows (executed multiple times per day by core personas) and 3 secondary workflows (executed daily or weekly). Each workflow is defined from a cold start on its entry page.

### 1.3 Key Metrics

| Metric | Definition |
|--------|-----------|
| **Click count** | Number of discrete mouse clicks or taps required to complete the workflow |
| **Interaction count** | Total interactions including keyboard input, scrolls, and clicks |
| **Time budget** | Maximum wall-clock time for a trained user to complete the workflow |
| **Keyboard-only** | Whether the workflow can be completed without a mouse |

---

## 2. Primary Workflows

### 2.1 Queue Triage (Single Card)

**Persona**: Procurement Manager, Operations Manager
**Entry point**: `/queue` (sidebar "Order Queue")
**Frequency**: 10-30x per day

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Click count | 4 | 2 | -2 |
| Interactions | 4 | 2 | -2 |
| Time budget | ~12s | < 5s | -7s |
| Keyboard-only | No | Yes | Missing |

**Current path** (4 clicks):
1. Click sidebar "Order Queue" (navigate to `/queue`)
2. Click card row to expand
3. Scroll to action buttons inside expanded panel
4. Click "Create Order"

**Target path** (2 clicks):
1. Navigate to `/queue` (sidebar or `g q` keyboard shortcut)
2. Click inline "Create Order" icon button on card row (no expand required)

**Target keyboard path** (4 keystrokes):
1. `g q` (navigate to queue)
2. `j`/`k` (move focus to card)
3. `Shift+Enter` (create order for focused card)

### 2.2 Queue Triage (Bulk Order)

**Persona**: Procurement Manager, Operations Manager
**Entry point**: `/queue`
**Frequency**: 2-5x per day

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Click count (5 cards) | 1 + 5*5 = 26 | 1 + 5 + 2 = 8 | -18 |
| Interactions | 26 | 8 | -18 |
| Time budget | ~60s | < 15s | -45s |
| Keyboard-only | No | Yes | Missing |

**Current path** (1 + 5N clicks, N = cards):
1. Navigate to `/queue`
2. Per card: expand card (1), scroll (1), click "Create Order" (1), wait for toast (1), close expanded card (1)
3. No batch creation -- each order created individually

**Target path** (1 + N + 2 clicks):
1. Navigate to `/queue`
2. Check N card checkboxes (N clicks)
3. Click "Create Orders" bulk action bar button (1 click)
4. Confirm in bulk order confirmation modal (1 click)

**Target keyboard path**:
1. `g q` (navigate to queue)
2. `j`/`k` + `x` to move and select N cards
3. `Shift+Enter` (trigger bulk create)
4. `Enter` (confirm modal)

### 2.3 Scan Trigger

**Persona**: Warehouse/Receiving Personnel, Inventory Manager
**Entry point**: Header "Scan" button or `/scan`
**Frequency**: 20-50x per day

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Click count | 2 | 1 | -1 |
| Interactions | 2 | 1 | -1 |
| Time budget | ~3s | < 2s | -1s |
| Keyboard-only | No | Yes | Missing |

**Current path** (2 interactions):
1. Click header "Scan" button (navigates to `/scan`)
2. Scan QR code (camera interaction)

**Target path** (1 interaction):
1. Open command palette (`Cmd+K`), type "scan", select "Scan Card" (opens scanner directly)
   OR: Click header "Scan" button (unchanged)
2. Scan QR code (camera interaction)

The scan workflow is already well-optimized via the `/scan/:cardId` deep-link pattern. The primary improvement is adding a keyboard-accessible path via the command palette.

### 2.4 Part Lookup

**Persona**: All roles with catalog access
**Entry point**: Any page
**Frequency**: 10-20x per day

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Click count | 2 | 1 | -1 |
| Interactions | 2+ | 1 | -1+ |
| Time budget | ~8s | < 3s | -5s |
| Keyboard-only | No | Yes | Missing |

**Current path** (2+ interactions):
1. Click sidebar "Items" (navigate to `/parts`)
2. Type in search box, scan results

**Target path** (1 interaction):
1. `Cmd+K` or `/`, type part name or number, select from entity search results (navigates to part detail)

Entity search in the command palette eliminates the need to navigate to the parts page first. Parts are already loaded client-side via `useWorkspaceData`, so search can be instant.

### 2.5 Aging Card Review

**Persona**: Operations Manager, Inventory Manager
**Entry point**: `/` (Dashboard) or `/queue`
**Frequency**: 2-5x per day

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Click count | 1 + visual scan | 0 + inline action | -1 |
| Interactions | 2 | 1 | -1 |
| Time budget | ~5s | < 2s | -3s |
| Keyboard-only | No | Yes | Missing |

**Current path** (1 click + visual scan):
1. Navigate to `/queue` (or view NextActionBanner on queue page)
2. Visually scan for cards with orange/red aging badges

**Target path** (0 clicks):
1. NextActionBanner on Dashboard and Queue pages shows count of aging cards with inline "Review N aging cards" link
2. Link navigates directly to queue page pre-filtered to aging cards

The `NextActionBanner` component currently renders on the queue page but does not link to specific filtered views or individual cards.

---

## 3. Secondary Workflows

### 3.1 Loop Parameter Adjustment

**Persona**: Inventory Manager, Operations Manager
**Entry point**: `/loops` or `/loops/:loopId`
**Frequency**: 1-3x per week

| Metric | Current | Target |
|--------|---------|--------|
| Click count | 4 | 3 |
| Time budget | ~20s | < 15s |

**Path**: Navigate to loops > select loop > click edit > modify parameters > save.
No significant IA changes needed; primary improvement is command palette search for loops by name.

### 3.2 Card Stage History

**Persona**: Operations Manager, Inventory Manager
**Entry point**: Card detail page
**Frequency**: 2-5x per week

| Metric | Current | Target |
|--------|---------|--------|
| Click count | 3 | 2 |
| Time budget | ~10s | < 6s |

**Path**: Navigate to cards > select card > view transition history.
Improvement: command palette search for cards by card number.

### 3.3 Notification Triage

**Persona**: All roles
**Entry point**: Header bell icon
**Frequency**: 3-10x per day

| Metric | Current | Target |
|--------|---------|--------|
| Click count | 2 | 2 |
| Time budget | ~5s | < 5s |

**Path**: Click bell icon > review notifications. No changes needed for MVP Phase 1.

---

## 4. Workflow-to-Route Mapping

| Workflow | Primary Route | Supporting Routes | Entry Method |
|----------|--------------|-------------------|--------------|
| Queue Triage (Single) | `/queue` | -- | Sidebar, `g q` |
| Queue Triage (Bulk) | `/queue` | -- | Sidebar, `g q` |
| Scan Trigger | `/scan`, `/scan/:cardId` | -- | Header button, `g s`, `Cmd+K` |
| Part Lookup | `/parts` | -- | `Cmd+K` entity search |
| Aging Card Review | `/queue` | `/` (dashboard) | NextActionBanner link |
| Loop Parameter Adjust | `/loops/:loopId` | `/loops` | Sidebar, `g l`, `Cmd+K` |
| Card Stage History | `/cards` | -- | Sidebar, `g c`, `Cmd+K` |
| Notification Triage | -- | -- | Header bell icon |

---

## 5. Click Budget Summary

| # | Workflow | Current Clicks | Target Clicks | Reduction | Priority |
|---|----------|---------------|--------------|-----------|----------|
| 1 | Queue Triage (Single) | 4 | 2 | -50% | P0 |
| 2 | Queue Triage (Bulk, 5 cards) | 26 | 8 | -69% | P0 |
| 3 | Scan Trigger | 2 | 1 | -50% | P1 |
| 4 | Part Lookup | 2+ | 1 | -50%+ | P0 |
| 5 | Aging Card Review | 2 | 1 | -50% | P1 |
| 6 | Loop Parameter Adjust | 4 | 3 | -25% | P2 |
| 7 | Card Stage History | 3 | 2 | -33% | P2 |
| 8 | Notification Triage | 2 | 2 | 0% | -- |

**Overall target**: Every primary workflow reachable and completable via keyboard-only path. No primary workflow exceeds 3 clicks from its entry page.
