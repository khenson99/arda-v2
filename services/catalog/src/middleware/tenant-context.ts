import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '@arda/auth-utils';

/**
 * Extracts tenantId from the JWT payload (set by the gateway's auth middleware)
 * and makes it available on req for service-level use.
 * The actual RLS SET LOCAL happens at the DB layer via withTenantContext().
 */
export function extractTenantId(req: AuthRequest, res: Response, next: NextFunction): void {
  // The gateway has already validated the JWT and set x-tenant-id / x-user-id headers,
  // OR the auth middleware on this service has parsed the JWT.
  // We read from the JWT payload attached by @arda/auth-utils middleware.
  if (!req.user?.tenantId) {
    res.status(401).json({ error: 'Tenant context missing' });
    return;
  }
  next();
}
