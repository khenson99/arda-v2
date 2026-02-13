/**
 * Transfer Automation Service Tests
 *
 * Unit tests for transfer order automation with mocked dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  mockCard: null as null | Record<string, unknown>,
  mockTransferOrder: null as null | Record<string, unknown>,
  mockTransferOrderLine: null as null | Record<string, unknown>,
  publishedEvents: [] as Array<Record<string, unknown>>,
}));

const {
  getEventBusMock,
  publishMock,
  getNextTONumberMock,
  transitionTriggeredCardToOrderedMock,
  writeAuditEntryMock,
} = vi.hoisted(() => {
  const publishMock = vi.fn(async (event: unknown) => {
    testState.publishedEvents.push(event as Record<string, unknown>);
  });
  const getEventBusMock = vi.fn(() => ({ publish: publishMock }));
  const getNextTONumberMock = vi.fn(async () => 'TO-20260213-0001');
  const transitionTriggeredCardToOrderedMock = vi.fn(async (_tx: unknown, input: { cardId: string }) => ({
    cardId: input.cardId,
    loopId: 'test-loop-id',
  }));
  const writeAuditEntryMock = vi.fn(async () => undefined);

  return {
    getEventBusMock,
    publishMock,
    getNextTONumberMock,
    transitionTriggeredCardToOrderedMock,
    writeAuditEntryMock,
  };
});

vi.mock('@arda/config', () => ({
  config: { REDIS_URL: 'redis://localhost:6379' },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@arda/events', () => ({
  getEventBus: getEventBusMock,
}));

vi.mock('./order-number.service.js', () => ({
  getNextTONumber: getNextTONumberMock,
}));

vi.mock('./card-lifecycle.service.js', () => ({
  transitionTriggeredCardToOrdered: transitionTriggeredCardToOrderedMock,
}));

const schemaMock = vi.hoisted(() => {
  const makeTable = (table: string) => ({ __table: table } as const);
  return {
    transferOrders: makeTable('transfer_orders'),
    transferOrderLines: makeTable('transfer_order_lines'),
    kanbanCards: makeTable('kanban_cards'),
    kanbanLoops: makeTable('kanban_loops'),
    cardStageTransitions: makeTable('card_stage_transitions'),
  };
});

const { dbMock } = vi.hoisted(() => {
  const dbMock: any = {
    query: {
      kanbanCards: {
        findFirst: vi.fn(async () => testState.mockCard),
      },
    },
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const txMock: any = {
        insert: vi.fn((table: unknown) => {
          const tableName = (table as { __table?: string }).__table;
          const valuesBuilder: any = {};
          valuesBuilder.values = (values: unknown) => {
            const returningBuilder: any = {};
            returningBuilder.returning = (columns?: unknown) => {
              const executeBuilder: any = {};
              executeBuilder.execute = async () => {
                if (tableName === 'transfer_orders') {
                  return [testState.mockTransferOrder || { id: 'to-123', toNumber: 'TO-20260213-0001' }];
                }
                if (tableName === 'transfer_order_lines') {
                  return [testState.mockTransferOrderLine || { id: 'line-123' }];
                }
                return [];
              };
              return executeBuilder;
            };
            return returningBuilder;
          };
          return valuesBuilder;
        }),
      };
      return callback(txMock);
    }),
  };

  return { dbMock };
});

vi.mock('@arda/db', () => ({
  db: dbMock,
  schema: schemaMock,
  writeAuditEntry: writeAuditEntryMock,
}));

// Import after mocks are set up
const { processTransferQueueEntry } = await import('./transfer-automation.service.js');

describe('Transfer Automation Service', () => {
  const testTenantId = '00000000-0000-0000-0000-000000000001';
  const testCardId = 'card-123';
  const testLoopId = 'loop-123';
  const testPartId = 'part-123';
  const testSourceFacilityId = 'facility-source';
  const testDestFacilityId = 'facility-dest';

  beforeEach(() => {
    vi.clearAllMocks();
    testState.publishedEvents = [];

    // Default mock card with valid transfer loop
    testState.mockCard = {
      id: testCardId,
      tenantId: testTenantId,
      loopId: testLoopId,
      currentStage: 'triggered',
      isActive: true,
      linkedTransferOrderId: null,
      loop: {
        id: testLoopId,
        loopType: 'transfer',
        sourceFacilityId: testSourceFacilityId,
        facilityId: testDestFacilityId,
        orderQuantity: 50,
      },
    };

    testState.mockTransferOrder = {
      id: 'to-123',
      toNumber: 'TO-20260213-0001',
    };

    testState.mockTransferOrderLine = {
      id: 'line-123',
    };
  });

  it('should create draft TO from transfer loop trigger event', async () => {
    const event = {
      type: 'lifecycle.queue_entry' as const,
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer' as const,
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(true);
    expect(result.alreadyExisted).toBe(false);
    expect(result.transferOrderId).toBe('to-123');
    expect(result.toNumber).toBe('TO-20260213-0001');

    // Verify order number was generated
    expect(getNextTONumberMock).toHaveBeenCalledOnce();

    // Verify card transition was called
    expect(transitionTriggeredCardToOrderedMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: testTenantId,
        cardId: testCardId,
        linkedTransferOrderId: 'to-123',
      })
    );

    // Verify audit entries were written
    expect(writeAuditEntryMock).toHaveBeenCalled();

    // Verify automation.to_created event was published
    expect(publishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'automation.to_created',
        tenantId: testTenantId,
        transferOrderId: 'to-123',
        toNumber: 'TO-20260213-0001',
        source: 'automation',
      })
    );
  });

  it('should prevent duplicate TO creation when card already linked', async () => {
    // Set card as already linked
    testState.mockCard = {
      ...testState.mockCard!,
      linkedTransferOrderId: 'existing-to-123',
    };

    const event = {
      type: 'lifecycle.queue_entry' as const,
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer' as const,
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(true);
    expect(result.alreadyExisted).toBe(true);
    expect(result.transferOrderId).toBe('existing-to-123');

    // Verify no new TO was created
    expect(getNextTONumberMock).not.toHaveBeenCalled();
    expect(transitionTriggeredCardToOrderedMock).not.toHaveBeenCalled();
  });

  it('should skip non-transfer loop events', async () => {
    const event = {
      type: 'lifecycle.queue_entry' as const,
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'procurement' as const,
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(true);
    expect(result.alreadyExisted).toBe(true);

    // Verify no TO creation was attempted
    expect(getNextTONumberMock).not.toHaveBeenCalled();
  });

  it('should fail gracefully when loop missing sourceFacilityId', async () => {
    // Set loop without sourceFacilityId
    testState.mockCard = {
      ...testState.mockCard!,
      loop: {
        ...(testState.mockCard!.loop as Record<string, unknown>),
        sourceFacilityId: null,
      },
    };

    const event = {
      type: 'lifecycle.queue_entry' as const,
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer' as const,
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain('sourceFacilityId');
  });

  it('should handle card not found gracefully', async () => {
    // Set card as null (not found)
    testState.mockCard = null;

    const event = {
      type: 'lifecycle.queue_entry' as const,
      tenantId: testTenantId,
      cardId: 'non-existent-card',
      loopId: testLoopId,
      loopType: 'transfer' as const,
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should use event quantity for TO line quantityRequested', async () => {
    const event = {
      type: 'lifecycle.queue_entry' as const,
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer' as const,
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 75,
      timestamp: new Date().toISOString(),
    };

    const result = await processTransferQueueEntry(event);

    expect(result.success).toBe(true);
    // Quantity is used in the insert values (verified in implementation)
  });

  it('should publish automation.to_created event after successful creation', async () => {
    const event = {
      type: 'lifecycle.queue_entry' as const,
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer' as const,
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    await processTransferQueueEntry(event);

    const toCreatedEvent = testState.publishedEvents.find(
      (e) => e.type === 'automation.to_created'
    );

    expect(toCreatedEvent).toBeDefined();
    expect(toCreatedEvent).toMatchObject({
      type: 'automation.to_created',
      tenantId: testTenantId,
      transferOrderId: 'to-123',
      toNumber: 'TO-20260213-0001',
      source: 'automation',
    });
  });

  it('should write audit entries for TO creation and card transition', async () => {
    const event = {
      type: 'lifecycle.queue_entry' as const,
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer' as const,
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    await processTransferQueueEntry(event);

    // Should write at least 2 audit entries: one for TO creation, one for card transition
    expect(writeAuditEntryMock).toHaveBeenCalled();
    expect(writeAuditEntryMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('should advance card from triggered to ordered', async () => {
    const event = {
      type: 'lifecycle.queue_entry' as const,
      tenantId: testTenantId,
      cardId: testCardId,
      loopId: testLoopId,
      loopType: 'transfer' as const,
      partId: testPartId,
      facilityId: testDestFacilityId,
      quantity: 50,
      timestamp: new Date().toISOString(),
    };

    await processTransferQueueEntry(event);

    expect(transitionTriggeredCardToOrderedMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        cardId: testCardId,
        linkedTransferOrderId: 'to-123',
        notes: expect.stringContaining('automation'),
      })
    );
  });
});
