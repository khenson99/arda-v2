import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted Mocks ──────────────────────────────────────────────────
const mockExecute = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [] }));

vi.mock('drizzle-orm', () => ({
  sql: (...args: unknown[]) => ({ args, type: 'sql' }),
}));

// ─── Import After Mocks ─────────────────────────────────────────────
import { setTenantContext, clearTenantContext, getCurrentTenantId } from './set-tenant.js';

// ─── Tests ──────────────────────────────────────────────────────────
describe('RLS tenant context helpers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = { execute: mockExecute };
  });

  describe('setTenantContext', () => {
    it('calls execute with set_config SQL', async () => {
      await setTenantContext(mockDb, 'tenant-uuid-123');

      expect(mockExecute).toHaveBeenCalledTimes(1);
      const call = mockExecute.mock.calls[0][0];
      // The sql tagged template produces an object; verify it was called
      expect(call).toBeDefined();
    });

    it('accepts any valid string as tenantId', async () => {
      await setTenantContext(mockDb, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearTenantContext', () => {
    it('calls execute to clear the tenant context', async () => {
      await clearTenantContext(mockDb);

      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentTenantId', () => {
    it('returns the tenant ID when set', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ tenant_id: 'tenant-123' }],
      });

      const result = await getCurrentTenantId(mockDb);
      expect(result).toBe('tenant-123');
    });

    it('returns null when not set', async () => {
      mockExecute.mockResolvedValueOnce({
        rows: [{ tenant_id: '' }],
      });

      const result = await getCurrentTenantId(mockDb);
      expect(result).toBeNull();
    });

    it('returns null when rows are empty', async () => {
      mockExecute.mockResolvedValueOnce({ rows: [] });

      const result = await getCurrentTenantId(mockDb);
      expect(result).toBeNull();
    });
  });
});
