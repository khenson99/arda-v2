/**
 * @arda/jobs — Queue health check utilities
 *
 * Provides health status for queues and workers, suitable for
 * liveness/readiness probes in Kubernetes or Railway.
 */

import type { Queue, Worker } from 'bullmq';
import type { QueueHealthStatus } from './types.js';

/**
 * Get health status for a single queue.
 *
 * @param queue - BullMQ Queue instance
 * @param worker - Optional associated Worker instance
 * @returns Queue health status
 */
export async function getQueueHealth(
  queue: Queue,
  worker?: Worker,
): Promise<QueueHealthStatus> {
  try {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
    );

    // Check Redis connection by attempting to get job counts
    // If the above succeeded, we are connected
    return {
      name: queue.name,
      connected: true,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      workerRunning: worker?.isRunning() ?? false,
    };
  } catch {
    return {
      name: queue.name,
      connected: false,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      workerRunning: false,
    };
  }
}

/**
 * Get aggregated health for multiple queues.
 *
 * @param queues - Array of queue/worker pairs
 * @returns Array of health statuses and overall health
 */
export async function getAggregatedHealth(
  queues: Array<{ queue: Queue; worker?: Worker }>,
): Promise<{
  healthy: boolean;
  queues: QueueHealthStatus[];
}> {
  const statuses = await Promise.all(
    queues.map(({ queue, worker }) => getQueueHealth(queue, worker)),
  );

  const healthy = statuses.every((s) => s.connected);

  return { healthy, queues: statuses };
}

/**
 * Express-compatible health check handler factory.
 *
 * @param queues - Array of queue/worker pairs to monitor
 * @returns Express request handler
 *
 * @example
 * ```ts
 * app.get('/health/queues', healthCheckHandler([
 *   { queue: orderQueue, worker: orderWorker },
 *   { queue: emailQueue, worker: emailWorker },
 * ]));
 * ```
 */
export function healthCheckHandler(
  queues: Array<{ queue: Queue; worker?: Worker }>,
) {
  return async (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } },
  ): Promise<void> => {
    const health = await getAggregatedHealth(queues);
    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json(health);
  };
}
