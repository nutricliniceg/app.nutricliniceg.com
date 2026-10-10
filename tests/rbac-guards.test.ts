import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { isAdminRole, isSuperRole, isStaffRole, isDoctorRole, PERMISSIONS, hasPermission } from '@/lib/security/rbac';

const ROOT = process.cwd();

function routeFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === 'route.ts') out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
    }
  };
  walk(path.join(ROOT, 'app', 'api'));
  return out;
}

describe('role predicates (shared guards)', () => {
  it('isAdminRole accepts admin and super_admin only', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('super_admin')).toBe(true);
    expect(isAdminRole('doctor')).toBe(false);
    expect(isAdminRole('')).toBe(false);
    // A crafted role must not slip through prefix/substring matching.
    expect(isAdminRole('super_admin ')).toBe(false);
    expect(isAdminRole('ADMIN')).toBe(false);
    expect(isAdminRole('super_administrator')).toBe(false);
  });

  it('isSuperRole accepts super_admin only', () => {
    expect(isSuperRole('super_admin')).toBe(true);
    expect(isSuperRole('admin')).toBe(false);
    expect(isSuperRole('doctor')).toBe(false);
  });

  it('isStaffRole accepts every staff tier including doctor', () => {
    expect(isStaffRole('doctor')).toBe(true);
    expect(isStaffRole('admin')).toBe(true);
    expect(isStaffRole('super_admin')).toBe(true);
    expect(isStaffRole('patient')).toBe(false);
  });

  it('predicates agree with the permission matrix', () => {
    // A doctor cannot MANAGE_USERS, i.e. is not an admin.
    expect(hasPermission('doctor', PERMISSIONS.MANAGE_USERS)).toBe(false);
    expect(isAdminRole('doctor')).toBe(false);
    // An admin can MANAGE_USERS.
    expect(hasPermission('admin', PERMISSIONS.MANAGE_USERS)).toBe(true);
    expect(isAdminRole('admin')).toBe(true);
    // Only super_admin holds MANAGE_SYSTEM_SETTINGS.
    expect(hasPermission('admin', PERMISSIONS.MANAGE_SYSTEM_SETTINGS)).toBe(false);
    expect(isSuperRole('admin')).toBe(false);
    expect(hasPermission('super_admin', PERMISSIONS.MANAGE_SYSTEM_SETTINGS)).toBe(true);
    expect(isSuperRole('super_admin')).toBe(true);
    expect(isDoctorRole('doctor')).toBe(true);
    expect(isDoctorRole('admin')).toBe(false);
  });
});

describe('admin route guards are not re-inlined (dedup gate)', () => {
  it('no API route declares its own admin/super role comparison', () => {
    const offenders: string[] = [];
    for (const f of routeFiles()) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const code = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      // Any direct comparison against a role literal is a re-inline.
      if (/(role\s*!==?\s*'(?:admin|super_admin|doctor)'|role\s*===\s*'(?:admin|super_admin)')/.test(code)) {
        offenders.push(f);
      }
    }
    expect(offenders, `inline role comparisons:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no API route re-declares a local role helper function', () => {
    const offenders: string[] = [];
    for (const f of routeFiles()) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (/function\s+(denied|isAdminRole|isSuper|requireSuper)\s*\(/.test(src)) offenders.push(f);
    }
    expect(offenders, `local role helpers:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every /api/admin route imports the shared rbac helpers', () => {
    const offenders: string[] = [];
    for (const f of routeFiles()) {
      if (!f.startsWith('app/api/admin/')) continue;
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (src.includes('isAdminRole(') && !src.includes("from '@/lib/security/rbac'")) offenders.push(f);
    }
    expect(offenders, `admin routes using the guard without importing it:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('admin route 404 shape for a non-admin caller', () => {
  beforeEach(() => vi.resetModules());

  it('GET /api/admin/users answers 404 (not 403) to a doctor', async () => {
    vi.doMock('@/lib/security/session', () => ({
      verifyTokenFromRequest: vi.fn(async () => ({ sub: 'u1', role: 'doctor', email: 'd@x.com' })),
      createSessionCookie: vi.fn(),
      destroySession: vi.fn(),
      verifyTokenString: vi.fn(),
    }));
    const mod = await import('@/app/api/admin/users/route');
    const res = await mod.GET(new NextRequest('https://app.test/api/admin/users'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(body.success).toBe(false);
    // Generic message: the route must not confirm it exists to non-admins.
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).not.toMatch(/forbidden|unauthorized/i);
  });

  it('GET /api/admin/users answers 200 to an admin', async () => {
    vi.doMock('@/lib/security/session', () => ({
      verifyTokenFromRequest: vi.fn(async () => ({ sub: 'a1', role: 'admin', email: 'a@x.com' })),
      createSessionCookie: vi.fn(),
      destroySession: vi.fn(),
      verifyTokenString: vi.fn(),
    }));
    vi.doMock('@/lib/admin/users.service', () => ({
      adminUsersService: { list: vi.fn(async () => ({ users: [], total: 0 })) },
    }));
    const mod = await import('@/app/api/admin/users/route');
    const res = await mod.GET(new NextRequest('https://app.test/api/admin/users'));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { success: boolean }).success).toBe(true);
  });

  it('answers 401 when no session cookie is present', async () => {
    vi.doMock('@/lib/security/session', () => ({
      verifyTokenFromRequest: vi.fn(async () => null),
      createSessionCookie: vi.fn(),
      destroySession: vi.fn(),
      verifyTokenString: vi.fn(),
    }));
    const mod = await import('@/app/api/admin/users/route');
    const res = await mod.GET(new NextRequest('https://app.test/api/admin/users'));
    expect(res.status).toBe(401);
  });
});