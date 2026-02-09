import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './middleware.js';
import {
  tenantContext,
  getTenantId,
  buildSetTenantSQL,
  type TenantRequest,
} from './tenant-context.js';

// ─── Helpers ────────────────────────────────────────────────────────
function createMockReq(user?: Partial<AuthRequest['user']>): Partial<AuthRequest> {
  return {
    user: user as AuthRequest['user'],
  };
}

function createMockRes(): Partial<Response> & { _status: number; _body: unknown } {
  const res = {
    _status: 0,
    _body: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
  };
  return res as unknown as Partial<Response> & { _status: number; _body: unknown };
}

// ─── Tests ──────────────────────────────────────────────────────────
describe('tenantContext middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('sets req.tenantId from authenticated user', () => {
    const req = createMockReq({
      sub: 'user-1',
      tenantId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'test@example.com',
      role: 'tenant_admin',
    });
    const res = createMockRes();

    tenantContext(req as Request, res as Response, next);

    expect((req as TenantRequest).tenantId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 if user is not set', () => {
    const req = createMockReq(undefined);
    const res = createMockRes();

    tenantContext(req as Request, res as Response, next);

    expect(res._status).toBe(401);
    expect(res._body).toMatchObject({ code: 'MISSING_TENANT_CONTEXT' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if tenantId is missing from user', () => {
    const req = createMockReq({
      sub: 'user-1',
      tenantId: '',
      email: 'test@example.com',
      role: 'tenant_admin',
    });
    const res = createMockRes();

    tenantContext(req as Request, res as Response, next);

    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 if tenantId is not a valid UUID', () => {
    const req = createMockReq({
      sub: 'user-1',
      tenantId: 'not-a-uuid',
      email: 'test@example.com',
      role: 'tenant_admin',
    });
    const res = createMockRes();

    tenantContext(req as Request, res as Response, next);

    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ code: 'INVALID_TENANT_ID' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts uppercase UUIDs', () => {
    const req = createMockReq({
      sub: 'user-1',
      tenantId: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
      email: 'test@example.com',
      role: 'tenant_admin',
    });
    const res = createMockRes();

    tenantContext(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as TenantRequest).tenantId).toBe('A1B2C3D4-E5F6-7890-ABCD-EF1234567890');
  });
});

describe('getTenantId', () => {
  it('returns tenantId from TenantRequest', () => {
    const req = { tenantId: 'tenant-uuid-here' } as unknown as Request;
    expect(getTenantId(req)).toBe('tenant-uuid-here');
  });

  it('falls back to user.tenantId if req.tenantId is not set', () => {
    const req = {
      user: { tenantId: 'fallback-tenant' },
    } as unknown as Request;
    expect(getTenantId(req)).toBe('fallback-tenant');
  });

  it('throws if no tenant context at all', () => {
    const req = {} as Request;
    expect(() => getTenantId(req)).toThrow('Tenant context not available');
  });
});

describe('buildSetTenantSQL', () => {
  it('generates valid set_config SQL', () => {
    const sql = buildSetTenantSQL('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(sql).toBe(
      "SELECT set_config('app.tenant_id', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', true)",
    );
  });

  it('escapes single quotes to prevent SQL injection', () => {
    const sql = buildSetTenantSQL("'; DROP TABLE users; --");
    expect(sql).toBe(
      "SELECT set_config('app.tenant_id', '''; DROP TABLE users; --', true)",
    );
    // The escaped value has doubled single quotes, making it safe
    expect(sql).not.toContain("''; DROP TABLE");
  });
});
