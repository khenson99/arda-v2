/**
 * @arda/jobs — Job type definitions
 */

/**
 * Envelope wrapping every job payload for consistent processing,
 * tenant isolation, and retry tracking.
 */
export interface JobEnvelope<T = unknown> {
  /** Unique job identifier (UUID v4) */
  id: string;
  /** Job type name, e.g. "order.status_changed", "email.send" */
  type: string;
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  /** The actual job payload */
  payload: T;
  /** Current attempt number (starts at 1) */
  attempts: number;
  /** Maximum retry count before moving to DLQ */
  maxRetries: number;
  /** ISO 8601 timestamp of job creation */
  createdAt: string;
}

/**
 * Options for creating a queue.
 */
export interface CreateQueueOptions {
  /** Redis connection URL (defaults to config.REDIS_URL) */
  redisUrl?: string;
  /** Default job options */
  defaultJobOptions?: {
    /** Maximum number of attempts */
    attempts?: number;
    /** Backoff strategy */
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    /** Remove completed jobs after this many milliseconds */
    removeOnComplete?: number | boolean;
    /** Remove failed jobs after this many milliseconds */
    removeOnFail?: number | boolean;
  };
}

/**
 * Options for creating a worker.
 */
export interface CreateWorkerOptions {
  /** Redis connection URL (defaults to config.REDIS_URL) */
  redisUrl?: string;
  /** Number of jobs to process concurrently */
  concurrency?: number;
  /** Lock duration in milliseconds */
  lockDuration?: number;
  /** Maximum stalledInterval in milliseconds */
  stalledInterval?: number;
}

/**
 * Dead letter queue entry with metadata about why the job failed.
 */
export interface DLQEntry<T = unknown> {
  /** Original job envelope */
  job: JobEnvelope<T>;
  /** Error message from the last failure */
  error: string;
  /** Stack trace from the last failure */
  stack?: string;
  /** Timestamp when moved to DLQ */
  failedAt: string;
  /** Queue name the job originated from */
  sourceQueue: string;
}

/**
 * Queue health status.
 */
export interface QueueHealthStatus {
  /** Queue name */
  name: string;
  /** Whether the queue is connected to Redis */
  connected: boolean;
  /** Number of waiting jobs */
  waiting: number;
  /** Number of active (processing) jobs */
  active: number;
  /** Number of completed jobs */
  completed: number;
  /** Number of failed jobs */
  failed: number;
  /** Number of delayed jobs */
  delayed: number;
  /** Whether the worker is running */
  workerRunning: boolean;
}
