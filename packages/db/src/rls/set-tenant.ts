import { sql } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Set the PostgreSQL session variable `app.tenant_id` for the current transaction.
 * This activates RLS policies that restrict data access to the specified tenant.
 *
 * Must be called inside a transaction for the `is_local=true` scoping to work:
 *
 * ```ts
 * await db.transaction(async (tx) => {
 *   await setTenantContext(tx, tenantId);
 *   // ... all queries in this transaction are now tenant-scoped
 * });
 * ```
 *
 * Outside a transaction, the setting persists for the connection session.
 */
export async function setTenantContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbOrTx: PgDatabase<any, any, any>,
  tenantId: string,
): Promise<void> {
  // Use parameterized set_config to prevent SQL injection.
  // is_local=true scopes the setting to the current transaction.
  await dbOrTx.execute(
    sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`
  );
}

/**
 * Clear the tenant context (set to empty string).
 * Useful for cleanup in tests or after a transaction.
 */
export async function clearTenantContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbOrTx: PgDatabase<any, any, any>,
): Promise<void> {
  await dbOrTx.execute(
    sql`SELECT set_config('app.tenant_id', '', true)`
  );
}

/**
 * Get the currently set tenant ID from the PostgreSQL session.
 * Returns null if not set or empty.
 */
export async function getCurrentTenantId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbOrTx: PgDatabase<any, any, any>,
): Promise<string | null> {
  const result = await dbOrTx.execute(
    sql`SELECT current_setting('app.tenant_id', true) as tenant_id`
  );
  const tenantId = (result as unknown as { rows: Array<{ tenant_id: string }> }).rows?.[0]?.tenant_id;
  return tenantId || null;
}
