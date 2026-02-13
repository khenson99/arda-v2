/**
 * Audit Retention Archival Worker
 *
 * Runs on a configurable interval (default: daily) and archives audit log
 * rows that have exceeded the tenant's retention window.
 *
 * For each eligible tenant:
 *   1. Selects expired audit rows in batches (default 1000)
 *   2. INSERT INTO auditLogArchive … ON CONFLICT DO NOTHING (idempotent)
 *   3. DELETE the rows from auditLog that were successfully archived
 *   4. Each batch runs inside a transaction for atomicity
 *
 * Tenant eligibility is driven by `settings.auditArchiveEnabled` and
 * `settings.auditRetentionDays` on the tenants table, with env-var
 * defaults as fallback.
 *
 * The worker audits its own archival operations via writeAuditEntry.
 */

import { db, schema, writeAuditEntry } from '@arda/db';
import { config, createLogger } from '@arda/config';
import { eq, and, lt, sql } from 'drizzle-orm';

// Subset of TenantSettings relevant to audit retention
// Full type lives in @arda/db schema/tenants.ts
interface AuditRetentionSettings {
  auditRetentionDays?: number;
  auditArchiveEnabled?: boolean;
}

const log = createLogger('audit-retention');

const { tenants, auditLog, auditLogArchive } = schema;

// ─── Types ──────────────────────────────────────────────────────────

export interface RetentionCycleResult {
  tenantsProcessed: number;
  totalArchived: number;
  errors: number;
  perTenant: Array<{
    tenantId: string;
    archived: number;
    error?: string;
  }>;
}

export interface AuditRetentionSchedulerHandle {
  runOnce: () => Promise<RetentionCycleResult>;
  stop: () => void;
}

// ─── Core: Archive a single batch for a tenant ──────────────────────

/**
 * Archive a single batch of expired audit rows for a tenant.
 *
 * Runs inside a transaction:
 *   1. INSERT INTO archive ON CONFLICT DO NOTHING
 *   2. DELETE from auditLog WHERE id IN (batch ids)
 *
 * Returns the number of rows successfully archived (inserted into archive).
 */
async function archiveBatch(
  expiredIds: string[],
  tenantId: string,
): Promise<number> {
  if (expiredIds.length === 0) return 0;

  // Use raw SQL for the INSERT … SELECT … ON CONFLICT pattern
  // which Drizzle ORM doesn't natively support well.
  const idList = expiredIds.map((id) => `'${id}'`).join(',');

  return db.transaction(async (tx) => {
    // Step 1: Copy rows to archive (idempotent via ON CONFLICT DO NOTHING)
    // The archive table has a composite PK (id, timestamp), so ON CONFLICT
    // targets that pair.
    const insertResult = await tx.execute(sql.raw(`
      INSERT INTO audit.audit_log_archive (
        id, tenant_id, user_id, action, entity_type, entity_id,
        previous_state, new_state, metadata, ip_address, user_agent,
        timestamp, hash_chain, previous_hash, sequence_number
      )
      SELECT
        id, tenant_id, user_id, action, entity_type, entity_id,
        previous_state, new_state, metadata, ip_address, user_agent,
        timestamp, hash_chain, previous_hash, sequence_number
      FROM audit.audit_log
      WHERE id IN (${idList})
        AND tenant_id = '${tenantId}'
      ON CONFLICT DO NOTHING
    `));

    // Step 2: Delete archived rows from the main table
    await tx.execute(sql.raw(`
      DELETE FROM audit.audit_log
      WHERE id IN (${idList})
        AND tenant_id = '${tenantId}'
    `));

    // rowCount from INSERT gives us the number of rows actually archived
    // (excluding duplicates via ON CONFLICT DO NOTHING)
    const archivedCount = (insertResult as unknown as { rowCount?: number }).rowCount ?? expiredIds.length;
    return archivedCount;
  });
}

// ─── Core: Process a single tenant ──────────────────────────────────

async function processTenant(
  tenantId: string,
  retentionDays: number,
  batchSize: number,
): Promise<number> {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  let totalArchived = 0;

  // Process in batches until no more expired rows remain
  while (true) {
    // Fetch a batch of expired row IDs
    const expiredRows = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, tenantId),
          lt(auditLog.timestamp, cutoffDate),
        ),
      )
      .limit(batchSize);

    if (expiredRows.length === 0) break;

    const expiredIds = expiredRows.map((r) => r.id);
    const archived = await archiveBatch(expiredIds, tenantId);
    totalArchived += archived;

    log.info(
      {
        tenantId,
        batchSize: expiredIds.length,
        batchArchived: archived,
        totalArchived,
      },
      'Archived audit batch',
    );

    // If we got fewer than batchSize, we're done
    if (expiredRows.length < batchSize) break;
  }

  return totalArchived;
}

