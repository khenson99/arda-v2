import { createLogger } from '@arda/config';
import type { ArdaEvent } from '@arda/events';
import type { GatewayWSEvent } from './event-mapper.js';
import { mapBackendEventToWSEvent } from './event-mapper.js';

const log = createLogger('ws:backpressure');

const DEFAULT_CLIENT_BUFFER_MAX = 500;
const DEFAULT_TENANT_RATE_LIMIT_PER_SECOND = 200;
const DEFAULT_TENANT_QUEUE_MAX = 1000;
const DEFAULT_BATCH_WINDOW_MS = 50;
const DEFAULT_DEBOUNCE_WINDOW_MS = 500;

type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface TenantEventSource {
  subscribeTenant(tenantId: string, handler: (event: ArdaEvent) => void): Promise<void>;
  unsubscribeTenant(tenantId: string, handler: (event: ArdaEvent) => void): Promise<void>;
}

export interface BackpressureLogger {
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
}

export interface LiveEmission {
  eventName: string;
  payload: unknown;
}

export interface BackpressureSubscriber {
  id: string;
  emit(emission: LiveEmission): void;
}

export interface EventBatchPayload {
  tenantId: string;
  events: GatewayWSEvent[];
  count: number;
  timestamp: string;
}

export interface BackpressureWarningPayload {
  tenantId: string;
  droppedCount: number;
  maxBufferSize: number;
  timestamp: string;
}

export interface BackpressureOptions {
  clientBufferMax?: number;
  tenantRateLimitPerSecond?: number;
  tenantQueueMax?: number;
  batchWindowMs?: number;
  debounceWindowMs?: number;
  logger?: BackpressureLogger;
}

interface DebounceEntry {
  timer: TimeoutHandle;
  latestEvent: GatewayWSEvent;
}

interface SubscriberState {
  subscriber: BackpressureSubscriber;
  sendBuffer: GatewayWSEvent[];
  droppedCount: number;
  flushTimer: TimeoutHandle | null;
  debounceByKey: Map<string, DebounceEntry>;
}

interface TenantState {
  subscribers: Map<string, SubscriberState>;
  queue: ArdaEvent[];
  queueProcessTimer: TimeoutHandle | null;
  windowStartedAt: number;
  processedInWindow: number;
  handler: (event: ArdaEvent) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isDebouncedType(event: GatewayWSEvent): boolean {
  return event.type === 'inventory:updated' || event.type === 'kpi:refreshed';
}

function getDebounceKey(event: GatewayWSEvent): string | null {
  if (event.type === 'inventory:updated') {
    const payload = event.payload as unknown as Record<string, unknown>;
    const facilityId = String(payload.facilityId ?? 'unknown');
    const partId = String(payload.partId ?? 'unknown');
    const field = String(payload.field ?? 'unknown');
    return `${event.tenantId}:inventory:${facilityId}:${partId}:${field}`;
  }

  if (event.type === 'kpi:refreshed') {
    const payload = event.payload as unknown as Record<string, unknown>;
    const kpiKey = String(payload.kpiKey ?? 'unknown');
    const facilityId = String(payload.facilityId ?? 'all');
    const window = String(payload.window ?? 'unknown');
    return `${event.tenantId}:kpi:${kpiKey}:${facilityId}:${window}`;
  }

  return null;
}

export class BackpressureBridge {
  private readonly source: TenantEventSource;
  private readonly logger: BackpressureLogger;
  private readonly clientBufferMax: number;
  private readonly tenantRateLimitPerSecond: number;
  private readonly tenantQueueMax: number;
  private readonly batchWindowMs: number;
  private readonly debounceWindowMs: number;
  private readonly tenants = new Map<string, TenantState>();

  constructor(source: TenantEventSource, options: BackpressureOptions = {}) {
    this.source = source;
    this.logger = options.logger ?? log;
    this.clientBufferMax = options.clientBufferMax ?? DEFAULT_CLIENT_BUFFER_MAX;
    this.tenantRateLimitPerSecond =
      options.tenantRateLimitPerSecond ?? DEFAULT_TENANT_RATE_LIMIT_PER_SECOND;
    this.tenantQueueMax = options.tenantQueueMax ?? DEFAULT_TENANT_QUEUE_MAX;
    this.batchWindowMs = options.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS;
    this.debounceWindowMs = options.debounceWindowMs ?? DEFAULT_DEBOUNCE_WINDOW_MS;
  }

