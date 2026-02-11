/**
 * Tests for the Automation Orchestrator (TCAAF Pipeline)
 *
 * Covers: executePipeline flow (kill switch, rule denial, guardrail
 * violation, approval escalation, successful execution, concurrent
 * execution, action failure), kill switch management, and health check.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (vi.hoisted ensures variables are available inside vi.mock factories) ──

const {
  mockRedisGet, mockRedisSet, mockRedisDel, mockRedisQuit, mockRedisPing,
  mockDbExecute,
  mockLoadActiveRules, mockEvaluateRules, mockBuildIdempotencyKey,
  mockExecuteWithIdempotency, mockCheckIdempotencyKey, mockClearIdempotencyKey, mockIdempotencyShutdown,
  mockCheckGuardrails, mockRecordPOCreated, mockRecordEmailDispatched,
  mockDispatchAction,
} = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockRedisQuit: vi.fn(),
  mockRedisPing: vi.fn(),
  mockDbExecute: vi.fn().mockResolvedValue(undefined),
  mockLoadActiveRules: vi.fn(),
  mockEvaluateRules: vi.fn(),
  mockBuildIdempotencyKey: vi.fn(),
  mockExecuteWithIdempotency: vi.fn(),
  mockCheckIdempotencyKey: vi.fn(),
  mockClearIdempotencyKey: vi.fn(),
  mockIdempotencyShutdown: vi.fn(),
  mockCheckGuardrails: vi.fn(),
  mockRecordPOCreated: vi.fn(),
  mockRecordEmailDispatched: vi.fn(),
  mockDispatchAction: vi.fn(),
}));

// Redis mock
vi.mock('ioredis', () => {
  return {
    Redis: class MockRedis {
      get = mockRedisGet;
      set = mockRedisSet;
      del = mockRedisDel;
      quit = mockRedisQuit;
      ping = mockRedisPing;
    },
  };
});

// Logger mock
vi.mock('@arda/config', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// DB mock (recordDecision uses db.insert)
vi.mock('@arda/db', () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        execute: mockDbExecute,
      }),
    }),
  },
  schema: {
    auditLog: {},
  },
}));

// Rule evaluator mock
vi.mock('./rule-evaluator.js', () => ({
  loadActiveRules: (...args: unknown[]) => mockLoadActiveRules(...args),
  evaluateRules: (...args: unknown[]) => mockEvaluateRules(...args),
  buildIdempotencyKey: (...args: unknown[]) => mockBuildIdempotencyKey(...args),
}));

// Idempotency manager mock
vi.mock('./idempotency-manager.js', () => {
  return {
    IdempotencyManager: class MockIdempotencyManager {
      executeWithIdempotency = mockExecuteWithIdempotency;
      checkIdempotencyKey = mockCheckIdempotencyKey;
      clearIdempotencyKey = mockClearIdempotencyKey;
      shutdown = mockIdempotencyShutdown;
    },
    ConcurrentExecutionError: class ConcurrentExecutionError extends Error {
      key: string;
      existingStatus: string;
      constructor(key: string, existingStatus: string) {
        super(`Concurrent execution detected for key: ${key} (status: ${existingStatus})`);
        this.name = 'ConcurrentExecutionError';
        this.key = key;
        this.existingStatus = existingStatus;
      }
    },
  };
});

// Guardrails mock
vi.mock('./guardrails.js', () => ({
  checkGuardrails: (...args: unknown[]) => mockCheckGuardrails(...args),
  recordPOCreated: (...args: unknown[]) => mockRecordPOCreated(...args),
  recordEmailDispatched: (...args: unknown[]) => mockRecordEmailDispatched(...args),
}));

// Action handlers mock
vi.mock('./action-handlers.js', () => ({
  dispatchAction: (...args: unknown[]) => mockDispatchAction(...args),
}));

// Now import the module under test
import { AutomationOrchestrator } from './orchestrator.js';
import { ConcurrentExecutionError } from './idempotency-manager.js';
import type { AutomationJobPayload } from './types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

/** Build a minimal valid AutomationJobPayload for tests. */
function makeJob(overrides: Partial<AutomationJobPayload> = {}): AutomationJobPayload {
  return {
    actionType: 'create_purchase_order',
    ruleId: 'P-01',
    tenantId: 'T1',
    triggerEvent: 'card.stage.triggered',
    idempotencyKey: 'po_create:T1:S1:F1:2025-01-01',
    context: {
      tenantId: 'T1',
      supplierId: 'S1',
      facilityId: 'F1',
      partId: 'PART-01',
      cardId: 'CARD-01',
      loopId: 'LOOP-01',
      orderQuantity: 100,
      totalAmount: 2500,
    },
    approval: { required: false, strategy: 'auto_approve' },
    fallback: {
      onConditionFail: 'skip',
      onActionFail: 'retry',
      maxRetries: 3,
      retryDelayMs: 1000,
      retryBackoffMultiplier: 2,
    },
    actionParams: {},
    ...overrides,
  };
}

