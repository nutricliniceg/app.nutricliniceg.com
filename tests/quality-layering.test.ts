import { describe, it, expect } from 'vitest';
import { privacyRepository } from '@/lib/db/repositories/privacy.repo';

describe('quality gate: layering', () => {
  it('privacy export rejects unknown tables (no raw table passthrough)', async () => {
    await expect(privacyRepository.exportTable('User', 'x')).rejects.toThrow();
  });

  it('privacy service no longer embeds SQL', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('lib/admin/privacy.service.ts', 'utf8');
    expect(src).not.toMatch(/SELECT|DELETE FROM/);
    expect(src).toContain('privacyRepository');
  });

  it('cron tasks + rate-limit + health delegate SQL to repositories', async () => {
    const fs = await import('node:fs');
    for (const f of ['lib/cron/tasks.ts', 'lib/security/rate-limit.ts', 'app/api/health/route.ts']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/SELECT|INSERT INTO|DELETE FROM/);
    }
  });
});
