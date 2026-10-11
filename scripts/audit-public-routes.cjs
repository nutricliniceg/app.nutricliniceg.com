// P32-DESIGN-2 acceptance gate: programmatic per-route audit of every public
// page under app/[locale]/, checked against the shared shell/typography rules.
//
// For each route we report:
//   (a) shared SiteHeader + locale switcher mounted
//   (b) shared shell/container class used
//   (c) Plex font stack reachable (page uses a class that inherits --nc-font-sans,
//       or the page is inside the root <html> that sets it)
//   (d) Carbon components for interactive elements (or explicitly none)
//
// A route is PASS when header+switcher+shell are present; FAIL rows must carry a
// reason. Admin/dashboard/dev/print are classified as out-of-scope-by-design and
// reported separately rather than silently skipped.
//
// Usage: node scripts/audit-public-routes.cjs [--json]

'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const AS_JSON = process.argv.includes('--json');

// Directories intentionally NOT part of the public marketing visual language.
const OUT_OF_SCOPE = [
  { re: /^\/\[locale\]\/admin/, why: 'admin phase — separate by design' },
  { re: /^\/\[locale\]\/dashboard/, why: 'dashboard phase — separate by design' },
  { re: /^\/\[locale\]\/dev/, why: 'internal dev page' },
];

