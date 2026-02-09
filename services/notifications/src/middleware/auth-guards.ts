import { Permission, requirePermission } from '@arda/auth-utils';

// ─── Notifications Service Authorization Guards ─────────────────────
// Each guard maps to a specific route action and enforces the RBAC matrix.
// Note: All notification operations are self-scoped (users access their own
// notifications only), so these guards are effectively universal.

export const guards = {
  // ─── Notifications ────────────────────────────────────────────────
  readNotifications: requirePermission(Permission.NOTIFICATIONS_READ),
  updateNotification: requirePermission(Permission.NOTIFICATIONS_UPDATE),
  deleteNotification: requirePermission(Permission.NOTIFICATIONS_DELETE),

  // ─── Preferences ──────────────────────────────────────────────────
  readPreferences: requirePermission(Permission.NOTIFICATIONS_PREFERENCES_READ),
  updatePreferences: requirePermission(Permission.NOTIFICATIONS_PREFERENCES_UPDATE),
} as const;
