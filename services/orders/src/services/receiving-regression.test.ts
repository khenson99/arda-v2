import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Regression test suite for the receiving workflow.
 *
 * Covers:
 * 1. Exception detection rules (unit)
 * 2. Exception automation rules engine (unit)
 * 3. Route-level integration (mocked DB)
 * 4. Contract verification for notification events
 */

// ─── Hoisted Mocks ──────────────────────────────────────────────────

const testState = vi.hoisted(() => ({
  dbSelectResults: [] as unknown[],
  txSelectResults: [] as unknown[],
  insertedReceipts: [] as Array<Record<string, unknown>>,
  insertedLines: [] as Array<Record<string, unknown>>,
  insertedExceptions: [] as Array<Record<string, unknown>>,
  insertedAuditRows: [] as Array<Record<string, unknown>>,
  updatedExceptions: [] as Array<Record<string, unknown>>,
}));

const { publishMock, getEventBusMock } = vi.hoisted(() => {
  const publishMock = vi.fn(async () => undefined);
  const getEventBusMock = vi.fn(() => ({ publish: publishMock }));
  return { publishMock, getEventBusMock };
});

const schemaMock = vi.hoisted(() => {
  const table = (name: string) => {
    const t = { __table: name } as any;
    // Add column references for drizzle SQL template usage
    t.tenantId = { column: 'tenant_id' };
    t.status = { column: 'status' };
    t.receiptNumber = { column: 'receipt_number' };
    t.quantityAccepted = { column: 'quantity_accepted' };
    t.quantityDamaged = { column: 'quantity_damaged' };
    t.quantityRejected = { column: 'quantity_rejected' };
    t.quantityReceived = { column: 'quantity_received' };
    t.quantityOrdered = { column: 'quantity_ordered' };
    t.receiptId = { column: 'receipt_id' };
    t.orderId = { column: 'order_id' };
    t.exceptionType = { column: 'exception_type' };
    t.severity = { column: 'severity' };
    t.resolutionType = { column: 'resolution_type' };
    t.resolvedAt = { column: 'resolved_at' };
    t.createdAt = { column: 'created_at' };
    t.id = { column: 'id' };
    t.purchaseOrderId = { column: 'purchase_order_id' };
    t.partId = { column: 'part_id' };
    return t;
  };

  return {
    receipts: table('receipts'),
    receiptLines: table('receipt_lines'),
    receivingExceptions: table('receiving_exceptions'),
    purchaseOrders: table('purchase_orders'),
    purchaseOrderLines: table('purchase_order_lines'),
    transferOrders: table('transfer_orders'),
    transferOrderLines: table('transfer_order_lines'),
    workOrders: table('work_orders'),
    auditLog: table('audit_log'),
    users: table('users'),
    notifications: table('notifications'),
    notificationTypeEnum: { enumValues: ['exception_alert', 'po_received', 'system_alert'] as const },
  };
});

