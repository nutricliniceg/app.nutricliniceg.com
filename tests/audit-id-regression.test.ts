import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const AUTH_REPO = path.join(ROOT, 'lib/db/repositories/auth.repo.ts');
const CREATE_ADMIN = path.join(ROOT, 'scripts/create-admin.ts');

/** Strip comments so assertions match code, not the prose around it. */
function code(file: string): string {
  return fs
    .readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** Strip comments AND string literals, leaving identifiers only. */
function idents(file: string): string {
  return code(file)
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * P32-admin regression: `Duplicate entry '' for key 'PRIMARY'` on staging.
 *
 * Root cause was NOT the bootstrap CLI's insert. `authRepository.logEvent`
 * omitted the `id` column, and `AuditLog.id` is `varchar(36) PRIMARY KEY` NOT
 * NULL with NO default — so MySQL bound the empty string. The first call
 * "succeeded" (one row with id=''), and every call after it threw ER_DUP_ENTRY.
 * logEvent backs doctor registration (USER_REGISTERED) and login-failure
 * logging (LOGIN_FAILED), so the audit trail was broken app-wide.
 */
describe('authRepository.logEvent supplies an id', () => {
  it('the INSERT names the id column', () => {
    expect(code(AUTH_REPO)).toMatch(/INSERT INTO AuditLog \(id,/);
  });

  it('the id is generated as a bound parameter, not left to MySQL', () => {
    const src = idents(AUTH_REPO);
    // randomUUID() is imported and used, and the id is the first bound param.
    expect(src).toMatch(/randomUUID\(\)/);
    // No inline UUID() in SQL text — the P33 convention is a bound parameter.
    expect(src).not.toMatch(/VALUES \(UUID\(\)/);
  });

  it('never inserts an empty or undefined id', async () => {
    vi.resetModules();
    const seen: unknown[][] = [];
    vi.doMock('@/lib/db/pool', () => ({
      executeQuery: vi.fn(async (_sql: string, params?: unknown[]) => {
        seen.push(params ?? []);
        return [];
      }),
    }));
    const { authRepository } = await import('@/lib/db/repositories/auth.repo');
    await authRepository.logEvent('user-1', 'USER_REGISTERED', { a: 1 });

    expect(seen).toHaveLength(1);
    const params = seen[0] as unknown[];
    const id = params[0];
    expect(id, 'logEvent must bind an id as the first parameter').toBeTypeOf('string');
    expect(String(id)).toMatch(UUID_RE);
    expect(String(id)).not.toBe('');
    expect(String(id).length).toBe(36);
  });

  it('two consecutive calls produce two distinct ids (the collision is gone)', async () => {
    vi.resetModules();
    const ids: string[] = [];
    vi.doMock('@/lib/db/pool', () => ({
      executeQuery: vi.fn(async (_sql: string, params?: unknown[]) => {
        ids.push(String((params ?? [])[0]));
        return [];
      }),
    }));
    const { authRepository } = await import('@/lib/db/repositories/auth.repo');
    await authRepository.logEvent('u1', 'LOGIN_FAILED', {});
    await authRepository.logEvent(null, 'LOGIN_FAILED', {});
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe('create-admin never submits an empty id', () => {
  it('the create payload carries a real UUID, generated in-process', () => {
    const src = idents(CREATE_ADMIN);
    expect(src).toMatch(/randomUUID\(\)/);
    // The payload must not carry an id literal or an empty-string fallback.
    expect(src).not.toMatch(/id: *['"`]/);
    expect(src).not.toMatch(/id: *\?\? *['"`]/);
  });

  it('routes creation through the repository, never a hand-rolled INSERT', () => {
    const src = idents(CREATE_ADMIN);
    expect(src).toMatch(/userRepository\.create/);
    expect(src).not.toMatch(/INSERT INTO/i);
    expect(src).not.toMatch(/executeQuery/);
  });

  it('reports the account identity even when the audit write fails', () => {
    const src = code(CREATE_ADMIN);
    // The audit block is guarded, and the failure is surfaced separately
    // instead of collapsing into a generic "FAILED" that implies no write.
    expect(src).toMatch(/catch \(err\)/);
    expect(src).toMatch(/ACCOUNT CREATED, BUT THE AUDIT WRITE FAILED/);
    expect(src).toMatch(/auditWriteFailed/);
    // And the process still signals the incomplete state.
    expect(src).toMatch(/auditWriteFailed \? 3 : 0/);
  });

  it('prints the id/email/role block AFTER the account exists', () => {
    const src = code(CREATE_ADMIN);
    const createAt = src.indexOf('userRepository.create(');
    const verifyAt = src.indexOf('userRepository.verifyEmail(', createAt);
    // Anchor the print search AFTER create(): the reconcile branch prints an
    // identical block earlier in the file and would otherwise match first.
    const printAt = src.indexOf("console.log('  id    : '", createAt);
    expect(createAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeGreaterThan(createAt);
    expect(printAt).toBeGreaterThan(verifyAt);
  });
});