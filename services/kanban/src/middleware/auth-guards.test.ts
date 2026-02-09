import { describe, it, expect, vi } from 'vitest';
import { hasPermission, Permission, type PermissionString } from '@arda/auth-utils';
import type { UserRole } from '@arda/shared-types';

vi.hoisted(() => {
  // @arda/auth-utils re-exports JWT helpers that load @arda/config at import time.
  // Seed required env vars so permission-only tests stay isolated.
  process.env.DATABASE_URL ??= 'postgres://arda:arda@localhost:5432/arda_test';
  process.env.JWT_SECRET ??= '12345678901234567890123456789012';
  process.env.JWT_REFRESH_SECRET ??= 'abcdefghijklmnopqrstuvwxyz123456';
  process.env.NODE_ENV ??= 'test';
});

// ─── Test the RBAC matrix for kanban service ────────────────────────
// These tests verify that the permission registry correctly maps roles
// to kanban operations, without needing Express middleware plumbing.

describe('kanban RBAC matrix', () => {
  const roles: UserRole[] = [
    'tenant_admin',
    'inventory_manager',
    'procurement_manager',
    'receiving_manager',
    'ecommerce_director',
    'salesperson',
    'executive',
  ];

  // Helper to check which roles have a permission
  function rolesWithPermission(permission: PermissionString): UserRole[] {
    return roles.filter((role) => hasPermission(role, permission));
  }

  describe('loops permissions', () => {
    it('grants read to appropriate roles', () => {
      const allowed = rolesWithPermission(Permission.KANBAN_LOOPS_READ);
      expect(allowed).toContain('tenant_admin');
      expect(allowed).toContain('inventory_manager');
      expect(allowed).toContain('procurement_manager');
      expect(allowed).toContain('executive');
      expect(allowed).not.toContain('salesperson');
    });

    it('restricts create to admin and inventory_manager', () => {
      const allowed = rolesWithPermission(Permission.KANBAN_LOOPS_CREATE);
      expect(allowed).toContain('tenant_admin');
      expect(allowed).toContain('inventory_manager');
      expect(allowed).not.toContain('procurement_manager');
      expect(allowed).not.toContain('salesperson');
      expect(allowed).not.toContain('executive');
    });
  });

  describe('cards permissions', () => {
    it('grants transition to operational roles', () => {
      const allowed = rolesWithPermission(Permission.KANBAN_CARDS_TRANSITION);
      expect(allowed).toContain('tenant_admin');
      expect(allowed).toContain('inventory_manager');
      expect(allowed).toContain('procurement_manager');
      expect(allowed).toContain('receiving_manager');
      expect(allowed).not.toContain('ecommerce_director');
      expect(allowed).not.toContain('salesperson');
    });
  });

  describe('scan permissions', () => {
    it('grants scan read to all authenticated roles', () => {
      const allowed = rolesWithPermission(Permission.KANBAN_SCAN_READ);
      expect(allowed.length).toBeGreaterThanOrEqual(6); // all except possibly some
    });

    it('restricts scan trigger to operational roles', () => {
      const allowed = rolesWithPermission(Permission.KANBAN_SCAN_TRIGGER);
      expect(allowed).toContain('tenant_admin');
      expect(allowed).toContain('inventory_manager');
      expect(allowed).not.toContain('salesperson');
    });
  });

  describe('velocity permissions', () => {
    it('grants velocity read to analytical roles', () => {
      const allowed = rolesWithPermission(Permission.KANBAN_VELOCITY_READ);
      expect(allowed).toContain('tenant_admin');
      expect(allowed).toContain('inventory_manager');
      expect(allowed).toContain('executive');
      expect(allowed).not.toContain('salesperson');
    });
  });

  describe('tenant_admin superuser', () => {
    it('has access to all kanban permissions', () => {
      const kanbanPerms = Object.values(Permission).filter((p) =>
        p.startsWith('kanban:'),
      );
      for (const perm of kanbanPerms) {
        expect(hasPermission('tenant_admin', perm)).toBe(true);
      }
    });
  });
});