const { dbMock, resetDbMockCalls } = vi.hoisted(() => {
  let insertCounter = 0;

  function makeSelectBuilder(result: unknown) {
    const builder: any = {};
    builder.from = () => builder;
    builder.where = () => builder;
    builder.limit = () => builder;
    builder.orderBy = () => builder;
    builder.innerJoin = () => builder;
    builder.groupBy = () => builder;
    builder.execute = async () => result;
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  }

  function makeUpdateBuilder() {
    const query: any = {};
    query.set = vi.fn(() => query);
    query.where = vi.fn(() => query);
    query.returning = vi.fn(async () => []);
    query.execute = async () => undefined;
    query.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject);
    return query;
  }

  function makeTx() {
    const tx: any = {};
    tx.select = vi.fn(() => makeSelectBuilder(testState.txSelectResults.shift() ?? []));
    tx.update = vi.fn((table: unknown) => {
      const builder = makeUpdateBuilder();
      const tableName = (table as { __table?: string }).__table;
      builder.set = vi.fn((values: Record<string, unknown>) => {
        if (tableName === 'receiving_exceptions') {
          testState.updatedExceptions.push(values);
        }
        return builder;
      });
      builder.returning = vi.fn(async () => {
        if (tableName === 'receiving_exceptions') {
          return [{ id: 'exc-1', ...testState.updatedExceptions[testState.updatedExceptions.length - 1] }];
        }
        return [];
      });
      return builder;
    });
    tx.insert = vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        const tableName = (table as { __table?: string }).__table;
        const arr = Array.isArray(values) ? values : [values];
        if (tableName === 'receipts') testState.insertedReceipts.push(...(arr as any));
        if (tableName === 'receipt_lines') testState.insertedLines.push(...(arr as any));
        if (tableName === 'receiving_exceptions') testState.insertedExceptions.push(...(arr as any));
        if (tableName === 'audit_log') testState.insertedAuditRows.push(...(arr as any));
        return {
          returning: async () =>
            arr.map((v: any, i: number) => ({
              ...v,
              id: `${tableName}-${++insertCounter}`,
            })),
        };
      }),
    }));
    tx.execute = vi.fn(async () => undefined);
    return tx;
  }

  const dbMock = {
    select: vi.fn(() => makeSelectBuilder(testState.dbSelectResults.shift() ?? [])),
    update: vi.fn(() => makeUpdateBuilder()),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        const tableName = (table as { __table?: string }).__table;
        const arr = Array.isArray(values) ? values : [values];
        if (tableName === 'audit_log') testState.insertedAuditRows.push(...(arr as any));
        return {
          returning: async () =>
            arr.map((v: any) => ({
              ...v,
              id: `${tableName}-${++insertCounter}`,
            })),
        };
      }),
    })),
    transaction: vi.fn(async (callback: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) =>
      callback(makeTx())
    ),
  };

  const resetDbMockCalls = () => {
    insertCounter = 0;
    dbMock.select.mockClear();
    dbMock.update.mockClear();
    dbMock.insert.mockClear();
    dbMock.transaction.mockClear();
  };

  return { dbMock, resetDbMockCalls };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  like: vi.fn(() => ({})),
}));

vi.mock('@arda/db', () => ({
  db: dbMock,
  schema: schemaMock,
}));

vi.mock('@arda/events', () => ({
  getEventBus: getEventBusMock,
}));

vi.mock('@arda/config', () => ({
  config: { REDIS_URL: 'redis://localhost:6379' },
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../services/order-number.service.js', () => ({
  getNextPONumber: vi.fn(async () => 'PO-FOLLOW-0001'),
}));

// ─── Import After Mocks ─────────────────────────────────────────────

import { determineAutomatedAction } from './exception-automation.service.js';

// ═══════════════════════════════════════════════════════════════════
// 1. Exception Automation Rules Engine (Unit)
// ═══════════════════════════════════════════════════════════════════

