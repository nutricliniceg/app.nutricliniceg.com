// P32-AUDITFIX — same-class sweep: close the "INSERT omits a varchar(36)
// PRIMARY KEY with no default" defect class across the ENTIRE repository insert
// surface, so the class is provably closed rather than spot-fixed.
//
// Method (no DB connection needed — prisma/schema.sql is the authoritative DDL):
//   1. parse every CREATE TABLE to learn each table's PRIMARY KEY column, its
//      type, its DEFAULT and its EXTRA (auto_increment).
//   2. scan every lib/**/*.repo.ts for `INSERT INTO <table> (<columns>)`.
//   3. classify each table:
//        SAFE       PK is auto_increment, or the INSERT supplies the PK column.
//        VULNERABLE PK is a varchar/char with DEFAULT NULL and NOT auto_increment
//                   AND the INSERT omits it  ->  MySQL binds '' and the SECOND
//                   insert collides with ER_DUP_ENTRY.
//   4. exit 1 if any VULNERABLE remains, so this can become a permanent gate.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

// ── 1. schema ─────────────────────────────────────────────────────────────────
const ddl = fs.readFileSync(path.join(ROOT, 'prisma/schema.sql'), 'utf8');
const tables = new Map();
// Tables close with `) ENGINE=InnoDB ...;` (or a bare `);`), so match on the
// opening paren and let the column list run up to the first line-starting ')'.
for (const m of ddl.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+`?(\w+)`?\s*\(([\s\S]*?)^\s*\)\s*[A-Z]/gim)) {
  const [, name, body] = m;
  const pkLine = body.match(/^[ \t]*`?(\w+)`?\s+[^,\n]*PRIMARY KEY/im);
  if (!pkLine) continue;
  const pk = pkLine[1];
  // Locate the full column definition for the PK.
  const colDef = new RegExp(`^[ \\t]*\`?${pk}\`?[ \\t]+(.+)$`, 'im').exec(body)?.[1] ?? '';
  tables.set(name, {
    table: name,
    pk,
    type: (/^\s*(var)?char/i.exec(colDef)?.[0] ?? colDef.split(/\s+/)[0] ?? '').trim().toLowerCase(),
    hasDefault: /\bDEFAULT\b/i.test(colDef),
    autoIncrement: /auto_increment/i.test(colDef),
  });
}

// ── 2. repository inserts ─────────────────────────────────────────────────────
function repoFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...repoFiles(p));
    else if (e.name.endsWith('.repo.ts')) out.push(p);
  }
  return out;
}

const inserts = [];
for (const file of repoFiles(path.join(ROOT, 'lib'))) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  // Column list immediately after the table name (single or multi-line).
  for (const m of src.matchAll(/INSERT\s+(?:IGNORE\s+)?INTO\s+`?(\w+)`?\s*\(([^)]*)\)/gi)) {
    const cols = m[2].split(',').map((c) => c.trim().replace(/[`\s]/g, ''));
    const line = src.slice(0, m.index).split('\n').length;
    inserts.push({ table: m[1], cols, file: rel, line });
  }
}

// ── 3. classify ───────────────────────────────────────────────────────────────
const rows = [];
for (const t of [...tables.values()].sort((a, b) => a.table.localeCompare(b.table))) {
  const uses = inserts.filter((i) => i.table.toLowerCase() === t.table.toLowerCase());
  const supplies = uses.filter((u) => u.cols.some((c) => c.toLowerCase() === t.pk.toLowerCase()));
  const varcharNoDefault = /char/.test(t.type) && !t.hasDefault && !t.autoIncrement;
  const omits = uses.length > 0 && supplies.length === 0;
  let verdict;
  if (uses.length === 0) verdict = 'NO REPO INSERT';
  else if (t.autoIncrement) verdict = 'SAFE (auto_increment PK)';
  else if (!omits) verdict = 'SAFE (PK supplied)';
  else if (varcharNoDefault) verdict = 'VULNERABLE';
  else verdict = 'CHECK';
  rows.push({ ...t, insertSites: uses.length, verdict, where: uses.map((u) => `${u.file}:${u.line}`).join(', ') });
}

// ── 4. report ─────────────────────────────────────────────────────────────────
const w = (s, n) => String(s).padEnd(n);
console.log(w('TABLE', 22) + w('PK', 16) + w('PK TYPE', 14) + w('DEFAULT', 10) + w('AUTO_INC', 10) + w('INSERTS', 9) + 'VERDICT');
console.log('-'.repeat(104));
for (const r of rows) {
  console.log(
    w(r.table, 22) + w(r.pk, 16) + w(r.type, 14) + w(r.hasDefault ? 'yes' : 'NULL', 10) +
    w(r.autoIncrement ? 'yes' : 'no', 10) + w(r.insertSites, 9) + r.verdict,
  );
}
const vuln = rows.filter((r) => r.verdict === 'VULNERABLE');
const check = rows.filter((r) => r.verdict === 'CHECK');

// Report lines are assembled from pre-computed values rather than interpolated
// inline: the strings mention "INSERT" (e.g. the 'INSERT sites scanned' label
// that tests/insert-id-canonical.test.ts parses), which the repo's
// no-restricted-syntax rule reads as SQL interpolation. No SQL is built here —
// this script only parses the DDL and prints a report.
const siteCount = String(inserts.length);
const tableCount = String(tables.size);
const vulnCount = String(vuln.length);
const vulnList = vuln.length ? ' -> ' + vuln.map((v) => v.table + ' (' + v.where + ')').join(', ') : '';
const checkCount = String(check.length);
const checkList = check.length ? ' -> ' + check.map((v) => v.table).join(', ') : '';

console.log('');
console.log('tables in schema        : ' + tableCount);
console.log('INSERT sites scanned    : ' + siteCount);
console.log('VULNERABLE (must be 0)  : ' + vulnCount + vulnList);
console.log('CHECK (manual review)   : ' + checkCount + checkList);
process.exit(vuln.length > 0 ? 1 : 0);