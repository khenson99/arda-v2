import { describe, expect, it } from 'vitest';
import {
  validateTransition,
  getValidNextStatuses,
  isTerminalStatus,
  PO_TRANSITIONS,
  type TransitionInput,
} from './po-lifecycle.service.js';
import type { POStatus } from '@arda/shared-types';

// ─── validateTransition ─────────────────────────────────────────────
describe('validateTransition', () => {
  it('allows draft -> pending_approval for procurement_manager', () => {
    const result = validateTransition({
      currentStatus: 'draft',
      targetStatus: 'pending_approval',
      userRole: 'procurement_manager',
    });
    expect(result.valid).toBe(true);
  });

  it('allows pending_approval -> approved for tenant_admin', () => {
    const result = validateTransition({
      currentStatus: 'pending_approval',
      targetStatus: 'approved',
      userRole: 'tenant_admin',
    });
    expect(result.valid).toBe(true);
    expect(result.autoFields).toHaveProperty('approvedAt');
    expect(result.autoFields!.approvedAt).toBeInstanceOf(Date);
  });

  it('rejects approved -> closed (must go through sent/received)', () => {
    const result = validateTransition({
      currentStatus: 'approved',
      targetStatus: 'closed',
      userRole: 'procurement_manager',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid transition');
  });

  it('rejects unauthorized role for approval', () => {
    const result = validateTransition({
      currentStatus: 'pending_approval',
      targetStatus: 'approved',
      userRole: 'salesperson',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not authorized');
  });

  it('auto-populates sentAt when transitioning to sent', () => {
    const result = validateTransition({
      currentStatus: 'approved',
      targetStatus: 'sent',
      userRole: 'procurement_manager',
    });
    expect(result.valid).toBe(true);
    expect(result.autoFields).toHaveProperty('sentAt');
  });

  it('auto-populates actualDeliveryDate when transitioning to received', () => {
    const result = validateTransition({
      currentStatus: 'partially_received',
      targetStatus: 'received',
      userRole: 'receiving_manager',
    });
    expect(result.valid).toBe(true);
    expect(result.autoFields).toHaveProperty('actualDeliveryDate');
  });

  it('requires reason for cancellation', () => {
    const result = validateTransition({
      currentStatus: 'approved',
      targetStatus: 'cancelled',
      userRole: 'procurement_manager',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('reason is required');
  });

  it('allows cancellation with reason', () => {
    const result = validateTransition({
      currentStatus: 'approved',
      targetStatus: 'cancelled',
      userRole: 'procurement_manager',
      reason: 'Supplier went bankrupt',
    });
    expect(result.valid).toBe(true);
    expect(result.autoFields).toHaveProperty('cancelledAt');
  });

  it('rejects transitions from terminal state closed', () => {
    const result = validateTransition({
      currentStatus: 'closed',
      targetStatus: 'received',
      userRole: 'tenant_admin',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects transitions from terminal state cancelled', () => {
    const result = validateTransition({
      currentStatus: 'cancelled',
      targetStatus: 'draft',
      userRole: 'tenant_admin',
    });
    expect(result.valid).toBe(false);
  });

  it('allows sending back from pending_approval to draft', () => {
    const result = validateTransition({
      currentStatus: 'pending_approval',
      targetStatus: 'draft',
      userRole: 'procurement_manager',
    });
    expect(result.valid).toBe(true);
  });
});

// ─── getValidNextStatuses ───────────────────────────────────────────
describe('getValidNextStatuses', () => {
  it('returns pending_approval and cancelled for draft', () => {
    const statuses = getValidNextStatuses('draft');
    expect(statuses).toContain('pending_approval');
    expect(statuses).toContain('cancelled');
  });

  it('returns empty array for closed', () => {
    expect(getValidNextStatuses('closed')).toEqual([]);
  });

  it('filters by role', () => {
    // salesperson should not be able to approve
    const statuses = getValidNextStatuses('pending_approval', 'salesperson');
    expect(statuses).not.toContain('approved');
  });
});

// ─── isTerminalStatus ───────────────────────────────────────────────
describe('isTerminalStatus', () => {
  it('marks closed as terminal', () => {
    expect(isTerminalStatus('closed')).toBe(true);
  });

  it('marks cancelled as terminal', () => {
    expect(isTerminalStatus('cancelled')).toBe(true);
  });

  it('marks draft as non-terminal', () => {
    expect(isTerminalStatus('draft')).toBe(false);
  });

  it('marks sent as non-terminal', () => {
    expect(isTerminalStatus('sent')).toBe(false);
  });
});

// ─── Transition completeness ────────────────────────────────────────
describe('PO_TRANSITIONS completeness', () => {
  const nonTerminalStatuses: POStatus[] = [
    'draft', 'pending_approval', 'approved', 'sent',
    'acknowledged', 'partially_received', 'received',
  ];

  it('every non-terminal status can be cancelled', () => {
    for (const status of nonTerminalStatuses) {
      const canCancel = PO_TRANSITIONS.some(
        (t) => t.from === status && t.to === 'cancelled'
      );
      expect(canCancel, `${status} should be cancellable`).toBe(true);
    }
  });

  it('has at least one forward transition for each non-terminal status', () => {
    for (const status of nonTerminalStatuses) {
      const hasForward = PO_TRANSITIONS.some(
        (t) => t.from === status && t.to !== 'cancelled'
      );
      expect(hasForward, `${status} should have a forward transition`).toBe(true);
    }
  });
});
