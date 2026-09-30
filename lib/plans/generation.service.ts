import { randomUUID } from 'crypto';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { foodsRepository, type FoodItem } from '@/lib/db/repositories/foods.repo';
import { plansRepository, planGenerationsRepository } from '@/lib/db/repositories/plans.repo';
import { reconcile } from '@/lib/nutrition/reconciler';
import { nearestCalorieAdminItem } from './matching';
import { dbItem, finalizeItem, applyReconciledGrams } from './day-items';
import { resolveTargets } from './targets';
import { fail, generationErrorCode, generationErrorExtra } from './errors';
import { generateFromList } from './from-list';
import { generateAiFree } from './ai-free';
import type { PlanGenerateInput } from './plans.schema';
import { MEAL_NAMES } from './plans.schema';
import type {
  BuiltDay,
  DayMeal,
  GenerateResult,
  PatientForPlan,
  ReconciledPayload,
  Targets,
  VerificationReport,
} from './types';

export { generationErrorCode, generationErrorExtra };

const MAX_ATTEMPTS = 3;

async function saveDraft(
  doctorId: string,
  patientId: string,
  weekNumber: number,
  mode: 'from_list' | 'ai_free',
  targets: Targets,
  meals: DayMeal[],
  payload: ReconciledPayload,
  verification: { valuesUnverified: boolean; ratio: number; report: VerificationReport | null }
): Promise<string> {
  const planId = randomUUID();
  await plansRepository.insertPlan({
    id: planId,
    patientId,
    doctorId,
    weekNumber,
    status: 'pending_doctor_approval',
    generationMode: mode,
    targetCalories: targets.calories,
    targetProteinG: targets.proteinG,
    targetCarbsG: targets.carbsG,
    targetFatsG: targets.fatsG,
    reconciledTotalCalories: Math.round(payload.reconciled_total_calories),
    reconciledProteinG: payload.reconciled_protein_g,
    reconciledCarbsG: payload.reconciled_carbs_g,
    reconciledFatsG: payload.reconciled_fats_g,
    deviationKcal: payload.deviation_kcal,
    valuesUnverified: verification.valuesUnverified,
    verifiedItemsRatio: verification.ratio,
    verificationReport: verification.report,
    reconciledAt: new Date(payload.reconciled_at),
  });
  // The generated day is the week template: replicated across 7 days so the
  // week plan is complete; the P15 editor varies individual days later.
  const withGrams = applyReconciledGrams(meals, payload.items);
  for (let day = 1; day <= 7; day++) {
    for (const meal of withGrams) {
      const mealId = randomUUID();
      await plansRepository.insertMeal({ id: mealId, planId, dayOfWeek: day, mealName: meal.mealName, culinaryPairingsValid: true });
      for (const item of meal.items) {
        const persisted = finalizeItem(item);
        await plansRepository.insertMealItem({
          id: randomUUID(),
          mealId,
          foodId: persisted.foodId,
          foodNameAr: persisted.nameAr,
          foodNameEn: persisted.nameEn,
          source: persisted.source,
          grams: persisted.grams,
          proteinG: persisted.proteinG,
          carbsG: persisted.carbsG,
          fatsG: persisted.fatsG,
          calories: persisted.calories,
        });
      }
    }
  }
  return planId;
}

async function verifiedRatio(planId: string, doctorId: string): Promise<{ verified: number; unverified: number; total: number; ratio: number }> {
  const full = await plansRepository.getFullPlan(planId, doctorId);
  const items = full?.meals.flatMap((m) => m.items) ?? [];
  const verified = items.filter((i) => i.source === 'db').length;
  const total = items.length;
  return { verified, unverified: total - verified, total, ratio: total === 0 ? 1 : Math.round((verified / total) * 100) / 100 };
}

