import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogger } from '@arda/config';

const log = createLogger('audit-export-jobs');

// ─── Types ───────────────────────────────────────────────────────────

export type ExportJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ExportFormat = 'csv' | 'json' | 'pdf';

export interface ExportJobFilters {
  action?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  actorName?: string;
  entityName?: string;
  search?: string;
  includeArchived?: boolean;
}

export interface ExportJob {
  jobId: string;
  tenantId: string;
  userId: string;
  format: ExportFormat;
  filters: ExportJobFilters;
  status: ExportJobStatus;
  estimatedRows: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  filePath?: string;
  downloadUrl?: string;
  error?: string;
  checksum?: string;
  fileSize?: number;
}

export interface CreateExportJobResult {
  jobId: string;
  status: ExportJobStatus;
  estimatedRows: number;
  pollUrl: string;
}

export interface ExportJobStatusResult {
  jobId: string;
  status: ExportJobStatus;
  estimatedRows: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  downloadUrl?: string;
  error?: string;
  checksum?: string;
  fileSize?: number;
}

// ─── Constants ───────────────────────────────────────────────────────

export const ASYNC_THRESHOLD = 50_000;
const EXPORT_DIR = join(tmpdir(), 'audit-exports');
const JOB_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ─── In-Memory Job Store ─────────────────────────────────────────────

const jobStore = new Map<string, ExportJob>();

/** Exposed for testing — clears all jobs from the store. */
export function _resetJobStore(): void {
  jobStore.clear();
}

/** Exposed for testing — access the raw store. */
export function _getJobStore(): Map<string, ExportJob> {
  return jobStore;
}

// ─── Ensure export directory exists ──────────────────────────────────

function ensureExportDir(): void {
  if (!existsSync(EXPORT_DIR)) {
    mkdirSync(EXPORT_DIR, { recursive: true });
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Create a new async export job. Returns metadata for the 202 response.
 */
export function createExportJob(
  tenantId: string,
  userId: string,
  format: ExportFormat,
  filters: ExportJobFilters,
  estimatedRows: number,
): CreateExportJobResult {
  const jobId = randomUUID();

  const job: ExportJob = {
    jobId,
    tenantId,
    userId,
    format,
    filters,
    status: 'pending',
    estimatedRows,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  jobStore.set(jobId, job);

  log.info({ jobId, tenantId, format, estimatedRows }, 'Export job created');

  return {
    jobId,
    status: 'pending',
    estimatedRows,
    pollUrl: `/api/audit/export/${jobId}`,
  };
}

/**
 * Retrieve the current status of an export job.
 * Enforces tenant isolation — returns null if the job doesn't belong to the tenant.
 */
export function getExportJobStatus(
  jobId: string,
  tenantId: string,
): ExportJobStatusResult | null {
  const job = jobStore.get(jobId);

  if (!job || job.tenantId !== tenantId) {
    return null;
  }

  const result: ExportJobStatusResult = {
    jobId: job.jobId,
    status: job.status,
    estimatedRows: job.estimatedRows,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };

  if (job.completedAt) {
    result.completedAt = job.completedAt.toISOString();
  }
  if (job.downloadUrl) {
    result.downloadUrl = job.downloadUrl;
  }
  if (job.error) {
    result.error = job.error;
  }
  if (job.checksum) {
    result.checksum = job.checksum;
  }
  if (job.fileSize !== undefined) {
    result.fileSize = job.fileSize;
  }

  return result;
}

/**
 * Process an export job asynchronously.
 *
 * Takes a `fetchEntries` callback that fetches audit entries using the
 * same query logic as the sync path. Takes an `exportEntries` callback
 * that generates the formatted output (CSV/JSON/PDF) using the existing
 * sync export generators.
 *
 * This design reuses the synchronous export generators to avoid format drift.
 */
export async function processExportJob(
  jobId: string,
  fetchEntries: () => Promise<unknown[]>,
  exportEntries: (entries: unknown[]) => Promise<{ data: string | Buffer; checksum: string }>,
): Promise<void> {
  const job = jobStore.get(jobId);
  if (!job) {
    log.error({ jobId }, 'Export job not found for processing');
    return;
  }

  // Transition to processing
  job.status = 'processing';
  job.updatedAt = new Date();
  log.info({ jobId, tenantId: job.tenantId }, 'Export job processing started');

  try {
    // Fetch all entries
    const entries = await fetchEntries();

    // Generate export using the same generators as the sync path
    const { data, checksum } = await exportEntries(entries);

    // Write to file
    ensureExportDir();
    const ext = job.format === 'pdf' ? 'pdf' : job.format;
    const fileName = `export-${job.jobId}.${ext}`;
    const filePath = join(EXPORT_DIR, fileName);

    if (Buffer.isBuffer(data)) {
      writeFileSync(filePath, data);
    } else {
      writeFileSync(filePath, data, 'utf-8');
    }

    const fileSize = Buffer.isBuffer(data)
      ? data.length
      : Buffer.byteLength(data, 'utf-8');

    // Mark completed
    job.status = 'completed';
    job.completedAt = new Date();
    job.updatedAt = new Date();
    job.filePath = filePath;
    job.downloadUrl = `/api/audit/export/${job.jobId}/download`;
    job.checksum = checksum;
    job.fileSize = fileSize;

    log.info(
      { jobId, tenantId: job.tenantId, fileSize, checksum },
      'Export job completed',
    );
  } catch (err) {
    job.status = 'failed';
    job.updatedAt = new Date();
    job.error =
      err instanceof Error ? err.message : 'Unknown error during export';

    log.error(
      { jobId, tenantId: job.tenantId, error: job.error },
      'Export job failed',
    );
  }
}

/**
 * Get the file path of a completed export job for streaming the download.
 * Returns null if the job doesn't exist, doesn't belong to the tenant,
 * or is not yet completed.
 */
export function getExportJobFile(
  jobId: string,
  tenantId: string,
): { filePath: string; format: ExportFormat; checksum?: string } | null {
  const job = jobStore.get(jobId);

  if (!job || job.tenantId !== tenantId) {
    return null;
  }

  if (job.status !== 'completed' || !job.filePath) {
    return null;
  }

  if (!existsSync(job.filePath)) {
    return null;
  }

  return {
    filePath: job.filePath,
    format: job.format,
    checksum: job.checksum,
  };
}

/**
 * Remove completed or failed jobs older than 24 hours,
 * including their artifact files on disk.
 */
export function cleanupExpiredJobs(): { removed: number } {
  const now = Date.now();
  let removed = 0;

  for (const [jobId, job] of jobStore.entries()) {
    const age = now - job.createdAt.getTime();

    if (age < JOB_EXPIRY_MS) {
      continue;
    }

    // Only clean up terminal states
    if (job.status !== 'completed' && job.status !== 'failed') {
      continue;
    }

    // Remove artifact file if it exists
    if (job.filePath && existsSync(job.filePath)) {
      try {
        unlinkSync(job.filePath);
      } catch (err) {
        log.warn(
          { jobId, filePath: job.filePath, error: (err as Error).message },
          'Failed to remove export artifact',
        );
      }
    }

    jobStore.delete(jobId);
    removed++;
  }

  if (removed > 0) {
    log.info({ removed }, 'Cleaned up expired export jobs');
  }

  return { removed };
}

// ─── Periodic Cleanup ────────────────────────────────────────────────

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startCleanupScheduler(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    cleanupExpiredJobs();
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref(); // Don't prevent process exit
}

export function stopCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
