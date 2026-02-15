import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ArdaEvent } from '@arda/events';

vi.mock('@arda/config', () => ({
  createLogger: () => ({
    warn: vi.fn(),
  }),
}));

vi.mock('@arda/events', () => ({
  getTenantStream: (tenantId: string) => `arda:stream:${tenantId}`,
}));

import { ReplayService, type ReplayControlEmitter, type ReplayRedisClient } from './replay-service.js';

type StreamReadResult = Awaited<ReturnType<ReplayRedisClient['xread']>>;

function createRedisClient(reads: StreamReadResult[]): ReplayRedisClient & {
  xread: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
} {
  const queue = [...reads];
  const xread = vi.fn(async () => queue.shift() ?? null);
  const quit = vi.fn(async () => 'OK');

  return {
    xread,
    quit,
  };
}

function createEmitter(): {
  emitter: ReplayControlEmitter;
  emitEvent: ReturnType<typeof vi.fn>;
  emitControl: ReturnType<typeof vi.fn>;
} {
  const emitEvent = vi.fn();
  const emitControl = vi.fn();

  return {
    emitter: {
      emitEvent: emitEvent as ReplayControlEmitter['emitEvent'],
      emitControl: emitControl as ReplayControlEmitter['emitControl'],
    },
    emitEvent,
    emitControl,
  };
}

function cardTransitionEvent(overrides: Partial<ArdaEvent> = {}): ArdaEvent {
  return {
    type: 'card.transition',
    tenantId: 'tenant-1',
    cardId: 'card-1',
    loopId: 'loop-1',
    fromStage: 'created',
    toStage: 'triggered',
    method: 'scan',
    timestamp: '2026-02-15T00:00:00.000Z',
    ...overrides,
  } as ArdaEvent;
}

describe('ReplayService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-15T00:15:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('skips replay when lastEventId is missing', async () => {
    const redis = createRedisClient([]);
    const { emitter, emitEvent, emitControl } = createEmitter();
    const service = new ReplayService('redis://unused', {}, redis);

    const result = await service.replayMissedEvents({ tenantId: 'tenant-1' }, emitter);

    expect(result).toEqual({ status: 'skipped', replayedCount: 0 });
    expect(redis.xread).not.toHaveBeenCalled();
    expect(emitEvent).not.toHaveBeenCalled();
    expect(emitControl).not.toHaveBeenCalled();
  });

  it('emits resync_required when lastEventId is outside replay TTL', async () => {
    const redis = createRedisClient([]);
    const { emitter, emitControl } = createEmitter();
    const service = new ReplayService('redis://unused', { replayTtlMs: 1_000 }, redis);

    const result = await service.replayMissedEvents(
      {
        tenantId: 'tenant-1',
        lastEventId: '1739578440000-0',
        protocolVersion: '2',
      },
      emitter,
    );

    expect(result).toEqual({ status: 'resync_required', replayedCount: 0 });
    expect(redis.xread).not.toHaveBeenCalled();
    expect(emitControl).toHaveBeenCalledWith('resync_required', {
      reason: 'stale_last_event_id',
      lastEventId: '1739578440000-0',
      replayTtlMs: 1_000,
      protocolVersion: '2',
    });
  });

  it('replays missed events in order and emits replay_complete', async () => {
    const firstEnvelope = {
      id: 'evt-1',
      schemaVersion: 1,
      source: 'orders-service',
      timestamp: '2026-02-15T00:14:01.000Z',
      event: cardTransitionEvent(),
    };
    const secondEnvelope = {
      id: 'evt-2',
      schemaVersion: 1,
      source: 'orders-service',
      timestamp: '2026-02-15T00:14:02.000Z',
      event: cardTransitionEvent({
        cardId: 'card-2',
        toStage: 'ordered',
      }),
    };
    const redis = createRedisClient([
      [
        [
          'arda:stream:tenant-1',
          [
            ['1771114441000-0', ['envelope', JSON.stringify(firstEnvelope)]],
            ['1771114442000-0', ['envelope', JSON.stringify(secondEnvelope)]],
          ],
        ],
      ],
    ]);
    const { emitter, emitEvent, emitControl } = createEmitter();
    const service = new ReplayService('redis://unused', {}, redis);

    const result = await service.replayMissedEvents(
      {
        tenantId: 'tenant-1',
        lastEventId: '1771114440000-0',
        protocolVersion: '2',
      },
      emitter,
    );

    expect(result).toEqual({
      status: 'completed',
      replayedCount: 2,
      lastDeliveredEventId: '1771114442000-0',
    });
    expect(emitEvent).toHaveBeenNthCalledWith(1, {
      type: 'card:triggered',
      tenantId: 'tenant-1',
      payload: firstEnvelope.event,
      timestamp: '2026-02-15T00:00:00.000Z',
      replayed: true,
      eventId: 'evt-1',
    });
    expect(emitEvent).toHaveBeenNthCalledWith(2, {
      type: 'card:stage_changed',
      tenantId: 'tenant-1',
      payload: secondEnvelope.event,
      timestamp: '2026-02-15T00:00:00.000Z',
      replayed: true,
      eventId: 'evt-2',
    });
    expect(emitControl).toHaveBeenCalledWith('replay_complete', {
      replayedCount: 2,
      lastEventId: '1771114442000-0',
      protocolVersion: '2',
    });
  });
});
