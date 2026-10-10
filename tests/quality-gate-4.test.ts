import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { errorCodeOf, generationErrorCode, generationErrorExtra, serviceFail } from '@/lib/errors/fail';
import { blogAdminRepository } from '@/lib/db/repositories/blog-admin.repo';
import { executeQuery } from '@/lib/db/pool';

vi.mock('@/lib/db/pool');
type Mock = ReturnType<typeof vi.fn>;

const ROOT = process.cwd();

describe('shared error-code reader (lib/errors/fail)', () => {
  it('reads the code attached by serviceFail', () => {
    const err = serviceFail('NOT_FOUND', 'nope');
    expect(errorCodeOf(err)).toBe('NOT_FOUND');
    expect(generationErrorCode(err)).toBe('NOT_FOUND');
  });

  it('preserves the plans-domain GENERATION_FAILED fallback', () => {
    // Historical behaviour: a plain Error under the plans helper reported
    // 'GENERATION_FAILED', while the generic helper reports 'SERVICE_FAILED'.
    expect(generationErrorCode(new Error('boom'))).toBe('GENERATION_FAILED');
    expect(errorCodeOf(new Error('boom'))).toBe('SERVICE_FAILED');
  });

  it('carries the extra payload through', () => {
    const err = serviceFail('X', 'm', { field: 'email' });
    expect(generationErrorExtra(err)).toEqual({ field: 'email' });
    expect(errorCodeOf(err, 'FALLBACK')).toBe('X');
  });
});

describe('blog-admin repo update honours newsletter_sent_at (regression)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits an UPDATE when only newsletter_sent_at is supplied', async () => {
    // Regression: newsletter_sent_at was missing from the SET map, so the
    // auto-newsletter "first publish only" stamp was a silent no-op and a post
    // could re-trigger a campaign on every later publish.
    (executeQuery as unknown as Mock).mockResolvedValue([]);
    await blogAdminRepository.update('post-1', { newsletter_sent_at: new Date('2026-01-02T03:04:05Z') });

    const calls = (executeQuery as unknown as Mock).mock.calls;
    expect(calls).toHaveLength(1);
    const [sql, params] = calls[0];
    expect(sql).toContain('UPDATE BlogPost SET');
    expect(sql).toContain('newsletter_sent_at = ?');
    expect(sql).not.toContain('newsletter_sent_at = new');
    expect(params[params.length - 1]).toBe('post-1');
  });

  it('still no-ops cleanly when every key is unknown', async () => {
    (executeQuery as unknown as Mock).mockResolvedValue([]);
    await blogAdminRepository.update('post-1', { not_a_column: 'x' });
    expect((executeQuery as unknown as Mock).mock.calls).toHaveLength(0);
  });

  it('never interpolates caller values into SQL (D-01)', async () => {
    (executeQuery as unknown as Mock).mockResolvedValue([]);
    await blogAdminRepository.update('post-1', { title: "'; DROP TABLE BlogPost; --" });
    const [sql] = (executeQuery as unknown as Mock).mock.calls[0];
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toContain('title = ?');
  });
});

describe('deleted dead modules stay deleted', () => {
  it('app/[locale]/legal-shared.tsx is gone (duplicated lib/cms/legal.ts)', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/[locale]/legal-shared.tsx'))).toBe(false);
  });

  it('the Carbon-replacing ui/composites + ui/theme wrappers are gone', () => {
    // ~490 lines of local Carbon re-implementations with zero importers; the
    // app renders @carbon/react directly.
    expect(fs.existsSync(path.join(ROOT, 'ui/composites'))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, 'ui/theme'))).toBe(false);
  });

  it('lib/cms/legal.ts remains the single legal-copy source', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/cms/legal.ts'), 'utf8');
    expect(src).toContain('export async function legalPage');
    expect(src).toContain('cmsRepository.getPage');
  });

  it('both legal pages import the one shared module', () => {
    for (const p of ['app/[locale]/privacy/page.tsx', 'app/[locale]/terms/page.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src, p).toContain("from '@/lib/cms/legal'");
      // Never dangerouslySetInnerHTML on a CMS-sourced legal body (SEC-07).
      // (The word may appear in a comment explaining why it is avoided.)
      const code = src.replace(/\/\/.*$/gm, '');
      expect(code, p).not.toContain('dangerouslySetInnerHTML');
      expect(code, p).toContain('whiteSpace: \'pre-line\'');
    }
  });
});

