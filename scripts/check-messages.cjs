// Detects mojibake in messages/*.json: invalid UTF-8, Latin-1 supplement chars
// (U+0080-U+00FF) inside Arabic text, and the classic Ã/Â/Ù/Ø double-encoding
// signatures. Also reports key parity between ar and en.
const fs = require('node:fs');
const path = require('node:path');

// Optional argv[2] overrides the directory (used by the self-test to point the
// gate at a deliberately corrupted copy and prove it fails).
const dir = process.argv[2] || 'messages';
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

// Characters that legitimately appear in Arabic copy: Arabic block, Arabic
// punctuation, digits, and the standard ASCII set. Anything in Latin-1
// Supplement / Latin Extended-A that is not a deliberate symbol is suspect.
const SUSPECT = /[ÂÃÙØÞßÎÏÒÓÔÙŠÐÑ][\u0080-\u00BF\u2013\u2014\u2018\u2019\u201C\u201D]/;
const HIGH = /[\u0080-\u024F]/;

let problems = 0;
for (const f of files) {
  const p = path.join(dir, f);
  const buf = fs.readFileSync(p);

  // 1. Valid UTF-8 round-trip?
  const text = buf.toString('utf8');
  if (Buffer.from(text, 'utf8').compare(buf) !== 0) {
    console.log(`${f}: NOT a clean UTF-8 round-trip`);
    problems++;
  }
  if (text.includes('\uFFFD')) {
    console.log(`${f}: contains U+FFFD replacement char(s): ${(text.match(/\uFFFD/g) || []).length}`);
    problems++;
  }

  const json = JSON.parse(text);
  const walk = (node, pathParts) => {
    if (typeof node === 'string') {
      if (SUSPECT.test(node)) {
        problems++;
        console.log(`  MOJIBAKE ${f} :: ${pathParts.join('.')}`);
        console.log(`     ${JSON.stringify(node).slice(0, 150)}`);
      } else if (HIGH.test(node) && !/[٠-٩]/.test(node)) {
        // any other high codepoint outside Arabic block is worth eyeballing
        const bad = node.match(/[^\u0000-\u00FF\u0600-\u06FF\u200C\u200D\u200E\u200F\u2010-\u2027\u00A0\uFB50-\uFDFF\uFE70-\uFEFF]/g);
        if (bad) {
          problems++;
          console.log(`  NON-ARABIC HIGH ${f} :: ${pathParts.join('.')} -> ${JSON.stringify(bad.join(''))}`);
        }
      }
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, [...pathParts, k]);
    }
  };
  walk(json, []);
}

// parity
const ar = JSON.parse(fs.readFileSync(path.join(dir, 'ar.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));

// Intentionally locale-specific: each locale shows the OTHER language's name,
// so the key differs by design and must not be reported as a mismatch.
const ALLOWED_ASYMMETRY = new Set(['common.switch_to_english', 'common.switch_to_arabic']);
const cmp = (ns) => {
  const a = Object.keys(ar[ns] || {}).sort();
  const e = Object.keys(en[ns] || {}).sort();
  const onlyAr = a.filter((k) => !e.includes(k) && !ALLOWED_ASYMMETRY.has(`${ns}.${k}`));
  const onlyEn = e.filter((k) => !a.includes(k) && !ALLOWED_ASYMMETRY.has(`${ns}.${k}`));
  const status = onlyAr.length === 0 && onlyEn.length === 0 ? 'OK' : 'MISMATCH';
  console.log(`parity ${ns}: ${status} (${a.length} keys)` + (status === 'MISMATCH' ? ` ar-only=${onlyAr} en-only=${onlyEn}` : ''));
  if (status === 'MISMATCH') problems++;
};
for (const ns of Object.keys(ar)) cmp(ns);
for (const ns of Object.keys(en)) if (!(ns in ar)) { console.log(`parity: ${ns} exists only in en.json`); problems++; }

console.log(`\ntotal problems: ${problems}`);
process.exit(problems > 0 ? 1 : 0);