/**
 * @arda/jobs — Queue unit tests
 *
 * Tests queue/worker creation, job envelope building, DLQ operations,
 * and health checks. External dependencies (BullMQ, Redis) are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

const mockQueueInstance = {
  name: 'test-queue',
  add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  getJobCounts: vi.fn().mockResolvedValue({
    waiting: 5,
    active: 2,
    completed: 100,
    failed: 1,
    delayed: 0,
  }),
  getJobs: vi.fn().mockResolvedValue([]),
  getJob: vi.fn().mockResolvedValue(null),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockWorkerInstance = {
  isRunning: vi.fn().mockReturnValue(true),
  close: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
};

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => mockQueueInstance),
  Worker: vi.fn().mockImplementation(() => mockWorkerInstance),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────

import { createQueue, createWorker, buildJobEnvelope, parseRedisUrl } from '../queue.js';
import { createDLQ, moveToDeadLetterQueue, listDLQEntries } from '../dlq.js';
import { getQueueHealth, getAggregatedHealth } from '../health.js';
import { Queue, Worker } from 'bullmq';

// ─── Tests ──────────────────────────────────────────────────────────

describe('parseRedisUrl', () => {
  it('should parse a standard Redis URL', () => {
    const result = parseRedisUrl('redis://localhost:6379');
    expect(result).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
      username: undefined,
      db: 0,
    });
  });

  it('should parse a Redis URL with auth', () => {
    const result = parseRedisUrl('redis://user:password@redis.example.com:6380/2');
    expect(result).toEqual({
      host: 'redis.example.com',
      port: 6380,
      password: 'password',
      username: 'user',
      db: 2,
    });
  });
});

describe('createQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a BullMQ Queue with default options', () => {
    const queue = createQueue('orders');

    expect(Queue).toHaveBeenCalledWith('orders', expect.objectContaining({
      prefix: 'arda',
      defaultJobOptions: expect.objectContaining({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    }));
    expect(queue).toBeDefined();
  });

  it('should accept custom Redis URL', () => {
    createQueue('emails', { redisUrl: 'redis://custom:6380' });

    expect(Queue).toHaveBeenCalledWith('emails', expect.objectContaining({
      connection: expect.objectContaining({
        host: 'custom',
        port: 6380,
      }),
    }));
  });

  it('should accept custom job options', () => {
    createQueue('notifications', {
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'fixed', delay: 2000 },
      },
    });

    expect(Queue).toHaveBeenCalledWith('notifications', expect.objectContaining({
      defaultJobOptions: expect.objectContaining({
        attempts: 5,
        backoff: { type: 'fixed', delay: 2000 },
      }),
    }));
  });
});

describe('createWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a BullMQ Worker with default options', () => {
    const processor = vi.fn();
    const worker = createWorker('orders', processor);

    expect(Worker).toHaveBeenCalledWith('orders', processor, expect.objectContaining({
      prefix: 'arda',
      concurrency: 5,
      lockDuration: 30_000,
    }));
    expect(worker).toBeDefined();
  });

  it('should accept custom concurrency', () => {
    const processor = vi.fn();
    createWorker('emails', processor, { concurrency: 10 });

    expect(Worker).toHaveBeenCalledWith('emails', processor, expect.objectContaining({
      concurrency: 10,
    }));
  });
});

describe('buildJobEnvelope', () => {
  it('should create a well-formed envelope', () => {
    const envelope = buildJobEnvelope('order.created', 'tenant-123', { orderId: 'ord-1' });

    expect(envelope).toEqual(expect.objectContaining({
      type: 'order.created',
      tenantId: 'tenant-123',
      payload: { orderId: 'ord-1' },
      attempts: 1,
      maxRetries: 3,
    }));
    expect(envelope.id).toBeDefined();
    expect(envelope.createdAt).toBeDefined();
    // Verify ISO 8601 format
    expect(new Date(envelope.createdAt).toISOString()).toBe(envelope.createdAt);
  });

  it('should accept custom maxRetries', () => {
    const envelope = buildJobEnvelope('email.send', 'tenant-456', {}, 5);
    expect(envelope.maxRetries).toBe(5);
  });
});

describe('createDLQ', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a DLQ queue with :dlq suffix', () => {
    createDLQ('orders');

    expect(Queue).toHaveBeenCalledWith('orders:dlq', expect.objectContaining({
      prefix: 'arda',
      defaultJobOptions: expect.objectContaining({
        removeOnComplete: false,
        removeOnFail: false,
        attempts: 1,
      }),
    }));
  });
});

describe('moveToDeadLetterQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add a DLQ entry with job metadata', async () => {
    const dlq = createDLQ('orders');
    const mockJob = {
      data: {
        id: 'job-1',
        type: 'order.created',
        tenantId: 'tenant-123',
        payload: { orderId: 'ord-1' },
        attempts: 3,
        maxRetries: 3,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      queueName: 'orders',
    };

    const error = new Error('Processing failed');
    await moveToDeadLetterQueue(dlq, mockJob as any, error);

    expect(mockQueueInstance.add).toHaveBeenCalledWith(
      'dlq:order.created',
      expect.objectContaining({
        error: 'Processing failed',
        sourceQueue: 'orders',
      }),
      expect.objectContaining({
        jobId: 'dlq:job-1',
      }),
    );
  });
});

describe('listDLQEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when no DLQ entries', async () => {
    const dlq = createDLQ('orders');
    const entries = await listDLQEntries(dlq);
    expect(entries).toEqual([]);
  });
});

describe('getQueueHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return health status for a connected queue', async () => {
    const queue = createQueue('orders');
    const worker = createWorker('orders', vi.fn());

    const health = await getQueueHealth(queue as any, worker as any);

    expect(health).toEqual({
      name: 'test-queue',
      connected: true,
      waiting: 5,
      active: 2,
      completed: 100,
      failed: 1,
      delayed: 0,
      workerRunning: true,
    });
  });

  it('should return disconnected status on error', async () => {
    mockQueueInstance.getJobCounts.mockRejectedValueOnce(new Error('Connection refused'));

    const queue = createQueue('orders');
    const health = await getQueueHealth(queue as any);

    expect(health.connected).toBe(false);
    expect(health.workerRunning).toBe(false);
  });
});

describe('getAggregatedHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return overall healthy when all queues are connected', async () => {
    const queue = createQueue('orders');
    const worker = createWorker('orders', vi.fn());

    const result = await getAggregatedHealth([{ queue: queue as any, worker: worker as any }]);

    expect(result.healthy).toBe(true);
    expect(result.queues).toHaveLength(1);
  });

  it('should return unhealthy when any queue is disconnected', async () => {
    mockQueueInstance.getJobCounts.mockRejectedValueOnce(new Error('Connection refused'));

    const queue = createQueue('orders');

    const result = await getAggregatedHealth([{ queue: queue as any }]);

    expect(result.healthy).toBe(false);
  });
});