  async attachSubscriber(
    tenantId: string,
    subscriber: BackpressureSubscriber,
  ): Promise<() => Promise<void>> {
    let tenantState = this.tenants.get(tenantId);
    const isFirstSubscriber = !tenantState;

    if (!tenantState) {
      const handler = (event: ArdaEvent) => {
        this.enqueueTenantEvent(tenantId, event);
      };
      tenantState = {
        subscribers: new Map(),
        queue: [],
        queueProcessTimer: null,
        windowStartedAt: Date.now(),
        processedInWindow: 0,
        handler,
      };
      this.tenants.set(tenantId, tenantState);
    }

    tenantState.subscribers.set(subscriber.id, {
      subscriber,
      sendBuffer: [],
      droppedCount: 0,
      flushTimer: null,
      debounceByKey: new Map(),
    });

    if (isFirstSubscriber) {
      try {
        await this.source.subscribeTenant(tenantId, tenantState.handler);
      } catch (err) {
        tenantState.subscribers.delete(subscriber.id);
        if (tenantState.subscribers.size === 0) {
          this.tenants.delete(tenantId);
        }
        throw err;
      }
    }

    return async () => {
      await this.detachSubscriber(tenantId, subscriber.id);
    };
  }

  private async detachSubscriber(tenantId: string, subscriberId: string): Promise<void> {
    const tenantState = this.tenants.get(tenantId);
    if (!tenantState) return;

    const socketState = tenantState.subscribers.get(subscriberId);
    if (socketState) {
      this.clearSubscriberState(socketState);
      tenantState.subscribers.delete(subscriberId);
    }

    if (tenantState.subscribers.size === 0) {
      if (tenantState.queueProcessTimer) {
        clearTimeout(tenantState.queueProcessTimer);
      }
      try {
        await this.source.unsubscribeTenant(tenantId, tenantState.handler);
      } finally {
        this.tenants.delete(tenantId);
      }
    }
  }

  private enqueueTenantEvent(tenantId: string, event: ArdaEvent): void {
    const tenantState = this.tenants.get(tenantId);
    if (!tenantState) return;

    tenantState.queue.push(event);
    if (tenantState.queue.length > this.tenantQueueMax) {
      const overflow = tenantState.queue.length - this.tenantQueueMax;
      tenantState.queue.splice(0, overflow);
      this.logger.warn(
        {
          tenantId,
          overflow,
          queueSize: tenantState.queue.length,
          queueMax: this.tenantQueueMax,
        },
        'Tenant bridge queue overflow; dropping oldest events',
      );
    }

    this.scheduleTenantProcessing(tenantId, 0);
  }

  private scheduleTenantProcessing(tenantId: string, delayMs: number): void {
    const tenantState = this.tenants.get(tenantId);
    if (!tenantState) return;
    if (tenantState.queueProcessTimer) return;

    tenantState.queueProcessTimer = setTimeout(() => {
      tenantState.queueProcessTimer = null;
      this.processTenantQueue(tenantId);
    }, delayMs);
  }

  private processTenantQueue(tenantId: string): void {
    const tenantState = this.tenants.get(tenantId);
    if (!tenantState) return;

    const nowMs = Date.now();
    if (nowMs - tenantState.windowStartedAt >= 1000) {
      tenantState.windowStartedAt = nowMs;
      tenantState.processedInWindow = 0;
    }

    let allowance = this.tenantRateLimitPerSecond - tenantState.processedInWindow;
    while (allowance > 0 && tenantState.queue.length > 0) {
      const event = tenantState.queue.shift();
      if (!event) break;
      tenantState.processedInWindow += 1;
      allowance -= 1;
      this.dispatchMappedEvent(tenantId, event);
    }

    if (tenantState.queue.length > 0) {
      const waitMs = Math.max(1, 1000 - (Date.now() - tenantState.windowStartedAt));
      this.scheduleTenantProcessing(tenantId, waitMs);
    }
  }

