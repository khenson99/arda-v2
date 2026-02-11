# PRD: [GAP-03/T1] TO Detail View, Create/Edit Form & Ship/Receive Modals

> **Issue**: #110
> **Epic**: [GAP-03] Transfer Order Detail & CRUD UI (#109)
> **Phase**: phase-3-personas
> **Priority**: P0
> **Labels**: frontend, task, agent-ready
> **Depends on**: MVP-10 (Multi-Location Inventory & Transfer lifecycle — implemented)
> **Status**: Draft

---

## 1. Problem Statement

The existing Transfer Orders page (`apps/web/src/pages/transfer-orders.tsx`) contains an inline queue/detail/new-transfer view built as a monolithic 794-line component. While functional, it lacks:

- A **dedicated `/orders/to/:id` route** that supports deep-linking, browser back/forward, and sharing.
- A **proper create/edit form** with field validation, supplier-facility lookups, and inline line-item editing.
- A **ship modal** that lets warehouse staff mark lines as shipped with quantity entry and confirmation.
- A **receive modal** that lets receiving staff confirm receipt, flag quantity discrepancies, and trigger exception workflows.

Users currently must navigate through the combined transfer-orders page to perform any operation, making it hard to bookmark, share, or track specific TOs.

---

## 2. Objective

Deliver a routed TO detail page plus standalone create/edit form and ship/receive modals so that transfer order lifecycle management matches the same UX patterns already established for Purchase Orders (po-detail.tsx) and Work Orders (wo-detail.tsx).

---

## 3. User Personas & Stories

### Inventory Manager
- **US-01**: As an Inventory Manager, I want a dedicated TO detail page at `/orders/to/:id` so I can bookmark, share, and navigate directly to any transfer order.
- **US-02**: As an Inventory Manager, I want to create a new TO with source/destination facility selects, part search, and line-item quantities so I can initiate transfers without navigating through the queue.

### Warehouse / Shipping Manager
- **US-03**: As a Shipping Manager, I want a ship modal where I enter shipped quantities per line and confirm the shipment so the TO transitions to "shipped" and inventory is updated.

### Receiving Manager
- **US-04**: As a Receiving Manager, I want a receive modal where I confirm received quantities per line and flag exceptions (short shipment, damaged) so the TO completes accurately.

### Procurement Manager
- **US-05**: As a Procurement Manager, I want to edit a TO's notes, requested date, and line items while it's in draft/requested status so I can correct mistakes before approval.

---

## 4. Functional Requirements

### TO Detail Page

| ID | Requirement |
|----|-------------|
| **FR-01** | Route `/orders/to/:id` renders a dedicated TO detail page. |
| **FR-02** | Header card shows: TO number, status badge, source facility, destination facility, requested date, shipped date, received date, created by user, notes. |
| **FR-03** | Line items table shows: part number, part name, qty requested, qty shipped, qty received, line status indicator. |
| **FR-04** | Status timeline shows each transition with timestamp, user name, and elapsed time between steps. Data sourced from the audit log or `GET /transfer-orders/:id` response. |
| **FR-05** | Action buttons respect lifecycle: "Submit for Approval", "Approve", "Ship", "Receive", "Close", "Cancel" — only valid transitions shown per `GET /transfer-orders/:id/transitions`. |
| **FR-06** | "Edit" button shown for draft/requested TOs, opens the edit form. |
| **FR-07** | Back navigation returns to the transfer orders queue list. |

### TO Create/Edit Form

| ID | Requirement |
|----|-------------|
| **FR-08** | Accessible via `/orders/to/new` (create) or edit button on detail page. |
| **FR-09** | Source facility: searchable dropdown populated from `GET /api/catalog/facilities`. |
| **FR-10** | Destination facility: searchable dropdown, excludes the selected source facility. |
| **FR-11** | Requested date: date picker, defaults to today. |
| **FR-12** | Notes: textarea, optional. |
| **FR-13** | Line items: table with columns — Part (searchable part select), Qty Requested (number input), Notes (text). Rows can be added/removed. |
| **FR-14** | Part select uses existing parts search API (`GET /api/catalog/parts`). |
| **FR-15** | Source recommendation panel: after selecting destination facility and a part, show recommended source using `GET /transfer-orders/recommendations/source`. |
| **FR-16** | Validation: at least one line item required, qty > 0, source ≠ destination. |
| **FR-17** | Submit calls `POST /api/transfer-orders` (create) or `PATCH` for edits. Redirects to detail page on success. |

### Ship Modal

| ID | Requirement |
|----|-------------|
| **FR-18** | Opens from "Ship" action button on TO detail page. |
| **FR-19** | Shows a table of TO lines with part name, qty requested, qty already shipped, and an editable "Qty to Ship" input for each line. |
| **FR-20** | "Qty to Ship" defaults to `qtyRequested - qtyShipped` (remaining). Cannot exceed remaining. |
| **FR-21** | Confirmation step: summary of what will be shipped before submission. |
| **FR-22** | Calls `PATCH /transfer-orders/:id/ship` with line-level quantities. |
| **FR-23** | On success, refreshes the detail page showing updated shipped quantities and status. |

### Receive Modal

| ID | Requirement |
|----|-------------|
| **FR-24** | Opens from "Receive" action button on TO detail page. |
| **FR-25** | Shows a table of shipped lines with part name, qty shipped, qty already received, and editable "Qty to Receive" input. |
| **FR-26** | "Qty to Receive" defaults to `qtyShipped - qtyReceived` (remaining). Cannot exceed remaining. |
| **FR-27** | Exception flagging: checkbox per line to flag discrepancy, with a notes field for exception details. |
| **FR-28** | Calls `PATCH /transfer-orders/:id/receive` with line-level quantities. |
| **FR-29** | On success, refreshes detail page showing received quantities and updated status. |

---

## 5. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| **NFR-01** | TO detail page initial render | < 500ms |
| **NFR-02** | Ship/Receive modal submission | < 1s including optimistic UI update |
| **NFR-03** | Form validation feedback | Immediate (client-side) |
| **NFR-04** | Part search autocomplete | < 300ms debounced |

---

## 6. API Surface (Existing — No Backend Changes)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/transfer-orders/:id` | TO detail with lines |
| `POST` | `/api/transfer-orders` | Create TO with lines |
| `GET` | `/api/transfer-orders/:id/transitions` | Valid next statuses |
| `PATCH` | `/api/transfer-orders/:id/status` | Status transition |
| `PATCH` | `/api/transfer-orders/:id/ship` | Ship lines |
| `PATCH` | `/api/transfer-orders/:id/receive` | Receive lines |
| `GET` | `/api/transfer-orders/recommendations/source` | Source recommendations |
| `GET` | `/api/catalog/facilities` | Facility list |
| `GET` | `/api/catalog/parts` | Part search |

---

## 7. UI/UX Requirements

All views follow the Arda design system (CLAUDE.md). Font: Open Sans. Primary: `#fc5a29`. Link blue: `#0a68f3`. Cards: `rounded-xl shadow-sm`. Tables: `bg-muted` header, `hover:bg-muted/50` rows.

### 7.1 TO Detail Page Layout

- **Breadcrumb**: Orders > Transfer Orders > TO-{number}
- **Header card**: `rounded-xl shadow-sm` with status badge (use `<Badge variant="...">` matching TO status), TO number as title, key dates and facilities as name-value pairs.
- **Status timeline**: Vertical timeline with dot indicators, timestamps, and user names. Similar to PO timeline (`apps/web/src/components/orders/po-timeline.tsx`).
- **Line items table**: Standard table with `bg-muted` header. Quantity columns show progress (shipped/requested) with subtle progress indicator.
- **Action buttons**: Right-aligned in header. Primary action = arda orange. Secondary = outline.

### 7.2 Form Layout

- Two-column layout for facility selects (source left, destination right).
- Line items in a table below with "Add Line" button.
- Source recommendation appears as a blue info card when applicable.

### 7.3 Ship/Receive Modals

- Use `<Dialog>` (shadcn) component.
- Line items table inside modal with editable number inputs.
- Confirmation step as a summary card before final submit.
- Loading state with spinner during API call.

---

## 8. Deliverables

| File | Purpose |
|------|---------|
| `apps/web/src/pages/orders/to-detail.tsx` | TO detail page component |
| `apps/web/src/components/orders/to-form.tsx` | TO create/edit form |
| `apps/web/src/components/orders/to-ship-modal.tsx` | Ship modal with line-level qty entry |
| `apps/web/src/components/orders/to-receive-modal.tsx` | Receive modal with exception flagging |
| `apps/web/src/components/orders/to-timeline.tsx` | Status timeline component |
| Route registration in App.tsx | `/orders/to/:id` and `/orders/to/new` routes |

---

## 9. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-01** | Navigating to `/orders/to/:id` renders the TO detail page with correct header, lines, and timeline. |
| **AC-02** | The TO create form at `/orders/to/new` allows creating a TO with facilities, lines, and notes. Redirects to detail on success. |
| **AC-03** | Source recommendation panel shows ranked facilities after selecting destination and part. |
| **AC-04** | Ship modal allows entering shipped quantities per line, validates max qty, and calls the ship endpoint. |
| **AC-05** | Receive modal allows entering received quantities per line with exception flagging and calls the receive endpoint. |
| **AC-06** | Action buttons only show valid transitions returned by the transitions endpoint. |
| **AC-07** | Edit button appears only for draft/requested TOs and opens the edit form pre-filled. |
| **AC-08** | Status badges use the correct variant colors (draft=default, shipped=accent, received=success, cancelled=destructive). |
| **AC-09** | All forms validate required fields and show inline error messages. |
| **AC-10** | Page follows Arda design system: Open Sans font, correct colors, rounded-xl cards, shadow-sm. |

---

## 10. Dependencies

| Dependency | Status |
|------------|--------|
| Transfer order backend routes | Implemented (`services/orders/src/routes/transfer-orders.routes.ts`) |
| Transfer lifecycle service | Implemented (`services/orders/src/services/transfer-lifecycle.service.ts`) |
| Source recommendation service | Implemented |
| Facilities API | Implemented (`services/catalog/src/routes/facilities.routes.ts`) |
| Parts search API | Implemented (`services/catalog/src/routes/parts.routes.ts`) |
| Existing PO detail pattern | Implemented (`apps/web/src/pages/orders/po-detail.tsx`) — use as reference |
| Existing WO detail pattern | Implemented (`apps/web/src/pages/orders/wo-detail.tsx`) — use as reference |

---

## 11. Out of Scope

- Backend changes to transfer order routes (all endpoints exist).
- Barcode/QR scanning for ship/receive.
- Batch ship/receive across multiple TOs.
- Transfer cost tracking.
- Print/export functionality for TOs.

---

## 12. Technical Notes

### Patterns to Follow

- Reference `apps/web/src/pages/orders/po-detail.tsx` for page structure, hook patterns, and layout.
- Reference `apps/web/src/components/orders/po-form.tsx` for form patterns with line-item tables.
- Reference `apps/web/src/components/orders/po-approval-modal.tsx` for modal patterns.
- Reference `apps/web/src/components/orders/po-timeline.tsx` for timeline component.
- Use the existing `use-transfer-orders.ts` hook for API calls, or extend it.
- Use `react-router-dom` for routing (already configured in the app).
- Use shadcn/ui `Dialog`, `Form`, `Input`, `Select`, `Button`, `Badge`, `Table` components.