export const generationService = {
  async generate(doctorId: string, input: PlanGenerateInput, isAdmin: boolean): Promise<GenerateResult> {
    const started = Date.now();
    const patient = (await patientRepository.findById(input.patient_id)) as PatientForPlan | null;
    if (!patient || patient.doctor_id !== doctorId) {
      throw fail('NOT_FOUND', 'Patient not found');
    }
    const targets = await resolveTargets(patient, input);
    const weekNumber = input.week_number ?? 1;
    const baseParams = {
      mode: input.mode,
      targets,
      preferences: input.preferences ?? {},
      includeOwnFoods: input.include_own_foods ?? false,
      weekNumber,
    };
    try {
      const built: BuiltDay = input.mode === 'from_list'
        ? await generateFromList(doctorId, isAdmin, patient, input, targets)
        : await generateAiFree(doctorId, isAdmin, patient, input, targets);
      const planId = await saveDraft(doctorId, patient.id, weekNumber, input.mode, targets, built.meals, built.payload, {
        valuesUnverified: built.valuesUnverified,
        ratio: built.ratio,
        report: built.report,
      });
      const wallTimeMs = Date.now() - started;
      // PF-03: 45s wall-time budget is structural (≤3 attempts × 30s adapter
      // timeout would exceed it only if every call hangs to the deadline;
      // log slow generations for ops review).
      if (wallTimeMs > 45_000) {
        const { logger } = await import('@/lib/observability/logger');
        logger.warn('plans.slow_generation', { doctorId, mode: input.mode, wallTimeMs, attempts: built.attempts });
      }
      await planGenerationsRepository.insert({
        doctorId, patientId: patient.id, planId, mode: input.mode,
        params: { ...baseParams, poolCounts: built.poolCounts, attempts: built.attempts, report: built.report },
        attempts: built.attempts, wallTimeMs, status: 'success',
      });
      return {
        planId,
        status: 'pending_doctor_approval',
        attempts: built.attempts,
        wallTimeMs,
        deviationKcal: built.payload.deviation_kcal,
        verifiedItemsRatio: built.ratio,
        valuesUnverified: built.valuesUnverified,
        publishWarning: built.publishWarning,
        report: built.report,
      };
    } catch (err) {
      const wallTimeMs = Date.now() - started;
      try {
        await planGenerationsRepository.insert({
          doctorId, patientId: patient.id, planId: null, mode: input.mode,
          params: baseParams, attempts: MAX_ATTEMPTS, wallTimeMs, status: 'failed',
          error: err instanceof Error ? err.message.slice(0, 2000) : 'Generation failed',
        });
      } catch {
        // Generation audit must not mask the original failure.
      }
      throw err;
    }
  },

  async list(doctorId: string, patientId: string | null, page: number, limit: number) {
    if (patientId) {
      const patient = await patientRepository.findById(patientId);
      if (!patient || patient.doctor_id !== doctorId) return null;
    }
    return plansRepository.listByDoctor(doctorId, patientId, page, limit);
  },

  async get(id: string, doctorId: string) {
    const full = await plansRepository.getFullPlan(id, doctorId);
    if (!full) return null;
    const generations = await planGenerationsRepository.findByPlan(id, doctorId);
    return { ...full, generations };
  },

  // NUT-16: one-click swap of every unverified item to the nearest-calorie
  // ADMIN item, then re-reconcile so the draft stays within ±5 kcal.
  // Positional propagation across the cloned week (P15-diverged days keep
  // leftovers, reported honestly in the returned counts).
  async convertToVerified(planId: string, doctorId: string) {
    const full = await plansRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    const adminItems = await foodsRepository.listCandidates(doctorId, false, 200);
    if (adminItems.length === 0) throw fail('NO_CANDIDATES', 'No admin foods available for conversion');
    const plan = full.plan as { target_calories: number; target_protein_g: number; target_carbs_g: number; target_fats_g: number; deviation_kcal: number };
    const dayNumbers = [...new Set(full.meals.map((m) => Number(m.meal.day_of_week)))].sort((a, b) => a - b);
    const templateDay = dayNumbers[0] ?? 1;
    const templateMeals = full.meals.filter((m) => Number(m.meal.day_of_week) === templateDay);
    let converted = 0;
    const swapped: DayMeal[] = templateMeals.map((m) => ({
      mealName: String(m.meal.meal_name) as (typeof MEAL_NAMES)[number],
      items: m.items.map((row) => {
        if (row.source === 'db' && row.food_id && adminItems.some((f) => f.id === row.food_id)) {
          const known = adminItems.find((f) => f.id === row.food_id) as FoodItem;
          return dbItem(known, Number(row.grams));
        }
        const grams = Number(row.grams) || 0;
        const kcalPer100 = grams > 0 ? (Number(row.calories) / grams) * 100 : 0;
        const replacement = nearestCalorieAdminItem(kcalPer100, adminItems);
        if (!replacement) return dbItem(adminItems[0], Math.max(1, grams));
        converted += 1;
        return dbItem(replacement, Math.max(1, grams));
      }),
    }));
    if (converted === 0) {
      const ratio = await verifiedRatio(planId, doctorId);
      return { converted: 0, planId, verifiedItemsRatio: ratio.ratio, valuesUnverified: ratio.unverified > 0, publishWarning: false, deviationKcal: Number(plan.deviation_kcal) };
    }
    const flat = swapped.flatMap((m) => m.items).map((i) => ({
      foodId: i.foodId ?? `model:${i.nameAr}`, name: i.nameAr, grams: i.grams,
      per100: { kcal: i.per100.kcal, protein: i.per100.protein, carbs: i.per100.carbs, fats: i.per100.fats },
    }));
    const result = reconcile(Number(plan.target_calories), {
      proteinG: Number(plan.target_protein_g), carbsG: Number(plan.target_carbs_g), fatsG: Number(plan.target_fats_g),
    }, flat);
    const finalMeals = result.status === 'accepted' ? applyReconciledGrams(swapped, result.items) : swapped;
    // Rewrite every day positionally from the converted template.
    for (const day of dayNumbers) {
      const dayMeals = full.meals.filter((m) => Number(m.meal.day_of_week) === day);
      for (let mi = 0; mi < dayMeals.length; mi++) {
        const srcMeal = finalMeals[mi];
        if (!srcMeal) continue;
        const rows = dayMeals[mi].items;
        for (let ki = 0; ki < rows.length; ki++) {
          const src = srcMeal.items[ki];
          if (!src) continue;
          const persisted = finalizeItem(src);
          await plansRepository.updateMealItemValues(rows[ki].id as string, {
            foodId: persisted.foodId, source: 'db', grams: persisted.grams,
            proteinG: persisted.proteinG, carbsG: persisted.carbsG, fatsG: persisted.fatsG, calories: persisted.calories,
          });
        }
      }
    }
    const totals = finalMeals.flatMap((m) => m.items).reduce(
      (s, i) => ({ proteinG: s.proteinG + (i.per100.protein * i.grams) / 100, carbsG: s.carbsG + (i.per100.carbs * i.grams) / 100, fatsG: s.fatsG + (i.per100.fats * i.grams) / 100 }),
      { proteinG: 0, carbsG: 0, fatsG: 0 }
    );
    if (result.status === 'accepted') {
      await plansRepository.updateReconciled(planId, doctorId, {
        reconciledTotalCalories: Math.round(result.reconciled_total_calories),
        reconciledProteinG: Math.round(totals.proteinG),
        reconciledCarbsG: Math.round(totals.carbsG),
        reconciledFatsG: Math.round(totals.fatsG),
        deviationKcal: result.deviation_kcal,
        reconciledAt: new Date(result.reconciled_at),
      });
    }
    const ratio = await verifiedRatio(planId, doctorId);
    const publishWarning = ratio.unverified / Math.max(1, ratio.total) > 0.3;
    await plansRepository.updateVerification(planId, doctorId, {
      valuesUnverified: ratio.unverified > 0,
      verifiedItemsRatio: ratio.ratio,
      verificationReport: {
        mode: 'ai_free', verified: ratio.verified, unverified: ratio.unverified, total: ratio.total,
        ratio: ratio.ratio, details: [], reliabilityCaveat: null, mineralNotice: null, publishWarning,
      },
    });
    return { converted, planId, verifiedItemsRatio: ratio.ratio, valuesUnverified: ratio.unverified > 0, publishWarning, deviationKcal: result.deviation_kcal };
  },
};
