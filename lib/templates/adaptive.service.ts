import { randomUUID } from 'crypto';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { plansRepository } from '@/lib/db/repositories/plans.repo';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';
import { calculateNutritionTargets } from '@/lib/nutrition/calc';
import { clampTargetCalories } from '@/lib/nutrition/rails';
import { stripAllergens, getAllergySynonyms } from '@/lib/nutrition/allergy-guard';
import { reconcile } from '@/lib/nutrition/reconciler';
import { enrichRows, finalizeItem, fail } from '@/lib/plans';
import { scaleGrams, rescaleFactor } from './rescale';
import type { AdaptiveSuggestInput } from './templates.schema';

function toBirthDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

// NP-09: adaptive suggestion from the last visit weight. Always creates a
// NEW draft pending approval — never auto-publishes (§8.1).
export const adaptiveService = {
  async suggest(doctorId: string, input: AdaptiveSuggestInput) {
    const patient = await patientRepository.findById(input.patient_id);
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Patient not found');
    const visits = await visitsRepository.listByPatient(patient.id, doctorId);
    const lastWeight = visits.find((v) => v.weight_kg != null)?.weight_kg ?? null;
    const weightUsed = lastWeight != null ? Number(lastWeight) : Number(patient.current_weight_kg ?? patient.initial_weight_kg);
    const calc = calculateNutritionTargets({
      gender: patient.gender, birthDate: toBirthDate(patient.birth_date), heightCm: patient.height_cm,
      weightKg: weightUsed, activityLevel: patient.activity_level, goal: patient.goal,
      chronicConditions: patient.chronic_conditions ?? undefined,
    });
    const clamped = clampTargetCalories(calc.targetCalories, patient.gender);
    const targets = { calories: clamped.target, proteinG: calc.targetProteinG, carbsG: calc.targetCarbsG, fatsG: calc.targetFatsG };
    let sourceId = input.source_plan_id ?? null;
    if (!sourceId) {
      const plans = await plansRepository.listByPatient(doctorId, patient.id);
      const active = plans.find((p) => String((p as { status: string }).status) === 'active')
        ?? plans.find((p) => String((p as { status: string }).status) !== 'archived');
      if (!active) throw fail('NO_ACTIVE_PLAN', 'No active plan to adapt — generate a plan first');
      sourceId = String((active as { id: string }).id);
    }
    const full = await plansRepository.getFullPlan(sourceId, doctorId);
    if (!full) throw fail('NOT_FOUND', 'Source plan not found');
    const source = await plansRepository.findOwnedById(sourceId, doctorId);
    const srcTargets = source as { target_calories: number } | null;
    const refCal = srcTargets ? Number((srcTargets as { target_calories: number }).target_calories) : targets.calories;
    const factor = rescaleFactor(refCal || targets.calories, targets.calories);
    const { days } = await enrichRows(full, null);
    const synonyms = await getAllergySynonyms();
    const removed: Array<{ meal: string; name: string; allergy: string }> = [];
    const planId = randomUUID();
    await plansRepository.insertPlan({
      id: planId, patientId: patient.id, doctorId, weekNumber: 1, status: 'pending_doctor_approval',
      generationMode: 'from_list', targetCalories: targets.calories, targetProteinG: targets.proteinG,
      targetCarbsG: targets.carbsG, targetFatsG: targets.fatsG, reconciledTotalCalories: null,
      reconciledProteinG: null, reconciledCarbsG: null, reconciledFatsG: null, deviationKcal: null,
      valuesUnverified: false, verifiedItemsRatio: 1, verificationReport: null, reconciledAt: null,
    });
    for (const day of days) {
      const scaled = day.items.map((i) => ({
        foodId: i.foodId, nameAr: i.nameAr, nameEn: i.nameEn, source: i.source,
        grams: scaleGrams(i.grams, factor),
        per100: { kcal: i.per100.kcal, protein: i.per100.protein, carbs: i.per100.carbs, fats: i.per100.fats },
      }));
      const { clean, removed: stripped } = stripAllergens(scaled.map((s) => ({ ...s, nameEn: s.nameEn ?? null })), patient.allergies ?? [], synonyms);
      for (const r of stripped) removed.push({ meal: day.mealName, name: r.item.nameAr, allergy: r.allergy });
      if (clean.length === 0) continue;
      const rec = reconcile(targets.calories, { proteinG: targets.proteinG, carbsG: targets.carbsG, fatsG: targets.fatsG }, clean.map((i) => ({ foodId: i.foodId, name: i.nameAr, grams: i.grams, per100: i.per100 })));
      const mealId = randomUUID();
      const mealName = (['Breakfast', 'Morning Snack', 'Lunch', 'Evening Snack', 'Dinner'] as const).includes(day.mealName as 'Breakfast')
        ? (day.mealName as 'Breakfast' | 'Morning Snack' | 'Lunch' | 'Evening Snack' | 'Dinner')
        : 'Breakfast';
      await plansRepository.insertMeal({ id: mealId, planId, dayOfWeek: day.day, mealName, culinaryPairingsValid: true });
      for (let k = 0; k < clean.length; k++) {
        const item = clean[k];
        const recItem = rec.items[k];
        const grams = recItem ? recItem.grams : item.grams;
        const persisted = finalizeItem({ foodId: item.foodId, nameAr: item.nameAr, nameEn: item.nameEn, source: item.source, grams, per100: { ...item.per100, potassiumMg: null, phosphorusMg: null, sodiumMg: null, addedSugarG: null }, category: null, tags: [] });
        await plansRepository.insertMealItem({ id: randomUUID(), mealId, foodId: persisted.foodId, foodNameAr: persisted.nameAr, foodNameEn: persisted.nameEn, source: persisted.source, grams: persisted.grams, proteinG: persisted.proteinG, carbsG: persisted.carbsG, fatsG: persisted.fatsG, calories: persisted.calories });
      }
    }
    return { planId, targets, weightUsedKg: weightUsed, sourcePlanId: sourceId, removed };
  },
};
