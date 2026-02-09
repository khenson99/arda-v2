/**
 * @arda/observability — Enhanced structured logging with correlation
 *
 * Extends Pino with automatic correlation ID injection and
 * request-scoped context.
 */

import pino, { type Logger, type LoggerOptions } from 'pino';
import { getCorrelationContext } from './correlation.js';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Options for creating a correlated logger.
 */
export interface CorrelatedLoggerOptions {
  /** Service name */
  service: string;
  /** Log level (default: based on NODE_ENV) */
  level?: string;
  /** Environment name */
  environment?: string;
}

/**
 * Create a Pino logger that automatically includes correlation context.
 *
 * Every log entry will include:
 * - `correlationId`: The request correlation ID
 * - `service`: The service name
 * - `environment`: The environment name
 *
 * @param opts - Logger configuration
 * @returns A Pino logger instance
 *
 * @example
 * ```ts
 * const logger = createCorrelatedLogger({ service: 'orders' });
 * logger.info('Order created'); // includes correlationId automatically
 * ```
 */
export function createCorrelatedLogger(opts: CorrelatedLoggerOptions): Logger {
  const isProduction = (opts.environment ?? process.env.NODE_ENV) === 'production';

  const pinoOpts: LoggerOptions = {
    name: opts.service,
    level: opts.level ?? (isProduction ? 'info' : 'debug'),
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    mixin() {
      const ctx = getCorrelationContext();
      return {
        correlationId: ctx?.correlationId ?? 'none',
        service: opts.service,
        ...(opts.environment && { environment: opts.environment }),
      };
    },
    ...(!isProduction && {
      transport: {
        target: 'pino/file',
        options: { destination: 1 },
      },
    }),
  };

  return pino(pinoOpts);
}

/**
 * Express middleware that logs request start and finish.
 *
 * Logs:
 * - Request received (method, path, correlation ID)
 * - Request completed (method, path, status code, duration)
 *
 * @param logger - Pino logger instance
 * @returns Express middleware function
 *
 * @example
 * ```ts
 * const logger = createCorrelatedLogger({ service: 'orders' });
 * app.use(requestLoggingMiddleware(logger));
 * ```
 */
export function requestLoggingMiddleware(logger: Logger): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    // Log request received
    logger.info({
      msg: 'request received',
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    // Log response on finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const logData = {
        msg: 'request completed',
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      };

      if (res.statusCode >= 500) {
        logger.error(logData);
      } else if (res.statusCode >= 400) {
        logger.warn(logData);
      } else {
        logger.info(logData);
      }
    });

    next();
  };
}
