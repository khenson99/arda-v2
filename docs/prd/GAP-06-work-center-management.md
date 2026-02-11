# PRD: [GAP-06/T1] Work Center List, Detail & Capacity Editor

> **Issue**: #116
> **Epic**: [GAP-06] Work Center Management UI (#115)
> **Phase**: phase-3-personas
> **Priority**: P1
> **Labels**: frontend, task, agent-ready
> **Depends on**: Work center backend routes (implemented)
> **Status**: Draft

---

## 1. Problem Statement

Work centers are core to manufacturing scheduling — they represent machines, stations, or lines where production operations happen. The backend supports full CRUD for work centers (`services/orders/src/routes/work-centers.routes.ts`) with capacity and cost tracking, but there is no frontend UI. Plant managers cannot view, create, or configure work centers without direct API access.

---

## 2. Objective

Build a work center management UI with list view, detail page, and capacity editor so plant managers can configure their production floor layout and capacity within the Arda web app.

---

## 3. Functional Requirements

### Work Center List

| ID | Requirement |
|----|-------------|
| **FR-01** | Route `/work-centers` renders a list of all work centers. |
| **FR-02** | Table columns: name, code, facility, capacity/hr, cost/hr, active status. |
| **FR-03** | Filter by facility dropdown. Search by name/code. |
| **FR-04** | "New Work Center" button opens create form. |
| **FR-05** | Click row navigates to detail page. |

### Work Center Detail

| ID | Requirement |
|----|-------------|
| **FR-06** | Route `/work-centers/:id` shows work center detail. |
| **FR-07** | Header card: name, code, facility, description, capacity/hr, cost/hr, active status. |
| **FR-08** | Edit button opens inline edit or form modal. |
| **FR-09** | Deactivate/reactivate toggle with confirmation. |

### Create/Edit Form

| ID | Requirement |
|----|-------------|
| **FR-10** | Fields: facility (select), name, code, description, capacity per hour (number), cost per hour (number). |
| **FR-11** | Create calls `POST /api/orders/work-centers`. Edit calls `PATCH /api/orders/work-centers/:id`. |
| **FR-12** | Code is unique per tenant — show validation error if duplicate. |

### Capacity Editor (Stretch)

| ID | Requirement |
|----|-------------|
| **FR-13** | Capacity windows section on detail page shows allocated capacity blocks. |
| **FR-14** | Visual weekly calendar showing capacity allocation per day/shift. |

---

## 4. API Surface (Existing)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/orders/work-centers` | List (pagination, facilityId filter) |
| `GET` | `/api/orders/work-centers/:id` | Detail |
| `POST` | `/api/orders/work-centers` | Create |
| `PATCH` | `/api/orders/work-centers/:id` | Update |
| `DELETE` | `/api/orders/work-centers/:id` | Soft delete (deactivate) |

---

## 5. Deliverables

| File | Purpose |
|------|---------|
| `apps/web/src/pages/work-centers.tsx` | Work center list page |
| `apps/web/src/pages/work-centers/[id].tsx` | Work center detail page |
| `apps/web/src/components/work-centers/work-center-form.tsx` | Create/edit form |
| Route registration | `/work-centers` and `/work-centers/:id` |

---

## 6. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-01** | Work center list displays all work centers with correct columns. |
| **AC-02** | Facility filter works correctly. |
| **AC-03** | Create form creates a new work center and redirects to detail. |
| **AC-04** | Edit updates work center fields via PATCH. |
| **AC-05** | Deactivate toggles the work center's active status. |
| **AC-06** | Design follows Arda design system. |
