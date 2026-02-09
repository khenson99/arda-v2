import { Permission, requirePermission } from '@arda/auth-utils';

// ─── Kanban Service Authorization Guards ────────────────────────────
// Each guard maps to a specific route action and enforces the RBAC matrix.
// Usage: router.post('/', authMiddleware, guards.createLoop, handler);

export const guards = {
  // ─── Loops ──────────────────────────────────────────────────────────
  readLoops: requirePermission(Permission.KANBAN_LOOPS_READ),
  createLoop: requirePermission(Permission.KANBAN_LOOPS_CREATE),
  updateLoop: requirePermission(Permission.KANBAN_LOOPS_UPDATE),
  updateLoopParameters: requirePermission(Permission.KANBAN_LOOPS_UPDATE_PARAMETERS),

  // ─── Cards ──────────────────────────────────────────────────────────
  readCards: requirePermission(Permission.KANBAN_CARDS_READ),
  transitionCard: requirePermission(Permission.KANBAN_CARDS_TRANSITION),
  linkCardOrder: requirePermission(Permission.KANBAN_CARDS_LINK_ORDER),

  // ─── Scan ───────────────────────────────────────────────────────────
  readScan: requirePermission(Permission.KANBAN_SCAN_READ),
  triggerScan: requirePermission(Permission.KANBAN_SCAN_TRIGGER),

  // ─── Velocity ───────────────────────────────────────────────────────
  readVelocity: requirePermission(Permission.KANBAN_VELOCITY_READ),
} as const;
