/**
 * Transfer Order Lifecycle State Machine
 *
 * Declarative transition definitions with role-based authorization and
 * auto-populated timestamp fields. Mirrors the PO lifecycle pattern.
 *
 * State flow:
 *   draft -> requested -> approved -> picking -> shipped -> in_transit
 *     -> received -> closed
 *
 * Any non-terminal state can transition to 'cancelled' (with reason).
 * Terminal states: closed, cancelled.
 */

import type { UserRole, TransferStatus } from '@arda/shared-types';
import { TRANSFER_VALID_TRANSITIONS } from '@arda/shared-types';

// ─── Transition Definition ───────────────────────────────────────────
export interface TransferTransitionDefinition {
  from: TransferStatus;
  to: TransferStatus;
  /** Roles allowed to perform this transition. Empty = any authenticated user. */
  allowedRoles: UserRole[];
  /** Fields auto-set when this transition occurs. */
  autoFields: Record<string, () => unknown>;
  /** Whether a reason string is required (e.g., cancellation). */
  requiresReason: boolean;
}

// ─── Role Groups ───────────────────────────────────────────────────────
const MANAGER_ROLES: UserRole[] = ['inventory_manager', 'procurement_manager', 'tenant_admin'];
const RECEIVING_ROLES: UserRole[] = ['receiving_manager', 'inventory_manager', 'tenant_admin'];

// ─── All Valid Transitions ───────────────────────────────────────────
export const TRANSFER_TRANSITIONS: TransferTransitionDefinition[] = [
  // Draft -> Requested
  {
    from: 'draft',
    to: 'requested',
    allowedRoles: MANAGER_ROLES,
    autoFields: {
      requestedDate: () => new Date(),
    },
    requiresReason: false,
  },
  // Requested -> Approved
  {
    from: 'requested',
    to: 'approved',
    allowedRoles: MANAGER_ROLES,
    autoFields: {},
    requiresReason: false,
  },
  // Approved -> Picking
  {
    from: 'approved',
    to: 'picking',
    allowedRoles: [...MANAGER_ROLES, 'receiving_manager'],
    autoFields: {},
    requiresReason: false,
  },
  // Picking -> Shipped
  {
    from: 'picking',
    to: 'shipped',
    allowedRoles: MANAGER_ROLES,
    autoFields: {
      shippedDate: () => new Date(),
    },
    requiresReason: false,
  },
  // Shipped -> In Transit
  {
    from: 'shipped',
    to: 'in_transit',
    allowedRoles: MANAGER_ROLES,
    autoFields: {},
    requiresReason: false,
  },
  // In Transit -> Received
  {
    from: 'in_transit',
    to: 'received',
    allowedRoles: RECEIVING_ROLES,
    autoFields: {
      receivedDate: () => new Date(),
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
    ['draft', 'requested', 'approved', 'picking', 'shipped', 'in_transit'] as TransferStatus[]
  ).map((from): TransferTransitionDefinition => ({
    from,
    to: 'cancelled',
    allowedRoles: MANAGER_ROLES,
    autoFields: {},
    requiresReason: true,
  })),
];

// ─── Transition Validation ───────────────────────────────────────────
export interface TransferTransitionInput {
  currentStatus: TransferStatus;
  targetStatus: TransferStatus;
  userRole: UserRole;
  reason?: string;
}

export interface TransferTransitionResult {
  valid: boolean;
  error?: string;
  definition?: TransferTransitionDefinition;
  autoFields?: Record<string, unknown>;
}

/**
 * Validate a proposed Transfer Order status transition.
 * Returns the transition definition and auto-populated fields if valid.
 */
export function validateTransferTransition(input: TransferTransitionInput): TransferTransitionResult {
  const { currentStatus, targetStatus, userRole, reason } = input;

  // Guard: check the lookup table first
  const validTargets = TRANSFER_VALID_TRANSITIONS[currentStatus];
  if (!validTargets || !validTargets.includes(targetStatus)) {
    return {
      valid: false,
      error: `Invalid transition from '${currentStatus}' to '${targetStatus}'`,
    };
  }

  // Find matching transition definition for role + auto-field info
  const definition = TRANSFER_TRANSITIONS.find(
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
export function getValidNextTransferStatuses(
  currentStatus: TransferStatus,
  userRole?: UserRole
): TransferStatus[] {
  return TRANSFER_TRANSITIONS
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
export function isTransferTerminalStatus(status: TransferStatus): boolean {
  const targets = TRANSFER_VALID_TRANSITIONS[status];
  return !targets || targets.length === 0;
}
