# PRD: [GAP-09] Roles & Permissions UI, QR v2 & Quick Receive

> **Issues**: #123 (Roles & Permissions Management UI), #124 (QR Payload v2 & Mobile Quick Receive)
> **Epic**: [GAP-09] (#122)
> **Phase**: phase-3-personas
> **Priority**: P1
> **Labels**: frontend, backend, task, agent-ready
> **Depends on**: Auth service (role management), existing QR scan infrastructure
> **Status**: Draft

---

## 1. Problem Statement

Role-based access control exists in the backend (7 roles: tenant_admin, inventory_manager, procurement_manager, receiving_manager, ecommerce_director, salesperson, executive) but there is no UI for managing user roles, viewing permission matrices, or inviting users with specific roles. Additionally, the QR scanning system needs a v2 payload format and a mobile-optimized quick receive flow for warehouse staff.

---

## 2. Objective

Build a Roles & Permissions management UI for tenant admins and a QR v2 + Quick Receive mobile flow for warehouse operations.

---

## 3. Functional Requirements

### T1: Roles & Permissions Management UI (#123)

| ID | Requirement |
|----|-------------|
| **FR-01** | Route `/settings/roles` shows user management table (tenant_admin only). |
| **FR-02** | User table: name, email, role, status (active/deactivated), last login. |
| **FR-03** | "Invite User" button opens invite dialog with email, first name, last name, role select. Calls `POST /api/auth/users/invite`. |
| **FR-04** | Role change: dropdown per user row, calls `PUT /api/auth/users/:id/role`. Confirmation required. |
| **FR-05** | Deactivate user with confirmation calls `PUT /api/auth/users/:id/deactivate`. |
| **FR-06** | Permission matrix view: table showing roles vs feature permissions (read-only reference). |

### T2: QR Payload v2 & Mobile Quick Receive (#124)

| ID | Requirement |
|----|-------------|
| **FR-07** | QR v2 payload format includes: type (part, po, wo, to), entityId, facilityId, action hint (view, receive, pick). |
| **FR-08** | Quick Receive screen: mobile-optimized form that pre-fills from QR scan data. |
| **FR-09** | Supports receiving against PO lines, TO lines, or standalone inventory adjustment. |
| **FR-10** | Quantity entry with +/- buttons optimized for touch. |
| **FR-11** | Submit triggers appropriate receive/adjust endpoint. |

---

## 4. Deliverables

| File | Purpose |
|------|---------|
| `apps/web/src/pages/settings/roles.tsx` | Roles & user management page |
| `apps/web/src/components/settings/invite-user-dialog.tsx` | User invite dialog |
| `apps/web/src/components/settings/permission-matrix.tsx` | Permission matrix view |
| `apps/web/src/components/scan/quick-receive.tsx` | Mobile quick receive flow |
| `apps/web/src/lib/qr-payload-v2.ts` | QR payload encoder/decoder |

---

## 5. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-01** | Roles page shows user list with correct roles (tenant_admin only access). |
| **AC-02** | Invite user creates new user with selected role. |
| **AC-03** | Role change updates user role with confirmation. |
| **AC-04** | Deactivate user marks them inactive. |
| **AC-05** | QR v2 payload encodes/decodes correctly. |
| **AC-06** | Quick receive pre-fills from QR scan and submits to correct endpoint. |
| **AC-07** | Design follows Arda design system. |
