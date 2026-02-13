/**
 * Integration tests for service-level audit refactor (Ticket #253)
 *
 * Validates receiving.service and work-order-orchestration.service use
 * writeAuditEntry() with correct action names and system-initiated metadata.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntryInput } from '@arda/db';

// ─── Mocks (hoisted) ────────────────────────────────────────────────

const { writeAuditEntryMock, auditCalls } = vi.hoisted(() => {
  const auditCalls: AuditEntryInput[] = [];
  const writeAuditEntryMock = vi.fn(async (_dbOrTx: unknown, entry: AuditEntryInput) => {
    auditCalls.push(entry);
    return { id: `audit-${auditCalls.length}`, hashChain: 'test-hash', sequenceNumber: auditCalls.length };
  });
  return { writeAuditEntryMock, auditCalls };
});

const schemaMock = vi.hoisted(() => {
  const table = (name: string) => ({ __table: name } as const);
  return {
    receipts: table('receipts'),
    receiptLines: table('receipt_lines'),
    receivingExceptions: table('receiving_exceptions'),
    purchaseOrders: table('purchase_orders'),
    purchaseOrderLines: table('purchase_order_lines'),
    transferOrders: table('transfer_orders'),
    transferOrderLines: table('transfer_order_lines'),
    workOrders: table('work_orders'),
    workOrderRoutings: table('work_order_routings'),
    kanbanCards: table('kanban_cards'),
    kanbanLoops: table('kanban_loops'),
    cardStageTransitions: table('card_stage_transitions'),
    productionQueueEntries: table('production_queue_entries'),
    routingTemplates: table('routing_templates'),
  };
});

const { dbMock } = vi.hoisted(() => {
  function queryResult<T>(result: T) {
    return {
      execute: async () => result,
      then: (
        resolve: (value: T) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
      returning: async () => result,
    };
  }

  function makeSelectBuilder(result: unknown) {
    const builder: any = {};
    builder.from = () => builder;
    builder.where = () => builder;
    builder.limit = () => builder;
    builder.orderBy = () => builder;
    builder.execute = async () => result;
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  }

  function makeUpdateBuilder() {
    const query: any = {};
    query.set = () => query;
    query.where = () => query;
    query.execute = async () => undefined;
    query.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject);
    query.returning = async () => [];
    return query;
  }

  function makeTx() {
    const tx: any = {};
    tx.select = vi.fn((..._args: unknown[]) => makeSelectBuilder([]));
    tx.update = vi.fn(() => makeUpdateBuilder());
    tx.execute = vi.fn(async () => undefined);
    tx.insert = vi.fn((_table: unknown) => ({
      values: (values: unknown) => {
        const rows = Array.isArray(values) ? values : [values];
        const tableName = (_table as { __table?: string }).__table;

        if (tableName === 'receipts') {
          const row = rows[0] as Record<string, unknown>;
          return queryResult([{
            id: 'rcv-1',
            tenantId: row.tenantId,
            receiptNumber: row.receiptNumber ?? 'RCV-20260212-0001',
            orderId: row.orderId,
            orderType: row.orderType,
            status: row.status ?? 'complete',
            createdAt: new Date(),
          }]);
        }

        if (tableName === 'receipt_lines') {
          return queryResult(rows.map((row: any, index: number) => ({
            id: `rl-${index + 1}`,
            ...row,
          })));
        }

        if (tableName === 'receiving_exceptions') {
          return queryResult(rows.map((row: any, index: number) => ({
            id: `exc-${index + 1}`,
            ...row,
          })));
        }

        return queryResult([]);
      },
    }));
    return tx;
  }

  const dbMock = {
    transaction: vi.fn(async (callback: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      callback(makeTx())
    ),
    select: vi.fn((..._args: unknown[]) => makeSelectBuilder([])),
    update: vi.fn(() => makeUpdateBuilder()),
    insert: vi.fn(() => ({
      values: () => queryResult([]),
    })),
    execute: vi.fn(async () => undefined),
  };

  return { dbMock };
});

const { publishMock, getEventBusMock } = vi.hoisted(() => {
  const publishMock = vi.fn(async () => undefined);
  const getEventBusMock = vi.fn(() => ({ publish: publishMock }));
  return { publishMock, getEventBusMock };
});

// ─── Module Mocks ────────────────────────────────────────────────────

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}));

vi.mock('@arda/db', () => ({
  db: dbMock,
  schema: schemaMock,
  writeAuditEntry: writeAuditEntryMock,
}));

vi.mock('@arda/events', () => ({
  getEventBus: getEventBusMock,
}));

vi.mock('@arda/config', () => ({
  config: { REDIS_URL: 'redis://localhost:6379' },
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Import after mocks ─────────────────────────────────────────────

import { processReceipt, resolveException } from './receiving.service.js';

// ─── Tests ───────────────────────────────────────────────────────────

describe('Receiving Service Audit — writeAuditEntry integration', () => {
  beforeEach(() => {
    auditCalls.length = 0;
    writeAuditEntryMock.mockClear();
    publishMock.mockClear();
  });

  describe('processReceipt', () => {
    it('calls writeAuditEntry with receipt.created action', async () => {
      await processReceipt({
        tenantId: 'tenant-1',
        orderId: 'po-1',
        orderType: 'purchase_order',
        receivedByUserId: 'user-1',
        lines: [
          {
            orderLineId: 'pol-1',
            partId: 'part-1',
            quantityExpected: 10,
            quantityAccepted: 10,
            quantityDamaged: 0,
            quantityRejected: 0,
          },
        ],
      });

      const receiptAudit = auditCalls.find((c) => c.action === 'receipt.created');
      expect(receiptAudit).toBeDefined();
      expect(receiptAudit?.tenantId).toBe('tenant-1');
      expect(receiptAudit?.userId).toBe('user-1');
      expect(receiptAudit?.entityType).toBe('receipt');
      expect(receiptAudit?.previousState).toBeNull();
      expect(receiptAudit?.newState).toMatchObject({
        receiptNumber: expect.any(String),
        lineCount: 1,
      });
      expect(receiptAudit?.metadata).toMatchObject({
        orderId: 'po-1',
        orderType: 'purchase_order',
      });
    });

    it('sets systemActor metadata when no receivedByUserId', async () => {
      await processReceipt({
        tenantId: 'tenant-1',
        orderId: 'po-1',
        orderType: 'purchase_order',
        lines: [
          {
            orderLineId: 'pol-1',
            partId: 'part-1',
            quantityExpected: 10,
            quantityAccepted: 10,
            quantityDamaged: 0,
            quantityRejected: 0,
          },
        ],
      });

      const receiptAudit = auditCalls.find((c) => c.action === 'receipt.created');
      expect(receiptAudit).toBeDefined();
      expect(receiptAudit?.userId).toBeNull();
      expect(receiptAudit?.metadata).toMatchObject({
        systemActor: 'receiving_service',
      });
    });
  });

  describe('resolveException', () => {
    it('calls writeAuditEntry with receipt.exception_resolved action', async () => {
      // Mock the exception select to return an existing open exception
      dbMock.transaction.mockImplementationOnce(async (callback: any) => {
        const tx: any = {};
        tx.select = vi.fn(() => ({
          from: () => ({
            where: () =>
              Promise.resolve([
                {
                  id: 'exc-1',
                  tenantId: 'tenant-1',
                  status: 'open',
                  receiptId: 'rcv-1',
                  orderId: 'po-1',
                  exceptionType: 'short_shipment',
                },
              ]),
          }),
        }));
        tx.update = vi.fn(() => ({
          set: () => ({
            where: () => ({
              returning: async () => [
                {
                  id: 'exc-1',
                  status: 'resolved',
                  resolutionType: 'accept_as_is',
                },
              ],
            }),
          }),
        }));
        return callback(tx);
      });

      await resolveException({
        tenantId: 'tenant-1',
        exceptionId: 'exc-1',
        resolutionType: 'accept_as_is',
        resolutionNotes: 'Accepted',
        resolvedByUserId: 'user-1',
      });

      const resolveAudit = auditCalls.find((c) => c.action === 'receipt.exception_resolved');
      expect(resolveAudit).toBeDefined();
      expect(resolveAudit?.entityType).toBe('receiving_exception');
      expect(resolveAudit?.entityId).toBe('exc-1');
      expect(resolveAudit?.previousState).toMatchObject({ status: 'open' });
      expect(resolveAudit?.newState).toMatchObject({
        status: 'resolved',
        resolutionType: 'accept_as_is',
      });
    });
  });
});
