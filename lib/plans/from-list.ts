import { runPlanChecks, MAX_RECONCILE_ATTEMPTS } from '@/lib/nutrition/pipeline';
import { getAiClientForDoctor } from '@/lib/ai/client';
import { buildCandidatePool } from './candidates';
import { dbItem, toCheckMeals, applyReconciledGrams, toPayload } from './day-items';
import { fencedPrefs } from './targets';
import { fail } from './errors';
import {
  fromListOutputSchema,
  type PlanGenerateInput,
  MEAL_NAMES,
} from './plans.schema';
import type { BuiltDay, DayMeal, DayItem, PatientForPlan, Targets } from './types';

export const MAX_GENERATION_ATTEMPTS = 3;

export async function generateFromList(
  doctorId: string,
  isAdmin: boolean,
  patient: PatientForPlan,
  input: PlanGenerateInput,
  targets: Targets
): Promise<BuiltDay> {
  const pool = await buildCandidatePool(doctorId, input.include_own_foods ?? false);
  if (pool.candidates.length === 0) {
    throw fail('NO_CANDIDATES', 'No eligible foods: the admin list is empty. Request items via the food-request flow.', {
      action: 'request_food', link: '/dashboard/food-lists',
    });
  }
  const byId = new Map(pool.candidates.map((c) => [c.id, c]));
  const mealsPerDay = input.preferences?.mealsPerDay ?? 4;
  const system = [
    'You are a nutrition plan composer. Reply with a single valid JSON object only.',
    'Choose ONLY food_id values from the candidate list below. Never invent items (NP-21).',
    `Build ${mealsPerDay} meals using these names: ${MEAL_NAMES.join(', ')}.`,
    `Aim for ~${targets.calories} kcal total; a deterministic reconciler fixes exact grams later — prioritize variety and balance.`,
    'Each item: {"food_id": "<id from list>", "grams": <30-500>}.',
  ].join(' ');
  const candidateLines = pool.candidates.map((c) => {
    const own = c.owner_id !== null ? ' (doctor-private)' : '';
    return `- ${c.id} | ${c.name_ar}${c.name_en ? ` / ${c.name_en}` : ''} | kcal=${c.calories_per_100g}/100g P=${c.protein_per_100g} C=${c.carbs_per_100g} F=${c.fats_per_100g}${own}`;
  });
  const user = `${fencedPrefs(input)}\nTargets: kcal=${targets.calories} protein=${targets.proteinG}g carbs=${targets.carbsG}g fats=${targets.fatsG}g.\nCandidates (admin first, then private):\n${candidateLines.join('\n')}`;
  const ai = await getAiClientForDoctor(doctorId, { isAdmin, requestType: 'plan_generate', patientData: true });
  let attempts = 0;
  let lastError = 'Model returned no usable meals';
  while (attempts < MAX_GENERATION_ATTEMPTS) {
    attempts += 1;
    const parsed = await ai.chatJson(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      fromListOutputSchema,
      { requestType: 'plan_generate', maxTokens: 4000 }
    );
    const { _disclaimer, ...output } = parsed as typeof parsed & { _disclaimer?: string };
    void _disclaimer;
    // NP-21: reject out-of-scope food_ids and regenerate.
    const unknown: string[] = [];
    const meals: DayMeal[] = [];
    for (const meal of output.meals) {
      const items: DayItem[] = [];
      for (const entry of meal.items) {
        const food = byId.get(entry.food_id);
        if (!food) {
          unknown.push(entry.food_id);
          continue;
        }
        items.push(dbItem(food, Math.min(2000, Math.max(1, entry.grams))));
      }
      if (items.length > 0) meals.push({ mealName: meal.meal_name, items });
    }
    if (unknown.length > 0 || meals.length === 0) {
      lastError = unknown.length > 0 ? `Out-of-scope food_ids rejected: ${unknown.slice(0, 5).join(', ')}` : lastError;
      continue;
    }
    const verdict = await runPlanChecks({
      gender: patient.gender,
      heightCm: patient.height_cm,
      allergies: patient.allergies ?? [],
      conditions: patient.chronic_conditions ?? [],
      targetCalories: targets.calories,
      macroTargets: { proteinG: targets.proteinG, carbsG: targets.carbsG, fatsG: targets.fatsG },
      meals: toCheckMeals(meals),
    });
    if (verdict.verdict === 'approved' && verdict.reconcile) {
      return {
        meals: applyReconciledGrams(meals, verdict.reconcile.items),
        attempts,
        poolCounts: { admin: pool.adminCount, own: pool.ownCount },
        payload: toPayload(verdict.reconcile),
        ratio: 1,
        valuesUnverified: false,
        publishWarning: false,
        report: null,
      };
    }
    lastError = verdict.blocks.slice(0, 2).join(' | ') || `Pipeline verdict: ${verdict.verdict} at ${verdict.stage}`;
  }
  throw fail('GENERATION_FAILED', `Plan generation failed after ${MAX_RECONCILE_ATTEMPTS} attempts: ${lastError.slice(0, 500)}`);
}
