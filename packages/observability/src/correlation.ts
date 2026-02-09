/**
 * @arda/observability — Request correlation ID middleware
 *
 * Assigns a unique correlation ID to every incoming request.
 * The ID propagates through logs, inter-service calls, and error reports.
 */

import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Header name for correlation ID propagation */
export const CORRELATION_HEADER = 'x-correlation-id';

/** Header name for the originating service */
export const SERVICE_HEADER = 'x-service-name';

/** Async local storage for correlation context */
const correlationStore = new AsyncLocalStorage<CorrelationContext>();

/**
 * Correlation context available throughout a request lifecycle.
 */
export interface CorrelationContext {
  /** Unique request correlation ID */
  correlationId: string;
  /** Service that originated the request chain */
  originService?: string;
  /** Current service name */
  serviceName: string;
  /** Request start timestamp */
  startTime: number;
}

/**
 * Get the current correlation context from async local storage.
 *
 * @returns The current correlation context, or undefined if outside a request
 */
export function getCorrelationContext(): CorrelationContext | undefined {
  return correlationStore.getStore();
}

/**
 * Get the current correlation ID.
 *
 * @returns The correlation ID, or 'unknown' if outside a request
 */
export function getCorrelationId(): string {
  const ctx = correlationStore.getStore();
  return ctx?.correlationId ?? 'unknown';
}

/**
 * Express middleware that establishes request correlation.
 *
 * - Reads correlation ID from incoming `x-correlation-id` header (for inter-service calls)
 * - Generates a new UUID if no header is present
 * - Sets the correlation ID on the response header
 * - Stores context in AsyncLocalStorage for access anywhere in the request
 *
 * @param serviceName - Name of the current service
 * @returns Express middleware function
 *
 * @example
 * ```ts
 * import { correlationMiddleware } from '@arda/observability';
 * app.use(correlationMiddleware('orders'));
 * ```
 */
export function correlationMiddleware(serviceName: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const correlationId = (req.headers[CORRELATION_HEADER] as string) ?? randomUUID();
    const originService = req.headers[SERVICE_HEADER] as string | undefined;

    // Set correlation ID on response
    res.setHeader(CORRELATION_HEADER, correlationId);
    res.setHeader(SERVICE_HEADER, serviceName);

    const context: CorrelationContext = {
      correlationId,
      originService,
      serviceName,
      startTime: Date.now(),
    };

    // Run the rest of the request within the correlation context
    correlationStore.run(context, () => {
      next();
    });
  };
}

/**
 * Get headers to propagate correlation to downstream services.
 *
 * Use these headers when making HTTP calls to other Arda services.
 *
 * @returns Headers object for inter-service communication
 *
 * @example
 * ```ts
 * const headers = getCorrelationHeaders();
 * await fetch('http://catalog:3000/api/parts', { headers });
 * ```
 */
export function getCorrelationHeaders(): Record<string, string> {
  const ctx = correlationStore.getStore();
  if (!ctx) {
    return {};
  }

  return {
    [CORRELATION_HEADER]: ctx.correlationId,
    [SERVICE_HEADER]: ctx.serviceName,
  };
}
