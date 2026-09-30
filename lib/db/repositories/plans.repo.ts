import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

// Plan persistence for P13+ (incident archiving now; generation in P14;
// editor/revisions in P15).
export interface NutritionPlanRow {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: string;
}

export interface NutritionPlanInsert {
  id: string;
  patientId: string;
  doctorId: string;
  weekNumber: number;
  status: 'draft' | 'pending_doctor_approval' | 'active' | 'archived';
  generationMode: 'from_list' | 'ai_free';
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatsG: number;
  reconciledTotalCalories: number | null;
  reconciledProteinG: number | null;
  reconciledCarbsG: number | null;
  reconciledFatsG: number | null;
  deviationKcal: number | null;
  valuesUnverified: boolean;
  verifiedItemsRatio: number | null;
  verificationReport?: unknown | null;
  reconciledAt?: Date | null;
}

export interface PlanMealInsert {
  id: string;
  planId: string;
  dayOfWeek: number;
  mealName: 'Breakfast' | 'Morning Snack' | 'Lunch' | 'Evening Snack' | 'Dinner';
  culinaryPairingsValid: boolean;
}

export interface PlanMealItemInsert {
  id: string;
  mealId: string;
  foodId: string | null;
  foodNameAr: string;
  foodNameEn: string | null;
  source: 'db' | 'model';
  grams: number;
  proteinG: number;
  carbsG: number;
  fatsG: number;
  calories: number;
}

export interface PlanMealRow {
  id: string;
  plan_id: string;
  day_of_week: number;
  meal_name: string;
  culinary_pairings_valid: number | boolean;
}

export interface PlanMealItemRow {
  id: string;
  meal_id: string;
  food_id: string | null;
  food_name_ar: string;
  food_name_en: string | null;
  source: 'db' | 'model';
  grams: number | string;
  protein_g: number | string;
  carbs_g: number | string;
  fats_g: number | string;
  calories: number | string;
}

export interface FullPlan {
  plan: Record<string, unknown>;
  meals: Array<{ meal: PlanMealRow; items: PlanMealItemRow[] }>;
}

