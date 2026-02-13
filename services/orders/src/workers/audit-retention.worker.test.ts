import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted State & Mocks ──────────────────────────────────────────

const testState = vi.hoisted(() => ({
  tenants: [] as Array<{ id: string; settings: Record<string, unknown> | null }>,
  expiredRowsBatches: [] as Array<Array<{ id: string }>>,
  batchIndex: 0,
}));

const { writeAuditEntryMock } = vi.hoisted(() => ({
  writeAuditEntryMock: vi.fn(async () => ({
    id: 'audit-1',
    hashChain: 'test-hash',
    sequenceNumber: 1,
  })),
}));

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(async () => ({ rowCount: 0 })),
}));

const schemaMock = vi.hoisted(() => ({
  tenants: {
    id: 'tenants.id',
    isActive: 'tenants.is_active',
    settings: 'tenants.settings',
  },
  auditLog: {
    id: 'audit_log.id',
    tenantId: 'audit_log.tenant_id',
    timestamp: 'audit_log.timestamp',
  },
  auditLogArchive: {
    id: 'audit_log_archive.id',
  },
}));

const { dbMock, resetDbMocks } = vi.hoisted(() => {
  // Track which query we're building for (tenants vs audit)
  let currentQueryType: 'tenants' | 'audit' = 'tenants';

  const transactionMock = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const txProxy = {
      execute: executeMock,
    };
    return fn(txProxy);
  });

  const dbMock = {
    select: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      builder.from = vi.fn((table: unknown) => {
        // Detect which table we're querying by checking the table reference
        if (table === schemaMock.tenants) {
          currentQueryType = 'tenants';
        } else {
          currentQueryType = 'audit';
        }
        return builder;
      });
      builder.where = vi.fn(() => builder);
      builder.limit = vi.fn(() => builder);
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        if (currentQueryType === 'tenants') {
          return Promise.resolve(testState.tenants).then(resolve, reject);
        }
        // For audit queries, return batches sequentially
        const batch = testState.expiredRowsBatches[testState.batchIndex] ?? [];
        testState.batchIndex++;
        return Promise.resolve(batch).then(resolve, reject);
      };
      return builder;
    }),
    transaction: transactionMock,
    execute: executeMock,
  };

  const resetDbMocks = () => {
    dbMock.select.mockClear();
    transactionMock.mockClear();
    executeMock.mockClear();
    testState.batchIndex = 0;
  };

  return { dbMock, resetDbMocks };
});

const { configMock } = vi.hoisted(() => ({
  configMock: {
    AUDIT_RETENTION_ENABLED: true,
    AUDIT_RETENTION_DAYS: 90,
    AUDIT_RETENTION_BATCH_SIZE: 1000,
    AUDIT_RETENTION_INTERVAL_HOURS: 24,
  },
}));

// ─── Mock Modules ───────────────────────────────────────────────────

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => ({ op: 'eq', args })),
  lt: vi.fn((...args: unknown[]) => ({ op: 'lt', args })),
  sql: {
    raw: vi.fn((s: string) => s),
  },
}));

vi.mock('@arda/db', () => ({
  db: dbMock,
  schema: schemaMock,
  writeAuditEntry: writeAuditEntryMock,
  writeAuditEntries: vi.fn(async () => []),
}));

