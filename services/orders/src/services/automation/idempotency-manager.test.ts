/**
 * Tests for the Automation Idempotency Manager
 *
 * Covers: executeWithIdempotency (new execution, replay from completed,
 * ConcurrentExecutionError from pending, retry from failed),
 * checkIdempotencyKey, clearIdempotencyKey.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────

const { mockRedisGet, mockRedisSet, mockRedisDel, mockRedisQuit } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
  mockRedisDel: vi.fn(),
  mockRedisQuit: vi.fn(),
}));

vi.mock('ioredis', () => {
  return {
    Redis: class MockRedis {
      get = mockRedisGet;
      set = mockRedisSet;
      del = mockRedisDel;
      quit = mockRedisQuit;
    },
  };
});

vi.mock('@arda/config', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { IdempotencyManager, ConcurrentExecutionError } from './idempotency-manager.js';
import type { IdempotencyRecord } from './types.js';

// ─── Setup ───────────────────────────────────────────────────────────

describe('IdempotencyManager', () => {
  let manager: IdempotencyManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new IdempotencyManager('redis://localhost:6379');
  });

  // ─── executeWithIdempotency ──────────────────────────────────────

  describe('executeWithIdempotency', () => {
    const key = 'po_create:T1:S1:F1:2025-01-01';
    const actionType = 'create_purchase_order' as const;
    const tenantId = 'T1';

    it('executes action and stores result on first call', async () => {
      // No existing record
      mockRedisGet.mockResolvedValueOnce(null);
      // SET NX succeeds
      mockRedisSet.mockResolvedValueOnce('OK');
      // After execution, SET to store completed
      mockRedisSet.mockResolvedValueOnce('OK');

      const action = vi.fn().mockResolvedValue({ orderId: 'PO-001' });

      const { result, wasReplay } = await manager.executeWithIdempotency(
        key,
        actionType,
        tenantId,
        action,
      );

      expect(action).toHaveBeenCalledOnce();
      expect(result).toEqual({ orderId: 'PO-001' });
      expect(wasReplay).toBe(false);
      // Should have called set twice: pending claim + completed update
      expect(mockRedisSet).toHaveBeenCalledTimes(2);
    });

    it('returns cached result for completed key (replay)', async () => {
      const completedRecord: IdempotencyRecord = {
        key,
        actionType,
        status: 'completed',
        result: { orderId: 'PO-001' },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        tenantId,
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(completedRecord));

      const action = vi.fn();

      const { result, wasReplay } = await manager.executeWithIdempotency(
        key,
        actionType,
        tenantId,
        action,
      );

      expect(action).not.toHaveBeenCalled();
      expect(result).toEqual({ orderId: 'PO-001' });
      expect(wasReplay).toBe(true);
    });

    it('throws ConcurrentExecutionError for pending key', async () => {
      const pendingRecord: IdempotencyRecord = {
        key,
        actionType,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        tenantId,
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(pendingRecord));

      const action = vi.fn();

      await expect(
        manager.executeWithIdempotency(key, actionType, tenantId, action),
      ).rejects.toThrow(ConcurrentExecutionError);

      expect(action).not.toHaveBeenCalled();
    });

    it('retries after a failed key (clears and re-claims)', async () => {
      const failedRecord: IdempotencyRecord = {
        key,
        actionType,
        status: 'failed',
        result: { error: 'DB connection lost' },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        tenantId,
      };
      // First get returns the failed record
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(failedRecord));
      // del clears the failed key
      mockRedisDel.mockResolvedValueOnce(1);
      // SET NX succeeds
      mockRedisSet.mockResolvedValueOnce('OK');
      // Completed record stored
      mockRedisSet.mockResolvedValueOnce('OK');

      const action = vi.fn().mockResolvedValue({ orderId: 'PO-002' });

      const { result, wasReplay } = await manager.executeWithIdempotency(
        key,
        actionType,
        tenantId,
        action,
      );

      expect(mockRedisDel).toHaveBeenCalled();
      expect(action).toHaveBeenCalledOnce();
      expect(result).toEqual({ orderId: 'PO-002' });
      expect(wasReplay).toBe(false);
    });

    it('throws ConcurrentExecutionError when SET NX fails (race condition)', async () => {
      // No existing record
      mockRedisGet.mockResolvedValueOnce(null);
      // SET NX fails (another process claimed it)
      mockRedisSet.mockResolvedValueOnce(null);
      // Re-check returns a pending record
      const pendingRecord: IdempotencyRecord = {
        key,
        actionType,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        tenantId,
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(pendingRecord));

      const action = vi.fn();

      await expect(
        manager.executeWithIdempotency(key, actionType, tenantId, action),
      ).rejects.toThrow(ConcurrentExecutionError);

      expect(action).not.toHaveBeenCalled();
    });

    it('stores failed record when action throws', async () => {
      mockRedisGet.mockResolvedValueOnce(null);
      mockRedisSet.mockResolvedValueOnce('OK'); // pending claim
      mockRedisSet.mockResolvedValueOnce('OK'); // failed record

      const action = vi.fn().mockRejectedValue(new Error('Network timeout'));

      await expect(
        manager.executeWithIdempotency(key, actionType, tenantId, action),
      ).rejects.toThrow('Network timeout');

      // Should have stored a failed record (second set call)
      expect(mockRedisSet).toHaveBeenCalledTimes(2);
      const failedSetArgs = mockRedisSet.mock.calls[1];
      const failedRecord = JSON.parse(failedSetArgs[1]) as IdempotencyRecord;
      expect(failedRecord.status).toBe('failed');
    });
  });

  // ─── checkIdempotencyKey ──────────────────────────────────────────

  describe('checkIdempotencyKey', () => {
    it('returns the record when key exists', async () => {
      const record: IdempotencyRecord = {
        key: 'test-key',
        actionType: 'escalate',
        status: 'completed',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        tenantId: 'T1',
      };
      mockRedisGet.mockResolvedValueOnce(JSON.stringify(record));

      const result = await manager.checkIdempotencyKey('test-key');
      expect(result).toEqual(record);
    });

    it('returns null when key does not exist', async () => {
      mockRedisGet.mockResolvedValueOnce(null);

      const result = await manager.checkIdempotencyKey('missing-key');
      expect(result).toBeNull();
    });
  });

  // ─── clearIdempotencyKey ──────────────────────────────────────────

  describe('clearIdempotencyKey', () => {
    it('returns true when key was deleted', async () => {
      mockRedisDel.mockResolvedValueOnce(1);
      const result = await manager.clearIdempotencyKey('test-key');
      expect(result).toBe(true);
    });

    it('returns false when key did not exist', async () => {
      mockRedisDel.mockResolvedValueOnce(0);
      const result = await manager.clearIdempotencyKey('missing-key');
      expect(result).toBe(false);
    });
  });
});
