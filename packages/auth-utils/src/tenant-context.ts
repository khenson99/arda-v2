import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './middleware.js';

// ─── Tenant Context Propagation Middleware ───────────────────────────
//
// This middleware extracts the tenantId from the authenticated user's JWT
// (set by authMiddleware) and attaches it to the request in a normalized
// location. It also sets the PostgreSQL session variable `app.tenant_id`
// for RLS policy enforcement.
//
// Usage:
//   app.use(authMiddleware);
//   app.use(tenantContext);
//   // ... routes can now use req.tenantId and RLS is active
//

export interface TenantRequest extends AuthRequest {
  tenantId: string;
}

/**
 * Express middleware that propagates the authenticated user's tenantId
 * into a top-level `req.tenantId` field and prepares the context for
 * PostgreSQL RLS enforcement (via setTenantContext).
 *
 * Must be used AFTER authMiddleware.
 */
export function tenantContext(req: Request, res: Response, next: NextFunction): void {
  const authReq = req as AuthRequest;

  if (!authReq.user?.tenantId) {
    res.status(401).json({
      error: 'Tenant context unavailable',
      code: 'MISSING_TENANT_CONTEXT',
    });
    return;
  }

  // Validate tenantId format (UUID v4)
  if (!isValidUuid(authReq.user.tenantId)) {
    res.status(400).json({
      error: 'Invalid tenant context',
      code: 'INVALID_TENANT_ID',
    });
    return;
  }

  // Attach tenantId at the top level for convenient access
  (req as TenantRequest).tenantId = authReq.user.tenantId;

  next();
}

/**
 * Extract tenantId from a request (utility for route handlers).
 * Throws if tenant context is not set.
 */
export function getTenantId(req: Request): string {
  const tenantReq = req as TenantRequest;
  if (!tenantReq.tenantId && !(tenantReq as AuthRequest).user?.tenantId) {
    throw new Error('Tenant context not available — is tenantContext middleware applied?');
  }
  return tenantReq.tenantId ?? (tenantReq as AuthRequest).user!.tenantId;
}

/**
 * Build a SQL statement to set the PostgreSQL session variable for RLS.
 * This should be executed at the start of each request's DB transaction.
 *
 * Usage with Drizzle:
 *   await db.execute(sql.raw(buildSetTenantSQL(tenantId)));
 *
 * Usage with raw pg:
 *   await client.query(buildSetTenantSQL(tenantId));
 */
export function buildSetTenantSQL(tenantId: string): string {
  // Use set_config() which is safe against SQL injection for the value parameter
  // set_config(setting, value, is_local) — is_local=true scopes to the current transaction
  return `SELECT set_config('app.tenant_id', '${escapeSqlString(tenantId)}', true)`;
}

// ─── Utilities ──────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Escape a string value for use in a SQL string literal.
 * Prevents SQL injection in set_config() calls.
 */
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
