import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const AUDIT = path.join(ROOT, 'scripts/audit-public-routes.cjs');

/**
 * P32-CIFIX — the three assertions below shell out to the route auditor, which
 * reads the Next.js build manifest. CI runs `npm test` BEFORE `npm run build`
 * (ci.yml: test line 28, build line 37), so no artifact exists at test time and
 * the auditor exits 2 with "run npm run build first".
 *
 * That is an environment dependency, not a defect. The gate itself is enforced
 * inside `npm run build` (package.json -> build -> next build &&
 * node scripts/audit-public-routes.cjs), which is exactly where the manifest is
 * guaranteed to exist. Re-running the same auditor from the test suite is a
 * redundant duplicate of a gate that already runs, so it skips cleanly when
 * there is nothing to audit. Every other assertion in this file is static
 * source inspection and always runs.
 */
const AUDIT_MANIFEST = path.join(ROOT, '.next/server/app-paths-manifest.json');
const HAS_BUILD_ARTIFACT = fs.existsSync(AUDIT_MANIFEST);

const SKIP_REASON =
  'public-route audit gate is enforced inside npm run build; vitest duplicate skipped without build artifact';

/** Read a source file with comments stripped.
 *
 * Several of these files legitimately *talk about* the very patterns being
 * asserted on ("calls notFound() nowhere", "a raw #008080"), so a naive regex
 * over the raw text matches the prose instead of the code. */
