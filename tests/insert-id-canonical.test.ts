import { describe, it, expect, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SWEEP = path.join(ROOT, 'scripts/audit-insert-ids.cjs');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * P32-AUDITFIX — the same defect class as the AuditLog/logEvent bug fixed in
 * P32-admin, closed across the whole repository insert surface.
 *
 * The class: a table whose PRIMARY KEY is `varchar(36)` NOT NULL with NO
 * DEFAULT, whose repository INSERT omits the id column. MySQL then binds the
 * empty string, so the FIRST insert "succeeds" (one row with id='') and every
 * subsequent insert dies with
 *   ER_DUP_ENTRY "Duplicate entry '' for key 'PRIMARY'"
 * — silently disabling the feature after a single call.
 *
 * Three sites were affected: VerificationCode (email verification + password
 * reset), AiUsageLog (AI token/cost tracking) and Notification (all
 * notifications). Each is locked below, plus a schema-driven sweep proving the
 * class is closed rather than spot-fixed.
 */

/** Call a repository function with a mocked pool and return the bound params. */
async function captureParams(
  repoPath: string,
  exportName: string,
  fnName: string,
  args: unknown[],
): Promise<{ sql: string; params: unknown[] }> {
  vi.resetModules();
  let sql = '';
  let params: unknown[] = [];
  vi.doMock('@/lib/db/pool', () => ({
    executeQuery: vi.fn(async (q: string, p?: unknown[]) => {
      sql = q;
      params = p ?? [];
      return [];
    }),
  }));
  const mod = (await import(repoPath)) as Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>>;
  await mod[exportName][fnName](...args);
  return { sql, params };
}

describe('VerificationCode insert supplies a canonical id', () => {
  const ARGS = ['user-1', '123456', new Date('2030-01-01T00:00:00Z')];

  it('names the id column and binds a 36-char UUID first', async () => {
    const { sql, params } = await captureParams(
      '@/lib/db/repositories/auth.repo',
      'authRepository',
      'createCode',
      ARGS,
    );
    expect(sql).toMatch(/INSERT INTO VerificationCode \(id,/);
    const id = String(params[0]);
    expect(id).toMatch(UUID_RE);
    expect(id).toHaveLength(36);
    expect(id).not.toBe('');
    // The original arguments must still follow it, in order.
    expect(params.slice(1)).toEqual(ARGS);
  });

  it('two calls produce two distinct ids (the collision is gone)', async () => {
    vi.resetModules();
    const ids: string[] = [];
    vi.doMock('@/lib/db/pool', () => ({
      executeQuery: vi.fn(async (_q: string, p?: unknown[]) => {
        ids.push(String((p ?? [])[0]));
        return [];
      }),
    }));
    const { authRepository } = await import('@/lib/db/repositories/auth.repo');
    await authRepository.createCode('u1', '111111', new Date());
    await authRepository.createCode('u1', '222222', new Date());
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const i of ids) expect(i).toMatch(UUID_RE);
  });
});

describe('AiUsageLog insert supplies a canonical id', () => {
  const ARGS = [
    {
      providerId: 'prov-1',
      apiKeyId: 'key-1',
      doctorId: 'doc-1',
      promptTokens: 10,
      completionTokens: 20,
      estimatedCost: 0.5,
      responseTimeMs: 120,
      success: true,
      errorMessage: null,
      requestType: 'chat',
    },
  ];

  it('names the id column and binds a 36-char UUID first', async () => {
    const { sql, params } = await captureParams(
      '@/lib/db/repositories/ai.repo',
      'aiUsageRepository',
      'insert',
      ARGS,
    );
    expect(sql).toMatch(/INSERT INTO AiUsageLog \(id,/);
    const id = String(params[0]);
    expect(id).toMatch(UUID_RE);
    expect(id).toHaveLength(36);
    expect(id).not.toBe('');
    // Every original field is still supplied after the id.
    expect(params).toHaveLength(12);
    expect(params[1]).toBe('prov-1');
  });
});

describe('Notification insert supplies a canonical id', () => {
  const ARGS = [
    { userId: 'user-1', title: 'T', body: 'B', type: 'info', link: null },
  ];

  it('names the id column and binds a 36-char UUID first', async () => {
    const { sql, params } = await captureParams(
      '@/lib/db/repositories/notifications.repo',
      'notificationRepository',
      'insert',
      ARGS,
    );
    expect(sql).toMatch(/INSERT INTO Notification \(id,/);
    const id = String(params[0]);
    expect(id).toMatch(UUID_RE);
    expect(id).toHaveLength(36);
    expect(id).not.toBe('');
    expect(params.slice(1)).toEqual(['user-1', 'T', 'B', 'info', null]);
  });
});

describe('schema sweep: the empty-id defect class is closed', () => {
  it('no varchar(36)-PK-no-default table has an INSERT that omits its PK', () => {
    // Non-zero exit means at least one table is still vulnerable. The sweep
    // parses prisma/schema.sql for every table's PK and cross-references every
    // `INSERT INTO <table> (<columns>)` found under lib/**/*.repo.ts.
    expect(() => execFileSync('node', [SWEEP], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  });

  it('the sweep actually inspects the whole surface (guard against a vacuous pass)', () => {
    const out = execFileSync('node', [SWEEP], { cwd: ROOT, encoding: 'utf8' });
    const tables = Number(/tables in schema\s*:\s*(\d+)/.exec(out)?.[1] ?? 0);
    const inserts = Number(/INSERT sites scanned\s*:\s*(\d+)/.exec(out)?.[1] ?? 0);
    expect(tables, 'sweep found too few tables — parser regression').toBeGreaterThanOrEqual(50);
    expect(inserts, 'sweep found too few INSERT sites — parser regression').toBeGreaterThanOrEqual(45);
    expect(/VULNERABLE \(must be 0\)\s*:\s*0\b/.test(out)).toBe(true);
  });

  it('every fix uses a bound parameter, never an inline UUID() in SQL text', () => {
    for (const f of [
      'lib/db/repositories/auth.repo.ts',
      'lib/db/repositories/ai.repo.ts',
      'lib/db/repositories/notifications.repo.ts',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, `${f} must not inline UUID() in SQL`).not.toMatch(/VALUES \(UUID\(\)/);
      expect(src, `${f} must use bare 'crypto' (webpack rejects node:crypto)`).toMatch(
        /from 'crypto'/,
      );
      expect(src, `${f} must not import node:crypto`).not.toMatch(/from 'node:crypto'/);
    }
  });
});