describe('print shell is shared (dedup gate)', () => {
  it('both print pages render the one PrintShell component', () => {
    for (const p of ['app/print/nutrition/[planId]/page.tsx', 'app/print/exercise/[planId]/page.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src, p).toContain('PrintShell');
      // The duplicated chrome must no longer be inlined per page.
      expect(src, p).not.toContain('className="print-header"');
      expect(src, p).not.toContain('className="print-footer"');
    }
  });

  it('PrintShell carries the brand header and the print-only footer once', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/print/_components/print-shell.tsx'), 'utf8');
    expect(src).toContain('print-header');
    expect(src).toContain('print-footer');
    expect(src).toContain('PrintButton');
    expect(src).toContain('medicalNote');
  });
});

describe('calculateAge is not re-implemented in the dashboard', () => {
  it('both patient pages import the canonical helper', () => {
    for (const p of ['app/[locale]/dashboard/patients/page.tsx', 'app/[locale]/dashboard/patients/[id]/page.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src, p).toContain("import { calculateAge } from '@/lib/nutrition/calc'");
      expect(src, p).not.toMatch(/function calculateAge\s*\(/);
    }
  });
});

describe('health probe returns the unified envelope', () => {
  it('GET /api/health answers { success, data } with a real requestId', async () => {
    vi.doMock('@/lib/db/repositories/maintenance.repo', () => ({
      maintenanceRepository: { ping: vi.fn(async () => undefined) },
    }));
    vi.doMock('@/lib/db/repositories/cron.repo', () => ({
      cronRepository: { lastRuns: vi.fn(async () => []) },
    }));
    vi.doMock('@/lib/db/repositories/ai.repo', () => ({
      aiProviderRepository: { listChain: vi.fn(async () => []) },
    }));
    const mod = await import('@/app/api/health/route');
    const res = await mod.GET(new NextRequest('https://app.test/api/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { status: string; requestId: string; components: { db: { ok: boolean } } };
    };
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.components.db.ok).toBe(true);
    // Regression: requestId was hardcoded to null in the response body.
    expect(body.data.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('newsletter click route rejects non-http targets', () => {
  beforeEach(() => vi.resetModules());

  it('refuses javascript: and data: redirect targets with the unified 404', async () => {
    const incrementClicks = vi.fn(async () => undefined);
    vi.doMock('@/lib/db/repositories/campaigns.repo', () => ({
      campaignsRepository: { findById: vi.fn(async () => ({ id: 'c1' })), incrementClicks },
    }));
    const mod = await import('@/app/api/newsletter/click/route');
    for (const target of ['javascript:alert(1)', 'data:text/html,<script>', '/relative']) {
      const res = await mod.GET(
        new NextRequest(`https://app.test/api/newsletter/click?c=c1&u=${encodeURIComponent(target)}`)
      );
      expect(res.status, target).toBe(404);
      const body = (await res.json()) as { success: boolean; error: { code: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    }
    // A rejected target must never be counted as a click.
    expect(incrementClicks).not.toHaveBeenCalled();
  });

  it('counts the click and 302s for a valid https target', async () => {
    const incrementClicks = vi.fn(async () => undefined);
    vi.doMock('@/lib/db/repositories/campaigns.repo', () => ({
      campaignsRepository: { findById: vi.fn(async () => ({ id: 'c1' })), incrementClicks },
    }));
    const mod = await import('@/app/api/newsletter/click/route');
    const res = await mod.GET(
      new NextRequest('https://app.test/api/newsletter/click?c=c1&u=https%3A%2F%2Fnutricliniceg.com%2Fpost')
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://nutricliniceg.com/post');
    expect(incrementClicks).toHaveBeenCalledWith('c1');
  });

  it('answers the unified 404 when the campaign id is unknown', async () => {
    vi.doMock('@/lib/db/repositories/campaigns.repo', () => ({
      campaignsRepository: { findById: vi.fn(async () => null), incrementClicks: vi.fn() },
    }));
    const mod = await import('@/app/api/newsletter/click/route');
    const res = await mod.GET(
      new NextRequest('https://app.test/api/newsletter/click?c=missing&u=https%3A%2F%2Fnutricliniceg.com')
    );
    expect(res.status).toBe(404);
  });
});

describe('one API response shape everywhere (consistency gate)', () => {
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

  it('no route hand-rolls a NextResponse.json({ success }) envelope', () => {
    const offenders: string[] = [];
    for (const f of routeFiles()) {
      const src = fs
        .readFileSync(path.join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (/NextResponse\.json\(\s*\{\s*success\s*:/.test(src)) offenders.push(f);
    }
    expect(offenders, `hand-rolled envelopes (use ok()/fail()):\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every JSON route uses the shared response helpers', () => {
    const offenders: string[] = [];
    for (const f of routeFiles()) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // A route that builds any NextResponse.json envelope directly bypasses
      // lib/api/response.ts. Redirects are exempt (no envelope involved).
      if (/NextResponse\.json\(/.test(src) && !src.includes("from '@/lib/api/response'")) offenders.push(f);
    }
    expect(offenders, `routes bypassing lib/api/response:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('paymob intention response is validated, not cast', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock('@/lib/db/repositories/settings.repo', () => ({
      settingsRepository: {
        get: vi.fn(async (k: string) =>
          k === 'billing.paymob.secret_key' ? 'sk_test' : k === 'billing.paymob.base_url' ? 'https://accept.test' : null
        ),
      },
    }));
  });

  it('accepts client_secret', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ client_secret: 'cs_1' }) }))
    );
    const { createIntention } = await import('@/lib/billing/paymob');
    const res = await createIntention({
      planId: 'p', userId: 'u', userEmail: 'e@x.com', userName: 'N', amountCents: 100, currency: 'EGP',
    });
    expect(res.clientSecret).toBe('cs_1');
    vi.unstubAllGlobals();
  });

  it('falls back to the legacy payment_keys[0].key field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ payment_keys: [{ key: 'legacy_1' }] }) }))
    );
    const { createIntention } = await import('@/lib/billing/paymob');
    const res = await createIntention({
      planId: 'p', userId: 'u', userEmail: 'e@x.com', userName: 'N', amountCents: 100, currency: 'EGP',
    });
    expect(res.clientSecret).toBe('legacy_1');
    vi.unstubAllGlobals();
  });

  it('fails closed on a response carrying no usable key', async () => {
    // Unknown keys are stripped by the schema, so the parse still succeeds but
    // no key is recoverable: the call must throw rather than build a URL from
    // `undefined` the way the previous `as {...}` cast allowed.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ unexpected: { deeply: 'nested' } }) }))
    );
    const { createIntention } = await import('@/lib/billing/paymob');
    await expect(
      createIntention({ planId: 'p', userId: 'u', userEmail: 'e@x.com', userName: 'N', amountCents: 100, currency: 'EGP' })
    ).rejects.toThrow(/no payment key/i);
    vi.unstubAllGlobals();
  });

  it('rejects a non-string client_secret that a cast would have accepted', async () => {
    // A cast would have produced ".../intention/[object Object]".
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ client_secret: { evil: true } }) }))
    );
    const { createIntention } = await import('@/lib/billing/paymob');
    await expect(
      createIntention({ planId: 'p', userId: 'u', userEmail: 'e@x.com', userName: 'N', amountCents: 100, currency: 'EGP' })
    ).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it('reports a non-2xx Paymob response as PAYMOB_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }))
    );
    const { createIntention } = await import('@/lib/billing/paymob');
    await expect(
      createIntention({ planId: 'p', userId: 'u', userEmail: 'e@x.com', userName: 'N', amountCents: 100, currency: 'EGP' })
    ).rejects.toThrow(/502/);
    vi.unstubAllGlobals();
  });
});