  private dispatchMappedEvent(tenantId: string, event: ArdaEvent): void {
    const tenantState = this.tenants.get(tenantId);
    if (!tenantState) return;

    const mapped = mapBackendEventToWSEvent(event);
    if (!mapped) return;

    for (const socketState of tenantState.subscribers.values()) {
      this.enqueueForSubscriber(tenantId, socketState, mapped);
    }
  }

  private enqueueForSubscriber(
    tenantId: string,
    socketState: SubscriberState,
    event: GatewayWSEvent,
  ): void {
    if (isDebouncedType(event)) {
      const debounceKey = getDebounceKey(event);
      if (debounceKey) {
        this.enqueueDebounced(tenantId, socketState, debounceKey, event);
        return;
      }
    }

    this.enqueueSocketBuffer(tenantId, socketState, event);
  }

  private enqueueDebounced(
    tenantId: string,
    socketState: SubscriberState,
    key: string,
    event: GatewayWSEvent,
  ): void {
    const existing = socketState.debounceByKey.get(key);
    if (existing) {
      existing.latestEvent = event;
      return;
    }

    const entry: DebounceEntry = {
      latestEvent: event,
      timer: setTimeout(() => {
        socketState.debounceByKey.delete(key);
        this.enqueueSocketBuffer(tenantId, socketState, entry.latestEvent);
      }, this.debounceWindowMs),
    };

    socketState.debounceByKey.set(key, entry);
  }

  private enqueueSocketBuffer(
    tenantId: string,
    socketState: SubscriberState,
    event: GatewayWSEvent,
  ): void {
    if (socketState.sendBuffer.length >= this.clientBufferMax) {
      socketState.droppedCount += 1;
      const warningPayload: BackpressureWarningPayload = {
        tenantId,
        droppedCount: socketState.droppedCount,
        maxBufferSize: this.clientBufferMax,
        timestamp: nowIso(),
      };
      socketState.subscriber.emit({
        eventName: 'backpressure_warning',
        payload: warningPayload,
      });
      return;
    }

    socketState.sendBuffer.push(event);
    this.scheduleSocketFlush(socketState);
  }

  private scheduleSocketFlush(socketState: SubscriberState): void {
    if (socketState.flushTimer) return;

    socketState.flushTimer = setTimeout(() => {
      socketState.flushTimer = null;
      this.flushSocketBuffer(socketState);
    }, this.batchWindowMs);
  }

  private flushSocketBuffer(socketState: SubscriberState): void {
    if (socketState.sendBuffer.length === 0) return;

    const pending = socketState.sendBuffer.splice(0, socketState.sendBuffer.length);
    if (pending.length === 1) {
      const single = pending[0];
      socketState.subscriber.emit({
        eventName: single.type,
        payload: single,
      });
      return;
    }

    const batchPayload: EventBatchPayload = {
      tenantId: pending[0].tenantId,
      events: pending,
      count: pending.length,
      timestamp: nowIso(),
    };
    socketState.subscriber.emit({
      eventName: 'event_batch',
      payload: batchPayload,
    });
  }

  private clearSubscriberState(socketState: SubscriberState): void {
    if (socketState.flushTimer) {
      clearTimeout(socketState.flushTimer);
    }
    for (const entry of socketState.debounceByKey.values()) {
      clearTimeout(entry.timer);
    }
    socketState.debounceByKey.clear();
    socketState.sendBuffer.length = 0;
  }

  async shutdown(): Promise<void> {
    for (const [tenantId, tenantState] of this.tenants.entries()) {
      if (tenantState.queueProcessTimer) {
        clearTimeout(tenantState.queueProcessTimer);
      }
      for (const socketState of tenantState.subscribers.values()) {
        this.clearSubscriberState(socketState);
      }
      tenantState.subscribers.clear();
      tenantState.queue.length = 0;
      try {
        await this.source.unsubscribeTenant(tenantId, tenantState.handler);
      } catch (err) {
        this.logger.error(
          {
            err,
            tenantId,
          },
          'Failed to unsubscribe tenant during backpressure bridge shutdown',
        );
      }
    }
    this.tenants.clear();
  }
}
