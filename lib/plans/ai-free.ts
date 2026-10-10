import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import { runPlanChecks, MAX_RECONCILE_ATTEMPTS } from '@/lib/nutrition/pipeline';
import { getAllergySynonyms, itemMatchesAllergy } from '@/lib/nutrition/allergy-guard';
import { checkKcalConsistency } from '@/lib/foods';
import { getAiClientForDoctor } from '@/lib/ai/client';
import { matchFoodByName } from './matching';
import { dbItem, toCheckMeals, applyReconciledGrams, toPayload } from './day-items';
import { fencedPrefs } from './targets';
import { fail } from './errors';
import {
  aiFreeOutputSchema,
  type PlanGenerateInput,
  MEAL_NAMES,
} from './plans.schema';
import type { BuiltDay, DayMeal, PatientForPlan, Targets, VerificationReport } from './types';

export const MAX_FREE_ATTEMPTS = 3;

export async function generateAiFree(
  doctorId: string,
  isAdmin: boolean,
  patient: PatientForPlan,
  input: PlanGenerateInput,
  targets: Targets
): Promise<BuiltDay> {
  // NUT-10: explicit confirmation is mandatory before free generation.
  if (!input.ai_free_confirmed) {
    throw fail('NEEDS_CONFIRMATION', 'الأصناف غير مُتحقَّق منها من قاعدة البيانات — دقة القيم مسؤولية مراجعتك | Items are NOT verified against the food database — value accuracy is your review responsibility.', {
      action: 'confirm_ai_free',
    });
  }
  const adminItems = await foodsRepository.listCandidates(doctorId, false, 200);
  const mealsPerDay = input.preferences?.mealsPerDay ?? 4;
  const system = [
    'You are a nutrition plan composer. Reply with a single valid JSON object only.',
    `Build ${mealsPerDay} meals using these names: ${MEAL_NAMES.join(', ')}.`,
    `Aim for ~${targets.calories} kcal total with protein~${targets.proteinG}g carbs~${targets.carbsG}g fats~${targets.fatsG}g.`,
    'Each item: {"food_name": "<clear Arabic name>", "grams": <30-500>, "protein_g": <per-item>, "carbs_g": <per-item>, "fats_g": <per-item>, "calories": <per-item>}.',
    'Use realistic Egyptian/Middle-Eastern foods with honest macro values.',
  ].join(' ');
  const user = `${fencedPrefs(input)}\nTargets: kcal=${targets.calories} protein=${targets.proteinG}g carbs=${targets.carbsG}g fats=${targets.fatsG}g.`;
  const ai = await getAiClientForDoctor(doctorId, { isAdmin, requestType: 'plan_generate_free', patientData: true });
  const synonyms = await getAllergySynonyms();
  let attempts = 0;
  let lastError = 'Model returned no usable meals';
  while (attempts < MAX_FREE_ATTEMPTS) {
    attempts += 1;
    const parsed = await ai.chatJson(
      [{ role: 'system', content: system }, { role: 'user', content: user }],
      aiFreeOutputSchema,
      { requestType: 'plan_generate_free', maxTokens: 4000 }
    );
    const { _disclaimer, ...output } = parsed as typeof parsed & { _disclaimer?: string };
    void _disclaimer;
    // NUT-21: drop nameless/contradictory items (kcal vs 4p+4c+9f > 15%).
    const kept: Array<{ mealName: (typeof MEAL_NAMES)[number]; name: string; grams: number; protein: number; carbs: number; fats: number; kcal: number }> = [];
    const dropped: string[] = [];
    for (const meal of output.meals) {
      for (const entry of meal.items) {
        const name = entry.food_name.trim();
        if (name === '') {
          dropped.push('(nameless item)');
          continue;
        }
        const check = checkKcalConsistency({ calories_per_100g: entry.calories, protein_per_100g: entry.protein_g, carbs_per_100g: entry.carbs_g, fats_per_100g: entry.fats_g });
        if (!check.ok) {
          dropped.push(`${name}: contradictory values`);
          continue;
        }
        kept.push({ mealName: meal.meal_name, name, grams: Math.min(2000, Math.max(1, entry.grams)), protein: entry.protein_g, carbs: entry.carbs_g, fats: entry.fats_g, kcal: entry.calories });
      }
    }
    if (kept.length === 0) {
      lastError = `All items rejected (${dropped.slice(0, 3).join('; ') || 'empty output'})`;
      continue;
    }
    // NUT-12: name-based allergy guard (less reliable — caveat recorded).
    const allergies = patient.allergies ?? [];
    const blocked: string[] = [];
    const survived = kept.filter((k) => {
      const hit = allergies.find((a) => a.trim() !== '' && itemMatchesAllergy({ foodId: k.name, nameAr: k.name, tags: [] }, a, synonyms));
      if (hit) {
        blocked.push(`${k.name} (allergy: ${hit})`);
        return false;
      }
      return true;
    });
    if (survived.length === 0) {
      lastError = `All items blocked by the name-based allergy guard: ${blocked.slice(0, 3).join('; ')}`;
      continue;
    }
    // NUT-13: auto-match against the ADMIN list → verified DB values + ✓.
    const details: VerificationReport['details'] = [];
    let verified = 0;
    const byMeal = new Map<string, BuiltDay['meals'][number]['items']>();
    for (const k of survived) {
      const match = matchFoodByName(k.name, null, adminItems);
      const list = byMeal.get(k.mealName) ?? [];
      if (match) {
        verified += 1;
        list.push({ ...dbItem(match.food, k.grams) });
        details.push({ name: k.name, verified: true, note: `Matched "${match.food.name_ar}" (${match.method}) — values replaced with verified data ✓` });
      } else {
        // Unverified: model-claimed values rescaled to per-100g for the pipeline.
        const f = k.grams > 0 ? 100 / k.grams : 0;
        list.push({
          foodId: null, nameAr: k.name, nameEn: null, source: 'model', grams: k.grams,
          per100: {
            kcal: k.kcal * f, protein: k.protein * f, carbs: k.carbs * f, fats: k.fats * f,
            potassiumMg: null, phosphorusMg: null, sodiumMg: null, addedSugarG: null,
          },
          category: null, tags: [],
        });
        details.push({ name: k.name, verified: false, note: 'Not found in the admin list — model values, unverified' });
      }
      byMeal.set(k.mealName, list);
    }
    const meals: DayMeal[] = [...byMeal].map(([mealName, items]) => ({ mealName: mealName as (typeof MEAL_NAMES)[number], items }));
    const total = survived.length;
    const ratio = total === 0 ? 1 : Math.round((verified / total) * 100) / 100;
    const unverifiedShare = total === 0 ? 0 : (total - verified) / total;
    // NUT-19: mineral caps unenforceable in ai_free — explicit notice.
    const mineralNotice = 'Contraindication mineral caps (potassium/phosphorus) cannot be enforced in free mode — protein/sugar caps apply to claimed values only (NUT-19).';
    const verdict = await runPlanChecks({
      gender: patient.gender,
      heightCm: patient.height_cm,
      allergies: [],
      conditions: patient.chronic_conditions ?? [],
      targetCalories: targets.calories,
      macroTargets: { proteinG: targets.proteinG, carbsG: targets.carbsG, fatsG: targets.fatsG },
      meals: toCheckMeals(meals),
    });
    if (verdict.verdict === 'approved' && verdict.reconcile) {
      const publishWarning = unverifiedShare > 0.3;
      const report: VerificationReport = {
        mode: 'ai_free',
        verified,
        unverified: total - verified,
        total,
        ratio,
        details,
        reliabilityCaveat: 'Allergy matching was name-based and is less reliable than tag matching (NUT-12).',
        mineralNotice,
        publishWarning,
      };
      return {
        meals: applyReconciledGrams(meals, verdict.reconcile.items),
        attempts,
        poolCounts: { admin: adminItems.length, own: 0 },
        payload: toPayload(verdict.reconcile),
        ratio,
        valuesUnverified: verified < total,
        publishWarning,
        report,
      };
    }
    lastError = verdict.blocks.slice(0, 2).join(' | ') || `Pipeline verdict: ${verdict.verdict} at ${verdict.stage}`;
  }
  throw fail('GENERATION_FAILED', `Free generation failed after ${MAX_RECONCILE_ATTEMPTS} attempts: ${lastError.slice(0, 500)}`);
}
