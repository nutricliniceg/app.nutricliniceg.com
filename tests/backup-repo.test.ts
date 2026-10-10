import { describe, it, expect, vi, beforeEach } from 'vitest';
import { backupRepository, CHECKSUM_TABLES } from '@/lib/db/repositories/backup.repo';
import { executeQuery } from '@/lib/db/pool';

vi.mock('@/lib/db/pool');

type Mock = ReturnType<typeof vi.fn>;

describe('backup.repo (SEC-07/08, SEC-22)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a backup report with a generated UUID and parameterized values', async () => {
    (executeQuery as unknown as Mock).mockResolvedValue([]);
    await backupRepository.insertReport({
      filePath: '/secure-backups/a.sql.enc',
      bytes: 1024,
      offServer: null,
      status: 'local-only',
      detail: 'S3 env absent',
    });
    const [sql, params] = (executeQuery as unknown as Mock).mock.calls[0];
    expect(sql).toContain('INSERT INTO BackupReport');
    expect(sql).not.toContain('UUID()');
    expect(params[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(params[1]).toBe('/secure-backups/a.sql.enc');
    // No literal interpolation of caller data (D-01).
    expect(sql).not.toContain('/secure-backups/a.sql.enc');
  });

  it('rowCounts queries every checksum table in the given schema', async () => {
    (executeQuery as unknown as Mock).mockResolvedValue([{ count: 3 }]);
    const counts = await backupRepository.rowCounts('nutrivbis_staging');
    expect(Object.keys(counts).sort()).toEqual([...CHECKSUM_TABLES].sort());
    for (const table of CHECKSUM_TABLES) {
      expect(counts[table]).toBe(3);
    }
    const calls = (executeQuery as unknown as Mock).mock.calls;
    expect(calls).toHaveLength(CHECKSUM_TABLES.length);
    expect(calls[0][0]).toContain('nutrivbis_staging');
  });

  it('marks an unreadable table as -1 instead of throwing', async () => {
    (executeQuery as unknown as Mock).mockRejectedValue(new Error('Table missing'));
    const counts = await backupRepository.rowCounts('scratch');
    for (const table of CHECKSUM_TABLES) {
      expect(counts[table]).toBe(-1);
    }
  });

  it('never interpolates a table name outside the fixed allowlist', async () => {
    (executeQuery as unknown as Mock).mockResolvedValue([{ count: 1 }]);
    await backupRepository.rowCounts('db');
    for (const call of (executeQuery as unknown as Mock).mock.calls) {
      const sql = call[0] as string;
      const matched = CHECKSUM_TABLES.filter((t) => sql.includes('`' + t + '`'));
      expect(matched.length).toBe(1);
    }
  });
});

describe('backup.service layering (D-01 / §6.2)', () => {
  it('holds no SQL of its own', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('lib/backup/backup.service.ts', 'utf8');
    expect(src).not.toMatch(/INSERT INTO|SELECT COUNT|DELETE FROM|UPDATE \w+ SET/);
    expect(src).toContain('backupRepository');
    expect(src).not.toContain('@/lib/db/pool');
  });
});