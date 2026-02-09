/**
 * @arda/observability — Sentry error tracking
 *
 * Wraps the Sentry SDK for consistent initialization and error
 * capture across all Arda services.
 */

import * as Sentry from '@sentry/node';

export interface SentryOptions {
  /** Sentry DSN (Data Source Name) */
  dsn: string;
  /** Service name for identification */
  service: string;
  /** Environment name (development, staging, production) */
  environment: string;
  /** Sample rate for error events (0.0 to 1.0, default: 1.0) */
  sampleRate?: number;
  /** Sample rate for performance tracing (0.0 to 1.0, default: 0.1) */
  tracesSampleRate?: number;
  /** Application version / release tag */
  release?: string;
}

/** Whether Sentry has been initialized */
let initialized = false;

/**
 * Initialize Sentry for the current service.
 *
 * Call this once at application startup, before any request handling.
 * Safe to call multiple times (subsequent calls are no-ops).
 *
 * @param opts - Sentry configuration options
 *
 * @example
 * ```ts
 * initSentry({
 *   dsn: process.env.SENTRY_DSN!,
 *   service: 'orders',
 *   environment: 'production',
 * });
 * ```
 */
export function initSentry(opts: SentryOptions): void {
  if (initialized) return;
  if (!opts.dsn) return;

  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment,
    release: opts.release,
    sampleRate: opts.sampleRate ?? 1.0,
    tracesSampleRate: opts.tracesSampleRate ?? 0.1,
    serverName: opts.service,
    integrations: [],
  });

  // Set service context
  Sentry.setTag('service', opts.service);

  initialized = true;
}

/**
 * Capture an exception and send it to Sentry.
 *
 * Safe to call even if Sentry is not initialized (will be a no-op).
 *
 * @param err - The error to capture
 * @param context - Optional additional context
 *
 * @example
 * ```ts
 * try {
 *   await processOrder(order);
 * } catch (err) {
 *   captureException(err as Error, { orderId: order.id });
 * }
 * ```
 */
export function captureException(
  err: Error,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;

  Sentry.withScope((scope: { setExtras: (extras: Record<string, unknown>) => void }) => {
    if (context) {
      scope.setExtras(context);
    }
    Sentry.captureException(err);
  });
}

/**
 * Capture a breadcrumb for debugging context.
 *
 * @param message - Breadcrumb message
 * @param category - Category for grouping
 * @param data - Additional data
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>,
): void {
  if (!initialized) return;

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
    timestamp: Date.now() / 1000,
  });
}

/**
 * Set user context for error tracking.
 *
 * @param user - User information
 */
export function setUser(user: { id: string; email?: string; tenantId?: string }): void {
  if (!initialized) return;

  Sentry.setUser({
    id: user.id,
    email: user.email,
  });

  if (user.tenantId) {
    Sentry.setTag('tenantId', user.tenantId);
  }
}

/**
 * Flush pending Sentry events (call before process exit).
 *
 * @param timeout - Timeout in milliseconds (default: 2000)
 */
export async function flushSentry(timeout = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeout);
}

/**
 * Check if Sentry is initialized.
 */
export function isSentryInitialized(): boolean {
  return initialized;
}

/**
 * Reset Sentry initialization state (for testing only).
 */
export function _resetSentry(): void {
  initialized = false;
}
