import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('@arda/config', () => ({
  config: {},
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import {
  ASYNC_THRESHOLD,
  createExportJob,
  getExportJobStatus,
  getExportJobFile,
  processExportJob,
  cleanupExpiredJobs,
  _resetJobStore,
  _getJobStore,
} from './audit-export-job.service.js';
import type { ExportJobFilters } from './audit-export-job.service.js';

// ─── Test Helpers ────────────────────────────────────────────────────

const TENANT_A = '00000000-0000-0000-0000-000000000001';
const TENANT_B = '00000000-0000-0000-0000-000000000002';
const USER_A = '00000000-0000-0000-0000-00000000000a';

const sampleFilters: ExportJobFilters = {
  action: 'po.created',
  dateFrom: '2025-01-01T00:00:00Z',
  dateTo: '2025-12-31T23:59:59Z',
};

// ─── Setup / Teardown ────────────────────────────────────────────────

beforeEach(() => {
  _resetJobStore();
});

afterEach(() => {
  _resetJobStore();
});

// ─── ASYNC_THRESHOLD ─────────────────────────────────────────────────

describe('ASYNC_THRESHOLD', () => {
  it('equals 50,000', () => {
    expect(ASYNC_THRESHOLD).toBe(50_000);
  });
});

// ─── createExportJob ─────────────────────────────────────────────────

describe('createExportJob', () => {
  it('creates a job with pending status', () => {
    const result = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 60_000);

    expect(result.status).toBe('pending');
    expect(result.estimatedRows).toBe(60_000);
    expect(result.jobId).toBeDefined();
    expect(result.pollUrl).toBe(`/api/audit/export/${result.jobId}`);
  });

  it('stores the job in the internal store', () => {
    const result = createExportJob(TENANT_A, USER_A, 'json', sampleFilters, 75_000);

    const store = _getJobStore();
    expect(store.has(result.jobId)).toBe(true);

    const job = store.get(result.jobId)!;
    expect(job.tenantId).toBe(TENANT_A);
    expect(job.userId).toBe(USER_A);
    expect(job.format).toBe('json');
    expect(job.estimatedRows).toBe(75_000);
    expect(job.filters).toEqual(sampleFilters);
  });

  it('generates unique job IDs for each call', () => {
    const result1 = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 50_000);
    const result2 = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 50_000);

    expect(result1.jobId).not.toBe(result2.jobId);
  });
});

// ─── getExportJobStatus ──────────────────────────────────────────────

describe('getExportJobStatus', () => {
  it('returns job status for the correct tenant', () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    const status = getExportJobStatus(jobId, TENANT_A);

    expect(status).not.toBeNull();
    expect(status!.jobId).toBe(jobId);
    expect(status!.status).toBe('pending');
    expect(status!.estimatedRows).toBe(55_000);
    expect(status!.createdAt).toBeDefined();
    expect(status!.updatedAt).toBeDefined();
  });

  it('returns null for wrong tenant (tenant isolation)', () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    const status = getExportJobStatus(jobId, TENANT_B);

    expect(status).toBeNull();
  });

  it('returns null for non-existent job ID', () => {
    const status = getExportJobStatus('00000000-0000-0000-0000-999999999999', TENANT_A);

    expect(status).toBeNull();
  });

  it('includes downloadUrl when job is completed', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    await processExportJob(
      jobId,
      async () => [{ id: '1', action: 'test' }],
      async (entries) => ({ data: 'id,action\n1,test', checksum: 'abc123' }),
    );

    const status = getExportJobStatus(jobId, TENANT_A);

    expect(status!.status).toBe('completed');
    expect(status!.downloadUrl).toBe(`/api/audit/export/${jobId}/download`);
    expect(status!.checksum).toBe('abc123');
    expect(status!.completedAt).toBeDefined();
  });

  it('includes error when job has failed', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    await processExportJob(
      jobId,
      async () => { throw new Error('Database connection lost'); },
      async () => ({ data: '', checksum: '' }),
    );

    const status = getExportJobStatus(jobId, TENANT_A);

    expect(status!.status).toBe('failed');
    expect(status!.error).toBe('Database connection lost');
  });
});

