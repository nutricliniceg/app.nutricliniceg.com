import { randomUUID } from 'crypto';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import { plansRepository, planRevisionsRepository } from '@/lib/db/repositories/plans.repo';
import { runPlanChecks, type PlanCheckItem } from '@/lib/nutrition/pipeline';
import { clampTargetCalories } from '@/lib/nutrition/rails';
import { previewItemValues } from './day-items';
import { enrichRows, visibleFoodIdSet, dayTotalKcal } from './enrich';
import { fail } from './errors';
import { buildSnapshot, summarizeRevisions, parseSnapshot } from './revisions';
import type { PlanSaveInput } from './editor.schema';
import type { PatientForPlan } from './types';

export const editorService = {
  async getEditable(planId: string, doctorId: string) {
    const full = await plansRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    const plan = full.plan as { patient_id: string };
    const patient = (await patientRepository.findById(String(plan.patient_id))) as PatientForPlan | null;
    if (!patient || patient.doctor_id !== doctorId) return null;
    const { days } = await enrichRows(full, null);
    const per100: Record<string, { kcal: number; protein: number; carbs: number; fats: number }> = {};
    for (const day of days) {
      for (const item of day.items) {
        if (item.foodId && !per100[item.foodId]) {
          per100[item.foodId] = { kcal: item.per100.kcal, protein: item.per100.protein, carbs: item.per100.carbs, fats: item.per100.fats };
        }
      }
    }
    return {
      plan: full.plan,
      meals: full.meals,
      per100,
      patient: { id: patient.id, gender: patient.gender, allergies: patient.allergies ?? [], conditions: patient.chronic_conditions ?? [] },
    };
  },

  async save(planId: string, doctorId: string, input: PlanSaveInput, isAdmin: boolean) {
    const plan = await plansRepository.findOwnedById(planId, doctorId);
    if (!plan) return null;
    if (String((plan as { status: string }).status) === 'archived') {
      throw fail('ARCHIVED', 'Archived plans cannot be edited — restore or clone them first');
    }
    const patient = (await patientRepository.findById(String((plan as { patient_id: string }).patient_id))) as PatientForPlan | null;
    if (!patient || patient.doctor_id !== doctorId) return null;
    const visible = await visibleFoodIdSet(doctorId, isAdmin);
    const current = await plansRepository.getFullPlan(planId, doctorId);
    const currentById = new Map((current?.meals.flatMap((m) => m.items) ?? []).map((r) => [String(r.id), r]));

    // Validate scope: db foods must be visible; model items must match an
    // existing row (rates come from the DB row — client numbers untrusted).
    for (const meal of input.meals) {
      for (const item of meal.items) {
        if (item.food_id) {
          if (visible && !visible.has(item.food_id)) {
            throw fail('INVALID_FOOD', `Food not in your allowed scope: ${item.food_id}`);
          }
          const found = await foodsRepository.findById(item.food_id);
          if (!found || found.archived || (visible && !visible.has(found.id))) {
            throw fail('INVALID_FOOD', `Unknown or archived food: ${item.food_id}`);
          }
        } else if (!item.id || !currentById.has(item.id)) {
          throw fail('INVALID_FOOD', 'New items must come from the food search (model items cannot be created by hand)');
        }
      }
    }

    const requestedCalories = Math.round(input.target_calories ?? Number((plan as { target_calories: number }).target_calories));
    const clampedCalories = clampTargetCalories(requestedCalories, patient.gender);
    const targets = {
      calories: clampedCalories.target,
      proteinG: Math.round(input.target_protein_g ?? Number((plan as { target_protein_g: number }).target_protein_g)),
      carbsG: Math.round(input.target_carbs_g ?? Number((plan as { target_carbs_g: number }).target_carbs_g)),
      fatsG: Math.round(input.target_fats_g ?? Number((plan as { target_fats_g: number }).target_fats_g)),
    };
    const warnings: string[] = [];
    if (clampedCalories.clamped) {
      warnings.push(`Target raised to the safety floor of ${clampedCalories.floor} kcal (${patient.gender}) — DASH-09.`);
    }
    // Authoritative recompute + per-day guard pipeline (blocks fail the save).
    const dayGroups = new Map<number, typeof input.meals>();
    for (const meal of input.meals) {
      const list = dayGroups.get(meal.day) ?? [];
      list.push(meal);
      dayGroups.set(meal.day, list);
    }
    let maxDeviation = 0;
    for (const [, dayMeals] of dayGroups) {
      const checkMeals = [];
      for (const meal of dayMeals) {
        const items: PlanCheckItem[] = [];
        for (const item of meal.items) {
          if (item.food_id) {
            const food = await foodsRepository.findById(item.food_id);
            if (!food) throw fail('INVALID_FOOD', `Unknown food: ${item.food_id}`);
            items.push({
              foodId: food.id, nameAr: food.name_ar, nameEn: food.name_en, grams: item.grams,
              per100: {
                kcal: Number(food.calories_per_100g), protein: Number(food.protein_per_100g),
                carbs: Number(food.carbs_per_100g), fats: Number(food.fats_per_100g),
                potassiumMg: food.potassium_mg_per_100g, phosphorusMg: food.phosphorus_mg_per_100g,
                sodiumMg: food.sodium_mg_per_100g, addedSugarG: food.added_sugar_g_per_100g,
              },
              category: food.category, tags: food.tags ?? [], pairingTags: [],
            });
          } else {
            const row = currentById.get(item.id as string) as { grams: number | string; protein_g: number | string; carbs_g: number | string; fats_g: number | string; calories: number | string; food_name_ar: string; food_name_en: string | null } | undefined;
            if (!row) throw fail('INVALID_FOOD', 'Model item reference lost — reload and retry');
            const prevGrams = Number(row.grams) || 0;
            const f = prevGrams > 0 ? 100 / prevGrams : 0;
            items.push({
              foodId: null, nameAr: row.food_name_ar, nameEn: row.food_name_en, grams: item.grams,
              per100: {
                kcal: Number(row.calories) * f, protein: Number(row.protein_g) * f,
                carbs: Number(row.carbs_g) * f, fats: Number(row.fats_g) * f,
                potassiumMg: null, phosphorusMg: null, sodiumMg: null, addedSugarG: null,
              },
              category: null, tags: [], pairingTags: [],
            });
          }
        }
        checkMeals.push({ mealName: meal.meal_name, items });
      }
      const verdict = await runPlanChecks({
        gender: patient.gender,
        heightCm: patient.height_cm,
        allergies: patient.allergies ?? [],
        conditions: patient.chronic_conditions ?? [],
        targetCalories: targets.calories,
        macroTargets: { proteinG: targets.proteinG, carbsG: targets.carbsG, fatsG: targets.fatsG },
        meals: checkMeals,
      });
      if (verdict.verdict === 'blocked') {
        throw fail('PLAN_BLOCKED', `Save blocked at ${verdict.stage}: ${verdict.blocks.slice(0, 3).join(' | ').slice(0, 500)}`);
      }
      const total = dayTotalKcal(checkMeals.flatMap((m) => m.items));
      maxDeviation = Math.max(maxDeviation, Math.abs(total - targets.calories));
    }

    // Transactional replace (meals cascade to items via FK).
    await plansRepository.deleteMealsByPlan(planId);
    for (const meal of input.meals) {
      const mealId = randomUUID();
      await plansRepository.insertMeal({ id: mealId, planId, dayOfWeek: meal.day, mealName: meal.meal_name, culinaryPairingsValid: true });
      for (const item of meal.items) {
        if (item.food_id) {
          const food = await foodsRepository.findById(item.food_id);
          if (!food) throw fail('INVALID_FOOD', `Unknown food: ${item.food_id}`);
          const v = previewItemValues(
            { kcal: Number(food.calories_per_100g), protein: Number(food.protein_per_100g), carbs: Number(food.carbs_per_100g), fats: Number(food.fats_per_100g) },
            item.grams
          );
          await plansRepository.insertMealItem({
            id: randomUUID(), mealId, foodId: food.id,
            foodNameAr: food.name_ar, foodNameEn: food.name_en, source: 'db',
            grams: v.grams, proteinG: v.proteinG, carbsG: v.carbsG, fatsG: v.fatsG, calories: v.calories,
          });
        } else {
          const row = currentById.get(item.id as string) as { protein_g: number | string; carbs_g: number | string; fats_g: number | string; calories: number | string; grams: number | string; food_name_ar: string; food_name_en: string | null };
          const prevGrams = Number(row?.grams) || 0;
          const f = prevGrams > 0 ? 100 / prevGrams : 0;
          const v = previewItemValues(
            { kcal: Number(row?.calories) * f, protein: Number(row?.protein_g) * f, carbs: Number(row?.carbs_g) * f, fats: Number(row?.fats_g) * f },
            item.grams
          );
          await plansRepository.insertMealItem({
            id: randomUUID(), mealId, foodId: null,
            foodNameAr: String(row?.food_name_ar), foodNameEn: row?.food_name_en ?? null, source: 'model',
            grams: v.grams, proteinG: v.proteinG, carbsG: v.carbsG, fatsG: v.fatsG, calories: v.calories,
          });
        }
      }
    }
    await plansRepository.updatePlanTargets(planId, doctorId, {
      targetCalories: targets.calories, targetProteinG: targets.proteinG, targetCarbsG: targets.carbsG, targetFatsG: targets.fatsG,
    });
    const wasActive = String((plan as { status: string }).status) === 'active';
    if (wasActive) {
      await plansRepository.updateStatus(planId, doctorId, 'pending_doctor_approval');
    }
    const fresh = await plansRepository.getFullPlan(planId, doctorId);
    const revisionNo = await planRevisionsRepository.nextRevisionNo(planId);
    if (fresh) {
      await planRevisionsRepository.insert({
        planType: 'nutrition', planId, revisionNo,
        snapshot: buildSnapshot(fresh, targets, wasActive ? 'pending_doctor_approval' : String((plan as { status: string }).status)),
        changedBy: doctorId, changeNote: `Manual save${wasActive ? ' (re-approval required)' : ''}`,
      });
    }
    if (maxDeviation > 5) warnings.push(`Day deviation ${Math.round(maxDeviation)} kcal exceeds ±5 — reconcile before approval.`);
    if (wasActive) warnings.push('Plan was active — edits moved it back to pending approval.');
    return { planId, status: wasActive ? 'pending_doctor_approval' : String((plan as { status: string }).status), deviationKcal: Math.round(maxDeviation), revisionNo, warnings };
  },

  async approve(planId: string, doctorId: string) {
    const plan = await plansRepository.findOwnedById(planId, doctorId);
    if (!plan) return null;
    const status = String((plan as { status: string }).status);
    if (status === 'active') throw fail('INVALID_STATUS', 'Plan is already active');
    if (status === 'archived') throw fail('INVALID_STATUS', 'Archived plans cannot be approved');
    const patient = (await patientRepository.findById(String((plan as { patient_id: string }).patient_id))) as {
      id: string; doctor_id: string; gender: 'male' | 'female'; height_cm: number; allergies: string[] | null; chronic_conditions: string[] | null;
    } | null;
    if (!patient || patient.doctor_id !== doctorId) return null;
    const full = await plansRepository.getFullPlan(planId, doctorId);
    if (!full) return null;
    const { days, unknownFoods } = await enrichRows(full, null);
    if (unknownFoods.length > 0) {
      throw fail('UNRECONCILED', `Unknown foods referenced: ${unknownFoods.slice(0, 3).join(', ')} — fix items before approval`);
    }
    const targets = {
      calories: Number((plan as { target_calories: number }).target_calories),
      proteinG: Number((plan as { target_protein_g: number }).target_protein_g),
      carbsG: Number((plan as { target_carbs_g: number }).target_carbs_g),
      fatsG: Number((plan as { target_fats_g: number }).target_fats_g),
    };
    // DASH-09 absolute: never publish below the safety floor.
    const floorCheck = clampTargetCalories(targets.calories, patient.gender);
    if (floorCheck.clamped) {
      throw fail('RAILS_VIOLATION', `Target ${targets.calories} kcal is below the safety floor of ${floorCheck.floor} kcal (${patient.gender}) — raise the target before approval`);
    }
    // Re-verify every day server-side; reconciled state (≤5) is mandatory.
    const warnings: string[] = [];
    let maxDeviation = 0;
    const byDay = new Map<number, typeof days>();
    for (const day of days) {
      const list = byDay.get(day.day) ?? [];
      list.push(day);
      byDay.set(day.day, list);
    }
    for (const [, dayList] of byDay) {
      const verdict = await runPlanChecks({
        gender: patient.gender,
        heightCm: patient.height_cm,
        allergies: patient.allergies ?? [],
        conditions: patient.chronic_conditions ?? [],
        targetCalories: targets.calories,
        macroTargets: { proteinG: targets.proteinG, carbsG: targets.carbsG, fatsG: targets.fatsG },
        meals: dayList.map((d) => ({ mealName: d.mealName, items: d.items })),
      });
      if (verdict.verdict === 'blocked') {
        throw fail('PLAN_BLOCKED', `Approval blocked at ${verdict.stage}: ${verdict.blocks.slice(0, 3).join(' | ').slice(0, 500)}`);
      }
      maxDeviation = Math.max(maxDeviation, Math.abs(dayTotalKcal(dayList.flatMap((d) => d.items)) - targets.calories));
      warnings.push(...verdict.warnings.slice(0, 3));
    }
    if (maxDeviation > 5) {
      throw fail('UNRECONCILED', `Day deviation ${Math.round(maxDeviation)} kcal exceeds ±5 — reconcile before approval`);
    }
    const unverified = full.meals.flatMap((m) => m.items).filter((i) => i.source === 'model').length;
    const total = full.meals.flatMap((m) => m.items).length;
    if (total > 0 && unverified / total > 0.3) {
      warnings.push('Over 30% of items are unverified (NUT-15) — publish only after careful review.');
    }
    await plansRepository.updateStatus(planId, doctorId, 'active', doctorId);
    return { planId, status: 'active' as const, deviationKcal: Math.round(maxDeviation), warnings: warnings.slice(0, 5) };
  },

  async restoreRevision(planId: string, doctorId: string, revisionNo: number) {
    const plan = await plansRepository.findOwnedById(planId, doctorId);
    if (!plan) return null;
    const rev = await planRevisionsRepository.getByNo(planId, revisionNo);
    if (!rev) throw fail('NOT_FOUND', `Revision #${revisionNo} not found`);
    const snapshot = parseSnapshot(rev.snapshot);
    if (!snapshot) throw fail('CORRUPT_REVISION', `Revision #${revisionNo} snapshot is unreadable`);
    // Never destructive: back up current state as a new revision first.
    const current = await plansRepository.getFullPlan(planId, doctorId);
    const backupNo = await planRevisionsRepository.nextRevisionNo(planId);
    if (current) {
      const currentPlan = current.plan as { target_calories: number; target_protein_g: number; target_carbs_g: number; target_fats_g: number; status: string };
      await planRevisionsRepository.insert({
        planType: 'nutrition', planId, revisionNo: backupNo,
        snapshot: buildSnapshot(current, {
          calories: Number(currentPlan.target_calories), proteinG: Number(currentPlan.target_protein_g),
          carbsG: Number(currentPlan.target_carbs_g), fatsG: Number(currentPlan.target_fats_g),
        }, String(currentPlan.status)),
        changedBy: doctorId, changeNote: `Pre-restore backup before restoring #${revisionNo}`,
      });
    }
    await plansRepository.updatePlanTargets(planId, doctorId, {
      targetCalories: snapshot.targets.calories, targetProteinG: snapshot.targets.proteinG,
      targetCarbsG: snapshot.targets.carbsG, targetFatsG: snapshot.targets.fatsG,
    });
    await plansRepository.deleteMealsByPlan(planId);
    for (const meal of snapshot.meals) {
      const mealId = randomUUID();
      await plansRepository.insertMeal({ id: mealId, planId, dayOfWeek: meal.day, mealName: meal.mealName as 'Breakfast' | 'Morning Snack' | 'Lunch' | 'Evening Snack' | 'Dinner', culinaryPairingsValid: meal.pairingValid });
      for (const item of meal.items) {
        await plansRepository.insertMealItem({
          id: randomUUID(), mealId, foodId: item.foodId,
          foodNameAr: item.nameAr, foodNameEn: item.nameEn, source: item.source,
          grams: item.grams, proteinG: item.proteinG, carbsG: item.carbsG, fatsG: item.fatsG, calories: item.calories,
        });
      }
    }
    await plansRepository.updateStatus(planId, doctorId, 'draft');
    return { planId, restored: revisionNo, backupRevision: backupNo, status: 'draft' as const };
  },

  async listRevisions(planId: string, doctorId: string) {
    const plan = await plansRepository.findOwnedById(planId, doctorId);
    if (!plan) return null;
    const rows = await planRevisionsRepository.listByPlan(planId, 'nutrition');
    return { revisions: summarizeRevisions(rows) };
  },
};
