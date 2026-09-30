import { randomUUID } from 'crypto';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { plansRepository, planRevisionsRepository } from '@/lib/db/repositories/plans.repo';
import { visitsRepository } from '@/lib/db/repositories/visits.repo';
import { calculateNutritionTargets } from '@/lib/nutrition/calc';
import { reconcile } from '@/lib/nutrition/reconciler';
import { previewItemValues } from './day-items';
import { enrichRows } from './enrich';
import { buildSnapshot } from './revisions';
import { fail } from './errors';
import type { PatientForPlan } from './types';

// Week-level plan operations, split from bulk.service.ts (file-health gate):
// per-item bulk edits stay in bulkService; whole-week recompute/clone live
// here. Method bodies moved verbatim — no behavior change.
export const planWeeksService = {
  // NP-11: recalculate from the last visit weight, update targets, reconcile.
  async adaptiveRecompute(planId: string, doctorId: string) {
    const plan = await plansRepository.findOwnedById(planId, doctorId);
    if (!plan) return null;
    if (String((plan as { status: string }).status) === 'archived') {
      throw fail('ARCHIVED', 'Archived plans cannot be recomputed');
    }
    const patient = (await patientRepository.findById(String((plan as { patient_id: string }).patient_id))) as PatientForPlan | null;
    if (!patient || patient.doctor_id !== doctorId) return null;
    const visits = await visitsRepository.listByPatient(patient.id, doctorId);
    const sorted = [...visits].sort((a, b) => String(b.visit_date).localeCompare(String(a.visit_date)));
    const latest = sorted.find((v) => v.weight_kg !== null && Number(v.weight_kg) > 0);
    const weightKg = latest ? Number(latest.weight_kg) : Number(patient.current_weight_kg ?? patient.initial_weight_kg);
    const calc = calculateNutritionTargets({
      gender: patient.gender,
      birthDate: patient.birth_date instanceof Date ? patient.birth_date : new Date(patient.birth_date),
      heightCm: patient.height_cm,
      weightKg,
      activityLevel: patient.activity_level,
      goal: patient.goal,
      chronicConditions: patient.chronic_conditions ?? undefined,
    });
    const targets = {
      calories: calc.targetCalories,
      proteinG: Math.round(calc.targetProteinG),
      carbsG: Math.round(calc.targetCarbsG),
      fatsG: Math.round(calc.targetFatsG),
    };
    await plansRepository.updatePlanTargets(planId, doctorId, {
      targetCalories: targets.calories, targetProteinG: targets.proteinG,
      targetCarbsG: targets.carbsG, targetFatsG: targets.fatsG,
    });
    const full = await plansRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    const { days } = await enrichRows(full, null);
    const template = days.find((d) => d.day === 1) ?? days[0];
    if (!template) throw fail('EMPTY_PLAN', 'Plan has no meals to recompute');
    const rec = reconcile(targets.calories, { proteinG: targets.proteinG, carbsG: targets.carbsG, fatsG: targets.fatsG }, template.items.map((i, k) => ({
      foodId: i.foodId ?? `model:${k}`, name: i.nameAr, grams: i.grams,
      per100: { kcal: i.per100.kcal, protein: i.per100.protein, carbs: i.per100.carbs, fats: i.per100.fats },
    })));
    // Propagate reconciled grams across days by (mealName, foodKey).
    const gramsByKey = new Map<string, number>();
    if (rec.status === 'accepted') {
      template.items.forEach((item, k) => {
        const r = rec.items[k];
        if (r) gramsByKey.set(`${template.mealName}|${item.foodId ?? item.nameAr}`, r.grams);
      });
    }
    for (const day of days) {
      for (const item of day.items) {
        if (!item.rowId) continue;
        const key = `${day.mealName}|${item.foodId ?? item.nameAr}`;
        const grams = gramsByKey.get(key) ?? item.grams;
        const v = previewItemValues(
          { kcal: item.per100.kcal, protein: item.per100.protein, carbs: item.per100.carbs, fats: item.per100.fats },
          grams
        );
        await plansRepository.updateMealItemValues(item.rowId, {
          foodId: item.foodId, source: item.source, grams: v.grams,
          proteinG: v.proteinG, carbsG: v.carbsG, fatsG: v.fatsG, calories: v.calories,
        });
      }
    }
    await plansRepository.updateReconciled(planId, doctorId, {
      reconciledTotalCalories: Math.round(rec.reconciled_total_calories),
      reconciledProteinG: Math.round(rec.items.reduce((s, i) => s + i.protein_g, 0)),
      reconciledCarbsG: Math.round(rec.items.reduce((s, i) => s + i.carbs_g, 0)),
      reconciledFatsG: Math.round(rec.items.reduce((s, i) => s + i.fats_g, 0)),
      deviationKcal: rec.deviation_kcal,
      reconciledAt: new Date(rec.reconciled_at),
    });
    const after = await plansRepository.getFullPlan(planId, doctorId);
    if (after) {
      const revisionNo = await planRevisionsRepository.nextRevisionNo(planId);
      await planRevisionsRepository.insert({
        planType: 'nutrition', planId, revisionNo,
        snapshot: buildSnapshot(after, targets, 'adaptive'),
        changedBy: doctorId, changeNote: `Adaptive recompute from visit weight (${weightKg} kg)`,
      });
    }
    return { planId, weightUsedKg: weightKg, targets, deviationKcal: rec.deviation_kcal, reconciled: rec.status === 'accepted' };
  },

  // NP-08: clone a week into a fresh draft (new revision #1 lineage note).
  async cloneWeek(planId: string, doctorId: string, weekNumber?: number | null) {
    const plan = await plansRepository.findOwnedById(planId, doctorId);
    if (!plan) return null;
    const p = plan as { patient_id: string; week_number: number; generation_mode: 'from_list' | 'ai_free'; target_calories: number; target_protein_g: number; target_carbs_g: number; target_fats_g: number };
    const weeks = await plansRepository.listByPatient(doctorId, String(p.patient_id));
    const maxWeek = weeks.reduce((m, w) => Math.max(m, Number((w as { week_number: number }).week_number) || 0), 0);
    const nextWeek = weekNumber ?? maxWeek + 1;
    const full = await plansRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    const newId = randomUUID();
    await plansRepository.insertPlan({
      id: newId,
      patientId: String(p.patient_id),
      doctorId,
      weekNumber: nextWeek,
      status: 'draft',
      generationMode: p.generation_mode,
      targetCalories: Number(p.target_calories),
      targetProteinG: Number(p.target_protein_g),
      targetCarbsG: Number(p.target_carbs_g),
      targetFatsG: Number(p.target_fats_g),
      reconciledTotalCalories: null,
      reconciledProteinG: null,
      reconciledCarbsG: null,
      reconciledFatsG: null,
      deviationKcal: null,
      valuesUnverified: false,
      verifiedItemsRatio: null,
      verificationReport: null,
      reconciledAt: null,
    });
    for (const meal of full.meals) {
      const mealId = randomUUID();
      await plansRepository.insertMeal({
        id: mealId, planId: newId, dayOfWeek: Number(meal.meal.day_of_week),
        mealName: String(meal.meal.meal_name) as 'Breakfast' | 'Morning Snack' | 'Lunch' | 'Evening Snack' | 'Dinner',
        culinaryPairingsValid: Boolean(meal.meal.culinary_pairings_valid),
      });
      for (const item of meal.items) {
        await plansRepository.insertMealItem({
          id: randomUUID(), mealId, foodId: item.food_id,
          foodNameAr: item.food_name_ar, foodNameEn: item.food_name_en, source: item.source,
          grams: Number(item.grams), proteinG: Number(item.protein_g), carbsG: Number(item.carbs_g),
          fatsG: Number(item.fats_g), calories: Number(item.calories),
        });
      }
    }
    await planRevisionsRepository.insert({
      planType: 'nutrition', planId: newId, revisionNo: 1,
      snapshot: buildSnapshot(
        (await plansRepository.getFullPlan(newId, doctorId)) as Parameters<typeof buildSnapshot>[0],
        {
          calories: Number(p.target_calories), proteinG: Number(p.target_protein_g),
          carbsG: Number(p.target_carbs_g), fatsG: Number(p.target_fats_g),
        },
        'draft'
      ),
      changedBy: doctorId, changeNote: `Cloned from week ${Number(p.week_number)}`,
    });
    return { planId: newId, weekNumber: nextWeek };
  },
};
