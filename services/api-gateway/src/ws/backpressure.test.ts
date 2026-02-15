import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArdaEvent } from '@arda/events';
import {
  BackpressureBridge,
  type BackpressureLogger,
  type LiveEmission,
  type TenantEventSource,
} from './backpressure.js';

vi.mock('@arda/config', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

interface MockEventSource {
  source: TenantEventSource;
  emitToTenant: (tenantId: string, event: ArdaEvent) => void;
}

function createMockEventSource(): MockEventSource {
  const handlers = new Map<string, (event: ArdaEvent) => void>();

  return {
    source: {
      subscribeTenant: vi.fn(async (tenantId: string, handler: (event: ArdaEvent) => void) => {
        handlers.set(tenantId, handler);
      }),
      unsubscribeTenant: vi.fn(async (tenantId: string) => {
        handlers.delete(tenantId);
      }),
    },
    emitToTenant: (tenantId: string, event: ArdaEvent) => {
      const handler = handlers.get(tenantId);
      if (!handler) {
        throw new Error(`No handler for tenant ${tenantId}`);
      }
      handler(event);
    },
  };
}

function cardTransitionEvent(cardId: string): ArdaEvent {
  return {
    type: 'card.transition',
    tenantId: 'tenant-1',
    cardId,
    loopId: 'loop-1',
    fromStage: 'created',
    toStage: 'ordered',
    method: 'scan',
    timestamp: '2026-02-15T00:00:00.000Z',
  } as ArdaEvent;
}

function inventoryUpdatedEvent(quantity: number): ArdaEvent {
  return {
    type: 'inventory:updated',
    tenantId: 'tenant-1',
    facilityId: 'fac-1',
    partId: 'part-1',
    field: 'qtyOnHand',
    adjustmentType: 'increment',
    quantity,
    previousValue: 10,
    newValue: 10 + quantity,
    timestamp: '2026-02-15T00:00:00.000Z',
  } as ArdaEvent;
}

describe('BackpressureBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits backpressure_warning when per-client buffer overflows', async () => {
    const { source, emitToTenant } = createMockEventSource();
    const logger: BackpressureLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };
    const bridge = new BackpressureBridge(source, {
      clientBufferMax: 3,
      tenantRateLimitPerSecond: 1000,
      batchWindowMs: 1000,
      logger,
    });
    const emissions: LiveEmission[] = [];

    const detach = await bridge.attachSubscriber('tenant-1', {
      id: 'socket-1',
      emit: (emission) => emissions.push(emission),
    });

    emitToTenant('tenant-1', cardTransitionEvent('card-1'));
    emitToTenant('tenant-1', cardTransitionEvent('card-2'));
    emitToTenant('tenant-1', cardTransitionEvent('card-3'));
    emitToTenant('tenant-1', cardTransitionEvent('card-4'));

    vi.runOnlyPendingTimers();

    expect(emissions).toContainEqual({
      eventName: 'backpressure_warning',
      payload: expect.objectContaining({
        tenantId: 'tenant-1',
        droppedCount: 1,
        maxBufferSize: 3,
      }),
    });

    await detach();
    await bridge.shutdown();
  });

  it('enforces tenant bridge rate limits and queues overflow by dropping oldest', async () => {
    const { source, emitToTenant } = createMockEventSource();
    const logger: BackpressureLogger = {
      warn: vi.fn(),
      error: vi.fn(),
    };
    const bridge = new BackpressureBridge(source, {
      tenantRateLimitPerSecond: 1,
      tenantQueueMax: 2,
      batchWindowMs: 1,
      logger,
    });
    const emissions: LiveEmission[] = [];

    const detach = await bridge.attachSubscriber('tenant-1', {
      id: 'socket-1',
      emit: (emission) => emissions.push(emission),
    });

    emitToTenant('tenant-1', cardTransitionEvent('card-1'));
    emitToTenant('tenant-1', cardTransitionEvent('card-2'));
    emitToTenant('tenant-1', cardTransitionEvent('card-3'));
    emitToTenant('tenant-1', cardTransitionEvent('card-4'));

    vi.advanceTimersByTime(2_100);

    expect(logger.warn).toHaveBeenCalled();
    const forwardedCardIds = emissions
      .filter((emission) => emission.eventName === 'card:stage_changed')
      .map((emission) => (emission.payload as { payload: { cardId: string } }).payload.cardId);
    expect(forwardedCardIds).toEqual(['card-3', 'card-4']);

    await detach();
    await bridge.shutdown();
  });

  it('emits burst events as event_batch payloads inside the batch window', async () => {
    const { source, emitToTenant } = createMockEventSource();
    const bridge = new BackpressureBridge(source, {
      tenantRateLimitPerSecond: 1000,
      batchWindowMs: 50,
    });
    const emissions: LiveEmission[] = [];

    const detach = await bridge.attachSubscriber('tenant-1', {
      id: 'socket-1',
      emit: (emission) => emissions.push(emission),
    });

    emitToTenant('tenant-1', cardTransitionEvent('card-1'));
    emitToTenant('tenant-1', cardTransitionEvent('card-2'));

    vi.runOnlyPendingTimers();
    vi.advanceTimersByTime(50);

    expect(emissions).toContainEqual({
      eventName: 'event_batch',
      payload: expect.objectContaining({
        tenantId: 'tenant-1',
        count: 2,
      }),
    });

    await detach();
    await bridge.shutdown();
  });

  it('debounces high-frequency inventory updates and forwards only the latest by key', async () => {
    const { source, emitToTenant } = createMockEventSource();
    const bridge = new BackpressureBridge(source, {
      tenantRateLimitPerSecond: 1000,
      debounceWindowMs: 500,
      batchWindowMs: 10,
    });
    const emissions: LiveEmission[] = [];

    const detach = await bridge.attachSubscriber('tenant-1', {
      id: 'socket-1',
      emit: (emission) => emissions.push(emission),
    });

    emitToTenant('tenant-1', inventoryUpdatedEvent(1));
    emitToTenant('tenant-1', inventoryUpdatedEvent(7));

    vi.runOnlyPendingTimers();
    vi.advanceTimersByTime(499);
    expect(emissions).toHaveLength(0);

    vi.advanceTimersByTime(1);
    vi.advanceTimersByTime(10);

    const inventoryEvents = emissions.filter((emission) => emission.eventName === 'inventory:updated');
    expect(inventoryEvents).toHaveLength(1);
    expect((inventoryEvents[0].payload as { payload: { quantity: number } }).payload.quantity).toBe(7);

    await detach();
    await bridge.shutdown();
  });
});
