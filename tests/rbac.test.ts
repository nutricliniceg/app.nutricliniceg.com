import { describe, it, expect } from 'vitest';
import { hasPermission, PERMISSIONS, RBAC_MATRIX, type Role } from '@/lib/security/rbac';

describe('RBAC Matrix', () => {
  it('should allow doctor to manage own data', () => {
    expect(hasPermission('doctor', PERMISSIONS.MANAGE_OWN_DATA)).toBe(true);
  });

  it('should deny doctor access to admin permissions', () => {
    expect(hasPermission('doctor', PERMISSIONS.MANAGE_USERS)).toBe(false);
    expect(hasPermission('doctor', PERMISSIONS.MANAGE_SUBSCRIPTIONS)).toBe(false);
    expect(hasPermission('doctor', PERMISSIONS.MANAGE_CMS)).toBe(false);
    expect(hasPermission('doctor', PERMISSIONS.ACCESS_AUDIT_LOG)).toBe(false);
    expect(hasPermission('doctor', PERMISSIONS.MANAGE_SYSTEM_SETTINGS)).toBe(false);
  });

  it('should allow admin to manage users, subscriptions, and CMS', () => {
    expect(hasPermission('admin', PERMISSIONS.MANAGE_USERS)).toBe(true);
    expect(hasPermission('admin', PERMISSIONS.MANAGE_SUBSCRIPTIONS)).toBe(true);
    expect(hasPermission('admin', PERMISSIONS.MANAGE_CMS)).toBe(true);
    expect(hasPermission('admin', PERMISSIONS.ACCESS_AUDIT_LOG)).toBe(false);
    expect(hasPermission('admin', PERMISSIONS.MANAGE_SYSTEM_SETTINGS)).toBe(false);
  });

  it('should allow super_admin all permissions', () => {
    const allPermissions = Object.values(PERMISSIONS);
    for (const perm of allPermissions) {
      expect(hasPermission('super_admin', perm)).toBe(true);
    }
  });

  it('should have correct matrix structure', () => {
    expect(RBAC_MATRIX.doctor).toContain(PERMISSIONS.MANAGE_OWN_DATA);
    expect(RBAC_MATRIX.admin).toHaveLength(3);
    expect(RBAC_MATRIX.super_admin).toHaveLength(6);
  });
});