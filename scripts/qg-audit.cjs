#!/usr/bin/env node
/* Quality-gate static audit: layering, file health, type safety, duplication.
 * Read-only. Run: node scripts/qg-audit.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIRS = ['app', 'lib', 'ui', 'i18n', 'tests'];
const ROOT_FILES = ['middleware.ts', 'instrumentation.ts', 'i18n.ts'];

const SKIP = new Set(['node_modules', '.next', '.git', '.data', 'qa-regressions']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

const files = [];
for (const d of SRC_DIRS) files.push(...walk(path.join(ROOT, d)));
for (const f of ROOT_FILES) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) files.push(p);
}

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(f, 'utf8');
const src = new Map(files.map((f) => [f, read(f)]));

const report = {
  fileHealth: [],
  bigFunctions: [],
  sqlOutsideRepos: [],
  handlersWithLogic: [],
  any: [],
  nonNull: [],
  casts: [],
  imports: [],
  namingViolations: [],
  deadExports: [],
  unusedFiles: [],
};

// ---------- file health ----------
for (const f of files) {
  const lines = src.get(f).split('\n').length;
  const r = rel(f);
  const isComponent = /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f);
  if (isComponent && lines > 150) report.fileHealth.push({ r, lines, limit: 150, kind: 'component' });
  else if (lines > 250) report.fileHealth.push({ r, lines, limit: 250, kind: 'file' });
}

// ---------- function length (heuristic) ----------
const FN_RE = /(^|\n)\s*(export\s+)?(async\s+)?function\s+(\w+)|(^|\n)\s*(export\s+)?(const|let)\s+(\w+)\s*(:[^=]+)?=\s*(async\s*)?\(/g;
for (const f of files) {
  const text = src.get(f);
  const linesArr = text.split('\n');
  const re = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?(?:const|let)\s+(\w+)(?:\s*:[^=]+)?\s*=\s*(?:async\s*)?\(/;
  for (let i = 0; i < linesArr.length; i++) {
    const m = re.exec(linesArr[i]);
    if (!m) continue;
    const name = m[1] || m[2];
    if (!name || name === 'if' || name === 'for' || name === 'while') continue;
    // walk forward counting braces from this line
    let depth = 0;
    let started = false;
    let end = i;
    for (let j = i; j < linesArr.length && j < i + 400; j++) {
      for (const ch of linesArr[j]) {
        if (ch === '{') {
        depth++;
        started = true;
      } else if (ch === '}') depth--;
      }
      if (started && depth <= 0) {
        end = j;
        break;
      }
      end = j;
    }
    const len = end - i + 1;
    if (len > 40) {
      report.bigFunctions.push({ r: rel(f), fn: name, line: i + 1, len });
    }
  }
}

// ---------- SQL outside repositories ----------
// Only flag real SQL: template literals / quoted strings containing SQL verbs
// followed by column/table markers. Carbon's `Select` import must not match.
const SQL_RE =
  /[`'"](?:[^`'"]*)(?:\bSELECT\s+[\w`*.]|\bINSERT\s+INTO\s+\w|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\s+\w|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b)/i;
for (const f of files) {
  const r = rel(f);
  if (r.includes('/repositories/') || r.endsWith('schema.sql')) continue;
  if (r.startsWith('tests/')) continue;
  const text = src.get(f);
  text.split('\n').forEach((line, i) => {
    const s = line.replace(/\/\/.*$/, '');
    if (SQL_RE.test(s)) {
      report.sqlOutsideRepos.push({ r, line: i + 1, text: line.trim().slice(0, 140) });
    }
  });
}

// ---------- route handler business logic ----------
for (const f of files) {
  const r = rel(f);
  if (!/\/app\/api\/.*\/route\.ts$/.test('/' + r)) continue;
  const text = src.get(f);
  // crude: SQL / bcrypt / jwt signing / loop-heavy logic inside handler
  if (/bcrypt|signToken|new SignJWT/.test(text))
    report.handlersWithLogic.push({ r, why: 'crypto/auth primitive' });
}

// ---------- any / non-null / casts ----------
for (const f of files) {
  const r = rel(f);
  if (r.startsWith('tests/')) continue;
  const linesArr = src.get(f).split('\n');
  linesArr.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    if (/: any\b|<any>|as any\b|any\[\]/.test(code))
      report.any.push({ r, line: i + 1, text: line.trim().slice(0, 120) });
    if (/[A-Za-z0-9_)\]]!\s*[.)\];,}]/.test(code))
      report.nonNull.push({ r, line: i + 1, text: line.trim().slice(0, 120) });
    if (/ as (Row|Rows|Record<)/.test(code))
      report.casts.push({ r, line: i + 1, text: line.trim().slice(0, 120) });
  });
}

// ---------- import graph ----------
const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g;
const graph = new Map();
for (const f of files) {
  const r = rel(f);
  const deps = new Set();
  let m;
  const text = src.get(f);
  while ((m = IMPORT_RE.exec(text))) {
    const spec = m[1];
    let target = null;
    if (spec.startsWith('@/')) target = spec.slice(2);
    else if (spec.startsWith('.')) target = path.posix.normalize(path.posix.join(path.posix.dirname(r), spec));
    if (target) {
      deps.add(target);
      graph.set(r, deps);
    }
  }
}
report.graph = Object.fromEntries(graph);

// reverse imports: repositories importing services/routes; features importing other features' internals
// Shared/infra modules are legal lower-level dependencies for everyone.
const SHARED = new Set([
  'db',
  'api',
  'security',
  'errors',
  'notifications',
  'email',
  'files',
  'observability',
  'i18n',
  'env',
  'config',
  // Shared lower-level domain libraries (NOT features): consumed by 6-7
  // features each, so they are the "extract a shared lower-level module"
  // outcome the architecture rules call for.
  'nutrition',
  'ai',
  'print',
  'blog', // shared render/seo primitives
]);
const featureOf = (r) => {
  const m = /^lib\/([^/]+)\//.exec(r);
  if (!m) return null;
  const top = m[1];
  if (SHARED.has(top)) return null; // shared infra -> no feature boundary
  return top;
};
for (const [from, deps] of graph) {
  for (const d of deps) {
    if (from.startsWith('lib/db/repositories/') && /service|app\/api/.test(d))
      report.imports.push({ kind: 'repo->service (REVERSE)', from, to: d });
    if (from.startsWith('app/api/') && /\/repositories\//.test(d))
      report.imports.push({ kind: 'route->repo (BYPASS)', from, to: d });
    const fa = featureOf(from);
    const fb = featureOf(d);
    if (fa && fb && fa !== fb) {
      const isBarrel = new RegExp(`^lib/${fb}/index$`).test(d) || new RegExp(`^lib/${fb}/$`).test(d);
      report.imports.push({
        kind: isBarrel ? 'feature->feature BARREL (ok)' : 'feature->feature INTERNALS (violation)',
        from,
        to: d,
      });
    }
  }
}

// cycles (DFS over intra-lib graph)
const cycles = [];
{
  const seen = new Map();
  const stack = [];
  const dfs = (node) => {
    if (seen.get(node) === 1) {
      cycles.push([...stack.slice(stack.indexOf(node)), node].join(' -> '));
      return;
    }
    if (seen.get(node) === 2) return;
    seen.set(node, 1);
    stack.push(node);
    for (const d of graph.get(node) || []) {
      if (d.startsWith('lib/') && !d.startsWith('lib/db/')) dfs(d);
    }
    stack.pop();
    seen.set(node, 2);
  };
  for (const n of graph.keys()) if (n.startsWith('lib/')) dfs(n);
}
report.cycles = [...new Set(cycles)];

// ---------- naming conventions ----------
for (const f of files) {
  const r = rel(f);
  if (r.includes('/repositories/') && !/\.repo\.ts$/.test(r))
    report.namingViolations.push({ r, rule: 'repositories must be *.repo.ts' });
  if (/\.service\.ts$/.test(r) && r.includes('/repositories/'))
    report.namingViolations.push({ r, rule: 'service inside repositories' });
  if (/(^|\/)(utils|helpers|misc|common)\.ts$/.test(r))
    report.namingViolations.push({ r, rule: 'dumping-ground name' });
  if (/^ui\//.test(r) && /\.tsx$/.test(r) && !/^[A-Z]/.test(path.basename(r)))
    report.namingViolations.push({ r, rule: 'component file must be PascalCase' });
}

// ---------- unused exports / dead files ----------
{
  const allText = [...src.values()].join('\n');
  const exportRe = /export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/g;
  const unused = new Map();
  for (const f of files) {
    const r = rel(f);
    if (r.startsWith('tests/')) continue;
    const text = src.get(f);
    let m;
    while ((m = exportRe.exec(text))) {
      const name = m[1];
      const re = new RegExp(`\\b${name}\\b`, 'g');
      const count = (allText.match(re) || []).length;
      // 1 = only the declaration itself
      if (count <= 1) unused.set(`${r} :: ${name}`, true);
    }
  }
  report.deadExports = [...unused.keys()];
}

const out = { ...report };
delete out.graph;
fs.writeFileSync(path.join(ROOT, '.data', 'qg-audit.json'), JSON.stringify(out, null, 2));

const p = (t) => console.log(`\n===== ${t} =====`);
p('FILE HEALTH (>250 file / >150 component / >40 fn)');
report.fileHealth.forEach((x) => console.log(`${x.kind === 'component' ? 'COMP' : 'FILE'} ${x.lines} > ${x.limit}  ${x.r}`));
console.log(`\n===== FUNCTIONS > 40 lines (${report.bigFunctions.length}) =====`);
report.bigFunctions.sort((a, b) => b.len - a.len).forEach((x) => console.log(`${x.len}  ${x.r}:${x.line} ${x.fn}()`));
p(`SQL OUTSIDE REPOSITORIES (${report.sqlOutsideRepos.length})`);
report.sqlOutsideRepos.forEach((x) => console.log(`${x.r}:${x.line}  ${x.text}`));
p(`ANY (${report.any.length})`);
report.any.forEach((x) => console.log(`${x.r}:${x.line}  ${x.text}`));
p(`CASTS (${report.casts.length})`);
report.casts.forEach((x) => console.log(`${x.r}:${x.line}  ${x.text}`));
p(`NON-NULL ASSERTIONS (${report.nonNull.length})`);
report.nonNull.forEach((x) => console.log(`${x.r}:${x.line}  ${x.text}`));
p(`IMPORT RULE VIOLATIONS (${report.imports.length})`);
report.imports
  .filter((x) => !x.kind.includes('ok'))
  .forEach((x) => console.log(`${x.kind}: ${x.from} -> ${x.to}`));
p(`CYCLES (${report.cycles.length})`);
report.cycles.forEach((x) => console.log(x));
p(`NAMING (${report.namingViolations.length})`);
report.namingViolations.forEach((x) => console.log(`${x.r} :: ${x.rule}`));
p(`DEAD EXPORTS (${report.deadExports.length})`);
report.deadExports.forEach((x) => console.log(x));
p(`HANDLER CRYPTO (${report.handlersWithLogic.length})`);
report.handlersWithLogic.forEach((x) => console.log(`${x.r} :: ${x.why}`));
console.log(`\nfiles scanned: ${files.length}`);