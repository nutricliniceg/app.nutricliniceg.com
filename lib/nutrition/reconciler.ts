// §8.3 Macro Reconciler — deterministic, NO AI.
// Source of truth: per-100g values from FoodItem; every output value is
// recomputed as value = per100 * grams / 100. Model-supplied numbers are
// never trusted (§8.2 note 3) — the input carries none by construction.

export interface Per100g {
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface ReconcileItemInput {
  foodId: string | null;
  name: string;
  grams: number;
  per100: Per100g;
}

export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatsG: number;
}

export interface ReconciledItem {
  foodId: string | null;
  name: string;
  grams: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  calories: number;
}

export interface ReconcileResult {
  target_calories: number;
  reconciled_total_calories: number;
  deviation_kcal: number;
  reconciled_at: string;
  status: 'accepted' | 'needs_retry';
  iterations: number;
  items: ReconciledItem[];
}

const MAX_ITERATIONS = 200;
const LAMBDA = 0.1;

interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fats: number;
}

function totalsFor(items: ReconcileItemInput[], grams: number[]): Totals {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fats = 0;
  for (let i = 0; i < items.length; i++) {
    const f = grams[i] / 100;
    kcal += items[i].per100.kcal * f;
    protein += items[i].per100.protein * f;
    carbs += items[i].per100.carbs * f;
    fats += items[i].per100.fats * f;
  }
  return { kcal, protein, carbs, fats };
}

function macroDev(t: Totals, macros: MacroTargets): number {
  return Math.abs(t.protein - macros.proteinG) + Math.abs(t.carbs - macros.carbsG) + Math.abs(t.fats - macros.fatsG);
}

// §8.3 objective: min |Σkcal − target| + λ·(macro deviation).
function objective(t: Totals, target: number, macros: MacroTargets): number {
  return Math.abs(t.kcal - target) + LAMBDA * macroDev(t, macros);
}

function toItems(items: ReconcileItemInput[], grams: number[]): ReconciledItem[] {
  return items.map((item, i) => {
    const f = grams[i] / 100;
    const round2 = (n: number): number => Math.round(n * 100) / 100;
    return {
      foodId: item.foodId,
      name: item.name,
      grams: Math.round(grams[i] * 100) / 100,
      protein_g: round2(item.per100.protein * f),
      carbs_g: round2(item.per100.carbs * f),
      fats_g: round2(item.per100.fats * f),
      calories: round2(item.per100.kcal * f),
    };
  });
}

export function reconcile(
  targetCalories: number,
  macros: MacroTargets,
  items: ReconcileItemInput[]
): ReconcileResult {
  const at = new Date().toISOString();
  const clean = items
    .filter((i) => i && Number.isFinite(i.grams) && Number.isFinite(i.per100.kcal))
    .map((i) => ({ ...i, grams: Math.max(1, i.grams) }));
  if (clean.length === 0 || !Number.isFinite(targetCalories) || targetCalories <= 0) {
    return { target_calories: Math.round(targetCalories), reconciled_total_calories: 0, deviation_kcal: Math.round(targetCalories), reconciled_at: at, status: 'needs_retry', iterations: 0, items: [] };
  }
  const target = targetCalories;
  const lo = clean.map((i) => Math.max(1, 0.5 * i.grams));
  const hi = clean.map((i) => 2 * i.grams);
  let grams = clean.map((i) => i.grams);

  const finish = (finalGrams: number[], status: 'accepted' | 'needs_retry', iterations: number): ReconcileResult => {
    const total = totalsFor(clean, finalGrams).kcal;
    const deviation = Math.abs(total - target);
    return {
      target_calories: Math.round(target),
      reconciled_total_calories: Math.round(total * 100) / 100,
      deviation_kcal: Math.round(deviation * 100) / 100,
      reconciled_at: at,
      status,
      iterations,
      items: toItems(clean, finalGrams),
    };
  };

  // Immediate accept (§8.3 step 3).
  if (Math.abs(totalsFor(clean, grams).kcal - target) <= 1) {
    return finish(grams, 'accepted', 0);
  }

  // Constrained optimization: greedy local search over gram adjustments.
  // Move order spirals over highest-kcal-density items first in 5g steps,
  // then 1g refinement; every applied move must improve the §8.3 objective.
  // Best snapshot is tracked kcal-first (acceptance is kcal-only), macro
  // deviation breaks ties — so the λ term steers without ever vetoing kcal.
  const density = clean.map((i) => i.per100.kcal / 100);
  const order = clean.map((_, i) => i).sort((a, b) => density[b] - density[a] || a - b);
  let iterations = 0;
  let best = grams.slice();
  let bestKcalAbs = Math.abs(totalsFor(clean, grams).kcal - target);
  let bestMacro = macroDev(totalsFor(clean, grams), macros);
  const noteBest = (g: number[]): void => {
    const t = totalsFor(clean, g);
    const kcalAbs = Math.abs(t.kcal - target);
    const macro = macroDev(t, macros);
    if (kcalAbs < bestKcalAbs - 1e-9 || (Math.abs(kcalAbs - bestKcalAbs) <= 1e-9 && macro < bestMacro)) {
      bestKcalAbs = kcalAbs;
      bestMacro = macro;
      best = g.slice();
    }
  };

  for (const step of [5, 1]) {
    let improved = true;
    while (improved && iterations < MAX_ITERATIONS && bestKcalAbs > 1) {
      improved = false;
      for (const i of order) {
        if (density[i] <= 0 || iterations >= MAX_ITERATIONS || bestKcalAbs <= 1) break;
        const delta = target - totalsFor(clean, grams).kcal;
        if (Math.abs(delta) <= step / 2) continue;
        const next = Math.min(hi[i], Math.max(lo[i], grams[i] + Math.sign(delta) * step));
        if (next === grams[i]) continue;
        const trial = grams.slice();
        trial[i] = next;
        if (objective(totalsFor(clean, trial), target, macros) < objective(totalsFor(clean, grams), target, macros) - 1e-9) {
          grams = trial;
          iterations += 1;
          improved = true;
          noteBest(grams);
        }
      }
    }
    if (iterations >= MAX_ITERATIONS || bestKcalAbs <= 1) break;
  }
  grams = best.slice();

  // Patient-facing rounding: nearest 5g, kept only while within ±3 kcal —
  // revert the worst roundings first until the band holds.
  const rounded = grams.map((g, i) => {
    const snapped = Math.round(g / 5) * 5;
    if (snapped < 1) return grams[i];
    return Math.min(hi[i], Math.max(lo[i], snapped));
  });
  const roundError = rounded.map((g, i) => Math.abs((g - grams[i]) * density[i]));
  const revertOrder = rounded.map((_, i) => i).sort((a, b) => roundError[b] - roundError[a]);
  const finalGrams = rounded.slice();
  for (const i of revertOrder) {
    if (Math.abs(totalsFor(clean, finalGrams).kcal - target) <= 3) break;
    finalGrams[i] = grams[i];
  }

  const deviation = Math.abs(totalsFor(clean, finalGrams).kcal - target);
  return finish(finalGrams, deviation <= 5 ? 'accepted' : 'needs_retry', iterations);
}
