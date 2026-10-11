// Static self-check for the seed data: every template food key must resolve to
// a seeded food, and every food's computed kcal must sit inside the FL-09/14
// consistency gate. Run: node --import ./scripts/register-alias.mjs \
//   scripts/seed-data/check-seed-data.ts
import { SEED_FOODS, kcalFromMacros } from './food-items.js';
import { SEED_TEMPLATES } from './plan-templates.js';
import { SEED_PLANS } from './pricing-plans.js';

const errors: string[] = [];
const keys = new Set(SEED_FOODS.map((f) => f.name_en));

// 1. Uniqueness of the idempotency keys.
for (const [label, list] of [
  ['plan', SEED_PLANS.map((p) => p.key)],
  ['template', SEED_TEMPLATES.map((t) => t.name)],
  ['food', SEED_FOODS.map((f) => f.name_en)],
] as const) {
  const seen = new Set<string>();
  for (const k of list) {
    if (seen.has(k)) errors.push(`duplicate ${label} key: ${k}`);
    seen.add(k);
  }
}

// 2. Every template food key resolves.
for (const t of SEED_TEMPLATES) {
  for (const d of t.days) {
    for (const m of d.meals) {
      for (const i of m.items) {
        if (!keys.has(i.key)) errors.push(`template "${t.name}" references unknown food: ${i.key}`);
      }
    }
  }
}

// 3. kcal gate: declared kcal is computed from macros, so verify the gate band.
for (const f of SEED_FOODS) {
  const kcal = kcalFromMacros(f.protein, f.carbs, f.fats);
  if (kcal <= 0) errors.push(`food "${f.name_en}" computed ${kcal} kcal`);
  if (f.protein + f.carbs + f.fats > 100.5)
    errors.push(`food "${f.name_en}" macros sum > 100 g per 100 g`);
}

// 4. Template reference macros must be plausible for the band.
for (const t of SEED_TEMPLATES) {
  const r = t.reference;
  const implied = kcalFromMacros(r.proteinG, r.carbsG, r.fatsG);
  if (Math.abs(implied - r.calories) / r.calories > 0.05)
    errors.push(`template "${t.name}" reference macros imply ${implied} kcal, declares ${r.calories}`);
}

if (errors.length) {
  console.error('SEED DATA CHECK FAILED:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(
  `seed data OK: ${SEED_PLANS.length} plans, ${SEED_TEMPLATES.length} templates, ${SEED_FOODS.length} foods, all references resolve`,
);