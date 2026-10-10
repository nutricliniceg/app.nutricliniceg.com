import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { privacyRepository } from '@/lib/db/repositories/privacy.repo';

const ROOT = process.cwd();
const SKIP = new Set(['node_modules', '.git', '.next', '.data', '.vscode']);

/** Every .ts under lib/ and app/ excluding repositories, tests and prisma. */
function scanSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) out.push(path.relative(ROOT, full).replace(/\\/g, '/'));
    }
  };
  walk(path.join(ROOT, 'lib'));
  walk(path.join(ROOT, 'app'));
  return out.filter(
    (f) =>
      !f.includes('/repositories/') &&
      !f.includes('/tests/') &&
      !f.includes('.test.') &&
      !f.endsWith('next-env.d.ts')
  );
}

describe('quality gate: layering', () => {
  it('privacy export rejects unknown tables (no raw table passthrough)', async () => {
    await expect(privacyRepository.exportTable('User', 'x')).rejects.toThrow();
  });

  it('privacy service no longer embeds SQL', async () => {
    const src = fs.readFileSync('lib/admin/privacy.service.ts', 'utf8');
    expect(src).not.toMatch(/SELECT|DELETE FROM/);
    expect(src).toContain('privacyRepository');
  });

  it('cron tasks + rate-limit + health delegate SQL to repositories', async () => {
    for (const f of ['lib/cron/tasks.ts', 'lib/security/rate-limit.ts', 'app/api/health/route.ts']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/SELECT|INSERT INTO|DELETE FROM/);
    }
  });

  // Repo-wide sweep: hardcoding filenames let backup.service.ts regress (P33).
  it('no SQL outside lib/db/repositories (D-01, §6.2)', () => {
    const offenders: string[] = [];
    const sql = /(^|\W)(SELECT\s+[\s\S]{0,60}?\sFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)/i;
    for (const f of scanSourceFiles()) {
      // Strip line + block comments so documentation mentions do not trip this.
      const src = fs
        .readFileSync(path.join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (sql.test(src)) offenders.push(f);
    }
    expect(offenders, `SQL outside repositories:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('service and route layers never import the db pool directly', () => {
    const offenders: string[] = [];
    for (const f of scanSourceFiles()) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (src.includes("@/lib/db/pool")) offenders.push(f);
    }
    expect(offenders, `direct pool import outside repositories:\n${offenders.join('\n')}`).toEqual([]);
  });
});