// ─── processExportJob ────────────────────────────────────────────────

describe('processExportJob', () => {
  it('transitions job from pending to processing to completed', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    const store = _getJobStore();
    expect(store.get(jobId)!.status).toBe('pending');

    await processExportJob(
      jobId,
      async () => [{ id: '1', action: 'test', entityType: 'order' }],
      async (entries) => ({
        data: 'id,action,entityType\n1,test,order',
        checksum: 'sha256-test',
      }),
    );

    const job = store.get(jobId)!;
    expect(job.status).toBe('completed');
    expect(job.filePath).toBeDefined();
    expect(job.checksum).toBe('sha256-test');
    expect(job.fileSize).toBeGreaterThan(0);
    expect(job.completedAt).toBeDefined();
  });

  it('transitions job to failed on fetch error', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'json', sampleFilters, 55_000);

    await processExportJob(
      jobId,
      async () => { throw new Error('Query timeout'); },
      async () => ({ data: '', checksum: '' }),
    );

    const store = _getJobStore();
    const job = store.get(jobId)!;
    expect(job.status).toBe('failed');
    expect(job.error).toBe('Query timeout');
  });

  it('transitions job to failed on export generator error', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    await processExportJob(
      jobId,
      async () => [{ id: '1' }],
      async () => { throw new Error('CSV generation failed'); },
    );

    const store = _getJobStore();
    const job = store.get(jobId)!;
    expect(job.status).toBe('failed');
    expect(job.error).toBe('CSV generation failed');
  });

  it('handles non-existent job ID gracefully', async () => {
    // Should not throw
    await processExportJob(
      'non-existent-id',
      async () => [],
      async () => ({ data: '', checksum: '' }),
    );
  });

  it('writes file to disk for completed jobs', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    await processExportJob(
      jobId,
      async () => [{ id: '1', action: 'test' }],
      async () => ({
        data: 'id,action\n1,test',
        checksum: 'checksum-val',
      }),
    );

    const store = _getJobStore();
    const job = store.get(jobId)!;
    expect(job.filePath).toBeDefined();
    expect(existsSync(job.filePath!)).toBe(true);

    // Clean up
    unlinkSync(job.filePath!);
  });
});

// ─── getExportJobFile ────────────────────────────────────────────────

describe('getExportJobFile', () => {
  it('returns null for non-existent job', () => {
    const result = getExportJobFile('no-such-id', TENANT_A);
    expect(result).toBeNull();
  });

  it('returns null for wrong tenant (tenant isolation)', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    await processExportJob(
      jobId,
      async () => [{ id: '1' }],
      async () => ({ data: 'data', checksum: 'cs' }),
    );

    const result = getExportJobFile(jobId, TENANT_B);
    expect(result).toBeNull();

    // Clean up file
    const store = _getJobStore();
    const job = store.get(jobId);
    if (job?.filePath && existsSync(job.filePath)) {
      unlinkSync(job.filePath);
    }
  });

  it('returns null for pending job (not yet completed)', () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    const result = getExportJobFile(jobId, TENANT_A);
    expect(result).toBeNull();
  });

  it('returns file info for completed job', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'json', sampleFilters, 55_000);

    await processExportJob(
      jobId,
      async () => [{ id: '1' }],
      async () => ({ data: '{"entries":[]}', checksum: 'json-cs' }),
    );

    const result = getExportJobFile(jobId, TENANT_A);
    expect(result).not.toBeNull();
    expect(result!.format).toBe('json');
    expect(result!.checksum).toBe('json-cs');
    expect(result!.filePath).toBeDefined();

    // Clean up
    if (existsSync(result!.filePath)) {
      unlinkSync(result!.filePath);
    }
  });
});

// ─── cleanupExpiredJobs ──────────────────────────────────────────────