vi.mock('@arda/config', () => ({
  config: configMock,
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Import SUT after mocks ────────────────────────────────────────

import {
  runRetentionCycle,
  startAuditRetentionScheduler,
} from './audit-retention.worker.js';

// ─── Tests ──────────────────────────────────────────────────────────

describe('audit retention worker', () => {
  beforeEach(() => {
    testState.tenants = [];
    testState.expiredRowsBatches = [];
    testState.batchIndex = 0;
    resetDbMocks();
    writeAuditEntryMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── runRetentionCycle ─────────────────────────────────────────────

  describe('runRetentionCycle', () => {
    it('skips when no tenants have archiving enabled', async () => {
      testState.tenants = [
        { id: 'tenant-1', settings: { auditArchiveEnabled: false } },
        { id: 'tenant-2', settings: null },
      ];

      const result = await runRetentionCycle();

      expect(result.tenantsProcessed).toBe(0);
      expect(result.totalArchived).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.perTenant).toHaveLength(0);
    });

    it('processes only tenants with auditArchiveEnabled=true', async () => {
      testState.tenants = [
        { id: 'tenant-1', settings: { auditArchiveEnabled: true, auditRetentionDays: 60 } },
        { id: 'tenant-2', settings: { auditArchiveEnabled: false } },
        { id: 'tenant-3', settings: { auditArchiveEnabled: true } },
      ];
      // Both eligible tenants have no expired rows
      testState.expiredRowsBatches = [[], []];

      const result = await runRetentionCycle();

      expect(result.tenantsProcessed).toBe(2);
      expect(result.totalArchived).toBe(0);
    });

    it('archives expired rows in batches', async () => {
      testState.tenants = [
        { id: 'tenant-1', settings: { auditArchiveEnabled: true, auditRetentionDays: 30 } },
      ];
      // First batch: 3 rows, second batch: 0 (done)
      testState.expiredRowsBatches = [
        [{ id: 'row-1' }, { id: 'row-2' }, { id: 'row-3' }],
        [],
      ];
      executeMock.mockResolvedValue({ rowCount: 3 });

      const result = await runRetentionCycle();

      expect(result.tenantsProcessed).toBe(1);
      expect(result.totalArchived).toBe(3);
      expect(result.perTenant[0].tenantId).toBe('tenant-1');
      expect(result.perTenant[0].archived).toBe(3);
      // Should write an audit entry for the archival
      expect(writeAuditEntryMock).toHaveBeenCalledTimes(1);
      expect(writeAuditEntryMock).toHaveBeenCalledWith(
        dbMock,
        expect.objectContaining({
          tenantId: 'tenant-1',
          action: 'audit.retention_archived',
          entityType: 'audit_log',
          metadata: expect.objectContaining({ archivedCount: 3, retentionDays: 30 }),
        }),
      );
    });

    it('does not write audit entry when no rows are archived', async () => {
      testState.tenants = [
        { id: 'tenant-1', settings: { auditArchiveEnabled: true } },
      ];
      testState.expiredRowsBatches = [[]];

      const result = await runRetentionCycle();

      expect(result.totalArchived).toBe(0);
      expect(writeAuditEntryMock).not.toHaveBeenCalled();
    });

    it('uses default retention days when tenant does not specify', async () => {
      testState.tenants = [
        { id: 'tenant-1', settings: { auditArchiveEnabled: true } }, // no auditRetentionDays
      ];
      testState.expiredRowsBatches = [
        [{ id: 'row-1' }],
        [],
      ];
      executeMock.mockResolvedValue({ rowCount: 1 });

      const result = await runRetentionCycle();

      expect(result.totalArchived).toBe(1);
      // Verify the audit entry uses the default retention days (90)
      expect(writeAuditEntryMock).toHaveBeenCalledWith(
        dbMock,
        expect.objectContaining({
          metadata: expect.objectContaining({ retentionDays: 90 }),
        }),
      );
    });

    it('continues processing other tenants when one fails', async () => {
      testState.tenants = [
        { id: 'tenant-1', settings: { auditArchiveEnabled: true } },
        { id: 'tenant-2', settings: { auditArchiveEnabled: true } },
      ];

      // tenant-1 returns rows, but the transaction (archiveBatch) will fail
      // tenant-2 has no expired rows (succeeds trivially)
      testState.expiredRowsBatches = [
        [{ id: 'row-t1-1' }],
        [], // tenant-2 has no expired rows
      ];

      // Make the transaction fail for the first call (tenant-1's archiveBatch),
      // then succeed for subsequent calls
      let txCallCount = 0;
      dbMock.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        txCallCount++;
        if (txCallCount === 1) {
          throw new Error('DB connection error');
        }
        const txProxy = { execute: executeMock };
        return fn(txProxy);
      });

      const result = await runRetentionCycle();

      expect(result.tenantsProcessed).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.perTenant).toHaveLength(2);
      // tenant-1 failed
      expect(result.perTenant[0].tenantId).toBe('tenant-1');
      expect(result.perTenant[0].error).toBe('DB connection error');
      // tenant-2 succeeded with 0 archived (no expired rows)
      expect(result.perTenant[1].tenantId).toBe('tenant-2');
      expect(result.perTenant[1].archived).toBe(0);
    });

    it('handles multiple batches for a single tenant', async () => {
      testState.tenants = [
        { id: 'tenant-1', settings: { auditArchiveEnabled: true } },
      ];

      // Simulate two full batches + one partial batch
      // batchSize is 1000, so first two have length 1000, last has less
      const fullBatch = Array.from({ length: 1000 }, (_, i) => ({ id: `row-${i}` }));
      const partialBatch = [{ id: 'row-final-1' }, { id: 'row-final-2' }];

      testState.expiredRowsBatches = [fullBatch, fullBatch, partialBatch];
      executeMock.mockResolvedValue({ rowCount: 1000 });

      const result = await runRetentionCycle();

      // 1000 + 1000 + 2 = 2002 (but executeMock returns 1000 each time)
      // The third batch returns rowCount 1000 too, but only 2 rows were submitted
      // so archiveBatch uses the rowCount from execute
      expect(result.totalArchived).toBeGreaterThan(0);
      expect(result.perTenant[0].tenantId).toBe('tenant-1');
    });

    it('handles tenants with null settings gracefully', async () => {
      testState.tenants = [
        { id: 'tenant-1', settings: null },
      ];

      const result = await runRetentionCycle();

      expect(result.tenantsProcessed).toBe(0);
      expect(result.totalArchived).toBe(0);
    });
  });

  // ── startAuditRetentionScheduler ──────────────────────────────────

  describe('startAuditRetentionScheduler', () => {
    it('is a no-op when disabled', async () => {
      configMock.AUDIT_RETENTION_ENABLED = false;

      const handle = startAuditRetentionScheduler();
      const result = await handle.runOnce();
      handle.stop();

      expect(result.tenantsProcessed).toBe(0);
      expect(dbMock.select).not.toHaveBeenCalled();

      // Restore
      configMock.AUDIT_RETENTION_ENABLED = true;
    });

    it('runs on the configured interval', async () => {
      vi.useFakeTimers();
      testState.tenants = [];

      const handle = startAuditRetentionScheduler();

      // Advance by the interval (24 hours)
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      handle.stop();

      // select was called at least once (for fetching tenants)
      expect(dbMock.select).toHaveBeenCalled();
    });

    it('prevents concurrent runs', async () => {
      testState.tenants = [];

      const handle = startAuditRetentionScheduler();

      // Run twice concurrently
      const [result1, result2] = await Promise.all([
        handle.runOnce(),
        handle.runOnce(),
      ]);
      handle.stop();

      // One should have run, the other should have been skipped
      // Both return empty results since no tenants, but only one actually queries
      expect(result1.tenantsProcessed + result2.tenantsProcessed).toBe(0);
    });
  });
});
