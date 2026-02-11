/**
 * Automation Idempotency Manager
 *
 * Redis-backed idempotency layer for the TCAAF pipeline.
 * Uses SET NX with per-action TTLs to ensure exactly-once
 * execution semantics. Supports replay by clearing stale keys.
 */

import { Redis } from 'ioredis';
import { createLogger } from '@arda/config';


import type { ActionType, IdempotencyRecord } from './types.js';
import { IDEMPOTENCY_TTL_MAP, IDEMPOTENCY_FAILURE_TTL } from './types.js';

const log = createLogger('automation:idempotency');

/** Thrown when a concurrent execution is detected for the same idempotency key. */
export class ConcurrentExecutionError extends Error {
  constructor(
    public readonly key: string,
    public readonly existingStatus: string,
  ) {
    super(`Concurrent execution detected for key "${key}" (status: ${existingStatus})`);
    this.name = 'ConcurrentExecutionError';
  }
}

/** Redis key prefix for all idempotency records. */
const KEY_PREFIX = 'arda:idempotency:';

export class IdempotencyManager {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  // ─── Core: Execute With Idempotency ──────────────────────────────

  /**
   * Execute an action with idempotency protection.
   *
   * Flow:
   * 1. Try SET NX to claim the key with 'pending' status
   * 2. If key already exists with 'completed', return cached result (replay)
   * 3. If key already exists with 'pending', throw ConcurrentExecutionError
   * 4. If key already exists with 'failed', allow retry (clear + re-claim)
   * 5. Execute the action
   * 6. On success, update key to 'completed' with result
   * 7. On failure, update key to 'failed' with short TTL
   *
   * @returns The action result, or cached result if already completed
   */
  async executeWithIdempotency<T>(
    key: string,
    actionType: ActionType,
    tenantId: string,
    action: () => Promise<T>,
  ): Promise<{ result: T; wasReplay: boolean }> {
    const redisKey = `${KEY_PREFIX}${key}`;
    const ttl = IDEMPOTENCY_TTL_MAP[actionType];

    // Check for existing record
    const existing = await this.redis.get(redisKey);

    if (existing) {
      const record: IdempotencyRecord = JSON.parse(existing);

      // Already completed — return cached result (replay)
      if (record.status === 'completed') {
        log.info({ key, actionType }, 'Idempotency: returning cached result');
        return { result: record.result as T, wasReplay: true };
      }

      // Still pending — concurrent execution
      if (record.status === 'pending') {
        throw new ConcurrentExecutionError(key, record.status);
      }

      // Failed — allow retry by clearing the key first
      if (record.status === 'failed') {
        log.info({ key, actionType }, 'Idempotency: previous attempt failed, allowing retry');
        await this.redis.del(redisKey);
      }
    }

    // Claim the key with SET NX
    const pendingRecord: IdempotencyRecord = {
      key,
      actionType,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttl * 1_000).toISOString(),
      tenantId,
    };

    const claimed = await this.redis.set(
      redisKey,
      JSON.stringify(pendingRecord),
      'EX',
      ttl,
      'NX',
    );

    if (!claimed) {
      // Race condition: another process claimed it between our GET and SET NX
      const raceRecord = await this.redis.get(redisKey);
      const raceStatus = raceRecord ? (JSON.parse(raceRecord) as IdempotencyRecord).status : 'unknown';
      throw new ConcurrentExecutionError(key, raceStatus);
    }

    // Execute the action
    const startMs = Date.now();
    try {
      const result = await action();
      const durationMs = Date.now() - startMs;

      // Mark as completed
      const completedRecord: IdempotencyRecord = {
        ...pendingRecord,
        status: 'completed',
        result,
      };

      await this.redis.set(redisKey, JSON.stringify(completedRecord), 'EX', ttl);

      log.info({ key, actionType, durationMs }, 'Idempotency: action completed');
      return { result, wasReplay: false };
    } catch (err) {
      const durationMs = Date.now() - startMs;

      // Mark as failed with short TTL to allow quick retry
      const failedRecord: IdempotencyRecord = {
        ...pendingRecord,
        status: 'failed',
        result: { error: err instanceof Error ? err.message : String(err) },
      };

      await this.redis.set(
        redisKey,
        JSON.stringify(failedRecord),
        'EX',
        IDEMPOTENCY_FAILURE_TTL,
      );

      log.error({ key, actionType, durationMs, err }, 'Idempotency: action failed');
      throw err;
    }
  }

  // ─── Key Inspection ───────────────────────────────────────────────

  /**
   * Check the current status of an idempotency key without modifying it.
   */
  async checkIdempotencyKey(key: string): Promise<IdempotencyRecord | null> {
    const redisKey = `${KEY_PREFIX}${key}`;
    const raw = await this.redis.get(redisKey);
    return raw ? (JSON.parse(raw) as IdempotencyRecord) : null;
  }

  // ─── Key Clearing ─────────────────────────────────────────────────

  /**
   * Manually clear an idempotency key to allow re-execution.
   * Used for replay from DLQ or manual intervention.
   */
  async clearIdempotencyKey(key: string): Promise<boolean> {
    const redisKey = `${KEY_PREFIX}${key}`;
    const deleted = await this.redis.del(redisKey);
    if (deleted > 0) {
      log.info({ key }, 'Idempotency key cleared');
    }
    return deleted > 0;
  }

  // ─── Shutdown ─────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.redis.quit();
  }
}
