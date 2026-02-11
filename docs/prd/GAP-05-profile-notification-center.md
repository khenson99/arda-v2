# PRD: [GAP-05/T1] Profile Page & Notification Center UI

> **Issue**: #114
> **Epic**: [GAP-05] User Profile & Notification Center (#113)
> **Phase**: phase-3-personas
> **Priority**: P0
> **Labels**: frontend, task, agent-ready
> **Depends on**: Auth service (users routes), Notifications service (notification routes), File upload (api-gateway)
> **Status**: Draft

---

## 1. Problem Statement

Arda V2 currently has a minimal notifications page (`apps/web/src/pages/notifications.tsx`, 106 lines) that shows a basic feed but lacks filtering, pagination, and preference management. There is no user profile page — users cannot change their password, upload an avatar, or manage their notification preferences. The notification system backend is fully built (notifications service with CRUD + preferences endpoints), but the frontend underserves it.

---

## 2. Objective

Build a full-featured profile page (password change, avatar upload, user info display) and upgrade the notification center with pagination, type filtering, read/unread management, and a preferences panel — all powered by existing backend endpoints.

---

## 3. User Personas & Stories

### All Users
- **US-01**: As a user, I want a profile page where I can see my account details (name, email, role) so I know what identity I'm operating under.
- **US-02**: As a user, I want to change my password from the profile page so I can maintain account security.
- **US-03**: As a user, I want to upload a profile avatar so my teammates can identify me in the app.

### Inventory / Procurement Manager
- **US-04**: As a manager, I want to filter notifications by type (e.g., PO created, stockout warning, transfer status) so I can focus on what matters to me.
- **US-05**: As a manager, I want to toggle which notification types I receive and through which channels (in-app, email) so I'm not overwhelmed.

### All Users
- **US-06**: As a user, I want to see an unread notification count badge in the app header so I know when new notifications arrive.
- **US-07**: As a user, I want to mark individual or all notifications as read so I can manage my notification inbox.
- **US-08**: As a user, I want paginated notifications so performance stays fast even with hundreds of notifications.

---

## 4. Functional Requirements

### Profile Page

| ID | Requirement |
|----|-------------|
| **FR-01** | Route `/profile` renders the user profile page. |
| **FR-02** | Display user info: first name, last name, email, role, tenant name. Data from JWT/auth context. |
| **FR-03** | Avatar section: shows current avatar (or initials fallback). Upload button triggers file picker. |
| **FR-04** | Avatar upload calls `POST /api/files/upload` with the image, then stores the returned key in user context. |
| **FR-05** | Password change form: current password, new password, confirm new password. Client-side validation (min 8 chars, match confirmation). |
| **FR-06** | Password change calls the auth service password change endpoint. Shows success/error toast. |
| **FR-07** | Notification preferences section (can also be a sub-tab): lists all notification types with toggles for in-app and email channels. |
| **FR-08** | Preferences load from notification preferences API and save on toggle change with debounced API calls. |

### Notification Center

| ID | Requirement |
|----|-------------|
| **FR-09** | Route `/notifications` renders the full notification center (replace existing minimal page). |
| **FR-10** | Notification list with pagination: loads 20 items per page, "Load More" button or infinite scroll. |
| **FR-11** | Filter bar: notification type dropdown (card_triggered, po_created, po_sent, po_received, stockout_warning, relowisa_recommendation, exception_alert, wo_status_change, transfer_status_change, system_alert), unread-only toggle. |
| **FR-12** | Each notification item shows: type icon/badge, title, body preview, relative timestamp, unread indicator (blue dot). |
| **FR-13** | Click notification to mark as read and navigate to `actionUrl` if present. |
| **FR-14** | "Mark All Read" button calls `POST /notifications/mark-all-read`. |
| **FR-15** | Individual "Mark as Read" button per notification calls `PATCH /notifications/:id/read`. |
| **FR-16** | Delete notification with confirmation calls `DELETE /notifications/:id`. |

### Header Notification Badge

| ID | Requirement |
|----|-------------|
| **FR-17** | App header shows a bell icon with unread count badge. |
| **FR-18** | Badge fetches unread count from `GET /notifications/unread-count` on mount and periodically (every 30s). |
| **FR-19** | Clicking the bell navigates to `/notifications`. |
| **FR-20** | Badge uses arda-orange background for counts > 0, hidden when count is 0. |

---

## 5. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| **NFR-01** | Notification list initial render | < 500ms for 20 items |
| **NFR-02** | Unread count polling | Every 30s, < 100ms response |
| **NFR-03** | Avatar upload | < 5MB file size limit, JPEG/PNG/WebP |
| **NFR-04** | Password change feedback | < 1s including API roundtrip |

---

## 6. API Surface (Existing — No Backend Changes)

### Notifications Service

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/notifications` | List notifications (params: unreadOnly, type, limit, offset) |
| `GET` | `/api/notifications/unread-count` | Get unread count |
| `PATCH` | `/api/notifications/:id/read` | Mark as read |
| `POST` | `/api/notifications/mark-all-read` | Mark all as read |
| `DELETE` | `/api/notifications/:id` | Delete notification |
| `GET` | `/api/notifications/preferences` | Get user notification preferences |
| `PUT` | `/api/notifications/preferences` | Update preferences |

### Auth Service

| Method | Path | Purpose |
|--------|------|---------|
| `PUT` | `/api/auth/password` | Change password (currentPassword, newPassword) |

### File Upload (API Gateway)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/files/upload` | Upload file (multipart) |
| `GET` | `/api/files/:key/url` | Get signed download URL |

---

## 7. UI/UX Requirements

All views follow the Arda design system (CLAUDE.md). Font: Open Sans. Primary: `#fc5a29`. Link blue: `#0a68f3`. Cards: `rounded-xl shadow-sm`.

### 7.1 Profile Page

- **Layout**: Single column, max-width container centered.
- **Avatar section**: Circular avatar (80px), initials fallback with muted background. Upload button below.
- **User info card**: `rounded-xl shadow-sm` card showing name, email, role as name-value pairs.
- **Password change card**: Separate card with form fields and submit button. Primary button style.
- **Notification preferences card**: List of notification types, each with toggle switches for in-app and email.

### 7.2 Notification Center

- **Layout**: Full-width with filter bar at top, notification list below.
- **Filter bar**: Horizontal bar with type select dropdown and unread-only toggle switch. "Mark All Read" button right-aligned.
- **Notification item**: Card-style row with left color indicator per type, title bold, body muted, timestamp right-aligned. Unread items have a blue dot indicator and slightly bolder appearance.
- **Type color mapping**: Use badge variant colors — stockout_warning = warning (amber), exception_alert = destructive (red), po_created/po_sent = accent (blue), system_alert = default.
- **Empty state**: Friendly message "No notifications" when list is empty.
- **Pagination**: "Load More" button at bottom, shows remaining count.

### 7.3 Header Badge

- **Bell icon**: Use Lucide `Bell` icon in the app header nav.
- **Badge**: Small circular badge overlapping top-right of bell. Arda orange background, white text. Shows count (99+ for > 99).

---

## 8. Deliverables

| File | Purpose |
|------|---------|
| `apps/web/src/pages/profile.tsx` | User profile page |
| `apps/web/src/pages/notifications.tsx` | Upgraded notification center (replace existing) |
| `apps/web/src/components/notifications/notification-list.tsx` | Paginated notification list component |
| `apps/web/src/components/notifications/notification-preferences.tsx` | Notification preferences toggles |
| `apps/web/src/components/notifications/notification-badge.tsx` | Header bell icon with unread count badge |
| `apps/web/src/components/profile/avatar-upload.tsx` | Avatar upload component |
| `apps/web/src/components/profile/password-change-form.tsx` | Password change form |
| Route registration in App.tsx | `/profile` route |

---

## 9. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| **AC-01** | `/profile` page shows user name, email, and role from auth context. |
| **AC-02** | Password change form validates min length, matching confirmation, and calls the auth password endpoint. |
| **AC-03** | Avatar upload accepts image files, calls the file upload endpoint, and displays the uploaded avatar. |
| **AC-04** | Notification center at `/notifications` shows paginated notifications with Load More. |
| **AC-05** | Type filter dropdown filters notifications by the selected type. |
| **AC-06** | Unread-only toggle shows only unread notifications. |
| **AC-07** | Clicking a notification marks it as read and navigates to its actionUrl. |
| **AC-08** | "Mark All Read" button marks all notifications as read and updates the UI. |
| **AC-09** | Header bell icon shows unread count badge that updates every 30 seconds. |
| **AC-10** | Notification preferences show toggles per type per channel and persist changes. |
| **AC-11** | All pages follow Arda design system: Open Sans, correct colors, rounded-xl cards. |

---

## 10. Dependencies

| Dependency | Status |
|------------|--------|
| Notifications service CRUD routes | Implemented (`services/notifications/src/routes/notifications.routes.ts`) |
| Notification preferences routes | Implemented (`services/notifications/src/routes/preferences.routes.ts`) |
| Auth password change endpoint | Implemented (`services/auth/src/routes/users.routes.ts`) |
| File upload endpoint | Implemented (`services/api-gateway/src/routes/files.routes.ts`) |
| Existing notification page | Implemented (minimal — `apps/web/src/pages/notifications.tsx`) |

---

## 11. Out of Scope

- WebSocket real-time notification push (future enhancement).
- Email notification sending (backend handles this separately).
- Two-factor authentication setup.
- User management (invite, deactivate) — that's an admin page.
- Notification sound/desktop push.

---

## 12. Technical Notes

### Patterns to Follow

- Reference existing notification page structure at `apps/web/src/pages/notifications.tsx`.
- Use `apps/web/src/hooks/use-workspace-data.ts` for workspace context patterns.
- Avatar can use the existing file upload infrastructure — store key in localStorage or user context until a backend user-profile update endpoint is available.
- For notification type icons, use Lucide icons mapped to notification types.
- Use shadcn/ui `Switch` for preference toggles, `Select` for type filter, `Badge` for notification type labels.
- Polling for unread count: use `setInterval` with `useEffect` cleanup, or a custom hook.
