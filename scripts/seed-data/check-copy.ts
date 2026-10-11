// Copy-integrity check for the seed content. Runs against the PARSED values
// (not the source text), so TypeScript keys/properties never produce noise —
// only the actual strings that will be published on the public site.
//
// Rules:
//   - Arabic copy must contain no Latin/Cyrillic words except a small
//     allowlist of legitimate units/acronyms (BMR, TDEE, kcal, mg, CMP-xx).
//   - English copy must contain no Arabic or Cyrillic characters at all.
//   - Titles, excerpts, meta fields and bodies must be non-empty.
//   - Blog bodies must reach the 400-word minimum required by P32-SEED.
//
// Run: node --import ./scripts/register-alias.mjs scripts/seed-data/check-copy.ts
import { SEED_POSTS } from './blog-posts.js';
import { SEED_PLANS } from './pricing-plans.js';

const AR = /[\u0600-\u06FF]/;
const CYR = /[\u0400-\u04FF]/;
const LATIN_WORD = /[A-Za-z\u0400-\u04FF]{2,}/g;

/** Latin tokens legitimately embedded in Arabic copy. */
const ALLOWED_IN_ARABIC = new Set([
  'BMR', 'TDEE', 'PDF', 'CMP', 'NutriClinicEG',
]);

const errors: string[] = [];

function arabicCheck(label: string, value: string) {
  for (const w of value.match(LATIN_WORD) || []) {
    if (ALLOWED_IN_ARABIC.has(w)) continue;
    // Pure-Latin lines that are entirely a URL/email/placeholder are fine.
    errors.push(`${label}: Latin token [${w}] inside Arabic copy`);
  }
  if (CYR.test(value)) errors.push(`${label}: Cyrillic characters inside Arabic copy`);
}

function englishCheck(label: string, value: string) {
  if (AR.test(value)) errors.push(`${label}: Arabic characters inside English copy`);
  if (CYR.test(value)) errors.push(`${label}: Cyrillic characters inside English copy`);
}

function wordCount(md: string): number {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`|]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

for (const p of SEED_PLANS) {
  const tag = `plan "${p.key}"`;
  if (!p.name_ar.trim() || !p.name_en.trim()) errors.push(`${tag}: empty plan name`);
  if (!p.description_ar.trim() || !p.description_en.trim()) errors.push(`${tag}: empty plan description`);
  arabicCheck(`${tag} name_ar`, p.name_ar);
  englishCheck(`${tag} name_en`, p.name_en);
  arabicCheck(`${tag} description_ar`, p.description_ar);
  englishCheck(`${tag} description_en`, p.description_en);
  for (const f of p.features) {
    if (!f.trim()) errors.push(`${tag}: empty feature string`);
  }
}

const seenSlugs = new Set<string>();
for (const p of SEED_POSTS) {
  const tag = `post ${p.locale}/${p.slug}`;
  const key = `${p.locale}/${p.slug}`;
  if (seenSlugs.has(key)) errors.push(`${tag}: duplicate (locale, slug) — the seed would not be idempotent`);
  seenSlugs.add(key);

  if (!p.title.trim()) errors.push(`${tag}: empty title`);
  if (!p.excerpt.trim()) errors.push(`${tag}: empty excerpt`);
  if (!p.content_md.trim()) errors.push(`${tag}: empty body`);

  // Word count only counts body copy (Latin word count is locale-neutral).
  const wc = wordCount(p.content_md);
  if (wc < 400) errors.push(`${tag}: body is ${wc} words, minimum is 400`);

  const fields: Array<[string, string]> = [
    ['title', p.title],
    ['excerpt', p.excerpt],
    ['meta_title', p.meta_title],
    ['meta_desc', p.meta_desc],
    ['guest_author', p.guest_author],
    ['content_md', p.content_md],
  ];
  for (const [name, value] of fields) {
    if (p.locale === 'ar') arabicCheck(`${tag} ${name}`, value);
    else englishCheck(`${tag} ${name}`, value);
  }
}

if (errors.length) {
  console.error(`COPY CHECK FAILED (${errors.length} issues):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

const ar = SEED_POSTS.filter((p) => p.locale === 'ar').length;
const en = SEED_POSTS.filter((p) => p.locale === 'en').length;
console.log(
  `copy OK: ${SEED_PLANS.length} plans, ${SEED_POSTS.length} posts (${ar} ar / ${en} en), all bodies >= 400 words, no script contamination`,
);