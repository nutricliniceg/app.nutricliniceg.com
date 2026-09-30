import { stripAllergens, assertNoAllergens, getAllergySynonyms, type GuardItem } from './allergy-guard';
import { checkContraindications, getContraRules, type DayTotals } from './contraindications';
import { validateMealPairings, getPairingWarningRules, type PairingItem } from './pairing';
import { reconcile, type MacroTargets, type Per100g, type ReconcileResult } from './reconciler';
import { clampTargetCalories, idealWeightKg, type Gender } from './rails';

// NUT-05 MANDATORY check order: allergies → contraindications → pairing →
// reconciler → safety rails. The first failing stage wins. Pure verdicts come
// out; notifications/audit stay with the caller (P14 route layer).

export const MAX_RECONCILE_ATTEMPTS = 3;

export interface PlanCheckMealInput {
  mealName: string;
  items: PlanCheckItem[];
}

export interface PlanCheckItem extends GuardItem, PairingItem {
  grams: number;
  per100: Per100g & {
    potassiumMg?: number | null;
    phosphorusMg?: number | null;
    sodiumMg?: number | null;
    addedSugarG?: number | null;
  };
}

export interface PlanCheckInput {
  gender: Gender;
  heightCm: number;
  allergies: string[];
  conditions: string[];
  medications?: string[];
  targetCalories: number;
  macroTargets: MacroTargets;
  meals: PlanCheckMealInput[];
}

export type VerdictStage = 'allergies' | 'contraindications' | 'pairing' | 'reconciler' | 'rails';

export interface PlanCheckVerdict {
  verdict: 'approved' | 'blocked' | 'needs_retry';
  stage: VerdictStage;
  blocks: string[];
  warnings: string[];
  removedPreDraft: Array<{ meal: string; name: string; allergy: string }>;
  railsClamped: boolean;
  reconcile: ReconcileResult | null;
  notifyDoctor: string[];
  suggestedTarget?: number;
}

function dayTotals(meals: PlanCheckMealInput[]): DayTotals {
  let proteinG = 0;
  let potassiumMg: number | null = 0;
  let phosphorusMg: number | null = 0;
  let sodiumMg: number | null = 0;
  let addedSugarG: number | null = 0;
  for (const meal of meals) {
    for (const item of meal.items) {
      const f = item.grams / 100;
      proteinG += item.per100.protein * f;
      potassiumMg = item.per100.potassiumMg == null ? null : (potassiumMg ?? 0) + item.per100.potassiumMg * f;
      phosphorusMg = item.per100.phosphorusMg == null ? null : (phosphorusMg ?? 0) + item.per100.phosphorusMg * f;
      sodiumMg = item.per100.sodiumMg == null ? null : (sodiumMg ?? 0) + item.per100.sodiumMg * f;
      addedSugarG = item.per100.addedSugarG == null ? null : (addedSugarG ?? 0) + item.per100.addedSugarG * f;
    }
  }
  return { proteinG, potassiumMg, phosphorusMg, sodiumMg, addedSugarG };
}

// After 3 failed reconciliations the caller notifies the doctor with the
// nearest 10-kcal neighbor target instead of publishing off-target (§8.3.5).
export function suggestNearbyTarget(failedTarget: number, achieved: number): number {
  const rounded = Math.round(achieved / 10) * 10;
  if (Math.abs(rounded - failedTarget) >= 10) return rounded;
  return failedTarget + (achieved > failedTarget ? 10 : -10);
}

export async function runPlanChecks(input: PlanCheckInput): Promise<PlanCheckVerdict> {
  const base = {
    blocks: [] as string[],
    warnings: [] as string[],
    removedPreDraft: [] as Array<{ meal: string; name: string; allergy: string }>,
    railsClamped: false,
    notifyDoctor: [] as string[],
  };
  const synonyms = await getAllergySynonyms();

  // Stage 1 — allergies: strip pre-draft, hard-block leftovers on save.
  const strippedMeals: PlanCheckMealInput[] = input.meals.map((meal) => {
    const { clean, removed } = stripAllergens(meal.items, input.allergies, synonyms);
    for (const r of removed) base.removedPreDraft.push({ meal: meal.mealName, name: r.item.nameAr, allergy: r.allergy });
    return { ...meal, items: clean };
  });
  const saveViolations = strippedMeals.flatMap((meal) => assertNoAllergens(meal.items, input.allergies, synonyms));
  if (saveViolations.length > 0) {
    return { ...base, verdict: 'blocked', stage: 'allergies', blocks: saveViolations, reconcile: null };
  }

  // Stage 2 — contraindications (after strip, before pairing).
  const rules = await getContraRules();
  const contra = checkContraindications(dayTotals(strippedMeals), input.conditions, idealWeightKg(input.heightCm), rules);
  base.warnings.push(...contra.warnings);
  if (contra.noAutoSuggest) {
    base.notifyDoctor.push('Kidney case: no auto-suggested values — doctor review mandatory before any publish (§8.5).');
  }
  if (contra.blocks.length > 0) {
    return { ...base, verdict: 'blocked', stage: 'contraindications', blocks: contra.blocks, reconcile: null };
  }

  // Stage 3 — pairing (server-side; model claims ignored).
  const warningRules = await getPairingWarningRules();
  const pairingBlocks: string[] = [];
  for (const meal of strippedMeals) {
    const verdict = validateMealPairings(meal.items, warningRules);
    pairingBlocks.push(...verdict.hardViolations.map((v) => `[${meal.mealName}] ${v}`));
    base.warnings.push(...verdict.warnings.map((w) => `[${meal.mealName}] ${w}`));
  }
  if (pairingBlocks.length > 0) {
    return { ...base, verdict: 'blocked', stage: 'pairing', blocks: pairingBlocks, reconcile: null };
  }

  // Stage 4 — reconciler over the surviving items.
  const flat = strippedMeals.flatMap((m) => m.items).map((i) => ({ foodId: i.foodId, name: i.nameAr, grams: i.grams, per100: { kcal: i.per100.kcal, protein: i.per100.protein, carbs: i.per100.carbs, fats: i.per100.fats } }));
  if (flat.length === 0) {
    return { ...base, verdict: 'blocked', stage: 'allergies', blocks: ['All items were removed by the allergy guard — nothing left to reconcile.'], reconcile: null };
  }
  const reconciled = reconcile(input.targetCalories, input.macroTargets, flat);
  if (reconciled.status === 'needs_retry') {
    return {
      ...base,
      verdict: 'needs_retry',
      stage: 'reconciler',
      blocks: [`Reconciler could not reach ${input.targetCalories} kcal within ±5 (attempt of ${MAX_RECONCILE_ATTEMPTS}).`],
      reconcile: reconciled,
      suggestedTarget: suggestNearbyTarget(input.targetCalories, reconciled.reconciled_total_calories),
    };
  }

  // Stage 5 — safety rails: absolute floors win over everything.
  const clamped = clampTargetCalories(reconciled.target_calories, input.gender);
  if (clamped.clamped) {
    base.railsClamped = true;
    base.notifyDoctor.push(`Target raised to the safety floor of ${clamped.floor} kcal (${input.gender}) — original request was below the minimum (DASH-09).`);
  }
  return { ...base, verdict: 'approved', stage: 'rails', reconcile: reconciled };
}
