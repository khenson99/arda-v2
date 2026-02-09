# Observability Runbook

Guide for monitoring, alerting, and incident diagnosis in Arda V2.

## Architecture

| Component | Tool | Purpose |
|-----------|------|---------|
| Error Tracking | Sentry | Exception capture, breadcrumbs, user context |
| Metrics | Prometheus + Grafana | HTTP latency, throughput, queue depth, DB performance |
| Logging | Pino (structured JSON) | Request logs, application events, debugging |
| Correlation | x-correlation-id header | Request tracing across services |

## Service Integration

Every Arda service should initialize observability at startup:

```typescript
import {
  initSentry,
  correlationMiddleware,
  metricsMiddleware,
  metricsEndpoint,
  requestLoggingMiddleware,
  createCorrelatedLogger,
} from '@arda/observability';

// 1. Initialize Sentry
initSentry({
  dsn: process.env.SENTRY_DSN!,
  service: 'orders',
  environment: process.env.NODE_ENV!,
});

// 2. Create correlated logger
const logger = createCorrelatedLogger({ service: 'orders' });

// 3. Apply middleware (order matters)
app.use(correlationMiddleware('orders'));
app.use(metricsMiddleware());
app.use(requestLoggingMiddleware(logger));

// 4. Expose metrics endpoint
app.get('/metrics', metricsEndpoint());
```

## Metrics Reference

### HTTP Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | method, route, status_code | Request latency |
| `http_requests_total` | Counter | method, route, status_code | Total request count |
| `http_active_connections` | Gauge | - | Current active connections |
| `http_request_size_bytes` | Histogram | method, route | Request body size |

### Queue Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `job_processing_duration_seconds` | Histogram | queue, job_type | Job processing time |

### Database Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `db_query_duration_seconds` | Histogram | operation, table | Query execution time |

### Node.js Runtime Metrics

Default Node.js metrics are automatically collected:
- `process_cpu_seconds_total`
- `process_resident_memory_bytes`
- `nodejs_eventloop_lag_seconds`
- `nodejs_active_handles_total`
- `nodejs_gc_duration_seconds`

## Alert Policy Matrix

### Critical Alerts (Page On-Call)

| Alert | Condition | Duration | Action |
|-------|-----------|----------|--------|
| Service Down | `up == 0` | 1 minute | Check container health, restart service |
| High Error Rate | `http_requests_total{status_code=~"5.*"} / http_requests_total > 0.05` | 5 minutes | Check logs, recent deployments |
| Database Connection Failure | `db_query_duration_seconds{error="true"} > 0` | 1 minute | Check PostgreSQL, connection pool |
| Redis Connection Failure | Queue health endpoint returns 503 | 1 minute | Check Redis, connection string |

### Warning Alerts (Slack Notification)

| Alert | Condition | Duration | Action |
|-------|-----------|----------|--------|
| High Latency | `http_request_duration_seconds{quantile="0.95"} > 2` | 5 minutes | Profile slow endpoints |
| Queue Backlog | Queue waiting count > 100 | 10 minutes | Scale workers, check for stuck jobs |
| DLQ Growth | DLQ entry count > 0 | 15 minutes | Inspect failed jobs, fix root cause |
| Memory Pressure | `process_resident_memory_bytes > 512MB` | 10 minutes | Check for memory leaks |
| High CPU | `process_cpu_seconds_total rate > 80%` | 5 minutes | Profile hot paths |

### Informational (Dashboard Only)

| Metric | Visualization | Notes |
|--------|--------------|-------|
| Request throughput | Time series | Requests per second by service |
| Response time percentiles | Heatmap | p50, p95, p99 latency |
| Error breakdown | Pie chart | By status code and route |
| Queue processing rate | Time series | Jobs processed per minute |

## Incident Diagnosis

### Step 1: Identify Scope

1. Check which services are affected (Grafana dashboards)
2. Look for correlation: multiple services failing often means infrastructure
3. Check recent deployments (last 30 minutes)

### Step 2: Gather Correlation

1. Get the `x-correlation-id` from error reports or user complaints
2. Search logs across services with that correlation ID:
   ```bash
   # If using centralized logging
   grep "correlationId" /var/log/arda/*.log | grep "<correlation-id>"
   ```

### Step 3: Check Infrastructure

1. **PostgreSQL**: Connection count, slow queries, disk space
2. **Redis**: Memory usage, connection count, keyspace
3. **Elasticsearch**: Cluster health, index sizes
4. **Docker/Railway**: Container health, resource limits

### Step 4: Analyze Logs

Structured JSON logs can be queried with `jq`:

```bash
# Find all errors for a correlation ID
cat service.log | jq 'select(.correlationId == "abc-123" and .level == "error")'

# Find slow requests
cat service.log | jq 'select(.duration > 1000)'

# Count errors by route
cat service.log | jq 'select(.level == "error") | .path' | sort | uniq -c | sort -rn
```

### Step 5: Check Sentry

1. Open Sentry dashboard for the affected service
2. Look at the error timeline for correlation with the incident
3. Check breadcrumbs for context leading up to the error
4. Review stack traces and user context

## Request Correlation

### How It Works

1. First service in the chain generates a UUID correlation ID
2. ID is passed in the `x-correlation-id` header to downstream services
3. Each service includes the correlation ID in all log entries
4. Sentry errors are tagged with the correlation ID

### Propagating to Downstream Services

```typescript
import { getCorrelationHeaders } from '@arda/observability';

// Include correlation headers in inter-service calls
const response = await fetch('http://catalog:3000/api/parts', {
  headers: {
    ...getCorrelationHeaders(),
    'Content-Type': 'application/json',
  },
});
```

## Grafana Dashboards

### Recommended Dashboards

1. **Service Overview**: Request rate, error rate, latency by service
2. **Infrastructure**: PostgreSQL, Redis, Elasticsearch health
3. **Queue Monitor**: Queue depth, processing rate, DLQ count
4. **Business Metrics**: Orders per hour, active users

### Prometheus Configuration

Prometheus scrapes metrics from each service's `/metrics` endpoint. See `docker-compose.yml` for the Prometheus service configuration and `monitoring/prometheus.yml` for scrape targets.

## Local Development

In local development:
- Sentry is disabled (no DSN configured)
- Metrics are collected but not scraped (no Prometheus)
- Correlation IDs are generated and logged
- Logs output to stdout in JSON format

To enable full observability locally:
```bash
docker compose --profile monitoring up -d
```

This starts Prometheus (port 9090) and Grafana (port 3100).