/**
 * Configure the mocks for a "happy path" pipeline run where every step passes.
 */
function setupHappyPath() {
  // Kill switch is not active (global = null, tenant = null)
  mockRedisGet.mockResolvedValue(null);

  // Rules allow the action
  mockLoadActiveRules.mockReturnValue([{ id: 'P-01', isActive: true }]);
  mockEvaluateRules.mockReturnValue({
    allowed: true,
    matchedAllowRule: { id: 'P-01' },
    allMatchingRules: [{ id: 'P-01' }],
    evaluation: { totalRulesEvaluated: 1, allowMatches: 1, denyMatches: 0 },
  });

  // Guardrails pass
  mockCheckGuardrails.mockResolvedValue({ passed: true, violations: [] });

  // Idempotency executes the action (first run)
  mockExecuteWithIdempotency.mockImplementation(
    async (_key: string, _actionType: string, _tenantId: string, action: () => Promise<unknown>) => {
      const result = await action();
      return { result, wasReplay: false };
    },
  );

  // Action handler succeeds
  mockDispatchAction.mockResolvedValue({
    success: true,
    data: { purchaseOrderId: 'PO-001', poNumber: 'PO-AUTO-ABC' },
  });

  // Post-action counters succeed
  mockRecordPOCreated.mockResolvedValue(undefined);

  // DB audit insert succeeds
  mockDbExecute.mockResolvedValue(undefined);
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('AutomationOrchestrator', () => {
  let orchestrator: AutomationOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    orchestrator = new AutomationOrchestrator('redis://localhost:6379');
  });

  // ─── executePipeline ──────────────────────────────────────────────

  describe('executePipeline', () => {
    it('completes successfully on the happy path', async () => {
      setupHappyPath();

      const job = makeJob();
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(true);
      expect(result.actionType).toBe('create_purchase_order');
      expect(result.wasReplay).toBe(false);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.result).toEqual({
        purchaseOrderId: 'PO-001',
        poNumber: 'PO-AUTO-ABC',
      });

      // Verify the pipeline called all expected steps
      expect(mockLoadActiveRules).toHaveBeenCalledWith('T1');
      expect(mockEvaluateRules).toHaveBeenCalled();
      expect(mockCheckGuardrails).toHaveBeenCalled();
      expect(mockExecuteWithIdempotency).toHaveBeenCalled();
      expect(mockDispatchAction).toHaveBeenCalledWith(
        'create_purchase_order',
        expect.objectContaining({ tenantId: 'T1', supplierId: 'S1' }),
      );
    });

    it('blocks execution when kill switch is active (global)', async () => {
      // Global kill switch is active
      mockRedisGet.mockResolvedValueOnce('active');

      const job = makeJob();
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Automation kill switch is active');
      // Should not evaluate rules or execute actions
      expect(mockEvaluateRules).not.toHaveBeenCalled();
      expect(mockDispatchAction).not.toHaveBeenCalled();
    });

    it('blocks execution when kill switch is active (per-tenant)', async () => {
      // Global kill switch is not active
      mockRedisGet.mockResolvedValueOnce(null);
      // Tenant kill switch is active
      mockRedisGet.mockResolvedValueOnce('active');

      const job = makeJob();
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Automation kill switch is active');
    });

    it('denies when rules do not allow the action', async () => {
      // Kill switch off
      mockRedisGet.mockResolvedValue(null);

      mockLoadActiveRules.mockReturnValue([]);
      mockEvaluateRules.mockReturnValue({
        allowed: false,
        deniedByRule: { id: 'D-01' },
        allMatchingRules: [],
        evaluation: { totalRulesEvaluated: 1, allowMatches: 0, denyMatches: 1 },
      });

      const job = makeJob();
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Denied by rule: D-01');
      expect(mockCheckGuardrails).not.toHaveBeenCalled();
      expect(mockDispatchAction).not.toHaveBeenCalled();
    });

    it('denies when default deny (no rules match)', async () => {
      mockRedisGet.mockResolvedValue(null);

      mockLoadActiveRules.mockReturnValue([]);
      mockEvaluateRules.mockReturnValue({
        allowed: false,
        allMatchingRules: [],
        evaluation: { totalRulesEvaluated: 0, allowMatches: 0, denyMatches: 0 },
      });

      const job = makeJob();
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Denied by rule: default_deny');
    });

    it('denies when guardrails detect blocking violations', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockLoadActiveRules.mockReturnValue([]);
      mockEvaluateRules.mockReturnValue({
        allowed: true,
        matchedAllowRule: { id: 'P-01' },
        allMatchingRules: [],
        evaluation: { totalRulesEvaluated: 1, allowMatches: 1, denyMatches: 0 },
      });

      // Guardrails fail with a blocking violation (e.g. G-01)
      mockCheckGuardrails.mockResolvedValue({
        passed: false,
        violations: [
          {
            guardrailId: 'G-01',
            description: 'PO amount exceeds auto-approve limit',
            currentValue: 10000,
            threshold: 5000,
          },
        ],
      });

      const job = makeJob();
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Guardrail violation: G-01');
      expect(mockDispatchAction).not.toHaveBeenCalled();
    });

    it('does NOT block when only G-08 (dual approval) violations are present', async () => {
      setupHappyPath();

      // Override guardrails to have only G-08 violation (non-blocking)
      mockCheckGuardrails.mockResolvedValue({
        passed: false,
        violations: [
          {
            guardrailId: 'G-08',
            description: 'Exceeds dual-approval threshold',
            currentValue: 20000,
            threshold: 15000,
          },
        ],
      });

      const job = makeJob();
      const result = await orchestrator.executePipeline(job);

      // Should proceed since G-08 is non-blocking
      expect(result.success).toBe(true);
      expect(mockDispatchAction).toHaveBeenCalled();
    });

    it('escalates when manual approval is required', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockLoadActiveRules.mockReturnValue([]);
      mockEvaluateRules.mockReturnValue({
        allowed: true,
        matchedAllowRule: { id: 'P-01' },
        allMatchingRules: [],
        evaluation: { totalRulesEvaluated: 1, allowMatches: 1, denyMatches: 0 },
      });
      mockCheckGuardrails.mockResolvedValue({ passed: true, violations: [] });

      const job = makeJob({
        approval: {
          required: true,
          strategy: 'always_manual',
        },
      });
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Manual approval required');
      expect(mockDispatchAction).not.toHaveBeenCalled();
    });

    it('auto-approves when strategy is auto_approve even if approval.required is true', async () => {
      setupHappyPath();

      const job = makeJob({
        approval: { required: true, strategy: 'auto_approve' },
      });
      const result = await orchestrator.executePipeline(job);

      // auto_approve should not block
      expect(result.success).toBe(true);
    });

    it('handles threshold_based approval: auto-approves below threshold', async () => {
      setupHappyPath();

      const job = makeJob({
        context: { tenantId: 'T1', supplierId: 'S1', facilityId: 'F1', totalAmount: 1000 },
        approval: {
          required: true,
          strategy: 'threshold_based',
          thresholds: {
            autoApproveBelow: 5000,
            requireApprovalAbove: 10000,
            requireDualApprovalAbove: 15000,
          },
        },
      });
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(true);
    });

    it('handles threshold_based approval: requires approval above threshold', async () => {
      mockRedisGet.mockResolvedValue(null);
      mockLoadActiveRules.mockReturnValue([]);
      mockEvaluateRules.mockReturnValue({
        allowed: true,
        matchedAllowRule: { id: 'P-01' },
        allMatchingRules: [],
        evaluation: { totalRulesEvaluated: 1, allowMatches: 1, denyMatches: 0 },
      });
      mockCheckGuardrails.mockResolvedValue({ passed: true, violations: [] });

      const job = makeJob({
        context: { tenantId: 'T1', supplierId: 'S1', facilityId: 'F1', totalAmount: 15000 },
        approval: {
          required: true,
          strategy: 'threshold_based',
          thresholds: {
            autoApproveBelow: 5000,
            requireApprovalAbove: 10000,
            requireDualApprovalAbove: 15000,
          },
        },
      });
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Manual approval required');
    });

    it('returns replay result from idempotency manager', async () => {
      setupHappyPath();

      // Override idempotency to return a replay
      mockExecuteWithIdempotency.mockResolvedValue({
        result: { success: true, data: { purchaseOrderId: 'PO-001' } },
        wasReplay: true,
      });

      const job = makeJob();
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(true);
      expect(result.wasReplay).toBe(true);
      // Post-action counters should NOT be recorded for replays
      expect(mockRecordPOCreated).not.toHaveBeenCalled();
    });

    it('handles ConcurrentExecutionError gracefully', async () => {
      setupHappyPath();

      // Idempotency throws ConcurrentExecutionError
      mockExecuteWithIdempotency.mockRejectedValue(
        new ConcurrentExecutionError('test-key', 'pending'),
      );

      const job = makeJob();
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Concurrent execution detected');
      expect(result.wasReplay).toBe(false);
    });

    it('records post-action counters for PO creation (non-replay)', async () => {
      setupHappyPath();

      const job = makeJob();
      await orchestrator.executePipeline(job);

      expect(mockRecordPOCreated).toHaveBeenCalledWith(
        expect.anything(), // redis instance
        'T1',
        'S1',
        2500,
      );
    });

    it('records post-action counters for email dispatch (non-replay)', async () => {
      setupHappyPath();

      const job = makeJob({
        actionType: 'dispatch_email',
        context: {
          tenantId: 'T1',
          poId: 'PO-01',
          supplierId: 'S1',
          supplierEmail: 'vendor@example.com',
          totalAmount: 1000,
        },
      });
      await orchestrator.executePipeline(job);

      expect(mockRecordEmailDispatched).toHaveBeenCalledWith(
        expect.anything(), // redis instance
        'T1',
        'PO-01',
        'S1',
        'vendor@example.com',
      );
    });

    it('handles action handler failure and escalates when configured', async () => {
      setupHappyPath();

      // Action handler returns failure
      mockDispatchAction
        .mockResolvedValueOnce({
          success: false,
          error: 'Supplier API timeout',
        })
        // The escalation call also dispatches an action
        .mockResolvedValueOnce({
          success: true,
          data: { escalated: true },
        });

      // Override idempotency to execute the action directly
      mockExecuteWithIdempotency.mockImplementation(
        async (_key: string, _actionType: string, _tenantId: string, action: () => Promise<unknown>) => {
          const result = await action();
          return { result, wasReplay: false };
        },
      );

      const job = makeJob({
        fallback: {
          onConditionFail: 'skip',
          onActionFail: 'escalate',
          maxRetries: 3,
          retryDelayMs: 1000,
          retryBackoffMultiplier: 2,
        },
      });
      const result = await orchestrator.executePipeline(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Supplier API timeout');

      // Verify escalation was triggered
      expect(mockDispatchAction).toHaveBeenCalledTimes(2);
      expect(mockDispatchAction).toHaveBeenNthCalledWith(
        2,
        'escalate',
        expect.objectContaining({
          tenantId: 'T1',
          reason: expect.stringContaining('Supplier API timeout'),
        }),
      );
    });

    it('rethrows unexpected errors after recording decision', async () => {
      setupHappyPath();

      // Idempotency throws a non-ConcurrentExecutionError
      mockExecuteWithIdempotency.mockRejectedValue(new Error('Redis connection lost'));

      const job = makeJob();

      await expect(orchestrator.executePipeline(job)).rejects.toThrow('Redis connection lost');

      // Audit decision should still be recorded
      expect(mockDbExecute).toHaveBeenCalled();
    });
  });

  // ─── Kill Switch Management ──────────────────────────────────────

  describe('kill switch management', () => {
    it('isKillSwitchActive returns true when global switch is active', async () => {
      mockRedisGet.mockResolvedValueOnce('active');

      const active = await orchestrator.isKillSwitchActive('T1');
      expect(active).toBe(true);
    });

    it('isKillSwitchActive returns true when tenant switch is active', async () => {
      mockRedisGet.mockResolvedValueOnce(null);    // global = inactive
      mockRedisGet.mockResolvedValueOnce('active'); // tenant = active

      const active = await orchestrator.isKillSwitchActive('T1');
      expect(active).toBe(true);
    });

    it('isKillSwitchActive returns false when both switches are inactive', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisGet.mockResolvedValueOnce(null);

      const active = await orchestrator.isKillSwitchActive('T1');
      expect(active).toBe(false);
    });

    it('activateKillSwitch sets global key', async () => {
      mockRedisSet.mockResolvedValueOnce('OK');

      await orchestrator.activateKillSwitch();
      expect(mockRedisSet).toHaveBeenCalledWith(
        'arda:automation:kill_switch',
        'active',
      );
    });

    it('activateKillSwitch sets tenant-specific key', async () => {
      mockRedisSet.mockResolvedValueOnce('OK');

      await orchestrator.activateKillSwitch('T1');
      expect(mockRedisSet).toHaveBeenCalledWith(
        'arda:automation:kill_switch:T1',
        'active',
      );
    });

    it('deactivateKillSwitch deletes global key', async () => {
      mockRedisDel.mockResolvedValueOnce(1);

      await orchestrator.deactivateKillSwitch();
      expect(mockRedisDel).toHaveBeenCalledWith('arda:automation:kill_switch');
    });

    it('deactivateKillSwitch deletes tenant-specific key', async () => {
      mockRedisDel.mockResolvedValueOnce(1);

      await orchestrator.deactivateKillSwitch('T1');
      expect(mockRedisDel).toHaveBeenCalledWith(
        'arda:automation:kill_switch:T1',
      );
    });
  });

  // ─── Health Check ──────────────────────────────────────────────────

  describe('healthCheck', () => {
    it('returns healthy status when Redis is up', async () => {
      mockRedisPing.mockResolvedValueOnce('PONG');
      mockRedisGet.mockResolvedValueOnce(null);

      const health = await orchestrator.healthCheck();
      expect(health.redis).toBe(true);
      expect(health.killSwitchGlobal).toBe(false);
    });

    it('detects active global kill switch in health check', async () => {
      mockRedisPing.mockResolvedValueOnce('PONG');
      mockRedisGet.mockResolvedValueOnce('active');

      const health = await orchestrator.healthCheck();
      expect(health.redis).toBe(true);
      expect(health.killSwitchGlobal).toBe(true);
    });

    it('returns unhealthy when Redis is down', async () => {
      mockRedisPing.mockRejectedValueOnce(new Error('Connection refused'));

      const health = await orchestrator.healthCheck();
      expect(health.redis).toBe(false);
      expect(health.killSwitchGlobal).toBe(false);
    });
  });

  // ─── Shutdown ──────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('shuts down idempotency manager and Redis', async () => {
      mockIdempotencyShutdown.mockResolvedValueOnce(undefined);
      mockRedisQuit.mockResolvedValueOnce('OK');

      await orchestrator.shutdown();

      expect(mockIdempotencyShutdown).toHaveBeenCalled();
      expect(mockRedisQuit).toHaveBeenCalled();
    });
  });

  // ─── Idempotency Passthrough ──────────────────────────────────────

  describe('idempotency passthrough', () => {
    it('delegates clearIdempotencyKey to idempotency manager', async () => {
      mockClearIdempotencyKey.mockResolvedValueOnce(true);

      const result = await orchestrator.clearIdempotencyKey('test-key');
      expect(result).toBe(true);
      expect(mockClearIdempotencyKey).toHaveBeenCalledWith('test-key');
    });

    it('delegates checkIdempotencyKey to idempotency manager', async () => {
      const record = { key: 'test', status: 'completed' };
      mockCheckIdempotencyKey.mockResolvedValueOnce(record);

      const result = await orchestrator.checkIdempotencyKey('test-key');
      expect(result).toEqual(record);
      expect(mockCheckIdempotencyKey).toHaveBeenCalledWith('test-key');
    });
  });
});