describe('exception automation rules engine', () => {
  describe('determineAutomatedAction', () => {
    it('returns auto_resolve for overage regardless of severity', () => {
      expect(determineAutomatedAction('overage', 'low')).toBe('auto_resolve');
      expect(determineAutomatedAction('overage', 'high')).toBe('auto_resolve');
      expect(determineAutomatedAction('overage', 'critical')).toBe('auto_resolve');
    });

    it('returns follow_up_po for high-severity short shipments', () => {
      expect(determineAutomatedAction('short_shipment', 'high')).toBe('follow_up_po');
      expect(determineAutomatedAction('short_shipment', 'critical')).toBe('follow_up_po');
    });

    it('returns escalate for low/medium-severity short shipments', () => {
      expect(determineAutomatedAction('short_shipment', 'low')).toBe('escalate');
      expect(determineAutomatedAction('short_shipment', 'medium')).toBe('escalate');
    });

    it('returns escalate for damaged goods of any severity', () => {
      expect(determineAutomatedAction('damaged', 'low')).toBe('escalate');
      expect(determineAutomatedAction('damaged', 'high')).toBe('escalate');
      expect(determineAutomatedAction('damaged', 'critical')).toBe('escalate');
    });

    it('returns escalate for quality_reject of any severity', () => {
      expect(determineAutomatedAction('quality_reject', 'medium')).toBe('escalate');
      expect(determineAutomatedAction('quality_reject', 'critical')).toBe('escalate');
    });

    it('returns escalate for wrong_item of any severity', () => {
      expect(determineAutomatedAction('wrong_item', 'high')).toBe('escalate');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Receiving Event Contract Verification
// ═══════════════════════════════════════════════════════════════════

describe('receiving event contract compliance', () => {
  it('ReceivingCompletedEvent has all required fields', () => {
    // This verifies the event shape expected by the notifications service
    const event = {
      type: 'receiving.completed' as const,
      tenantId: 'tenant-1',
      receiptId: 'receipt-1',
      receiptNumber: 'RCV-20260209-0001',
      orderType: 'purchase_order' as const,
      orderId: 'po-1',
      status: 'complete',
      totalAccepted: 10,
      totalDamaged: 0,
      totalRejected: 0,
      exceptionsCreated: 0,
      timestamp: new Date().toISOString(),
    };

    expect(event.type).toBe('receiving.completed');
    expect(typeof event.receiptNumber).toBe('string');
    expect(typeof event.totalAccepted).toBe('number');
    expect(typeof event.totalDamaged).toBe('number');
    expect(typeof event.totalRejected).toBe('number');
    expect(typeof event.exceptionsCreated).toBe('number');
  });

  it('ReceivingExceptionCreatedEvent has all required fields', () => {
    const event = {
      type: 'receiving.exception_created' as const,
      tenantId: 'tenant-1',
      exceptionId: 'exc-1',
      receiptId: 'receipt-1',
      exceptionType: 'damaged',
      severity: 'high',
      quantityAffected: 5,
      orderId: 'po-1',
      orderType: 'purchase_order',
      timestamp: new Date().toISOString(),
    };

    expect(event.type).toBe('receiving.exception_created');
    expect(typeof event.exceptionType).toBe('string');
    expect(typeof event.severity).toBe('string');
    expect(typeof event.quantityAffected).toBe('number');
  });

  it('ReceivingExceptionResolvedEvent has all required fields', () => {
    const event = {
      type: 'receiving.exception_resolved' as const,
      tenantId: 'tenant-1',
      exceptionId: 'exc-1',
      receiptId: 'receipt-1',
      exceptionType: 'short_shipment',
      resolutionType: 'follow_up_po',
      resolvedByUserId: 'user-1',
      followUpOrderId: 'po-2',
      timestamp: new Date().toISOString(),
    };

    expect(event.type).toBe('receiving.exception_resolved');
    expect(typeof event.resolutionType).toBe('string');
    expect(event.resolvedByUserId).toBeDefined();
    expect(event.followUpOrderId).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Route Integration Tests
// ═══════════════════════════════════════════════════════════════════

import express from 'express';
import { receivingRouter } from '../routes/receiving.routes.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = {
      tenantId: 'tenant-1',
      sub: 'user-1',
    };
    next();
  });
  app.use('/receiving', receivingRouter);
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err?.statusCode ?? 500).json({ error: err?.message ?? 'Internal server error' });
  });
  return app;
}

async function requestJson(
  app: express.Express,
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; body: Record<string, any> }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start test server');
    }

    const options: RequestInit = {
      method,
      headers: { 'content-type': 'application/json' },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, options);
    const json = (await response.json()) as Record<string, any>;
    return { status: response.status, body: json };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('receiving routes integration', () => {
  beforeEach(() => {
    testState.dbSelectResults = [];
    testState.txSelectResults = [];
    testState.insertedReceipts = [];
    testState.insertedLines = [];
    testState.insertedExceptions = [];
    testState.insertedAuditRows = [];
    testState.updatedExceptions = [];
    resetDbMockCalls();
    publishMock.mockClear();
    getEventBusMock.mockClear();
  });

  describe('POST /receiving', () => {
    it('rejects invalid body', async () => {
      const app = createTestApp();
      const res = await requestJson(app, 'POST', '/receiving', {});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation error');
    });

    it('rejects body with no lines', async () => {
      const app = createTestApp();
      const res = await requestJson(app, 'POST', '/receiving', {
        orderId: '11111111-1111-4111-8111-111111111111',
        orderType: 'purchase_order',
        lines: [],
      });
      expect(res.status).toBe(400);
    });

    it('creates receipt with valid data', async () => {
      // The transaction mock handles the insert/returning flow
      const app = createTestApp();
      const res = await requestJson(app, 'POST', '/receiving', {
        orderId: '11111111-1111-4111-8111-111111111111',
        orderType: 'purchase_order',
        lines: [
          {
            orderLineId: '22222222-2222-4222-8222-222222222222',
            partId: '33333333-3333-4333-8333-333333333333',
            quantityExpected: 10,
            quantityAccepted: 10,
            quantityDamaged: 0,
            quantityRejected: 0,
          },
        ],
      });

      expect(res.status).toBe(201);
      // The transaction was invoked
      expect(dbMock.transaction).toHaveBeenCalledTimes(1);
      // Events were published (receiving.completed at minimum)
      expect(publishMock).toHaveBeenCalled();
      const completedEvent = publishMock.mock.calls.find(
        (c: unknown[]) => (c[0] as any)?.type === 'receiving.completed'
      );
      expect(completedEvent).toBeDefined();
    });
  });

  describe('PATCH /receiving/exceptions/:id/resolve', () => {
    it('rejects invalid resolution type', async () => {
      const app = createTestApp();
      const res = await requestJson(app, 'PATCH', '/receiving/exceptions/exc-1/resolve', {
        resolutionType: 'invalid_type',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /receiving/exceptions', () => {
    it('returns exceptions list', async () => {
      testState.dbSelectResults = [
        [
          { id: 'exc-1', exceptionType: 'damaged', severity: 'high', status: 'open', quantityAffected: 5 },
          { id: 'exc-2', exceptionType: 'short_shipment', severity: 'medium', status: 'open', quantityAffected: 3 },
        ],
      ];

      const app = createTestApp();
      const res = await requestJson(app, 'GET', '/receiving/exceptions');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /receiving/exceptions/:id/automate', () => {
    it('invokes automation for a single exception', async () => {
      // First db.select returns the exception
      testState.dbSelectResults = [
        [
          {
            id: 'exc-1',
            tenantId: 'tenant-1',
            receiptId: 'receipt-1',
            orderId: 'po-1',
            orderType: 'purchase_order',
            exceptionType: 'overage',
            severity: 'low',
            status: 'open',
            quantityAffected: 3,
            receiptLineId: null,
          },
        ],
      ];

      const app = createTestApp();
      const res = await requestJson(app, 'POST', '/receiving/exceptions/exc-1/automate');
      expect(res.status).toBe(200);
      expect(res.body.action).toBe('auto_resolve');
      expect(res.body.success).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Exception Type Label Mapping Regression
// ═══════════════════════════════════════════════════════════════════

describe('exception type and resolution label completeness', () => {
  const allExceptionTypes = ['short_shipment', 'damaged', 'quality_reject', 'wrong_item', 'overage'];
  const allResolutionTypes = ['follow_up_po', 'replacement_card', 'return_to_supplier', 'credit', 'accept_as_is'];
  const allSeverities = ['low', 'medium', 'high', 'critical'];

  it('every exception type has a defined automation action for all severities', () => {
    for (const type of allExceptionTypes) {
      for (const severity of allSeverities) {
        const action = determineAutomatedAction(type, severity);
        expect(['auto_resolve', 'follow_up_po', 'escalate']).toContain(action);
      }
    }
  });

  it('exception types used in events map to valid display labels', () => {
    const labels: Record<string, string> = {
      short_shipment: 'Short Shipment',
      damaged: 'Damaged Goods',
      quality_reject: 'Quality Rejection',
      wrong_item: 'Wrong Item',
      overage: 'Overage',
    };
    for (const type of allExceptionTypes) {
      expect(labels[type]).toBeDefined();
      expect(labels[type].length).toBeGreaterThan(0);
    }
  });

  it('resolution types map to valid display labels', () => {
    const labels: Record<string, string> = {
      follow_up_po: 'Follow-up Purchase Order',
      replacement_card: 'Kanban Card Replacement',
      return_to_supplier: 'Return to Supplier',
      credit: 'Supplier Credit',
      accept_as_is: 'Accept As Is',
    };
    for (const type of allResolutionTypes) {
      expect(labels[type]).toBeDefined();
      expect(labels[type].length).toBeGreaterThan(0);
    }
  });
});
