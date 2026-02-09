/**
 * @arda/jobs — Dead Letter Queue (DLQ) handler
 *
 * When a job exhausts all retries, it is moved to the DLQ for manual
 * inspection, replay, or alerting.
 */

import { Queue, type Job } from 'bullmq';
import type { JobEnvelope, DLQEntry } from './types.js';
import { parseRedisUrl } from './queue.js';

/** DLQ queue name suffix */
const DLQ_SUFFIX = ':dlq';

/** Arda queue prefix */
const QUEUE_PREFIX = 'arda';

/**
 * Create or retrieve the DLQ queue for a given source queue.
 *
 * @param sourceQueueName - Name of the originating queue
 * @param redisUrl - Redis connection URL
 * @returns A BullMQ Queue configured as a DLQ
 */
export function createDLQ(
  sourceQueueName: string,
  redisUrl = 'redis://localhost:6379',
): Queue<DLQEntry> {
  const connection = parseRedisUrl(redisUrl);

  return new Queue<DLQEntry>(`${sourceQueueName}${DLQ_SUFFIX}`, {
    connection,
    prefix: QUEUE_PREFIX,
    defaultJobOptions: {
      // DLQ jobs should not be auto-removed
      removeOnComplete: false,
      removeOnFail: false,
      // No retries in DLQ — these are for manual review
      attempts: 1,
    },
  });
}

/**
 * Move a failed job to the dead letter queue.
 *
 * Call this from a worker's `failed` event handler when
 * `job.attemptsMade >= job.opts.attempts`.
 *
 * @param dlq - The DLQ queue instance
 * @param job - The failed BullMQ job
 * @param error - The error that caused the failure
 */
export async function moveToDeadLetterQueue<T>(
  dlq: Queue<DLQEntry>,
  job: Job<JobEnvelope<T>>,
  error: Error,
): Promise<void> {
  const dlqEntry: DLQEntry<T> = {
    job: job.data,
    error: error.message,
    stack: error.stack,
    failedAt: new Date().toISOString(),
    sourceQueue: job.queueName,
  };

  await dlq.add(
    `dlq:${job.data.type}`,
    dlqEntry as unknown as DLQEntry,
    {
      jobId: `dlq:${job.data.id}`,
    },
  );
}

/**
 * Retrieve all entries currently in the DLQ for inspection.
 *
 * @param dlq - The DLQ queue instance
 * @param start - Start index (default 0)
 * @param end - End index (default 100)
 * @returns Array of DLQ entries
 */
export async function listDLQEntries(
  dlq: Queue<DLQEntry>,
  start = 0,
  end = 100,
): Promise<DLQEntry[]> {
  const jobs = await dlq.getJobs(['waiting', 'delayed'], start, end);
  return jobs.map((job) => job.data);
}

/**
 * Replay a DLQ entry by moving it back to the source queue.
 *
 * @param sourceQueue - The original queue to replay into
 * @param dlq - The DLQ queue instance
 * @param jobId - The DLQ job ID to replay
 */
export async function replayFromDLQ<T>(
  sourceQueue: Queue<JobEnvelope<T>>,
  dlq: Queue<DLQEntry>,
  jobId: string,
): Promise<void> {
  const dlqJob = await dlq.getJob(jobId);
  if (!dlqJob) {
    throw new Error(`DLQ job not found: ${jobId}`);
  }

  const envelope = dlqJob.data.job as JobEnvelope<T>;

  // Reset attempt counter
  const replayed: JobEnvelope<T> = {
    ...envelope,
    attempts: 1,
    createdAt: new Date().toISOString(),
  };

  await sourceQueue.add(replayed.type, replayed, {
    jobId: `replay:${replayed.id}`,
  });

  // Remove from DLQ after successful replay
  await dlqJob.remove();
}