export const plansRepository = {
  findById: async (id: string): Promise<NutritionPlanRow | null> => {
    const rows = await executeQuery<NutritionPlanRow[]>(
      'SELECT id, patient_id, doctor_id, status FROM NutritionPlan WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  findByIdPublic: async (id: string): Promise<{ id: string; doctor_id: string } | null> => {
    const rows = await executeQuery<{ id: string; doctor_id: string }[]>(
      'SELECT id, doctor_id FROM NutritionPlan WHERE id = ?',
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  updateShowCalories: async (id: string, doctorId: string, show: boolean): Promise<void> => {
    await executeQuery('UPDATE NutritionPlan SET show_calories_to_patient = ? WHERE id = ? AND doctor_id = ?', [show, id, doctorId]);
  },

  findOwnedById: async (id: string, doctorId: string): Promise<Record<string, unknown> | null> => {
    const rows = await executeQuery<Record<string, unknown>[]>(
      'SELECT * FROM NutritionPlan WHERE id = ? AND doctor_id = ?',
      [id, doctorId]
    );
    return rows.length > 0 ? rows[0] : null;
  },

  archive: async (id: string): Promise<boolean> => {
    await executeQuery("UPDATE NutritionPlan SET status = 'archived' WHERE id = ? AND status <> 'archived'", [id]);
    return true;
  },

  deleteMealsByPlan: async (planId: string): Promise<void> => {
    // Meal items cascade via FK (meal_id ON DELETE CASCADE).
    await executeQuery('DELETE FROM NutritionPlanMeal WHERE plan_id = ?', [planId]);
  },

  updatePlanTargets: async (
    id: string,
    doctorId: string,
    patch: { targetCalories: number; targetProteinG: number; targetCarbsG: number; targetFatsG: number }
  ): Promise<void> => {
    await executeQuery(
      'UPDATE NutritionPlan SET target_calories = ?, target_protein_g = ?, target_carbs_g = ?, target_fats_g = ? WHERE id = ? AND doctor_id = ?',
      [patch.targetCalories, patch.targetProteinG, patch.targetCarbsG, patch.targetFatsG, id, doctorId]
    );
  },

  updateStatus: async (
    id: string,
    doctorId: string,
    status: 'draft' | 'pending_doctor_approval' | 'active' | 'archived',
    approvedBy: string | null = null
  ): Promise<void> => {
    if (status === 'active') {
      await executeQuery(
        "UPDATE NutritionPlan SET status = 'active', approved_by = ?, approved_at = ? WHERE id = ? AND doctor_id = ?",
        [approvedBy, new Date(), id, doctorId]
      );
    } else if (status === 'draft') {
      await executeQuery(
        'UPDATE NutritionPlan SET status = ?, approved_by = NULL, approved_at = NULL WHERE id = ? AND doctor_id = ?',
        [status, id, doctorId]
      );
    } else {
      await executeQuery('UPDATE NutritionPlan SET status = ? WHERE id = ? AND doctor_id = ?', [status, id, doctorId]);
    }
  },

  listByPatient: async (doctorId: string, patientId: string): Promise<Record<string, unknown>[]> => {
    return executeQuery<Record<string, unknown>[]>(
      'SELECT * FROM NutritionPlan WHERE doctor_id = ? AND patient_id = ? ORDER BY week_number ASC, created_at ASC',
      [doctorId, patientId]
    );
  },

  insertPlan: async (data: NutritionPlanInsert): Promise<void> => {
    await executeQuery(
      `INSERT INTO NutritionPlan (id, patient_id, doctor_id, week_number, status, generation_mode,
        target_calories, target_protein_g, target_carbs_g, target_fats_g,
        reconciled_total_calories, reconciled_protein_g, reconciled_carbs_g, reconciled_fats_g,
        deviation_kcal, values_unverified, verified_items_ratio, verification_report, reconciled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id, data.patientId, data.doctorId, data.weekNumber, data.status, data.generationMode,
        data.targetCalories, data.targetProteinG, data.targetCarbsG, data.targetFatsG,
        data.reconciledTotalCalories, data.reconciledProteinG, data.reconciledCarbsG, data.reconciledFatsG,
        data.deviationKcal, data.valuesUnverified, data.verifiedItemsRatio,
        data.verificationReport ? JSON.stringify(data.verificationReport) : null,
        data.reconciledAt ?? null,
      ]
    );
  },

  insertMeal: async (data: PlanMealInsert): Promise<void> => {
    await executeQuery(
      'INSERT INTO NutritionPlanMeal (id, plan_id, day_of_week, meal_name, culinary_pairings_valid) VALUES (?, ?, ?, ?, ?)',
      [data.id, data.planId, data.dayOfWeek, data.mealName, data.culinaryPairingsValid]
    );
  },

  insertMealItem: async (data: PlanMealItemInsert): Promise<void> => {
    await executeQuery(
      `INSERT INTO NutritionPlanMealItem (id, meal_id, food_id, food_name_ar, food_name_en, source, grams, protein_g, carbs_g, fats_g, calories)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.mealId, data.foodId, data.foodNameAr, data.foodNameEn, data.source, data.grams, data.proteinG, data.carbsG, data.fatsG, data.calories]
    );
  },

  updateVerification: async (id: string, doctorId: string, patch: { valuesUnverified: boolean; verifiedItemsRatio: number; verificationReport: unknown }): Promise<void> => {
    await executeQuery(
      'UPDATE NutritionPlan SET values_unverified = ?, verified_items_ratio = ?, verification_report = ? WHERE id = ? AND doctor_id = ?',
      [patch.valuesUnverified, patch.verifiedItemsRatio, JSON.stringify(patch.verificationReport), id, doctorId]
    );
  },

  updateMealItemToVerified: async (itemId: string, foodId: string, grams: number, proteinG: number, carbsG: number, fatsG: number, calories: number): Promise<void> => {
    await executeQuery(
      `UPDATE NutritionPlanMealItem SET food_id = ?, source = 'db', grams = ?, protein_g = ?, carbs_g = ?, fats_g = ?, calories = ? WHERE id = ?`,
      [foodId, grams, proteinG, carbsG, fatsG, calories, itemId]
    );
  },

  updateMealItemValues: async (itemId: string, patch: { foodId?: string | null; source?: 'db' | 'model'; grams: number; proteinG: number; carbsG: number; fatsG: number; calories: number }): Promise<void> => {
    await executeQuery(
      `UPDATE NutritionPlanMealItem SET food_id = ?, source = ?, grams = ?, protein_g = ?, carbs_g = ?, fats_g = ?, calories = ? WHERE id = ?`,
      [patch.foodId ?? null, patch.source ?? 'db', patch.grams, patch.proteinG, patch.carbsG, patch.fatsG, patch.calories, itemId]
    );
  },

  updateReconciled: async (id: string, doctorId: string, patch: { reconciledTotalCalories: number; reconciledProteinG: number; reconciledCarbsG: number; reconciledFatsG: number; deviationKcal: number; reconciledAt: Date }): Promise<void> => {
    await executeQuery(
      `UPDATE NutritionPlan SET reconciled_total_calories = ?, reconciled_protein_g = ?, reconciled_carbs_g = ?, reconciled_fats_g = ?, deviation_kcal = ?, reconciled_at = ? WHERE id = ? AND doctor_id = ?`,
      [patch.reconciledTotalCalories, patch.reconciledProteinG, patch.reconciledCarbsG, patch.reconciledFatsG, patch.deviationKcal, patch.reconciledAt, id, doctorId]
    );
  },

  listByDoctor: async (doctorId: string, patientId: string | null, page: number, limit: number): Promise<{ plans: Record<string, unknown>[]; total: number }> => {
    const offset = (page - 1) * limit;
    const where = patientId ? 'doctor_id = ? AND patient_id = ?' : 'doctor_id = ?';
    const params: string[] = patientId ? [doctorId, patientId] : [doctorId];
    const [plans, totalRows] = await Promise.all([
      executeQuery<Record<string, unknown>[]>(
        // eslint-disable-next-line no-restricted-syntax -- WHERE fragment is fixed; values use ? placeholders (D-01)
        `SELECT * FROM NutritionPlan WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      ),
      executeQuery<{ count: number }[]>(
        // eslint-disable-next-line no-restricted-syntax -- WHERE fragment is fixed; values use ? placeholders (D-01)
        `SELECT COUNT(*) as count FROM NutritionPlan WHERE ${where}`,
        params
      ),
    ]);
    return { plans, total: totalRows[0].count };
  },

  getFullPlan: async (id: string, doctorId: string): Promise<FullPlan | null> => {
    const plan = await plansRepository.findOwnedById(id, doctorId);
    if (!plan) return null;
    const meals = await executeQuery<PlanMealRow[]>(
      'SELECT * FROM NutritionPlanMeal WHERE plan_id = ? ORDER BY day_of_week ASC, created_at ASC',
      [id]
    );
    // PF-02: single batched items query (was N+1 per meal).
    const mealIds = meals.map((m) => m.id);
    let allItems: PlanMealItemRow[] = [];
    if (mealIds.length > 0) {
      allItems = await executeQuery<PlanMealItemRow[]>(
        // eslint-disable-next-line no-restricted-syntax -- placeholders are bound per id; values use ? (D-01)
        `SELECT * FROM NutritionPlanMealItem WHERE meal_id IN (${mealIds.map(() => '?').join(',')}) ORDER BY created_at ASC`,
        mealIds
      );
    }
    const byMeal = new Map<string, PlanMealItemRow[]>();
    for (const item of allItems) {
      const list = byMeal.get(item.meal_id) ?? [];
      list.push(item);
      byMeal.set(item.meal_id, list);
    }
    return { plan, meals: meals.map((meal) => ({ meal, items: byMeal.get(meal.id) ?? [] })) };
  },
};

export interface PlanRevisionRow {
  id: string;
  plan_type: 'nutrition' | 'exercise';
  plan_id: string;
  revision_no: number;
  snapshot: string;
  changed_by: string;
  change_note: string | null;
  created_at: Date;
}

export interface RevisionInsert {
  planType: 'nutrition' | 'exercise';
  planId: string;
  revisionNo: number;
  snapshot: unknown;
  changedBy: string;
  changeNote?: string | null;
}

export const planRevisionsRepository = {
  nextRevisionNo: async (planId: string): Promise<number> => {
    const rows = await executeQuery<{ max_no: number | null }[]>(
      'SELECT MAX(revision_no) as max_no FROM PlanRevision WHERE plan_id = ?',
      [planId]
    );
    return Number(rows[0].max_no ?? 0) + 1;
  },

  insert: async (data: RevisionInsert): Promise<void> => {
    await executeQuery(
      'INSERT INTO PlanRevision (id, plan_type, plan_id, revision_no, snapshot, changed_by, change_note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [randomUUID(), data.planType, data.planId, data.revisionNo, JSON.stringify(data.snapshot), data.changedBy, data.changeNote ?? null]
    );
  },

  listByPlan: async (planId: string, planType: 'nutrition' | 'exercise' = 'nutrition'): Promise<PlanRevisionRow[]> => {
    return executeQuery<PlanRevisionRow[]>(
      'SELECT * FROM PlanRevision WHERE plan_id = ? AND plan_type = ? ORDER BY revision_no DESC',
      [planId, planType]
    );
  },

  getByNo: async (planId: string, revisionNo: number): Promise<PlanRevisionRow | null> => {
    const rows = await executeQuery<PlanRevisionRow[]>(
      'SELECT * FROM PlanRevision WHERE plan_id = ? AND revision_no = ?',
      [planId, revisionNo]
    );
    return rows.length > 0 ? rows[0] : null;
  },
};

export interface PlanGenerationInsert {
  id?: string;
  doctorId: string;
  patientId: string;
  planId: string | null;
  mode: 'from_list' | 'ai_free';
  params: unknown;
  attempts: number;
  wallTimeMs: number;
  status: 'success' | 'failed';
  error?: string | null;
}

export const planGenerationsRepository = {
  insert: async (data: PlanGenerationInsert): Promise<string> => {
    const id = data.id ?? randomUUID();
    await executeQuery(
      'INSERT INTO PlanGeneration (id, doctor_id, patient_id, plan_id, mode, params, attempts, wall_time_ms, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, data.doctorId, data.patientId, data.planId, data.mode, JSON.stringify(data.params), data.attempts, data.wallTimeMs, data.status, data.error ?? null]
    );
    return id;
  },

  findByPlan: async (planId: string, doctorId: string): Promise<Record<string, unknown>[]> => {
    return executeQuery<Record<string, unknown>[]>(
      'SELECT * FROM PlanGeneration WHERE plan_id = ? AND doctor_id = ? ORDER BY created_at DESC',
      [planId, doctorId]
    );
  },
};
