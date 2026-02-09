/**
 * Purchase Order Lifecycle State Machine
 *
 * Declarative transition definitions with role-based authorization and
 * auto-populated timestamp fields. Pure validation logic; persistence
 * is handled by the caller.
 *
 * State flow:
 *   draft -> pending_approval -> approved -> sent -> acknowledged
 *     -> partially_received -> received -> closed
 *
 * Any non-terminal state can transition to 'cancelled' (with reason).
 * Terminal states: closed, cancelled.
 */

import type { UserRole, POStatus } from '@arda/shared-types';

// ─── Transition Definition ───────────────────────────────────────────
export interface TransitionDefinition {
  from: POStatus;
  to: POStatus;
  /** Roles allowed to perform this transition. Empty = any authenticated user. */
  allowedRoles: UserRole[];
  /** Fields auto-set when this transition occurs. */
  autoFields: Record<string, () => unknown>;
  /** Whether a reason string is required (e.g., cancellation). */
  requiresReason: boolean;
}

// ─── All Valid Transitions ───────────────────────────────────────────
const MANAGER_ROLES: UserRole[] = ['procurement_manager', 'tenant_admin'];
const RECEIVING_ROLES: UserRole[] = ['receiving_manager', 'procurement_manager', 'tenant_admin'];

export const PO_TRANSITIONS: TransitionDefinition[] = [
  // Draft -> Pending Approval
  {
    from: 'draft',
    to: 'pending_approval',
    allowedRoles: [...MANAGER_ROLES, 'inventory_manager'],
    autoFields: {},
    requiresReason: false,
  },
  // Pending Approval -> Approved
  {
    from: 'pending_approval',
    to: 'approved',
    allowedRoles: MANAGER_ROLES,
    autoFields: {
      approvedAt: () => new Date(),
    },
    requiresReason: false,
  },
  // Pending Approval -> Draft (send back for edits)
  {
    from: 'pending_approval',
    to: 'draft',
    allowedRoles: MANAGER_ROLES,
    autoFields: {},
    requiresReason: false,
  },
  // Approved -> Sent
  {
    from: 'approved',
    to: 'sent',
    allowedRoles: MANAGER_ROLES,
    autoFields: {
      sentAt: () => new Date(),
    },
    requiresReason: false,
  },
  // Sent -> Acknowledged (supplier confirmed)
  {
    from: 'sent',
    to: 'acknowledged',
    allowedRoles: [...MANAGER_ROLES, 'inventory_manager'],
    autoFields: {},
    requiresReason: false,
  },
  // Sent -> Partially Received (some goods arrived)
  {
    from: 'sent',
    to: 'partially_received',
    allowedRoles: RECEIVING_ROLES,
    autoFields: {},
    requiresReason: false,
  },
  // Acknowledged -> Partially Received
  {
    from: 'acknowledged',
    to: 'partially_received',
    allowedRoles: RECEIVING_ROLES,
    autoFields: {},
    requiresReason: false,
  },
  // Partially Received -> Received (all lines fulfilled)
  {
    from: 'partially_received',
    to: 'received',
    allowedRoles: RECEIVING_ROLES,
    autoFields: {
      actualDeliveryDate: () => new Date(),
    },
    requiresReason: false,
  },
  // Received -> Closed
  {
    from: 'received',
    to: 'closed',
    allowedRoles: MANAGER_ROLES,
    autoFields: {},
    requiresReason: false,
  },
  // ─── Cancellation transitions (any non-terminal -> cancelled) ────
  ...(
    ['draft', 'pending_approval', 'approved', 'sent', 'acknowledged', 'partially_received', 'received'] as POStatus[]
  ).map((from): TransitionDefinition => ({
    from,
    to: 'cancelled',
    allowedRoles: MANAGER_ROLES,
    autoFields: {
      cancelledAt: () => new Date(),
    },
    requiresReason: true,
  })),
];

// ─── Transition Validation ───────────────────────────────────────────
export interface TransitionInput {
  currentStatus: POStatus;
  targetStatus: POStatus;
  userRole: UserRole;
  reason?: string;
}

export interface TransitionResult {
  valid: boolean;
  error?: string;
  definition?: TransitionDefinition;
  autoFields?: Record<string, unknown>;
}

/**
 * Validate a proposed PO status transition.
 * Returns the transition definition and auto-populated fields if valid.
 */
export function validateTransition(input: TransitionInput): TransitionResult {
  const { currentStatus, targetStatus, userRole, reason } = input;

  // Find matching transition definition
  const definition = PO_TRANSITIONS.find(
    (t) => t.from === currentStatus && t.to === targetStatus
  );

  if (!definition) {
    return {
      valid: false,
      error: `Invalid transition from '${currentStatus}' to '${targetStatus}'`,
    };
  }

  // Check role authorization
  if (definition.allowedRoles.length > 0 && !definition.allowedRoles.includes(userRole)) {
    return {
      valid: false,
      error: `Role '${userRole}' is not authorized for transition from '${currentStatus}' to '${targetStatus}'`,
    };
  }

  // Check required reason
  if (definition.requiresReason && (!reason || reason.trim().length === 0)) {
    return {
      valid: false,
      error: `A reason is required when transitioning to '${targetStatus}'`,
    };
  }

  // Compute auto fields
  const autoFields: Record<string, unknown> = {};
  for (const [key, valueFn] of Object.entries(definition.autoFields)) {
    autoFields[key] = valueFn();
  }

  return {
    valid: true,
    definition,
    autoFields,
  };
}

/**
 * Get all valid next statuses from a given current status.
 * Optionally filtered by role.
 */
export function getValidNextStatuses(
  currentStatus: POStatus,
  userRole?: UserRole
): POStatus[] {
  return PO_TRANSITIONS
    .filter((t) => {
      if (t.from !== currentStatus) return false;
      if (userRole && t.allowedRoles.length > 0 && !t.allowedRoles.includes(userRole)) {
        return false;
      }
      return true;
    })
    .map((t) => t.to);
}

/**
 * Check if a status is terminal (no outgoing transitions).
 */
export function isTerminalStatus(status: POStatus): boolean {
  return !PO_TRANSITIONS.some((t) => t.from === status);
}
