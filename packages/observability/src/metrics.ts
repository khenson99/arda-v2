/**
 * @arda/observability — Prometheus-compatible metrics
 *
 * Provides pre-configured metrics and middleware for HTTP request
 * monitoring. Uses prom-client for Prometheus compatibility.
 */

import client, { Registry, Histogram, Gauge, Counter } from 'prom-client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Shared metric registry */
const registry = new Registry();

// Enable default metrics (Node.js runtime metrics)
client.collectDefaultMetrics({ register: registry });

/**
 * HTTP request duration histogram.
 *
 * Labels: method, route, status_code
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * Active HTTP connections gauge.
 */
export const activeConnections = new Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections',
  registers: [registry],
});

/**
 * Total HTTP requests counter.
 *
 * Labels: method, route, status_code
 */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [registry],
});

/**
 * HTTP request size histogram.
 */
export const httpRequestSize = new Histogram({
  name: 'http_request_size_bytes',
  help: 'Size of HTTP request bodies in bytes',
  labelNames: ['method', 'route'] as const,
  buckets: [100, 1000, 10000, 100000, 1000000],
  registers: [registry],
});

/**
 * Queue job processing duration histogram.
 *
 * Labels: queue, job_type
 */
export const jobProcessingDuration = new Histogram({
  name: 'job_processing_duration_seconds',
  help: 'Duration of background job processing in seconds',
  labelNames: ['queue', 'job_type'] as const,
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 120],
  registers: [registry],
});

/**
 * Database query duration histogram.
 *
 * Labels: operation, table
 */
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});

/**
 * Normalize an Express route path for metric labels.
 *
 * Replaces dynamic segments with placeholders to avoid high cardinality.
 * e.g., /api/orders/abc-123 -> /api/orders/:id
 */
function normalizeRoute(req: Request): string {
  // Use Express route pattern if available
  if (req.route?.path) {
    return req.baseUrl + req.route.path;
  }
  // Fallback: replace UUID-like and numeric segments
  return req.path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/**
 * Express middleware that records HTTP request metrics.
 *
 * Must be registered early in the middleware chain.
 *
 * @returns Express middleware function
 *
 * @example
 * ```ts
 * import { metricsMiddleware } from '@arda/observability';
 * app.use(metricsMiddleware());
 * ```
 */
export function metricsMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    activeConnections.inc();
    const end = httpRequestDuration.startTimer();

    // Track request size
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10);

    res.on('finish', () => {
      const route = normalizeRoute(req);
      const labels = {
        method: req.method,
        route,
        status_code: String(res.statusCode),
      };

      end(labels);
      httpRequestsTotal.inc(labels);
      activeConnections.dec();

      if (contentLength > 0) {
        httpRequestSize.observe(
          { method: req.method, route },
          contentLength,
        );
      }
    });

    next();
  };
}

/**
 * Express handler that serves Prometheus-formatted metrics.
 *
 * @returns Express request handler
 *
 * @example
 * ```ts
 * import { metricsEndpoint } from '@arda/observability';
 * app.get('/metrics', metricsEndpoint());
 * ```
 */
export function metricsEndpoint(): RequestHandler {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await registry.metrics();
      res.set('Content-Type', registry.contentType);
      res.end(metrics);
    } catch (err) {
      res.status(500).end('Error collecting metrics');
    }
  };
}

/**
 * Get the shared metrics registry (for custom metrics).
 */
export function getRegistry(): Registry {
  return registry;
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics(): void {
  registry.resetMetrics();
}
