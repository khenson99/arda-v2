# PRD: [GAP-08] Advanced Kanban: Loop Wizard, Parameters & ReLoWiSa Dashboard

> **Issues**: #120 (Loop Creation Wizard), #121 (Loop Parameters Editor & ReLoWiSa Dashboard)
> **Epic**: [GAP-08] (#119)
> **Phase**: phase-3-personas
> **Priority**: P1
> **Labels**: frontend, task, agent-ready
> **Depends on**: Kanban service (loops, cards, parameters), ReLoWiSa inference engine
> **Status**: Draft

---

## 1. Problem Statement

Kanban loops are the core automation engine in Arda — they define replenishment rules for parts at specific facilities. Currently, creating and configuring loops requires knowledge of internal parameters. Users need a guided wizard for loop creation, a parameters editor for tuning loop behavior, and a ReLoWiSa (Reorder Level / Window / Safety stock) dashboard for monitoring calculated values.

---

## 2. Objective

Build a Loop Creation Wizard (step-by-step guided flow), a Loop Parameters Editor (for tuning calculation weights and thresholds), and a ReLoWiSa Dashboard (showing calculated reorder levels, windows, and safety stock per loop).

---

## 3. Functional Requirements

### T1: Loop Creation Wizard (#120)

| ID | Requirement |
|----|-------------|
| **FR-01** | Multi-step wizard accessible from "New Loop" button on the Kanban board or loops list. |
| **FR-02** | Step 1 — Loop Type: Select loop type (purchase, transfer, production). Each type shows a brief description. |
| **FR-03** | Step 2 — Part & Facility: Select the part (searchable) and destination facility. For transfer type, also select source facility. |
| **FR-04** | Step 3 — Parameters: Set min quantity (reorder point), order quantity, max quantity, and lead time override. Show recommended values from ReLoWiSa if available. |
| **FR-05** | Step 4 — Review: Summary of all selections before creation. |
| **FR-06** | Submit creates the loop via the kanban loops API. Redirects to the loop detail or board view. |
| **FR-07** | Stepper UI with back/next navigation, step validation before advancing. |

### T2: Loop Parameters Editor (#121)

| ID | Requirement |
|----|-------------|
| **FR-08** | Accessible from loop detail view. |
| **FR-09** | Editable fields: minQuantity, orderQuantity, maxQuantity, leadTimeDays, safetyStockDays. |
| **FR-10** | Show current ReLoWiSa recommendations alongside user-set values for comparison. |
| **FR-11** | Save updates the loop via PATCH. |

### T2: ReLoWiSa Dashboard (#121)

| ID | Requirement |
|----|-------------|
| **FR-12** | Dashboard view showing all active loops with their calculated ReLoWiSa values. |
| **FR-13** | Table: part, facility, loop type, current reorder level, recommended reorder level, window size, safety stock, last calculated timestamp. |
| **FR-14** | Highlight rows where user-set values differ significantly from recommendations. |
| **FR-15** | "Apply Recommendation" action per loop to auto-update parameters to recommended values. |

---

## 4. Deliverables

| File | Purpose |
|------|---------|
| `apps/web/src/components/kanban/loop-wizard.tsx` | Multi-step loop creation wizard |
| `apps/web/src/components/kanban/loop-parameters-editor.tsx` | Loop parameters editor |
| `apps/web/src/pages/relowisa-dashboard.tsx` | ReLoWiSa dashboard page |

---

## 5. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-01** | Loop wizard guides user through 4 steps and creates a loop on submit. |
| **AC-02** | Wizard validates each step before allowing next. |
| **AC-03** | Parameters editor shows current vs recommended values. |
| **AC-04** | ReLoWiSa dashboard lists all loops with calculated values. |
| **AC-05** | "Apply Recommendation" updates loop parameters. |
| **AC-06** | Design follows Arda design system. |
