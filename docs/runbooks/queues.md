# Queue Operations Runbook

Guide for operating, monitoring, and troubleshooting BullMQ queues in Arda V2.

## Architecture

Arda uses **BullMQ** backed by Redis for background job processing. All queues share a single Redis instance with the `arda` prefix.

### Queue Naming Conventions

| Queue Name | Service | Purpose |
|------------|---------|---------|
| `orders` | Orders | Order lifecycle events, status changes |
| `notifications` | Notifications | Email, push, and in-app notifications |
| `emails` | Notifications | Email delivery (transactional) |
| `search-indexing` | Search | Elasticsearch index updates |
| `audit` | Orders | Audit log processing |

**DLQ Naming**: Each queue has a corresponding dead letter queue with the suffix `:dlq` (e.g., `orders:dlq`).

### Job Envelope

Every job uses a standard envelope format:

```typescript
interface JobEnvelope<T> {
  id: string;          // UUID v4
  type: string;        // e.g. "order.status_changed"
  tenantId: string;    // Tenant isolation
  payload: T;          // Actual job data
  attempts: number;    // Current attempt
  maxRetries: number;  // Max before DLQ
  createdAt: string;   // ISO 8601
}
```

## Default Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Max retries | 3 | Per job type |
| Backoff | Exponential, 1s base | 1s, 2s, 4s |
| Concurrency | 5 per worker | Per service instance |
| Lock duration | 30 seconds | Prevents stalled job reprocessing |
| Remove on complete | After 1000 jobs | Keeps Redis memory bounded |
| Remove on fail | After 5000 jobs | Retains failures for debugging |

## Monitoring

### Health Endpoint

Each service exposes queue health at `GET /health/queues`:

```json
{
  "healthy": true,
  "queues": [
    {
      "name": "orders",
      "connected": true,
      "waiting": 5,
      "active": 2,
      "completed": 1000,
      "failed": 3,
      "delayed": 0,
      "workerRunning": true
    }
  ]
}
```

### Key Metrics to Watch

| Metric | Warning Threshold | Critical Threshold |
|--------|------------------|--------------------|
| Waiting jobs | > 100 | > 1000 |
| Failed jobs (last hour) | > 10 | > 50 |
| Active jobs per worker | > concurrency | Stalled |
| DLQ entries | > 0 | > 10 |

### Redis CLI Inspection

```bash
# Connect to Redis
docker compose exec redis redis-cli

# List all Arda queues
KEYS arda:*

# Check waiting job count
LLEN arda:orders:wait

# Check active job count
LLEN arda:orders:active

# Check failed jobs
ZCARD arda:orders:failed

# Check DLQ
LLEN arda:orders:dlq:wait
```

## Troubleshooting

### Jobs stuck in "active" state

**Symptom**: Jobs remain in active state indefinitely.

**Cause**: Worker crashed or stalled without acknowledging the job.

**Resolution**:
1. Check worker logs for crashes
2. BullMQ will automatically retry stalled jobs after `stalledInterval` (30s)
3. If persistent, restart the worker process

### DLQ growing

**Symptom**: Dead letter queue has accumulating entries.

**Cause**: Jobs exhausting all retries due to persistent errors.

**Resolution**:
1. Inspect DLQ entries via the health endpoint or Redis CLI
2. Check error messages in DLQ entries for root cause
3. Fix the underlying issue
4. Replay DLQ entries using the replay utility

### Redis memory pressure

**Symptom**: Redis `used_memory` approaching `maxmemory`.

**Cause**: Too many retained completed/failed jobs.

**Resolution**:
1. Check `removeOnComplete` and `removeOnFail` settings
2. Manually clean old jobs: `redis-cli --scan --pattern 'arda:*:completed:*' | xargs redis-cli DEL`
3. Consider reducing retention settings

### Worker not processing jobs

**Symptom**: Jobs accumulating in waiting state, worker running but idle.

**Resolution**:
1. Verify worker is connected: check health endpoint
2. Verify queue names match between producer and consumer
3. Check Redis connectivity: `redis-cli PING`
4. Restart worker process

## Operations

### Pausing a Queue

```typescript
import { createQueue } from '@arda/jobs';

const queue = createQueue('orders');
await queue.pause();   // Pause processing
await queue.resume();  // Resume processing
```

### Draining a Queue

Remove all waiting jobs (active jobs will finish):

```typescript
await queue.drain();
```

### Replaying DLQ Entries

```typescript
import { createQueue, createDLQ, replayFromDLQ } from '@arda/jobs';

const queue = createQueue('orders');
const dlq = createDLQ('orders');
await replayFromDLQ(queue, dlq, 'dlq:job-id-here');
```

### Cleaning Old Jobs

```typescript
// Remove completed jobs older than 1 hour
await queue.clean(3600_000, 1000, 'completed');

// Remove failed jobs older than 24 hours
await queue.clean(86_400_000, 1000, 'failed');
```
