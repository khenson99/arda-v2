# PRD: [GAP-07/T1] BOM List, Detail & Tree Editor

> **Issue**: #118
> **Epic**: [GAP-07] BOM Management UI (#117)
> **Phase**: phase-3-personas
> **Priority**: P1
> **Labels**: frontend, task, agent-ready
> **Depends on**: BOM backend routes (implemented in catalog service)
> **Status**: Draft

---

## 1. Problem Statement

Bill of Materials (BOM) defines the component hierarchy for manufactured parts — which child parts and how many are needed to produce one unit of a parent part. The backend supports BOM CRUD (`services/catalog/src/routes/bom.routes.ts`) but there is no UI for viewing or editing BOMs. Production planners and engineers must manage BOMs outside the system.

---

## 2. Objective

Build a BOM management UI with a list of parts that have BOMs, a detail/tree view showing the hierarchical structure, and an editor for adding/removing components.

---

## 3. Functional Requirements

### BOM List

| ID | Requirement |
|----|-------------|
| **FR-01** | Route `/bom` or section within catalog shows parts that have BOMs (type = subassembly or finished_good). |
| **FR-02** | Table: part number, part name, type, component count. |
| **FR-03** | Search by part name/number. Filter by part type. |
| **FR-04** | Click row opens BOM detail for that part. |

### BOM Detail / Tree View

| ID | Requirement |
|----|-------------|
| **FR-05** | Route `/bom/:partId` shows the BOM tree for a parent part. |
| **FR-06** | Tree structure: parent at root, children indented below. Each node shows part number, name, qty per unit, and type badge. |
| **FR-07** | Expandable nodes for multi-level BOMs (subassembly children that themselves have BOMs). |
| **FR-08** | Summary panel: total unique components, total component cost (sum of childPart.unitCost * quantityPer). |

### BOM Editor

| ID | Requirement |
|----|-------------|
| **FR-09** | "Add Component" button opens a dialog: part search select, quantity per unit (number), sort order, notes. |
| **FR-10** | Add calls `POST /api/catalog/bom/:parentPartId` with childPartId, quantityPer, sortOrder, notes. |
| **FR-11** | Remove component with confirmation calls `DELETE /api/catalog/bom/:parentPartId/:bomItemId`. |
| **FR-12** | Prevent circular references: cannot add a parent as its own child (or ancestor). |
| **FR-13** | Inline edit for quantityPer and notes on existing BOM items. |

---

## 4. API Surface (Existing)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/catalog/bom/:parentPartId` | Get BOM with items |
| `POST` | `/api/catalog/bom/:parentPartId` | Add component |
| `DELETE` | `/api/catalog/bom/:parentPartId/:bomItemId` | Remove component |
| `GET` | `/api/catalog/parts` | Part search for component lookup |

---

## 5. Deliverables

| File | Purpose |
|------|---------|
| `apps/web/src/pages/bom.tsx` | BOM list page |
| `apps/web/src/pages/bom/[partId].tsx` | BOM detail/tree page |
| `apps/web/src/components/bom/bom-tree.tsx` | Recursive tree view component |
| `apps/web/src/components/bom/bom-add-component.tsx` | Add component dialog |
| Route registration | `/bom` and `/bom/:partId` |

---

## 6. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-01** | BOM list shows parts with BOMs, searchable and filterable. |
| **AC-02** | BOM tree renders hierarchical structure with correct indentation. |
| **AC-03** | Multi-level BOMs (subassemblies with their own BOMs) expand recursively. |
| **AC-04** | Adding a component creates a BOM item and refreshes the tree. |
| **AC-05** | Removing a component deletes the BOM item with confirmation. |
| **AC-06** | Cost summary calculates correctly from component unit costs and quantities. |
| **AC-07** | Design follows Arda design system. |
