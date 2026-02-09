import { describe, it, expect } from 'vitest';
import type { UserRole } from '@arda/shared-types';
import {
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissionsForRole,
  type PermissionString,
} from './permissions.js';

describe('Permission registry', () => {
  it('has no duplicate permission values', () => {
    const values = Object.values(Permission);
    const unique = new Set(values);
    expect(values.length).toBe(unique.size);
  });

  it('all permissions follow service:resource:action pattern', () => {
    const values = Object.values(Permission);
    for (const perm of values) {
      const parts = perm.split(':');
      expect(parts.length).toBeGreaterThanOrEqual(3);
      expect(parts[0]).toMatch(/^(auth|kanban|orders|catalog|notifications)$/);
    }
  });
});

describe('ROLE_PERMISSIONS', () => {
  const nonAdminRoles: Exclude<UserRole, 'tenant_admin'>[] = [
    'inventory_manager',
    'procurement_manager',
    'receiving_manager',
    'ecommerce_director',
    'salesperson',
    'executive',
  ];

  it('defines permissions for all non-admin roles', () => {
    for (const role of nonAdminRoles) {
      expect(ROLE_PERMISSIONS).toHaveProperty(role);
      expect(ROLE_PERMISSIONS[role].size).toBeGreaterThan(0);
    }
  });

  it('does not include tenant_admin in ROLE_PERMISSIONS', () => {
    expect(ROLE_PERMISSIONS).not.toHaveProperty('tenant_admin');
  });

  it('all role permission sets only contain valid permissions', () => {
    const validPerms = new Set(Object.values(Permission));
    for (const role of nonAdminRoles) {
      for (const perm of ROLE_PERMISSIONS[role]) {
        expect(validPerms.has(perm)).toBe(true);
      }
    }
  });
});

describe('hasPermission', () => {
  it('tenant_admin always returns true', () => {
    for (const perm of Object.values(Permission)) {
      expect(hasPermission('tenant_admin', perm)).toBe(true);
    }
  });

  it('inventory_manager can create loops', () => {
    expect(hasPermission('inventory_manager', Permission.KANBAN_LOOPS_CREATE)).toBe(true);
  });

  it('salesperson cannot create loops', () => {
    expect(hasPermission('salesperson', Permission.KANBAN_LOOPS_CREATE)).toBe(false);
  });

  it('procurement_manager can create POs', () => {
    expect(hasPermission('procurement_manager', Permission.ORDERS_PURCHASE_ORDERS_CREATE)).toBe(true);
  });

  it('receiving_manager can receive POs', () => {
    expect(hasPermission('receiving_manager', Permission.ORDERS_PURCHASE_ORDERS_RECEIVE)).toBe(true);
  });

  it('receiving_manager cannot create POs', () => {
    expect(hasPermission('receiving_manager', Permission.ORDERS_PURCHASE_ORDERS_CREATE)).toBe(false);
  });

  it('executive can read audit logs', () => {
    expect(hasPermission('executive', Permission.ORDERS_AUDIT_READ)).toBe(true);
  });

  it('executive cannot create work orders', () => {
    expect(hasPermission('executive', Permission.ORDERS_WORK_ORDERS_CREATE)).toBe(false);
  });

  it('returns false for unknown roles', () => {
    expect(hasPermission('unknown_role' as UserRole, Permission.KANBAN_LOOPS_READ)).toBe(false);
  });
});

describe('hasAllPermissions', () => {
  it('returns true when role has all permissions', () => {
    expect(
      hasAllPermissions('inventory_manager', [
        Permission.KANBAN_LOOPS_READ,
        Permission.KANBAN_LOOPS_CREATE,
      ]),
    ).toBe(true);
  });

  it('returns false when role is missing one permission', () => {
    expect(
      hasAllPermissions('salesperson', [
        Permission.CATALOG_PARTS_READ,
        Permission.CATALOG_PARTS_CREATE,
      ]),
    ).toBe(false);
  });
});

describe('hasAnyPermission', () => {
  it('returns true when role has at least one permission', () => {
    expect(
      hasAnyPermission('salesperson', [
        Permission.CATALOG_PARTS_READ,
        Permission.KANBAN_LOOPS_CREATE, // salesperson doesn't have this
      ]),
    ).toBe(true);
  });

  it('returns false when role has none of the permissions', () => {
    expect(
      hasAnyPermission('salesperson', [
        Permission.KANBAN_LOOPS_CREATE,
        Permission.ORDERS_WORK_ORDERS_CREATE,
      ]),
    ).toBe(false);
  });
});

describe('getPermissionsForRole', () => {
  it('returns all permissions for tenant_admin', () => {
    const perms = getPermissionsForRole('tenant_admin');
    expect(perms.length).toBe(Object.values(Permission).length);
  });

  it('returns subset for non-admin roles', () => {
    const allPerms = Object.values(Permission).length;
    const salesPerms = getPermissionsForRole('salesperson');
    expect(salesPerms.length).toBeLessThan(allPerms);
    expect(salesPerms.length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown roles', () => {
    const perms = getPermissionsForRole('unknown' as UserRole);
    expect(perms).toEqual([]);
  });
});