function code(rel: string): string {
  return fs
    .readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * P32-DESIGN-2 regressions.
 *
 * The public surface drifted apart over several phases: login / privacy / terms
 * / the localized 404 / the blog taxonomy pages each hand-rolled their own
 * markup, so several of them shipped with no header, no locale switcher and no
 * typography at all. This suite pins the shared visual language in place.
 */
describe.skipIf(!HAS_BUILD_ARTIFACT)('P32-DESIGN-2: public route audit gate', () => {
  it('every public route under app/[locale] uses the shared shell', () => {
    // Non-zero exit = at least one public route is off the shared shell.
    expect(() => execFileSync('node', [AUDIT], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  });

  it('the audit reports 10 public routes, all PASS', () => {
    const out = execFileSync('node', [AUDIT, '--json'], { cwd: ROOT, encoding: 'utf8' });
    const rows = JSON.parse(out) as Array<{ scope: string; status: string }>;
    const pub = rows.filter((r) => r.scope === 'public');
    expect(pub.length).toBeGreaterThanOrEqual(10);
    const failed = pub.filter((r) => r.status === 'FAIL');
    expect(failed.map((f) => f.status)).toEqual([]);
  });

  it('admin and dashboard routes are excluded from the public gate by design', () => {
    const out = execFileSync('node', [AUDIT, '--json'], { cwd: ROOT, encoding: 'utf8' });
    const rows = JSON.parse(out) as Array<{ route: string; scope: string; status: string }>;
    for (const r of rows.filter((x) => /admin|dashboard/.test(x.route))) {
      expect(r.status).toBe('OUT-OF-SCOPE');
    }
  });
});

// One-line note explaining why the block above is inert in this environment, so
// a skipped-but-gated suite is never mistaken for a silently dropped test.
//
// Verified to be emitted as a single physical line (captured byte-exactly, not
// through PowerShell, whose NativeCommandError view visually re-wraps it).
if (!HAS_BUILD_ARTIFACT) {
  console.warn(`[P32-CIFIX] ${SKIP_REASON}`);
}

describe('P32-DESIGN-2: shared shell component', () => {
  const shell = fs.readFileSync(
    path.join(ROOT, 'app/[locale]/_components/public-shell.tsx'),
    'utf8',
  );

  it('composes SiteHeader and SiteFooter (the locale switcher rides on the header)', () => {
    expect(shell).toMatch(/import SiteHeader/);
    expect(shell).toMatch(/import SiteFooter/);
    expect(shell).toMatch(/<SiteHeader/);
    expect(shell).toMatch(/<SiteFooter/);
  });

  it('every public page routes through PublicShell rather than its own chrome', () => {
    const pages = [
      'app/[locale]/page.tsx',
      'app/[locale]/pricing/page.tsx',
      'app/[locale]/login/page.tsx',
      'app/[locale]/privacy/page.tsx',
      'app/[locale]/terms/page.tsx',
      'app/[locale]/not-found/page.tsx',
      'app/[locale]/blog/page.tsx',
      'app/[locale]/blog/[slug]/page.tsx',
      'app/[locale]/blog/category/[slug]/page.tsx',
      'app/[locale]/blog/tag/[slug]/page.tsx',
    ];
    for (const p of pages) {
      const src = code(p);
      const indirect =
        p === 'app/[locale]/privacy/page.tsx' || p === 'app/[locale]/terms/page.tsx';
      expect(src, `${p} must compose the shared shell`).toMatch(
        indirect ? /LegalDocument/ : /PublicShell/,
      );
      // None of them may hand-roll the header/footer again.
      expect(src, `${p} must not import SiteHeader directly`).not.toMatch(
        /import SiteHeader/,
      );
    }
  });
});

describe('P32-DESIGN-2: no hardcoded user-facing strings on public surfaces', () => {
  // Invariant 8. The newsletter landing pages shipped a `const COPY = { ar: {...},
  // en: {...} }` literal, which is exactly what this forbids.
  it('newsletter landing pages take their copy from next-intl', () => {
    for (const p of [
      'app/newsletter/confirm/[token]/page.tsx',
      'app/newsletter/unsubscribe/[token]/page.tsx',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
      expect(src, `${p} must not define a COPY literal`).not.toMatch(/const COPY/);
      expect(src, `${p} must read translations`).toMatch(/getTranslations/);
    }
  });

  it('the newsletter copy it now reads exists in both dictionaries', () => {
    const ar = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/ar.json'), 'utf8'));
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/en.json'), 'utf8'));
    const keys = [
      'confirmedTitle',
      'confirmedBody',
      'confirmFailedTitle',
      'confirmFailedBody',
      'unsubscribedTitle',
      'unsubscribedBody',
    ];
    for (const k of keys) {
      expect(ar.newsletter[k], `ar.newsletter.${k} missing`).toBeTruthy();
      expect(en.newsletter[k], `en.newsletter.${k} missing`).toBeTruthy();
      // The Arabic value must actually be Arabic (guards the mojibake trap).
      expect(ar.newsletter[k], `ar.newsletter.${k} is not Arabic`).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('the locale <select> options are translated, not literal strings', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'app/newsletter/_components/subscribe-form.tsx'),
      'utf8',
    );
    expect(src).toMatch(/switch_to_arabic/);
    expect(src).toMatch(/switch_to_english/);
    expect(src).not.toMatch(/>العربية</);
  });
});

describe('P32-DESIGN-2: token discipline', () => {
  it('print.css consumes the shared font and brand tokens instead of redeclaring them', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/print/print.css'), 'utf8');
    expect(css).toMatch(/font-family:\s*var\(--nc-font-sans/);
    expect(css).toMatch(/--brand-teal:\s*var\(--cds-interactive/);
    expect(css).toMatch(/--brand-deep:\s*var\(--cds-link-secondary/);
  });

  it('portal.css uses the shared font stack token', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/portal/portal.css'), 'utf8');
    expect(css).toMatch(/font-family:\s*var\(--nc-font-sans/);
  });

  it('the public form classes live in their own partial (file-size ceiling)', () => {
    expect(fs.existsSync(path.join(ROOT, 'ui/styles/_public-forms.scss'))).toBe(true);
    const scss = fs.readFileSync(path.join(ROOT, 'ui/styles/_public-forms.scss'), 'utf8');
    expect(scss).toMatch(/\.nc-auth/);
    expect(scss).toMatch(/\.nc-form/);
    // ~250-line ceiling per file, measured in non-blank lines.
    const nonBlank = (f: string) =>
      fs
        .readFileSync(path.join(ROOT, f), 'utf8')
        .split('\n')
        .filter((l) => l.trim().length > 0).length;
    for (const f of [
      'ui/styles/_public-forms.scss',
      'ui/styles/_public-blog.scss',
      'ui/styles/_public.scss',
    ]) {
      expect(nonBlank(f), `${f} exceeds the ~250-line ceiling`).toBeLessThanOrEqual(250);
    }
  });

  it('the blog rules were moved out of _public.scss, not duplicated', () => {
    const blog = fs.readFileSync(path.join(ROOT, 'ui/styles/_public-blog.scss'), 'utf8');
    const pub = fs.readFileSync(path.join(ROOT, 'ui/styles/_public.scss'), 'utf8');
    for (const sel of ['.nc-postgrid', '.nc-post__cover', '.nc-pagination', '.nc-articleheader']) {
      const esc = sel.replace(/\./g, '\\.');
      expect(blog, `${sel} missing from _public-blog.scss`).toMatch(new RegExp(esc));
      expect(pub, `${sel} still duplicated in _public.scss`).not.toMatch(
        new RegExp('^' + esc, 'm'),
      );
    }
  });

  it('the new partial is actually loaded by globals.scss', () => {
    const g = fs.readFileSync(path.join(ROOT, 'app/globals.scss'), 'utf8');
    expect(g).toMatch(/@use '\.\/ui\/styles\/public-forms'/);
  });

  it('the localized 404 no longer hardcodes a colour or a font', () => {
    const src = code('app/[locale]/not-found/page.tsx');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/system-ui/);
    // It must not re-declare its own document shell either.
    expect(src).not.toMatch(/<html/);
    expect(src).not.toMatch(/<body/);
  });
});

describe('P32-DESIGN-2: zero-DB-404 fallbacks preserved', () => {
  it('no public page under app/[locale] calls notFound() on a DB-backed list', () => {
    const files = [
      'app/[locale]/page.tsx',
      'app/[locale]/pricing/page.tsx',
      'app/[locale]/blog/page.tsx',
      'app/[locale]/blog/category/[slug]/page.tsx',
      'app/[locale]/blog/tag/[slug]/page.tsx',
    ];
    for (const f of files) {
      const src = code(f);
      expect(src, `${f} must not call notFound()`).not.toMatch(/notFound\(\)/);
    }
  });

  it('each list-backed page still wraps its query in try/catch', () => {
    for (const f of [
      'app/[locale]/page.tsx',
      'app/[locale]/pricing/page.tsx',
      'app/[locale]/blog/page.tsx',
      'app/[locale]/blog/category/[slug]/page.tsx',
      'app/[locale]/blog/tag/[slug]/page.tsx',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src, `${f} lost its DB fallback`).toMatch(/\}\s*catch\s*\{/);
    }
  });
});