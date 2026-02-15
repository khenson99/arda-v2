import { Redis } from 'ioredis';
import { createLogger } from '@arda/config';
import { getTenantStream, type ArdaEvent, type EventEnvelope } from '@arda/events';
import type {
  RealtimeProtocolVersion,
  RealtimeReplayCompletePayload,
  RealtimeResyncRequiredPayload,
} from '@arda/shared-types';
import type { GatewayWSEvent } from './event-mapper.js';
import { mapBackendEventToWSEvent } from './event-mapper.js';

const log = createLogger('ws:replay');

const DEFAULT_REPLAY_TTL_MS = 15 * 60 * 1000;
const DEFAULT_REPLAY_BATCH_SIZE = 200;

type StreamEntry = [id: string, fields: string[]];
type StreamReadResult = Array<[stream: string, entries: StreamEntry[]]> | null;

export interface ReplayRedisClient {
  xread: (...args: unknown[]) => Promise<StreamReadResult>;
  quit: () => Promise<unknown>;
}

export interface ReplayControlEmitter {
  emitEvent: (event: GatewayWSEvent & { replayed: true; eventId: string }) => void;
  emitControl(type: 'replay_complete', payload: RealtimeReplayCompletePayload): void;
  emitControl(type: 'resync_required', payload: RealtimeResyncRequiredPayload): void;
}

export interface ReplayRequest {
  tenantId: string;
  lastEventId?: string;
  protocolVersion?: RealtimeProtocolVersion;
}

export interface ReplayResult {
  status: 'skipped' | 'completed' | 'resync_required';
  replayedCount: number;
  lastDeliveredEventId?: string;
}

export interface ReplayServiceOptions {
  replayTtlMs?: number;
  batchSize?: number;
}

function parseStreamIdMs(streamId: string): number | null {
  const idPart = streamId.split('-')[0];
  const ms = Number(idPart);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms;
}

function isStaleEventId(lastEventId: string, replayTtlMs: number): boolean {
  const idMs = parseStreamIdMs(lastEventId);
  if (idMs === null) return true;
  return Date.now() - idMs > replayTtlMs;
}

function getField(fields: string[], key: string): string | undefined {
  for (let i = 0; i < fields.length - 1; i += 2) {
    if (fields[i] === key) return fields[i + 1];
  }
  return undefined;
}

export class ReplayService {
  private readonly redis: ReplayRedisClient;
  private readonly ownsRedis: boolean;
  private readonly replayTtlMs: number;
  private readonly batchSize: number;

  constructor(
    redisUrl: string,
    options: ReplayServiceOptions = {},
    redisClient?: ReplayRedisClient,
  ) {
    this.redis = (redisClient ?? new Redis(redisUrl)) as ReplayRedisClient;
    this.ownsRedis = !redisClient;
    this.replayTtlMs = options.replayTtlMs ?? DEFAULT_REPLAY_TTL_MS;
    this.batchSize = options.batchSize ?? DEFAULT_REPLAY_BATCH_SIZE;
  }

  async close(): Promise<void> {
    if (this.ownsRedis) {
      await this.redis.quit();
    }
  }

  async replayMissedEvents(
    request: ReplayRequest,
    emitter: ReplayControlEmitter,
  ): Promise<ReplayResult> {
    const { tenantId, lastEventId, protocolVersion } = request;
    if (!lastEventId) {
      return { status: 'skipped', replayedCount: 0 };
    }

    if (isStaleEventId(lastEventId, this.replayTtlMs)) {
      emitter.emitControl('resync_required', {
        reason: 'stale_last_event_id',
        lastEventId,
        replayTtlMs: this.replayTtlMs,
        protocolVersion,
      });
      return { status: 'resync_required', replayedCount: 0 };
    }

    const streamKey = getTenantStream(tenantId);
    let cursor = lastEventId;
    let replayedCount = 0;
    let lastDeliveredEventId: string | undefined;

    while (true) {
      const rows = await this.redis.xread(
        'COUNT',
        String(this.batchSize),
        'STREAMS',
        streamKey,
        cursor,
      );

      const entries = rows?.[0]?.[1] ?? [];
      if (entries.length === 0) break;

      for (const [streamId, fields] of entries) {
        cursor = streamId;
        lastDeliveredEventId = streamId;

        const rawEnvelope = getField(fields, 'envelope');
        if (!rawEnvelope) continue;

        let envelope: EventEnvelope<ArdaEvent>;
        try {
          envelope = JSON.parse(rawEnvelope) as EventEnvelope<ArdaEvent>;
        } catch (err) {
          log.warn({ err, streamId, tenantId }, 'Skipping malformed envelope in replay stream');
          continue;
        }

        const mapped = mapBackendEventToWSEvent(envelope.event);
        if (!mapped) continue;

        emitter.emitEvent({
          ...mapped,
          replayed: true,
          eventId: envelope.id,
        });
        replayedCount += 1;
      }

      if (entries.length < this.batchSize) break;
    }

    emitter.emitControl('replay_complete', {
      replayedCount,
      lastEventId: lastDeliveredEventId ?? lastEventId,
      protocolVersion,
    });

    return {
      status: 'completed',
      replayedCount,
      lastDeliveredEventId: lastDeliveredEventId ?? lastEventId,
    };
  }
}