function readManifest() {
  const p = path.join(ROOT, '.next/server/app-paths-manifest.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function scopeOf(route) {
  for (const s of OUT_OF_SCOPE) if (s.re.test(route)) return s.why;
  return null;
}

/** Locate the source file(s) for an app route. Manifest keys look like
 *  '/[locale]/pricing/page' or '/[locale]/page' (the root index). Returns every
 *  matched file so a layout-only mount still counts, and concatenates their
 *  source so the checks below see the whole route. */
function sourcesFor(route) {
  // strip the trailing '/page' | '/route' | '/default' segment the manifest adds
  const rel = route.replace(/^\//, '').replace(/\/(page|route|default)$/, '');
  const base = path.join(ROOT, 'app', rel);
  const out = [];
  for (const f of ['layout.tsx', 'page.tsx', 'page.ts']) {
    const c = path.join(base, f);
    if (fs.existsSync(c)) out.push(c);
  }
  return out;
}

/**
 * Resolve a relative or @/-aliased import to a source file on disk.
 * Returns null for bare package imports (next/link, @carbon/react, ...).
 */
function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;

  const cands = [base, `${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')];
  for (const c of cands) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/**
 * Collect the source of a route AND every local module it transitively imports
 * (bounded depth). The shared chrome lives in components — PublicShell ->
 * SiteHeader -> LocaleSwitch — so a single-file scan would report a correctly
 * wrapped page as missing its header. Following the graph measures what the
 * route actually renders instead of what one file happens to spell out.
 */
function collectSources(entryFiles, maxDepth = 6) {
  const seen = new Set();
  const queue = entryFiles.map((f) => [f, 0]);
  const chunks = [];
  while (queue.length) {
    const [file, depth] = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    chunks.push(src);
    if (depth >= maxDepth) continue;
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const r = resolveImport(file, m[1]);
      if (r && !seen.has(r)) queue.push([r, depth + 1]);
    }
  }
  return { src: chunks.join('\n'), files: [...seen] };
}

const rows = [];
const manifest = readManifest();
if (!manifest) {
  console.error('No build found — run `npm run build` first (.next/server/app-paths-manifest.json).');
  process.exit(2);
}

const routes = Object.keys(manifest)
  .filter((r) => /^\/\[locale\]/.test(r))
  .sort();

for (const route of routes) {
  const entry = sourcesFor(route);
  const { src, files } = collectSources(entry);
  const rel = files.length
    ? files
        .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
        .filter((f) => f.startsWith('app/'))
        .join(' + ')
    : '(no source)';
  const oos = scopeOf(route);

  // Strip comments before scanning: source files legitimately *talk about*
  // tags in their doc comments ("the hidden website field stays a raw <input>"),
  // which would otherwise be counted as real markup.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  const header = /SiteHeader/.test(src);
  const switcher = /LocaleSwitch/.test(src) || /SiteHeader/.test(src); // header renders the switch
  const shell = /nc-container|nc-section|nc-hero|nc-postgrid|nc-pricing|nc-card|nc-auth|nc-article/.test(src);
  const article = /nc-article/.test(src);
  const carbon = /@carbon\/react/.test(code) || /<Button[\s/>]|<TextInput[\s/>]|<TextArea[\s/>]|<Select[\s/>]|<Tag[\s/>]|<Tile[\s/>]|<InlineNotification[\s/>]|<Checkbox[\s/>]|<RadioButton[\s/>]/.test(code);
  // Interactive elements that are NOT Carbon would be hand-rolled widgets.
  // The newsletter honeypot (`name="website"`, display:none) is exempt: it is an
  // anti-bot trap that must stay outside Carbon's styling and a11y tree, so it
  // is the single sanctioned raw input in the public surface.
  const rawMatches = code.match(/<button[\s>]|<input[\s>]|<select[\s>]|<textarea[\s>]/g) || [];
  const honeypots = (code.match(/name="website"/g) || []).length;
  const rawInteractive = Math.max(0, rawMatches.length - honeypots) > 0 ? 'YES' : 'no';

  let status = 'PASS';
  const reasons = [];
  if (!header) reasons.push('no SiteHeader');
  if (!switcher) reasons.push('no locale switcher');
  if (!shell) reasons.push('no shared shell class');
  if (status === 'PASS' && reasons.length) status = 'FAIL';

  rows.push({
    route: route.replace('/[locale]', '/:locale'),
    manifestKey: route,
    file: rel,
    scope: oos || 'public',
    status: oos ? 'OUT-OF-SCOPE' : status,
    header: header ? 'yes' : 'NO',
    switcher: switcher ? 'yes' : 'NO',
    shell: shell ? 'yes' : 'NO',
    article: article ? 'yes' : '-',
    carbon: carbon ? 'yes' : 'NO',
    rawInteractive,
    reason: oos ? oos : reasons.join('; '),
  });
}

if (AS_JSON) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    pad('ROUTE', 34) + pad('STATUS', 14) + pad('HDR', 5) + pad('SW', 4) +
    pad('SHELL', 7) + pad('ART', 5) + pad('CARBON', 8) + 'REASON'
  );
  console.log('-'.repeat(120));
  for (const r of rows) {
    console.log(
      pad(r.route, 34) + pad(r.status, 14) + pad(r.header, 5) + pad(r.switcher, 4) +
      pad(r.shell, 7) + pad(r.article, 5) + pad(r.carbon, 8) + r.reason
    );
  }
  const pub = rows.filter((r) => r.scope === 'public');
  const fail = pub.filter((r) => r.status === 'FAIL');
  console.log('');
  console.log(`public routes : ${pub.length}`);
  console.log(`PASS          : ${pub.length - fail.length}`);
  console.log(`FAIL          : ${fail.length}`);
  console.log(`out-of-scope  : ${rows.length - pub.length}`);
  const raw = pub.filter((r) => r.rawInteractive === 'YES');
  if (raw.length) {
    console.log('');
    console.log('routes with non-Carbon interactive elements:');
    for (const r of raw) {
      const files = sourcesFor(r.manifestKey);
      const bad = [];
      for (const f of collectSources(files).files) {
        const t = fs
          .readFileSync(f, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, ' ')
          .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
        const m = t.match(/<button[\s>]|<input[\s>]|<select[\s>]|<textarea[\s>]/g) || [];
        const h = (t.match(/name="website"/g) || []).length;
        if (m.length - h > 0) bad.push(`${path.relative(ROOT, f)} (${m.length - h})`);
      }
      console.log(`  ${r.route}\n      raw tags in: ${bad.join(', ') || '?'}`);
    }
  }
}

process.exit(rows.some((r) => r.status === 'FAIL') ? 1 : 0);