describe('cleanupExpiredJobs', () => {
  it('removes completed jobs older than 24 hours', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    // Complete the job
    await processExportJob(
      jobId,
      async () => [{ id: '1' }],
      async () => ({ data: 'data', checksum: 'cs' }),
    );

    // Backdate the job's createdAt to > 24 hours ago
    const store = _getJobStore();
    const job = store.get(jobId)!;
    job.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);

    const result = cleanupExpiredJobs();

    expect(result.removed).toBe(1);
    expect(store.has(jobId)).toBe(false);
  });

  it('does NOT remove jobs younger than 24 hours', () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    const store = _getJobStore();
    // Job was just created, so it's well within 24h

    const result = cleanupExpiredJobs();

    expect(result.removed).toBe(0);
    expect(store.has(jobId)).toBe(true);
  });

  it('does NOT remove in-progress jobs even if old', () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    const store = _getJobStore();
    const job = store.get(jobId)!;
    job.status = 'processing';
    job.createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h ago

    const result = cleanupExpiredJobs();

    expect(result.removed).toBe(0);
    expect(store.has(jobId)).toBe(true);
  });

  it('removes failed jobs older than 24 hours', () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    const store = _getJobStore();
    const job = store.get(jobId)!;
    job.status = 'failed';
    job.error = 'Some error';
    job.createdAt = new Date(Date.now() - 30 * 60 * 60 * 1000);

    const result = cleanupExpiredJobs();

    expect(result.removed).toBe(1);
    expect(store.has(jobId)).toBe(false);
  });

  it('removes artifact file from disk when cleaning up', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 55_000);

    await processExportJob(
      jobId,
      async () => [{ id: '1' }],
      async () => ({ data: 'export-data', checksum: 'cs' }),
    );

    const store = _getJobStore();
    const job = store.get(jobId)!;
    const filePath = job.filePath!;
    expect(existsSync(filePath)).toBe(true);

    // Backdate
    job.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);

    cleanupExpiredJobs();

    expect(existsSync(filePath)).toBe(false);
  });
});

// ─── Row Count Threshold Logic ───────────────────────────────────────

describe('row count threshold logic', () => {
  it('threshold is exactly 50,000', () => {
    expect(ASYNC_THRESHOLD).toBe(50_000);
  });

  it('49,999 rows is below threshold (sync path)', () => {
    const count = 49_999;
    expect(count < ASYNC_THRESHOLD).toBe(true);
  });

  it('50,000 rows is at threshold (async path)', () => {
    const count = 50_000;
    expect(count >= ASYNC_THRESHOLD).toBe(true);
  });

  it('50,001 rows is above threshold (async path)', () => {
    const count = 50_001;
    expect(count >= ASYNC_THRESHOLD).toBe(true);
  });

  it('0 rows is below threshold (sync path)', () => {
    const count = 0;
    expect(count < ASYNC_THRESHOLD).toBe(true);
  });
});

// ─── Tenant Isolation ────────────────────────────────────────────────

describe('tenant isolation', () => {
  it('tenant B cannot see tenant A jobs via getExportJobStatus', () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 60_000);

    expect(getExportJobStatus(jobId, TENANT_A)).not.toBeNull();
    expect(getExportJobStatus(jobId, TENANT_B)).toBeNull();
  });

  it('tenant B cannot download tenant A files via getExportJobFile', async () => {
    const { jobId } = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 60_000);

    await processExportJob(
      jobId,
      async () => [{ id: '1' }],
      async () => ({ data: 'secret-data', checksum: 'cs' }),
    );

    expect(getExportJobFile(jobId, TENANT_A)).not.toBeNull();
    expect(getExportJobFile(jobId, TENANT_B)).toBeNull();

    // Clean up
    const store = _getJobStore();
    const job = store.get(jobId);
    if (job?.filePath && existsSync(job.filePath)) {
      unlinkSync(job.filePath);
    }
  });

  it('multiple tenants can have independent jobs', () => {
    const job1 = createExportJob(TENANT_A, USER_A, 'csv', sampleFilters, 60_000);
    const job2 = createExportJob(TENANT_B, USER_A, 'json', sampleFilters, 70_000);

    expect(getExportJobStatus(job1.jobId, TENANT_A)).not.toBeNull();
    expect(getExportJobStatus(job2.jobId, TENANT_B)).not.toBeNull();

    // Cross-tenant access blocked
    expect(getExportJobStatus(job1.jobId, TENANT_B)).toBeNull();
    expect(getExportJobStatus(job2.jobId, TENANT_A)).toBeNull();
  });
});
