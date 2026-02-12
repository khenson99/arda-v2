import { createHash } from 'node:crypto';
import { eq, sql, desc, and } from 'drizzle-orm';
import { auditLog } from './schema/audit.js';
import type { DbOrTransaction } from './client.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface AuditEntryInput {
  tenantId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  previousState?: unknown;
  newState?: unknown;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp?: Date;
}

export interface AuditEntryResult {
  id: string;
  hashChain: string;
  sequenceNumber: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const GENESIS_SENTINEL = 'GENESIS';

/**
 * Deterministic advisory lock key derived from tenant UUID.
 * pg_advisory_xact_lock takes a bigint, so we use the first 8 bytes
 * of the tenant UUID (stripped of hyphens) as a stable numeric key.
 */
function tenantLockKey(tenantId: string): string {
  // Convert first 16 hex chars of UUID to a bigint for the advisory lock.
  // This gives us a unique-enough key per tenant.
  const hex = tenantId.replace(/-/g, '').slice(0, 16);
  // Use BigInt to handle the full range, then convert to string for SQL
  return BigInt(`0x${hex}`).toString();
}

/**
 * Compute the SHA-256 hash for an audit entry.
 *
 * Format matches the backfill migration (0008_audit_hash_chain.sql):
 *   tenant_id|sequence_number|action|entity_type|entity_id|timestamp|previous_hash
 *
 * - First entry per tenant uses 'GENESIS' as previous_hash input
 * - NULL entity_id is represented as empty string
 */
function computeHash(input: {
  tenantId: string;
  sequenceNumber: number;
  action: string;
  entityType: string;
  entityId: string | null | undefined;
  timestamp: Date;
  previousHash: string | null;
}): string {
  const prevHash = input.previousHash ?? GENESIS_SENTINEL;
  const entityId = input.entityId ?? '';
  const payload = [
    input.tenantId,
    input.sequenceNumber.toString(),
    input.action,
    input.entityType,
    entityId,
    input.timestamp.toISOString(),
    prevHash,
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
}

// ─── Core Writer ────────────────────────────────────────────────────

/**
 * Write an immutable, hash-chained audit log entry.
 *
 * This function:
 * 1. Acquires a per-tenant advisory lock (transaction-scoped) to serialize writes
 * 2. Reads the latest sequence number and hash for the tenant
 * 3. Computes the next sequence number and SHA-256 hash chain value
 * 4. Inserts the new audit row with computed integrity fields
 *
 * Must be called within a transaction (`db.transaction(async (tx) => { ... })`).
 * The advisory lock is automatically released when the transaction commits/rolls back.
 *
 * @param dbOrTx - Drizzle database or transaction instance
 * @param entry - The audit entry fields
 * @returns The inserted row's id, hashChain, and sequenceNumber
 */
export async function writeAuditEntry(
  dbOrTx: DbOrTransaction,
  entry: AuditEntryInput,
): Promise<AuditEntryResult> {
  const ts = entry.timestamp ?? new Date();

  // 1. Acquire per-tenant advisory lock (scoped to the current transaction).
  //    This serializes concurrent audit writes for the same tenant,
  //    preventing sequence gaps and hash-chain forks.
  const lockKey = tenantLockKey(entry.tenantId);
  await dbOrTx.execute(sql.raw(`SELECT pg_advisory_xact_lock(${lockKey})`));

  // 2. Read the latest entry for this tenant to get previous hash + sequence.
  const [latest] = await dbOrTx
    .select({
      hashChain: auditLog.hashChain,
      sequenceNumber: auditLog.sequenceNumber,
    })
    .from(auditLog)
    .where(and(
      eq(auditLog.tenantId, entry.tenantId),
      // Exclude rows with PENDING hash (written by legacy code)
      sql`${auditLog.hashChain} != 'PENDING'`,
    ))
    .orderBy(desc(auditLog.sequenceNumber))
    .limit(1);

  const previousHash = latest?.hashChain ?? null;
  const nextSequence = latest ? latest.sequenceNumber + 1 : 1;

  // 3. Compute SHA-256 hash chain value.
  const hashChain = computeHash({
    tenantId: entry.tenantId,
    sequenceNumber: nextSequence,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    timestamp: ts,
    previousHash,
  });

  // 4. Insert the audit row.
  const [inserted] = await dbOrTx
    .insert(auditLog)
    .values({
      tenantId: entry.tenantId,
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      previousState: entry.previousState ?? null,
      newState: entry.newState ?? null,
      metadata: entry.metadata ?? {},
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      timestamp: ts,
      hashChain,
      previousHash,
      sequenceNumber: nextSequence,
    })
    .returning({
      id: auditLog.id,
      hashChain: auditLog.hashChain,
      sequenceNumber: auditLog.sequenceNumber,
    });

  return inserted;
}

/**
 * Write multiple audit entries for the same tenant in a single call.
 * Each entry is chained sequentially (entry N's hash depends on entry N-1).
 *
 * Must be called within a transaction.
 *
 * @param dbOrTx - Drizzle database or transaction instance
 * @param tenantId - The tenant all entries belong to
 * @param entries - Array of audit entry inputs (tenantId in each is ignored; uses the tenantId param)
 * @returns Array of inserted results in the same order as input
 */
export async function writeAuditEntries(
  dbOrTx: DbOrTransaction,
  tenantId: string,
  entries: Omit<AuditEntryInput, 'tenantId'>[],
): Promise<AuditEntryResult[]> {
  if (entries.length === 0) return [];

  // Acquire the advisory lock once for the batch.
  const lockKey = tenantLockKey(tenantId);
  await dbOrTx.execute(sql.raw(`SELECT pg_advisory_xact_lock(${lockKey})`));

  // Read latest chain state.
  const [latest] = await dbOrTx
    .select({
      hashChain: auditLog.hashChain,
      sequenceNumber: auditLog.sequenceNumber,
    })
    .from(auditLog)
    .where(and(
      eq(auditLog.tenantId, tenantId),
      sql`${auditLog.hashChain} != 'PENDING'`,
    ))
    .orderBy(desc(auditLog.sequenceNumber))
    .limit(1);

  let previousHash = latest?.hashChain ?? null;
  let nextSequence = latest ? latest.sequenceNumber + 1 : 1;

  const results: AuditEntryResult[] = [];

  for (const entry of entries) {
    const ts = entry.timestamp ?? new Date();

    const hashChain = computeHash({
      tenantId,
      sequenceNumber: nextSequence,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      timestamp: ts,
      previousHash,
    });

    const [inserted] = await dbOrTx
      .insert(auditLog)
      .values({
        tenantId,
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        previousState: entry.previousState ?? null,
        newState: entry.newState ?? null,
        metadata: entry.metadata ?? {},
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        timestamp: ts,
        hashChain,
        previousHash,
        sequenceNumber: nextSequence,
      })
      .returning({
        id: auditLog.id,
        hashChain: auditLog.hashChain,
        sequenceNumber: auditLog.sequenceNumber,
      });

    results.push(inserted);
    previousHash = hashChain;
    nextSequence++;
  }

  return results;
}

// Re-export computeHash for testing / verification use cases
export { computeHash as _computeHash };
