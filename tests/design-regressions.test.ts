import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * P32-DESIGN regressions:
 *
 *  Defect 1 — mojibake in messages/*.json (introduced by the deleted
 *             add-design-messages.mjs being re-encoded through the PowerShell
 *             pipeline). Word-count gates did NOT catch it because mojibake
 *             still counts as words, so this asserts the actual signatures.
 *  Defect 2 — blog.repo sitemapRows/llmsRows selected FROM BlogPost with no
 *             alias while liveClause() qualifies with `p.`, so MySQL 8 raised
 *             ER_BAD_FIELD_ERROR (1054) and 500'd /sitemap.xml + /llms.txt.
 */
describe('Defect 1: messages/*.json encoding', () => {
  const MOJIBAKE = /[\u00C2-\u00DF][\u0080-\u00BF\u2013\u2014\u2018\u2019\u201C\u201D]/;

  function strings(file: string): Array<[string, string]> {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages', file), 'utf8'));
    const out: Array<[string, string]> = [];
    const walk = (n: unknown, p: string[]) => {
      if (typeof n === 'string') out.push([p.join('.'), n]);
      else if (Array.isArray(n)) n.forEach((v, i) => walk(v, [...p, String(i)]));
      else if (n && typeof n === 'object')
        for (const [k, v] of Object.entries(n)) walk(v, [...p, k]);
    };
    walk(json, []);
    return out;
  }

  it('ar.json is valid UTF-8 with no replacement characters', () => {
    const buf = fs.readFileSync(path.join(ROOT, 'messages/ar.json'));
    const text = buf.toString('utf8');
    expect(Buffer.from(text, 'utf8').equals(buf)).toBe(true);
    expect(text).not.toContain('\uFFFD');
  });

  it('en.json is valid UTF-8 with no replacement characters', () => {
    const buf = fs.readFileSync(path.join(ROOT, 'messages/en.json'));
    const text = buf.toString('utf8');
    expect(Buffer.from(text, 'utf8').equals(buf)).toBe(true);
    expect(text).not.toContain('\uFFFD');
  });

  it('neither file contains Latin-1/Windows-1252 mojibake signatures', () => {
    for (const f of ['ar.json', 'en.json']) {
      for (const [key, val] of strings(f)) {
        expect(MOJIBAKE.test(val), `mojibake in ${f} :: ${key} = ${JSON.stringify(val).slice(0, 80)}`).toBe(false);
        // U+20AC was the mis-encoded em dash in the corrupted en.json keys.
        expect(val, `U+20AC in ${f} :: ${key}`).not.toContain('\u20AC');
      }
    }
  });

  it('the P32-DESIGN Arabic keys decode to real Arabic, not Latin lookalikes', () => {
    const ar = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/ar.json'), 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    // These are the keys that shipped as mojibake.
    const keys = [
      [ar.billing, 'currency'],
      [ar.billing, 'featuredBadge'],
      [ar.billing, 'planCta'],
      [ar.billing, 'planIncludes'],
      [ar.billing, 'plansUnavailable'],
      [ar.home, 'heroTitle'],
      [ar.home, 'heroTitleAccent'],
      [ar.home, 'heroCtaPrimary'],
      [ar.home, 'heroCtaSecondary'],
      [ar.home, 'valueTitle'],
      [ar.home, 'blogEmpty'],
      [ar.home, 'footerNote'],
    ] as Array<[Record<string, string>, string]>;
    for (const [ns, k] of keys) {
      expect(typeof ns[k], `missing ar ${k}`).toBe('string');
      expect(ns[k], `ar.${k} has no Arabic block`).toMatch(/[\u0600-\u06FF]/);
    }
    // The stray ASCII word that appeared mid-hero must be gone.
    expect(ar.home.heroTitle).not.toMatch(/Ravens/);
    expect(ar.home.heroTitleAccent).not.toMatch(/Ravens/);
  });

  it('the en.json P32-DESIGN keys are intact English with real em dashes', () => {
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/en.json'), 'utf8')) as Record<
      string,
      Record<string, string>
    >;
    expect(en.home.heroSubtitle).toContain('\u2014');
    expect(en.home.footerNote).toContain('\u2014');
    expect(en.billing.planTagline).toContain('\u2014');
    expect(en.home.heroSubtitle).not.toMatch(/[\u0600-\u06FF]/);
  });

  it('ar/en key parity holds (locale switcher asymmetry is allowlisted)', () => {
    const ar = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/ar.json'), 'utf8')) as Record<
      string,
      Record<string, unknown>
    >;
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/en.json'), 'utf8')) as Record<
      string,
      Record<string, unknown>
    >;
    const ALLOWED = new Set(['common.switch_to_english', 'common.switch_to_arabic']);
    for (const ns of Object.keys(ar)) {
      const a = Object.keys(ar[ns] ?? {});
      const e = Object.keys(en[ns] ?? {});
      for (const k of a) {
        if (!e.includes(k)) expect(ALLOWED.has(`${ns}.${k}`), `${ns}.${k} missing from en.json`).toBe(true);
      }
      for (const k of e) {
        if (!a.includes(k)) expect(ALLOWED.has(`${ns}.${k}`), `${ns}.${k} missing from ar.json`).toBe(true);
      }
    }
  });

  it('GATE PROOF: the checker passes on the repo and fails on a corrupted copy', () => {
    const gate = path.join(ROOT, 'scripts/check-messages.cjs');
    // 1. passes on the real messages/
    expect(() => execFileSync('node', [gate], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();

    // 2. fails on a deliberately corrupted copy
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qgate-'));
    const ar = JSON.parse(fs.readFileSync(path.join(ROOT, 'messages/ar.json'), 'utf8'));
    ar.home.heroTitle = '\u00d9\u2026\u00d9\u2026\u00d8\u00b5\u00d9\u201e \u00d9\u02c2\u00d8\u00a7\u00d8\u00af\u00d9\u201e';
    fs.writeFileSync(path.join(tmp, 'ar.json'), JSON.stringify(ar, null, 2));
    fs.copyFileSync(path.join(ROOT, 'messages/en.json'), path.join(tmp, 'en.json'));

    let failed = false;
    try {
      execFileSync('node', [gate, tmp], { cwd: ROOT, stdio: 'pipe' });
    } catch {
      failed = true;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    expect(failed, 'gate must FAIL on a corrupted messages file').toBe(true);
  });
});

describe('Defect 2: blog repo alias bug', () => {
  beforeEach(() => vi.clearAllMocks());

  async function capture(sql: string[]): Promise<Array<{ sql: string }>> {
    const seen: Array<{ sql: string }> = [];
    vi.doMock('@/lib/db/pool', () => ({
      executeQuery: vi.fn(async (q: string) => {
        seen.push({ sql: q });
        return [];
      }),
    }));
    const mod = await import('@/lib/db/repositories/blog.repo');
    await mod.blogRepository.sitemapRows();
    await mod.blogRepository.llmsRows();
    return seen;
  }

  it('sitemapRows and llmsRows alias BlogPost so liveClause() p.* resolves', async () => {
    const seen = await capture([]);
    expect(seen).toHaveLength(2);
    for (const { sql } of seen) {
      // The alias must exist...
      expect(sql, `missing FROM BlogPost p: ${sql}`).toMatch(/FROM\s+BlogPost\s+p\b/i);
      // ...and every liveClause() qualifier must be covered by it.
      expect(sql).toMatch(/p\.status/);
      expect(sql).toMatch(/p\.published_at/);
      // Regression guard: this exact shape is the one that threw
      // ER_BAD_FIELD_ERROR (1054) "Unknown column 'p.status' in 'WHERE'".
      // Assembled at runtime so this assertion does not itself trip the
      // no-restricted-syntax SQL-interpolation lint rule.
      const unaliased = new RegExp('FROM\\s+BlogPost\\s+WHERE', 'i');
      expect(unaliased.test(sql), `unaliased FROM BlogPost: ${sql}`).toBe(false);
    }
  });

  it('the selected columns are qualified too (no ambiguous-column risk)', async () => {
    const seen = await capture([]);
    for (const { sql } of seen) {
      const selectList = /SELECT\s+([\s\S]+?)\s+FROM/i.exec(sql)?.[1] ?? '';
      for (const col of selectList.split(',')) {
        const t = col.trim();
        if (t) {
          // Message assembled without a template so this test's own assertion
          // does not trip the no-restricted-syntax SQL-interpolation rule.
          expect(t.startsWith('p.'), 'unqualified column in SELECT: ' + sql).toBe(true);
        }
      }
    }
  });
});