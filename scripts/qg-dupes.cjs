#!/usr/bin/env node
/* Duplicate-block detector: normalized line windows across lib/ + app/.
 * Flags identical 8+ line blocks appearing in 2+ files. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.next', '.git', '.data']);
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(f);
  }
  return out;
}
const files = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'ui'))];
const WINDOW = 8;
const index = new Map();
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  for (let i = 0; i + WINDOW <= lines.length; i++) {
    const block = lines.slice(i, i + WINDOW);
    if (block.every((l) => l.trim() === '')) continue;
    // normalize: strip strings content, whitespace, identifiers length
    const norm = block
      .map((l) => l.trim().replace(/'[^']*'/g, "'S'").replace(/"[^"]*"/g, '"S"').replace(/\s+/g, ' '))
      .join('\n');
    if (!index.has(norm)) index.set(norm, []);
    index.get(norm).push({ f: path.relative(ROOT, f).split(path.sep).join('/'), i: i + 1 });
  }
}
// merge overlapping windows into maximal duplicate blocks
const seen = new Set();
const results = [];
for (const [norm, occs] of index) {
  const uniqFiles = new Set(occs.map((o) => o.f));
  if (uniqFiles.size < 2) continue;
  const key = `${norm}`;
  if (seen.has(key)) continue;
  seen.add(key);
  results.push({
    files: [...uniqFiles],
    occs,
    block: norm,
  });
}
// greedy dedupe: keep the longest distinct clusters
results.sort((a, b) => b.block.length - a.block.length);
const kept = [];
const claimed = new Set();
for (const r of results) {
  const sig = r.files.slice().sort().join('|');
  const sigStart = r.occs[0].i;
  if (claimed.has(`${sig}@${sigStart}`)) continue;
  claimed.add(`${sig}@${sigStart}`);
  kept.push(r);
}
console.log(`DUPLICATE BLOCKS (>=${WINDOW} normalized lines in 2+ files): ${kept.length}`);
for (const r of kept.slice(0, 60)) {
  console.log('\n---');
  r.occs.slice(0, 6).forEach((o) => console.log(`  ${o.f}:${o.i}`));
  console.log(
    r.block
      .split('\n')
      .slice(0, 4)
      .map((l) => '  | ' + l.slice(0, 110))
      .join('\n')
  );
}