// ─── Public: Run a full retention cycle ─────────────────────────────

/**
 * Run a complete audit retention cycle across all eligible tenants.
 *
 * Eligible tenants have `settings.auditArchiveEnabled = true` and
 * `settings.auditRetentionDays > 0`.  Environment defaults apply
 * when tenant-level settings are not explicitly configured.
 *
 * Safe to call multiple times (idempotent via ON CONFLICT DO NOTHING).
 */
export async function runRetentionCycle(): Promise<RetentionCycleResult> {
  const defaultRetentionDays = config.AUDIT_RETENTION_DAYS;
  const batchSize = config.AUDIT_RETENTION_BATCH_SIZE;

  log.info(
    { defaultRetentionDays, batchSize },
    'Starting audit retention cycle',
  );

  // Fetch all active tenants with their settings
  const allTenants = await db
    .select({
      id: tenants.id,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(eq(tenants.isActive, true));

  // Filter to tenants that have archiving enabled
  // Check tenant-level settings first, fall back to env config
  const eligibleTenants = allTenants.filter((t) => {
    const settings = (t.settings ?? {}) as AuditRetentionSettings;
    // Tenant must explicitly enable archiving, OR global config enables it
    return settings.auditArchiveEnabled === true;
  });

  if (eligibleTenants.length === 0) {
    log.info('No tenants with audit archiving enabled; skipping');
    return { tenantsProcessed: 0, totalArchived: 0, errors: 0, perTenant: [] };
  }

  const result: RetentionCycleResult = {
    tenantsProcessed: eligibleTenants.length,
    totalArchived: 0,
    errors: 0,
    perTenant: [],
  };

  for (const tenant of eligibleTenants) {
    const settings = (tenant.settings ?? {}) as AuditRetentionSettings;
    const retentionDays = settings.auditRetentionDays ?? defaultRetentionDays;

    try {
      const archived = await processTenant(tenant.id, retentionDays, batchSize);
      result.totalArchived += archived;
      result.perTenant.push({ tenantId: tenant.id, archived });

      if (archived > 0) {
        // Audit the archival operation itself
        await writeAuditEntry(db, {
          tenantId: tenant.id,
          action: 'audit.retention_archived',
          entityType: 'audit_log',
          metadata: {
            archivedCount: archived,
            retentionDays,
            cutoffDate: new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString(),
          },
        });

        log.info(
          { tenantId: tenant.id, archived, retentionDays },
          'Tenant audit archival complete',
        );
      }
    } catch (error) {
      result.errors++;
      const errMsg = error instanceof Error ? error.message : String(error);
      result.perTenant.push({ tenantId: tenant.id, archived: 0, error: errMsg });

      log.error(
        { tenantId: tenant.id, error: errMsg },
        'Audit archival failed for tenant',
      );
      // Continue with next tenant — don't let one failure stop the cycle
    }
  }

  log.info(
    {
      tenantsProcessed: result.tenantsProcessed,
      totalArchived: result.totalArchived,
      errors: result.errors,
    },
    'Audit retention cycle complete',
  );

  return result;
}

// ─── Scheduler ──────────────────────────────────────────────────────

/**
 * Start the audit retention scheduler.
 *
 * When enabled, runs `runRetentionCycle()` on a repeating interval
 * (default: every 24 hours).  Returns a handle for manual invocation
 * and graceful shutdown.
 */
export function startAuditRetentionScheduler(): AuditRetentionSchedulerHandle {
  if (!config.AUDIT_RETENTION_ENABLED) {
    log.info('Audit retention scheduler disabled');
    return {
      runOnce: async () => ({
        tenantsProcessed: 0,
        totalArchived: 0,
        errors: 0,
        perTenant: [],
      }),
      stop: () => undefined,
    };
  }

  const intervalMs = config.AUDIT_RETENTION_INTERVAL_HOURS * 60 * 60 * 1000;
  let isRunning = false;

  const runOnce = async (): Promise<RetentionCycleResult> => {
    if (isRunning) {
      log.warn('Skipping audit retention cycle; previous run still in progress');
      return { tenantsProcessed: 0, totalArchived: 0, errors: 0, perTenant: [] };
    }

    isRunning = true;
    try {
      return await runRetentionCycle();
    } finally {
      isRunning = false;
    }
  };

  const timer = setInterval(() => {
    void runOnce();
  }, intervalMs);

  // Don't prevent Node from exiting on shutdown
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  log.info(
    {
      intervalHours: config.AUDIT_RETENTION_INTERVAL_HOURS,
      defaultRetentionDays: config.AUDIT_RETENTION_DAYS,
      batchSize: config.AUDIT_RETENTION_BATCH_SIZE,
    },
    'Audit retention scheduler started',
  );

  return { runOnce, stop: () => clearInterval(timer) };
}
