import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  selectResults: [] as unknown[],
}));

const { publishMock, getEventBusMock } = vi.hoisted(() => {
  const publishMock = vi.fn(async () => undefined);
  const getEventBusMock = vi.fn(() => ({ publish: publishMock }));
  return { publishMock, getEventBusMock };
});

const schemaMock = vi.hoisted(() => {
  const table = (name: string) => ({ __table: name } as const);
  return {
    kanbanCards: table('kanban_cards'),
    kanbanLoops: table('kanban_loops'),
    cardStageTransitions: table('card_stage_transitions'),
    auditLog: table('audit_log'),
    purchaseOrders: table('purchase_orders'),
    purchaseOrderLines: table('purchase_order_lines'),
    workOrders: table('work_orders'),
    workOrderRoutings: table('work_order_routings'),
    transferOrders: table('transfer_orders'),
    transferOrderLines: table('transfer_order_lines'),
    loopTypeEnum: {
      enumValues: ['procurement', 'production', 'transfer'] as const,
    },
  };
});

const { dbMock, resetDbMocks } = vi.hoisted(() => {
  function makeSelectBuilder(result: unknown) {
    const builder: any = {};
    builder.from = () => builder;
    builder.innerJoin = () => builder;
    builder.where = () => builder;
    builder.orderBy = () => builder;
    builder.groupBy = () => builder;
    builder.limit = () => builder;
    builder.offset = () => builder;
    builder.execute = async () => result;
    return builder;
  }

  const dbMock = {
    select: vi.fn(() => makeSelectBuilder(testState.selectResults.shift() ?? [])),
    execute: vi.fn(async () => testState.selectResults.shift() ?? []),
    transaction: vi.fn(),
  };

  const resetDbMocks = () => {
    dbMock.select.mockClear();
    dbMock.execute.mockClear();
    dbMock.transaction.mockClear();
  };

  return { dbMock, resetDbMocks };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
}));

vi.mock('@arda/db', () => ({
  db: dbMock,
  schema: schemaMock,
  writeAuditEntry: vi.fn(async () => ({ id: 'audit-1', hashChain: 'test-hash', sequenceNumber: 1 })),
  writeAuditEntries: vi.fn(async () => []),
}));

vi.mock('@arda/events', () => ({
  getEventBus: getEventBusMock,
}));

vi.mock('@arda/config', () => ({
  config: { REDIS_URL: 'redis://localhost:6379' },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../services/order-number.service.js', () => ({
  getNextPONumber: vi.fn(),
  getNextWONumber: vi.fn(),
  getNextTONumber: vi.fn(),
}));

vi.mock('../services/card-lifecycle.service.js', () => ({
  transitionTriggeredCardToOrdered: vi.fn(),
}));

import { orderQueueRouter } from './order-queue.routes.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = {
      tenantId: 'tenant-1',
      sub: 'user-1',
    };
    next();
  });
  app.use('/queue', orderQueueRouter);
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err?.statusCode ?? 500).json({ error: err?.message ?? 'Internal server error' });
  });
  return app;
}

async function getJson(
  app: express.Express,
  path: string
): Promise<{ status: number; body: Record<string, any> }> {
  const server = app.listen(0);
  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start test server');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    const json = (await response.json()) as Record<string, any>;
    return { status: response.status, body: json };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('queue risk scan endpoint', () => {
  beforeEach(() => {
    testState.selectResults = [];
    resetDbMocks();
    publishMock.mockReset();
    getEventBusMock.mockClear();
  });

  it('returns detected risks and emits queue.risk_detected events by default', async () => {
    testState.selectResults = [
      [
        {
          card_id: 'card-1',
          loop_id: 'loop-1',
          current_stage_entered_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
          loop_type: 'procurement',
          part_id: 'part-1',
          facility_id: 'facility-1',
          min_quantity: 10,
          order_quantity: 10,
          stated_lead_time_days: 2,
          safety_stock_days: '0',
          trigger_count: 6,
        },
      ],
    ];

    const app = createApp();
    const response = await getJson(app, '/queue/risk-scan');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totalTriggeredCards).toBe(1);
    expect(response.body.data.totalRisks).toBe(1);
    expect(response.body.data.byRiskLevel).toEqual({ medium: 0, high: 1 });
    expect(response.body.data.emittedRiskEvents).toBe(1);
    expect(response.body.data.risks[0]).toEqual(
      expect.objectContaining({
        cardId: 'card-1',
        loopId: 'loop-1',
        loopType: 'procurement',
        riskLevel: 'high',
      })
    );
    expect(publishMock).toHaveBeenCalledTimes(1);
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'queue.risk_detected',
        tenantId: 'tenant-1',
        queueType: 'procurement',
        cardId: 'card-1',
        riskLevel: 'high',
      })
    );
  });

  it('supports disabling event emission via emitEvents=false', async () => {
    testState.selectResults = [
      [
        {
          card_id: 'card-2',
          loop_id: 'loop-2',
          current_stage_entered_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          loop_type: 'transfer',
          part_id: 'part-2',
          facility_id: 'facility-2',
          min_quantity: 6,
          order_quantity: 12,
          stated_lead_time_days: 1,
          safety_stock_days: '0',
          trigger_count: 5,
        },
      ],
    ];

    const app = createApp();
    const response = await getJson(app, '/queue/risk-scan?emitEvents=false');

    expect(response.status).toBe(200);
    expect(response.body.data.totalRisks).toBe(1);
    expect(response.body.data.emittedRiskEvents).toBe(0);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('filters out medium risks when minRiskLevel=high', async () => {
    testState.selectResults = [
      [
        {
          card_id: 'card-3',
          loop_id: 'loop-3',
          current_stage_entered_at: new Date(Date.now() - 36 * 60 * 60 * 1000),
          loop_type: 'production',
          part_id: 'part-3',
          facility_id: 'facility-3',
          min_quantity: 20,
          order_quantity: 20,
          stated_lead_time_days: 2,
          safety_stock_days: '0',
          trigger_count: 0,
        },
      ],
    ];

    const app = createApp();
    const response = await getJson(app, '/queue/risk-scan?minRiskLevel=high&emitEvents=false');

    expect(response.status).toBe(200);
    expect(response.body.data.totalTriggeredCards).toBe(1);
    expect(response.body.data.totalRisks).toBe(0);
    expect(response.body.data.byRiskLevel).toEqual({ medium: 0, high: 0 });
    expect(response.body.data.risks).toEqual([]);
    expect(publishMock).not.toHaveBeenCalled();
  });
});
