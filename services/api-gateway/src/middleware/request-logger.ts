import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    const message = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;

    if (logLevel === 'warn') {
      console.warn(`[gateway] ${message}`);
    } else {
      console.log(`[gateway] ${message}`);
    }
  });

  next();
}
