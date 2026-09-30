// UI-20/§5.7 bundle governance gate. Runs after `next build` (wired into
// the `build` script): parses .next/app-build-manifest.json, sums GZIP JS
// bytes per route (transfer size = performance truth), and fails the build
// when budgets are breached.
// Budgets: shared ≤ baseline(105kB gzip, docs/carbon-t0.md) +10%;
// per-page ≤ 280kB gzip.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SHARED_BUDGET = 118_000;
const PAGE_BUDGET = 280_000;

function fail(msg) {
  console.error(`check-bundle: FAIL — ${msg}`);
  process.exit(1);
}

const manifestPath = path.join(ROOT, '.next', 'app-build-manifest.json');
if (!fs.existsSync(manifestPath)) fail('.next/app-build-manifest.json missing (run next build first)');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const pages = manifest.pages || {};
const gzCache = new Map();

function gz(rel) {
  if (gzCache.has(rel)) return gzCache.get(rel);
  let n = 0;
  try {
    n = zlib.gzipSync(fs.readFileSync(path.join(ROOT, '.next', rel))).length;
  } catch {
    n = 0;
  }
  gzCache.set(rel, n);
  return n;
}

// Shared = files of the root layout entry (loaded by every route).
const layoutFiles = pages['/layout'] || [];
if (layoutFiles.length === 0) fail('no /layout entry in app-build-manifest');
const sharedBytes = layoutFiles.reduce((n, f) => n + (f.endsWith('.js') ? gz(f) : 0), 0);
console.log(`check-bundle: shared first-load JS = ${(sharedBytes / 1024).toFixed(1)} kB gzip (budget ${(SHARED_BUDGET / 1024).toFixed(1)} kB)`);
if (sharedBytes > SHARED_BUDGET) {
  fail(`shared bundle ${(sharedBytes / 1024).toFixed(1)} kB exceeds ${(SHARED_BUDGET / 1024).toFixed(1)} kB budget`);
}

// Per-page totals (routes only, skip layouts/not-found internals).
let worst = { route: '', bytes: 0 };
for (const [route, files] of Object.entries(pages)) {
  if (!route.endsWith('/page') || route.startsWith('/_')) continue;
  const bytes = files.reduce((n, f) => n + (f.endsWith('.js') ? gz(f) : 0), 0);
  if (bytes > worst.bytes) worst = { route, bytes };
  if (bytes > PAGE_BUDGET) {
    fail(`route ${route} first-load JS ${(bytes / 1024).toFixed(1)} kB exceeds ${(PAGE_BUDGET / 1024).toFixed(1)} kB budget`);
  }
}
console.log(`check-bundle: heaviest page = ${worst.route} (${(worst.bytes / 1024).toFixed(1)} kB gzip, budget ${(PAGE_BUDGET / 1024).toFixed(1)} kB gzip)`);
console.log('check-bundle: PASS');
